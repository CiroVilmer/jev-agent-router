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
| `etiquetas-review.json` | The reference size of each review: `{ talla, fuente, seguro, nota? }`. 225 reviews; 33 labeled by hand are marked `seguro: false` |
| `review-talla.mjs` | Measures the review size policy (range of tasks, build of the same task, scope words, classifier) against those labels. Jev runs only with `JEV_API_KEY` |
| `analizar-jev-todos.mjs` | Simulates routing policies on the old `jev-todos` runs kept in `corridas/` |
| `selectores.mjs` | Runs Jev or a local server on the three suites and saves one run file per suite |
| `informe.mjs` | Compares every selector across the suites: accuracy, latency, calibration, full policy, price |
| `precios.json` | Prices and sources used by the report |
| `lib/politica.mjs` | The routing policy simulations, shared by `analizar-jev-todos.mjs`, `review-talla.mjs` and `informe.mjs` |
| `lib/servidor-falso.mjs` | A fake System One and OpenAI server, to try the local classifier and the scripts without a model |
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

## Comparing selectors

A **selector** is whatever decides a type or a size when the rules don't: the rules alone (no
model), Haiku, Jev, or a local model. The same three suites measure all of them, so the numbers
are comparable. A suite is a list of cases plus the labels offered to the selector:

| Suite | Cases | Labels offered | Reference |
|---|---|---|---|
| `tipos` | all 729 | the 9 types | `etiquetas.json` |
| `talla` | the builds (cases whose rule is `build`) | `build-large`, `build-small` | `etiquetas.json` |
| `review` | the 225 labeled reviews | `review-large`, `review-small` | `etiquetas-review.json` |

Every request is built the way production builds it: only the description and the prompt summary,
never the prompt, and no confidence threshold (the run stores the confidence; the report applies
the threshold afterwards).

**Running each selector.**

- **Jev and local** run from Node, with no Claude Code session:

  ```
  JEV_API_KEY=… node bench/selectores.mjs --selector jev --suite todas
  node bench/selectores.mjs --selector local --suite todas --protocolo systemone \
    --url http://127.0.0.1:9931/v1/systemone --modelo <name> --hardware "<your machine>"
  ```

  Local needs `--url` and `--modelo`, and takes `--protocolo` (`systemone` by default, or
  `openai`). `--hardware` is free text stored in the run, so the report can say where the latency was measured. An optional
  key goes in `LOCAL_API_KEY`. Keys are never printed or stored. The default concurrency is 1.
- **Haiku** runs inside Claude Code, through the same path the router uses:
  `/router bench --suite todas --solo haiku`. `--tokens N` (default 20) samples the token usage
  of N Haiku calls per suite, to price them. Without `--suite`, `/router bench` keeps its old
  behavior and file format; `--solo local` and `--tokens` need `--suite`. Its default concurrency
  is 1, so latencies are not inflated by parallel calls.
- **Rules** need no run: the report computes them.

**Run files.** Each run is `bench/corridas/<YYYY-MM-DD>-<HHMM>-sel-<selector>-<suite>.json`. It
stores the date, selector, suite, model, protocol, the URL (without credentials or query string),
the hardware, the concurrency, the token sample (Haiku only) and, per case, `id`, `tipo`,
`confianza`, `ms` and `error`. `bench/selectores.mjs` and `bench/informe.mjs` never overwrite an earlier file: a name already
taken gets `-2`, `-3`…. Two `/router bench --suite` runs of the same selector and suite in the
same minute do overwrite each other.

**The report.** `node bench/informe.mjs [--tope 1000] [--umbral-local 0.7] [runs…]` reads the
`-sel-` runs (the newest per selector, model, protocol and suite, unless you list files), prints
the report and saves it as `<YYYY-MM-DD>-<HHMM>-informe-selectores.md`, again without
overwriting. It has:

- **One table per suite**, with a row per selector (`reglas` is the baseline) and the columns
  `n`, `acierta` (accuracy), `seguros` (only labels not marked uncertain), `con umbral` (the
  threshold applied: below it the fallback decides), `con tope` (a call that errored or took
  longer than `--tope` counts as the fallback), `p50` / `p95` / `máx` latency, `> tope` (calls
  over the budget), `errores` and `USD / 1.000` requests.
- **Calibration**: accuracy by confidence bucket for the selectors that report a confidence. It
  is how you pick `localUmbral`.
- **Full policy simulation**: the 729 cases routed with the current policy and each selector, and
  the 225 review sizes, with and without the time budget.
- **Prices and warnings**: where the prices come from, the uncertain labels, and for a local
  model, the hardware and that its threshold is uncalibrated.

**Prices** come from `bench/precios.json`. Haiku 5.5: $0.10 per million input tokens and $0.50 per
million output tokens (Anthropic's list price, cached on 2026-10-06; thinking is billed as output),
applied to the token sample. Jev: $42 per billion input tokens (typesafe.ai, checked on
2026-10-15), applied to an estimate of the request's tokens (characters / 4); it publishes no
output price, so the report says so. Local and rules are $0 marginal. With a Claude Max plan you
don't pay per call: a Haiku call uses quota from the 5-hour window instead.

### Results (2026-10-16)

Haiku 5.5 inside Claude Code and Jev (`jev-1.13.0`) from Node, one call at a time, 1,162 calls
each with no errors. Full report: `bench/corridas/2026-10-16-0951-informe-selectores.md`. The rules
row is the fallback alone. "With budget" counts a call slower than `topeMs` (1 s) as the fallback,
which is what happens in production.

**Each selector on its own:**

| Suite | Selector | Accuracy | With budget | p50 | p95 | Over 1 s | USD / 1,000 calls |
|---|---|---|---|---|---|---|---|
| 9 types (729) | rules | 16.0% | 16.0% | 0 ms | 0 ms | — | $0 |
| | Haiku 5.5 | 87.8% | 72.8% | 825 ms | 2,157 ms | 32.6% | ≈ $0.24 |
| | Jev | 83.8% | 83.8% | 245 ms | 307 ms | 0% | ≈ $0.017 + output |
| Build size (197) | rules | 96.4% | 96.4% | 0 ms | 0 ms | — | $0 |
| | Haiku 5.5 | 95.9% | 96.4% | 850 ms | 1,381 ms | 26.9% | ≈ $0.10 |
| | Jev | 95.4% | 96.4% | 241 ms | 304 ms | 0% | ≈ $0.016 + output |
| Review size (225) | rules | 53.3% | 53.3% | 0 ms | 0 ms | — | $0 |
| | Haiku 5.5 | 54.7% | 54.7% | 785 ms | 1,463 ms | 12.4% | ≈ $0.12 |
| | Jev | 60.0% | 63.1% | 244 ms | 290 ms | 0% | ≈ $0.009 + output |

**Full routing policy** (rules first, the selector where the rules stop):

| Selector as `clasificador` | 729 types | Safe labels | 729 types, with budget | Review size (225), with budget |
|---|---|---|---|---|
| rules | 90.0% | 92.9% | 90.0% | 96.0% |
| Haiku 5.5 | 91.5% | 95.1% | 90.8% | 95.6% |
| Jev | 90.8% | 94.3% | 90.8% | 96.0% |

What this says:

- **The rules and the fallback carry the policy.** Every selector ends within 1.5 points of the
  rules alone, so a classifier adds little accuracy on this bench.
- **Haiku 5.5 is the most accurate on its own but too slow for the 1 s budget.** It thinks by
  default (about 320 output tokens per 9-label call), a third of its 9-label calls take over a
  second, and with the budget it falls to Jev's level.
- **Jev is the fastest model** (p50 about 245 ms, never over the budget) and the only calibrated
  one: at confidence 0.9 or more it is right 95% of the time on the 9 labels.
- **Prices are tiny either way**: well under a cent per thousand calls for Jev, about a quarter of a
  cent for Haiku at list price (on Claude Max, Haiku costs quota instead).
- **No local model was measured yet**: this machine has no GPU. Run `bench/selectores.mjs` with
  `--selector local` on a machine that can serve a decision model and add the row.

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
- **The 2026-10-07 classifier table above predates Haiku 5.5.** The selector results (2026-10-16)
  measure Haiku 5.5, which thinks by default.
