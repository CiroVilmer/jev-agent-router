# Prueba de fast mode: router, fase 4

Fecha: 2026-10-07 · Claude Code 2.1.292 · rama `router-fase-3`.

La pregunta: ¿puede el router prender fast mode para la sesión cuando la ventana de 5 horas
tiene margen cerca del reset (🔥), y conviene? Respuesta corta: **el mecanismo existe, pero fast
no gasta el margen del plan: se cobra aparte, de los usage credits.** "🔥 + fast" queda cerrado.

## 1. Qué expone la API de mods

Revisé los tipos (`plugin-authoring/types/claude-code.d.ts`, unas 20 300 líneas) buscando
`fast`, `command.run`, `config.set`, `ConfigRow` y los orígenes de cambio de modelo. Los tipos
que se citan acá son los del bundle 2.1.288 de la skill `plugin-authoring`; las pruebas corrieron
sobre Claude Code 2.1.292.

- **No hay una operación de fast.** Ninguna operación ni evento tiene "fast" en el nombre. Las
  únicas menciones están en `PreModelSwitch`/`PostModelSwitch`, como origen de un cambio:
  `command: /model <name>, the /config Model row, or enabling fast mode when that promotes the model`.
  O sea, prender fast desde Sonnet se ve como un cambio de modelo con `source: 'command'`.
- **`$.command.run` sirve para correr `/fast`.** Corre un comando "como si la persona lo
  tipeara", pasa por los hooks y se encola hasta que la sesión queda ociosa. `/fast` aparece en
  `$.command.list()`:
  ```json
  { "name": "fast", "description": "Toggle fast mode (Opus 5.5)", "source": "builtin" }
  ```
- **`$.config.set` no sirve.** `$.config.list()` devuelve 42 filas y ninguna es de fast. Las que
  tocan modelo son `model` (choice: `default`, `sonnet`, `opus`, …) y `switchModelsOnFlag`. El
  setting `fastMode` existe en `settings.json`, pero no como fila de `/config`, y la API de mods
  no tiene una escritura genérica de settings (`settings.read` solo lee).
- **Los subagentes informan la velocidad.** El resultado del tool Agent trae `usage.speed`
  (`speed?: string | null`), así que, si algún día fast corriera en un subagente, se podría medir
  desde la transcripción.

## 2. Qué dice la documentación

De `code.claude.com/docs/en/fast-mode` y `settings-reference`:

- Fast es Opus con otra configuración de API, no otro modelo: "up to 2.5x faster at a higher
  cost per token". Solo corre en Opus 5.5, Opus 5 y Opus 4.8; prenderlo desde otro modelo cambia a
  Opus.
- **Facturación en Pro/Max:** "available via usage credits only and not included in the
  subscription rate limits". Y en una nota: "draws directly from usage credits, even if you have
  remaining usage". Requiere tener los usage credits prendidos; si no, `/fast` responde "Fast mode
  requires usage credits".
- Precio por MTok (entrada/salida): USD 8/40 en Opus 5.5 y USD 10/50 en Opus 5 y Opus 4.8. La
  primera vez que se prende en una conversación se paga todo el contexto como entrada sin caché,
  así que prenderlo a mitad de sesión (que es justo lo que haría 🔥) es lo más caro.
- **Persistencia:** `/fast` interactivo escribe `fastMode: true` en `~/.claude/settings.json` y
  queda prendido en las sesiones siguientes, salvo `fastModePerSessionOptIn: true`.
- **Headless:** con `-p`, `/fast` solo funciona si la sesión arrancó con `fastMode` en su
  `--settings`; ahí el toggle vale para esa sesión y no se guarda.
- **Subagentes:** la doc de subagentes dice que `/model` y `/fast` "set the main conversation's
  model and fast mode". El modelo de un subagente sale del parámetro `model` del spawn, del
  frontmatter, de `CLAUDE_CODE_SUBAGENT_MODEL` o del modelo principal; ninguno de esos pide la
  variante fast. La doc no dice explícitamente si un subagente que hereda Opus hereda también la
  velocidad (hay un issue abierto pidiendo que lo aclaren).

## 3. Prueba en vivo

Mod descartable `fastprobe` en el scratchpad de la sesión (fuera del repo). En `session.start`,
después de `next(e)`, lista filas de `/config` y comandos, intentaría `$.config.set` sobre una
fila de fast si existiera (no existe) y lanza `$.command.run({ command: 'fast', args: 'on' })` sin
esperarlo. Anota todo con `$.fs.write`.

```bash
claude -p --plugin-dir ./mod --model sonnet [--settings '{"fastMode": X}'] \
  --output-format json --debug-file runN.log "responde ok" < /dev/null
```

| Corrida | `--settings` | Respuesta de `/fast on` | `fast_mode_state` / motivo | Modelo y `speed` |
|---|---|---|---|---|
| 1 | — | `Fast mode is not available in the Agent SDK` | `off` / `sdk_opt_in_required` | Sonnet 5.5, `standard` |
| 2 | `fastMode: false` | igual que la 1 | `off` / `sdk_opt_in_required` | Sonnet 5.5, `standard` |
| 3 | `fastMode: true` | `Fast mode requires usage credits · /usage-credits to turn them on` | `off` / `extra_usage_disabled` | Sonnet 5.5, `standard` |

En las tres, el debug log muestra el comando encolado y el chequeo de la organización:

```
[DEBUG] $.command.run (fastprobe): 8 chars queued
[DEBUG] Org fast mode: disabled (extra_usage_disabled)
```

Lo que prueba:

- `$.command.run` llega a la lógica real de `/fast`: en la corrida 3 pasó la barrera del modo
  headless y se frenó recién en la de usage credits.
- En headless, un mod no puede prender fast por su cuenta: hace falta que el que lanza el proceso
  pase `fastMode` en `--settings`.
- La cuenta usada no tiene usage credits prendidos, así que **no se pudo ver un pedido en modo
  fast** ni, por lo tanto, medir si un subagente lo hereda. `$.session.model()` quedó en
  `claude-sonnet-5-5` antes y después.
- No se probó en una sesión interactiva: ahí `/fast` sin argumentos abre un diálogo, y prendido
  persiste en `~/.claude/settings.json` (vale para todas las sesiones de ese directorio de config).

**Settings del usuario:** respaldé `~/.claude/settings.json` antes de correr y verifiqué el
SHA-256 después de cada corrida: idéntico (`57f91cfe…7b04787e`). Ninguna corrida lo tocó, y fast
nunca quedó prendido.

## 4. Fast y los subagentes

- El router actúa sobre subagentes: elige su `model` y `effort` en `agent.spawn`. Fast es una
  palanca de la **sesión principal**, y el parámetro `model` del spawn no tiene variante fast.
- Aun si un subagente con `model: inherit` heredara la velocidad, prender fast obliga a la sesión
  principal a pasar a Opus: cambia el modelo del hilo principal, que el router nunca toca.
- Queda sin verificar en vivo si un subagente Opus corre en fast cuando la sesión lo tiene
  prendido. Si se quisiera medir, `usage.speed` del resultado del Agent tool lo diría, pero hace
  falta una cuenta con usage credits.

## 5. Recomendación: cerrar "🔥 + fast"

No implementarlo, ni siquiera como opción apagada por defecto. Las razones, de más a menos
pesada:

1. **Contradice la premisa de 🔥.** 🔥 existe para quemar el margen de la ventana de 5 horas
   antes del reset, que ya está pago con el Max. Fast no consume ese margen: se cobra de los usage
   credits aunque quede uso del plan. Prenderlo con margen gasta plata extra y deja el margen
   igual.
2. **Es caro justo en el momento en que 🔥 lo prendería.** Al prenderlo a mitad de sesión se paga
   todo el contexto acumulado como entrada sin caché, a tarifa fast.
3. **No es una palanca de subagentes.** El router decide por subagente; fast es de la sesión
   principal, solo en Opus, y la API de spawn no lo pide.
4. **Efectos colaterales.** En interactivo, `/fast` persiste `fastMode: true` en la config del
   usuario (lo heredan las sesiones siguientes); el router tendría que apagarlo siempre, también
   cuando la sesión termina mal. En headless no funciona sin `--settings`.
5. **Hoy ni siquiera está disponible:** la cuenta probada tiene los usage credits apagados
   (`extra_usage_disabled`).

Si en el futuro el plan Max incluyera fast dentro de los límites de la suscripción, el camino
técnico existe: `$.command.run({ command: 'fast' })` en interactivo, con un `$.command.run` de
apagado garantizado y la verificación por `usage.speed`. Hasta entonces, se cierra.
