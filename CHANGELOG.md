# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-10-16

### Added

- Review sizes: a review is now `review-large` (Opus at xhigh effort) or `review-small` (Opus at
  medium effort). The size comes from a range of tasks ("Tasks 3-5"), then the build of the same
  task in the session, then scope words (block, feature, phase, integration, branch, merge) when no
  numbered task is named, then a 2-label classifier that falls back to `review-small`.
- `/config` options `modeloReviewLarge` and `modeloReviewSmall`. `modeloReview` stays as a legacy
  option that applies to both sizes if they aren't chosen separately.
- `/router set review <model>·<effort>` sets both sizes; `review-large` and `review-small` set
  each one on its own.
- New reasons in the history: `talla por alcance (…)`, `talla del build de Tarea 3 (build-large)`,
  `jev → review-large (0.91)` and `respaldo → review-small`.
- Review size bench (`bench/review-talla.mjs`): the policy gets 96% on 225 reviews, with Jev and also with
  the fallback alone (most reviews take the size of the build of the same task). 192 of the 225
  are right by construction (the label comes from the same build); on the 33 hand-made labels,
  still unvalidated, the policy gets 24 right (72.7%).
- Experimental local classifier: `clasificador: local` and `sombra: local` ask a model you run
  yourself, over System One or OpenAI chat completions (llama.cpp `llama-server`, Ollama). New
  `/config` options `localProtocolo`, `localUrl`, `localModelo`, `localApiKey` (or `LOCAL_API_KEY`)
  and `localUmbral` (0.7, not calibrated). It decides reviews by description like Jev, and the
  history reasons read `local → …`, `local dudó (…)` and `local (sin umbral) → …`.
- `/router bench --suite tipos|talla|review|todas`, with `--solo local`, `--concurrencia N` and
  `--tokens N` (Haiku token sample): one run file per selector and suite.
- `bench/selectores.mjs` runs Jev or a local server on the suites, and `bench/informe.mjs`
  compares every selector: accuracy, latency, calibration, full policy simulation and price (from
  `bench/precios.json`). `bench/lib/servidor-falso.mjs` is a fake server for testing, and
  `bench/lib/politica.mjs` holds the policy simulations the scripts share.

### Changed

- Reviews of a task drop from opus·xhigh to opus·medium (`review-small`), unless their build is
  large or the scope is broad.
- `modeloReview` becomes legacy, and `/router set review` sets both sizes.
- With `clasificador: haiku` or with a shadow classifier, reviews also ask the classifier (or the
  shadow) for their size.
- `/router bench` runs one call at a time by default (it was 3), so latencies are closer to
  production. Use `--concurrencia N` to change it.
- README: a Models section with the cloud (Jev, Haiku) and self-hosted (`local`) classifiers, and a
  chart of the selector benchmark (accuracy and latency of rules, Haiku 5.5 and Jev). The
  benchmark results are in `docs/benchmark.md`.

### Removed

- `bench/jev-todos.mjs`: `bench/selectores.mjs --selector jev` replaces it. The old runs stay in
  `bench/corridas/` and `bench/analizar-jev-todos.mjs` still reads them.

## [0.2.0] - 2026-10-14

### Added

- `/router hot on|off`: hot mode (the usage policy that raises models near the 5-hour reset) can
  be turned on and off, and the choice is saved for future sessions. `/router hot` shows its state.
- Per-type model options in `/config` (`modeloReview`, `modeloFix`, …): each user picks the base
  model·effort of every task type.

### Changed

- Commands are in English: `/router allow`, `/router set`, `/router history` and `/router bench`.
  The Spanish names (`permitir`, `fijar`, `historial`, `banco`) still work as aliases.
- Hot mode is **off by default**. Before, the policy was always on.
- The line below the prompt now shows the router's latest decision (subagent, model·effort, who
  decided, and `+1`/`+2` when the usage policy raised it), instead of the policy mode and a
  count of reassigned subagents.
- README: intro focused on subagent-driven development and on balancing quality and speed, a
  Features section, the real-world case as a table, and the everyday commands first.

## [0.1.0] - 2026-10-09

First public release of the `router` mod.

### Added

- Per-subagent model and effort selection from the task type: nine types (review-final, review,
  re-review, build-large, build-small, fix, explore, research, write) on a nine-step ladder from
  `haiku·low` to `opus·xhigh`.
- Description and `subagent_type` rules in English and Spanish.
- Classifiers for the cases rules can't decide: a size fallback, Haiku, and Jev (TypeSafe AI)
  with a calibrated confidence threshold. With Jev, it also re-checks the type of reviews. Shadow
  mode compares two classifiers on live traffic.
- Usage policy that only raises models when the 5-hour window resets soon with usage to spare
  (⬆️ +1, 🔥 +2).
- Session overrides: `[pin]`, `/router off|on`, `/router permitir`, `/router fijar`,
  `/router reset`.
- Naming convention taught to Claude through the Agent tool's description, plus an optional
  hint line (`ensenarConvencion`) and reassignment notice (`avisarAClaude`).
- `/router` panel with live decisions, metrics against a pre-router baseline, and decision
  history; `/router historial` exports it to Markdown.
- Offline bench of 729 anonymized real subagents, with scripts to extract, label, compare and
  simulate policies.

[Unreleased]: https://github.com/CiroVilmer/jev-agent-router/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/CiroVilmer/jev-agent-router/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/CiroVilmer/jev-agent-router/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/CiroVilmer/jev-agent-router/releases/tag/v0.1.0
