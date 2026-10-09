# Verificación en vivo: router, fase 2

Fecha: 2026-10-06 (banco) y 2026-10-07 (chequeos en vivo) · Claude Code 2.1.292 ·
rama `router-fase-2`.

No hubo sesión interactiva: todo corrió en modo headless (`claude -p`), desde la raíz del
worktree y con el mod cargado por `--plugin-dir "$(pwd)/router"`. La evidencia sale, como en la
fase 1, del debug log (`--debug-file`), de la transcripción de cada subagente en
`~/.claude/projects/claude-mods--claude-worktrees-router-fase-2/<sesión>/subagents/`
(`.meta.json` con el `model` del spawn y `.jsonl` con el `model` y el `effort` de cada pedido) y,
para la sombra, del archivo del `$.store` del plugin.

## Paso 1: key de Jev

`JEV_API_KEY` no está seteada en el proceso y no se buscó en ningún archivo. El banco corrió con
`--solo haiku`. **Jev queda pendiente** de que el usuario configure la key, de una de dos formas:
`/plugin configure` → `jevApiKey`, o exportando `JEV_API_KEY`. Después hay que volver a correr
`/router banco --solo jev` (o `/router banco`) y `node bench/comparar.mjs`.

## Paso 2: el banco

Dos turnos en un mismo proceso, con `--input-format stream-json`: el comando y un "ok".

```bash
# turnos.jsonl
{"type":"user","message":{"role":"user","content":"/router banco --solo haiku"}}
{"type":"user","message":{"role":"user","content":"Respondé solo: ok"}}

claude -p --plugin-dir "$(pwd)/router" --model sonnet --input-format stream-json \
  --output-format stream-json --verbose --debug-file <log> < turnos.jsonl
```

Primero una prueba con `--max 5` (`Banco: 5 casos · haiku 5 ok / 0 error ·
bench/corridas/2026-10-06-1626-banco.json`, 8 s; el archivo tenía la forma esperada y no se
versiona). Después la corrida entera, que tardó 2 min 23 s:

```
router: Banco: 275 casos · haiku 275 ok / 0 error · bench/corridas/2026-10-06-1627-banco.json
```

## Paso 3: comparar

`node bench/comparar.mjs` (toma la corrida más nueva) escribió
`bench/corridas/2026-10-06-1627-comparacion.md`:

> **Reglas:** resuelven solas 454 de 729 casos (62%), con 97% de acierto contra la referencia.
>
> | Clasificador | casos | acierta | acierta (solo seguros) | acierta (solo builds) | errores | p50 ms | p95 ms |
> |---|---|---|---|---|---|---|---|
> | haiku | 264 | 66% | 73% | 75% | 0 | 707 | 1603 |
>
> **Imposibles de acertar** (la referencia no está entre las etiquetas ofrecidas; fuera de la tabla): 11 casos.
>
> **Respaldo sin modelo** en los 197 builds ganables: actual (chars > 5000 o archivos > 6) 72% · solo por largo (chars > 5000) 74%.

Dato extra, sacado del JSON de la corrida: 45 de las 275 llamadas (16%) tardaron más de 1000 ms,
el `topeMs` por defecto. La más lenta, 3110 ms.

### Paso 3b: comparación rehecha tras la review final

La review final pidió que la tabla respondiera "reglas contra el clasificador" sobre los mismos
casos, y que simulara el tope de producción. `bench/comparar.mjs` suma la fila **Respaldo (sin
modelo)**, las columnas *con tope* y el desglose *sin regla* / *builds*, y cuenta errores y
latencias solo sobre las llamadas de casos ganables (por eso el p50 pasa de 707 a 701 ms). Se
volvió a correr sobre la misma corrida, sin llamar de nuevo a Haiku:

```
node bench/comparar.mjs bench/corridas/2026-10-06-1627-banco.json
```

> | Clasificador | casos | acierta | acierta con tope | sin regla | sin regla con tope | builds | builds con tope | solo seguros | errores | p50 ms | p95 ms |
> |---|---|---|---|---|---|---|---|---|---|---|---|
> | Respaldo (sin modelo) | 264 | 60% | 60% | 25% | 25% | 72% | 72% | 63% | 0 | — | — |
> | haiku | 264 | 66% | 63% | 42% | 37% | 75% | 72% | 73% | 0 | 701 | 1603 |

Los 264 casos son 67 sin regla y 197 builds. En casos: todos, respaldo 158, Haiku 175 y Haiku
con tope 166; sin regla, 17, 28 y 25; builds, 141, 147 y 141.

## Paso 4: `explore` → Haiku

```bash
claude -p --plugin-dir "$(pwd)/router" --permission-mode bypassPermissions --model sonnet \
  --output-format stream-json --verbose --debug-file <log> \
  'Lanzá un único subagente con la herramienta Agent: subagent_type "Explore", description exactamente "Explore: mapear router/src", y prompt "No uses ninguna herramienta. Respondé solo: ok". Después respondé solo: ok' \
  < /dev/null
```

(Sin `< /dev/null` el proceso se queda esperando stdin; hubo que cortarlo y relanzarlo. El
proceso cortado llegó a terminar y dejó una segunda sesión, con el mismo resultado.)

Observado (sesiones `ecf05419-bc38-4686-a3c3-1a15d6620369` y `3324878e-70b5-4808-9280-d6eedd8f98a8`):

- Debug log: `agent.spawn Explore: model (inherit) -> haiku by a hook`
- `meta.json`: `"agentType":"Explore","description":"Explore: mapear router/src",...,"model":"haiku"`
- Transcripción: los 2 registros `assistant` traen `"model":"claude-haiku-4-5-20251001"` y
  **ningún campo `effort`**.
- El subagente y la sesión respondieron `ok`.

Veredicto: ✅ `explore` sale en Haiku. Los pedidos van **sin `effort`**, igual que el caso
`[pin]` de la fase 1. Es lo esperado: el escalón Haiku de `router/src/taxonomia.ts` no tiene
esfuerzo (`{ modelo: 'haiku' }`), así que `turn.step` deja pasar el pedido sin tocarlo. Esto
cierra el punto 2 pendiente de la fase 1.

## Paso 5: clasificador Haiku conectado

Las opciones de un plugin cargado con `--plugin-dir` se pasan con `--settings` y
`pluginConfigs` con la clave `router@inline`, como dice la guía de mods. El debug log lo
confirma de forma indirecta: para otro plugin dice `no pluginConfigs[...] in user, --settings or
managed settings`, y para el router no lo dice; además el router llamó a Haiku, cosa que con el
default (`reglas`, sombra `off`) no hace.

```bash
claude -p --plugin-dir "$(pwd)/router" --permission-mode bypassPermissions --model sonnet \
  --settings '{"pluginConfigs":{"router@inline":{"options":{"clasificador":"haiku","sombra":"off"}}}}' \
  --output-format stream-json --verbose --debug-file <log> \
  'Lanzá un único subagente con la herramienta Agent: subagent_type "general-purpose", description exactamente "Implement Task 2: tablas", y prompt "No uses ninguna herramienta. Respondé solo: ok". Después respondé solo: ok' \
  < /dev/null
```

Observado (sesión `6e5a7fe6-4722-4ccb-b75a-d3fa1d219b62`):

- Debug log, en orden:
  ```
  12:18:46.233Z [DEBUG] $.model.complete (router): claude-haiku-4-5-20251001 answered in 670ms, 11 chars
  12:18:46.245Z [DEBUG] agent.spawn general-purpose: model (inherit) -> sonnet by a hook
  ```
  El router llama a `$.model.classify(..., { model: 'haiku' })` (`router/hooks/register.tsx`,
  línea 93); el motor la registra como `$.model.complete`. 11 caracteres es `build-small`.
  Respondió en 670 ms, dentro del tope de 1000 ms, así que decidió Haiku y no el respaldo.
- `meta.json`: `"model":"sonnet"`.
- Transcripción: `"model":"claude-sonnet-5-5"` y `"effort":"medium"`.

Veredicto: ✅ Hubo clasificación con Haiku antes del spawn y el subagente salió en
sonnet·medium.

## Paso 5b: la sombra se guarda en `$.store`

Lo mismo, con `{"clasificador":"reglas","sombra":"haiku"}`. Antes de correrlo,
`~/.claude/plugins/store/` no tenía archivo del router.

Observado (sesión `17ae7d7b-85d3-40b8-a23b-4915890c341c`):

- Debug log:
  ```
  12:19:25.425Z [DEBUG] agent.spawn general-purpose: model (inherit) -> sonnet by a hook
  12:19:29.896Z [DEBUG] $.model.complete (router): claude-haiku-4-5-20251001 answered in 1553ms, 11 chars
  12:19:37.428Z [DEBUG] $.store.set (router@inline): sombra
  ```
  El spawn salió sin esperar a la sombra (decidieron las reglas), y la sombra siguió en segundo
  plano hasta el `$.store.set`, 12 s después del spawn.
- Apareció `~/.claude/plugins/store/router_inline-d38da18059d4.json`, con una muestra:
  ```json
  {
    "sombra": [
      {
        "fecha": 1791375571709,
        "tarea": "Implement Task 2: tablas · prompt 46 chars · 0 archivos · 0 pasos",
        "etiquetas": ["build-large", "build-small"],
        "nombres": { "principal": "reglas", "sombra": "haiku" },
        "principal": { "tipo": "build-small", "ms": 0, "fuente": "respaldo" },
        "sombra": { "tipo": "build-small", "ms": 0, "fuente": "respaldo", "detalle": "tardó más de 1000 ms" }
      }
    ]
  }
  ```
- `meta.json` del subagente: `"model":"sonnet"`.

Veredicto: ✅ La muestra de sombra se persiste en el `$.store`, leída directo del archivo del
store. Dos observaciones:

1. La sombra corre con el mismo tope de producción (`topeMs`). Esta vez Haiku tardó 1553 ms, así
   que la muestra guarda el respaldo y no lo que contestó Haiku. Con un 16% de llamadas por
   encima de 1000 ms en el banco, una parte de las muestras de sombra va a medir el respaldo y no
   a Haiku.
2. En una muestra cortada por el tope, `ms` queda en 0 en vez del tiempo hasta el corte. No
   afecta las estadísticas del panel, que filtran las de `fuente: respaldo`.

**Arreglado después, en la review final:** la sombra ya no usa `topeMs` sino un límite de 60 s,
como el banco. Guarda el tipo y los ms reales, y `pasoTope: true` si tardó más que `topeMs`. Las
coincidencias solo cuentan muestras comparables (ninguno cayó al respaldo por su cuenta, salvo
`reglas`), y el panel las reporta por par principal→sombra.

La muestra de esta verificación se borró del store real del usuario al cerrar la review final:
medía el respaldo y no a Haiku.

## Recomendación (no se cambió ningún default)

Los números, de la tabla del paso 3b (respaldo contra Haiku, sobre los mismos casos; *con tope*
simula producción con `topeMs` = 1000 ms):

| | casos | Respaldo | Haiku sin tope | Haiku con tope |
|---|---|---|---|---|
| Todos | 264 | 60% (158) | 66% (175) | 63% (166) |
| Sin regla | 67 | 25% (17) | 42% (28) | 37% (25) |
| Builds | 197 | 72% (141) | 75% (147) | 72% (141) |

**Las diferencias de 1 a 3 puntos están dentro del ruido de las etiquetas.** Hay 96 etiquetas
dudosas (`seguro: false`) sin revisar en `bench/para-revisar.md`: 84 caen entre estos 264 casos
(67 en builds y 17 sin regla), muchas más que los 0 a 6 casos que separan a Haiku del respaldo en
builds. Además, las tallas de referencia se etiquetaron mirando sobre todo el largo del prompt
(el conteo de archivos nombrados no servía como señal), así que la referencia está
anclada al largo. Eso favorece a cualquier variante que decida solo por largo, como el respaldo
"solo por largo" (74% contra 72% de la actual): esa ventaja puede ser un artefacto del etiquetado
y no un acierto real.

- **`clasificador`: dejar `reglas` por ahora.** En builds, Haiku con tope empata con el respaldo
  (72% contra 72%, 141 casos cada uno): el 16% de las llamadas pasa los 1000 ms y ahí decide el
  respaldo igual, después de esperar. Sin tope gana por 3 puntos, dentro del ruido. Donde Haiku
  sí se separa es en los 67 casos sin regla (37% con tope contra 25%, 8 casos), pero es una
  muestra chica con 17 etiquetas dudosas. Subir `topeMs` a ~1700 ms haría que Haiku decida casi
  siempre, a costa de hasta 1,7 s por spawn.
- **Respaldo: no cambiarlo todavía.** La variante solo por largo le saca 2 puntos (unos 4 casos
  de 197) a la actual, y es justo la que favorece el anclaje de las etiquetas al largo.
- **Antes de tocar `clasificador` o el respaldo:** revisar `bench/para-revisar.md` (corregir el
  `tipo` y pasar `seguro` a `true`), correr Jev con la key configurada (`/router banco --solo
  jev`) y volver a correr `node bench/comparar.mjs`. Recién con etiquetas revisadas y las tres
  filas (respaldo, Haiku, Jev) sobre los mismos casos tiene sentido elegir. `jevUmbral` sale de
  la tabla de calibración de esa corrida: el borde inferior del primer tramo que acierte más que
  el respaldo.

## Corrida con Jev (2026-10-07)

La primera corrida del usuario devolvió 401 en las 5 llamadas a Jev. La key era válida (una
llamada directa a la API respondió bien) y una sonda confirmó que un mod puede mandar su propio
header `Authorization` a un host externo. La causa era la sesión de Claude Code: se había abierto
antes de cargar `JEV_API_KEY` y tenía un valor viejo. Con una terminal nueva funcionó, y se
verificó que la key no aparece ni en el archivo de la corrida ni en el debug log.

Corrida completa: `bench/corridas/2026-10-07-1032-banco.json`, con Haiku y Jev, 275 casos cada
uno y **0 errores**. La comparación está en `2026-10-07-1032-comparacion.md`.

| Sobre los 264 casos ganables | Acierta | Sin regla (67) | Builds (197) | Solo seguros | p50 | p95 |
|---|---|---|---|---|---|---|
| Respaldo (sin modelo) | 60% | 25% | 72% | 63% | — | — |
| Haiku | 66% | 42% | 75% | 73% | 645 ms | 722 ms |
| Jev | 67% | 43% | 76% | 75% | 275 ms | 330 ms |

- Haiku y Jev **coinciden en 250 de 264 casos**. El límite parece estar en la información que
  reciben (el título y el resumen), no en el modelo.
- Ninguna llamada pasó 1000 ms: la más lenta de Jev tardó 681 ms y la de Haiku 968 ms.

**Calibración de Jev:** la confianza predice el acierto.

| Confianza | n | Acierta |
|---|---|---|
| < 0.5 | 17 | 12% |
| 0.5 a 0.7 | 32 | 19% |
| 0.7 a 0.9 | 89 | 66% |
| ≥ 0.9 | 126 | 88% |

**Barrido de `jevUmbral`.** Cuando la confianza está por debajo del umbral, decide el respaldo.

| jevUmbral | Acierta | Pasan al respaldo |
|---|---|---|
| 0 | 67,4% | 0 |
| 0.5 | 72,3% | 17 |
| **0.7** | **76,1%** | 49 |
| 0.8 | 73,9% | 91 |
| 0.9 | 68,6% | 138 |

- Con 0.7, los builds aciertan el **89,3%**. En los casos sin regla baja de 43% a 37%, porque el
  respaldo siempre devuelve `build-small`.
- De punta a punta, con los 729 casos incluidos los que deciden las reglas solas (97%):
  respaldo 82,0%, Haiku 84,4% y Jev 84,8%.

**Dirección de los errores en builds:**

| | Chico a grande (gasta de más) | Grande a chico (le falta modelo) |
|---|---|---|
| Respaldo | 56 | 0 |
| Haiku | 1 | 49 |
| Jev | 1 | 47 |
| Jev con umbral 0.7 | 2 | 19 |

**Decisión del usuario (2026-10-07):** `clasificador: jev` con `jevUmbral: 0.7`.
- El default del plugin para `jevUmbral` pasa de 0.5 a 0.7.
- El default de `clasificador` sigue en `reglas`, para quien no tenga key. El usuario lo activa
  en su config.
- **Ojo:** las 96 etiquetas dudosas siguen sin revisar, y el criterio de talla está anclado al
  largo del prompt. Parte de la ventaja del umbral puede venir de ahí.
