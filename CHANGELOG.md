# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/CiroVilmer/jev-agent-router/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/CiroVilmer/jev-agent-router/releases/tag/v0.1.0
