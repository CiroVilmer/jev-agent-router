# Security Policy

## Supported versions

Only the latest release on the `main` branch receives fixes.

## What to keep in mind

A Claude Code mod runs code inside Claude Code with your user's permissions. The router:

- reads and rewrites the `model` of subagents and the `effort` of their turns;
- adds text to the system prompt and to the Agent tool's description;
- stores its decisions in the plugin's own store (a JSON file in Claude Code's config folder);
- with `clasificador: jev` (or `sombra: jev`), sends each subagent's **description and a numeric
  summary of its prompt** — never the prompt — to `https://api.typesafe.ai`;
- writes `~/.claude/router-historial.md` when you run `/router historial`.

The Jev key is declared as a sensitive option and is masked in error messages.

## Reporting a vulnerability

Please **don't open a public issue**. Use GitHub's
[private vulnerability reporting](https://github.com/CiroVilmer/jev-agent-router/security/advisories/new)
and include what you found, how to reproduce it, and its impact. You'll get an answer within a
week; fixes are released as soon as they're ready, and reporters are credited unless they prefer
otherwise.
