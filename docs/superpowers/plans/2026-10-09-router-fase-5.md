# Router de subagentes · fase 5 (Haiku 5.5 y convención) · plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `explore` y `write` corran en Haiku 5.5 con esfuerzo, y que el orquestador aprenda a
nombrar los subagentes para que el router los clasifique bien (y que, cuando no lo haga, el
router se equivoque menos).

**Architecture:**
- `src/taxonomia.ts`: escalera de 9 escalones con tres de Haiku; nueva matriz base y techo.
- `src/reglas.ts`: reglas nuevas (`verif`, `validar`, `audit`, `check` → review; `write` →
  write) y, si el banco lo justifica, reglas sobre la primera línea del prompt.
- `src/clasificadores/jev.ts`: el umbral solo se aplica a la talla de los builds.
- `src/registro.ts`: `tareaDe` agrupa también por `<prefijo>: <nombre>`.
- `src/convencion.ts` (nuevo): el texto que se suma a la tool Agent y el aviso a Claude.
- `hooks/register.tsx`: hook `tool.describe` sobre Agent, el hook `tool.call` de Agent sirve a
  `avisarAClaude` y a `ensenarConvencion`, y la sección del system prompt se achica.

**Tech Stack:** API de mods de Claude Code 2.1.293 o posterior, TS/TSX, `claude-code/testing`,
Node 24 para los scripts de `bench/`.

**Spec:** `docs/superpowers/specs/2026-10-09-router-fase-5-design.md` (y el diseño base,
`docs/superpowers/specs/2026-10-06-router-de-subagentes-design.md`).

## Global Constraints

- Todo lo de las fases 1 a 3 sigue valiendo:
  - **nunca bloquea:** cualquier hook que falla deja pasar lo que pidió Claude o lo que calculó
    el host (`.catch(($, e, next) => next(e))`);
  - la política solo sube y nunca pasa el techo del tipo;
  - reglas del cargador de mods: los atoms se declaran solo en `hooks/register.tsx`; `$` se pasa
    solo a funciones de nivel superior de ese archivo; `agent.spawn` lleva `.catch`;
  - los hooks de test que responden una operación devuelven un resultado;
  - `model` se reescribe con el alias (`opus`, `sonnet`, `haiku`), nunca con el id.
- El núcleo (`taxonomia`, `reglas`, `resumen`, `politica`, `overrides`, `decidir`, `registro`,
  `convencion`) no toca `$`.
- `src/registro.ts` y `src/reglas.ts` los importa Node directo desde `bench/`: arriba, solo
  `import type`, y nada de sintaxis que Node 24 no despoje (enums, namespaces, parameter
  properties).
- El prompt de un subagente nunca sale de la máquina ni se guarda: ni a Jev, ni al store, ni a
  `bench/`.
- Tests: `claude plugin test router` desde la raíz del worktree. Con la máquina cargada da
  timeouts falsos de 5 s: volver a correr, no subir los timeouts.
- Los reviewers no hacen `git checkout` ni cambian de rama.
- Mensajes de commit en castellano, estilo `feat(router): …`, con la línea
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Escalera y matriz con Haiku 5.5

**Files:**
- Modify: `router/types/index.d.ts` (comentario de `Escalon`)
- Modify: `router/src/taxonomia.ts`
- Modify: `router/src/overrides.ts` (el ejemplo del mensaje de escalón no válido)
- Modify: `router/README.md` ("Tipos y base")
- Test: `router/tests/taxonomia.test.ts` y los tests que dependan de los índices o del escalón
  de `explore`/`write` (buscar con `grep -rn "haiku\|sonnet·low\|BASE\[" router/tests`)

**Interfaces:**
- Produces: `ESCALERA` de 9 escalones, todos con `esfuerzo`; `BASE`, `TECHO`, `TOPE = 8`;
  `parseEscalon('haiku')` → `{ modelo: 'haiku', esfuerzo: 'medium' }`;
  `parseEscalon('haiku·high')` → `{ modelo: 'haiku', esfuerzo: 'high' }`. `formatEscalon` no
  cambia.

- [ ] **Step 1: Tests que fallan.** En `router/tests/taxonomia.test.ts`, reemplazar los cuatro
  tests por:

```ts
import { describe, expect, test } from 'claude-code/testing'
import { BASE, ESCALERA, formatEscalon, parseEscalon, TECHO, TIPOS, TOPE } from '../src/taxonomia'

describe('taxonomia', () => {
  test('la escalera va de haiku·low a opus·xhigh, con tres escalones de Haiku', () => {
    expect(ESCALERA.map(formatEscalon)).toEqual([
      'haiku·low', 'haiku·medium', 'haiku·high',
      'sonnet·low', 'sonnet·medium', 'sonnet·high',
      'opus·medium', 'opus·high', 'opus·xhigh',
    ])
    expect(TOPE).toBe(8)
    expect(ESCALERA.every(e => e.esfuerzo !== undefined)).toBe(true)
  })

  test('la matriz base coincide con el spec de la fase 5', () => {
    const base = Object.fromEntries(TIPOS.map(t => [t, formatEscalon(ESCALERA[BASE[t]]!)]))
    expect(base).toEqual({
      'review-final': 'opus·xhigh',
      review: 'opus·xhigh',
      're-review': 'opus·medium',
      'build-large': 'opus·medium',
      'build-small': 'sonnet·medium',
      fix: 'sonnet·high',
      explore: 'haiku·medium',
      research: 'sonnet·medium',
      write: 'haiku·high',
    })
    expect(formatEscalon(ESCALERA[TECHO.explore!]!)).toBe('haiku·high')
  })

  test('parseEscalon acepta ·, punto y espacio, y Haiku con esfuerzo', () => {
    expect(parseEscalon('opus·xhigh')).toEqual({ modelo: 'opus', esfuerzo: 'xhigh' })
    expect(parseEscalon('sonnet.medium')).toEqual({ modelo: 'sonnet', esfuerzo: 'medium' })
    expect(parseEscalon('Opus max')).toEqual({ modelo: 'opus', esfuerzo: 'max' })
    expect(parseEscalon('haiku·high')).toEqual({ modelo: 'haiku', esfuerzo: 'high' })
    expect(parseEscalon('haiku low')).toEqual({ modelo: 'haiku', esfuerzo: 'low' })
  })

  test('parseEscalon lee haiku a secas como haiku·medium', () => {
    expect(parseEscalon('haiku')).toEqual({ modelo: 'haiku', esfuerzo: 'medium' })
  })

  test('parseEscalon rechaza lo inválido', () => {
    expect(parseEscalon('gpt·high')).toBe(null)
    expect(parseEscalon('opus')).toBe(null)
    expect(parseEscalon('haiku·turbo')).toBe(null)
    expect(parseEscalon('sonnet·turbo')).toBe(null)
    expect(parseEscalon('')).toBe(null)
  })

  test('un escalón guardado sin esfuerzo se sigue mostrando', () => {
    expect(formatEscalon({ modelo: 'haiku' })).toBe('haiku')
  })
})
```

- [ ] **Step 2:** Correr `claude plugin test router`. Expected: fallan los tests de taxonomía.

- [ ] **Step 3: Implementación.** En `router/src/taxonomia.ts`:

```ts
export const ESCALERA: readonly Escalon[] = [
  { modelo: 'haiku', esfuerzo: 'low' },
  { modelo: 'haiku', esfuerzo: 'medium' },
  { modelo: 'haiku', esfuerzo: 'high' },
  { modelo: 'sonnet', esfuerzo: 'low' },
  { modelo: 'sonnet', esfuerzo: 'medium' },
  { modelo: 'sonnet', esfuerzo: 'high' },
  { modelo: 'opus', esfuerzo: 'medium' },
  { modelo: 'opus', esfuerzo: 'high' },
  { modelo: 'opus', esfuerzo: 'xhigh' },
]

/** Índice en ESCALERA de la configuración base de cada tipo. */
export const BASE: Record<Tipo, number> = {
  'review-final': 8,
  review: 8,
  're-review': 6,
  'build-large': 6,
  'build-small': 4,
  fix: 5,
  // Haiku 5.5: en low saltea búsquedas y checks; medium para explorar, high para redactar.
  explore: 1,
  research: 4,
  write: 2,
}

/** Techos por velocidad, no por ahorro: explorar no gana nada con un modelo más lento. */
export const TECHO: Partial<Record<Tipo, number>> = { explore: 2 }
```

  Y en `parseEscalon`, reemplazar la línea de Haiku por:

```ts
  // Haiku 5.5 admite esfuerzo; "haiku" a secas (como se escribía antes) es haiku·medium.
  if (modelo === 'haiku' && f === undefined) return { modelo, esfuerzo: 'medium' }
```

  (la validación de `f` que sigue ya cubre `haiku·<esfuerzo>`). En `router/types/index.d.ts`, el
  comentario de `Escalon` pasa a:
  `/** Un punto de la escalera: modelo y esfuerzo. Solo falta el esfuerzo en escalones de Haiku guardados antes de la fase 5. */`.
  En `router/src/overrides.ts`, el ejemplo del mensaje `Escalón no válido` pasa de `haiku` a
  `haiku·high`.

- [ ] **Step 4:** Correr la suite completa. Actualizar los tests que fallen **solo** porque
  cambió la matriz (por ejemplo, un explore que ahora sale `haiku·medium` en vez de `haiku`, un
  write que sale `haiku·high`, un índice de `ESCALERA`), sin tocar lo que prueban. Si alguno
  falla por otra razón, parar y reportarlo.
  Casos a revisar a mano en `decidir.test.ts`/`politica.test.ts`: explore con 🔥 queda en
  `haiku·high` (techo); write con ⬆️ sale `sonnet·low`; con `/router permitir sonnet,opus`,
  explore y write salen `sonnet·low`.

- [ ] **Step 5:** En `router/README.md`, "Tipos y base" pasa a:
  `review-final y review: opus·xhigh · re-review y build-large: opus·medium · build-small y
  research: sonnet·medium · fix: sonnet·high · write: haiku·high · explore: haiku·medium (techo
  haiku·high). La escalera tiene tres escalones de Haiku 5.5: haiku·low, haiku·medium y
  haiku·high.`

- [ ] **Step 6:** Correr `claude plugin test router` y `claude plugin validate router`. Expected:
  todo pasa.

- [ ] **Step 7: Commit** `feat(router): escalera con Haiku 5.5 (explore y write en Haiku con esfuerzo)`.

### Task 2: Reglas nuevas para review y write

**Files:**
- Modify: `router/src/reglas.ts`
- Test: `router/tests/reglas.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `clasificarPorReglas` reconoce `verif…`, `valid…`, `audit…`, `check` al comienzo
  como `review` (regla `review`) y `write` al comienzo como `write` (regla `write`).

- [ ] **Step 1: Tests que fallan.** Agregar a `CASOS` en `router/tests/reglas.test.ts`:

```ts
  ['verif: kubernetes', 'general-purpose', 'review'],
  ['Verify Task 3: kubernetes', 'general-purpose', 'review'],
  ['Verificar el formulario de backup', 'general-purpose', 'review'],
  ['Verificación de la KB de nube-publica', 'general-purpose', 'review'],
  ['Validar la KB de nube-publica', 'general-purpose', 'review'],
  ['Validate Task 2 output', 'general-purpose', 'review'],
  ['Audit the store writes', 'general-purpose', 'review'],
  ['Auditar los permisos', 'general-purpose', 'review'],
  ['Check Task 2 against the spec', 'general-purpose', 'review'],
  ['Write Task 4: bitácora', 'general-purpose', 'write'],
  ['Write the release notes', 'general-purpose', 'write'],
  ['v2: kubernetes', 'general-purpose', null],
  ['Re-verify Task 3', 'general-purpose', null],
```

  (`Re-verify` queda sin regla a propósito: no se agrega una variante de re-review en esta fase;
  si la tabla de `CASOS` exige otra forma de expresar "sin regla", seguir la que ya usa.)

- [ ] **Step 2:** Correr `claude plugin test router`. Expected: fallan los casos nuevos.

- [ ] **Step 3: Implementación.** En `REGLAS` de `router/src/reglas.ts`, reemplazar las líneas de
  `review` y `write` por:

```ts
  { regla: 'review', patron: /\b(review|revis)|^(verif\w*|valid\w*|audit\w*|check)\b/i, tipo: 'review' },
```

```ts
  { regla: 'write', patron: /^(write|redactar|bitácora|bitacora|documentar|escribir)\b|\bvault\b/i, tipo: 'write' },
```

  (sin cambiar el orden de `REGLAS`). Ojo: `\b` después de `verif\w*` con `\w` de JS no incluye
  letras con tilde; `Verificación` matchea igual porque `verif` está al comienzo y `\w*` puede
  ser vacío.

- [ ] **Step 4:** Correr la suite. Expected: pasa.

- [ ] **Step 5: Que no empeore el banco.** Desde la raíz del worktree:

```bash
node --input-type=module -e "
import fs from 'node:fs'
import { clasificarPorReglas } from './router/src/reglas.ts'
const { casos } = JSON.parse(fs.readFileSync('bench/casos.json', 'utf8'))
const et = JSON.parse(fs.readFileSync('bench/etiquetas.json', 'utf8'))
let resuelve = 0, acierta = 0, cambian = []
for (const c of casos) {
  const r = clasificarPorReglas(c.descripcion, c.subagentType)
  if (r?.tipo !== c.regla) cambian.push(c.descripcion + ' → ' + (r?.tipo ?? 'nada') + ' (ref ' + et[c.id].tipo + ')')
  if (!r || r.tipo === 'build') continue
  resuelve++; if (r.tipo === et[c.id].tipo) acierta++
}
console.log('resuelven solas', resuelve, 'aciertan', acierta, (100 * acierta / resuelve).toFixed(1) + '%')
console.log(cambian.join('\n'))
"
```

  Expected: la precisión no baja del 97% (la de antes) y la lista de los que cambian se revisa
  a mano. Copiar la salida al reporte de la tarea.

- [ ] **Step 6: Commit** `feat(router): verif, validar, audit y check son review; write es write`.

### Task 3: El umbral de Jev solo para la talla

**Files:**
- Modify: `router/src/clasificadores/index.ts` (exportar `soloTallas`)
- Modify: `router/src/clasificadores/jev.ts`
- Modify: `bench/comparar.mjs` (una fila nueva)
- Test: `router/tests/jev.test.ts` y los de `router/tests/register.test.ts` que esperen
  `respaldo (jev dudó …)` en una description sin regla.

**Interfaces:**
- Produces: `export function soloTallas(etiquetas: readonly Tipo[]): boolean` en
  `clasificadores/index.ts`. `crearJev(post, ahora, umbral)` solo rechaza por duda cuando
  `soloTallas(etiquetas)`; si no, devuelve `{ tipo, confianza, ms, fuente: 'jev', detalle: 'sin umbral' }`
  cuando `confianza < umbral`. El motivo en `decidir` sale `jev (sin umbral) → review (0.55)`
  (formato que `decidir` ya arma con `detalle`).

- [ ] **Step 1: Tests que fallan.** En `router/tests/jev.test.ts`, con el `post` de prueba que ya
  usa el archivo:

```ts
  test('sin regla, con duda, decide Jev igual y lo marca', async () => {
    const jev = crearJev(async () => ({ ok: true, status: 200, text: respuesta('review', 0.55) }), reloj, 0.7)
    const r = await jev({ descripcion: 'verif: kubernetes', resumen: RESUMEN, etiquetas: TIPOS })
    expect({ ...r, ms: 0 }).toEqual({ tipo: 'review', confianza: 0.55, ms: 0, fuente: 'jev', detalle: 'sin umbral' })
  })

  test('en la talla de un build, con duda, sigue decidiendo el respaldo', async () => {
    const jev = crearJev(async () => ({ ok: true, status: 200, text: respuesta('build-large', 0.55) }), reloj, 0.7)
    await expect(jev({ descripcion: 'Implement Task 2', resumen: RESUMEN, etiquetas: TALLAS })).rejects.toThrow('jev dudó (0.55)')
  })

  test('sin duda no hay detalle', async () => {
    const jev = crearJev(async () => ({ ok: true, status: 200, text: respuesta('review', 0.9) }), reloj, 0.7)
    const r = await jev({ descripcion: 'verif: kubernetes', resumen: RESUMEN, etiquetas: TIPOS })
    expect(r.detalle).toBe(undefined)
  })
```

  Adaptar `respuesta`, `reloj`, `RESUMEN`, `TIPOS` y `TALLAS` a los helpers y constantes que el
  archivo ya tiene (si `expect.any` no existe en `claude-code/testing`, comparar campo por
  campo). Actualizar el test existente que espera rechazo con duda sobre los 9 tipos: ahora
  debe esperar la respuesta con `detalle: 'sin umbral'`.

- [ ] **Step 2:** Correr la suite. Expected: fallan.

- [ ] **Step 3: Implementación.** En `clasificadores/index.ts`, exportar `soloTallas` (hoy es
  local). En `jev.ts`:

```ts
import { soloTallas } from './index'
// …
    const { tipo, confianza } = leerJev(r.text, etiquetas)
    if (confianza < umbral) {
      // El umbral se calibró para la talla de los builds (89% de acierto con 0.7). Sin regla, el
      // respaldo siempre dice build-small y acierta menos que Jev con duda (37% contra 43%).
      if (soloTallas(etiquetas)) throw new Error(`jev dudó (${confianza.toFixed(2)})`)
      return { tipo, confianza, ms, fuente: 'jev', detalle: 'sin umbral' }
    }
    return { tipo, confianza, ms, fuente: 'jev' }
```

  (`import type { Clasificador } from './index'` sigue; agregar el import de valor no crea un
  ciclo porque `index.ts` no importa `jev.ts`; verificarlo).

- [ ] **Step 4:** Correr la suite y arreglar los tests de `register.test.ts` que esperaban
  `respaldo (jev dudó …)` para una description **sin regla** (con regla `build` no cambian).

- [ ] **Step 5: Medir en el banco.** En `bench/comparar.mjs`, junto al barrido de `jevUmbral`
  que ya existe, agregar la fila "umbral 0.7 solo en la talla": aplica el umbral a los casos con
  `etiquetasProduccion` de 2 etiquetas y, en los de 9, usa la elección de Jev siempre. Correr
  `node bench/comparar.mjs bench/corridas/2026-10-07-1032-banco.json` y copiar al reporte la
  tabla del barrido con la fila nueva (total, sin regla y builds). Expected: sin regla sube de
  ~37% a ~43% y builds queda igual (~89%).

- [ ] **Step 6: Commit** `feat(router): el umbral de Jev se aplica solo a la talla de los builds`.

### Task 4: Agrupar por `<prefijo>: <nombre>`

**Files:**
- Modify: `router/src/registro.ts` (`tareaDe`)
- Test: `router/tests/registro.test.ts`

**Interfaces:**
- Produces: `tareaDe(descripcion: string): string | null`. Con `Task N`, `Tarea N` o `TN`
  devuelve `Tarea N` como hoy; si no, con `^<prefijo de hasta 20 caracteres, una o dos
  palabras>: <nombre>` devuelve el nombre sin `[pin]`, recortado y en minúsculas (hasta 60
  caracteres); si no, `null`.

- [ ] **Step 1: Tests que fallan.**

```ts
  test('tareaDe agrupa por el nombre después de un prefijo corto', () => {
    expect(tareaDe('v2: kubernetes')).toBe('kubernetes')
    expect(tareaDe('verif: kubernetes')).toBe('kubernetes')
    expect(tareaDe('Review: Kubernetes')).toBe('kubernetes')
    expect(tareaDe('Code review: backup-como-servicio')).toBe('backup-como-servicio')
    expect(tareaDe('v2: kubernetes [pin]')).toBe('kubernetes')
  })

  test('Task N gana sobre el prefijo', () => {
    expect(tareaDe('Review Task 3: kubernetes')).toBe('Tarea 3')
    expect(tareaDe('Implement T4: tablas')).toBe('Tarea 4')
  })

  test('sin Task N ni prefijo corto no hay tarea', () => {
    expect(tareaDe('Map ingesta path for new models')).toBe(null)
    expect(tareaDe('Una descripción con un prefijo demasiado largo para serlo: x')).toBe(null)
    expect(tareaDe('v2:')).toBe(null)
  })
```

- [ ] **Step 2:** Correr la suite. Expected: fallan.

- [ ] **Step 3: Implementación** en `router/src/registro.ts`:

```ts
export function tareaDe(descripcion: string): string | null {
  const m = descripcion.match(/\b(?:task|tarea)s?\s+(\d+[a-z]?)/i) ?? descripcion.match(/\bT(\d+[a-z]?)\b/)
  if (m) return `Tarea ${m[1]}`
  // Sin número de tarea: "v2: kubernetes" y "verif: kubernetes" son la misma unidad de trabajo.
  const p = descripcion.replace(/\[pin\]/gi, '').match(/^\s*([^\s:]+(?:\s+[^\s:]+)?)\s*:\s*(\S.*?)\s*$/)
  if (!p || p[1]!.length > 20) return null
  return p[2]!.toLowerCase().slice(0, 60)
}
```

- [ ] **Step 4:** Correr la suite. Expected: pasa. Si algún test de historial o panel cambia
  porque ahora una description de prueba arma tarea, revisar que sea el comportamiento buscado
  y actualizarlo.

- [ ] **Step 5: Commit** `feat(router): las tareas se agrupan también por "<prefijo>: <nombre>"`.

### Task 5: Reglas sobre la primera línea del prompt (con compuerta del banco)

**Files:**
- Create: `bench/primera-linea.mjs`
- Modify (solo si pasa la compuerta): `router/src/reglas.ts`, `router/src/decidir.ts`
- Test (solo si pasa la compuerta): `router/tests/reglas.test.ts`, `router/tests/decidir.test.ts`

**Interfaces:**
- Consumes: `clasificarPorReglas` (Task 2).
- Produces (si pasa): `export function primeraLinea(prompt: string): string` en `reglas.ts` (la
  primera línea no vacía, recortada, hasta 200 caracteres). En `decidir`, cuando la description
  no matchea, se prueban las reglas con `clasificarPorReglas(primeraLinea(e.prompt), '')`, y el
  motivo es `regla <regla> (primera línea)`. Cuando nada matchea, el motivo sigue siendo
  `ninguna regla`.

- [ ] **Step 1: El script de medición.** `bench/primera-linea.mjs`, con el mismo recorrido de
  transcripts que `bench/extraer.mjs`:

```js
// Mide si las reglas aplicadas a la primera línea del prompt aciertan en los casos del banco sin
// regla de description. No guarda nada del prompt: imprime conteos y las descriptions que fallan.
//   node bench/primera-linea.mjs [--proyectos C:/Users/.../.claude/projects]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { clasificarPorReglas } from '../router/src/reglas.ts'

const TALLAS = ['build-large', 'build-small']
const i = process.argv.indexOf('--proyectos')
const base = i > 0 ? process.argv[i + 1] : path.join(os.homedir(), '.claude', 'projects')
const { casos } = JSON.parse(fs.readFileSync(new URL('./casos.json', import.meta.url), 'utf8'))
const etiquetas = JSON.parse(fs.readFileSync(new URL('./etiquetas.json', import.meta.url), 'utf8'))
const sinRegla = new Map(casos.filter(c => c.regla === null).map(c => [`${c.descripcion}\u0000${c.resumen.chars}`, c]))

const vistos = new Set()
let encontrados = 0, disparan = 0, aciertan = 0
const fallan = []
for (const dir of fs.readdirSync(base)) {
  if (dir.includes('scratch-workspaces')) continue
  const carpeta = path.join(base, dir)
  if (!fs.statSync(carpeta).isDirectory()) continue
  for (const archivo of fs.readdirSync(carpeta).filter(f => f.endsWith('.jsonl'))) {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(carpeta, archivo)), crlfDelay: Infinity })
    for await (const linea of rl) {
      let o
      try { o = JSON.parse(linea) } catch { continue }
      if (o.type !== 'assistant') continue
      for (const c of o.message?.content ?? []) {
        if (c?.type !== 'tool_use' || (c.name !== 'Agent' && c.name !== 'Task')) continue
        const x = c.input ?? {}
        if (!x.description || typeof x.prompt !== 'string') continue
        const clave = `${x.description}\u0000${x.prompt.length}`
        const caso = sinRegla.get(clave)
        if (!caso || vistos.has(clave)) continue
        vistos.add(clave)
        encontrados++
        const primera = (x.prompt.split('\n').map(l => l.trim()).find(Boolean) ?? '').slice(0, 200)
        const r = clasificarPorReglas(primera, '')
        if (!r) continue
        disparan++
        const ref = etiquetas[caso.id]?.tipo
        const ok = r.tipo === 'build' ? TALLAS.includes(ref) : r.tipo === ref
        if (ok) aciertan++
        else fallan.push(`${caso.id} "${caso.descripcion}" → ${r.tipo} (ref ${ref})`)
      }
    }
  }
}
console.log(`casos sin regla en el banco: ${sinRegla.size} · encontrados en transcripts: ${encontrados}`)
console.log(`la primera línea dispara una regla en ${disparan} · aciertan ${aciertan}` +
  (disparan ? ` (${(100 * aciertan / disparan).toFixed(1)}%)` : ''))
if (fallan.length) console.log('fallan:\n' + fallan.join('\n'))
```

  Correr `node bench/primera-linea.mjs` y copiar la salida al reporte.

- [ ] **Step 2: Compuerta.** Pasa si **aciertan / disparan ≥ 90% y disparan ≥ 10**.
  - **Si no pasa:** commitear solo el script
    (`chore(bench): medición de reglas sobre la primera línea del prompt`), reportar los números
    y **terminar la tarea acá** sin tocar `src/`. El controller lo deja documentado.
  - **Si pasa:** seguir con los steps 3 a 6.

- [ ] **Step 3: Tests que fallan.** En `reglas.test.ts`:

```ts
  test('primeraLinea toma la primera línea no vacía, recortada a 200', () => {
    expect(primeraLinea('\n\n  Revisá la tarea 6.\nOtra cosa')).toBe('Revisá la tarea 6.')
    expect(primeraLinea('x'.repeat(300))).toHaveLength(200)
    expect(primeraLinea('')).toBe('')
  })
```

  En `decidir.test.ts`, con el contexto de prueba que ya usa el archivo (clasificador que
  registra si lo llamaron):

```ts
  test('sin regla en la description, decide la regla de la primera línea del prompt', async () => {
    const d = await decidir({ ...ENTRADA, descripcion: 'chequeo 3', prompt: 'Review del formulario de backup.\nLeé…' }, CTX)
    expect(d.tocar && d.tipo).toBe('review')
    expect(d.motivos[0]).toBe('regla review (primera línea)')
  })

  test('si la primera línea tampoco matchea, clasifica y el motivo sigue siendo "ninguna regla"', async () => {
    const d = await decidir({ ...ENTRADA, descripcion: 'chequeo 3', prompt: 'Servicio: kubernetes.' }, CTX)
    expect(d.motivos[0]).toBe('ninguna regla')
  })
```

  (Adaptar `ENTRADA` y `CTX` a los nombres del archivo.)

- [ ] **Step 4: Implementación.** En `reglas.ts`:

```ts
/** La primera línea no vacía del prompt, para las reglas: más adentro un build nombra reviews y fixes. */
export function primeraLinea(prompt: string): string {
  return (prompt.split('\n').map(l => l.trim()).find(Boolean) ?? '').slice(0, 200)
}
```

  En `decidir.ts`, reemplazar `const regla = clasificarPorReglas(e.descripcion, e.subagentType)` y
  los dos `motivos.push` de regla por:

```ts
  let regla = clasificarPorReglas(e.descripcion, e.subagentType)
  let origen = ''
  if (!regla) {
    regla = clasificarPorReglas(primeraLinea(e.prompt), '')
    if (regla) origen = ' (primera línea)'
  }
```

  y usar `` `regla ${regla.regla}${origen}` `` en los dos lugares donde hoy se arma
  `` `regla ${regla.regla}` ``.

- [ ] **Step 5:** Correr la suite. Expected: pasa.

- [ ] **Step 6: Commit** `feat(router): si la description no dice el tipo, las reglas miran la primera línea del prompt`
  (incluye `bench/primera-linea.mjs`).

### Task 6: Que Claude aprenda la convención

**Files:**
- Create: `router/src/convencion.ts`
- Modify: `router/hooks/register.tsx` (hook `tool.describe`; hook `tool.call` de Agent)
- Modify: `router/src/overrides.ts` (`LINEA_ROUTER`)
- Modify: `router/.claude-plugin/plugin.json` (opción `ensenarConvencion`) y el tipo de las
  opciones del plugin si las declara a mano (buscar `avisarAClaude` en `router/`)
- Modify: `router/README.md` ("Lo que ve Claude" y la lista de `/config`)
- Test: `router/tests/convencion.test.ts` (nuevo) y `router/tests/register.test.ts`

**Interfaces:**
- Consumes: `Subagente` (`descripcion`, `tipo`, `escalon`, `motivos`). Los motivos de Task 5:
  `ninguna regla` o `regla <r> (primera línea)`.
- Produces:
  - `export const CONVENCION_AGENT: string`
  - `export function sinReglaDeDescription(motivos: readonly string[]): boolean`
  - `export function avisoConvencion(s: Subagente): string | null`

- [ ] **Step 1: Tests que fallan.** `router/tests/convencion.test.ts`:

```ts
import { describe, expect, test } from 'claude-code/testing'
import { avisoConvencion, CONVENCION_AGENT, sinReglaDeDescription } from '../src/convencion'
import type { Subagente } from '../types'

const SUB: Subagente = {
  agentId: 'a1', descripcion: 'verif: kubernetes', tarea: 'kubernetes', tipo: 'review', pedido: 'sonnet',
  modeloEfectivo: 'sonnet', elegido: 'opus·xhigh', escalon: { modelo: 'opus', esfuerzo: 'xhigh' },
  motivos: ['ninguna regla', 'jev → review (0.79)'], reasignado: true, inicio: 0, fin: null,
}

describe('convencion', () => {
  test('el texto de la tool nombra los verbos, Task N y [pin]', () => {
    for (const v of ['Implement', 'Review', 'Re-review', 'Fix', 'Explore', 'Research', 'Write', 'Task N', '[pin]'])
      expect(CONVENCION_AGENT.includes(v)).toBe(true)
  })

  test('sin regla en la description', () => {
    expect(sinReglaDeDescription(['ninguna regla', 'jev → review (0.79)'])).toBe(true)
    expect(sinReglaDeDescription(['regla review (primera línea)'])).toBe(true)
    expect(sinReglaDeDescription(['regla review'])).toBe(false)
  })

  test('el aviso dice cómo lo clasificó y cómo nombrarlo', () => {
    expect(avisoConvencion(SUB)).toBe(
      'router: no reconocí el tipo de "verif: kubernetes" y lo clasifiqué como review. Empezá la description con el verbo del tipo (Implement, Review, Re-review, Fix, Explore, Research, Write) y usá `Task N`.',
    )
  })

  test('recorta descriptions largas a 60 caracteres', () => {
    const larga = 'x'.repeat(80)
    expect(avisoConvencion({ ...SUB, descripcion: larga })!.includes(`"${'x'.repeat(59)}…"`)).toBe(true)
  })

  test('sin aviso si hubo regla o si el router no lo tocó', () => {
    expect(avisoConvencion({ ...SUB, motivos: ['regla review'] })).toBe(null)
    expect(avisoConvencion({ ...SUB, escalon: null, tipo: null, motivos: ['[pin]: respeta lo que pidió Claude'] })).toBe(null)
  })
})
```

  (Si `Subagente` exige otros campos, completarlos con valores neutros.)

- [ ] **Step 2:** Correr la suite. Expected: falla (no existe el módulo).

- [ ] **Step 3: `router/src/convencion.ts`.**

```ts
import type { Subagente } from '../types'

/**
 * Se suma a la descripción de la tool Agent: ahí lo lee Claude justo cuando escribe la
 * `description`. Constante a propósito: el host cachea tool.describe por sesión y un texto que
 * cambia gasta el caché del prompt.
 */
export const CONVENCION_AGENT =
  'Router de subagentes activo. El router elige el modelo y el esfuerzo de cada subagente: omití ' +
  '`model` (se ignora salvo que la description tenga `[pin]`), aunque te hayan pedido un modelo. ' +
  'Empezá `description` con el verbo del tipo de tarea: Implement (construir o editar), Review ' +
  '(verificar o revisar sin editar), Re-review (revisar de nuevo tras un arreglo), Fix (arreglar ' +
  'hallazgos), Explore (leer o mapear código), Research (investigar afuera), Write (redactar ' +
  'notas o docs). Si es parte de un plan, nombrá la unidad como `Task N` y repetí el mismo número ' +
  'en su build, review y fix. Ejemplos: "Implement Task 3: kubernetes", "Review Task 3: ' +
  'kubernetes".'

/** La description no dijo el tipo: decidió la primera línea del prompt o un clasificador. */
export function sinReglaDeDescription(motivos: readonly string[]): boolean {
  return motivos.some(m => m === 'ninguna regla' || m.endsWith('(primera línea)'))
}

/** La línea que ve Claude en el resultado de Agent cuando no siguió la convención. */
export function avisoConvencion(s: Subagente): string | null {
  if (s.escalon === null || s.tipo === null || !sinReglaDeDescription(s.motivos)) return null
  const d = s.descripcion.length > 60 ? `${s.descripcion.slice(0, 59)}…` : s.descripcion
  return (
    `router: no reconocí el tipo de "${d}" y lo clasifiqué como ${s.tipo}. Empezá la description ` +
    'con el verbo del tipo (Implement, Review, Re-review, Fix, Explore, Research, Write) y usá `Task N`.'
  )
}
```

- [ ] **Step 4:** Correr la suite. Expected: pasan los de `convencion.test.ts`.

- [ ] **Step 5: Tests de los hooks que fallan.** En `router/tests/register.test.ts`:
  - **`tool.describe`:** con el mismo patrón que el test de `prompt.compose` (un hook propio que
    hace de core y devuelve `{ description: 'Launch a new agent' }`, y la operación del engine
    que dispara `tool.describe`, que se busca en `router/.claude-plugin/types/claude-code/index.d.ts`),
    esperar que la descripción de `Agent` sea `` `Launch a new agent\n\n${CONVENCION_AGENT}` `` y
    que la de otra tool (`Bash`) no cambie.
  - **Aviso**, en el `describe('avisarAClaude')` (renombrarlo a
    `'avisos en el resultado de Agent'`) y con su helper `agentComoCore`:

```ts
  test('por defecto, sin regla en la description, Claude ve cómo nombrar', async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    const SIN_REGLA = { ...SPAWN, description: 'verif: kubernetes', prompt: 'Servicio: kubernetes.' }
    agentComoCore(on, id => $.agent.spawn({ ...SIN_REGLA, tool_use_id: id }))
    const r = await $.tool.call({ ...CALL, description: 'verif: kubernetes', prompt: 'Servicio: kubernetes.' })
    expect(r.context).toEqual([
      'router: no reconocí el tipo de "verif: kubernetes" y lo clasifiqué como build-small. Empezá la description con el verbo del tipo (Implement, Review, Re-review, Fix, Explore, Research, Write) y usá `Task N`.',
    ])
  })

  test('ensenarConvencion apagado: sin aviso', { options: { ensenarConvencion: false } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    agentComoCore(on, id => $.agent.spawn({ ...SPAWN, tool_use_id: id, description: 'verif: kubernetes', prompt: 'Servicio: kubernetes.' }))
    const r = await $.tool.call({ ...CALL, description: 'verif: kubernetes', prompt: 'Servicio: kubernetes.' })
    expect(r.context ?? []).toEqual([])
  })

  test('con los dos avisos prendidos salen las dos líneas, primero la de avisarAClaude', { options: { avisarAClaude: true } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    // Pide haiku y el respaldo da build-small (sonnet·medium): hay reasignación y no hubo regla.
    const SIN_REGLA = { description: 'verif: kubernetes', prompt: 'Servicio: kubernetes.', model: 'haiku' }
    agentComoCore(on, id => $.agent.spawn({ ...SPAWN, ...SIN_REGLA, tool_use_id: id }))
    const r = await $.tool.call({ ...CALL, ...SIN_REGLA })
    expect(r.context).toEqual([
      '(router: corre en sonnet·medium — ninguna regla · respaldo → build-small)',
      'router: no reconocí el tipo de "verif: kubernetes" y lo clasifiqué como build-small. Empezá la description con el verbo del tipo (Implement, Review, Re-review, Fix, Explore, Research, Write) y usá `Task N`.',
    ])
  })
```

  Si el texto de los motivos del respaldo difiere (`avisoReasignado` une `motivos` con ` · `),
  copiar el que arma `decidir` hoy, sin cambiar `avisoReasignado`.
  - El test de `prompt.compose` sigue comparando contra `LINEA_ROUTER` (el texto nuevo).

- [ ] **Step 6: Implementación en `register.tsx`.**
  - Importar `avisoConvencion` y `CONVENCION_AGENT` desde `../src/convencion`.
  - Hook nuevo, junto al de `prompt.compose`:

```ts
  // La convención de nombres va en la tool Agent: Claude la lee justo cuando escribe la
  // description. Si el hook falla, sale la descripción que calculó el host.
  on('tool.describe', { tool: 'Agent' }, async (_$, e, next) => {
    const r = await next(e)
    return { ...r, description: `${r.description}\n\n${CONVENCION_AGENT}` }
  })
    .catch(($, e, next) => next(e))
```

  - El hook `tool.call` de Agent pasa a registrarse si `avisar || ensenar`, con
    `const avisar = options.avisarAClaude === true` y
    `const ensenar = options.ensenarConvencion !== false` (prendido por defecto):

```ts
  if (avisar || ensenar) on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined) return r
    try {
      const sub = (await read($, subagentesAtom)).find(s => s.toolUseId === e.tool_use_id)
      if (!sub) return r
      const lineas: string[] = []
      if (avisar && sub.reasignado) lineas.push(avisoReasignado(sub))
      const aviso = ensenar ? avisoConvencion(sub) : null
      if (aviso) lineas.push(aviso)
      return lineas.length ? { ...r, context: [...(r.context ?? []), ...lineas] } : r
    } catch {
      // Avisar es secundario: el resultado sale igual.
      return r
    }
  })
    .catch(($, e, next) => next(e))
```

  - Actualizar el comentario de arriba del hook para que nombre las dos opciones.

- [ ] **Step 7: `LINEA_ROUTER`** en `router/src/overrides.ts`:

```ts
/**
 * La sección `router:pin` del system prompt: le saca a Claude la elección del modelo y le pide usar
 * ese razonamiento en descomponer y paralelizar sin conflictos. Cómo nombrar los subagentes va en
 * la descripción de la tool Agent (CONVENCION_AGENT), donde Claude lo lee al usarla.
 */
export const LINEA_ROUTER =
  'Router de subagentes activo: el modelo y el esfuerzo de cada subagente los elige un router ' +
  'según el tipo de tarea y según cuánto queda de la ventana de 5 horas. No gastes razonamiento ' +
  'eligiendo `model` para los subagentes. Usá ese tiempo en descomponer bien el trabajo: lanzá en ' +
  'paralelo las tareas independientes y serializá las que tocan los mismos archivos, comparten ' +
  'estado o dependen del resultado de otra. Cómo nombrar cada subagente está en la descripción ' +
  'de la tool Agent.'
```

- [ ] **Step 8: `plugin.json`.** Después de `avisarAClaude`:

```json
    "ensenarConvencion": { "type": "boolean", "title": "Enseñarle la convención a Claude", "description": "Cuando ninguna regla reconoce la description de un subagente, Claude ve una línea en el resultado de Agent con cómo nombrarlos", "default": true }
```

  Si hay un tipo `PluginOptions` declarado a mano, sumar `ensenarConvencion?: boolean`.

- [ ] **Step 9: README.** En "Lo que ve Claude": la convención va en la descripción de la tool
  Agent (y el texto está en `CONVENCION_AGENT`, `router/src/convencion.ts`); la sección del
  system prompt queda para descomponer y paralelizar; `/router off` no saca el texto de la tool
  (el host lo cachea por sesión). Un párrafo para **`ensenarConvencion`** (prendido por defecto)
  con el ejemplo de la línea, y que con `avisarAClaude` también prendido salen las dos líneas.

- [ ] **Step 10:** Correr `claude plugin test router` y `claude plugin validate router`.
  Expected: todo pasa.

- [ ] **Step 11: Commit** `feat(router): la convención de nombres va en la tool Agent y Claude recibe un aviso cuando no la sigue`.

### Task 7: Verificación en vivo y documento (la hace el controller)

**Files:**
- Create: `docs/verificaciones/2026-10-09-router-fase-5.md`

- [ ] **Step 1: Prompt de prueba.** Desde un directorio temporal vacío (no el repo), con stdin
  cerrado:

```bash
claude -p --plugin-dir <ruta>/router --dangerously-skip-permissions --output-format json "Usá subagentes Sonnet. Lanzá en paralelo tres subagentes y esperá a los tres: uno que verifique, sin editar nada, que el archivo <repo>/router/src/reglas.ts exporta clasificarPorReglas; uno que cree el archivo hola.txt en este directorio con el texto hola; y uno que explore <repo>/router/src y liste sus archivos. Después respondé solo: listo." < /dev/null
```

  - **Antes:** con `<ruta>` = el checkout de `main`.
  - **Después:** con `<ruta>` = el worktree.

- [ ] **Step 2: Qué mirar** (en `~/.claude/plugins/store/router_inline-*.json`, clave
  `historial:<session_id>`, y en el transcript de la sesión y de cada subagente):
  - las descriptions que eligió Claude y si siguen la convención;
  - tipo, `elegido` y motivos de cada uno;
  - que el explore corra en `claude-haiku-5-5` con `"effort":"medium"` en su transcript;
  - si alguna description no matcheó, que el resultado de Agent lleve el aviso (`context`).

- [ ] **Step 3: Documento** con el antes y el después, la salida de las mediciones del banco
  (Tasks 2, 3 y 5) y lo que quedó sin verificar (por ejemplo, que el panel no se vio en
  interactivo).

- [ ] **Step 4: Commit** `docs(router): verificación de la fase 5`.

---

Después de la Task 7: review final de toda la rama en Opus (xhigh), arreglos, y merge a `main`
con el OK del usuario. La documentación en la vault (ADR que reemplaza al 0003,
`como-decide-el-router` y la bitácora) la hace el controller al cerrar.
