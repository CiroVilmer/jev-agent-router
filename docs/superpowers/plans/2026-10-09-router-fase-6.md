# Router de subagentes · fase 6 (Jev en el centro) · plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Jev decida la familia review (cuando la description la nombra) y la talla de los
builds con criterios mejores, y que el respaldo de la talla use el corte nuevo.

**Architecture:**
- `src/clasificadores/preguntas.ts`: dos juegos de textos, uno para la pregunta de talla y otro
  para la de 9 etiquetas.
- `src/resumen.ts`: `tamanoPorRespaldo` con el corte nuevo.
- `src/decidir.ts`: con regla de review por description, consulta al clasificador con las 9
  etiquetas, y Jev seguro puede cambiar el tipo.

**Tech Stack:** API de mods de Claude Code 2.1.293 o posterior, TS, `claude-code/testing`, Node 24
para `bench/`.

**Spec:** `docs/superpowers/specs/2026-10-09-router-fase-6-design.md`.

## Global Constraints

- Todo lo de las fases anteriores sigue valiendo: nunca bloquea; la política solo sube; reglas
  del cargador (atoms solo en `hooks/register.tsx`, `$` solo a funciones de nivel superior de ese
  archivo, `.catch` en `agent.spawn`); `model` con el alias.
- El núcleo (`decidir`, `reglas`, `resumen`, `preguntas`…) no toca `$`.
- `src/resumen.ts`, `src/reglas.ts` y `src/clasificadores/preguntas.ts` los importa Node 24
  directo desde `bench/`: arriba solo `import type`, sin imports de valor de módulos que a su vez
  importen sin extensión, y sin sintaxis que Node no despoje.
- El prompt de un subagente nunca sale de la máquina: a Jev solo van la description y el resumen.
- Tests: `claude plugin test router` y `claude plugin validate router` desde la raíz del worktree
  (`.claude/worktrees/jev-talla`). Timeouts falsos con la máquina cargada: volver a correr.
- Commits en castellano, `feat(router): …`, con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Dos juegos de textos para Jev y Haiku

**Files:**
- Modify: `router/src/clasificadores/preguntas.ts`
- Test: `router/tests/preguntas.test.ts` (nuevo)

**Interfaces:**
- Produces: `preguntaJev(etiquetas)` y `textoParaHaiku(tarea, etiquetas)` usan los textos de talla
  cuando `etiquetas` son exactamente `build-large` y `build-small`; si no, los de hoy.
  `DESCRIPCION` y `COMO_DECIDIR` siguen exportados con los textos de hoy; se suman
  `DESCRIPCION_TALLA` y `COMO_DECIDIR_TALLA`.

- [ ] **Step 1: Tests que fallan** (`router/tests/preguntas.test.ts`):

```ts
import { describe, expect, test } from 'claude-code/testing'
import { COMO_DECIDIR, COMO_DECIDIR_TALLA, DESCRIPCION, DESCRIPCION_TALLA, preguntaJev, textoParaHaiku } from '../src/clasificadores/preguntas'

const TALLAS = ['build-large', 'build-small'] as const
const TIPOS = ['review-final', 'review', 're-review', 'build-large', 'build-small', 'fix', 'explore', 'research', 'write'] as const

describe('preguntas', () => {
  test('la pregunta de talla usa los criterios de largo y archivos', () => {
    const p = preguntaJev(TALLAS)
    expect(p.criteria['build-large']).toBe(DESCRIPCION_TALLA['build-large'])
    expect(p.criteria['build-small']).toBe(DESCRIPCION_TALLA['build-small'])
    expect(p.instructions.como_decidir).toEqual(COMO_DECIDIR_TALLA)
    expect(DESCRIPCION_TALLA['build-large'].includes('10 archivos o más')).toBe(true)
    expect(DESCRIPCION_TALLA['build-small'].includes('hasta ~3k caracteres')).toBe(true)
  })

  test('el orden de las etiquetas no importa para reconocer la talla', () => {
    expect(preguntaJev(['build-small', 'build-large']).criteria['build-large']).toBe(DESCRIPCION_TALLA['build-large'])
  })

  test('la pregunta de 9 etiquetas no cambia', () => {
    const p = preguntaJev(TIPOS)
    expect(p.criteria['build-large']).toBe(DESCRIPCION['build-large'])
    expect(p.instructions.como_decidir).toEqual(COMO_DECIDIR)
  })

  test('Haiku usa los mismos dos juegos', () => {
    expect(textoParaHaiku('t', TALLAS).includes(DESCRIPCION_TALLA['build-large'])).toBe(true)
    expect(textoParaHaiku('t', TIPOS).includes(DESCRIPCION['build-large'])).toBe(true)
    expect(textoParaHaiku('t', TIPOS).includes(DESCRIPCION_TALLA['build-large'])).toBe(false)
  })
})
```

- [ ] **Step 2:** Correr la suite. Expected: falla (no existen `DESCRIPCION_TALLA` ni
  `COMO_DECIDIR_TALLA`).

- [ ] **Step 3: Implementación** en `preguntas.ts`, sin tocar `DESCRIPCION` ni `COMO_DECIDIR`:

```ts
/**
 * Solo para la pregunta de talla. Los cortes salen del banco (2026-10-09): en las etiquetas
 * seguras, más de ~5k caracteres, o ~3k a ~5k con 10 archivos o más, es grande en el 99%. En la
 * pregunta de 9 etiquetas empeoran las reviews (Jev manda reviews largas a build-large): ahí no.
 */
export const DESCRIPCION_TALLA: Record<'build-large' | 'build-small', string> = {
  'build-large': 'Implementar algo grande: integración entre varias piezas, diseño o mucha lógica nueva. Por el resumen: un prompt de más de ~5k caracteres, o uno de ~3k a ~5k que nombra 10 archivos o más.',
  'build-small': 'Implementar algo chico o mediano y acotado: un cambio mecánico o una pieza bien delimitada. Por el resumen: un prompt de hasta ~3k caracteres, o uno de ~3k a ~5k que nombra menos de 10 archivos.',
}

export const COMO_DECIDIR_TALLA: readonly string[] = [
  'Elegí por lo que el subagente tiene que hacer, no por palabras sueltas.',
  'Para separar un build grande de uno chico, mirá primero el largo del prompt y después los archivos: más de ~5k caracteres es grande; hasta ~3k es chico; entre ~3k y ~5k decide el conteo de archivos (10 o más es grande, menos de 10 es chico).',
  'El conteo de archivos del resumen cuenta los archivos que el prompt nombra (spec, plan, contexto), no los que la tarea toca: solo alcanza para decidir la talla en el tramo de ~3k a ~5k caracteres.',
  'Los pasos y si menciona un spec no separan bien la talla: casi todos los builds de un plan mencionan el spec.',
]

// Sin importar valores de otros módulos: bench/ importa este archivo directo desde Node.
const esTalla = (etiquetas: readonly Tipo[]) =>
  etiquetas.length === 2 && etiquetas.includes('build-large') && etiquetas.includes('build-small')
const descripcion = (etiquetas: readonly Tipo[], t: Tipo) =>
  esTalla(etiquetas) ? DESCRIPCION_TALLA[t as 'build-large' | 'build-small'] : DESCRIPCION[t]
const comoDecidir = (etiquetas: readonly Tipo[]) => (esTalla(etiquetas) ? COMO_DECIDIR_TALLA : COMO_DECIDIR)
```

  Y en `textoParaHaiku` y `preguntaJev`, usar `descripcion(etiquetas, t)` en lugar de
  `DESCRIPCION[t]` y `comoDecidir(etiquetas)` en lugar de `COMO_DECIDIR`.

- [ ] **Step 4:** Correr la suite completa y `validate`. Expected: pasa. Verificar además que
  Node lo importa: `node --input-type=module -e "import { preguntaJev } from './router/src/clasificadores/preguntas.ts'; console.log(Object.keys(preguntaJev(['build-large','build-small']).criteria))"`.

- [ ] **Step 5: Commit** `feat(router): la pregunta de talla le explica a Jev el corte de largo y archivos`.

### Task 2: El respaldo de la talla con el corte nuevo

**Files:**
- Modify: `router/src/resumen.ts` (`tamanoPorRespaldo`)
- Modify: `bench/comparar.mjs` (la variante "actual" del respaldo y su texto), `bench/analizar-jev-todos.mjs` (`respaldoTalla`), `bench/README.md` (donde dice `chars > 5000` o `archivos > 6`), `router/README.md` si lo menciona.
- Test: `router/tests/resumen.test.ts`

**Interfaces:**
- Produces: `tamanoPorRespaldo(r)` → `'build-large'` si `r.chars > 5000 || (r.chars > 3000 && r.archivos >= 10)`, si no `'build-small'`.

- [ ] **Step 1: Tests que fallan.** Reemplazar los tres `expect` de `tamanoPorRespaldo` en
  `resumen.test.ts` por:

```ts
    const r = (chars: number, archivos: number) => ({ chars, archivos, pasos: 0, mencionaSpec: true })
    expect(tamanoPorRespaldo(r(5001, 0))).toBe('build-large')
    expect(tamanoPorRespaldo(r(5000, 9))).toBe('build-small')
    expect(tamanoPorRespaldo(r(3001, 10))).toBe('build-large')
    expect(tamanoPorRespaldo(r(3000, 30))).toBe('build-small')
    expect(tamanoPorRespaldo(r(2500, 7))).toBe('build-small') // antes build-large: archivos > 6
```

- [ ] **Step 2:** Correr la suite. Expected: falla.

- [ ] **Step 3: Implementación:**

```ts
/**
 * Más de ~5k caracteres, o ~3k a ~5k nombrando 10 archivos o más. Antes `archivos > 6` mandaba a
 * Opus 56 de 100 builds chicos del banco (los prompts de plan nombran spec, plan y contexto).
 */
export function tamanoPorRespaldo(r: Resumen): 'build-large' | 'build-small' {
  return r.chars > 5000 || (r.chars > 3000 && r.archivos >= 10) ? 'build-large' : 'build-small'
}
```

- [ ] **Step 4:** Correr la suite. Arreglar solo los tests que dependan del corte viejo
  (buscar prompts de prueba con más de 6 archivos y menos de 5000 caracteres que esperaban
  `build-large`), sin cambiar lo que prueban. En `bench/comparar.mjs` la variante del respaldo de
  producción pasa a ser el corte nuevo; dejar también la vieja como fila de comparación
  ("anterior: chars > 5000 o archivos > 6"). Actualizar `bench/analizar-jev-todos.mjs` y los README.

- [ ] **Step 5:** Correr `node bench/comparar.mjs bench/corridas/2026-10-07-1032-banco.json` y copiar
  al reporte las variantes del respaldo. Expected: el corte nuevo, ~96% en los builds ganables.

- [ ] **Step 6: Commit** `feat(router): el respaldo de la talla usa el corte de largo y archivos`.

### Task 3: Jev decide la familia review

**Files:**
- Modify: `router/src/decidir.ts`
- Modify: `router/README.md` (cómo decide y motivos), `bench/analizar-jev-todos.mjs` (fila de la política)
- Test: `router/tests/decidir.test.ts` y los de `router/tests/register.test.ts` que miren motivos de reviews

**Interfaces:**
- Consumes: `Clasificacion` (`fuente`, `tipo`, `confianza`, `detalle`). `crearJev` con las 9
  etiquetas devuelve `detalle: 'sin umbral'` si la confianza < `jevUmbral`; los envoltorios de
  tope/error devuelven `fuente: 'respaldo'` con `detalle`; `respaldo` solo no trae `detalle`.
- Produces: en `decidir`, con regla de **description** de `review-final`, `review` o `re-review`:
  - `fuente: 'jev'` sin `detalle` → el tipo es el de Jev; motivo `jev → <tipo> (<conf 2 dec>)`.
  - `fuente: 'jev'` con `detalle: 'sin umbral'` → queda la regla; motivo `jev dudó (<conf>): queda la regla`.
  - `fuente: 'respaldo'` con `detalle` → queda la regla; motivo `respaldo (<detalle>): queda la regla`.
  - `fuente: 'respaldo'` sin `detalle` → queda la regla; sin motivo.
  - `fuente: 'haiku'` → queda la regla; motivo `haiku → <tipo>: queda la regla`.
  - Reglas de `subagentType` (`regla` empieza con `subagentType`): no se consulta.

- [ ] **Step 1: Tests que fallan** en `decidir.test.ts`, con clasificadores falsos:

```ts
const jevDice = (tipo: string, confianza: number, detalle?: string): Clasificador => async () =>
  ({ tipo: tipo as any, confianza, ms: 1, fuente: 'jev', ...(detalle ? { detalle } : {}) })

describe('Jev decide la familia review', () => {
  test('Jev seguro confirma la review', async () => {
    const d = await decidir(entrada(), ctx({ clasificar: jevDice('review', 0.98) }))
    expect(d).toMatchObject({ tocar: true, tipo: 'review' })
    expect(d.motivos).toEqual(['regla review', 'jev → review (0.98)'])
  })

  test('Jev seguro cambia el tipo', async () => {
    const d = await decidir(entrada(), ctx({ clasificar: jevDice('build-large', 0.93) }))
    expect(d).toMatchObject({ tocar: true, tipo: 'build-large', escalon: { modelo: 'opus', esfuerzo: 'medium' } })
    expect(d.motivos).toEqual(['regla review', 'jev → build-large (0.93)'])
  })

  test('Jev con duda: queda la regla', async () => {
    const d = await decidir(entrada(), ctx({ clasificar: jevDice('build-small', 0.55, 'sin umbral') }))
    expect(d).toMatchObject({ tipo: 'review' })
    expect(d.motivos).toEqual(['regla review', 'jev dudó (0.55): queda la regla'])
  })

  test('respaldo por tope: queda la regla y lo dice', async () => {
    const tope: Clasificador = async () => ({ tipo: 'build-small', ms: 1000, fuente: 'respaldo', detalle: 'tardó más de 1000 ms' })
    const d = await decidir(entrada({ descripcion: 'Re-review Task 2 fix round 1' }), ctx({ clasificar: tope }))
    expect(d).toMatchObject({ tipo: 're-review' })
    expect(d.motivos).toEqual(['regla re-review', 'respaldo (tardó más de 1000 ms): queda la regla'])
  })

  test('clasificador reglas (respaldo sin detalle): queda la regla, sin motivo extra', async () => {
    const d = await decidir(entrada(), ctx())
    expect(d.motivos).toEqual(['regla review'])
  })

  test('haiku no cambia la regla', async () => {
    const haiku: Clasificador = async () => ({ tipo: 'fix', ms: 600, fuente: 'haiku' })
    const d = await decidir(entrada(), ctx({ clasificar: haiku }))
    expect(d).toMatchObject({ tipo: 'review' })
    expect(d.motivos).toEqual(['regla review', 'haiku → fix: queda la regla'])
  })

  test('regla de subagentType: no consulta', async () => {
    let llamado = false
    const espia: Clasificador = async () => { llamado = true; return { tipo: 'fix', confianza: 1, ms: 1, fuente: 'jev' } }
    const d = await decidir(entrada({ descripcion: 'Revisión final', subagentType: 'revisor-final-opus-xhigh' }), ctx({ clasificar: espia }))
    expect(d).toMatchObject({ tipo: 'review-final' })
    expect(llamado).toBe(false)
  })

  test('fix, explore y write no consultan', async () => {
    let llamadas = 0
    const espia: Clasificador = async () => { llamadas++; return { tipo: 'review', confianza: 1, ms: 1, fuente: 'jev' } }
    for (const descripcion of ['Fix Task 3: hallazgos', 'Explore router src', 'Write the vault note'])
      await decidir(entrada({ descripcion }), ctx({ clasificar: espia }))
    expect(llamadas).toBe(0)
  })

  test('la política se aplica sobre el tipo que decidió Jev', async () => {
    const d = await decidir(entrada(), ctx({ clasificar: jevDice('build-small', 0.95), politica: FUEGO }))
    expect(d).toMatchObject({ tipo: 'build-small', escalon: { modelo: 'opus', esfuerzo: 'medium' } })
  })
})
```

  (build-small base sonnet·medium + 2 = opus·medium.)

- [ ] **Step 2:** Correr la suite. Expected: fallan los nuevos.

- [ ] **Step 3: Implementación** en `decidir.ts`:

```ts
const REVIEWS: readonly Tipo[] = ['review-final', 'review', 're-review']

/** Lo que pasó al consultar a Jev por una review: el tipo final y, si corresponde, el motivo. */
export function revisarConJev(regla: Tipo, cl: Clasificacion): { tipo: Tipo; motivo: string | null } {
  const conf = cl.confianza === undefined ? '' : cl.confianza.toFixed(2)
  if (cl.fuente === 'jev' && cl.detalle === undefined) return { tipo: cl.tipo, motivo: `jev → ${cl.tipo} (${conf})` }
  if (cl.fuente === 'jev') return { tipo: regla, motivo: `jev dudó (${conf}): queda la regla` }
  if (cl.fuente === 'haiku') return { tipo: regla, motivo: `haiku → ${cl.tipo}: queda la regla` }
  return { tipo: regla, motivo: cl.detalle ? `respaldo (${cl.detalle}): queda la regla` : null }
}
```

  Y en `decidir`, la rama `if (regla && regla.tipo !== 'build')` pasa a:

```ts
  if (regla && regla.tipo !== 'build') {
    tipo = regla.tipo
    motivos.push(`regla ${regla.regla}`)
    // Jev decide la familia review (le gana a las reglas en el banco): si está seguro, manda él.
    if (REVIEWS.includes(regla.tipo) && !regla.regla.startsWith('subagentType')) {
      const cl = await c.clasificar({ descripcion: e.descripcion, resumen: resumir(e.prompt), etiquetas: TIPOS })
      const r = revisarConJev(regla.tipo, cl)
      tipo = r.tipo
      if (r.motivo) motivos.push(r.motivo)
    }
  }
```

  (importar `Clasificacion` como tipo desde `./clasificadores`).

- [ ] **Step 4:** Correr la suite. Actualizar los tests existentes de `decidir.test.ts` y
  `register.test.ts` que fallen **solo** porque una review ahora consulta al clasificador (por
  ejemplo, un test de register con `clasificador: 'jev'` y un fetch falso que ahora recibe una
  llamada más, o motivos de una review con Jev). No cambiar lo que prueban.

- [ ] **Step 5: README** (`router/README.md`): en Clasificadores y donde se explica cómo decide,
  sumar que con una regla de review por description consulta a Jev con las 9 etiquetas y que Jev
  seguro (≥ `jevUmbral`) decide; los ejemplos de motivos `jev → review (0.98)` y
  `jev dudó (0.55): queda la regla`. En `bench/analizar-jev-todos.mjs`, una fila
  "fase 6: Jev decide reviews + talla nueva" que simule esta política (regla de review por
  description → Jev con confianza ≥ 0.7, si no la regla; builds → corrida de talla con umbral 0.7
  y respaldo nuevo; el resto como hoy). Correrlo con
  `node bench/analizar-jev-todos.mjs bench/corridas/2026-10-09-1339-jev-todos.json` y copiar la
  fila al reporte (para la talla, que lea `bench/corridas/2026-10-09-1347-jev-talla-nueva.json`).
  Expected: total ~90,5%, reviews ~99,2%, builds ~95,4%.

- [ ] **Step 6:** `claude plugin test router` y `validate`. Expected: pasa.

- [ ] **Step 7: Commit** `feat(router): Jev decide la familia review`.

### Task 4: Verificación en vivo y documento (la hace el controller)

- [ ] Con `claude -p --plugin-dir <worktree>/router` desde un directorio temporal: un prompt que
  lance en paralelo una review ("revisá sin editar que router/src/reglas.ts exporta
  clasificarPorReglas") y un build cuyo prompt tenga ~4k caracteres y nombre 10+ archivos. En el
  store (`historial:<session>`), que la review lleve el motivo de Jev y el build salga
  `build-large` con `jev → build-large`.
- [ ] `docs/verificaciones/2026-10-09-router-fase-6.md` y commit.
