# Router de subagentes · diseño

Fecha: 2026-10-06 · Estado: para revisión · Claude Code objetivo: v2.1.291 o posterior

## Para qué

Un mod de Claude Code que elige el **modelo y el esfuerzo de cada subagente** según el tipo de
tarea, ajustados por cuánto queda de la ventana de 5 horas. Reemplaza la instrucción que hoy se
repite en cada sesión ("usá sonnet 5.5 y opus 5.5 para lo grande") y que el orquestador no
cumple.

### La línea base (transcripts del 2026-09-01 al 2026-10-02, 698 subagentes)

| Tipo | Lo que usó el orquestador |
|---|---|
| review | 173 sonnet, 23 opus, 2 haiku, 12 heredado |
| re-review | 32 haiku, 64 sonnet, 7 opus |
| review-final | 19 sonnet, 34 opus |
| build | 154 sonnet, 19 opus, 8 haiku |
| fix | 22 sonnet, 2 opus, 2 haiku |
| explore | 17 heredan el modelo principal (Opus o Fable), 4 sonnet |

Unos 330 subagentes son de revisión, contra unos 180 de construcción. Hay tareas que llegan a la
ronda 2 o 3 de re-review.

### Cómo se mide si sirve

Se compara contra la línea base:

- el porcentaje de reviews hechos en Opus;
- las rondas de re-review por tarea;
- los minutos por tarea del plan;
- el porcentaje de la ventana de 5 horas sin usar al momento del reset.

## Alcance

**Entra:** el router (reglas, clasificador y política de uso), los overrides, la línea
informativa, el panel con dos pestañas, los clasificadores Haiku y Jev con modo sombra, y el
banco offline.

**Queda afuera, a propósito:**

- **Paralelizar builds automáticamente.** Duplica lo que ya hacen los specs y el orquestador, el
  mod no conoce las dependencias del plan y agrega interrupciones.
- **Multi-lente en los reviews.** Multiplica el costo por 4 y suma rondas de fix. Queda como
  experimento futuro, solo para review-final y apagado por defecto.
- **Tocar el modelo de la sesión principal.** El router solo decide sobre subagentes.
- **Modo fast por subagente.** La API no lo expone. Ver la fase 4.

**Regla de diseño: nunca bloquea.** Sin diálogos ni botones que esperen respuesta. Si algo
falla, el subagente sale con lo que pidió Claude.

## Taxonomía y matriz base

| Tipo | Ejemplos reales | Modelo | Esfuerzo | Techo |
|---|---|---|---|---|
| `review-final` | "Final whole-branch review" | Opus 5.5 | xhigh | — |
| `review` | "Review Task 3 (spec + quality)" | Opus 5.5 | xhigh | — |
| `re-review` | "Scoped re-review of Task 6 fix round 2" | Opus 5.5 | medium | — |
| `build-large` | "Implement Task 11: el compilador" | Opus 5.5 | medium | — |
| `build-small` | "Implement Task 5b: fecha como marcador" | Sonnet 5.5 | medium | — |
| `fix` | "Fix wave: final review findings" | Sonnet 5.5 | high | — |
| `explore` | "Map ingesta path for new models" | Haiku 5.5 | medium | haiku·high |
| `research` | "Research Jev and best practices" | Sonnet 5.5 | medium | — |
| `write` | "Redactar el resumen del bloque 6" | Haiku 5.5 | high | — |

Desde la fase 5 (2026-10-09), `explore` y `write` van a Haiku 5.5 con esfuerzo y la escalera
tiene tres escalones de Haiku. Ver [el diseño de la fase 5](2026-10-09-router-fase-5-design.md).

El único techo es el de `explore`, y existe por **velocidad**, no por ahorro: explorar código
propio no gana nada con un modelo más lento. No hay pisos, porque la política nunca baja de la
base.

Modelos: el router reescribe `model` con el alias (`opus`, `sonnet`, `haiku`), y el alias resuelve
al modelo vigente (hoy `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`). Desde Haiku
5.5, Haiku también recibe esfuerzo.

La escalera que recorre la política:
`haiku·low → haiku·medium → haiku·high → sonnet·low → sonnet·medium → sonnet·high → opus·medium → opus·high → opus·xhigh`.

Todo lo de esta tabla se puede cambiar desde `/config` del mod.

## Cómo se decide un subagente

`decidir(entrada) → { tipo, modelo, esfuerzo, motivos[] }`. Es una función pura.

1. **Override.** Si la descripción trae `[pin]`, se respeta el modelo que pidió Claude. Si hay
   un `/router fijar <tipo> <modelo>·<esfuerzo>`, se usa eso. En los dos casos el pipeline
   termina acá.
2. **Reglas.** `subagentType` decide primero: `Explore` es `explore` y un tipo que contenga
   `revisor-final` es `review-final`. Si no alcanza, se buscan patrones en la descripción, en
   castellano e inglés, en este orden:
   - "final" o "whole-branch" junto a review o revisión → `review-final`
   - re-review o re-revisión → `re-review`
   - review o revisión → `review`
   - fix, arreglo o corrección → `fix`
   - research o investigar → `research`
   - explore, map o relevar → `explore`
   - redactar, write o vault → `write`
   - implement, implementar, task o tarea → build, con tamaño a definir
3. **Clasificador.** Corre solo si el build no tiene tamaño, si ninguna regla matcheó o, desde la
   fase 6 y con clasificador jev, si hay una regla de review por description. Ver abajo.
4. **Política de uso.** Sube escalones de la escalera, sin pasar el techo del
   tipo.
5. **Permitidos.** Si `/router permitir` restringe los modelos, la decisión se acerca al
   permitido más próximo.

Los `fork` no se tocan, porque heredan el modelo por definición.

## Política de uso

**La política solo sube, nunca frena.** El usuario tiene dos cuentas Claude Max: cuando una llega
al límite, cambia a la otra. La idea es sacarle todo el jugo al plan, no cuidarlo. La base ya es
la configuración buena para cada tipo de tarea, y la política solo agrega cuando hay margen que se
va a perder.

Lee `session.measure`:

- **U**: `five_hour.percentUsed`
- **T**: minutos hasta `resetsAt`

| Modo | Condición | Escalones |
|---|---|---|
| 🔥 usar lo que se pierde | T ≤ 60 y U ≤ 70 | +2 |
| ⬆️ sobra | T ≤ 120 y U ≤ 80 | +1 |
| ⚪ normal | el resto, o si no hay datos | 0 |

- No hay modos de ahorro ni bloqueo por el uso semanal. Llegar a un límite no cambia ninguna
  decisión.
- La decisión se toma al lanzar el subagente y no cambia mientras corre.
- Los umbrales se configuran en `/config`.

## Overrides

- **`/router`:** abre el panel. Corre sin turno de Claude.
- **`/router permitir sonnet,opus`:** restringe los modelos de la sesión.
- **`/router fijar <tipo> <modelo>·<esfuerzo>`:** fija un tipo, por encima de la política.
- **`/router off` y `/router on`.**
- **`/router reset`:** borra los overrides de la sesión.
- **`[pin]` en la descripción:** respeta lo que pidió Claude para ese subagente. El mod le agrega
  a Claude una línea en el system prompt (`prompt.section`) que explica la convención.

Los overrides duran lo que dura la sesión. No se guardan.

## Interfaz

**Línea informativa** (`$.ui.status`, debajo del prompt). Aparece solo si el modo no es ⚪ o si el
router cambió algo:

```
router · 🔥 subiendo un nivel hasta el reset (24m) · 3 de 4 subagentes reasignados · /router
```

La línea no repite lo que ya muestran el statusline (modelo, contexto, límites) ni la lista
nativa de agentes (estado, tiempo, tokens).

**Panel** (`/router`). Se abre en un `Pane` anclado al costado y tiene dos pestañas.

- **En curso:**
  - el modo con su motivo en una frase;
  - cada subagente activo con su tipo, lo que pidió Claude, lo que eligió el router y la cadena
    de motivos (regla, clasificador con su confianza, respaldo, política, pin);
  - un bloque por tarea con el ciclo build → review → re-review, las rondas y el tiempo;
  - los overrides activos.
- **Métricas vs tu base:**
  - las cuatro métricas de éxito de la sesión y de los últimos 7 días, contra la línea base;
  - si el modo sombra está prendido, la coincidencia entre Haiku y Jev y la latencia p50/p95 de
    cada uno.

El panel se adapta a `bodyColumns`. Si es angosto, oculta la columna de motivos. Funciona en la
terminal y en la app de escritorio.

## Clasificadores

**Entrada, igual para los dos:** la descripción más un resumen estructural del prompt. El prompt
nunca se manda entero. Ejemplo:

```
Implement Task 11: el compilador · prompt 6.8k chars · 9 archivos · 14 pasos · menciona spec
```

**Salida:** `{ etiqueta, confianza?, ms }`. Las etiquetas son `build-large` y `build-small`, o
la taxonomía completa cuando ninguna regla matcheó.

**Implementaciones:**

- `haiku`: `$.model.classify(texto, etiquetas)` con `claude-haiku-4-5-20251001`.
- `jev`: `$.http.fetch` a la API de TypeSafe, con el modelo fijo `jev-1.13.0`. `JEV_API_KEY` se
  lee de `$.env`. Si la confianza es menor al umbral configurado, se usa la regla de respaldo (desde la fase 5 solo en la talla de los builds; ver fase 5 §3c; desde la fase 6 también en las reviews por description cuando el clasificador es Jev, ver [la fase 6](2026-10-09-router-fase-6-design.md)).
- `reglas`: no clasifica nada; usa la regla de respaldo directamente.

**Tope de 1 segundo.** Si se pasa, o si hay un error, se usa la regla de respaldo: un prompt de
más de 5000 caracteres, o de más de 3000 con 10 archivos o más (`chars > 5000 || (chars > 3000 && archivos >= 10)`, desde la fase 6; ver [la fase 6](2026-10-09-router-fase-6-design.md)), es `build-large`, y si no, `build-small`. Lo que
ninguna regla reconoce va a `build-small`.

**Modo sombra.** `sombra: haiku | jev | off` corre el otro clasificador sin afectar la decisión.
Cada clasificación se guarda en `<plugin data>/sombra.jsonl` con la fecha, la entrada, las
etiquetas y las latencias de los dos.

## Banco offline (`bench/`)

1. **`extraer.mjs`:** recorre `~/.claude/projects/*/*.jsonl` y saca cada Agent call con su
   descripción, su `subagentType`, el modelo que pidió Claude y el resumen estructural. Genera
   `casos.json`. El prompt completo no se guarda.
2. **`pre-etiquetar.mjs`:** Opus propone una etiqueta y una confianza por caso. Los casos dudosos
   (confianza baja o build sin tamaño claro) van a `para-revisar.json`, que revisa el usuario.
3. **`correr.mjs --clasificador haiku|jev`:** calcula la accuracy por etiqueta, la latencia
   p50/p95 y, para Jev, la calibración: la accuracy por tramo de confianza. Los resultados se
   guardan en `bench/corridas/<fecha>-<clasificador>.json`.
4. **`comparar.mjs`:** arma una tabla con las dos corridas. Con eso se elige el clasificador por
   defecto.

## Arquitectura

```
claude-mods/
├── .claude-plugin/marketplace.json     marketplace propio (por ahora, solo `router`)
├── router/
│   ├── .claude-plugin/plugin.json      userConfig: umbrales, matriz, clasificador, sombra
│   ├── hooks/hooks.json                { "modules": ["./register.ts"] }
│   ├── hooks/register.ts               solo conecta los eventos con el núcleo
│   ├── src/taxonomia.ts                tipos, matriz, escalera y techos
│   ├── src/reglas.ts                   (descripción, subagentType) → tipo | build | null
│   ├── src/resumen.ts                  prompt → resumen estructural
│   ├── src/clasificadores/             interfaz, haiku.ts, jev.ts, tope y sombra
│   ├── src/politica.ts                 (U, T, W) → modo; aplicar(escalón, modo, límites)
│   ├── src/overrides.ts                parser de /router y de [pin], estado de la sesión
│   ├── src/decidir.ts                  el pipeline, puro
│   ├── src/registro.ts                 agentId → decisión; agrupación por tarea; métricas
│   ├── src/ui/linea.ts, src/ui/panel.ts
│   └── tests/*.test.ts
└── bench/                              extraer, pre-etiquetar, correr, comparar, corridas/
```

El núcleo (`taxonomia`, `reglas`, `resumen`, `politica`, `overrides` y `decidir`) no toca `$`.
Los clasificadores reciben `$` por parámetro. `register.ts` es el único archivo que conoce los
eventos.

## Flujo de datos

| Evento | Qué hace el mod |
|---|---|
| `session.start` | Registra el comando `/router` y carga la línea base desde `$.store`. |
| `prompt.section` | Agrega la línea que explica `[pin]`. |
| `session.measure` | Guarda U, T y W, recalcula el modo y redibuja. |
| `agent.spawn` | Si es un `fork`, no hace nada. Si no, corre `decidir` y llama a `next({ ...e, model })`. Del resultado guarda `agentId → { decisión, esfuerzo }` en `registro`. |
| `turn.step` con `agentId` registrado | `next({ ...e, effort })` con el esfuerzo de la decisión. |
| `turn.complete` con `agentId` | Marca el subagente como terminado, con su duración, y actualiza la tarea y las métricas. |
| `ui.render` `Pane` | Dibuja la pestaña activa. |
| `session.end` | Guarda los agregados del día en `$.store`. |

## Errores

- Cada hook tiene un `.catch` que llama a `next(e)` sin cambios. Si el router falla, el subagente
  sale con lo que pidió Claude, y el panel muestra el error.
- Si el modelo elegido no está disponible, por ejemplo por un `deny` o un id inválido, se usa el
  modelo que pidió Claude y queda registrado.
- Si no hay `rateLimits` (API key o antes de la primera respuesta), el modo es ⚪.
- Si un clasificador se pasa del tope o falla, se usa el respaldo con el motivo `respaldo`.
- Si falta `JEV_API_KEY`, el clasificador `jev` queda deshabilitado con un aviso único, y se usa
  Haiku.

## Pruebas

Con `claude plugin test`, sin sesión:

- **`reglas`:** en la fase 1, unas 60 descripciones reales etiquetadas a mano, por lo menos 5 por
  tipo y en los dos idiomas. Se exige que todas pasen. En la fase 2 se suman los ~700 casos del
  banco, ya revisados, y se informa la cobertura: el porcentaje que resuelven las reglas sin
  clasificador.
- **`politica`:** una tabla con los bordes de cada umbral, que nunca baje de la base, y el techo de
  `explore`.
- **`decidir`:** la precedencia (pin > fijar > reglas > clasificador > política > permitidos) y
  que un `fork` no se toque.
- **`overrides`:** el parser de `/router`.
- **Clasificadores:** el tope de 1 segundo y el respaldo, con un `$` falso.
- **`register`:** un test de integración con eventos simulados de `agent.spawn` → `turn.step` →
  `turn.complete`.

## Fases

1. **Núcleo:** reglas, política, overrides, `/router`, la línea y el panel con sus dos pestañas,
   y el clasificador en modo `reglas`, con respaldo.
2. **Clasificadores:** Haiku y Jev, el modo sombra y el banco offline. Al final se elige el
   clasificador por defecto.
3. **Métricas:** la línea base guardada y la pestaña de métricas con los datos de 7 días.
4. **Prueba de fast:** ver si un mod puede prender `/fast` para toda la sesión (con
   `$.command.run` o `$.config.set`) y cómo se factura en la suscripción. Si sirve, se agrega un
   modo opcional "🔥 + fast" a la política. Si no, se documenta y se cierra.
   **Cerrada (2026-10-07):** el mecanismo existe (`$.command.run` con `/fast`), pero fast se cobra
   aparte, de los usage credits, y no gasta el margen del plan; "🔥 + fast" no se agrega. Ver
   [la verificación](../../verificaciones/2026-10-07-router-fase-4-fast.md).
5. **Haiku 5.5 y convención:** la matriz con Haiku 5.5 y que los agentes sepan usar el router
   (convención en la tool Agent, aviso, reglas nuevas, umbral de Jev solo para la talla,
   agrupar por `<prefijo>: <nombre>`). Ver [el diseño](2026-10-09-router-fase-5-design.md).
6. **Jev en el centro:** Jev decide las reviews por description cuando es el clasificador
   principal, la pregunta de talla tiene textos propios y el respaldo de talla usa un corte nuevo.
   Ver [el diseño](2026-10-09-router-fase-6-design.md).

## Lo que hay que verificar al implementar

- Que `turn.step` con `agentId` aplique el esfuerzo a un subagente lanzado por el Agent tool. Los
  tipos dicen que sí; hay que confirmarlo con una prueba en vivo en la fase 1.
- Que `agent.spawn` acepte los ids completos de 5.5 en `model`.
- Que el modelo que pidió Claude siga disponible en `e.model` cuando viene explícito.
