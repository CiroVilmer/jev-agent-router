# router

> English documentation: [README](../README.md) · [how it works](../docs/how-it-works.md) · [configuration](../docs/configuration.md).
> Este README es la referencia técnica del plugin, en castellano.

Mod de Claude Code que elige el modelo y el esfuerzo de cada subagente según el tipo de tarea, y
los sube cuando sobra ventana de 5 horas. Nunca frena el uso.

## Cargarlo

- Una sesión: `claude --plugin-dir <repo>/router`
- Siempre: `claude plugin marketplace add CiroVilmer/jev-agent-router` y
  después `claude plugin install agent-router@jev-agent-router`

## Usarlo

| Comando | Qué hace |
|---|---|
| `/router` | Abre el panel: pestañas **En curso**, **Métricas vs tu base** e **Historial** (teclas 1, 2 y 3) |
| `/router off` / `/router on` | Apaga o prende el router en esta sesión |
| `/router permitir sonnet,opus` | Solo usa esos modelos en esta sesión |
| `/router fijar review opus·max` | Fija un tipo por encima de la política |
| `/router reset` | Borra los overrides de la sesión |
| `/router banco` | Corre el banco del clasificador (ver abajo) |
| `/router historial [días]` | Exporta las decisiones de los últimos días (7 si no se dice) a `~/.claude/router-historial.md` |
| `[pin]` en la description de un subagente | Respeta el modelo que pidió Claude |

En `/config` se cambian los umbrales de la política (🔥 y ⬆️), los clasificadores (ver abajo) y
`avisarAClaude` y `ensenarConvencion`.

## Lo que ve Claude

El router suma una sección (`router:pin`) al system prompt. Le dice que el modelo y el esfuerzo
de cada subagente los elige el router, que no gaste razonamiento eligiendo `model` y que use ese
tiempo en descomponer el trabajo: lanzar en paralelo las tareas independientes y serializar las
que tocan los mismos archivos, comparten estado o dependen de otra.

La convención de nombres va en la descripción de la tool Agent, donde Claude la lee justo cuando
escribe la `description` (un hook `tool.describe`): empezar con el verbo del tipo (Implement,
Review, Re-review, Fix, Explore, Research, Write), nombrar la unidad como `Task N`, y `[pin]` si
de verdad necesita un modelo exacto. El texto está en `CONVENCION_AGENT`
(`router/src/convencion.ts`) y la sección del system prompt en `LINEA_ROUTER`
(`router/src/overrides.ts`). `/router off` no saca el texto de la tool: el host lo cachea por
sesión.

**`ensenarConvencion`** (`/config`, prendido por defecto): cuando ninguna regla reconoce la
`description` de un subagente y lo clasificó otro camino, Claude ve una línea en el resultado de
Agent, por ejemplo `router: no reconocí el tipo de "v2: kubernetes" y lo clasifiqué como
build-small. Empezá la description con el verbo del tipo (...) y usá `Task N`.`. Si
`avisarAClaude` también está prendido salen las dos líneas, primero la de `avisarAClaude`.

**`avisarAClaude`** (`/config`, apagado por defecto): cuando el router reasigna un subagente,
Claude ve una línea corta en el resultado de la tool Agent, por ejemplo
`(router: corre en opus·xhigh — regla review)`. Va como `context` del resultado (un hook
`tool.call` sobre Agent, unido al spawn por el `tool_use_id`): lo lee el modelo y no se muestra en
el transcript. Sin reasignación no agrega nada.

## Clasificadores (fase 2)

Cuando las reglas no alcanzan para saber el tipo (un build sin talla clara, o una description sin
regla) y, con `jev`, también para las reviews por description, decide un clasificador. Se configura en `/config`:

| Campo | Default | Qué hace |
|---|---|---|
| `clasificador` | `reglas` | Quién decide: `reglas` (el respaldo, sin modelo), `haiku` o `jev` |
| `sombra` | `off` | Corre otro clasificador en paralelo, sin afectar la decisión: `off`, `haiku` o `jev` |
| `jevApiKey` | (vacío) | La key de Jev (TypeSafe). Se guarda como dato sensible |
| `jevUmbral` | `0.7` | En la talla de los builds, con menos confianza que esto decide el respaldo. También decide en las reviews por description cuando el clasificador es Jev: con menos confianza queda la regla. Sin regla, decide Jev igual y el motivo lo marca (`sin umbral`). Se acota a [0, 1]. Calibrado en el banco del 2026-10-07 para la talla y, para las reviews, en `bench/corridas/2026-10-09-1339-jev-todos-analisis.md` (0.7 simulado el 2026-10-09) |
| `topeMs` | `1000` | Si el clasificador tarda más, decide el respaldo. Se acota a [50, 8000] |

**La key de Jev:** `/plugin configure` → `jevApiKey`, o la variable de entorno `JEV_API_KEY`.
Sin key, `clasificador: jev` usa Haiku y `sombra: jev` queda desactivada; las dos cosas se
avisan con un toast.

**Reviews:** cuando una regla de description (no de `subagentType`) dice `review-final`, `review`
o `re-review`, y `clasificador` es `jev` (con key), el router consulta a Jev con las 9 etiquetas.
Con `reglas` o `haiku` como principal, aunque haya sombra, no consulta y queda la regla.
Si Jev está seguro (confianza ≥ `jevUmbral`), decide él, aunque cambie el tipo: motivo
`jev → review (0.98)`. Si duda, queda la regla: `jev dudó (0.55): queda la regla`. Si el
clasificador cayó al respaldo (tope o error), queda la regla y el motivo lo dice: `respaldo (tardó
más de 1000 ms): queda la regla`.

**Modo sombra:** con `sombra` en `haiku` o `jev`, cada vez que hace falta un clasificador corre
también el de sombra, en segundo plano y con un límite de 60 s (no `topeMs`), y guarda las dos
respuestas en el store del plugin (las últimas 500). Los números se ven en `/router` → pestaña
**Métricas vs tu base** → **CLASIFICADORES**, por par principal→sombra: cuántas veces coinciden
(solo entre las respuestas propias de los dos), p50 y p95 de cada uno, cuántas cayeron al
respaldo y cuántas respuestas de la sombra pasaron `topeMs`. Sirve para juntar números con
tráfico real antes de cambiar `clasificador`.

**Banco:** `/router banco [--max N] [--solo haiku|jev]` corre los clasificadores sobre los
subagentes reales de `bench/casos.json` y `node bench/comparar.mjs` los compara contra una
referencia y contra el respaldo. Cómo usarlo y cómo leer la tabla:
[bench/README.md](../bench/README.md).

## Métricas (fase 3)

`/router` → pestaña **Métricas vs tu base** compara tres columnas:

| Columna | De dónde sale |
|---|---|
| **sesión** | Los subagentes de esta sesión, en memoria |
| **7 días** | El historial guardado de todas las sesiones, en el rango `(ahora − 7 días, ahora]` |
| **base** | La línea base de antes del router (`router/src/lineaBase.ts`) |

Qué mide cada fila:

- **reviews en Opus:** de los subagentes `review`, `review-final` y `re-review`, la proporción
  que corrió en Opus. Cuenta el modelo con el que corrió de verdad: el que eligió el router o, si
  el router no lo tocó (`[pin]`, `/router off`, un error), el `model` pedido o el del padre si
  hereda. Un subagente sin tocar toma el tipo de las reglas, como la base.
- **rondas/tarea:** promedio de `re-review` por tarea, sobre las tareas con al menos un review.
  La tarea sale de la description (`Task 6`, `Tarea 6`, `T6`) y, desde la fase 5, también de `<prefijo>: <nombre>` (`v2: kubernetes` y `verif: kubernetes` son la misma tarea). La línea base se generó sin ese agrupamiento y no se regenera, así que la comparación de min/tarea no es exactamente igual. En 7 días, la misma tarea de
  sesiones distintas cuenta por separado.
- **min/tarea:** la **mediana** (no el promedio) de los minutos de cada tarea terminada, desde el
  primer spawn hasta que termina su último subagente.

Una tarea entra o queda afuera de los 7 días entera, según el fin de su último subagente: no se
parte en el borde.

**La línea de ventanas:**
`5 h sin usar al reset (7 días): 25% en 2 ventanas · vs semana anterior 50% (no hay base previa al router) · 1 sin cobertura`.

- Para cada ventana de 5 h cerrada, lo sin usar es `100 − el % más alto que se vio`.
- **Cobertura:** una ventana cuenta en el promedio solo si se vio en los **60 minutos** antes de
  su reset. Si no, figura como **sin cobertura**: el máximo que se vio puede no ser el final, así
  que no se promedia.
- El promedio está **sesgado hacia abajo**: las ventanas donde dejaste de trabajar más de 1 h
  antes del reset (las que suelen quedar con más sin usar) no tienen cobertura y no entran.
- La ventana de 5 h **no tiene base previa al router**: los transcripts no traen el %. Por eso
  se compara contra la **semana anterior**, `(ahora − 14 días, ahora − 7 días]`, y no contra la
  base. Los dos rangos tienen el borde de abajo abierto, así una ventana no cae en los dos.

**Dónde se guarda:** en el store del plugin, un JSON propio dentro de la carpeta de
configuración de Claude Code.

| Clave | Qué guarda | Tope |
|---|---|---|
| `historial:<sessionId>` | Un registro por subagente terminado de esa sesión (unos 450 B con la decisión). Cada sesión escribe solo la suya | 3000 registros por sesión. Al escribir se borran las sesiones cuyo último registro tiene 14 días o más y, si entre todas pasan de 3000, las más viejas |
| `ventanas` | Una entrada por ventana de 5 h: el % más alto visto y cuándo se vio por primera y última vez | Las 300 más recientes |
| `sombra` | Las muestras del modo sombra | Las últimas 500 |

La clave vieja `historial` (de antes de guardar por sesión) se lee como una sesión más y, en la
primera escritura, se mueve a `historial:legado` y se borra.

**La base** es una foto congelada: la genera `node bench/linea-base.mjs` desde los transcripts
de antes del router y la escribe en `router/src/lineaBase.ts`. Claude Code poda los transcripts
a los ~30 días, así que regenerarla más adelante da otra base: hacelo solo a propósito. Cómo se
calcula cada número: el encabezado de `lineaBase.ts` y [bench/README.md](../bench/README.md).

## Historial de decisiones

Sirve para revisar que el router decida bien. Cada registro del historial guarda, además del
modelo y los tiempos, la decisión: la `description` (hasta 100 caracteres), lo elegido
(`opus·xhigh`, o lo pedido si el router no lo tocó), los motivos (`regla review`,
`jev → build-large (0.83)`, `jev (sin umbral) → review (0.55)`, `jev → review (0.98)`, `jev dudó (0.55): queda la regla`, `política +2`, `[pin]: …`) y el modo de la política al lanzarlo
(`fuego`, `sobra` o `normal`). Los registros de antes no tienen esos campos: se muestran con lo
que hay.

**Pestaña Historial** (`/router`, tecla 3): arriba, cuántas decisiones hubo en 7 días, cuántas
reasignadas y por qué modelo corrieron; abajo, las últimas 25 (las de esta sesión, también las que
siguen corriendo, y las guardadas de todas las sesiones), cada una con hora, tarea, description,
`pedido → elegido` y el modo, y los motivos debajo, atenuados. Con menos de 70 columnas no se
muestran los motivos. El resumen cuenta por el momento del spawn.

**`/router historial [días]`** escribe `<home>/.claude/router-historial.md` (el home sale de
`USERPROFILE` o `HOME`), lo sobrescribe en cada export y responde con la ruta. Tiene un
encabezado con la fecha, el rango y el resumen (decisiones, reasignadas, por tipo → modelo, por
modo) y una sección por sesión (id corto y fecha) con una tabla por tarea: hora, tipo,
description, pedido → elegido, modo y motivos, más el ciclo de la tarea y sus rondas de
re-review. El rango es el de la columna de 7 días: una tarea entra o queda afuera entera.

## Tipos y base

review-final y review: opus·xhigh · re-review y build-large: opus·medium · build-small y
research: sonnet·medium · fix: sonnet·high · write: haiku·high · explore: haiku·medium (techo
haiku·high). La escalera tiene tres escalones de Haiku 5.5: haiku·low, haiku·medium y
haiku·high.

Spec: `docs/superpowers/specs/2026-10-06-router-de-subagentes-design.md` y `docs/superpowers/specs/2026-10-09-router-fase-5-design.md`
