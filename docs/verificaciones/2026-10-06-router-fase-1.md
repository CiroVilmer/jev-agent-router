# Verificación en vivo: router, fase 1

Fecha: 2026-10-06 · Claude Code 2.1.291 · rama `router-fase-1`.

## Cómo se corrió

No hubo sesión interactiva: las verificaciones corrieron en modo headless (`claude -p`), donde los
hooks del mod corren igual pero no se dibuja nada. Base, desde la raíz del worktree:

```bash
claude -p --plugin-dir "$(pwd)/router" --permission-mode bypassPermissions --model sonnet \
  --output-format stream-json --verbose --debug-file <log> "<prompt>"
```

La evidencia sale de tres fuentes, en orden de confianza:

1. El debug log (`--debug-file`), que registra cada reescritura de `agent.spawn`.
2. La transcripción del subagente en
   `~/.claude/projects/claude-mods--claude-worktrees-router-fase-1/<session>/subagents/`.
   El `.meta.json` trae el `model` con el que salió, y cada registro `assistant` del `.jsonl`
   trae el `effort` que llevó el pedido a la API.
3. Lo que el subagente dice de sí mismo. Es lo menos confiable y queda solo como apoyo.

**Ojo con `$CLAUDE_EFFORT`.** En las tres corridas el subagente imprimió `medium`, aun cuando el
pedido a la API llevaba `xhigh` o `high`. Según los tipos de la API de mods, `CLAUDE_EFFORT` es
el esfuerzo activo de la sesión, el mismo que ve la status line. No refleja lo que `turn.step`
cambia por paso. Por eso el esfuerzo real se toma de la transcripción y no del `echo`.

Hubo 3 corridas en total, una por chequeo.

## Paso 1: el plugin carga

Debug log de la corrida 1:

```
hooks module router@inline loaded (worker, environment 2, tier user); events: session.start,prompt.compose,session.measure,agent.spawn,turn.step,turn.complete,command.run,ui.render
plugin.register: router (user, router@inline), judged by cc-plugin-sec-default: admitted
$.command.register (router): /router listed
```

Veredicto: ✅ El mod carga y registra `/router`. No se pudo ver `/plugin`, que es interactivo.

## Paso 2: review con model "sonnet" sale como opus·xhigh

Prompt: un subagente general-purpose con description `"Review Task 1 (spec + quality)"` y model
`"sonnet"`, que corre `echo $CLAUDE_EFFORT` y dice su modelo.

Observado:

- Debug log: `agent.spawn general-purpose: model sonnet -> claude-opus-5-5 by a hook`
- `subagents/agent-a7042734c8d586195.meta.json`: `"model":"claude-opus-5-5"`
- Los 3 registros `assistant` del subagente llevan `"effort":"xhigh"`.
- Stream-json: el mensaje del subagente trae `"model":"claude-opus-5-5"`, y la sesión principal
  `claude-sonnet-5-5`.
- El subagente dijo `medium` (ver la nota sobre `$CLAUDE_EFFORT`) y `claude-opus-5-5`.
- La línea (`ui_status` en stream-json):
  `router · ⬆️ subiendo un nivel hasta el reset (86m) · 1 de 1 subagentes reasignados · /router`
- No se vio el panel `/router` con `sonnet → opus·xhigh` y el motivo `regla review`, porque es UI
  interactiva.

Veredicto:

- Modelo: ✅
- Esfuerzo que llega al pedido: ✅ (`xhigh` en la transcripción; el `echo` dice `medium`)
- Línea: ✅
- Panel: ⚠️ no verificable en headless

## Paso 3a: `[pin]` con model "haiku" respeta Haiku

Prompt: lo mismo, con description `"Review Task 2 [pin]"` y model `"haiku"`.

Observado:

- El debug log no tiene ninguna línea `agent.spawn ... by a hook`: el router no reescribió.
- `meta.json`: `"model":"haiku"`. El mensaje del subagente en stream-json trae
  `"model":"claude-haiku-4-5-20251001"`, y la transcripción también.
- El subagente dijo `claude-haiku-4-5-20251001` y `medium`.

Veredicto: ✅

**Pendiente de la revisión de la Task 8 (esfuerzo en subagentes Haiku).** Los registros
`assistant` del subagente Haiku no traen ningún campo `effort`. El pedido a la API salió sin
esfuerzo, aunque `turn.step` deja pasar el que traía el pedido cuando el escalón no tiene uno.
`$CLAUDE_EFFORT` dice `medium`, pero es la variable de la sesión, no del pedido. Este caso es
`[pin]`: el subagente no queda en el registro, así que `turn.step` lo deja pasar sin tocarlo.
Falta ver qué pasa con un subagente `explore` que el router manda a Haiku. No se probó, para no
sumar corridas.

## Paso 3b: `/router fijar review sonnet·high` lleva review a sonnet·high

`-p "/router fijar ..."` corre el comando y termina, y los overrides viven en un atom de la
sesión. Por eso se mandaron los dos turnos en un solo proceso, con `--input-format stream-json`:
primero `/router fijar review sonnet·high` y después el prompt del Paso 2.

Observado:

- El comando corre en `-p`. Respuesta: `router: Router: review queda fijado en sonnet·high para esta sesión.`
  Debug log: `router (user) answered command.run without next() in 55.2ms`.
- Debug log: `agent.spawn general-purpose: model sonnet -> claude-sonnet-5-5 by a hook`
- `meta.json`: `"model":"claude-sonnet-5-5"`
- Los 3 registros `assistant` del subagente llevan `"effort":"high"`.
- El subagente dijo `claude-sonnet-5-5` y `medium`, otra vez el `$CLAUDE_EFFORT` de la sesión.
- Línea: `router · ⬆️ subiendo un nivel hasta el reset (85m) · /router`. Bien: sonnet → sonnet no
  cuenta como reasignado.
- No se corrió `/router reset`: el proceso terminó y los overrides murieron con él.

Veredicto: ✅ El camino de `fijar` funciona en un proceso real. El panel no se vio.

## Los tres puntos abiertos del spec

| Punto | Resultado |
|---|---|
| El esfuerzo llega al subagente | ✅ `turn.step` con `agentId` aplica: `xhigh` en el Paso 2 y `high` en el Paso 3b, en los registros del pedido. `$CLAUDE_EFFORT` no lo refleja, porque es de la sesión. |
| Se aceptan los ids completos de 5.5 | ✅ con observación. `claude-opus-5-5` y `claude-sonnet-5-5` se aceptan y el subagente corre con ellos. Pero cada reescritura deja en el debug log un `[ERROR] ZodError ... path ["model"] ... expected one of "sonnet"\|"opus"\|"haiku"\|"fable"`, justo después de la línea `agent.spawn ... by a hook`. Aparece en las corridas 1 y 3; en la 2, sin reescritura, no. Algún consumidor interno valida `model` contra los alias y no acepta el id completo. No bloquea el spawn. Hay que ver en la fase 2 qué se pierde: telemetría, la UI del subagente o el `/router` del panel. Otra opción es reescribir con alias (`opus` o `sonnet`) en vez del id. |
| Se ve el modelo que pidió Claude | ✅ `agent.spawn` recibe `e.model` = `sonnet` o `haiku` tal como lo pidió Claude, y el debug log lo muestra (`model sonnet -> ...`). El `meta.json` del caso `[pin]` guarda `haiku`. |

## Para la fase 2

1. ~~El `ZodError` sobre `model` en cada reescritura con id completo.~~ Resuelto en 97c46ce (alias). Línea del debug log:
   `[ERROR] "ZodError: ... \"path\": [\"model\"], \"message\": \"Invalid option: expected one of \\\"sonnet\\\"|\\\"opus\\\"|\\\"haiku\\\"|\\\"fable\\\"\""`
2. Verificar si un subagente `explore` que el router manda a Haiku sale sin esfuerzo, como el
   caso `[pin]`.
3. Revisar el panel `/router` y `/router reset` en una sesión interactiva.

## Re-verificación tras la review final: reescritura con alias

El router ahora reescribe `model` con el alias (`opus`, `sonnet`, `haiku`) en vez del id
completo. Esto resuelve el punto 1 de la fase 2. Una corrida headless con el mismo comando, y el
prompt: un subagente general-purpose con description `"Review Task 1 (spec + quality)"` y model
`"sonnet"`, que solo responde "ok".

Observado (sesión `2642554a-bf42-4f50-82ca-c5b174f4a25d`):

- Debug log: `agent.spawn general-purpose: model sonnet -> opus by a hook`
- `ZodError` en el debug log: 0 apariciones.
- `subagents/agent-a31264d6180be58cf.meta.json`: `"model":"opus"` (el alias que pasó el hook).
- La transcripción del subagente: `"model":"claude-opus-5-5"` y `"effort":"xhigh"`. El alias
  resolvió a Opus 5.5, y `turn.step` aplicó el esfuerzo porque el modelo del paso contiene `opus`.
- La línea: `router · ⬆️ subiendo un nivel hasta el reset (74m) · 1 de 1 subagentes reasignados · /router`
- El subagente respondió `ok`.

Veredicto: ✅ Sin `ZodError`, con Opus 5.5 y `xhigh`.
