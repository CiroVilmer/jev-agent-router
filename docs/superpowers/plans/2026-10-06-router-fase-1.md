# Router de subagentes · fase 1 · plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un mod de Claude Code que elige el modelo y el esfuerzo de cada subagente según el
tipo de tarea (reglas, con un clasificador de respaldo), los sube cuando sobra ventana de 5
horas, y lo muestra en una línea informativa y en un panel `/router` con dos pestañas.

**Architecture:** Un plugin `router/` dentro del repo `claude-mods`. El núcleo es TypeScript
puro, testeable sin sesión: `taxonomia`, `reglas`, `resumen`, `politica`, `overrides`,
`decidir` y `registro`. `hooks/register.tsx` es el único archivo que conecta eventos
(`agent.spawn`, `turn.step`, `turn.complete`, `session.measure`, `prompt.compose`,
`command.run`). El estado que dibuja la interfaz vive en `$.state` (atoms), porque las
variables del módulo se pierden en cada recarga.

**Tech Stack:** API de mods de Claude Code (function hooks) v2.1.288 o posterior, en TypeScript
y TSX con `h` como factory. Tests con `claude-code/testing` corridos por `claude plugin test`.
Sin dependencias npm.

**Spec:** `docs/superpowers/specs/2026-10-06-router-de-subagentes-design.md`

## Global Constraints

- Claude Code v2.1.287 o posterior (instalado: 2.1.291). Mods activos por defecto; no setear
  `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`.
- El módulo corre sin Node ni DOM. Nada de `require`, de `import()`, de `fs` ni de
  `process`: todo lo externo pasa por `$`. Cada archivo importado es `.ts` o `.tsx` y se importa
  con `import` estático.
- Modelos: el router reescribe `model` con el alias (`opus`, `sonnet`, `haiku`), y el alias
  resuelve al modelo vigente (hoy `claude-opus-5-5`, `claude-sonnet-5-5`,
  `claude-haiku-4-5-20251001`). Haiku no recibe esfuerzo.
- Escalera: `haiku → sonnet·low → sonnet·medium → sonnet·high → opus·medium → opus·high → opus·xhigh`.
- Matriz base: review-final opus·xhigh · review opus·xhigh · re-review opus·medium ·
  build-large opus·medium · build-small sonnet·medium · fix sonnet·high · explore haiku (techo
  sonnet·medium) · research sonnet·medium · write sonnet·low.
- **La política solo sube, nunca frena:** 🔥 si T ≤ 60 y U ≤ 70 → +2; ⬆️ si T ≤ 120 y U ≤ 80 → +1;
  si no, ⚪ 0. No hay modos de ahorro ni bloqueo semanal.
- **Nunca bloquea:** sin diálogos ni botones que esperen. Si algo falla, el subagente sale con
  lo que pidió Claude.
- Los `fork` no se tocan. `[pin]` en la descripción respeta lo que pidió Claude.
- La línea informativa no repite lo que muestran el statusline (modelo, contexto, límites) ni
  la lista nativa de agentes (estado, tiempo, tokens).
- Fase 1: el clasificador es solo el `respaldo` (sin Haiku ni Jev, sin tope de 1 s). La matriz
  vive en código; en tiempo de sesión se cambia con `/router fijar`. `/config` expone solo los
  cuatro umbrales de la política.
- Textos de interfaz y mensajes en castellano rioplatense; identificadores en castellano.
- Ejecutar los comandos desde la raíz del repo: `<repo>`.

---

## Mapa de archivos

```
claude-mods/
├── .claude-plugin/marketplace.json        marketplace del repo (Task 1)
└── router/
    ├── .claude-plugin/plugin.json         manifiesto y userConfig de umbrales (Task 1)
    ├── hooks/hooks.json                   { "modules": ["./register.tsx"] } (Task 1)
    ├── hooks/register.tsx                 conecta los eventos con el núcleo (Task 1 stub, Task 8)
    ├── types/index.d.ts                   tipos compartidos y contrato de $.state (Task 1)
    ├── src/taxonomia.ts                   tipos, escalera, matriz, techo, parse/format (Task 1)
    ├── src/reglas.ts                      descripción/subagentType → tipo (Task 2)
    ├── src/resumen.ts                     prompt → resumen estructural; talla de respaldo (Task 3)
    ├── src/clasificadores/index.ts        interfaz Clasificador y `respaldo` (Task 3)
    ├── src/politica.ts                    lectura de 5h → modo y escalones (Task 4)
    ├── src/overrides.ts                   /router: parser, aplicar, [pin] (Task 5)
    ├── src/decidir.ts                     pipeline puro de decisión (Task 6)
    ├── src/registro.ts                    tareas, rondas, métricas de sesión (Task 7)
    ├── src/estado.ts                      atoms de $.state (Task 8)
    ├── src/ui/linea.ts                    texto de la línea informativa (Task 9)
    ├── src/ui/panel.tsx                   panel con dos pestañas (Task 9)
    ├── tests/*.test.ts(x)                 un archivo por módulo
    └── README.md                          cómo cargarlo y usarlo (Task 10)
```

---

### Task 1: Esqueleto del plugin y taxonomía

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Create: `router/.claude-plugin/plugin.json`
- Create: `router/hooks/hooks.json`
- Create: `router/hooks/register.tsx`
- Create: `router/types/index.d.ts`
- Create: `router/src/taxonomia.ts`
- Test: `router/tests/taxonomia.test.ts`

**Interfaces:**
- Produces (en `router/types/index.d.ts`): `Tipo`, `Modelo`, `Esfuerzo`, `Escalon`, `Overrides`,
  `LecturaUso`, `Subagente`, `Pestana`, y el contrato `PluginState['router']`.
- Produces (en `src/taxonomia.ts`):
  - `TIPOS: readonly Tipo[]`
  - `ESCALERA: readonly Escalon[]`
  - `TOPE: number`
  - `MODELO_ID: Record<Modelo, string>`
  - `BASE: Record<Tipo, number>` (índice en `ESCALERA`)
  - `TECHO: Partial<Record<Tipo, number>>`
  - `formatEscalon(e: Escalon): string`
  - `parseEscalon(texto: string): Escalon | null`

- [ ] **Step 1: Crear el manifiesto, el marketplace y hooks.json**

`router/.claude-plugin/plugin.json`:
```json
{
  "name": "router",
  "version": "0.1.0",
  "description": "Elige modelo y esfuerzo de cada subagente según el tipo de tarea y la ventana de 5 horas",
  "types": "./types/index.d.ts",
  "userConfig": {
    "fuegoMinutos": {
      "type": "number",
      "title": "🔥 minutos al reset",
      "description": "Sube dos niveles cuando faltan estos minutos o menos para el reset de 5h (y el uso no pasa el umbral 🔥)",
      "default": 60
    },
    "fuegoUsado": {
      "type": "number",
      "title": "🔥 % usado máximo",
      "description": "Porcentaje de la ventana de 5h usado, como máximo, para el modo 🔥",
      "default": 70
    },
    "sobraMinutos": {
      "type": "number",
      "title": "⬆️ minutos al reset",
      "description": "Sube un nivel cuando faltan estos minutos o menos para el reset de 5h (y el uso no pasa el umbral ⬆️)",
      "default": 120
    },
    "sobraUsado": {
      "type": "number",
      "title": "⬆️ % usado máximo",
      "description": "Porcentaje de la ventana de 5h usado, como máximo, para el modo ⬆️",
      "default": 80
    }
  }
}
```

`router/hooks/hooks.json`:
```json
{ "modules": ["./register.tsx"] }
```

`.claude-plugin/marketplace.json`:
```json
{
  "name": "claude-mods",
  "owner": { "name": "Ciro Vilmer" },
  "plugins": [
    {
      "name": "router",
      "source": "./router",
      "description": "Elige modelo y esfuerzo de cada subagente según el tipo de tarea y la ventana de 5 horas"
    }
  ]
}
```

- [ ] **Step 2: Crear el contrato de tipos**

`router/types/index.d.ts`:
```ts
export type Tipo =
  | 'review-final'
  | 'review'
  | 're-review'
  | 'build-large'
  | 'build-small'
  | 'fix'
  | 'explore'
  | 'research'
  | 'write'

export type Modelo = 'haiku' | 'sonnet' | 'opus'

export type Esfuerzo = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Un punto de la escalera: modelo y, salvo Haiku, esfuerzo. */
export type Escalon = { modelo: Modelo; esfuerzo?: Esfuerzo }

/** Lo que el usuario fijó con /router durante la sesión. */
export type Overrides = {
  activo: boolean
  permitidos: Modelo[] | null
  fijados: Partial<Record<Tipo, Escalon>>
}

/** La ventana de 5 horas como la reportó session.measure. */
export type LecturaUso = { usado: number; resetsAt: string }

/** Un subagente lanzado en la sesión y lo que decidió el router. */
export type Subagente = {
  agentId: string
  descripcion: string
  tarea: string | null
  tipo: Tipo | null
  pedido: string
  elegido: string
  escalon: Escalon | null
  motivos: string[]
  reasignado: boolean
  inicio: number
  fin: number | null
}

export type Pestana = 'curso' | 'metricas'

declare module 'claude-code' {
  interface PluginState {
    router: {
      subagentes: Subagente[]
      overrides: Overrides
      lectura: LecturaUso | null
      pestana: Pestana
    }
  }
}
```

- [ ] **Step 3: Crear un register mínimo para que el plugin cargue**

`router/hooks/register.tsx`:
```tsx
import type { Register } from 'claude-code'

export const register: Register = () => {}
```

- [ ] **Step 4: Validar el plugin**

Run: `claude plugin validate router`
Expected: sin errores. Si `userConfig` con `"type": "number"` se rechaza, cambiar los cuatro
campos a `"type": "string"` con `"default": "60"` (etc.) y anotar que `umbralesDe` (Task 4)
tiene que parsear strings. Correr de nuevo hasta que pase.

- [ ] **Step 5: Escribir el test de la taxonomía (falla)**

`router/tests/taxonomia.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import { BASE, ESCALERA, formatEscalon, MODELO_ID, parseEscalon, TECHO, TIPOS, TOPE } from '../src/taxonomia'

describe('taxonomia', () => {
  test('la escalera va de haiku a opus·xhigh', () => {
    expect(ESCALERA.map(formatEscalon)).toEqual([
      'haiku', 'sonnet·low', 'sonnet·medium', 'sonnet·high', 'opus·medium', 'opus·high', 'opus·xhigh',
    ])
    expect(TOPE).toBe(6)
  })

  test('la matriz base coincide con el spec', () => {
    const base = Object.fromEntries(TIPOS.map(t => [t, formatEscalon(ESCALERA[BASE[t]]!)]))
    expect(base).toEqual({
      'review-final': 'opus·xhigh',
      review: 'opus·xhigh',
      're-review': 'opus·medium',
      'build-large': 'opus·medium',
      'build-small': 'sonnet·medium',
      fix: 'sonnet·high',
      explore: 'haiku',
      research: 'sonnet·medium',
      write: 'sonnet·low',
    })
    expect(formatEscalon(ESCALERA[TECHO.explore!]!)).toBe('sonnet·medium')
  })

  test('ids de modelo', () => {
    expect(MODELO_ID).toEqual({
      haiku: 'claude-haiku-4-5-20251001',
      sonnet: 'claude-sonnet-5-5',
      opus: 'claude-opus-5-5',
    })
  })

  test('parseEscalon acepta ·, punto y espacio', () => {
    expect(parseEscalon('opus·xhigh')).toEqual({ modelo: 'opus', esfuerzo: 'xhigh' })
    expect(parseEscalon('sonnet.medium')).toEqual({ modelo: 'sonnet', esfuerzo: 'medium' })
    expect(parseEscalon('Opus max')).toEqual({ modelo: 'opus', esfuerzo: 'max' })
    expect(parseEscalon('haiku')).toEqual({ modelo: 'haiku' })
  })

  test('parseEscalon rechaza lo inválido', () => {
    expect(parseEscalon('gpt·high')).toBe(null)
    expect(parseEscalon('opus')).toBe(null)
    expect(parseEscalon('haiku·high')).toBe(null)
    expect(parseEscalon('sonnet·turbo')).toBe(null)
    expect(parseEscalon('')).toBe(null)
  })
})
```

- [ ] **Step 6: Correr y ver que falla**

Run: `claude plugin test router`
Expected: FAIL. `taxonomia.test.ts` no puede importar `../src/taxonomia`.

- [ ] **Step 7: Implementar la taxonomía**

`router/src/taxonomia.ts`:
```ts
import type { Escalon, Esfuerzo, Modelo, Tipo } from '../types'

export const TIPOS: readonly Tipo[] = [
  'review-final', 'review', 're-review', 'build-large', 'build-small', 'fix', 'explore', 'research', 'write',
]

export const ESCALERA: readonly Escalon[] = [
  { modelo: 'haiku' },
  { modelo: 'sonnet', esfuerzo: 'low' },
  { modelo: 'sonnet', esfuerzo: 'medium' },
  { modelo: 'sonnet', esfuerzo: 'high' },
  { modelo: 'opus', esfuerzo: 'medium' },
  { modelo: 'opus', esfuerzo: 'high' },
  { modelo: 'opus', esfuerzo: 'xhigh' },
]

export const TOPE = ESCALERA.length - 1

export const MODELO_ID: Record<Modelo, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
}

/** Índice en ESCALERA de la configuración base de cada tipo. */
export const BASE: Record<Tipo, number> = {
  'review-final': 6,
  review: 6,
  're-review': 4,
  'build-large': 4,
  'build-small': 2,
  fix: 3,
  explore: 0,
  research: 2,
  write: 1,
}

/** Techos por velocidad, no por ahorro: explorar no gana nada con un modelo lento. */
export const TECHO: Partial<Record<Tipo, number>> = { explore: 2 }

const MODELOS: readonly Modelo[] = ['haiku', 'sonnet', 'opus']
const ESFUERZOS: readonly Esfuerzo[] = ['low', 'medium', 'high', 'xhigh', 'max']

export function formatEscalon(e: Escalon): string {
  return e.esfuerzo ? `${e.modelo}·${e.esfuerzo}` : e.modelo
}

export function parseEscalon(texto: string): Escalon | null {
  const [m, f, sobra] = texto.trim().toLowerCase().split(/[·.\s]+/).filter(Boolean)
  if (sobra !== undefined || m === undefined) return null
  if (!(MODELOS as readonly string[]).includes(m)) return null
  const modelo = m as Modelo
  if (modelo === 'haiku') return f === undefined ? { modelo } : null
  if (f === undefined || !(ESFUERZOS as readonly string[]).includes(f)) return null
  return { modelo, esfuerzo: f as Esfuerzo }
}
```

- [ ] **Step 8: Correr y ver que pasa**

Run: `claude plugin test router`
Expected: PASS, los 5 tests de `taxonomia`.

- [ ] **Step 9: Validar de nuevo y commitear**

Run: `claude plugin validate router`
Expected: sin errores.

```bash
git add .claude-plugin router
git commit -m "feat(router): esqueleto del plugin y taxonomía"
```

---

### Task 2: Reglas de clasificación

**Files:**
- Create: `router/src/reglas.ts`
- Test: `router/tests/reglas.test.ts`

**Interfaces:**
- Consumes: `Tipo` de `../types`.
- Produces: `type ResultadoRegla = { tipo: Tipo | 'build'; regla: string } | null` y
  `clasificarPorReglas(descripcion: string, subagentType: string): ResultadoRegla`.
  `'build'` quiere decir que es una construcción pero falta decidir el tamaño. `null` quiere
  decir que ninguna regla aplica.

- [ ] **Step 1: Escribir el test con descripciones reales (falla)**

Las descripciones salen de los transcripts del usuario, de septiembre de 2026.

`router/tests/reglas.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import { clasificarPorReglas } from '../src/reglas'

const CASOS: readonly [string, string, string | null][] = [
  // [descripción, subagentType, tipo esperado]
  ['Final whole-branch review', 'general-purpose', 'review-final'],
  ['Final whole-branch review (opus)', 'general-purpose', 'review-final'],
  ['Final whole-branch review tanda 1', 'general-purpose', 'review-final'],
  ['Final review of the login branch', 'revisor-final-opus-xhigh', 'review-final'],
  ['Revisión final de la rama', 'revisor-final-opus-xhigh', 'review-final'],
  ['Review final de la rama C2', 'general-purpose', 'review-final'],
  ['Review final de la rama 5.2', 'general-purpose', 'review-final'],
  ['Review Task 2 (spec + quality)', 'general-purpose', 'review'],
  ['Review Task 8b (spec + quality)', 'general-purpose', 'review'],
  ['Review T4 registro', 'general-purpose', 'review'],
  ['Revisión de la tarea 4', 'general-purpose', 'review'],
  ['Revision de la Tarea 11', 'general-purpose', 'review'],
  ['Revisar T3 (spec + calidad)', 'general-purpose', 'review'],
  ['Revisar T10 (funcional)', 'general-purpose', 'review'],
  ['Code review del trabajo de la 5.3', 'general-purpose', 'review'],
  ['Code review of the Datos tab', 'general-purpose', 'review'],
  ['Review the master integration', 'general-purpose', 'review'],
  ['Review VM fix 2', 'general-purpose', 'review'],
  ['Review Task 5 (Jev script)', 'general-purpose', 'review'],
  ['Re-review Task 1 fix round 1', 'general-purpose', 're-review'],
  ['Re-review Task 8 fix round 2', 'general-purpose', 're-review'],
  ['Scoped re-review of Task 4 fix round 2', 'general-purpose', 're-review'],
  ['Re-revisión acotada del fix 2', 'general-purpose', 're-review'],
  ['Re-revision de T10, rondas 2 y 3', 'general-purpose', 're-review'],
  ['Re-revisar T1 ronda 4', 'general-purpose', 're-review'],
  ['Re-review Tarea 3 fix round 2', 'general-purpose', 're-review'],
  ['Fix V5: fecha y trimestre en el prompt', 'general-purpose', 'fix'],
  ['Fix wave de la revision final de rama', 'general-purpose', 'fix'],
  ['Fix wave grupo 3: tabla y tests e2e', 'general-purpose', 'fix'],
  ['Fix Salud review findings', 'general-purpose', 'fix'],
  ['Ola de arreglos del review final', 'general-purpose', 'fix'],
  ['Arreglos del review final', 'general-purpose', 'fix'],
  ['Corregir formularios A (Sonnet)', 'general-purpose', 'fix'],
  ['Research Jev and best practices', 'general-purpose', 'research'],
  ['Research numeric guardrails and clarification', 'general-purpose', 'research'],
  ['Investigar timeout de la P5-2', 'general-purpose', 'research'],
  ['Relevar código de cobranzas/pagos', 'Explore', 'explore'],
  ['Explore: lectura, contraste y aclaración', 'Explore', 'explore'],
  ['Explore pedido side for tercero', 'Explore', 'explore'],
  ['Map ingesta path for new models', 'general-purpose', 'explore'],
  ['Relevar el repo para la consola', 'general-purpose', 'explore'],
  ['Redactar el resumen del bloque 6', 'general-purpose', 'write'],
  ['Bitácora: lo que se midió', 'general-purpose', 'write'],
  ['Migrar bitácoras y prompts a la vault', 'general-purpose', 'write'],
  ['Implement Task 11: el compilador', 'general-purpose', 'build'],
  ['Implement Task 5: carga, frases, línea', 'general-purpose', 'build'],
  ['Implement ingest page size fix', 'general-purpose', 'build'],
  ['Implementar la Tarea 13', 'general-purpose', 'build'],
  ['Implementar T1: filtro de tercero', 'general-purpose', 'build'],
  ['Implement Tarea 7: first admin command', 'general-purpose', 'build'],
  ['Tarea 1: frontera de exactitud', 'general-purpose', 'build'],
  ['Task 1c: casos sellado y reservado', 'general-purpose', 'build'],
  ['T3 la cola', 'general-purpose', 'build'],
  ['T3: el compilador de dos niveles', 'general-purpose', 'build'],
  ['Propuesta de formularios por servicio', 'general-purpose', null],
  ['Verificar formularios: familia D', 'general-purpose', null],
  ['Agregar --excluir al corredor', 'general-purpose', null],
  ['Real data for Inicio', 'general-purpose', null],
  ['DDL completo de los esquemas', 'general-purpose', null],
  ['Naming de categoría en ops', 'general-purpose', null],
]

describe('reglas', () => {
  for (const [descripcion, subagentType, esperado] of CASOS) {
    test(`${descripcion} → ${esperado ?? 'ninguna'}`, () => {
      expect(clasificarPorReglas(descripcion, subagentType)?.tipo ?? null).toBe(esperado)
    })
  }

  test('cada resultado dice qué regla aplicó', () => {
    expect(clasificarPorReglas('Re-review Task 1 fix round 1', 'general-purpose')).toEqual({
      tipo: 're-review',
      regla: 're-review',
    })
    expect(clasificarPorReglas('cualquier cosa', 'Explore')).toEqual({
      tipo: 'explore',
      regla: 'subagentType Explore',
    })
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `claude plugin test router`
Expected: FAIL. `reglas.test.ts` no puede importar `../src/reglas`.

- [ ] **Step 3: Implementar las reglas**

El orden importa: re-review va antes que review, y fix va antes que review-final, porque "Ola de
arreglos del review final" es un fix. JavaScript no toma `ó` como letra en `\w`, así que
`revisi` corta bien antes de "ón".

`router/src/reglas.ts`:
```ts
import type { Tipo } from '../types'

export type ResultadoRegla = { tipo: Tipo | 'build'; regla: string } | null

const REGLAS: readonly { regla: string; patron: RegExp; tipo: Tipo | 'build' }[] = [
  { regla: 're-review', patron: /\bre-?revi/i, tipo: 're-review' },
  { regla: 'fix', patron: /^(fix|arregl|correg|ola de arreglos)/i, tipo: 'fix' },
  {
    regla: 'review-final',
    patron: /whole-branch|\bfinal\b.*\b(review|revisi)|\b(review|revisi)\w*\b.*\bfinal\b/i,
    tipo: 'review-final',
  },
  { regla: 'review', patron: /\b(review|revis)/i, tipo: 'review' },
  { regla: 'research', patron: /^(research|investig)/i, tipo: 'research' },
  { regla: 'explore', patron: /^(explore|map|relevar)\b/i, tipo: 'explore' },
  { regla: 'write', patron: /^(redactar|bitácora|bitacora|documentar|escribir)\b|\bvault\b/i, tipo: 'write' },
  { regla: 'build', patron: /^(implement\w*|task|tarea|t\d+[a-z]?)\b/i, tipo: 'build' },
]

export function clasificarPorReglas(descripcion: string, subagentType: string): ResultadoRegla {
  if (subagentType === 'Explore') return { tipo: 'explore', regla: 'subagentType Explore' }
  if (/revisor-final/i.test(subagentType)) return { tipo: 'review-final', regla: `subagentType ${subagentType}` }
  for (const r of REGLAS) if (r.patron.test(descripcion)) return { tipo: r.tipo, regla: r.regla }
  return null
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `claude plugin test router`
Expected: PASS en todos los casos de `reglas`. Si un caso real falla, se corrige el patrón y
no el caso: los casos son la verdad.

- [ ] **Step 5: Commitear**

```bash
git add router/src/reglas.ts router/tests/reglas.test.ts
git commit -m "feat(router): reglas de clasificación con casos reales"
```

---

### Task 3: Resumen estructural y clasificador de respaldo

**Files:**
- Create: `router/src/resumen.ts`
- Create: `router/src/clasificadores/index.ts`
- Test: `router/tests/resumen.test.ts`

**Interfaces:**
- Consumes: `Tipo` de `../types`, `TIPOS` de `src/taxonomia`.
- Produces (en `src/resumen.ts`):
  - `type Resumen = { chars: number; archivos: number; pasos: number; mencionaSpec: boolean }`
  - `resumir(prompt: string): Resumen`
  - `textoResumen(descripcion: string, r: Resumen): string`
  - `tamanoPorRespaldo(r: Resumen): 'build-large' | 'build-small'`
- Produces (en `src/clasificadores/index.ts`):
  - `type Clasificacion = { tipo: Tipo; confianza?: number; ms: number; fuente: 'respaldo' | 'haiku' | 'jev' }`
  - `type PedidoClasificacion = { descripcion: string; resumen: Resumen; etiquetas: readonly Tipo[] }`
  - `type Clasificador = (p: PedidoClasificacion) => Promise<Clasificacion>`
  - `respaldo: Clasificador`
  - `TALLAS: readonly Tipo[]`

- [ ] **Step 1: Escribir el test (falla)**

`router/tests/resumen.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import { respaldo, TALLAS } from '../src/clasificadores'
import { resumir, tamanoPorRespaldo, textoResumen } from '../src/resumen'
import { TIPOS } from '../src/taxonomia'

const PROMPT_GRANDE = [
  'Implementá la Tarea 11 del plan docs/superpowers/plans/2026-09-10-compilador.md.',
  '1. Leé packages/compilador/respaldo.ts y packages/compilador/index.ts',
  '2. Escribí el test en packages/compilador/respaldo.test.ts',
  '3. Tocá packages/db/esquema.json, packages/db/vista.sql y packages/db/carga.ts',
  '4. Actualizá docs/LEEME.md y AGENTS.md',
  '- [ ] correr pnpm test',
].join('\n')

describe('resumen', () => {
  test('cuenta caracteres, archivos únicos, pasos y si menciona un spec o plan', () => {
    expect(resumir(PROMPT_GRANDE)).toEqual({
      chars: PROMPT_GRANDE.length,
      archivos: 9,
      pasos: 5,
      mencionaSpec: true,
    })
  })

  test('un prompt corto sin archivos', () => {
    expect(resumir('Arreglá el typo del título.')).toEqual({ chars: 27, archivos: 0, pasos: 0, mencionaSpec: false })
  })

  test('el texto del resumen no lleva el prompt, solo números', () => {
    const r = { chars: 6800, archivos: 9, pasos: 14, mencionaSpec: true }
    expect(textoResumen('Implement Task 11: el compilador', r)).toBe(
      'Implement Task 11: el compilador · prompt 6.8k chars · 9 archivos · 14 pasos · menciona spec',
    )
  })

  test('respaldo de talla: más de 5000 caracteres o más de 6 archivos es grande', () => {
    expect(tamanoPorRespaldo({ chars: 5001, archivos: 0, pasos: 0, mencionaSpec: false })).toBe('build-large')
    expect(tamanoPorRespaldo({ chars: 100, archivos: 7, pasos: 0, mencionaSpec: false })).toBe('build-large')
    expect(tamanoPorRespaldo({ chars: 5000, archivos: 6, pasos: 30, mencionaSpec: true })).toBe('build-small')
  })
})

describe('clasificador respaldo', () => {
  test('con etiquetas de talla usa el tamaño del prompt', async () => {
    const grande = { chars: 9000, archivos: 2, pasos: 0, mencionaSpec: false }
    expect(await respaldo({ descripcion: 'x', resumen: grande, etiquetas: TALLAS })).toEqual({
      tipo: 'build-large', ms: 0, fuente: 'respaldo',
    })
  })

  test('sin regla que aplique, siempre build-small', async () => {
    const grande = { chars: 9000, archivos: 20, pasos: 0, mencionaSpec: true }
    expect((await respaldo({ descripcion: 'x', resumen: grande, etiquetas: TIPOS })).tipo).toBe('build-small')
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `claude plugin test router`
Expected: FAIL. `resumen.test.ts` no puede importar `../src/clasificadores` ni `../src/resumen`.

- [ ] **Step 3: Implementar el resumen**

`router/src/resumen.ts`:
```ts
export type Resumen = { chars: number; archivos: number; pasos: number; mencionaSpec: boolean }

const ARCHIVO = /[\w./\\-]+\.(?:tsx?|jsx?|mjs|py|md|json|sql|ya?ml|css|sh)\b/g
const PASO = /^\s*(?:\d+[.)]\s|- \[ \]|\*\*Step \d+|Step \d+)/gm
const SPEC = /\b(spec|plan)\b|superpowers\/(specs|plans)/i

export function resumir(prompt: string): Resumen {
  return {
    chars: prompt.length,
    archivos: new Set(prompt.match(ARCHIVO) ?? []).size,
    pasos: (prompt.match(PASO) ?? []).length,
    mencionaSpec: SPEC.test(prompt),
  }
}

export function textoResumen(descripcion: string, r: Resumen): string {
  const chars = r.chars >= 1000 ? `${(r.chars / 1000).toFixed(1)}k` : String(r.chars)
  const spec = r.mencionaSpec ? ' · menciona spec' : ''
  return `${descripcion} · prompt ${chars} chars · ${r.archivos} archivos · ${r.pasos} pasos${spec}`
}

export function tamanoPorRespaldo(r: Resumen): 'build-large' | 'build-small' {
  return r.chars > 5000 || r.archivos > 6 ? 'build-large' : 'build-small'
}
```

Verificación a mano del caso `PROMPT_GRANDE`:
- **Archivos (9):** `docs/superpowers/plans/2026-09-10-compilador.md`,
  `packages/compilador/respaldo.ts`, `packages/compilador/index.ts`,
  `packages/compilador/respaldo.test.ts`, `packages/db/esquema.json`, `packages/db/vista.sql`,
  `packages/db/carga.ts`, `docs/LEEME.md` y `AGENTS.md`. `pnpm test` no matchea.
- **Pasos (5):** las líneas `1.` a `4.` y `- [ ]`.

- [ ] **Step 4: Implementar el clasificador de respaldo**

`router/src/clasificadores/index.ts`:
```ts
import type { Tipo } from '../../types'
import type { Resumen } from '../resumen'
import { tamanoPorRespaldo } from '../resumen'

export type Clasificacion = { tipo: Tipo; confianza?: number; ms: number; fuente: 'respaldo' | 'haiku' | 'jev' }

export type PedidoClasificacion = { descripcion: string; resumen: Resumen; etiquetas: readonly Tipo[] }

export type Clasificador = (p: PedidoClasificacion) => Promise<Clasificacion>

export const TALLAS: readonly Tipo[] = ['build-large', 'build-small']

function soloTallas(etiquetas: readonly Tipo[]): boolean {
  return etiquetas.length === TALLAS.length && TALLAS.every(t => etiquetas.includes(t))
}

/** Decide sin modelo: por tamaño si es un build; si no hubo regla, build-small. */
export const respaldo: Clasificador = async ({ resumen, etiquetas }) => ({
  tipo: soloTallas(etiquetas) ? tamanoPorRespaldo(resumen) : 'build-small',
  ms: 0,
  fuente: 'respaldo',
})
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `claude plugin test router`
Expected: PASS, los 6 tests nuevos y los anteriores.

- [ ] **Step 6: Commitear**

```bash
git add router/src/resumen.ts router/src/clasificadores router/tests/resumen.test.ts
git commit -m "feat(router): resumen estructural y clasificador de respaldo"
```

---

### Task 4: Política de uso

**Files:**
- Create: `router/src/politica.ts`
- Test: `router/tests/politica.test.ts`

**Interfaces:**
- Consumes: `LecturaUso` de `../types`; `TOPE` de `src/taxonomia`.
- Produces:
  - `type Modo = 'fuego' | 'sobra' | 'normal'`
  - `type Umbrales = { fuegoMinutos: number; fuegoUsado: number; sobraMinutos: number; sobraUsado: number }`
  - `UMBRALES_DEFAULT: Umbrales`
  - `umbralesDe(options: Readonly<Record<string, unknown>>): Umbrales`
  - `type EstadoPolitica = { modo: Modo; escalones: 0 | 1 | 2; motivo: string; minutosAlReset: number | null }`
  - `lecturaDe(rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[]): LecturaUso | null`
  - `politicaDe(lectura: LecturaUso | null, ahoraMs: number, u: Umbrales): EstadoPolitica`
  - `subir(base: number, escalones: number, techo: number | undefined): number`

- [ ] **Step 1: Escribir el test (falla)**

`router/tests/politica.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import { lecturaDe, politicaDe, subir, UMBRALES_DEFAULT, umbralesDe } from '../src/politica'

const AHORA = Date.parse('2026-10-06T12:00:00Z')
const enMinutos = (m: number) => new Date(AHORA + m * 60_000).toISOString()
const pol = (usado: number, minutos: number) =>
  politicaDe({ usado, resetsAt: enMinutos(minutos) }, AHORA, UMBRALES_DEFAULT)

describe('política', () => {
  test('sin lectura: normal', () => {
    expect(politicaDe(null, AHORA, UMBRALES_DEFAULT)).toEqual({
      modo: 'normal', escalones: 0, motivo: 'sin datos de uso', minutosAlReset: null,
    })
  })

  test('🔥 en los bordes: T ≤ 60 y U ≤ 70', () => {
    expect(pol(70, 60).modo).toBe('fuego')
    expect(pol(70, 60).escalones).toBe(2)
    expect(pol(70.1, 60).modo).toBe('sobra')
    expect(pol(70, 61).modo).toBe('sobra')
  })

  test('⬆️ en los bordes: T ≤ 120 y U ≤ 80', () => {
    expect(pol(80, 120).modo).toBe('sobra')
    expect(pol(80, 120).escalones).toBe(1)
    expect(pol(80.1, 120).modo).toBe('normal')
    expect(pol(10, 121).modo).toBe('normal')
  })

  test('nunca frena: uso muy alto queda en normal, nunca negativo', () => {
    expect(pol(99, 200)).toMatchObject({ modo: 'normal', escalones: 0 })
    expect(pol(100, 5)).toMatchObject({ modo: 'normal', escalones: 0 })
  })

  test('el motivo explica en una frase', () => {
    expect(pol(38, 24).motivo).toBe('queda 62% de 5h y el reset es en 24m: lo que no uses se pierde')
    expect(pol(38, 24).minutosAlReset).toBe(24)
  })

  test('lecturaDe toma la ventana five_hour', () => {
    expect(
      lecturaDe([
        { kind: 'seven_day', percentUsed: 61, resetsAt: enMinutos(3000) },
        { kind: 'five_hour', percentUsed: 31, resetsAt: enMinutos(90) },
      ]),
    ).toEqual({ usado: 31, resetsAt: enMinutos(90) })
    expect(lecturaDe([{ kind: 'five_hour', percentUsed: 31 }])).toBe(null)
    expect(lecturaDe([])).toBe(null)
  })

  test('subir respeta el tope de la escalera y el techo del tipo', () => {
    expect(subir(4, 2, undefined)).toBe(6)
    expect(subir(6, 2, undefined)).toBe(6)
    expect(subir(0, 2, 2)).toBe(2)
    expect(subir(0, 1, 2)).toBe(1)
  })

  test('umbralesDe usa los defaults para lo que falta o no es número', () => {
    expect(umbralesDe({})).toEqual(UMBRALES_DEFAULT)
    expect(umbralesDe({ fuegoMinutos: 45, sobraUsado: 'x' })).toEqual({ ...UMBRALES_DEFAULT, fuegoMinutos: 45 })
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `claude plugin test router`
Expected: FAIL. `politica.test.ts` no puede importar `../src/politica`.

- [ ] **Step 3: Implementar la política**

Si en la Task 1 los campos de `userConfig` quedaron como `string`, `umbralesDe` además tiene
que aceptar strings numéricos con `Number(valor)` cuando `Number.isFinite(Number(valor))`.

`router/src/politica.ts`:
```ts
import type { LecturaUso } from '../types'
import { TOPE } from './taxonomia'

export type Modo = 'fuego' | 'sobra' | 'normal'

export type Umbrales = { fuegoMinutos: number; fuegoUsado: number; sobraMinutos: number; sobraUsado: number }

export const UMBRALES_DEFAULT: Umbrales = { fuegoMinutos: 60, fuegoUsado: 70, sobraMinutos: 120, sobraUsado: 80 }

export type EstadoPolitica = { modo: Modo; escalones: 0 | 1 | 2; motivo: string; minutosAlReset: number | null }

export function umbralesDe(options: Readonly<Record<string, unknown>>): Umbrales {
  const n = (k: keyof Umbrales): number => {
    const v = options[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : UMBRALES_DEFAULT[k]
  }
  return { fuegoMinutos: n('fuegoMinutos'), fuegoUsado: n('fuegoUsado'), sobraMinutos: n('sobraMinutos'), sobraUsado: n('sobraUsado') }
}

export function lecturaDe(
  rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[],
): LecturaUso | null {
  const ventana = rateLimits.find(r => r.kind === 'five_hour')
  return ventana?.resetsAt ? { usado: ventana.percentUsed, resetsAt: ventana.resetsAt } : null
}

/** Solo sube: nunca devuelve escalones negativos. */
export function politicaDe(lectura: LecturaUso | null, ahoraMs: number, u: Umbrales): EstadoPolitica {
  if (!lectura) return { modo: 'normal', escalones: 0, motivo: 'sin datos de uso', minutosAlReset: null }
  const minutos = Math.max(0, Math.round((Date.parse(lectura.resetsAt) - ahoraMs) / 60_000))
  const libre = Math.round(100 - lectura.usado)
  if (minutos <= u.fuegoMinutos && lectura.usado <= u.fuegoUsado) {
    return {
      modo: 'fuego',
      escalones: 2,
      motivo: `queda ${libre}% de 5h y el reset es en ${minutos}m: lo que no uses se pierde`,
      minutosAlReset: minutos,
    }
  }
  if (minutos <= u.sobraMinutos && lectura.usado <= u.sobraUsado) {
    return { modo: 'sobra', escalones: 1, motivo: `queda ${libre}% de 5h y el reset es en ${minutos}m`, minutosAlReset: minutos }
  }
  return {
    modo: 'normal',
    escalones: 0,
    motivo: `usaste ${Math.round(lectura.usado)}% de 5h, reset en ${minutos}m`,
    minutosAlReset: minutos,
  }
}

export function subir(base: number, escalones: number, techo: number | undefined): number {
  return Math.min(base + escalones, techo ?? TOPE, TOPE)
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `claude plugin test router`
Expected: PASS.

- [ ] **Step 5: Commitear**

```bash
git add router/src/politica.ts router/tests/politica.test.ts
git commit -m "feat(router): política de uso que solo sube"
```

---

### Task 5: Overrides (`/router` y `[pin]`)

**Files:**
- Create: `router/src/overrides.ts`
- Test: `router/tests/overrides.test.ts`

**Interfaces:**
- Consumes: `Escalon`, `Modelo`, `Overrides`, `Tipo` de `../types`; `TIPOS`, `parseEscalon`,
  `formatEscalon` de `src/taxonomia`.
- Produces:
  - `OVERRIDES_INICIAL: Overrides`
  - `type Comando` (unión con `accion` igual a `panel`, `on`, `off`, `reset`, `permitir`
    (`modelos: Modelo[]`), `fijar` (`tipo: Tipo; escalon: Escalon`) o `error` (`mensaje: string`))
  - `AYUDA: string`
  - `parsearComando(args: string): Comando`
  - `aplicarComando(o: Overrides, c: Comando): Overrides`
  - `describirComando(c: Comando): string`
  - `tienePin(descripcion: string): boolean`
  - `LINEA_PIN: string`

- [ ] **Step 1: Escribir el test (falla)**

`router/tests/overrides.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import {
  aplicarComando, describirComando, LINEA_PIN, OVERRIDES_INICIAL, parsearComando, tienePin,
} from '../src/overrides'

describe('parsearComando', () => {
  test('sin argumentos o "panel" abre el panel', () => {
    expect(parsearComando('')).toEqual({ accion: 'panel' })
    expect(parsearComando('  panel ')).toEqual({ accion: 'panel' })
  })

  test('on, off, reset', () => {
    expect(parsearComando('off')).toEqual({ accion: 'off' })
    expect(parsearComando('ON')).toEqual({ accion: 'on' })
    expect(parsearComando('reset')).toEqual({ accion: 'reset' })
  })

  test('permitir con comas o espacios, sin repetidos', () => {
    expect(parsearComando('permitir sonnet,opus')).toEqual({ accion: 'permitir', modelos: ['sonnet', 'opus'] })
    expect(parsearComando('permitir sonnet, opus sonnet')).toEqual({ accion: 'permitir', modelos: ['sonnet', 'opus'] })
  })

  test('permitir rechaza modelos desconocidos', () => {
    expect(parsearComando('permitir gpt')).toMatchObject({ accion: 'error' })
    expect(parsearComando('permitir')).toMatchObject({ accion: 'error' })
  })

  test('fijar tipo y escalón', () => {
    expect(parsearComando('fijar review-final opus·max')).toEqual({
      accion: 'fijar', tipo: 'review-final', escalon: { modelo: 'opus', esfuerzo: 'max' },
    })
    expect(parsearComando('fijar explore sonnet low')).toEqual({
      accion: 'fijar', tipo: 'explore', escalon: { modelo: 'sonnet', esfuerzo: 'low' },
    })
  })

  test('fijar rechaza tipos o escalones inválidos', () => {
    expect(parsearComando('fijar cualquiera opus·high')).toMatchObject({ accion: 'error' })
    expect(parsearComando('fijar review opus')).toMatchObject({ accion: 'error' })
  })

  test('un verbo desconocido es un error con ayuda', () => {
    const c = parsearComando('bla')
    expect(c.accion).toBe('error')
    expect(c.accion === 'error' && c.mensaje.includes('Uso: /router')).toBe(true)
  })
})

describe('aplicarComando', () => {
  test('off y on', () => {
    const off = aplicarComando(OVERRIDES_INICIAL, { accion: 'off' })
    expect(off.activo).toBe(false)
    expect(aplicarComando(off, { accion: 'on' }).activo).toBe(true)
  })

  test('permitir y fijar se acumulan; reset vuelve al inicio', () => {
    let o = aplicarComando(OVERRIDES_INICIAL, { accion: 'permitir', modelos: ['sonnet', 'opus'] })
    o = aplicarComando(o, { accion: 'fijar', tipo: 'review', escalon: { modelo: 'opus', esfuerzo: 'max' } })
    expect(o).toEqual({
      activo: true,
      permitidos: ['sonnet', 'opus'],
      fijados: { review: { modelo: 'opus', esfuerzo: 'max' } },
    })
    expect(aplicarComando(o, { accion: 'reset' })).toEqual(OVERRIDES_INICIAL)
  })

  test('panel y error no cambian nada', () => {
    expect(aplicarComando(OVERRIDES_INICIAL, { accion: 'panel' })).toBe(OVERRIDES_INICIAL)
    expect(aplicarComando(OVERRIDES_INICIAL, { accion: 'error', mensaje: 'x' })).toBe(OVERRIDES_INICIAL)
  })

  test('describirComando confirma en una línea', () => {
    expect(describirComando({ accion: 'fijar', tipo: 'review', escalon: { modelo: 'opus', esfuerzo: 'max' } }))
      .toBe('Router: review queda fijado en opus·max para esta sesión.')
    expect(describirComando({ accion: 'permitir', modelos: ['sonnet', 'opus'] }))
      .toBe('Router: en esta sesión solo se usan sonnet, opus.')
  })
})

describe('pin', () => {
  test('detecta [pin] sin importar mayúsculas', () => {
    expect(tienePin('Review Task 3 [pin]')).toBe(true)
    expect(tienePin('[PIN] Explore')).toBe(true)
    expect(tienePin('Review Task 3')).toBe(false)
  })

  test('la línea para el system prompt menciona [pin] y description', () => {
    expect(LINEA_PIN.includes('[pin]')).toBe(true)
    expect(LINEA_PIN.includes('description')).toBe(true)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `claude plugin test router`
Expected: FAIL. `overrides.test.ts` no puede importar `../src/overrides`.

- [ ] **Step 3: Implementar los overrides**

`router/src/overrides.ts`:
```ts
import type { Escalon, Modelo, Overrides, Tipo } from '../types'
import { formatEscalon, parseEscalon, TIPOS } from './taxonomia'

export const OVERRIDES_INICIAL: Overrides = { activo: true, permitidos: null, fijados: {} }

export type Comando =
  | { accion: 'panel' }
  | { accion: 'on' }
  | { accion: 'off' }
  | { accion: 'reset' }
  | { accion: 'permitir'; modelos: Modelo[] }
  | { accion: 'fijar'; tipo: Tipo; escalon: Escalon }
  | { accion: 'error'; mensaje: string }

export const AYUDA =
  'Uso: /router · /router on|off|reset · /router permitir sonnet,opus · /router fijar <tipo> <modelo>·<esfuerzo>'

const MODELOS: readonly string[] = ['haiku', 'sonnet', 'opus']

export function parsearComando(args: string): Comando {
  const [verbo = '', ...resto] = args.trim().split(/\s+/).filter(Boolean)
  switch (verbo.toLowerCase()) {
    case '':
    case 'panel':
      return { accion: 'panel' }
    case 'on':
      return { accion: 'on' }
    case 'off':
      return { accion: 'off' }
    case 'reset':
      return { accion: 'reset' }
    case 'permitir': {
      const modelos = resto.join(',').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      const malos = modelos.filter(m => !MODELOS.includes(m))
      if (modelos.length === 0 || malos.length > 0) {
        return { accion: 'error', mensaje: `Modelos no válidos: ${malos.join(', ') || '(ninguno)'}. ${AYUDA}` }
      }
      return { accion: 'permitir', modelos: [...new Set(modelos)] as Modelo[] }
    }
    case 'fijar': {
      const [tipo, ...escalonTexto] = resto
      if (tipo === undefined || !(TIPOS as readonly string[]).includes(tipo)) {
        return { accion: 'error', mensaje: `Tipo no válido: ${tipo ?? '(vacío)'}. Tipos: ${TIPOS.join(', ')}` }
      }
      const escalon = parseEscalon(escalonTexto.join(' '))
      if (!escalon) {
        return {
          accion: 'error',
          mensaje: `Escalón no válido: "${escalonTexto.join(' ')}". Ejemplos: opus·xhigh, sonnet·medium, haiku`,
        }
      }
      return { accion: 'fijar', tipo: tipo as Tipo, escalon }
    }
    default:
      return { accion: 'error', mensaje: `No entiendo "${verbo}". ${AYUDA}` }
  }
}

export function aplicarComando(o: Overrides, c: Comando): Overrides {
  switch (c.accion) {
    case 'on':
      return { ...o, activo: true }
    case 'off':
      return { ...o, activo: false }
    case 'reset':
      return OVERRIDES_INICIAL
    case 'permitir':
      return { ...o, permitidos: c.modelos }
    case 'fijar':
      return { ...o, fijados: { ...o.fijados, [c.tipo]: c.escalon } }
    default:
      return o
  }
}

export function describirComando(c: Comando): string {
  switch (c.accion) {
    case 'on':
      return 'Router: prendido.'
    case 'off':
      return 'Router: apagado. Los subagentes salen con lo que pide Claude.'
    case 'reset':
      return 'Router: sin overrides en esta sesión.'
    case 'permitir':
      return `Router: en esta sesión solo se usan ${c.modelos.join(', ')}.`
    case 'fijar':
      return `Router: ${c.tipo} queda fijado en ${formatEscalon(c.escalon)} para esta sesión.`
    case 'error':
      return c.mensaje
    case 'panel':
      return 'Panel del router abierto.'
  }
}

export function tienePin(descripcion: string): boolean {
  return /\[pin\]/i.test(descripcion)
}

export const LINEA_PIN =
  'Router de subagentes: el modelo y el esfuerzo de cada subagente los elige un router según el tipo de tarea. ' +
  'Si necesitás que un subagente use exactamente el modelo que indicás en el parámetro `model`, ' +
  'poné `[pin]` en su `description`.'
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `claude plugin test router`
Expected: PASS.

- [ ] **Step 5: Commitear**

```bash
git add router/src/overrides.ts router/tests/overrides.test.ts
git commit -m "feat(router): overrides de /router y [pin]"
```

---

### Task 6: La decisión

**Files:**
- Create: `router/src/decidir.ts`
- Test: `router/tests/decidir.test.ts`

**Interfaces:**
- Consumes:
  - `clasificarPorReglas` (Task 2)
  - `resumir` (Task 3)
  - `Clasificador`, `TALLAS`, `respaldo` (Task 3)
  - `EstadoPolitica`, `subir` (Task 4)
  - `tienePin` (Task 5)
  - `BASE`, `TECHO`, `ESCALERA`, `TOPE`, `TIPOS`, `MODELO_ID`, `formatEscalon` (Task 1)
- Produces:
  - `type EntradaDecision = { descripcion: string; prompt: string; subagentType: string; modeloPedido: string | undefined; fork: boolean }`
  - `type Contexto = { overrides: Overrides; politica: EstadoPolitica; clasificar: Clasificador }`
  - `type Decision = { tocar: false; motivos: string[] } | { tocar: true; tipo: Tipo; escalon: Escalon; modeloId: string; motivos: string[] }`
  - `decidir(e: EntradaDecision, c: Contexto): Promise<Decision>`
  - `ajustarAPermitidos(e: Escalon, permitidos: readonly Modelo[] | null): Escalon`

Orden de precedencia, según el spec:
1. Si está apagado, no se toca.
2. Si es un fork, no se toca.
3. Si tiene `[pin]`, no se toca.
4. Tipo: reglas, y si hace falta, clasificador.
5. Si el tipo está fijado con `/router`, se usa ese escalón y se saltea la política.
6. Si no, la base más la política, hasta el techo.
7. Permitidos.

- [ ] **Step 1: Escribir el test (falla)**

`router/tests/decidir.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import type { Clasificador } from '../src/clasificadores'
import { respaldo } from '../src/clasificadores'
import { ajustarAPermitidos, decidir } from '../src/decidir'
import type { Contexto, EntradaDecision } from '../src/decidir'
import { OVERRIDES_INICIAL } from '../src/overrides'
import type { EstadoPolitica } from '../src/politica'

const NORMAL: EstadoPolitica = { modo: 'normal', escalones: 0, motivo: '', minutosAlReset: 200 }
const FUEGO: EstadoPolitica = { modo: 'fuego', escalones: 2, motivo: '', minutosAlReset: 20 }
const ctx = (cambios: Partial<Contexto> = {}): Contexto => ({
  overrides: OVERRIDES_INICIAL, politica: NORMAL, clasificar: respaldo, ...cambios,
})
const entrada = (cambios: Partial<EntradaDecision> = {}): EntradaDecision => ({
  descripcion: 'Review Task 6 (spec + quality)',
  prompt: 'Revisá la tarea 6.',
  subagentType: 'general-purpose',
  modeloPedido: 'sonnet',
  fork: false,
  ...cambios,
})

describe('decidir', () => {
  test('review en modo normal: opus·xhigh', async () => {
    const d = await decidir(entrada(), ctx())
    expect(d).toMatchObject({ tocar: true, tipo: 'review', escalon: { modelo: 'opus', esfuerzo: 'xhigh' }, modeloId: 'claude-opus-5-5' })
    expect(d.motivos).toEqual(['regla review'])
  })

  test('build chico con 🔥 sube dos niveles: sonnet·medium → opus·medium', async () => {
    const d = await decidir(entrada({ descripcion: 'Implement Task 5b: fecha como marcador' }), ctx({ politica: FUEGO }))
    expect(d).toMatchObject({ tipo: 'build-small', escalon: { modelo: 'opus', esfuerzo: 'medium' } })
    expect(d.motivos).toEqual(['regla build', 'respaldo → build-small', 'política +2'])
  })

  test('explore con 🔥 llega justo a su techo, sonnet·medium', async () => {
    // Con los valores actuales (base haiku, máximo +2) el techo nunca recorta: queda como
    // protección si alguien cambia la base o la política. `subir` ya testea el recorte.
    const d = await decidir(entrada({ descripcion: 'Explore: ingesta', subagentType: 'Explore' }), ctx({ politica: FUEGO }))
    expect(d).toMatchObject({ tipo: 'explore', escalon: { modelo: 'sonnet', esfuerzo: 'medium' }, modeloId: 'claude-sonnet-5-5' })
    expect(d.motivos).toEqual(['regla subagentType Explore', 'política +2'])
  })

  test('review ya está arriba de todo: la política no lo pasa del tope', async () => {
    const d = await decidir(entrada(), ctx({ politica: FUEGO }))
    expect(d).toMatchObject({ escalon: { modelo: 'opus', esfuerzo: 'xhigh' } })
  })

  test('sin regla, el clasificador recibe toda la taxonomía', async () => {
    let etiquetas: readonly string[] = []
    const espia: Clasificador = async p => { etiquetas = p.etiquetas; return { tipo: 'research', ms: 3, fuente: 'haiku', confianza: 0.81 } }
    const d = await decidir(entrada({ descripcion: 'Real data for Inicio' }), ctx({ clasificar: espia }))
    expect(etiquetas.length).toBe(9)
    expect(d).toMatchObject({ tipo: 'research' })
    expect(d.motivos).toEqual(['ninguna regla', 'haiku → research (0.81)'])
  })

  test('un build recibe solo las tallas', async () => {
    let etiquetas: readonly string[] = []
    const espia: Clasificador = async p => { etiquetas = p.etiquetas; return { tipo: 'build-large', ms: 3, fuente: 'jev' } }
    await decidir(entrada({ descripcion: 'Implement Task 11: el compilador' }), ctx({ clasificar: espia }))
    expect(etiquetas).toEqual(['build-large', 'build-small'])
  })

  test('apagado, fork y [pin] no se tocan', async () => {
    expect(await decidir(entrada(), ctx({ overrides: { ...OVERRIDES_INICIAL, activo: false } }))).toEqual({ tocar: false, motivos: ['router apagado'] })
    expect(await decidir(entrada({ fork: true }), ctx())).toEqual({ tocar: false, motivos: ['fork: hereda el modelo'] })
    expect(await decidir(entrada({ descripcion: 'Review Task 6 [pin]' }), ctx())).toEqual({ tocar: false, motivos: ['[pin]: respeta lo que pidió Claude'] })
  })

  test('fijado le gana a la política', async () => {
    const overrides = { ...OVERRIDES_INICIAL, fijados: { 'build-small': { modelo: 'sonnet' as const, esfuerzo: 'low' as const } } }
    const d = await decidir(entrada({ descripcion: 'Implement Task 2: tablas' }), ctx({ overrides, politica: FUEGO }))
    expect(d).toMatchObject({ escalon: { modelo: 'sonnet', esfuerzo: 'low' } })
    expect(d.motivos).toContain('fijado con /router: sonnet·low')
  })

  test('permitidos lleva al modelo permitido más cercano, prefiriendo subir', async () => {
    const overrides = { ...OVERRIDES_INICIAL, permitidos: ['sonnet' as const] }
    const d = await decidir(entrada(), ctx({ overrides }))
    expect(d).toMatchObject({ escalon: { modelo: 'sonnet', esfuerzo: 'high' }, modeloId: 'claude-sonnet-5-5' })
    expect(d.motivos).toContain('permitidos: sonnet')
  })
})

describe('ajustarAPermitidos', () => {
  test('sin restricción o modelo permitido: igual', () => {
    const e = { modelo: 'opus' as const, esfuerzo: 'high' as const }
    expect(ajustarAPermitidos(e, null)).toBe(e)
    expect(ajustarAPermitidos(e, ['opus'])).toBe(e)
  })

  test('haiku no permitido sube a sonnet·low', () => {
    expect(ajustarAPermitidos({ modelo: 'haiku' }, ['sonnet', 'opus'])).toEqual({ modelo: 'sonnet', esfuerzo: 'low' })
  })

  test('opus·max (fuera de la escalera) con solo sonnet baja a sonnet·high', () => {
    expect(ajustarAPermitidos({ modelo: 'opus', esfuerzo: 'max' }, ['sonnet'])).toEqual({ modelo: 'sonnet', esfuerzo: 'high' })
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `claude plugin test router`
Expected: FAIL. `decidir.test.ts` no puede importar `../src/decidir`.

- [ ] **Step 3: Implementar la decisión**

`router/src/decidir.ts`:
```ts
import type { Escalon, Modelo, Overrides, Tipo } from '../types'
import type { Clasificador } from './clasificadores'
import { TALLAS } from './clasificadores'
import { tienePin } from './overrides'
import type { EstadoPolitica } from './politica'
import { subir } from './politica'
import { clasificarPorReglas } from './reglas'
import { resumir } from './resumen'
import { BASE, ESCALERA, formatEscalon, MODELO_ID, TECHO, TIPOS, TOPE } from './taxonomia'

export type EntradaDecision = {
  descripcion: string
  prompt: string
  subagentType: string
  modeloPedido: string | undefined
  fork: boolean
}

export type Contexto = { overrides: Overrides; politica: EstadoPolitica; clasificar: Clasificador }

export type Decision =
  | { tocar: false; motivos: string[] }
  | { tocar: true; tipo: Tipo; escalon: Escalon; modeloId: string; motivos: string[] }

export async function decidir(e: EntradaDecision, c: Contexto): Promise<Decision> {
  if (!c.overrides.activo) return { tocar: false, motivos: ['router apagado'] }
  if (e.fork) return { tocar: false, motivos: ['fork: hereda el modelo'] }
  if (tienePin(e.descripcion)) return { tocar: false, motivos: ['[pin]: respeta lo que pidió Claude'] }

  const motivos: string[] = []
  const regla = clasificarPorReglas(e.descripcion, e.subagentType)
  let tipo: Tipo
  if (regla && regla.tipo !== 'build') {
    tipo = regla.tipo
    motivos.push(`regla ${regla.regla}`)
  } else {
    motivos.push(regla ? `regla ${regla.regla}` : 'ninguna regla')
    const cl = await c.clasificar({
      descripcion: e.descripcion,
      resumen: resumir(e.prompt),
      etiquetas: regla ? TALLAS : TIPOS,
    })
    tipo = cl.tipo
    motivos.push(cl.confianza === undefined ? `${cl.fuente} → ${cl.tipo}` : `${cl.fuente} → ${cl.tipo} (${cl.confianza.toFixed(2)})`)
  }

  let escalon: Escalon
  const fijado = c.overrides.fijados[tipo]
  if (fijado) {
    escalon = fijado
    motivos.push(`fijado con /router: ${formatEscalon(fijado)}`)
  } else {
    const deseado = BASE[tipo] + c.politica.escalones
    const i = subir(BASE[tipo], c.politica.escalones, TECHO[tipo])
    if (c.politica.escalones > 0 && BASE[tipo] < TOPE) motivos.push(`política +${c.politica.escalones}`)
    if (TECHO[tipo] !== undefined && deseado > TECHO[tipo]!) motivos.push(`techo de ${tipo}`)
    escalon = ESCALERA[i]!
  }

  const final = ajustarAPermitidos(escalon, c.overrides.permitidos)
  if (final !== escalon) motivos.push(`permitidos: ${c.overrides.permitidos!.join(',')}`)
  return { tocar: true, tipo, escalon: final, modeloId: MODELO_ID[final.modelo], motivos }
}

/** Si el modelo no está permitido, busca el escalón permitido más cercano; ante empate, sube. */
export function ajustarAPermitidos(e: Escalon, permitidos: readonly Modelo[] | null): Escalon {
  if (!permitidos || permitidos.includes(e.modelo)) return e
  const exacto = ESCALERA.findIndex(x => x.modelo === e.modelo && x.esfuerzo === e.esfuerzo)
  // Un escalón fijado fuera de la escalera (opus·max) arranca desde el más alto de su modelo.
  const desde = exacto !== -1 ? exacto : ESCALERA.map(x => x.modelo).lastIndexOf(e.modelo)
  for (let d = 1; d <= TOPE; d++) {
    const arriba = ESCALERA[desde + d]
    if (arriba && permitidos.includes(arriba.modelo)) return arriba
    const abajo = ESCALERA[desde - d]
    if (abajo && permitidos.includes(abajo.modelo)) return abajo
  }
  return e
}
```

Nota sobre los motivos: "review ya está arriba de todo" no agrega `política +2`, porque
`BASE.review === TOPE`. El test del build con 🔥 espera exactamente
`['regla build', 'respaldo → build-small', 'política +2']`.

- [ ] **Step 4: Correr y ver que pasa**

Run: `claude plugin test router`
Expected: PASS.

- [ ] **Step 5: Commitear**

```bash
git add router/src/decidir.ts router/tests/decidir.test.ts
git commit -m "feat(router): pipeline de decisión"
```

---

### Task 7: Registro de tareas y métricas de sesión

**Files:**
- Create: `router/src/registro.ts`
- Test: `router/tests/registro.test.ts`

**Interfaces:**
- Consumes: `Subagente`, `Tipo` de `../types`.
- Produces:
  - `tareaDe(descripcion: string): string | null`
  - `type ResumenTarea = { tarea: string; pasos: { tipo: Tipo | null; terminado: boolean }[]; rondas: number; minutos: number; activa: boolean }`
  - `agruparPorTarea(subs: readonly Subagente[], ahora: number): ResumenTarea[]`
  - `type MetricasSesion = { reviewsEnOpus: number | null; rondasPorTarea: number | null; minutosPorTarea: number | null; reasignados: number; total: number }`
  - `metricasDe(subs: readonly Subagente[], ahora: number): MetricasSesion`
  - `BASE_METRICAS: { reviewsEnOpus: 0.17; rondasPorTarea: 0.49 }`

La línea base sale de los transcripts del 2026-09-01 al 2026-10-02:
- **Reviews en Opus:** 64 de 366 revisiones (review, review-final y re-review), o sea 0,17.
- **Re-reviews por tarea revisada:** 103 / 210, o sea 0,49.
- **Minutos por tarea:** no hay base todavía (llega en la fase 3).

- [ ] **Step 1: Escribir el test (falla)**

`router/tests/registro.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import type { Subagente } from '../types'
import { agruparPorTarea, metricasDe, tareaDe } from '../src/registro'

const MIN = 60_000
const sub = (c: Partial<Subagente>): Subagente => ({
  agentId: 'a', descripcion: '', tarea: null, tipo: null, pedido: 'sonnet', elegido: 'sonnet',
  escalon: null, motivos: [], reasignado: false, inicio: 0, fin: null, ...c,
})

describe('tareaDe', () => {
  test('reconoce Task, Tarea y T<n>', () => {
    expect(tareaDe('Implement Task 6: ranking de meses')).toBe('Tarea 6')
    expect(tareaDe('Review Tasks 2+3 (spec + quality)')).toBe('Tarea 2')
    expect(tareaDe('Revisión de la tarea 4')).toBe('Tarea 4')
    expect(tareaDe('Re-revision de T10, rondas 2 y 3')).toBe('Tarea 10')
    expect(tareaDe('Task 1c: casos sellado')).toBe('Tarea 1c')
    expect(tareaDe('T3 la cola')).toBe('Tarea 3')
  })

  test('sin tarea', () => {
    expect(tareaDe('Final whole-branch review')).toBe(null)
    expect(tareaDe('Fix V5: fecha')).toBe(null)
  })
})

describe('agruparPorTarea', () => {
  test('arma el ciclo, cuenta rondas y minutos', () => {
    const subs = [
      sub({ agentId: '1', tarea: 'Tarea 4', tipo: 'build-small', inicio: 0, fin: 10 * MIN }),
      sub({ agentId: '2', tarea: 'Tarea 4', tipo: 'review', inicio: 10 * MIN, fin: 18 * MIN }),
      sub({ agentId: '3', tarea: 'Tarea 4', tipo: 're-review', inicio: 20 * MIN, fin: 25 * MIN }),
      sub({ agentId: '4', tarea: 'Tarea 4', tipo: 're-review', inicio: 26 * MIN, fin: 31 * MIN }),
      sub({ agentId: '5', tarea: 'Tarea 6', tipo: 'build-small', inicio: 30 * MIN, fin: null }),
      sub({ agentId: '6', tarea: null, tipo: 'explore', inicio: 0, fin: MIN }),
    ]
    expect(agruparPorTarea(subs, 40 * MIN)).toEqual([
      {
        tarea: 'Tarea 4',
        pasos: [
          { tipo: 'build-small', terminado: true },
          { tipo: 'review', terminado: true },
          { tipo: 're-review', terminado: true },
          { tipo: 're-review', terminado: true },
        ],
        rondas: 2,
        minutos: 31,
        activa: false,
      },
      { tarea: 'Tarea 6', pasos: [{ tipo: 'build-small', terminado: false }], rondas: 0, minutos: 10, activa: true },
    ])
  })
})

describe('metricasDe', () => {
  test('sin subagentes: todo null o cero', () => {
    expect(metricasDe([], 0)).toEqual({ reviewsEnOpus: null, rondasPorTarea: null, minutosPorTarea: null, reasignados: 0, total: 0 })
  })

  test('calcula sobre la sesión', () => {
    const subs = [
      sub({ agentId: '1', tarea: 'Tarea 1', tipo: 'build-small', inicio: 0, fin: 10 * MIN, reasignado: true }),
      sub({ agentId: '2', tarea: 'Tarea 1', tipo: 'review', escalon: { modelo: 'opus', esfuerzo: 'xhigh' }, inicio: 10 * MIN, fin: 20 * MIN, reasignado: true }),
      sub({ agentId: '3', tarea: 'Tarea 1', tipo: 're-review', escalon: { modelo: 'opus', esfuerzo: 'medium' }, inicio: 20 * MIN, fin: 30 * MIN }),
      sub({ agentId: '4', tarea: 'Tarea 2', tipo: 'review', escalon: null, pedido: 'sonnet', inicio: 0, fin: 5 * MIN }),
    ]
    expect(metricasDe(subs, 60 * MIN)).toEqual({
      reviewsEnOpus: 2 / 3,
      rondasPorTarea: 0.5,
      minutosPorTarea: 17.5,
      reasignados: 2,
      total: 4,
    })
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `claude plugin test router`
Expected: FAIL. `registro.test.ts` no puede importar `../src/registro`.

- [ ] **Step 3: Implementar el registro**

`router/src/registro.ts`:
```ts
import type { Subagente, Tipo } from '../types'

export function tareaDe(descripcion: string): string | null {
  const m = descripcion.match(/\b(?:task|tarea)s?\s+(\d+[a-z]?)/i) ?? descripcion.match(/\bT(\d+[a-z]?)\b/)
  return m ? `Tarea ${m[1]}` : null
}

export type ResumenTarea = {
  tarea: string
  pasos: { tipo: Tipo | null; terminado: boolean }[]
  rondas: number
  minutos: number
  activa: boolean
}

export function agruparPorTarea(subs: readonly Subagente[], ahora: number): ResumenTarea[] {
  const grupos = new Map<string, Subagente[]>()
  for (const s of subs) if (s.tarea) grupos.set(s.tarea, [...(grupos.get(s.tarea) ?? []), s])
  return [...grupos].map(([tarea, lista]) => {
    const activa = lista.some(s => s.fin === null)
    const inicio = Math.min(...lista.map(s => s.inicio))
    const fin = activa ? ahora : Math.max(...lista.map(s => s.fin ?? ahora))
    return {
      tarea,
      pasos: lista.map(s => ({ tipo: s.tipo, terminado: s.fin !== null })),
      rondas: lista.filter(s => s.tipo === 're-review').length,
      minutos: Math.round((fin - inicio) / 60_000),
      activa,
    }
  })
}

export const BASE_METRICAS = { reviewsEnOpus: 0.17, rondasPorTarea: 0.49 } as const

export type MetricasSesion = {
  reviewsEnOpus: number | null
  rondasPorTarea: number | null
  minutosPorTarea: number | null
  reasignados: number
  total: number
}

const REVISIONES: readonly (Tipo | null)[] = ['review', 'review-final', 're-review']

export function metricasDe(subs: readonly Subagente[], ahora: number): MetricasSesion {
  const revisiones = subs.filter(s => REVISIONES.includes(s.tipo))
  const enOpus = revisiones.filter(s => (s.escalon ? s.escalon.modelo === 'opus' : /opus/i.test(s.pedido))).length
  const tareas = agruparPorTarea(subs, ahora)
  const revisadas = tareas.filter(t => t.pasos.some(p => p.tipo === 'review'))
  const terminadas = tareas.filter(t => !t.activa)
  const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  return {
    reviewsEnOpus: revisiones.length ? enOpus / revisiones.length : null,
    rondasPorTarea: promedio(revisadas.map(t => t.rondas)),
    minutosPorTarea: promedio(terminadas.map(t => t.minutos)),
    reasignados: subs.filter(s => s.reasignado).length,
    total: subs.length,
  }
}
```

Verificación a mano del test de métricas:
- **Revisiones:** 3. La 2 y la 3 son opus por escalón; la 4 es sonnet pedido sin tocar.
  Da 2/3.
- **Tareas revisadas:** las dos. La Tarea 1 tiene 1 ronda y la Tarea 2 tiene 0, así que el
  promedio es 0,5.
- **Minutos:** la Tarea 1 va de 0 a 30, son 30 minutos. La Tarea 2 va de 0 a 5, son 5 minutos.
  El promedio da 17,5.

- [ ] **Step 4: Correr y ver que pasa**

Run: `claude plugin test router`
Expected: PASS.

- [ ] **Step 5: Commitear**

```bash
git add router/src/registro.ts router/tests/registro.test.ts
git commit -m "feat(router): registro por tarea y métricas de sesión"
```

---

### Task 8: Conectar los eventos (`register.tsx`)

**Files:**
- Create: `router/src/estado.ts`
- Modify: `router/hooks/register.tsx` (se reemplaza el stub de la Task 1)
- Test: `router/tests/register.test.ts`

**Interfaces:**
- Consumes: todo lo anterior. `atom`, `read` y `update` de `'claude-code'`; `EngineInterface` y
  `Register` como tipos.
- Produces (en `src/estado.ts`): `subagentesAtom`, `overridesAtom`, `lecturaAtom`,
  `pestanaAtom`. Son atoms de `$.state` bajo el plugin `router`.
- Produces (en `register.tsx`), de cara a la Task 9: `refrescarLinea($)` llama a
  `$.ui.status(...)`. La Task 9 agrega `textoLinea` y `registrarPanel`. En esta task,
  `refrescarLinea` usa un `textoLinea` mínimo que ya queda en su archivo definitivo.

- [ ] **Step 1: Crear los atoms**

`router/src/estado.ts`:
```ts
import { atom } from 'claude-code'
import type { LecturaUso, Overrides, Pestana, Subagente } from '../types'
import { OVERRIDES_INICIAL } from './overrides'

export const subagentesAtom = atom({ plugin: 'router', key: 'subagentes' } as const, [] as Subagente[])
export const overridesAtom = atom({ plugin: 'router', key: 'overrides' } as const, OVERRIDES_INICIAL)
export const lecturaAtom = atom({ plugin: 'router', key: 'lectura' } as const, null as LecturaUso | null)
export const pestanaAtom = atom({ plugin: 'router', key: 'pestana' } as const, 'curso' as Pestana)
```

- [ ] **Step 2: Crear un `textoLinea` mínimo (la Task 9 lo testea a fondo)**

`router/src/ui/linea.ts`:
```ts
import type { EstadoPolitica } from '../politica'

export function textoLinea(p: EstadoPolitica, m: { reasignados: number; total: number }): string | undefined {
  const partes: string[] = []
  if (p.modo === 'fuego') partes.push(`🔥 subiendo dos niveles hasta el reset (${p.minutosAlReset}m)`)
  if (p.modo === 'sobra') partes.push(`⬆️ subiendo un nivel hasta el reset (${p.minutosAlReset}m)`)
  if (m.reasignados > 0) partes.push(`${m.reasignados} de ${m.total} subagentes reasignados`)
  return partes.length > 0 ? `router · ${partes.join(' · ')} · /router` : undefined
}
```

- [ ] **Step 3: Escribir el test de integración (falla)**

`router/tests/register.test.ts`:
```ts
import { describe, expect, mock, test } from 'claude-code/testing'

const AHORA = Date.parse('2026-10-06T12:00:00Z')

const SPAWN = {
  tool_use_id: 'tu-1',
  prompt: 'Revisá la tarea 6 contra el spec.',
  description: 'Review Task 6 (spec + quality)',
  subagentType: 'general-purpose',
  provider: { plugin: 'engine', tier: 'core' },
  model: 'sonnet',
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
} as const

const finDePaso = (e: { turnId: string; index: number }) => ({
  turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null,
})

describe('register', () => {
  test('un review sale en opus y su esfuerzo xhigh llega a cada request del subagente', async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-1' } })
    let esfuerzo: unknown = 'sin tocar'
    on('turn.step', async function* (_$, e) { esfuerzo = e.effort; return finDePaso(e) })

    const r = await $.agent.spawn(SPAWN)
    expect(r.agentId).toBe('ag-1')
    expect(modelo).toBe('claude-opus-5-5')

    const paso = $.turn.step({ turnId: 't-1', index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 3, agentId: 'ag-1' })
    for await (const _ of paso) { /* consumir el stream */ }
    expect(esfuerzo).toBe('xhigh')
  })

  test('los requests de la sesión principal no se tocan', async ($, on) => {
    mock.clock(on, { now: AHORA })
    let esfuerzo: unknown
    on('turn.step', async function* (_$, e) { esfuerzo = e.effort; return finDePaso(e) })
    const paso = $.turn.step({ turnId: 't-2', index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 3 })
    for await (const _ of paso) { /* consumir */ }
    expect(esfuerzo).toBe('medium')
  })

  test('un fork sale tal cual', async ($, on) => {
    mock.clock(on, { now: AHORA })
    let modelo: string | undefined = 'sin llamar'
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: 'inherit', agentId: 'ag-2' } })
    await $.agent.spawn({ ...SPAWN, fork: true, model: undefined })
    expect(modelo).toBe(undefined)
  })

  test('/router off apaga el router y la respuesta lo confirma', async ($, on) => {
    mock.clock(on, { now: AHORA })
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-3' } })
    const out = await $.command.run({ command: 'router', args: 'off' })
    expect(out.text).toBe('Router: apagado. Los subagentes salen con lo que pide Claude.')
    await $.agent.spawn(SPAWN)
    expect(modelo).toBe('sonnet')
  })

  test('con 🔥 un build chico sube a opus·medium', async ($, on) => {
    mock.clock(on, { now: AHORA })
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-4' } })
    on('session.measure', async (_$, e) => ({ changed: e.changed }))
    await $.session.measure({
      context: { window: 1_000_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 38, resetsAt: new Date(AHORA + 24 * 60_000).toISOString() }],
      changed: ['rateLimits'],
    })
    await $.agent.spawn({ ...SPAWN, description: 'Implement Task 5b: fecha como marcador' })
    expect(modelo).toBe('claude-opus-5-5')
  })

  test('el system prompt suma la línea de [pin]', async ($, on) => {
    on('prompt.compose', async () => ({ sections: [{ id: 'intro', text: 'Hola', scope: 'shared' as const }] }))
    const r = await $.prompt.compose({
      model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [],
    })
    expect(r.sections.map(s => s.id)).toEqual(['intro', 'router:pin'])
  })
})
```

Si un test falla porque el motor de test no tiene implementación para un sustantivo que usa el
plugin (el mensaje del fallo nombra el evento, por ejemplo `ui.status` o `command.register`),
agregá en ese test un hook que lo responda. Ejemplo: `on('ui.status', async () => undefined)`.
Usá el tipo de resultado que pida `ResultOf` para ese evento. Si `$.command.run` exige más
campos (`origin`, `presentation`), completalos con los valores que muestre el error de tipos.

- [ ] **Step 4: Correr y ver que falla**

Run: `claude plugin test router`
Expected: FAIL. El stub de `register` no toca nada: el modelo llega como `sonnet` y el esfuerzo
como `medium`.

- [ ] **Step 5: Implementar `register.tsx`**

`router/hooks/register.tsx`:
```tsx
import { read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Subagente } from '../types'
import { respaldo } from '../src/clasificadores'
import type { Decision } from '../src/decidir'
import { decidir } from '../src/decidir'
import { lecturaAtom, overridesAtom, subagentesAtom } from '../src/estado'
import { aplicarComando, describirComando, LINEA_PIN, parsearComando } from '../src/overrides'
import { lecturaDe, politicaDe, umbralesDe } from '../src/politica'
import { metricasDe, tareaDe } from '../src/registro'
import { formatEscalon } from '../src/taxonomia'
import { textoLinea } from '../src/ui/linea'

export const PANE = 'router'

export const register: Register = (on, options) => {
  const umbrales = umbralesDe(options)

  async function refrescarLinea($: EngineInterface): Promise<void> {
    const [subs, lectura, ahora] = await Promise.all([read($, subagentesAtom), read($, lecturaAtom), $.clock.now()])
    $.ui.status(textoLinea(politicaDe(lectura, ahora, umbrales), metricasDe(subs, ahora)))
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'router',
      description: 'Router de subagentes: panel y overrides (on, off, reset, permitir, fijar)',
    })
    // La línea dice "reset en Nm": se refresca cada minuto aunque no pase nada.
    $.clock.every(60_000, () => void refrescarLinea($))
    return next(e)
  })

  on('prompt.compose', async (_$, e, next) => {
    const r = await next(e)
    return { sections: [...r.sections, { id: 'router:pin', text: LINEA_PIN, scope: 'session' }] }
  })

  on('session.measure', async ($, e, next) => {
    const lectura = lecturaDe(e.rateLimits)
    if (lectura) await update($, lecturaAtom, () => lectura)
    await refrescarLinea($)
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const ahora = await $.clock.now()
    let decision: Decision
    try {
      const [overrides, lectura] = await Promise.all([read($, overridesAtom), read($, lecturaAtom)])
      decision = await decidir(
        { descripcion: e.description, prompt: e.prompt, subagentType: e.subagentType, modeloPedido: e.model, fork: e.fork },
        { overrides, politica: politicaDe(lectura, ahora, umbrales), clasificar: respaldo },
      )
    } catch (error) {
      // Nunca bloquea: si el router falla, el subagente sale con lo que pidió Claude.
      decision = { tocar: false, motivos: [`error del router: ${String(error)}`] }
    }

    const resultado = decision.tocar ? await next({ ...e, model: decision.modeloId }) : await next(e)

    if (resultado.agentId !== undefined) {
      const pedido = e.model ?? 'inherit'
      const sub: Subagente = {
        agentId: resultado.agentId,
        descripcion: e.description,
        tarea: tareaDe(e.description),
        tipo: decision.tocar ? decision.tipo : null,
        pedido,
        elegido: decision.tocar ? formatEscalon(decision.escalon) : pedido,
        escalon: decision.tocar ? decision.escalon : null,
        motivos: decision.motivos,
        reasignado: decision.tocar && !pedido.toLowerCase().includes(decision.escalon.modelo),
        inicio: ahora,
        fin: null,
      }
      try {
        await update($, subagentesAtom, lista => [...lista, sub].slice(-200))
        await refrescarLinea($)
      } catch {
        // Registrar es secundario: el subagente ya salió.
      }
    }
    return resultado
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) return yield* next(e)
    const subs = await read($, subagentesAtom)
    const esfuerzo = subs.find(s => s.agentId === e.agentId)?.escalon?.esfuerzo
    return yield* next(esfuerzo === undefined ? e : { ...e, effort: esfuerzo })
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const ahora = await $.clock.now()
      await update($, subagentesAtom, lista =>
        lista.map(s => (s.agentId === e.agentId && s.fin === null ? { ...s, fin: ahora } : s)),
      )
      await refrescarLinea($)
    }
    return next(e)
  })

  on('command.run', { command: 'router' }, async ($, e) => {
    const comando = parsearComando(e.args)
    if (comando.accion === 'panel') {
      await $.ui.open({ id: PANE, title: 'Router' })
      return { text: describirComando(comando) }
    }
    if (comando.accion !== 'error') {
      await update($, overridesAtom, o => aplicarComando(o, comando))
      await refrescarLinea($)
    }
    return { text: describirComando(comando) }
  })
}
```

Sobre `turn.step`: si `effort` no admite `'max'` en la versión instalada, tsc lo va a marcar. En
ese caso, mapear `'max'` a `'max'` solo si el tipo lo incluye, y si no, a `'xhigh'`. Los tipos
de la 2.1.288 incluyen `'max'`.

- [ ] **Step 6: Correr y ver que pasa**

Run: `claude plugin test router`
Expected: PASS, los 6 tests de `register` y todos los anteriores.

- [ ] **Step 7: Validar y commitear**

Run: `claude plugin validate router`
Expected: sin errores. Los `hooks:` listan `session.start`, `prompt.compose`,
`session.measure`, `agent.spawn`, `turn.step`, `turn.complete` y `command.run`.

```bash
git add router/hooks/register.tsx router/src/estado.ts router/src/ui/linea.ts router/tests/register.test.ts
git commit -m "feat(router): conectar spawn, step, measure, compose y /router"
```

---

### Task 9: Línea informativa y panel con dos pestañas

**Files:**
- Create: `router/src/ui/panel.tsx`
- Modify: `router/hooks/register.tsx`, para llamar a `registrarPanel(on, umbrales)` al final de
  `register`
- Test: `router/tests/linea.test.ts`
- Test: `router/tests/panel.test.tsx`

**Interfaces:**
- Consumes:
  - `textoLinea` (Task 8)
  - `politicaDe`, `Umbrales` (Task 4)
  - `agruparPorTarea`, `metricasDe`, `BASE_METRICAS` (Task 7)
  - los atoms (Task 8)
  - `PANE` (en `register.tsx`)
- Produces: `registrarPanel(on: On, umbrales: Umbrales): void` en `src/ui/panel.tsx`.

Diseño del panel, según el spec:
- **Pestañas:** dos `Button` (`tab-curso` con hotkey `1` y `tab-metricas` con hotkey `2`).
- **"En curso":**
  - el modo con su motivo;
  - los subagentes activos: descripción, tipo, `pedido → elegido` y motivos (los motivos se
    ocultan si `bodyColumns < 70`);
  - un bloque por tarea;
  - los overrides activos.
- **"Métricas vs tu base":** reviews en Opus, rondas por tarea y minutos por tarea, contra
  `BASE_METRICAS`, más `reasignados de total`.

`PANE` está definido en `register.tsx`. Para evitar un import circular, `panel.tsx` declara su
propia constante `PANE = 'router'` y `register.tsx` la importa de `panel.tsx`. En el Step 4 se
borra la de `register.tsx`.

- [ ] **Step 1: Escribir los tests (fallan)**

`router/tests/linea.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import { textoLinea } from '../src/ui/linea'

const pol = (modo: 'fuego' | 'sobra' | 'normal', minutos: number | null = 24) => ({
  modo, escalones: modo === 'fuego' ? 2 : modo === 'sobra' ? 1 : 0, motivo: '', minutosAlReset: minutos,
} as const)

describe('línea informativa', () => {
  test('normal y sin reasignaciones: no se muestra', () => {
    expect(textoLinea(pol('normal'), { reasignados: 0, total: 3 })).toBe(undefined)
  })

  test('🔥 con reasignaciones', () => {
    expect(textoLinea(pol('fuego'), { reasignados: 3, total: 4 })).toBe(
      'router · 🔥 subiendo dos niveles hasta el reset (24m) · 3 de 4 subagentes reasignados · /router',
    )
  })

  test('⬆️ sin reasignaciones', () => {
    expect(textoLinea(pol('sobra', 95), { reasignados: 0, total: 0 })).toBe(
      'router · ⬆️ subiendo un nivel hasta el reset (95m) · /router',
    )
  })

  test('normal con reasignaciones', () => {
    expect(textoLinea(pol('normal'), { reasignados: 2, total: 5 })).toBe('router · 2 de 5 subagentes reasignados · /router')
  })

  test('no repite el statusline: ni porcentaje de 5h ni de 7d', () => {
    const t = textoLinea(pol('fuego'), { reasignados: 1, total: 1 }) ?? ''
    expect(/%|7d|contexto/.test(t)).toBe(false)
  })
})
```

`router/tests/panel.test.tsx`:
```tsx
import { describe, expect, mock, test } from 'claude-code/testing'

const AHORA = Date.parse('2026-10-06T12:00:00Z')
const SPAWN = {
  tool_use_id: 'tu-1',
  prompt: 'Revisá la tarea 6.',
  description: 'Review Task 6 (spec + quality)',
  subagentType: 'general-purpose',
  provider: { plugin: 'engine', tier: 'core' },
  model: 'sonnet',
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
} as const
const PROPS = {
  title: 'Router', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {},
} as const

describe('panel', () => {
  test('En curso muestra la decisión y Métricas compara con la base', async ($, on) => {
    mock.clock(on, { now: AHORA })
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-1' }))
    await $.agent.spawn(SPAWN)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'router', surface, component: 'Pane', requestId: 'router', props: PROPS })
      expect(await ui.find({ text: /Review Task 6/ })).toBeDefined()
      expect(await ui.find({ text: /sonnet → opus·xhigh/ })).toBeDefined()
      expect(await ui.find({ text: /regla review/ })).toBeDefined()

      await ui.press({ key: 'tab-metricas' })
      expect(await ui.find({ text: /reviews en Opus/ })).toBeDefined()
      expect(await ui.find({ text: /antes 17%/ })).toBeDefined()

      await ui.press({ key: 'tab-curso' })
      await ui.unmount()
    }
  })

  test('angosto oculta los motivos', async ($, on) => {
    mock.clock(on, { now: AHORA })
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-1' }))
    await $.agent.spawn(SPAWN)
    const ui = await $.ui.mount({
      plugin: 'router', surface: 'terminal', component: 'Pane', requestId: 'router', props: { ...PROPS, bodyColumns: 60 },
    })
    expect(await ui.find({ text: /sonnet → opus·xhigh/ })).toBeDefined()
    expect(await ui.find({ text: /regla review/ })).toBe(undefined)
    await ui.unmount()
  })
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `claude plugin test router`
Expected: `linea.test.ts` PASA, porque `textoLinea` ya existe desde la Task 8. `panel.test.tsx`
FALLA porque nadie dibuja el `Pane`.

- [ ] **Step 3: Implementar el panel**

`router/src/ui/panel.tsx`:
```tsx
import { read, update } from 'claude-code'
import type { On } from 'claude-code'
import { lecturaAtom, overridesAtom, pestanaAtom, subagentesAtom } from '../estado'
import type { Umbrales } from '../politica'
import { politicaDe } from '../politica'
import { agruparPorTarea, BASE_METRICAS, metricasDe } from '../registro'
import { formatEscalon } from '../taxonomia'

export const PANE = 'router'

const MODO_ICONO = { fuego: '🔥', sobra: '⬆️', normal: '⚪' } as const
const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`)
const num = (x: number | null, d = 1) => (x === null ? '—' : x.toFixed(d))

export function registrarPanel(on: On, umbrales: Umbrales): void {
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const [pestana, subs, overrides, lectura, ahora] = await Promise.all([
      read($, pestanaAtom), read($, subagentesAtom), read($, overridesAtom), read($, lecturaAtom), $.clock.now(),
    ])
    const politica = politicaDe(lectura, ahora, umbrales)
    const conMotivos = e.props.bodyColumns >= 70

    const pestanas = (
      <Box gap={2}>
        <Button key="tab-curso" hotkey="1" label={pestana === 'curso' ? '● En curso' : 'En curso'}
          onPress={() => update($, pestanaAtom, () => 'curso')} />
        <Button key="tab-metricas" hotkey="2" label={pestana === 'metricas' ? '● Métricas vs tu base' : 'Métricas vs tu base'}
          onPress={() => update($, pestanaAtom, () => 'metricas')} />
      </Box>
    )

    if (pestana === 'metricas') {
      const m = metricasDe(subs, ahora)
      return (
        <Box flexDirection="column" gap={1}>
          {pestanas}
          <Text bold>SESIÓN vs TU BASE</Text>
          <Text>reviews en Opus   {pct(m.reviewsEnOpus)}  (antes {pct(BASE_METRICAS.reviewsEnOpus)})</Text>
          <Text>rondas/tarea      {num(m.rondasPorTarea)}  (antes {num(BASE_METRICAS.rondasPorTarea, 2)})</Text>
          <Text>min/tarea         {num(m.minutosPorTarea, 0)}  (sin base todavía)</Text>
          <Text dimColor>{m.reasignados} de {m.total} subagentes reasignados en esta sesión</Text>
        </Box>
      )
    }

    const activos = subs.filter(s => s.fin === null)
    const tareas = agruparPorTarea(subs, ahora).slice(-8)
    const fijados = Object.entries(overrides.fijados).map(([t, esc]) => `${t} ${esc ? formatEscalon(esc) : ''}`)
    return (
      <Box flexDirection="column" gap={1}>
        {pestanas}
        <Box flexDirection="column">
          <Text bold>VENTANA</Text>
          <Text>{MODO_ICONO[politica.modo]} {politica.motivo}</Text>
          {!overrides.activo && <Text color="yellow">Router apagado: /router on para prenderlo</Text>}
        </Box>
        <Box flexDirection="column">
          <Text bold>EN CURSO</Text>
          {activos.length === 0 && <Text dimColor>Sin subagentes corriendo.</Text>}
          {activos.map(s => (
            <Box key={s.agentId} flexDirection="column">
              <Text bold={s.reasignado}>▶ {s.descripcion} · {s.tipo ?? '—'} · {s.pedido} → {s.elegido}</Text>
              {conMotivos && <Text dimColor>    {s.motivos.join(' · ')}</Text>}
            </Box>
          ))}
        </Box>
        <Box flexDirection="column">
          <Text bold>POR TAREA</Text>
          {tareas.length === 0 && <Text dimColor>Ningún subagente nombró una tarea todavía.</Text>}
          {tareas.map(t => (
            <Text key={t.tarea}>
              {t.tarea} · {t.pasos.map(p => `${p.tipo ?? '?'} ${p.terminado ? '✓' : '▶'}`).join(' → ')} · {t.rondas} rondas · {t.minutos}m
            </Text>
          ))}
        </Box>
        {(overrides.permitidos || fijados.length > 0) && (
          <Box flexDirection="column">
            <Text bold>OVERRIDES</Text>
            {overrides.permitidos && <Text>permitir: {overrides.permitidos.join(',')}</Text>}
            {fijados.map(f => <Text key={f}>fijar {f}</Text>)}
          </Box>
        )}
      </Box>
    )
  })
}
```

- [ ] **Step 4: Conectar el panel en `register.tsx`**

En `router/hooks/register.tsx`:
- Borrar la línea `export const PANE = 'router'`.
- Agregar `import { PANE, registrarPanel } from '../src/ui/panel'` a los imports.
- Como última línea dentro de `register`, después del hook de `command.run`, agregar
  `registrarPanel(on, umbrales)`.

- [ ] **Step 5: Correr y ver que pasa**

Run: `claude plugin test router`
Expected: PASS en todo. Si el `mount` rechaza el árbol, el error dice qué elemento o prop no
valida (por ejemplo, `Text` anidado o `gap` en esa superficie). Corregí el árbol según el
mensaje: por ejemplo, reemplazá el `Text` anidado por varios `Text` dentro de un
`Box flexDirection="row"`.

- [ ] **Step 6: Validar y commitear**

Run: `claude plugin validate router`
Expected: sin errores; ahora también lista `ui.render`.

```bash
git add router/src/ui router/hooks/register.tsx router/tests/linea.test.ts router/tests/panel.test.tsx
git commit -m "feat(router): línea informativa y panel con dos pestañas"
```

---

### Task 10: Verificación en vivo y README

Estas son las tres verificaciones que el spec deja para una sesión real. No se pueden probar con
`claude plugin test`.

**Files:**
- Create: `router/README.md`
- Create: `docs/verificaciones/2026-10-06-router-fase-1.md`, con lo observado

- [ ] **Step 1: Abrir una sesión con el plugin cargado**

En una terminal nueva (no en esta sesión):
```bash
claude --plugin-dir <repo>/router --debug
```
Expected: `/plugin` muestra `1 mod active · router`.

- [ ] **Step 2: Verificar el modelo y el esfuerzo de un subagente**

En esa sesión, escribir:
```
Lanzá un subagente general-purpose con description "Review Task 1 (spec + quality)" y model "sonnet". Su único trabajo: correr `echo $CLAUDE_EFFORT` en Bash y responder con la salida y con el nombre exacto del modelo que lo está corriendo.
```
Expected:
- El subagente responde `xhigh` y un modelo Opus 5.5.
- `/router` muestra `sonnet → opus·xhigh` con el motivo `regla review`.
- La línea debajo del prompt dice `1 de 1 subagentes reasignados`.

Si responde `sonnet`, el reemplazo de `model` en `agent.spawn` no tomó: revisar el debug log y
buscar `agent.spawn`. Si el esfuerzo no es `xhigh`, `turn.step` con `agentId` no se aplica a
subagentes: anotarlo como hallazgo; es uno de los tres puntos abiertos del spec.

- [ ] **Step 3: Verificar `[pin]` y `/router`**

- Lanzar otro subagente con description `"Review Task 2 [pin]"` y model `"haiku"`, con el mismo
  pedido. Expected: responde con un modelo Haiku.
- Correr `/router fijar review sonnet·high` y repetir el Step 2. Expected: el subagente responde
  `high` y un modelo Sonnet 5.5.
- Correr `/router reset`.

- [ ] **Step 4: Anotar lo observado**

`docs/verificaciones/2026-10-06-router-fase-1.md`: para cada uno de los tres puntos abiertos
del spec, anotar qué se observó. Los tres puntos son: que el esfuerzo llegue al subagente, que
se acepten los ids completos de 5.5, y que se vea el modelo pedido por Claude. Si alguno
falló, abrir una tarea para la fase 2 con el detalle del debug log.

- [ ] **Step 5: Escribir el README**

`router/README.md`:
```markdown
# router

Mod de Claude Code que elige el modelo y el esfuerzo de cada subagente según el tipo de tarea, y
los sube cuando sobra ventana de 5 horas. Nunca frena el uso.

## Cargarlo

- Una sesión: `claude --plugin-dir <repo>/router`
- Siempre: `claude plugin marketplace add <repo>` y
  después `claude plugin install router@claude-mods`

## Usarlo

| Comando | Qué hace |
|---|---|
| `/router` | Abre el panel: pestañas **En curso** y **Métricas vs tu base** |
| `/router off` / `/router on` | Apaga o prende el router en esta sesión |
| `/router permitir sonnet,opus` | Solo usa esos modelos en esta sesión |
| `/router fijar review opus·max` | Fija un tipo por encima de la política |
| `/router reset` | Borra los overrides de la sesión |
| `[pin]` en la description de un subagente | Respeta el modelo que pidió Claude |

Los umbrales de la política (🔥 y ⬆️) se cambian en `/config`.

## Tipos y base

review-final y review: opus·xhigh · re-review y build-large: opus·medium · build-small y
research: sonnet·medium · fix: sonnet·high · write: sonnet·low · explore: haiku (techo
sonnet·medium).

Spec: `docs/superpowers/specs/2026-10-06-router-de-subagentes-design.md`
```

- [ ] **Step 6: Commitear**

```bash
git add router/README.md docs/verificaciones
git commit -m "docs(router): README y verificación en vivo de la fase 1"
```

---

## Self-review del plan

**Cobertura del spec (fase 1):**

| Sección del spec | Dónde se implementa |
|---|---|
| Taxonomía y matriz | Task 1 |
| Reglas | Task 2 |
| Resumen y respaldo | Task 3 |
| Política que solo sube | Task 4 |
| `/router` y `[pin]` | Task 5 y Task 8 |
| Precedencia de la decisión | Task 6 |
| Por tarea y métricas de sesión | Task 7 |
| Eventos y flujo de datos | Task 8 |
| Errores: el router nunca bloquea | `try/catch` en `agent.spawn` (Task 8) |
| Línea informativa y panel con dos pestañas | Task 9 |
| Verificaciones abiertas | Task 10 |

**Fuera de la fase 1, a propósito:**
- Haiku, Jev, modo sombra, tope de 1 s y banco: fase 2.
- Persistir la línea base y los 7 días en `$.store`, y medir la ventana sin usar al reset:
  fase 3.
- Fast: fase 4.

**Una desviación del spec, anotada:** el spec dice que si el modelo elegido no está disponible
se usa el de Claude. `next` se llama una sola vez por evento, así que en la fase 1 no hay
reintento. La Task 10 verifica que los ids se acepten; si fallan, la fase 2 agrega una lista
de ids validados.
