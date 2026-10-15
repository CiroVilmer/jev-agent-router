# Configuration reference

Options are set in `/config` → plugins → agent-router, or with `/plugin configure`. For a personal
setup you can also put them in `~/.claude/settings.json`:

```json
{
  "pluginConfigs": {
    "agent-router@jev-agent-router": {
      "options": { "clasificador": "jev", "jevUmbral": 0.7 }
    }
  }
}
```

The key is `agent-router@<marketplace>`. When you load the mod with `--plugin-dir`, it is
`agent-router@inline`.

## Classifier

| Option | Type | Default | Description |
|---|---|---|---|
| `clasificador` | `reglas` \| `haiku` \| `jev` | `reglas` | Who decides when rules aren't enough. With `jev` it also re-checks, and may change, the type of reviews. `jev` without a key falls back to `haiku` and shows a toast |
| `jevApiKey` | string (sensitive) | — | Jev key from [TypeSafe AI](https://typesafe.ai). If empty, the router reads the `JEV_API_KEY` environment variable |
| `jevUmbral` | number 0–1 | `0.7` | Jev's confidence threshold. For build size, below it the fallback decides. For reviews (with `jev`), below it the rule stays. It also applies to the review's size: below it, the review is `review-small`. With no rule at all, Jev decides anyway (`sin umbral`) |
| `topeMs` | number 50–8000 | `1000` | Classifier time budget. Past it, the fallback decides |
| `sombra` | `off` \| `haiku` \| `jev` | `off` | Shadow mode: runs another classifier in the background and stores both answers (the last 500) to compare in the panel. `sombra: jev` without a key is disabled, with a toast |

> [!TIP]
> On Windows, after setting `JEV_API_KEY` as a user environment variable, open a **new**
> terminal. A terminal opened earlier doesn't see it, and Jev answers HTTP 401.

## Model per task type

One option per type. Values: `por defecto` (the router's table) or any ladder step, from
`haiku·low` to `opus·xhigh`. The policy raises from your choice; if you pick an `explore` step
above its cap, the cap rises with it. `/router set` still overrides it for a session.

The Spanish names of the commands (`permitir`, `fijar`, `historial`, `banco`) still work as
aliases.

| Option | Type | Router default |
|---|---|---|
| `modeloReviewFinal` | `review-final` | opus·xhigh |
| `modeloReviewLarge` | `review-large` | opus·xhigh |
| `modeloReviewSmall` | `review-small` | opus·medium |
| `modeloReview` | both review sizes (legacy) | — |
| `modeloReReview` | `re-review` | opus·medium |
| `modeloBuildLarge` | `build-large` | opus·medium |
| `modeloBuildSmall` | `build-small` | sonnet·medium |
| `modeloFix` | `fix` | sonnet·high |
| `modeloExplore` | `explore` | haiku·medium |
| `modeloResearch` | `research` | sonnet·medium |
| `modeloWrite` | `write` | haiku·high |

Reviews come in two sizes, each with its own option: `modeloReviewLarge` (a block, a feature, a
phase, several tasks) and `modeloReviewSmall` (one task). `modeloReview` is the legacy option: if you
set it and leave a size on `por defecto`, it applies to that size. A size you choose on its own
always wins over it. How the size is decided is explained in
[how-it-works.md](how-it-works.md#review-size).

The reasons show `base de /config: <step>` when a type uses your choice.

## Usage policy (hot mode)

Hot mode is **off by default**. Turn it on or off with `/router hot on|off`: the choice is saved
in the plugin's store and applies to future sessions. These options tune it:

| Option | Default | Description |
|---|---|---|
| `fuegoMinutos` | `60` | 🔥 mode when the 5-hour window resets in this many minutes or fewer… |
| `fuegoUsado` | `70` | …and usage is at or below this percentage. Raises two steps |
| `sobraMinutos` | `120` | ⬆️ mode when the window resets in this many minutes or fewer… |
| `sobraUsado` | `80` | …and usage is at or below this percentage. Raises one step |

## What Claude sees

| Option | Default | Description |
|---|---|---|
| `ensenarConvencion` | `true` | When no rule recognizes a subagent's description, the Agent result tells Claude how it was classified and how to name it |
| `avisarAClaude` | `false` | When the router reassigns a subagent, the Agent result shows the chosen step and the reasons |

Both lines go in the result's `context`: Claude reads them, and they aren't shown in your
transcript.

## Session commands

| Command | Effect |
|---|---|
| `/router` | Panel with three tabs: **En curso** (live decisions and task cycles), **Métricas vs tu base** (metrics, shadow mode) and **Historial** (recent decisions with reasons) |
| `/router off` · `/router on` | Disable or enable the router for this session |
| `/router allow <models>` | Restrict models, e.g. `/router allow sonnet,opus`. Decisions move to the nearest allowed step |
| `/router set <type> <model>·<effort>` | Set a type for this session, e.g. `/router set review opus·max` or `/router set explore haiku·low`. `haiku` alone means `haiku·medium`. `review` sets both review sizes at once; `review-large` and `review-small` set each one on its own |
| `/router reset` | Clear this session's overrides |
| `/router hot on` · `/router hot off` · `/router hot` | Turn hot mode on or off (saved for future sessions), or show its state |
| `/router history [days]` | Write `~/.claude/router-historial.md` with the last N days (default 7): summary, and one table per session and task |
| `/router bench [--max N] [--solo haiku\|jev]` | Run the classifier bench from the repo root (see [benchmark.md](benchmark.md)) |

Per subagent: `[pin]` anywhere in the description keeps the model Claude asked for.

Overrides last for the session; they aren't saved.

## Recommended `CLAUDE.md` block

See the [README](../README.md#recommended-add-this-to-your-claudemd). It's optional. It helps
when other instructions, such as a project's `CLAUDE.md` or a start prompt saying "use Sonnet
subagents", compete with the router's convention.

## Interpreting reasons

| Reason | Meaning |
|---|---|
| `regla review` | A description rule decided the type |
| `regla subagentType Explore` | The subagent type decided it |
| `jev → build-large (0.93)` | Jev decided, with that confidence |
| `jev (sin umbral) → review (0.55)` | No rule matched: Jev decided despite low confidence |
| `jev dudó (0.55): queda la regla` | Jev was unsure about a review: the rule stays |
| `talla por alcance (…)` | The review is `review-large` because the description names a range of tasks (`Tasks 3-5`) or a scope word (`feature`, `fase`…) |
| `talla del build de Tarea 3 (build-large)` | The review inherits the size of the build of the same task |
| `jev → review-large (0.91)` | Jev decided the review's size. If its answer isn't a size, the reason ends with `: queda review-small` (a defense: Jev and Haiku reject labels that weren't asked for) |
| `respaldo (jev dudó (0.62)) → review-small` | Jev was unsure about a review's size: the fallback decided |
| `respaldo → review-small` | The classifier doubted, failed or isn't set: the review is small. When it doubted or failed, the reason carries the detail in parentheses: `respaldo (jev dudó (0.62)) → review-small` |
| `respaldo (jev dudó (0.62)) → build-small` | Jev was unsure about a build's size: the fallback decided |
| `respaldo (tardó más de 1000 ms) → …` | The classifier timed out |
| `base de /config: opus·high` | The type's base step comes from your `/config` choice |
| `política +1` · `techo de explore` | The policy raised the step; the type's cap stopped it |
| `fijado con /router: opus·max` · `permitidos: sonnet,opus` | Session overrides |
| `[pin]: respeta lo que pidió Claude` · `fork: hereda el modelo` · `router apagado` | Not touched |
