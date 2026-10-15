# The bench

The router's thresholds and defaults come from an offline bench, not guesses. It holds
**729 real subagents** from about a month of Claude Code work across several projects. They are
anonymized: project names, product names and personal paths were replaced. Each one has a
reference label, and the router's rules and classifiers are measured against those labels.

The step-by-step guide, with every option of every script, is in Spanish in
[`bench/README.md`](../bench/README.md). This page is the English overview.

## What's in `bench/`

| File | Contents |
|---|---|
| `casos.json` | One case per subagent: description, `subagent_type`, the model Claude asked for, an anonymized project name, and the **prompt summary** (length, files named, steps, mentions a spec). Never the prompt |
| `etiquetas.json` | The reference type of each case: `{ tipo, seguro, nota? }`. 96 cases are marked `seguro: false` (uncertain) |
| `para-revisar.md` | The uncertain cases, for human review |
| `extraer.mjs` | Builds `casos.json` from your own `~/.claude/projects` transcripts |
| `comparar.mjs` | Compares a bench run against the labels and the fallback |
| `jev-todos.mjs` | Runs Jev on every case with all 9 labels, or `--talla` for the 2 size labels (needs `JEV_API_KEY`) |
| `etiquetas-review.json` | The reference size of each review: `{ talla, fuente, seguro, nota? }`. 225 reviews; 33 labeled by hand are marked `seguro: false` |
| `review-talla.mjs` | Measures the review size policy (range of tasks, build of the same task, scope words, classifier) against those labels. Jev runs only with `JEV_API_KEY` |
| `analizar-jev-todos.mjs` | Simulates routing policies on a `jev-todos` run |
| `primera-linea.mjs` | Measures rules applied to a prompt's first line (re-reads transcripts, prints counts only) |
| `linea-base.mjs` | Generates the pre-router baseline (`router/src/lineaBase.ts`) from transcripts |
| `corridas/` | Saved runs and their analyses |

To build a bench from your own history, run `node bench/extraer.mjs`. The script reads your
transcripts locally and keeps the descriptions, numeric summaries and **project folder names**
(never the prompts). It **overwrites `bench/casos.json`**. Anonymize the result before sharing it
(see [CONTRIBUTING.md](../CONTRIBUTING.md#changing-routing-behavior)).

## Key results

**Rules.** They resolve 462 of 729 cases on their own, with 96.5% accuracy.

**Classifiers** (2026-10-07 run, on the 264 cases that reached a classifier with that day's rules):

| | Accuracy | p50 latency |
|---|---|---|
| Fallback (no model) | 60% | — |
| Haiku 4.5 | 66% | 645 ms |
| Jev | 67% | 275 ms |
| Jev, 0.7 threshold on everything | 76% | 275 ms |
| Jev, 0.7 threshold on build size only (current) | 78% | 275 ms |

Jev is **calibrated**: on the 2026-10-09 run over all 729 cases, with confidence ≥ 0.9 it's right
95% of the time, and below 0.5, about 40%. That's why a confidence threshold plus a fallback beats the classifier alone.

**Jev on all 729 cases** (2026-10-09, 9 labels):

| Type | Jev accuracy |
|---|---|
| review / re-review / review-final | 98.7% / 100% / 100% |
| build-small | 95.7% |
| build-large | 55% with 9 labels; with the current 2-label size question, 92 of 97 |
| fix / explore / research / write | 61% / 73% / 39% / 24% |

That's why the router lets Jev decide reviews and build size, and keeps rules for the rest.

**Build size.** The new fallback (`chars > 5000 || (chars > 3000 && files >= 10)`) gets 96.4% on
197 builds, against 71.6% for the previous one (`chars > 5000 || files > 6`).

**Full routing policy** (729 cases):

| Policy | Total | Reviews | Builds |
|---|---|---|---|
| Phase 5 (as it ran) | 88.5% | 98.9% | 88.9% |
| Current (phase 6) | 90.5% | 99.2% | 95.4% |

## Review size

`bench/review-talla.mjs` measures `review-large` against `review-small` on 225 reviews (105 large, 120
small). The size follows the order range of tasks, build of the same task, scope words (only without a
numbered task), classifier (see [how-it-works.md](how-it-works.md#review-size)).

| Policy | Accuracy |
|---|---|
| Fallback alone (always `review-small`) | 53.3% |
| Jev with 2 labels, 0.7 threshold, on all reviews | 64.0% |
| Full policy with Jev, 0.7 threshold (current) | 96.0% |
| Full policy with the `reglas` fallback, no Jev | 96.0% |
| Full policy with Jev, no threshold | 94.7% |

Most of the policy's accuracy comes from the build of the same task, not from Jev: 192 of the 225
reviews have an earlier build of the same task and inherit its size, scope decides 2 more, and the
classifier decides the other 31. On those 31, Jev at 0.7 gets 22 right (71.0%); the fallback alone
ends at the same 96.0% overall.

## Caveats

- **The labels were made by an Opus subagent.** 96 are still marked uncertain.
- **Build-size labels lean on prompt length.** The size cut was derived from these same labels,
  so part of the gain may be fitting the bench.
- **Most of the current policy's gain comes from the fallback.** Phase 5 with the new fallback,
  without Jev on build size or reviews, scores 90.4%: Jev's added value today is deciding, more than accuracy.
- **33 review size labels are still unvalidated.** The implementer labeled them by hand and they
  are marked `seguro: false` until the user checks them. The other 192 take the size from the
  build of the same task, so the build step is right on them by construction: it measures
  coverage, not accuracy.
- **Haiku numbers predate Haiku 5.5.** The `haiku` alias now resolves to Haiku 5.5, which thinks
  by default; re-run `/router bench --solo haiku` before relying on them.
