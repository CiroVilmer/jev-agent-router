# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
