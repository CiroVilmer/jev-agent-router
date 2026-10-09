# Router de subagentes · fase 3 (y prueba de fast) · plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Medir si el router sirve, más allá de una sesión. Hay que guardar la historia de los
subagentes y de las ventanas de 5 horas entre sesiones, recalcular la línea base desde los
transcripts y mostrar en la pestaña de métricas **sesión · 7 días · base**, incluyendo el
**% de la ventana de 5 h sin usar al reset**. Al final, una prueba aparte de `/fast` (fase 4).

**Architecture:**
- Dos módulos puros nuevos:
  - `src/historial.ts`: registros compactos de subagentes terminados y métricas de 7 días;
  - `src/ventanas.ts`: ventanas de 5 h observadas, el máximo uso visto y el % sin usar.
- `hooks/register.tsx` escribe en `$.store` (`historial` y `ventanas`), con la misma cola de
  escritura que ya usa `sombra`, y la pestaña de métricas los lee.
- La línea base deja de ser dos números fijos: un script de Node la calcula desde los
  transcripts y genera `src/lineaBase.ts`.

**Tech Stack:** igual que la fase 2. API de mods de Claude Code 2.1.292 o posterior, TS/TSX,
`claude-code/testing` y Node 24 para el script.

**Spec:** `docs/superpowers/specs/2026-10-06-router-de-subagentes-design.md`: "Cómo se mide si
sirve", "Interfaz → Métricas vs tu base" y "Fases 3 y 4".

## Global Constraints

- Todo lo de las fases 1 y 2 sigue valiendo:
  - nunca bloquea;
  - la política solo sube;
  - las reglas del cargador:
    - atoms solo en `register.tsx`;
    - `$` solo a funciones de nivel superior de `register.tsx`;
    - `.catch` en `agent.spawn`;
  - los hooks de test que responden una operación devuelven un resultado.
- **Registrar es secundario.** Si escribir en el store falla, el subagente, el turno y la
  medición siguen igual. Toda escritura va con `.catch` y en cola.
- **Límites del store** (4 MiB en total, compartido con `sombra`, que guarda 500 muestras):
  - `historial`: últimos 3000 registros;
  - `ventanas`: últimas 300 ventanas.
- **El historial no guarda el prompt ni la descripción completa**, solo la tarea normalizada
  (por ejemplo "Tarea 6"), el tipo, el modelo y los tiempos.
- **Las ventanas no saben de qué cuenta son.** El usuario tiene 2 cuentas Max: cada `resetsAt`
  distinto es una ventana distinta, y así quedan separadas solas.
- **Cobertura:** una ventana cerrada cuenta para el "% sin usar" solo si hubo una lectura en los
  60 minutos anteriores a su reset. Si no, el máximo visto subestima el uso. Las ventanas que no
  cumplen se excluyen y se informan como "sin cobertura".
- Textos en castellano rioplatense. Sin dependencias npm.

---

## Mapa de archivos

```
router/src/historial.ts          (Task 2) registros, recorte, 7 días, métricas
router/src/ventanas.ts           (Task 3) observar, cerrar, % sin usar
router/src/lineaBase.ts          (Task 1, generado) LINEA_BASE
router/src/registro.ts           (Task 1) BASE_METRICAS sale y se usa LINEA_BASE
router/hooks/register.tsx        (Task 4) escribe historial y ventanas; el panel los lee
router/src/ui/panel.tsx          (Task 4) tabla sesión · 7 días · base y ventanas
bench/linea-base.mjs             (Task 1) transcripts → src/lineaBase.ts
docs/verificaciones/2026-10-07-router-fase-4-fast.md   (Task 5)
```

---

### Task 1: Línea base calculada desde los transcripts

**Files:**
- Create: `bench/linea-base.mjs`
- Create: `router/src/lineaBase.ts` (generado)
- Modify: `router/src/registro.ts` (sacar `BASE_METRICAS`)
- Modify: `router/src/ui/panel.tsx` (sacar `BASE_METRICAS`)
- Modify: los tests que usan `BASE_METRICAS`

**Interfaces:**
- Produces `router/src/lineaBase.ts`:
```ts
// Generado por bench/linea-base.mjs el <fecha>. No editar a mano.
export const LINEA_BASE = {
  desde: '<AAAA-MM-DD>',
  hasta: '<AAAA-MM-DD>',
  subagentes: <n>,
  reviewsEnOpus: <0..1>,
  rondasPorTarea: <número>,
  minutosPorTarea: <número | null>,
} as const
```

**Cómo se mide cada número:** usá los mismos criterios que `metricasDe`, sobre los Agent/Task
calls de `~/.claude/projects/*/*.jsonl` (los mismos archivos que lee `bench/extraer.mjs`; los
`scratch-workspaces` quedan afuera). Fijá `hasta` en **2026-10-05**, el día antes de que exista
el router, para que la base no se contamine.
- **Tipo:** `clasificarPorReglas`, importado de `../router/src/reglas.ts`. Sin regla o con regla
  `build`, el caso cuenta solo para minutos por tarea.
- **reviewsEnOpus:** sobre review, review-final y re-review, la proporción que corrió en Opus.
  Para saberlo se mira el `model` pedido (`opus`) o, si no hay `model`, el `subagent_type` con
  "opus" en el nombre.
- **rondasPorTarea:** se agrupa por (archivo de sesión, `tareaDe(descripcion)`) y se cuentan los
  re-review en las tareas que tuvieron al menos un review.
- **minutosPorTarea:** dentro de cada sesión, las tareas se ordenan por el primer spawn. La
  duración de una tarea va de su primer spawn al primer spawn de la tarea siguiente. La última
  tarea de cada sesión se descarta, porque no tiene fin observable. Es una aproximación y se
  documenta así en el comentario del archivo generado.

- [ ] **Step 1:** Escribir `bench/linea-base.mjs`. Lee en streaming, igual que `extraer.mjs`,
  calcula los tres números y **escribe `router/src/lineaBase.ts`**. Imprime los números y el
  conteo.
- [ ] **Step 2:** Correrlo con `node bench/linea-base.mjs`. Sanity check:
  - `reviewsEnOpus` tiene que dar cerca de 0.17 y `rondasPorTarea` cerca de 0.49 (eran las
    constantes);
  - si difieren por más de 0.05, explicá por qué en el reporte (por ejemplo, el corte de fecha).
- [ ] **Step 3:** Reemplazar `BASE_METRICAS` por `LINEA_BASE` en `registro.ts`, `panel.tsx` y los
  tests. Los tests del panel que buscan `antes 17%` pasan a usar el valor generado; leelo de
  `LINEA_BASE` dentro del test para no duplicar el número.
- [ ] **Step 4:** Correr `claude plugin test router` y `validate`. Expected: todo pasa.
- [ ] **Step 5:** Commit: `feat(router): línea base calculada desde los transcripts`.

---

### Task 2: Historial de subagentes (puro)

**Files:**
- Create: `router/src/historial.ts`
- Test: `router/tests/historial.test.ts`

**Interfaces:**
```ts
import type { Subagente, Tipo, Modelo } from '../types'
export type Registro = {
  sesion: string            // $.session.id()
  tarea: string | null      // tareaDe(descripcion)
  tipo: Tipo | null
  modelo: Modelo | null     // escalon?.modelo, o el alias si se deduce de pedido ('opus'/'sonnet'/'haiku'), si no null
  pedido: string
  reasignado: boolean
  inicio: number            // ms epoch
  fin: number
}
export const MAX_HISTORIAL = 3000
export function registroDe(s: Subagente, sesion: string): Registro | null   // null si s.fin === null
export function agregarRegistro(lista: readonly Registro[], r: Registro, max?: number): Registro[]
export function historialDe(valor: unknown): Registro[]   // valida lo leído del store, como muestrasDe
export function ultimosDias(lista: readonly Registro[], ahora: number, dias: number): Registro[]  // por fin
export function metricasHistorial(lista: readonly Registro[]): MetricasSesion  // mismo tipo que metricasDe
```
`metricasHistorial` convierte cada registro en un `Subagente` y reutiliza `metricasDe`, sin
duplicar la lógica:
- `tarea` pasa a ser `${sesion}·${tarea}`, para que no se mezclen tareas de sesiones distintas;
- `escalon` es `{ modelo }` si hay modelo;
- `fin` y `inicio` se copian.

- [ ] **Step 1: Tests (fallan).** Cubrir:
  - `registroDe`:
    - copia los campos;
    - devuelve `null` si no terminó;
    - deduce `modelo` desde `pedido: 'claude-opus-5-5'` cuando no hay `escalon`.
  - `agregarRegistro`: recorta a `max`.
  - `historialDe`:
    - `'basura'` da `[]`;
    - descarta elementos sin `sesion`, sin `fin` numérico o sin `inicio`.
  - `ultimosDias`: incluye exactamente los que tienen `fin >= ahora - dias*86400000`.
  - `metricasHistorial`:
    - dos sesiones con la misma "Tarea 1" **no** se juntan (sus rondas se cuentan por separado);
    - reviewsEnOpus, rondas y minutos con números verificados a mano.
- [ ] **Step 2:** Correr y ver que fallan.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Correr y ver que pasan.
- [ ] **Step 5:** Commit: `feat(router): historial de subagentes entre sesiones`.

---

### Task 3: Ventanas de 5 horas (puro)

**Files:**
- Create: `router/src/ventanas.ts`
- Test: `router/tests/ventanas.test.ts`

**Interfaces:**
```ts
import type { LecturaUso } from '../types'
export type Ventana = { resetsAt: string; maxUsado: number; primeraVista: number; ultimaVista: number }
export const MAX_VENTANAS = 300
export const COBERTURA_MS = 60 * 60_000
export function observarVentana(lista: readonly Ventana[], l: LecturaUso, ahora: number, max?: number): Ventana[]
export function ventanasDe(valor: unknown): Ventana[]
export type ResumenVentanas = { cerradas: number; sinCobertura: number; sinUsarPromedio: number | null }
export function resumenVentanas(lista: readonly Ventana[], desde: number, hasta: number): ResumenVentanas
```
- **`observarVentana`:** busca la ventana por `resetsAt`.
  - Si la encuentra, actualiza `maxUsado = max(maxUsado, l.usado)` y `ultimaVista = ahora`.
  - Si no existe, la crea con `primeraVista = ultimaVista = ahora`.
  - Al final recorta a las `max` más recientes, por `resetsAt`.
  - Si `resetsAt` no se puede parsear, devuelve la lista sin cambios.
- **`resumenVentanas`:** toma las ventanas **cerradas** (`Date.parse(resetsAt) <= hasta`) cuyo
  reset cae en `[desde, hasta]`.
  - Con cobertura (`ultimaVista >= reset - COBERTURA_MS`): `sinUsarPromedio` es el promedio de
    `(100 - maxUsado)` en esas ventanas, o `null` si no hay ninguna.
  - Sin cobertura: se cuentan en `sinCobertura`.

- [ ] **Step 1: Tests (fallan).** Cubrir:
  - dos lecturas del mismo `resetsAt` se quedan con el máximo y la última vista;
  - un `resetsAt` distinto crea otra ventana, como pasa con dos cuentas;
  - el recorte a `max`;
  - un `resetsAt` inválido no cambia nada;
  - `resumenVentanas`:
    - cuenta solo las cerradas dentro del rango;
    - excluye las que no tienen cobertura (por ejemplo, la última vista 3 h antes del reset) y
      las cuenta en `sinCobertura`;
    - calcula el promedio con números verificados a mano (por ejemplo, maxUsado 70 y 90 dan
      20% de promedio);
    - devuelve `null` si no hay ninguna.
  - `ventanasDe` valida lo que viene del store.
- [ ] **Step 2:** Correr y ver que fallan.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Correr y ver que pasan.
- [ ] **Step 5:** Commit: `feat(router): ventanas de 5 h y porcentaje sin usar`.

---

### Task 4: Conectar historial y ventanas, y la pestaña de métricas

**Files:**
- Modify: `router/hooks/register.tsx`
- Modify: `router/src/ui/panel.tsx`
- Test: `router/tests/register.test.ts`
- Test: `router/tests/panel.test.tsx`

**Interfaces:**
- `register.tsx`:
  - **Una cola de escritura por clave.** Generalizar la cola de `sombra` con un helper de nivel
    superior `escribirEnCola($, clave, f)` que serialice `get → f → set` por clave. `sombra`
    pasa a usarlo, sin cambiar su comportamiento.
  - **`turn.complete` con `agentId`.** Después de marcar el fin, arma `registroDe(sub, await
    $.session.id())` y lo agrega a `historial`. Esto va en segundo plano o con `.catch`, y nunca
    rompe el hook.
  - **`session.measure`.** Si hay lectura, se suma a `ventanas` con `observarVentana`, también
    con `.catch`.
  - **`ui.render`.** Lee `historial` y `ventanas` (validados con `historialDe` y `ventanasDe`, con
    `.catch` a `[]`) y le pasa al panel:
    - `semana: metricasHistorial(ultimosDias(historial, ahora, 7))`;
    - `ventanas7: resumenVentanas(ventanas, ahora - 7d, ahora)`;
    - `ventanasAntes: resumenVentanas(ventanas, ahora - 14d, ahora - 7d)`.
- `panel.tsx`, pestaña de métricas:
```
SESIÓN · 7 DÍAS · BASE
reviews en Opus    <s>   <7d>   <base>
rondas/tarea       <s>   <7d>   <base>
min/tarea          <s>   <7d>   <base>
5 h sin usar al reset (7 días): <x>% en <n> ventanas · semana anterior <y>% · <k> sin cobertura
```
Si algún valor falta, mostrar "—". Debajo sigue lo existente: la línea de reasignados y la
sección de clasificadores.

- [ ] **Step 1: Tests (fallan).**
  - **register:**
    - después de spawn y `turn.complete` de un subagente, el store `historial` tiene 1 registro
      con la tarea y el tipo correctos;
    - si `store.set` falla, el `turn.complete` igual resuelve;
    - `session.measure` con `five_hour` deja 1 ventana, y una segunda lectura más alta actualiza
      `maxUsado`;
    - la cola: dos `turn.complete` seguidos dejan 2 registros.
  - **panel:**
    - con un historial de 7 días y ventanas en el store, la pestaña muestra las columnas y la
      línea de ventanas con los números esperados;
    - con el store vacío o con basura, muestra "—" y no se rompe.
- [ ] **Step 2:** Correr y ver que fallan.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Correr la suite completa 2 veces y `validate`. Expected: todo pasa.
- [ ] **Step 5:** Commit: `feat(router): métricas de 7 días y ventana sin usar en el panel`.

---

### Task 5: Prueba de `/fast` (fase 4 del spec)

Esta tarea no cambia el producto: termina en un documento con una recomendación.

**Files:** `docs/verificaciones/2026-10-07-router-fase-4-fast.md`

- [ ] **Step 1: Investigar en los tipos** (`router/.claude-plugin/types/claude-code/index.d.ts`)
  y en la doc de Claude Code (code.claude.com, fast mode):
  - ¿un mod puede prender o apagar fast para toda la sesión? Revisar `$.command.run`
    (`'fast'`), `$.config.set` (alguna fila de fast) y los eventos que lo mencionan;
  - ¿fast cambia el modelo de los subagentes o solo el de la sesión principal?
  - ¿cómo se factura en un plan Max?
- [ ] **Step 2: Probar en vivo, headless,** en un proceso con `--plugin-dir` a un mod
  **descartable**, en el scratchpad y no en el repo:
  - que en `session.start` intente prender fast por el mecanismo encontrado;
  - verificar en el debug log o en el transcript si los requests salen en modo fast;
  - **No** dejar fast prendido en la config del usuario: si `$.config.set` persiste, revertirlo y
    confirmarlo.
- [ ] **Step 3: Escribir el documento** con lo que se puede y lo que no, con evidencia, y una
  recomendación: implementar "🔥 + fast" como opción apagada por defecto, o cerrarlo.
- [ ] **Step 4:** Commit: `docs(router): prueba de fast mode (fase 4)`.
