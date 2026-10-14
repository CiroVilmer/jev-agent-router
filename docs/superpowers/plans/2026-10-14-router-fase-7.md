# Router de subagentes · fase 7 (talla de las reviews) · plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las reviews grandes vayan a opus·xhigh y las medianas y chicas a opus·medium. La
talla se decide así: alcance en la description, después la talla del build de la misma tarea y,
si no alcanza, el clasificador.

**Architecture:**
- `Tipo` suma `review-large` y `review-small`. `review` queda como familia: la eligen las reglas y
  Jev, y es el tipo de los registros viejos.
- `TIPOS` (los 9 de clasificación) no cambia. `TIPOS_FINALES` (10) arma la tabla, `/config` y
  `/router set`.
- La talla de una review sigue el patrón de la talla de los builds, con otra pregunta de 2
  etiquetas y otro respaldo.

**Tech Stack:** API de mods de Claude Code 2.1.293 o posterior, TS, `claude-code/testing`, Node 24.

**Spec:** `docs/superpowers/specs/2026-10-14-router-fase-7-design.md`.

## Global Constraints

- **Nunca bloquea.** Las reglas del cargador: atoms solo en `hooks/register.tsx`, `$` solo a
  funciones de nivel superior de ese archivo, `.catch` en `agent.spawn`. `model` se reescribe con
  el alias.
- **El núcleo** (`src/`) no toca `$`. `reglas.ts`, `registro.ts`, `resumen.ts` y
  `clasificadores/preguntas.ts` los importa Node desde `bench/`: arriba solo `import type`.
- **El prompt nunca sale de la máquina.**
- **Tests:** `claude plugin test router` y `claude plugin validate --strict router` desde la raíz del
  repo. Timeouts falsos con la máquina cargada: volver a correr.
- **Commits:** en inglés, estilo `feat(router): …`, uno por tarea, y **sin ninguna línea
  `Co-Authored-By`** (el usuario no quiere a Claude como contributor). El repo es público: nada de
  nombres de proyectos privados ni de rutas personales.

---

### Task 1: Tipos, tabla, `/config` y `set`

**Files:** `router/types/index.d.ts`, `router/src/taxonomia.ts`, `router/src/overrides.ts`,
`router/src/registro.ts`, `router/src/clasificadores/preguntas.ts` (solo `DESCRIPCION`),
`router/.claude-plugin/plugin.json`. Tests: `taxonomia.test.ts`, `overrides.test.ts` y
`registro.test.ts`.

**Interfaces (Produces):**
- `Tipo` suma `'review-large' | 'review-small'`.
- `TIPOS` sigue siendo el de hoy (9). `TIPOS_FINALES: readonly Tipo[]` =
  `['review-final', 'review-large', 'review-small', 're-review', 'build-large', 'build-small', 'fix', 'explore', 'research', 'write']`.
- `BASE`: `review-large` 8 (opus·xhigh) y `review-small` 6 (opus·medium). `review` se queda en 8
  por compatibilidad, aunque ya no se usa como tipo final.
- `OPCION_DE_TIPO` suma `'review-large': 'modeloReviewLarge'` y `'review-small': 'modeloReviewSmall'`.
  `review` sigue en `modeloReview`, el legado.
- `tablaDe(options)`: para `review-large` y `review-small`, si la opción específica no es un
  escalón válido y `modeloReview` sí lo es, usa `modeloReview` (legado). El resto no cambia.
- `plugin.json`:
  - dos opciones nuevas, iguales a las otras: `modeloReviewLarge` ("por defecto" = opus·xhigh) y
    `modeloReviewSmall` ("por defecto" = opus·medium);
  - la descripción de `modeloReview` pasa a decir: "Legado: aplica a review-large y review-small
    si no se eligieron por separado".
- `parsearComando('set <tipo> …')` acepta `TIPOS_FINALES` y además `review`. Al aplicarlo,
  `set review X` fija `review-large` y `review-small`. `describirComando` lo dice: "review-large y
  review-small quedan fijados en X para esta sesión."
- `registro.ts`: `REVISIONES` suma `review-large` y `review-small`. `revisadas` (rondas/tarea)
  toma las tareas con algún paso `review`, `review-large` o `review-small`.
- `DESCRIPCION` (preguntas.ts) suma dos textos:
  - `review-large`: "Revisar un bloque, una feature, una fase, una integración o varias tareas, o
    un cambio grande con muchos archivos."
  - `review-small`: "Revisar una tarea o un cambio acotado."

  La pregunta de 9 etiquetas no los usa, pero el tipo los exige.

- [ ] **Step 1: Tests que fallan.**
  - `tablaDe({})` da `review-large` opus·xhigh y `review-small` opus·medium.
  - `tablaDe({ modeloReview: 'opus·high' })` pone opus·high en las dos tallas.
  - `tablaDe({ modeloReview: 'opus·high', modeloReviewSmall: 'sonnet·high' })` da large opus·high
    y small sonnet·high.
  - `TIPOS_FINALES` tiene 10 tipos y no incluye `review`.
  - `parsearComando('set review-small opus·high')` es válido.
  - `aplicarComando(OVERRIDES_INICIAL, set review opus·max)` fija las dos tallas.
  - `metricasDe` cuenta como review a un subagente `review-small` en Opus.
  - Actualizar los tests que listan las opciones de tipo, así incluyen las dos nuevas.
- [ ] **Step 2:** Correr la suite (RED). Implementar. Correr la suite completa y `validate --strict`
  (GREEN).
- [ ] **Step 3: Commit** `feat(router): review-large and review-small types, config options and set`.

### Task 2: La pregunta de talla de review y su respaldo

**Files:** `router/src/clasificadores/preguntas.ts`, `router/src/clasificadores/index.ts` y
`router/src/clasificadores/jev.ts`. Tests: `preguntas.test.ts` y `jev.test.ts`, más uno nuevo de
respaldo en `register.test.ts` si hace falta.

**Interfaces:**
- `TALLAS_REVIEW: readonly Tipo[] = ['review-large', 'review-small']` (en `clasificadores/index.ts`).
- `soloTallas(etiquetas)` pasa a llamarse `esPreguntaDeTalla(etiquetas)`: es true para TALLAS o para
  TALLAS_REVIEW (exactamente esas dos, en cualquier orden). Jev la usa para tirar "jev dudó" (el
  umbral se aplica a las dos preguntas de talla).
- `respaldo`:
  - con TALLAS, `tamanoPorRespaldo(resumen)`;
  - con TALLAS_REVIEW, `'review-small'`;
  - si no, `'build-small'`.
- `preguntas.ts` suma `DESCRIPCION_TALLA_REVIEW` (los dos textos de `DESCRIPCION` del Task 1) y
  `COMO_DECIDIR_TALLA_REVIEW`:
  - "Elegí por el alcance de lo que se revisa, no por palabras sueltas."
  - "review-large: un bloque, una feature, una fase, una integración, una rama o varias tareas; o
    un cambio que nombra muchos archivos."
  - "review-small: una tarea de un plan, un fix o un cambio acotado."

  `preguntaJev` y `textoParaHaiku` eligen el juego de textos según las etiquetas (build, review o
  9 etiquetas). `preguntas.ts` sigue sin imports de valor.

- [ ] Tests:
  - la pregunta de review usa sus textos;
  - Jev con duda en una pregunta de review tira "jev dudó";
  - el respaldo con TALLAS_REVIEW da `review-small`;
  - la pregunta de build y la de 9 etiquetas siguen iguales.
- [ ] RED, implementación y GREEN. **Commit** `feat(router): review size question and fallback`.

### Task 3: La talla en `decidir`

**Files:** `router/src/decidir.ts` y `router/src/tallaReview.ts` (nuevo, puro). Tests:
`decidir.test.ts` y `tallaReview.test.ts`.

**Interfaces:**
- `EntradaDecision` suma `tallaBuildDeTarea?: 'build-large' | 'build-small' | null`, la talla del
  último build de la misma tarea en la sesión.
- `tallaReview.ts`:
  - `export function alcanceDeReview(descripcion: string): string | null`. Devuelve la palabra que
    matcheó, o null. Busca, sin distinguir mayúsculas:
    - `\b(bloque|block|feature|fase|phase|integraci[oó]n|integration|rama|branch|merge)\b`;
    - varias tareas: `\b(tasks?|tareas?)\s+\d+[a-z]?\s*(-|–|a|to|y|and|,)\s*\d+` y `\bT\d+\s*-\s*T?\d+`.
  - `export async function tallaDeReview(e: { descripcion; prompt; tallaBuildDeTarea }, clasificar): Promise<{ tipo: 'review-large' | 'review-small'; motivo: string }>`,
    en este orden:
    1. alcance → `talla por alcance (<palabra>)`;
    2. build de la tarea → `talla del build de <tarea> (<build-…>)`;
    3. clasificador con `TALLAS_REVIEW`. El motivo usa el mismo formato que la talla de los builds:
       `${fuente}${detalle} → ${tipo}${confianza}`.
- En `decidir`: después de decidir el tipo (por regla, por Jev en la familia review o por el
  clasificador sin regla), si el tipo es `'review'`, se llama a `tallaDeReview` y el tipo final es
  su resultado. El motivo se agrega a la lista. Todo lo demás (fijados, base, política,
  permitidos) usa el tipo final.

- [ ] Tests, todos sobre `decidir`:
  - "Review Task 3" con `tallaBuildDeTarea: 'build-large'` da review-large, opus·xhigh;
  - con `'build-small'` da review-small, opus·medium;
  - "Review the feature flags block" da review-large por alcance, aunque el build sea chico;
  - "Review Tasks 3-5" da review-large;
  - sin build y con el clasificador falso, decide el clasificador;
  - sin build y sin clasificador (`respaldo`), da review-small;
  - `review-final` y `re-review` no pasan por la talla;
  - `set review-small opus·high` le gana a la tabla;
  - la política sube review-small: con 🔥 da opus·xhigh.
  - En `tallaReview.test.ts`, casos de `alcanceDeReview`, positivos y negativos ("Review Task 3:
    blocking calls" no matchea "block": verificar los bordes de palabra).
- [ ] RED, implementación y GREEN. **Commit** `feat(router): reviews get a size from scope, the task's build or the classifier`.

### Task 4: Conectar en `register.tsx`

**Files:** `router/hooks/register.tsx`. Tests: `register.test.ts`.

- En `agent.spawn`, antes de `decidir`: calcular `tallaBuildDeTarea` con los subagentes de la
  sesión (`subagentesAtom`). Es el `tipo` del último subagente con la misma tarea
  (`tareaDe(e.description)`) cuyo tipo sea `build-large` o `build-small`. Si no hay tarea o no hay
  build, `null`. Se pasa en la entrada.
- `porReglas`, para los subagentes que el router no tocó, sigue igual.
- [ ] Tests de register:
  - spawn de "Implement Task 3: x" con un prompt que lo haga build-large (se puede fijar la talla
    con un clasificador falso o con el respaldo: más de 5000 caracteres), después "Review Task 3:
    x" → el modelo es `opus` y la decisión guardada es review-large;
  - lo mismo con un build chico → review-small, con esfuerzo medium (mirar el escalón con el hook
    `turn.step`, o el registro, como ya hacen otros tests).
- [ ] RED, implementación y GREEN. **Commit** `feat(router): pass the task's build size to review sizing`.

### Task 5: El banco de talla de reviews

**Files:** `bench/etiquetas-review.json` (nuevo), `bench/review-talla.mjs` (nuevo) y
`bench/README.md`.

- `etiquetas-review.json` tiene la forma `{ id: { talla: 'review-large' | 'review-small', fuente: 'build' | 'manual', seguro: boolean, nota? } }`,
  y cubre los casos de `casos.json` cuya etiqueta en `etiquetas.json` es `review`:
  - **fuente `build`:** si el mismo `proyecto` y `tareaDe(descripcion)` tiene un caso etiquetado
    `build-large` o `build-small`, toma esa talla, con `seguro: true`;
  - **fuente `manual`:** el resto lo etiqueta el implementador mirando la description y el resumen,
    con `seguro: false` y una `nota` de una línea.
- `review-talla.mjs`:
  - mide sobre esas etiquetas: cuántas cubre el alcance y con qué acierto; cuántas cubre el build y
    con qué acierto; y, si hay `JEV_API_KEY`, Jev con la pregunta de 2 etiquetas (`preguntaJev(['review-large','review-small'])`),
    sin umbral y con umbral 0.7 (respaldo `review-small`);
  - simula la política completa (alcance, build, clasificador) contra las etiquetas;
  - imprime una tabla y la guarda en `bench/corridas/<fecha>-review-talla.md`.
- `bench/README.md` suma una sección corta con qué mide, cómo se corre y que las etiquetas manuales
  esperan la validación del usuario.
- [ ] Correr el script con la key (`JEV_API_KEY` está en el entorno) y copiar la tabla al reporte.
- [ ] **Commit** `chore(bench): review size labels and benchmark`.

### Task 6: Documentación

**Files:** `README.md`, `README.es.md`, `docs/how-it-works.md`, `docs/configuration.md`,
`router/README.md` y `CHANGELOG.md` (Unreleased).

- **Tabla de "Task routing" / "Ruteo por tarea":** la fila `review` pasa a ser `review-large`
  (opus·xhigh, "Review the payments feature") y `review-small` (opus·medium, "Review Task 3
  (spec + quality)").
- **Una frase sobre cómo se decide la talla:** alcance, después el build de la misma tarea,
  después el clasificador.
- **`docs/configuration.md`:** las opciones `modeloReviewLarge` y `modeloReviewSmall`, con
  `modeloReview` como legado, y `set review` que fija las dos.
- **`docs/how-it-works.md`:** el paso de la talla de review en el pipeline y en la base table.
- **El párrafo "Quality and speed" del README:** "Reviews get Opus at xhigh effort" pasa a "Large
  reviews get Opus at xhigh effort; task-sized reviews run on Opus at medium effort, which is fast
  and strong."
- **`CHANGELOG.md`, Unreleased → Added:** la talla de las reviews.
- [ ] Commit `docs: review sizes (review-large on xhigh, review-small on medium)`.

### Task 7: Verificación en vivo (la hace el controller)

- `claude -p --plugin-dir <repo>/router` desde un directorio temporal. Un plan de dos tareas: un
  build grande (un prompt de más de 5000 caracteres) con su review, y un build chico con la suya.
  En el historial, review-large en opus·xhigh y review-small en opus·medium, con sus motivos.
- `docs/verificaciones/2026-10-14-router-fase-7.md` y commit `docs: phase 7 verification`.
