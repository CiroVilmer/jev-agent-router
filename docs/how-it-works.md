# How the router decides

This page explains, step by step, how the router picks a model and an effort level for every
subagent. For the options that change this behavior, see [configuration.md](configuration.md).

## The pipeline

Every time Claude launches a subagent, Claude Code fires the `agent.spawn` event. The router runs
`decidir(input) → { type, model, effort, reasons[] }`, a pure function in
[`router/src/decidir.ts`](../router/src/decidir.ts) that never touches Claude Code. It rewrites
the spawn's `model`. Later, on every `turn.step` of that subagent, it sets the chosen `effort`.

1. **Untouched subagents** end the pipeline:
   - `[pin]` in the description keeps whatever model Claude asked for.
   - With `/router off`, the router doesn't touch anything.
   - `fork` subagents inherit the parent's model by definition and are never touched.
2. **Rules** decide the task type (next section).
3. **A classifier** runs when the rules aren't enough:
   - every build, to pick its size;
   - no rule matched;
   - with `clasificador: jev`, to re-check (and maybe change) a review's type;
   - a `review` gets its size (`review-large` or `review-small`) from scope, the task's build or
     the classifier (see [Review size](#review-size)).
4. **The step:** if `/router set <type> <model>·<effort>` pinned this type, that step is used.
   Otherwise the type's base step is used (the router's table, or your `/config` choice), and,
   with hot mode on, the usage policy raises it by 0, 1 or 2, never past the type's cap.
5. **Allowed models:** if `/router allow` restricts the models, the decision moves to the
   nearest allowed step.

**It never blocks.** If anything fails (a hook error, a classifier timeout, a missing key), the
subagent starts with what Claude asked for. A classifier that fails or times out hands over to
the fallback heuristic, and `jev` without a key falls back to `haiku`.

## Rules

`subagent_type` decides first:

- `Explore` → `explore`;
- any type containing `revisor-final` → `review-final`.

Otherwise, patterns on the description, in this order (English and Spanish):

| Order | Pattern (simplified) | Type |
|---|---|---|
| 1 | `re-review`, `re-revisión` anywhere | `re-review` |
| 2 | starts with `fix`, `arregl…`, `correg…` | `fix` |
| 3 | `whole-branch`, or `final` next to review/revisión | `review-final` |
| 4 | `review`, `revis…` anywhere; or starts with `verif…`, `valid…`, `audit…`, `check` | `review` (then sized: `review-large` or `review-small`) |
| 5 | starts with `research`, `investig…` | `research` |
| 6 | starts with `explore`, `map`, `relevar` | `explore` |
| 7 | starts with `implement…`, `task`, `tarea`, `T<n>` | build (size still unknown) |
| 8 | starts with `write` (except "write … tests/script/code/migration/parser/function"), `redactar`, `documentar`, `escribir`; or `vault` anywhere | `write` |

The exact regular expressions are in [`router/src/reglas.ts`](../router/src/reglas.ts). On the
bench of 729 real subagents, the rules resolve 462 on their own with 96.5% accuracy.

## The classifier

There are three implementations behind one interface:

| `clasificador` | What decides | Latency |
|---|---|---|
| `reglas` (default) | No model: a size heuristic (the "fallback") | 0 ms |
| `haiku` | Haiku through `$.model.classify` | ~645 ms (p50, bench) |
| `jev` | [Jev](https://typesafe.ai) (TypeSafe AI, model `jev-1.13.0`), with a calibrated confidence | ~250–275 ms (p50, bench) |

**Input.** The subagent's description plus a numeric summary of its prompt, never the prompt
itself:

```
Implement Task 11: the compiler · prompt 6.8k chars · 9 archivos · 14 pasos · menciona spec
```

**When it runs, and what it decides:**

- **Build size** (a `build` rule matched): `build-large` or `build-small`. The size question
  explains the cut found on the bench: more than ~5k characters, or ~3k–5k characters that name
  10 or more files, is large.
- **No rule matched:** any of the 9 types. Here Jev decides even with low confidence, and the
  reason says so: `jev (sin umbral) → review (0.55)`.
- **Review family, only with `clasificador: jev` and a key:** if a description rule said
  `review-final`, `review` or `re-review`, Jev is asked with all 9 labels.
  - If Jev's confidence is at least `jevUmbral` (0.7), Jev decides, even if it changes the type.
    The one exception: if Jev says `explore` or `write`, the rule stays, so a review never drops
    to Haiku.
  - With lower confidence, the rule stays: `jev dudó (0.55): queda la regla`.
- Rules based on `subagent_type` never ask the classifier.

**Fallback.** If the classifier takes longer than `topeMs` (1 s), fails, or isn't configured:

- a build is `build-large` when `chars > 5000 || (chars > 3000 && files >= 10)`, otherwise
  `build-small`;
- a description with no rule is `build-small`.

**Shadow mode.** With `sombra: haiku` or `sombra: jev`, every time the main classifier runs, the
other one runs too, in the background (60 s limit, it doesn't affect the decision). Both answers
are stored (the last 500), and the panel compares them: agreement, p50 and p95, fallbacks.

## Review size

A `review` is not a single step: it is split in two sizes, `review-large` (opus·xhigh) and
`review-small` (opus·medium). The router decides the size in this order, and the first step that
applies wins:

1. **A range of tasks.** If the description names a range ("Review Tasks 3-5"), it is
   `review-large`. The reason is `talla por alcance (Tasks 3-5)`.
2. **The build of the same task.** If the session already ran a build of the same task, the review
   inherits its size: `build-large` gives `review-large`, `build-small` gives `review-small`. The
   reason is `talla del build de Tarea 3 (build-large)`. The build must come before the review.
3. **Scope words.** If the description doesn't name a numbered task, a scope word makes it
   `review-large`: `bloque`/`block`, `feature`, `fase`/`phase`, `integración`/`integration`,
   `rama`/`branch` or `merge`. With a numbered task ("Review Task 3 of the payments feature"),
   the words don't count. The reason is `talla por alcance (feature)`.
4. **The classifier.** If nothing above decides, the classifier answers a question with 2 labels
   (`review-large` or `review-small`). If it doubts, fails, times out or there is no classifier,
   the review is `review-small`. The reasons are `jev → review-large (0.91)` and
   `respaldo → review-small`.

Only `review` is sized. `review-final` and `re-review` keep their own steps.

On the bench (`bench/review-talla.mjs`, 225 labeled reviews), this order gets 96%, with Jev at
a 0.7 threshold and also with the fallback alone, because most reviews take the build's size (see [benchmark.md](benchmark.md#review-size)).

## Base table and the ladder

This is the router's default table. Each user can change the base step of any type in
`/config` ([configuration.md](configuration.md#model-per-task-type)). All steps live on one ladder:

```
haiku·low → haiku·medium → haiku·high → sonnet·low → sonnet·medium → sonnet·high → opus·medium → opus·high → opus·xhigh
```

| Type | Base step | Cap |
|---|---|---|
| `review-final`, `review-large` | opus·xhigh | — |
| `re-review`, `build-large`, `review-small` | opus·medium | — |
| `build-small`, `research` | sonnet·medium | — |
| `fix` | sonnet·high | — |
| `write` | haiku·high | — |
| `explore` | haiku·medium | haiku·high |

- The only cap is `explore`'s, and it exists for **speed**: exploring your own code doesn't gain
  anything from a slower model.
- Models are written as aliases (`opus`, `sonnet`, `haiku`), never as full ids. A full id makes
  an internal Claude Code consumer log a validation error, and the alias always resolves to the
  current model.
- The effort is applied on `turn.step` only while the step runs on the chosen model, so after a
  model fallback it doesn't force an effort meant for another model.

## Usage policy (hot mode)

The policy only runs with **hot mode** on: `/router hot on`, saved for future sessions. It
starts off; with it off, every type runs on its base step. When it's on, the router reads the 5-hour window from `session.measure`: **U** is the percentage used and
**T** the minutes until `resetsAt`.

| Mode | Condition | Steps |
|---|---|---|
| 🔥 use what would be lost | T ≤ 60 and U ≤ 70 | +2 |
| ⬆️ room to spare | T ≤ 120 and U ≤ 80 | +1 |
| ⚪ normal | otherwise, or no data | 0 |

It only goes up: there are no saving modes, and reaching a limit never changes a decision. The
decision is taken when the subagent starts and doesn't change while it runs. Without window data
(API key, or before the first response), the mode is ⚪.

## What Claude sees

- **The Agent tool's description** (`tool.describe` hook) gets a fixed paragraph:
  - the naming convention (verbs, `Task N`, examples);
  - that `model` is ignored without `[pin]`.

  It's constant because Claude Code caches it per session, and changing it would invalidate the
  prompt cache.
- **A short system-prompt section** says the router picks models, and asks Claude to spend that
  reasoning on decomposing the work: parallelize independent tasks, serialize the ones that
  conflict.
- **`ensenarConvencion`** (on by default): when no rule recognized a description, the Agent
  tool's result carries one line telling Claude how it was classified and how to name it next
  time. It goes in `context`: the model reads it, and it isn't shown in your transcript.
- **`avisarAClaude`** (off by default): when the router reassigned a subagent, a line with the
  chosen step and the reasons.

## Metrics and storage

`/router` → **Métricas vs tu base** compares three columns:

- **sesión:** this session;
- **7 días:** the history across sessions;
- **base:** your own baseline from before the router, generated from transcripts by
  `bench/linea-base.mjs`.

| Metric | Meaning |
|---|---|
| reviews en Opus | Share of review, review-final and re-review subagents that actually ran on Opus |
| rondas/tarea | Re-reviews per task, among tasks with at least one review |
| min/tarea | Median minutes per finished task, from its first spawn to its last subagent's end |
| 5 h sin usar al reset | Average unused share of closed 5-hour windows, compared with the previous week |

A task comes from `Task N`, `Tarea N` or `TN` in the description. Without one, it comes from a
`<prefix>: <name>` pattern, so `v2: parser` and `verif: parser` group as the task `parser`.

Data lives in the plugin's store (a JSON file in Claude Code's config folder):

| Key | Contents | Cap |
|---|---|---|
| `historial:<sessionId>` | One record per finished subagent: model, times, decision and reasons | 3000 records; sessions idle for 14 days are pruned |
| `ventanas` | Highest usage seen per 5-hour window | 300 windows |
| `sombra` | Shadow-mode samples | 500 |

## Code map

| Path | Role |
|---|---|
| `router/hooks/register.tsx` | The only file that knows Claude Code's events, state and store |
| `router/src/decidir.ts` | The decision pipeline (pure) |
| `router/src/reglas.ts`, `taxonomia.ts`, `politica.ts`, `overrides.ts` | Rules, ladder and base table, usage policy, `/router` commands |
| `router/src/clasificadores/` | Fallback, Haiku, Jev, time limit, shadow mode, question texts |
| `router/src/convencion.ts` | Text added to the Agent tool, and the hint line |
| `router/src/historial.ts`, `registro.ts`, `ventanas.ts`, `lineaBase.ts` | History, tasks and metrics, 5-hour windows, baseline |
| `router/src/ui/` | Status line and panel |

The code identifiers and the UI are in Spanish. The design history behind each decision is in
[docs/](README.md).
