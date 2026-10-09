# Contributing

Thanks for your interest! Bug reports, ideas, bench data and pull requests are all welcome.
Issues and PRs can be written in English or Spanish.

## Before you start

- For anything bigger than a small fix, **open an issue first** so we can agree on the approach.
- Read [docs/how-it-works.md](docs/how-it-works.md): it explains the pipeline and where each
  piece lives.
- The code identifiers, UI strings and design history are in **Spanish**. New code should follow
  the surrounding style (Spanish names, same comment density); documentation for users is in
  English.

## Development setup

You need **Claude Code 2.1.293 or later**, and **Node 24** to run the bench scripts.

```bash
git clone https://github.com/CiroVilmer/jev-agent-router.git
cd jev-agent-router
claude --plugin-dir ./router        # load the mod in a session; it hot-reloads on save
```

When Claude Code loads the plugin, it generates the mod API types in
`router/.claude-plugin/types/` (git-ignored) and `router/tsconfig.json` extends them. The full
API is documented in `router/.claude-plugin/types/claude-code/index.d.ts`.

## Tests

```bash
claude plugin test router        # unit and hook tests (claude-code/testing)
claude plugin validate router    # manifest and hooks validation
```

- Every change needs tests: test-driven development is the norm here (write the failing test
  first).
- On a loaded machine, the test kit can report false 5-second timeouts: re-run before raising
  any timeout.
- When you call `claude -p` from a script, close stdin (`< /dev/null`), or it hangs.

## Rules the mod loader enforces

Breaking any of these makes the module fail to load:

1. `$.state` atoms are declared **only** in `router/hooks/register.tsx`.
2. `$` (the engine interface) is passed **only** to top-level functions of that file.
3. Every `agent.spawn` hook has a `.catch`.

And the project's own rules:

- **Never block.** If a hook fails, the subagent must start with what Claude asked for
  (`.catch(($, e, next) => next(e))`).
- **The core is pure.** `router/src/` (`decidir`, `reglas`, `taxonomia`, `politica`, …) never
  touches `$`; classifiers receive what they need as parameters.
- **Files imported by Node from `bench/`** (`reglas.ts`, `registro.ts`, `resumen.ts`,
  `clasificadores/preguntas.ts`) may only have `import type` at the top, and no syntax Node can't
  strip (enums, namespaces, parameter properties).
- **The prompt never leaves the machine.** Classifiers get the description and a numeric
  summary, never the prompt, and nothing stores it.
- **Rewrite `model` with the alias** (`opus`, `sonnet`, `haiku`), never with a full model id.

## Changing routing behavior

Changes to the base table, rules, classifiers or thresholds should come with numbers from the
bench ([docs/benchmark.md](docs/benchmark.md)). If you contribute bench cases from your own
transcripts, anonymize them first: no project names, client names or personal paths.

## Commits and pull requests

- Commit messages follow `type(scope): summary`, e.g. `feat(router): …`, `fix(router): …`,
  `docs: …`, `chore(bench): …`.
- Keep pull requests focused on one change, describe what you tested, and update the docs and
  `CHANGELOG.md` (under *Unreleased*) when behavior changes.
- By contributing, you agree that your work is licensed under the [MIT License](LICENSE).
