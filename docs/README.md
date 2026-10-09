# Documentation

## For users (English)

- [How the router decides](how-it-works.md): pipeline, rules, classifiers, base table, usage
  policy, metrics.
- [Configuration reference](configuration.md): every option and command, and how to read the
  reasons.
- [The bench](benchmark.md): where the numbers come from.

## Design history (Spanish)

The router was built in phases, each with a design spec, an implementation plan, and a live
verification. These documents are in Spanish and kept as they were written, with personal
paths and private project names replaced. They explain *why* each decision was made.

| Phase | Spec | Plan | Verification |
|---|---|---|---|
| 1 · Core (rules, policy, overrides, UI) | [design](superpowers/specs/2026-10-06-router-de-subagentes-design.md) | [plan](superpowers/plans/2026-10-06-router-fase-1.md) | [verification](verificaciones/2026-10-06-router-fase-1.md) |
| 2 · Classifiers and bench | same design | [plan](superpowers/plans/2026-10-06-router-fase-2.md) | [verification](verificaciones/2026-10-06-router-fase-2.md) |
| 3 · Metrics and baseline | same design | [plan](superpowers/plans/2026-10-07-router-fase-3.md) | — |
| 4 · Fast mode (closed, not implemented) | same design | — | [verification](verificaciones/2026-10-07-router-fase-4-fast.md) |
| 5 · Haiku 5.5 and naming convention | [design](superpowers/specs/2026-10-09-router-fase-5-design.md) | [plan](superpowers/plans/2026-10-09-router-fase-5.md) | [verification](verificaciones/2026-10-09-router-fase-5.md) |
| 6 · Jev at the center | [design](superpowers/specs/2026-10-09-router-fase-6-design.md) | [plan](superpowers/plans/2026-10-09-router-fase-6.md) | [verification](verificaciones/2026-10-09-router-fase-6.md) |

[`historia-agent-router.md`](historia-agent-router.md) tells how the project started and the
decisions made along the way.
