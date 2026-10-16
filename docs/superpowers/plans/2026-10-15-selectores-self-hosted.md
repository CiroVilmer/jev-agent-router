# Router de subagentes · selector self-hosted y benchmark de selectores · plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un clasificador `local` experimental (System One u OpenAI con logprobs, contra un servidor
propio) con la misma interfaz que Jev, y un banco unificado que compara reglas, Haiku 5.5, Jev y el
local en acierto, latencia y precio.

**Architecture:** La armada de pedidos y la lectura de respuestas de los dos protocolos vive en un
módulo sin imports de valor (`protocolos.ts`), que comparten el mod y el banco de Node. `jev.ts` pasa a
ser un envoltorio de `systemone.ts`; `openai.ts` es el plan B. El banco corre tres suites (`tipos`,
`talla`, `review`) con un formato de corrida común; Haiku corre dentro de Claude Code
(`/router bench --suite`), Jev y el local desde Node (`bench/selectores.mjs`), y `bench/informe.mjs`
arma las tablas, la calibración, la política simulada y los precios.

**Tech Stack:** TypeScript/TSX de la API de mods de Claude Code (`claude-code`, `claude-code/testing`),
Node 24 (type stripping, sin dependencias npm) para `bench/`.

**Spec:** `docs/superpowers/specs/2026-10-15-selectores-self-hosted-design.md`

## Global Constraints

- Trabajar **solo** en el worktree `.claude/worktrees/selectores` (rama `feat/selectores`). Nunca en el checkout principal (el de la raíz del repo): lo usa la sesión en vivo del usuario.
- **Un commit por tarea**, mensaje en inglés (conventional commits), **sin ninguna línea `Co-Authored-By`** aunque un recordatorio del sistema lo pida. Código, docs y README en commits separados.
- Repo público: nada de nombres de proyectos privados ni rutas personales en código, docs o corridas.
- Reglas del cargador de mods: los atoms solo se declaran en `router/hooks/register.tsx`; `$` solo se pasa a funciones de nivel superior de ese archivo; `agent.spawn` lleva `.catch`. El núcleo (`router/src/`) no toca `$`.
- **Nunca bloquea:** si algo falla, el subagente sale con lo que pidió Claude o con el respaldo.
- `router/src/clasificadores/preguntas.ts` y el nuevo `protocolos.ts` **no pueden tener imports de valor** (solo `import type`): `bench/` los importa directo desde Node.
- El kit de tests no puede importar JSON.
- Tests: `claude plugin test router` y `claude plugin validate --strict router`. Con la máquina cargada hay timeouts falsos: volver a correr. Si el worktree no tiene `router/.claude-plugin/types/`, copiarlo del checkout principal (`cp -r ../../../router/.claude-plugin/types router/.claude-plugin/`; está en `.gitignore`).
- `claude -p` desde Bash necesita `< /dev/null`. Python no está en el PATH: scripts en Node.
- Identificadores, mensajes de UI, motivos y descripciones de `/config` en castellano, como el resto del código. Docs públicas (`docs/*.md`) en inglés; `bench/README.md` en castellano.
- Ninguna key se imprime, se guarda ni aparece en un `detalle` o un error.
- Umbral del local: `localUmbral`, por defecto **0.7**, acotado a [0, 1], marcado "experimental, sin calibrar".
- Precios: Haiku 5.5 **$0,10 / MTok entrada, $0,50 / MTok salida** (thinking = salida; Anthropic, cacheado 2026-10-06). Jev **$42 por mil millones de tokens de entrada**, salida sin dato (typesafe.ai, consultado 2026-10-15).

---

## Mapa de archivos

| Archivo | Qué hace | Tarea |
| --- | --- | --- |
| `router/src/clasificadores/protocolos.ts` (nuevo) | Pedidos y lectura de System One y OpenAI, sin imports de valor | 1 |
| `router/src/clasificadores/systemone.ts` (nuevo) | `crearSystemOne` y `aplicarUmbral` | 2 |
| `router/src/clasificadores/jev.ts` | Envoltorio de `systemone.ts` | 2 |
| `router/src/clasificadores/openai.ts` (nuevo) | `crearOpenAI` | 2 |
| `router/src/clasificadores/index.ts` | `fuente` con `'local'`, `LOCAL_UMBRAL`, `limitesDe` | 2 |
| `router/src/decidir.ts`, `router/src/ui/linea.ts` | `decideReviews`, `revisarConClasificador`, motivo corto de `local` | 3 |
| `router/hooks/register.tsx`, `router/.claude-plugin/plugin.json` | `armarLocal`, `local` en `armarClasificador` y en la sombra, opciones de `/config` | 4 |
| `router/src/banco.ts`, `router/src/overrides.ts`, `router/hooks/register.tsx` | Suites, `/router bench --suite`, muestra de tokens | 5 |
| `bench/lib/politica.mjs` (nuevo), `bench/analizar-jev-todos.mjs`, `bench/review-talla.mjs` | Simulaciones de política en un solo lugar | 6 |
| `bench/lib/servidor-falso.mjs`, `bench/selectores.mjs` (nuevos), `bench/jev-todos.mjs` (se borra) | Correr Jev y local desde Node | 7 |
| `bench/precios.json`, `bench/informe.mjs` (nuevos) | El informe comparativo | 8 |
| `docs/benchmark.md`, `docs/configuration.md`, `bench/README.md`, `CHANGELOG.md` | Docs | 9 |
| `router/README.md` | README | 10 |

---

### Task 1: `protocolos.ts`, pedidos y lectura de los dos protocolos

**Files:**
- Create: `router/src/clasificadores/protocolos.ts`
- Test: `router/tests/protocolos.test.ts`

**Interfaces:**
- Consumes: nada (solo `import type { Tipo } from '../../types'`).
- Produces:
  - `pedidoSystemOne(modelo: string, tarea: string, pregunta: unknown): { model: string; state: { tarea: string }; questions: { tipo: unknown } }`
  - `leerSystemOne(texto: string, etiquetas: readonly string[], fuente: string): { tipo: string; confianza: number }` — errores con prefijo `${fuente}` (con `fuente = 'jev'` los mensajes son idénticos a los de hoy).
  - `letrasDe(etiquetas: readonly string[]): string[]` — `['A', 'B', …]`, una por etiqueta, en orden.
  - `textoOpenAI(texto: string, etiquetas: readonly string[]): string`
  - `pedidoOpenAI(modelo: string, texto: string, etiquetas: readonly string[]): object` — el body de `/v1/chat/completions`.
  - `leerOpenAI(texto: string, etiquetas: readonly string[]): { tipo: string; confianza: number }` — errores con prefijo `local:`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// router/tests/protocolos.test.ts
import { describe, expect, test } from 'claude-code/testing'
import { leerOpenAI, leerSystemOne, letrasDe, pedidoOpenAI, pedidoSystemOne, textoOpenAI } from '../src/clasificadores/protocolos'

const TALLAS = ['build-large', 'build-small']
const NUEVE = ['review-final', 'review', 're-review', 'build-large', 'build-small', 'fix', 'explore', 'research', 'write']

const systemone = (choice: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ answers: { tipo: { type: 'choice', choice, ...extra } } })

const top = (pares: [string, number][]) => pares.map(([token, p]) => ({ token, logprob: Math.log(p) }))
const openai = (letra: string, logprobs: unknown) =>
  JSON.stringify({ choices: [{ message: { content: JSON.stringify({ r: letra }) }, logprobs }] })

describe('System One', () => {
  test('el pedido lleva modelo, la tarea como estado y la pregunta tipo', () => {
    expect(pedidoSystemOne('laya', 'Implement Task 1 · prompt 1.2k chars', { type: 'choice' })).toEqual({
      model: 'laya',
      state: { tarea: 'Implement Task 1 · prompt 1.2k chars' },
      questions: { tipo: { type: 'choice' } },
    })
  })

  test('lee confidence y, si falta, probabilities[choice]', () => {
    expect(leerSystemOne(systemone('build-large', { confidence: 0.83 }), TALLAS, 'local')).toEqual({ tipo: 'build-large', confianza: 0.83 })
    expect(leerSystemOne(systemone('build-small', { probabilities: { 'build-small': 0.6 } }), TALLAS, 'local')).toEqual({ tipo: 'build-small', confianza: 0.6 })
    expect(leerSystemOne(systemone('build-small'), TALLAS, 'local')).toEqual({ tipo: 'build-small', confianza: 0 })
  })

  test('los errores llevan el nombre de la fuente', () => {
    const errores: string[] = []
    for (const malo of ['no es json', '{}', systemone('review', { confidence: 1 })]) {
      try { leerSystemOne(malo, TALLAS, 'local') } catch (e) { errores.push(String(e)) }
    }
    expect(errores).toEqual([
      'Error: local: la respuesta no es JSON',
      'Error: local: la respuesta no trae answers.tipo',
      'Error: local eligió una opción que no se pidió: review',
    ])
  })
})

describe('OpenAI', () => {
  test('una letra por etiqueta, en orden', () => {
    expect(letrasDe(TALLAS)).toEqual(['A', 'B'])
    expect(letrasDe(NUEVE).at(-1)).toBe('I')
  })

  test('el texto agrega la clave de letras', () => {
    const t = textoOpenAI('¿Qué tipo?', TALLAS)
    expect(t.startsWith('¿Qué tipo?\n\n')).toBe(true)
    expect(t.includes('A = build-large')).toBe(true)
    expect(t.includes('B = build-small')).toBe(true)
  })

  test('el pedido fuerza un enum de letras, pide logprobs y apaga el thinking', () => {
    const p = pedidoOpenAI('qwen3-1.7b', 'texto', TALLAS) as any
    expect(p.model).toBe('qwen3-1.7b')
    expect(p.messages).toEqual([{ role: 'user', content: 'texto' }])
    expect(p.response_format.type).toBe('json_schema')
    expect(p.response_format.json_schema.schema.properties.r.enum).toEqual(['A', 'B'])
    expect(p.logprobs).toBe(true)
    expect(p.top_logprobs).toBe(20)
    expect(p.temperature).toBe(0)
    expect(p.max_tokens).toBe(16)
    expect(p.chat_template_kwargs).toEqual({ enable_thinking: false })
  })

  test('la confianza es el softmax renormalizado sobre las letras de la clave', () => {
    const logprobs = {
      content: [
        { token: '{"', logprob: 0, top_logprobs: [] },
        { token: 'r', logprob: 0, top_logprobs: [] },
        { token: '":"', logprob: 0, top_logprobs: [] },
        { token: 'A', logprob: Math.log(0.6), top_logprobs: top([['A', 0.6], [' B', 0.2], ['"C', 0.1], ['x', 0.1]]) },
      ],
    }
    const r = leerOpenAI(openai('A', logprobs), ['build-large', 'build-small', 'fix'])
    expect(r.tipo).toBe('build-large')
    expect(Math.abs(r.confianza - 0.6 / 0.9) < 1e-9).toBe(true)
  })

  test('sin logprobs la etiqueta vale con confianza 0', () => {
    expect(leerOpenAI(openai('B', null), TALLAS)).toEqual({ tipo: 'build-small', confianza: 0 })
  })

  test('letra fuera de la clave o respuesta rota: error local', () => {
    const errores: string[] = []
    for (const malo of [openai('C', null), 'no es json', JSON.stringify({ choices: [] }), JSON.stringify({ choices: [{ message: { content: 'A' } }] })]) {
      try { leerOpenAI(malo, TALLAS) } catch (e) { errores.push(String(e)) }
    }
    expect(errores).toEqual([
      'Error: local eligió una letra que no se pidió: C',
      'Error: local: la respuesta no es JSON',
      'Error: local: la respuesta no trae choices[0].message.content',
      'Error: local: el contenido no es {"r": letra}',
    ])
  })
})
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `claude plugin test router`
Expected: FAIL en `protocolos.test.ts` (no existe `../src/clasificadores/protocolos`).

- [ ] **Step 3: Implementar**

```ts
// router/src/clasificadores/protocolos.ts
/**
 * Pedidos y lectura de los dos protocolos de los clasificadores por HTTP: System One (Jev y un
 * servidor local con decision models) y OpenAI (un LLM chico, con la confianza de los logprobs).
 * Sin imports de valor: bench/ importa este archivo directo desde Node, y así el banco arma el
 * mensaje igual que producción.
 */

export function pedidoSystemOne(modelo: string, tarea: string, pregunta: unknown) {
  return { model: modelo, state: { tarea }, questions: { tipo: pregunta } }
}

export function leerSystemOne(texto: string, etiquetas: readonly string[], fuente: string): { tipo: string; confianza: number } {
  let json: { answers?: { tipo?: { type?: string; choice?: unknown; confidence?: unknown; probabilities?: Record<string, number> } } }
  try {
    json = JSON.parse(texto)
  } catch {
    throw new Error(`${fuente}: la respuesta no es JSON`)
  }
  const a = json.answers?.tipo
  if (!a || a.type !== 'choice' || typeof a.choice !== 'string') throw new Error(`${fuente}: la respuesta no trae answers.tipo`)
  if (!etiquetas.includes(a.choice)) throw new Error(`${fuente} eligió una opción que no se pidió: ${a.choice}`)
  const confianza = typeof a.confidence === 'number' ? a.confidence : (a.probabilities?.[a.choice] ?? 0)
  return { tipo: a.choice, confianza }
}

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function letrasDe(etiquetas: readonly string[]): string[] {
  return etiquetas.map((_, i) => LETRAS[i]!)
}

export function textoOpenAI(texto: string, etiquetas: readonly string[]): string {
  const clave = letrasDe(etiquetas).map((l, i) => `${l} = ${etiquetas[i]}`).join('\n')
  return `${texto}\n\nRespondé solo con la letra del tipo, en JSON {"r": "<letra>"}:\n${clave}`
}

export function pedidoOpenAI(modelo: string, texto: string, etiquetas: readonly string[]) {
  return {
    model: modelo,
    messages: [{ role: 'user', content: texto }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'tipo',
        strict: true,
        schema: {
          type: 'object',
          properties: { r: { type: 'string', enum: letrasDe(etiquetas) } },
          required: ['r'],
          additionalProperties: false,
        },
      },
    },
    logprobs: true,
    top_logprobs: 20,
    temperature: 0,
    max_tokens: 16,
    // Los modelos con thinking (Qwen3, Gemma 4) lo apagan; los servidores que no lo conocen lo ignoran.
    chat_template_kwargs: { enable_thinking: false },
  }
}

type Logprob = { token?: unknown; logprob?: unknown; top_logprobs?: unknown }
const limpiar = (token: unknown) => (typeof token === 'string' ? token.replace(/["'\s]/g, '') : '')

/** Probabilidad renormalizada de `elegida` entre las letras de la clave, en la primera posición que es una letra. */
function confianzaDe(logprobs: unknown, letras: readonly string[], elegida: string): number {
  const contenido = (logprobs as { content?: unknown } | null)?.content
  if (!Array.isArray(contenido)) return 0
  const pos = (contenido as Logprob[]).find(p => letras.includes(limpiar(p.token)))
  if (!pos) return 0
  const prob = new Map<string, number>()
  const sumar = (token: unknown, logprob: unknown) => {
    const l = limpiar(token)
    if (!letras.includes(l) || typeof logprob !== 'number') return
    prob.set(l, Math.max(prob.get(l) ?? 0, Math.exp(logprob)))
  }
  sumar(pos.token, pos.logprob)
  if (Array.isArray(pos.top_logprobs)) for (const t of pos.top_logprobs as Logprob[]) sumar(t.token, t.logprob)
  const total = [...prob.values()].reduce((a, b) => a + b, 0)
  return total > 0 ? (prob.get(elegida) ?? 0) / total : 0
}

export function leerOpenAI(texto: string, etiquetas: readonly string[]): { tipo: string; confianza: number } {
  let json: { choices?: { message?: { content?: unknown }; logprobs?: unknown }[] }
  try {
    json = JSON.parse(texto)
  } catch {
    throw new Error('local: la respuesta no es JSON')
  }
  const eleccion = json.choices?.[0]
  if (!eleccion || typeof eleccion.message?.content !== 'string') throw new Error('local: la respuesta no trae choices[0].message.content')
  let r: unknown
  try {
    r = (JSON.parse(eleccion.message.content) as { r?: unknown }).r
  } catch {
    r = undefined
  }
  if (typeof r !== 'string') throw new Error('local: el contenido no es {"r": letra}')
  const letras = letrasDe(etiquetas)
  const i = letras.indexOf(r)
  if (i < 0) throw new Error(`local eligió una letra que no se pidió: ${r}`)
  return { tipo: etiquetas[i]!, confianza: confianzaDe(eleccion.logprobs, letras, r) }
}
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `claude plugin test router`
Expected: PASS en `protocolos.test.ts` y en todo lo demás. Además, comprobar que Node lo puede
importar desde `bench/`: `node -e "import('./router/src/clasificadores/protocolos.ts').then(m => console.log(Object.keys(m).join(',')))"` imprime los seis nombres.

- [ ] **Step 5: Commit**

```bash
git add router/src/clasificadores/protocolos.ts router/tests/protocolos.test.ts
git commit -m "feat(router): System One and OpenAI request/response helpers without value imports"
```

---

### Task 2: `systemone.ts`, `openai.ts` y Jev como envoltorio

**Files:**
- Create: `router/src/clasificadores/systemone.ts`, `router/src/clasificadores/openai.ts`
- Modify: `router/src/clasificadores/jev.ts` (entero), `router/src/clasificadores/index.ts` (tipo `Clasificacion`, umbrales, `limitesDe`)
- Test: `router/tests/systemone.test.ts`, `router/tests/openai.test.ts`; `router/tests/jev.test.ts` **no se toca** y tiene que seguir pasando.

**Interfaces:**
- Consumes (Task 1): `pedidoSystemOne`, `leerSystemOne`, `pedidoOpenAI`, `leerOpenAI`, `textoOpenAI`.
- Produces:
  - `index.ts`: `Clasificacion.fuente: 'respaldo' | 'haiku' | 'jev' | 'local'`; `LOCAL_UMBRAL = { min: 0, max: 1, porDefecto: 0.7 } as const`; `limitesDe(options: { topeMs?: unknown; jevUmbral?: unknown; localUmbral?: unknown }): { topeMs: number; jevUmbral: number; localUmbral: number }`.
  - `systemone.ts`: `export type Post = (cuerpo: string) => Promise<{ ok: boolean; status: number; text: string }>`; `aplicarUmbral(r: { tipo: Tipo; confianza: number }, ms: number, fuente: 'jev' | 'local', umbral: number, etiquetas: readonly Tipo[]): Clasificacion`; `crearSystemOne(o: { post: Post; ahora: Reloj; modelo: string; umbral: number; fuente: 'jev' | 'local' }): Clasificador`.
  - `openai.ts`: `crearOpenAI(o: { post: Post; ahora: Reloj; modelo: string; umbral: number }): Clasificador` (fuente `'local'`).
  - `jev.ts` mantiene `JEV_URL`, `JEV_MODELO`, `Post` (re-export), `pedidoJev`, `leerJev`, `crearJev(post, ahora, umbral)` con la misma firma y comportamiento.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// router/tests/systemone.test.ts
import { describe, expect, test } from 'claude-code/testing'
import { TALLAS, limitesDe } from '../src/clasificadores'
import { crearSystemOne } from '../src/clasificadores/systemone'
import { TIPOS } from '../src/taxonomia'

const RESUMEN = { chars: 6800, archivos: 9, pasos: 14, mencionaSpec: true }
const respuesta = (choice: string, confidence: number) => JSON.stringify({ answers: { tipo: { type: 'choice', choice, confidence } } })
let t = 0
const reloj = async () => (t += 100)

describe('crearSystemOne', () => {
  test('manda el modelo configurado y devuelve fuente local', async () => {
    let cuerpo = ''
    const c = crearSystemOne({ post: async b => { cuerpo = b; return { ok: true, status: 200, text: respuesta('build-large', 0.9) } }, ahora: reloj, modelo: 'laya', umbral: 0.7, fuente: 'local' })
    expect(await c({ descripcion: 'Implement Task 1', resumen: RESUMEN, etiquetas: TALLAS })).toEqual({ tipo: 'build-large', confianza: 0.9, ms: 100, fuente: 'local' })
    expect(JSON.parse(cuerpo).model).toBe('laya')
  })

  test('en la talla, con duda, tira "local dudó"; sin regla decide igual', async () => {
    const duda = crearSystemOne({ post: async () => ({ ok: true, status: 200, text: respuesta('build-small', 0.4) }), ahora: reloj, modelo: 'm', umbral: 0.7, fuente: 'local' })
    let e = ''
    try { await duda({ descripcion: 'Implement Task 1', resumen: RESUMEN, etiquetas: TALLAS }) } catch (x) { e = String(x) }
    expect(e).toBe('Error: local dudó (0.40)')
    const sinRegla = crearSystemOne({ post: async () => ({ ok: true, status: 200, text: respuesta('review', 0.4) }), ahora: reloj, modelo: 'm', umbral: 0.7, fuente: 'local' })
    const r = await sinRegla({ descripcion: 'verif: x', resumen: RESUMEN, etiquetas: TIPOS })
    expect(r.detalle).toBe('sin umbral')
  })

  test('HTTP con error', async () => {
    const c = crearSystemOne({ post: async () => ({ ok: false, status: 501, text: '' }), ahora: reloj, modelo: 'm', umbral: 0.7, fuente: 'local' })
    let e = ''
    try { await c({ descripcion: 'Implement Task 1', resumen: RESUMEN, etiquetas: TALLAS }) } catch (x) { e = String(x) }
    expect(e).toBe('Error: local: HTTP 501')
  })
})

describe('limitesDe', () => {
  test('localUmbral acotado a [0, 1], 0.7 por defecto', () => {
    expect(limitesDe({}).localUmbral).toBe(0.7)
    expect(limitesDe({ localUmbral: 2 }).localUmbral).toBe(1)
    expect(limitesDe({ localUmbral: 'x' }).localUmbral).toBe(0.7)
  })
})
```

```ts
// router/tests/openai.test.ts
import { describe, expect, test } from 'claude-code/testing'
import { TALLAS } from '../src/clasificadores'
import { crearOpenAI } from '../src/clasificadores/openai'

const RESUMEN = { chars: 6800, archivos: 9, pasos: 14, mencionaSpec: true }
const respuesta = (letra: string, p: number) =>
  JSON.stringify({ choices: [{ message: { content: JSON.stringify({ r: letra }) }, logprobs: { content: [{ token: letra, logprob: Math.log(p), top_logprobs: [{ token: letra, logprob: Math.log(p) }, { token: letra === 'A' ? 'B' : 'A', logprob: Math.log(1 - p) }] }] } }] })
let t = 0
const reloj = async () => (t += 50)

describe('crearOpenAI', () => {
  test('arma el pedido con el texto de Haiku más la clave y lee la letra', async () => {
    let cuerpo: any
    const c = crearOpenAI({ post: async b => { cuerpo = JSON.parse(b); return { ok: true, status: 200, text: respuesta('A', 0.9) } }, ahora: reloj, modelo: 'qwen3', umbral: 0.7 })
    const r = await c({ descripcion: 'Implement Task 11: el compilador', resumen: RESUMEN, etiquetas: TALLAS })
    expect(r.tipo).toBe('build-large')
    expect(r.fuente).toBe('local')
    expect(Math.abs((r.confianza ?? 0) - 0.9) < 1e-9).toBe(true)
    expect(cuerpo.model).toBe('qwen3')
    expect(cuerpo.messages[0].content.includes('Implement Task 11')).toBe(true)
    expect(cuerpo.messages[0].content.includes('A = build-large')).toBe(true)
  })

  test('en la talla, con duda, tira "local dudó"', async () => {
    const c = crearOpenAI({ post: async () => ({ ok: true, status: 200, text: respuesta('B', 0.55) }), ahora: reloj, modelo: 'q', umbral: 0.7 })
    let e = ''
    try { await c({ descripcion: 'Implement Task 1', resumen: RESUMEN, etiquetas: TALLAS }) } catch (x) { e = String(x) }
    expect(e).toBe('Error: local dudó (0.55)')
  })
})
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `claude plugin test router`
Expected: FAIL (no existen `systemone`, `openai` ni `localUmbral`).

- [ ] **Step 3: Implementar**

En `router/src/clasificadores/index.ts`:

```ts
export type Clasificacion = { tipo: Tipo; confianza?: number; ms: number; fuente: 'respaldo' | 'haiku' | 'jev' | 'local'; detalle?: string }
// …
// Sin calibrar: experimental hasta medir el local en el banco (bench/informe.mjs, tabla de calibración).
export const LOCAL_UMBRAL = { min: 0, max: 1, porDefecto: 0.7 } as const

/**
 * Los límites de /config, acotados: `topeMs` a [50, 8000] porque el hook tiene 10 s de
 * presupuesto y la espera cuenta; `jevUmbral` y `localUmbral` a [0, 1]. Un valor que no es número toma el default.
 */
export function limitesDe(options: { topeMs?: unknown; jevUmbral?: unknown; localUmbral?: unknown }): { topeMs: number; jevUmbral: number; localUmbral: number } {
  return {
    topeMs: acotar(options.topeMs, TOPE_MS),
    jevUmbral: acotar(options.jevUmbral, JEV_UMBRAL),
    localUmbral: acotar(options.localUmbral, LOCAL_UMBRAL),
  }
}
```

```ts
// router/src/clasificadores/systemone.ts
import type { Tipo } from '../../types'
import { textoResumen } from '../resumen'
import type { Reloj } from './haiku'
import type { Clasificacion, Clasificador } from './index'
import { esPreguntaDeTalla } from './index'
import { pedidoSystemOne, leerSystemOne } from './protocolos'
import { preguntaJev } from './preguntas'

export type Post = (cuerpo: string) => Promise<{ ok: boolean; status: number; text: string }>

/**
 * El umbral como en Jev: en las preguntas de talla, con menos confianza falla con "<fuente> dudó" y
 * decide el respaldo; sin regla decide igual y lo marca (`sin umbral`).
 */
export function aplicarUmbral(
  r: { tipo: Tipo; confianza: number },
  ms: number,
  fuente: 'jev' | 'local',
  umbral: number,
  etiquetas: readonly Tipo[],
): Clasificacion {
  if (r.confianza < umbral) {
    if (esPreguntaDeTalla(etiquetas)) throw new Error(`${fuente} dudó (${r.confianza.toFixed(2)})`)
    return { ...r, ms, fuente, detalle: 'sin umbral' }
  }
  return { ...r, ms, fuente }
}

export function crearSystemOne(o: { post: Post; ahora: Reloj; modelo: string; umbral: number; fuente: 'jev' | 'local' }): Clasificador {
  return async ({ descripcion, resumen, etiquetas }) => {
    const inicio = await o.ahora()
    const r = await o.post(JSON.stringify(pedidoSystemOne(o.modelo, textoResumen(descripcion, resumen), preguntaJev(etiquetas))))
    const ms = (await o.ahora()) - inicio
    if (!r.ok) throw new Error(`${o.fuente}: HTTP ${r.status}`)
    const leido = leerSystemOne(r.text, etiquetas, o.fuente)
    return aplicarUmbral({ tipo: leido.tipo as Tipo, confianza: leido.confianza }, ms, o.fuente, o.umbral, etiquetas)
  }
}
```

```ts
// router/src/clasificadores/jev.ts
import type { Tipo } from '../../types'
import type { Reloj } from './haiku'
import type { Clasificador } from './index'
import { leerSystemOne, pedidoSystemOne } from './protocolos'
import { preguntaJev } from './preguntas'
import type { Post } from './systemone'
import { crearSystemOne } from './systemone'

export type { Post } from './systemone'

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
/** Fijo: jev-latest cambia de modelo sin aviso y los umbrales se calibran contra una versión. */
export const JEV_MODELO = 'jev-1.13.0'

export function pedidoJev(tarea: string, etiquetas: readonly Tipo[]) {
  return pedidoSystemOne(JEV_MODELO, tarea, preguntaJev(etiquetas))
}

export function leerJev(texto: string, etiquetas: readonly Tipo[]): { tipo: Tipo; confianza: number } {
  const r = leerSystemOne(texto, etiquetas, 'jev')
  return { tipo: r.tipo as Tipo, confianza: r.confianza }
}

// El umbral se calibró para la talla de los builds y para las reviews por description (si Jev duda
// ahí, queda la regla). Cifras: bench/corridas/2026-10-07-1032-comparacion.md y
// bench/corridas/2026-10-09-1339-jev-todos-analisis.md.
export function crearJev(post: Post, ahora: Reloj, umbral: number): Clasificador {
  return crearSystemOne({ post, ahora, modelo: JEV_MODELO, umbral, fuente: 'jev' })
}
```

```ts
// router/src/clasificadores/openai.ts
import type { Tipo } from '../../types'
import { textoResumen } from '../resumen'
import type { Reloj } from './haiku'
import type { Clasificador } from './index'
import { leerOpenAI, pedidoOpenAI, textoOpenAI } from './protocolos'
import { textoParaHaiku } from './preguntas'
import type { Post } from './systemone'
import { aplicarUmbral } from './systemone'

/**
 * El plan B del clasificador local: un LLM por /v1/chat/completions que responde una letra; la
 * confianza sale de los logprobs (0 si el servidor no los devuelve: en la talla decide el respaldo).
 */
export function crearOpenAI(o: { post: Post; ahora: Reloj; modelo: string; umbral: number }): Clasificador {
  return async ({ descripcion, resumen, etiquetas }) => {
    const texto = textoOpenAI(textoParaHaiku(textoResumen(descripcion, resumen), etiquetas), etiquetas)
    const inicio = await o.ahora()
    const r = await o.post(JSON.stringify(pedidoOpenAI(o.modelo, texto, etiquetas)))
    const ms = (await o.ahora()) - inicio
    if (!r.ok) throw new Error(`local: HTTP ${r.status}`)
    const leido = leerOpenAI(r.text, etiquetas)
    return aplicarUmbral({ tipo: leido.tipo as Tipo, confianza: leido.confianza }, ms, 'local', o.umbral, etiquetas)
  }
}
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `claude plugin test router`
Expected: PASS, incluido `jev.test.ts` sin cambios.

- [ ] **Step 5: Commit**

```bash
git add router/src/clasificadores router/tests/systemone.test.ts router/tests/openai.test.ts
git commit -m "feat(router): local classifier over System One or OpenAI logprobs, Jev as a System One wrapper"
```

---

### Task 3: `decidir` y la línea con `local`

**Files:**
- Modify: `router/src/decidir.ts` (`Contexto`, `revisarConJev`, el `if` de las reviews), `router/src/ui/linea.ts` (`motivoCorto`), `router/hooks/register.tsx` (solo el nombre `jevDecideReviews` → `decideReviews` en `armarClasificador` y en `agent.spawn`, para que compile)
- Test: `router/tests/decidir.test.ts`, `router/tests/linea.test.ts`

**Interfaces:**
- Consumes (Task 2): `Clasificacion.fuente` con `'local'`.
- Produces:
  - `Contexto.decideReviews: boolean` (reemplaza a `jevDecideReviews`).
  - `revisarConClasificador(regla: Tipo, cl: Clasificacion): { tipo: Tipo; motivo: string | null }` (reemplaza a `revisarConJev`; el comportamiento con `jev` no cambia). Con `local`, los motivos son `local → review (0.98)`, `local → explore (0.95): queda la regla` y `local dudó (0.55): queda la regla`.
  - `armarClasificador` devuelve `{ clasificar, decideReviews }`.
  - `motivoCorto`: `local 0.98`, `local dudó` o `local`, igual que con `jev`.

- [ ] **Step 1: Escribir los tests que fallan**

En `router/tests/decidir.test.ts`: renombrar todo `jevDecideReviews` a `decideReviews` y `revisarConJev` a `revisarConClasificador`, y agregar:

```ts
describe('revisarConClasificador con local', () => {
  test('local decide la review igual que jev', () => {
    expect(revisarConClasificador('review', { tipo: 'review-final', confianza: 0.95, ms: 10, fuente: 'local' })).toEqual({ tipo: 'review-final', motivo: 'local → review-final (0.95)' })
    expect(revisarConClasificador('review', { tipo: 'explore', confianza: 0.95, ms: 10, fuente: 'local' })).toEqual({ tipo: 'review', motivo: 'local → explore (0.95): queda la regla' })
    expect(revisarConClasificador('review', { tipo: 'fix', confianza: 0.55, ms: 10, fuente: 'local', detalle: 'sin umbral' })).toEqual({ tipo: 'review', motivo: 'local dudó (0.55): queda la regla' })
  })
})
```

En `router/tests/linea.test.ts`:

```ts
test('motivoCorto con local', () => {
  expect(motivoCorto(['regla review', 'local → review (0.98)'])).toBe('local 0.98')
  expect(motivoCorto(['regla review', 'local dudó (0.55): queda la regla'])).toBe('local dudó')
  expect(motivoCorto(['ninguna regla', 'local (sin umbral) → review (0.55)'])).toBe('local 0.55')
})
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `claude plugin test router`
Expected: FAIL (`revisarConClasificador` y `decideReviews` no existen).

- [ ] **Step 3: Implementar**

En `router/src/decidir.ts`:

```ts
export type Contexto = { overrides: Overrides; politica: EstadoPolitica; clasificar: Clasificador; tabla?: Tabla; decideReviews: boolean }

/** Lo que pasó al consultar al clasificador principal (jev o local) por una review: el tipo final y, si corresponde, el motivo. */
export function revisarConClasificador(regla: Tipo, cl: Clasificacion): { tipo: Tipo; motivo: string | null } {
  const conf = cl.confianza === undefined ? '' : ` (${cl.confianza.toFixed(2)})`
  if (cl.fuente === 'jev' || cl.fuente === 'local') {
    // Una review no baja a Haiku por el clasificador: explore y write dejan la regla.
    if (cl.detalle === undefined && (cl.tipo === 'explore' || cl.tipo === 'write'))
      return { tipo: regla, motivo: `${cl.fuente} → ${cl.tipo}${conf}: queda la regla` }
    if (cl.detalle === undefined) return { tipo: cl.tipo, motivo: `${cl.fuente} → ${cl.tipo}${conf}` }
    return { tipo: regla, motivo: `${cl.fuente} dudó${conf}: queda la regla` }
  }
  // Hoy inalcanzable (solo se consulta con jev o local como principal); queda como defensa.
  if (cl.fuente === 'haiku') return { tipo: regla, motivo: `haiku → ${cl.tipo}: queda la regla` }
  return { tipo: regla, motivo: cl.detalle ? `respaldo (${cl.detalle}): queda la regla` : null }
}
```

Y en `decidir`, el bloque de las reviews:

```ts
    // El clasificador principal (jev o local) decide la familia review: si está seguro, manda él.
    if (c.decideReviews && REVIEWS.includes(regla.tipo) && !regla.regla.startsWith('subagentType')) {
      const cl = await c.clasificar({ descripcion: e.descripcion, resumen: resumir(e.prompt), etiquetas: TIPOS })
      const r = revisarConClasificador(regla.tipo, cl)
```

En `router/src/ui/linea.ts`:

```ts
/** El motivo en una palabra: quién decidió el tipo (`jev 0.98`, `local dudó`, `regla`…). */
export function motivoCorto(motivos: readonly string[]): string {
  const modelo = motivos.find(m => m.startsWith('jev') || m.startsWith('local'))
  if (modelo) {
    const nombre = modelo.startsWith('jev') ? 'jev' : 'local'
    if (modelo.startsWith(`${nombre} dudó`)) return `${nombre} dudó`
    const confianza = modelo.match(/\((\d\.\d\d)\)/g)?.at(-1)
    return confianza ? `${nombre} ${confianza.slice(1, -1)}` : nombre
  }
  if (motivos.some(m => m.startsWith('respaldo'))) return 'respaldo'
  if (motivos.some(m => m.startsWith('haiku'))) return 'haiku'
  if (motivos.some(m => m.startsWith('fijado'))) return 'fijado'
  if (motivos.some(m => m.startsWith('regla'))) return 'regla'
  return ''
}
```

En `router/hooks/register.tsx`, renombrar `jevDecideReviews` a `decideReviews` (tipo de retorno de
`armarClasificador`, sus dos `return`, la constante y la desestructuración en `agent.spawn`), sin
cambiar el comportamiento: `const decideReviews = principal.nombre === 'jev'`. `local` se suma en la
tarea 4.

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `claude plugin test router`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add router/src/decidir.ts router/src/ui/linea.ts router/hooks/register.tsx router/tests/decidir.test.ts router/tests/linea.test.ts
git commit -m "refactor(router): any confident principal classifier decides reviews, local in the status line"
```

---

### Task 4: `local` en `armarClasificador`, la sombra y `/config`

**Files:**
- Modify: `router/hooks/register.tsx` (imports, `keyLocal`, `postLocal`, `armarLocal`, `avisarSinLocal`, `armarClasificador`), `router/.claude-plugin/plugin.json` (`clasificador`, `sombra` y cinco opciones nuevas)
- Test: `router/tests/register.test.ts`

**Interfaces:**
- Consumes (Task 2): `crearSystemOne`, `crearOpenAI`, `limitesDe(...).localUmbral`. (Task 3): `decideReviews`.
- Produces (todas `export` de nivel superior en `register.tsx`):
  - `keyLocal($: EngineInterface, options: PluginOptions): Promise<string | null>` — `localApiKey` o `LOCAL_API_KEY`.
  - `postLocal($: EngineInterface, url: string, key: string | null, cuerpo: string)` — POST con `Content-Type: application/json` y `Authorization: Bearer <key>` solo si hay key; un error sale como `local: <mensaje>` con la key tapada (`***`).
  - `armarLocal($: EngineInterface, options: PluginOptions, umbral: number): Promise<Clasificador | null>` — `null` si falta `localUrl` o `localModelo` (strings no vacíos).
  - `avisarSinLocal($: EngineInterface, consecuencia: string): void` — toast `Router: falta la URL o el modelo del clasificador local (/config); <consecuencia>`, una vez por carga.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar en `router/tests/register.test.ts`, dentro del `describe` donde están los tests de `jev decide con la key del entorno` (mismo `BUILD`, `AHORA`, `PANE_PROPS`, `respuestaJev`):

```ts
  test('local por System One con la URL y el modelo de /config', { options: { clasificador: 'local', localUrl: 'http://127.0.0.1:9931/v1/systemone', localModelo: 'laya' } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    mock.env(on, {})
    let url = ''
    let cuerpo: any
    let autorizacion: string | undefined = 'sin mirar'
    on('http.fetch', async (_$, e) => {
      url = e.url
      cuerpo = JSON.parse(e.init?.body ?? '{}')
      autorizacion = e.init?.headers?.Authorization
      return { value: { status: 200, ok: true, headers: {}, text: respuestaJev('build-large', 0.9) } }
    })
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-loc' } })
    await $.agent.spawn(BUILD)
    expect(url).toBe('http://127.0.0.1:9931/v1/systemone')
    expect(cuerpo.model).toBe('laya')
    expect(autorizacion).toBe(undefined)
    expect(modelo).toBe('opus')
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PANE_PROPS })
    expect(await ui.find({ text: /local → build-large \(0\.90\)/ })).toBeDefined()
    await ui.unmount()
  })

  test('local por OpenAI manda el header con la key y nunca la muestra', { options: { clasificador: 'local', localProtocolo: 'openai', localUrl: 'http://srv:8080/v1/chat/completions', localModelo: 'qwen3', localApiKey: 'secreta' } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    mock.env(on, {})
    let autorizacion: string | undefined
    on('http.fetch', async (_$, e) => { autorizacion = e.init?.headers?.Authorization; throw new Error('conexión rechazada con secreta') })
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-oai' }))
    await $.agent.spawn(BUILD)
    expect(autorizacion).toBe('Bearer secreta')
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PANE_PROPS })
    expect(await ui.find({ text: /secreta/ })).toBe(undefined)
    expect(await ui.find({ text: /respaldo/ })).toBeDefined()
    await ui.unmount()
  })

  test('local sin URL: decide el respaldo y avisa una vez', { options: { clasificador: 'local', localModelo: 'laya' } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    mock.env(on, {})
    const toasts: string[] = []
    on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } })
    let pedidos = 0
    on('http.fetch', async () => { pedidos++; return { value: { status: 200, ok: true, headers: {}, text: '' } } })
    on('model.classify', async () => { pedidos++; return { value: 'build-large' } })
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: `ag-${toasts.length}` }))
    await $.agent.spawn(BUILD)
    await $.agent.spawn(BUILD)
    expect(pedidos).toBe(0)
    expect(toasts.filter(t => t.includes('clasificador local')).length).toBe(1)
  })

  test('local decide las reviews por description', { options: { clasificador: 'local', localUrl: 'http://127.0.0.1:9931/v1/systemone', localModelo: 'laya' } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    mock.env(on, {})
    on('http.fetch', async () => ({ value: { status: 200, ok: true, headers: {}, text: respuestaJev('review-final', 0.95) } }))
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-rv' } })
    await $.agent.spawn({ ...BUILD, description: 'Review the parser' })
    expect(modelo).toBe('opus')
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PANE_PROPS })
    expect(await ui.find({ text: /local → review-final \(0\.95\)/ })).toBeDefined()
    await ui.unmount()
  })

  test('sombra local junta muestras sin cambiar la decisión', { options: { clasificador: 'reglas', sombra: 'local', localUrl: 'http://127.0.0.1:9931/v1/systemone', localModelo: 'laya' } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    const store = mock.store(on)
    mock.env(on, {})
    on('http.fetch', async () => ({ value: { status: 200, ok: true, headers: {}, text: respuestaJev('build-small', 0.8) } }))
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-sb' }))
    await $.agent.spawn(BUILD)
    // La sombra corre en segundo plano: esperar a que la muestra llegue al store, como en los tests de sombra jev.
  })
```

Para el último test, copiar la espera y la aserción del test de sombra `jev` que ya existe en el
archivo (el que usa `esperar(reloj, …)` y lee `store` en la clave `sombra`), cambiando el par esperado
a `reglas→local`. El nombre del par sale de `estadisticasSombra` (`principal→sombra`).

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `claude plugin test router`
Expected: FAIL (`clasificador: local` hoy cae a reglas; no hay pedido HTTP ni toast).

- [ ] **Step 3: Implementar**

Imports nuevos en `register.tsx`:

```ts
import { crearOpenAI } from '../src/clasificadores/openai'
import { crearSystemOne } from '../src/clasificadores/systemone'
```

Funciones nuevas, de nivel superior, al lado de `postJev` y `armarJev`:

```ts
const avisosSinLocal = new Set<string>()

/** La key del servidor local, de /config o de LOCAL_API_KEY; null si no hay (un servidor local suele no pedirla). */
export async function keyLocal($: EngineInterface, options: PluginOptions): Promise<string | null> {
  return (typeof options.localApiKey === 'string' && options.localApiKey) || (await $.env.get('LOCAL_API_KEY')) || null
}

/** El POST al servidor local. Como postJev: si falla, el mensaje sale sin la key. */
export async function postLocal($: EngineInterface, url: string, key: string | null, cuerpo: string) {
  try {
    return await $.http.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: cuerpo,
    })
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    throw new Error(`local: ${key ? mensaje.split(key).join('***') : mensaje}`)
  }
}

/**
 * El clasificador local (experimental), sin tope: System One (por defecto) u OpenAI con logprobs.
 * null si falta la URL o el modelo.
 */
export async function armarLocal($: EngineInterface, options: PluginOptions, umbral: number): Promise<Clasificador | null> {
  const url = typeof options.localUrl === 'string' ? options.localUrl.trim() : ''
  const modelo = typeof options.localModelo === 'string' ? options.localModelo.trim() : ''
  if (!url || !modelo) return null
  const key = await keyLocal($, options)
  const post = (cuerpo: string) => postLocal($, url, key, cuerpo)
  const ahora = () => $.clock.now()
  return options.localProtocolo === 'openai'
    ? crearOpenAI({ post, ahora, modelo, umbral })
    : crearSystemOne({ post, ahora, modelo, umbral, fuente: 'local' })
}

export function avisarSinLocal($: EngineInterface, consecuencia: string): void {
  const texto = `Router: falta la URL o el modelo del clasificador local (/config); ${consecuencia}`
  if (avisosSinLocal.has(texto)) return
  avisosSinLocal.add(texto)
  $.ui.toast(texto)
}
```

`armarClasificador` completo:

```ts
export async function armarClasificador(
  $: EngineInterface,
  options: PluginOptions,
  signal?: AbortSignal,
): Promise<{ clasificar: Clasificador; decideReviews: boolean }> {
  const conModelo = (v: unknown) => v === 'haiku' || v === 'jev' || v === 'local'
  // Con reglas y sin sombra no hace falta nada más: decide el respaldo, sin modelo.
  if (!conModelo(options.clasificador) && !conModelo(options.sombra)) {
    return { clasificar: respaldo, decideReviews: false }
  }
  const { topeMs, jevUmbral, localUmbral } = limitesDe(options)
  const ahora = () => $.clock.now()

  // La key de Jev se busca solo si alguien va a usar Jev.
  const key = options.clasificador === 'jev' || options.sombra === 'jev' ? await keyJev($, options) : null

  // El principal: reglas (el respaldo, sin tope), haiku, jev con su umbral (sin key cae a haiku) o
  // local con el suyo (sin URL o modelo decide el respaldo: un local mal configurado no gasta Haiku).
  let principal: { nombre: string; c: Clasificador } = { nombre: 'reglas', c: respaldo }
  if (options.clasificador === 'haiku') principal = { nombre: 'haiku', c: armarHaiku($) }
  else if (options.clasificador === 'jev') {
    if (key) principal = { nombre: 'jev', c: armarJevConKey($, key, jevUmbral) }
    else {
      avisarSinKey($, 'uso Haiku')
      principal = { nombre: 'haiku', c: armarHaiku($) }
    }
  } else if (options.clasificador === 'local') {
    const local = await armarLocal($, options, localUmbral)
    if (local) principal = { nombre: 'local', c: local }
    else avisarSinLocal($, 'uso el respaldo')
  }
  // Las reviews por description consultan al principal solo si es jev o local (con confianza calibrable).
  const decideReviews = principal.nombre === 'jev' || principal.nombre === 'local'
  const decide = principal.nombre === 'reglas' ? respaldo : conTopeVivo($, principal.c, topeMs, signal)

  // La sombra, con umbral 0 para guardar la elección y la confianza reales. Sin key o sin
  // configuración no se reemplaza por otra: queda desactivada.
  let sombra: { nombre: string; c: Clasificador } | null = null
  if (options.sombra === 'haiku') sombra = { nombre: 'haiku', c: armarHaiku($) }
  else if (options.sombra === 'jev' && key) sombra = { nombre: 'jev', c: armarJevConKey($, key, 0) }
  else if (options.sombra === 'jev' && options.clasificador !== 'jev') avisarSinKey($, 'sombra desactivada')
  else if (options.sombra === 'local') {
    const local = await armarLocal($, options, 0)
    if (local) sombra = { nombre: 'local', c: local }
    else if (options.clasificador !== 'local') avisarSinLocal($, 'sombra desactivada')
  }
  if (!sombra || sombra.nombre === principal.nombre) return { clasificar: decide, decideReviews }

  const clasificar = conSombra(decide, conTopeVivo($, sombra.c, LIMITE_SOMBRA_MS), m => guardarMuestra($, m), ahora, {
    principal: principal.nombre,
    sombra: sombra.nombre,
  }, topeMs)
  return { clasificar, decideReviews }
}
```

En `router/.claude-plugin/plugin.json`, dentro de `userConfig`:
- `clasificador.options`: `["reglas", "haiku", "jev", "local"]`; descripción: `Quién decide el tipo cuando las reglas no alcanzan y, si es jev o local, también las reviews por description: reglas (sin modelo), haiku, jev o local (experimental: un modelo propio por System One u OpenAI)`.
- `sombra.options`: `["off", "haiku", "jev", "local"]`.
- Opciones nuevas, después de `jevUmbral`:

```json
    "localProtocolo": {
      "type": "string",
      "title": "Local: protocolo (experimental)",
      "description": "Experimental. Cómo hablarle al servidor local: systemone (la API de Jev, que sirven llama.cpp y Ollama con decision models) u openai (/v1/chat/completions con logprobs)",
      "options": ["systemone", "openai"],
      "default": "systemone"
    },
    "localUrl": {
      "type": "string",
      "title": "Local: URL (experimental)",
      "description": "Experimental. URL completa del endpoint, por ejemplo http://127.0.0.1:9931/v1/systemone o http://127.0.0.1:11434/v1/chat/completions"
    },
    "localModelo": {
      "type": "string",
      "title": "Local: modelo (experimental)",
      "description": "Experimental. Nombre del modelo en el servidor"
    },
    "localApiKey": {
      "type": "string",
      "title": "Local: API key (experimental)",
      "description": "Experimental y opcional. Si falta, se usa la variable de entorno LOCAL_API_KEY; sin ninguna, no se manda header",
      "sensitive": true
    },
    "localUmbral": {
      "type": "number",
      "title": "Local: umbral de confianza (experimental)",
      "description": "Experimental, sin calibrar: funciona como jevUmbral. Elegilo con la tabla de calibración de bench/informe.mjs. Entre 0 y 1",
      "default": 0.7
    },
```

- [ ] **Step 4: Correr los tests y validar**

Run: `claude plugin test router` y `claude plugin validate --strict router`
Expected: PASS y validación sin errores.

- [ ] **Step 5: Commit**

```bash
git add router/hooks/register.tsx router/.claude-plugin/plugin.json router/tests/register.test.ts
git commit -m "feat(router): experimental local classifier in /config, as principal or shadow"
```

---

### Task 5: Suites del banco y `/router bench --suite`

**Files:**
- Modify: `router/src/banco.ts`, `router/src/overrides.ts` (`Comando` banco, `parsearBanco`, `USO_BANCO`), `router/hooks/register.tsx` (`correrBancoEnSesion`)
- Test: `router/tests/banco.test.ts`, `router/tests/overrides.test.ts`, `router/tests/register.test.ts`

**Interfaces:**
- Consumes (Task 4): `armarLocal`, `armarJev`, `armarHaiku`, `conEsperaCortable`, `LIMITE_BANCO_MS`.
- Produces:
  - `banco.ts`:
    - `export type Suite = 'tipos' | 'talla' | 'review'`; `export const SUITES: readonly Suite[] = ['tipos', 'talla', 'review']`
    - `export type CasoSuite = { id: string; descripcion: string; resumen: Resumen; regla?: string | null }`
    - `export type ItemSuite = { id: string; descripcion: string; resumen: Resumen; etiquetas: readonly Tipo[] }`
    - `itemsDeSuite(casos: readonly CasoSuite[], suite: Suite, idsReview: ReadonlySet<string>): ItemSuite[]` — `tipos`: todos con `TIPOS`; `talla`: `regla === 'build'` con `TALLAS`; `review`: ids en `idsReview` con `TALLAS_REVIEW`.
    - `export type ResultadoSuite = { id: string; tipo: string | null; confianza: number | null; ms: number; error: string | null }`
    - `correrSuite(items: readonly ItemSuite[], c: Clasificador, opciones: { concurrencia: number; alAvanzar?: (hechos: number, total: number, parciales: readonly ResultadoSuite[]) => Promise<void> }): Promise<ResultadoSuite[]>` — resultados en el orden de `items`.
    - `nombreCorridaSuite(fechaLocal: Date, selector: string, suite: Suite): string` — `bench/corridas/<AAAA-MM-DD>-<HHMM>-sel-<selector>-<suite>.json`.
  - `overrides.ts`: `{ accion: 'banco'; max: number | null; solo: 'haiku' | 'jev' | 'local' | null; suite: Suite | 'todas' | null; concurrencia: number | null; tokens: number | null }`.
  - `register.tsx`: `correrBancoEnSesion($, options, comando)` con el comando nuevo; `muestraTokens($, items: readonly ItemSuite[]): Promise<{ muestra: number; entrada: number; salida: number } | null>`.

- [ ] **Step 1: Escribir los tests que fallan**

En `router/tests/banco.test.ts`:

```ts
import { itemsDeSuite, correrSuite, nombreCorridaSuite } from '../src/banco'
import { TALLAS_REVIEW } from '../src/clasificadores'
import { TIPOS } from '../src/taxonomia'

const SUITE = [
  { id: 'a', descripcion: 'Implement Task 1', resumen: RESUMEN, regla: 'build' },
  { id: 'b', descripcion: 'Review Task 1', resumen: RESUMEN, regla: 'review' },
  { id: 'c', descripcion: 'Research X', resumen: RESUMEN, regla: 'research' },
]

describe('itemsDeSuite', () => {
  test('tipos: todos con las 9; talla: los build; review: los de la referencia', () => {
    expect(itemsDeSuite(SUITE, 'tipos', new Set()).map(i => [i.id, i.etiquetas])).toEqual([['a', TIPOS], ['b', TIPOS], ['c', TIPOS]])
    expect(itemsDeSuite(SUITE, 'talla', new Set()).map(i => [i.id, i.etiquetas])).toEqual([['a', TALLAS]])
    expect(itemsDeSuite(SUITE, 'review', new Set(['b'])).map(i => [i.id, i.etiquetas])).toEqual([['b', TALLAS_REVIEW]])
  })
})

describe('correrSuite', () => {
  test('un resultado por item, en orden, con los errores atrapados', async () => {
    const c: Clasificador = async ({ descripcion, etiquetas }) => {
      if (descripcion.startsWith('Research')) throw new Error('local: HTTP 500')
      return { tipo: etiquetas[0]!, confianza: 0.9, ms: 40, fuente: 'local' }
    }
    const rs = await correrSuite(itemsDeSuite(SUITE, 'tipos', new Set()), c, { concurrencia: 2 })
    expect(rs).toEqual([
      { id: 'a', tipo: 'review-final', confianza: 0.9, ms: 40, error: null },
      { id: 'b', tipo: 'review-final', confianza: 0.9, ms: 40, error: null },
      { id: 'c', tipo: null, confianza: null, ms: 0, error: 'local: HTTP 500' },
    ])
  })
})

test('nombreCorridaSuite', () => {
  expect(nombreCorridaSuite(new Date(2026, 9, 15, 9, 5), 'haiku', 'talla')).toBe('bench/corridas/2026-10-15-0905-sel-haiku-talla.json')
})
```

(`TIPOS[0]` es `review-final`; si el orden de `TIPOS` en `taxonomia.ts` fuera otro, ajustar el valor
esperado a `TIPOS[0]`.)

En `router/tests/overrides.test.ts`, en `describe('parsearComando banco')`: los `toEqual` actuales pasan a
incluir `suite: null, concurrencia: null, tokens: null`, y se agrega:

```ts
  test('suite, concurrencia, tokens y solo local', () => {
    expect(parsearComando('bench --suite todas --solo local --concurrencia 2')).toEqual({ accion: 'banco', max: null, solo: 'local', suite: 'todas', concurrencia: 2, tokens: null })
    expect(parsearComando('bench --suite talla --solo haiku --tokens 20')).toEqual({ accion: 'banco', max: null, solo: 'haiku', suite: 'talla', concurrencia: null, tokens: 20 })
    expect(parsearComando('bench --suite gpt')).toMatchObject({ accion: 'error' })
    expect(parsearComando('bench --solo local')).toMatchObject({ accion: 'error' })
    expect(parsearComando('bench --tokens 5')).toMatchObject({ accion: 'error' })
    expect(parsearComando('bench --concurrencia 0')).toMatchObject({ accion: 'error' })
  })
```

En `router/tests/register.test.ts`, un test de `/router bench --suite talla --solo local` con un `fs`
falso (el archivo ya tiene tests de `/router bench`: seguir su forma para `session.cwd`, `fs.read` y
`fs.write`). Debe verificar que escribe `bench/corridas/<…>-sel-local-talla.json` con
`selector: 'local'`, `suite: 'talla'`, `modelo: 'laya'`, `protocolo: 'systemone'`, `concurrencia: 1`
y un resultado por caso de regla `build`; que la `url` guardada es la de `/config`; y que la línea de
respuesta empieza con `Banco: talla`.

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `claude plugin test router`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `router/src/banco.ts` (imports de valor `TALLAS`, `TALLAS_REVIEW` de `./clasificadores` y `TIPOS` de `./taxonomia`):

```ts
export type Suite = 'tipos' | 'talla' | 'review'
export const SUITES: readonly Suite[] = ['tipos', 'talla', 'review']
export type CasoSuite = { id: string; descripcion: string; resumen: Resumen; regla?: string | null }
export type ItemSuite = { id: string; descripcion: string; resumen: Resumen; etiquetas: readonly Tipo[] }
export type ResultadoSuite = { id: string; tipo: string | null; confianza: number | null; ms: number; error: string | null }

/** Los casos de una suite, con las etiquetas que se le ofrecen al selector (§3 del spec). */
export function itemsDeSuite(casos: readonly CasoSuite[], suite: Suite, idsReview: ReadonlySet<string>): ItemSuite[] {
  const con = (c: CasoSuite, etiquetas: readonly Tipo[]): ItemSuite => ({ id: c.id, descripcion: c.descripcion, resumen: c.resumen, etiquetas })
  if (suite === 'tipos') return casos.map(c => con(c, TIPOS))
  if (suite === 'talla') return casos.filter(c => c.regla === 'build').map(c => con(c, TALLAS))
  return casos.filter(c => idsReview.has(c.id)).map(c => con(c, TALLAS_REVIEW))
}

/** Corre una suite con un selector, sin tope (mide la latencia real); los errores quedan en `error`. */
export async function correrSuite(
  items: readonly ItemSuite[],
  c: Clasificador,
  opciones: { concurrencia: number; alAvanzar?: (hechos: number, total: number, parciales: readonly ResultadoSuite[]) => Promise<void> },
): Promise<ResultadoSuite[]> {
  const resultados: (ResultadoSuite | undefined)[] = new Array(items.length)
  let siguiente = 0
  let hechos = 0
  const trabajador = async () => {
    while (siguiente < items.length) {
      const i = siguiente++
      const it = items[i]!
      try {
        const r = await c({ descripcion: it.descripcion, resumen: it.resumen, etiquetas: it.etiquetas })
        resultados[i] = { id: it.id, tipo: r.tipo, confianza: r.confianza ?? null, ms: r.ms, error: null }
      } catch (e) {
        resultados[i] = { id: it.id, tipo: null, confianza: null, ms: 0, error: e instanceof Error ? e.message : String(e) }
      }
      hechos++
      await opciones.alAvanzar?.(hechos, items.length, resultados.filter((r): r is ResultadoSuite => r !== undefined))
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opciones.concurrencia) }, trabajador))
  return resultados as ResultadoSuite[]
}

export function nombreCorridaSuite(fechaLocal: Date, selector: string, suite: Suite): string {
  return nombreCorrida(fechaLocal).replace(/-banco\.json$/, `-sel-${selector}-${suite}.json`)
}
```

En `router/src/overrides.ts`:

```ts
  | { accion: 'banco'; max: number | null; solo: 'haiku' | 'jev' | 'local' | null; suite: Suite | 'todas' | null; concurrencia: number | null; tokens: number | null }
// …
const USO_BANCO = 'Usage: /router bench [--suite tipos|talla|review|todas] [--solo haiku|jev|local] [--max N] [--concurrencia N] [--tokens N]'

function parsearBanco(resto: readonly string[]): Comando {
  let max: number | null = null
  let solo: 'haiku' | 'jev' | 'local' | null = null
  let suite: Suite | 'todas' | null = null
  let concurrencia: number | null = null
  let tokens: number | null = null
  const entero = (valor: string | undefined) => (valor !== undefined && /^\d+$/.test(valor) && Number(valor) >= 1 ? Number(valor) : null)
  for (let i = 0; i < resto.length; i += 2) {
    const opcion = resto[i]!.toLowerCase()
    const valor = resto[i + 1]
    if (opcion === '--max') {
      max = entero(valor)
      if (max === null) return { accion: 'error', mensaje: `--max pide un número de casos mayor que 0. ${USO_BANCO}` }
    } else if (opcion === '--concurrencia') {
      concurrencia = entero(valor)
      if (concurrencia === null) return { accion: 'error', mensaje: `--concurrencia pide un número mayor que 0. ${USO_BANCO}` }
    } else if (opcion === '--tokens') {
      tokens = entero(valor)
      if (tokens === null) return { accion: 'error', mensaje: `--tokens pide un número de casos mayor que 0. ${USO_BANCO}` }
    } else if (opcion === '--solo') {
      const v = valor?.toLowerCase()
      if (v !== 'haiku' && v !== 'jev' && v !== 'local') return { accion: 'error', mensaje: `--solo es haiku, jev o local, no "${valor ?? ''}". ${USO_BANCO}` }
      solo = v
    } else if (opcion === '--suite') {
      const v = valor?.toLowerCase()
      if (v !== 'todas' && !(SUITES as readonly string[]).includes(v ?? '')) return { accion: 'error', mensaje: `--suite es tipos, talla, review o todas, no "${valor ?? ''}". ${USO_BANCO}` }
      suite = v as Suite | 'todas'
    } else {
      return { accion: 'error', mensaje: `Opción desconocida: ${resto[i]}. ${USO_BANCO}` }
    }
  }
  // El banco viejo (sin --suite) solo conoce haiku y jev, y no toma muestra de tokens.
  if (suite === null && solo === 'local') return { accion: 'error', mensaje: `--solo local pide --suite. ${USO_BANCO}` }
  if (suite === null && tokens !== null) return { accion: 'error', mensaje: `--tokens pide --suite. ${USO_BANCO}` }
  return { accion: 'banco', max, solo, suite, concurrencia, tokens }
}
```

(`import type { Suite } from './banco'` e `import { SUITES } from './banco'`: verificar que `banco.ts`
no importe `overrides.ts`, para no armar un ciclo.)

En `router/hooks/register.tsx`, `correrBancoEnSesion`:
- Si `comando.suite === null`: el camino de hoy sin cambios, salvo `concurrencia: comando.concurrencia ?? 1` (antes 3). `solo` acá solo puede ser `haiku | jev | null` (el parser ya lo garantiza; castear).
- Si no, `correrSuitesEnSesion($, options, comando)`, una función de nivel superior nueva:

```ts
/** Muestra de tokens de Haiku con $.model.complete (classify no devuelve usage): el mismo texto, sin el prompt fijo de classify. */
export async function muestraTokens($: EngineInterface, items: readonly ItemSuite[]): Promise<{ muestra: number; entrada: number; salida: number } | null> {
  const usos: { entrada: number; salida: number }[] = []
  for (const it of items) {
    const texto = textoParaHaiku(textoResumen(it.descripcion, it.resumen), it.etiquetas)
    const r = await $.model.complete({ model: 'haiku', prompt: `${texto}\n\nRespondé solo con una de estas etiquetas: ${it.etiquetas.join(', ')}` }).catch(() => null)
    if (r?.isAnswered) {
      const u = r.usage
      usos.push({ entrada: u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens, salida: u.output_tokens })
    }
  }
  if (!usos.length) return null
  const media = (f: (u: { entrada: number; salida: number }) => number) => usos.reduce((a, u) => a + f(u), 0) / usos.length
  return { muestra: usos.length, entrada: media(u => u.entrada), salida: media(u => u.salida) }
}

export async function correrSuitesEnSesion(
  $: EngineInterface,
  options: PluginOptions,
  comando: { max: number | null; solo: 'haiku' | 'jev' | 'local' | null; suite: Suite | 'todas'; concurrencia: number | null; tokens: number | null },
): Promise<string> {
  const cwd = await $.session.cwd()
  const { casos } = JSON.parse(String(await $.fs.read(`${cwd}/bench/casos.json`))) as { casos: CasoSuite[] }
  const idsReview = new Set(Object.keys(JSON.parse(String(await $.fs.read(`${cwd}/bench/etiquetas-review.json`))) as Record<string, unknown>))
  const suites: Suite[] = comando.suite === 'todas' ? [...SUITES] : [comando.suite]
  const concurrencia = comando.concurrencia ?? 1

  // Los selectores: sin --solo, los que estén configurados. Umbral 0: la confianza queda en la corrida.
  const selectores: { nombre: 'haiku' | 'jev' | 'local'; c: Clasificador; meta: Record<string, unknown> }[] = []
  const avisos: string[] = []
  if (comando.solo === null || comando.solo === 'haiku') selectores.push({ nombre: 'haiku', c: armarHaiku($), meta: { modelo: 'haiku', protocolo: null, url: null } })
  if (comando.solo === null || comando.solo === 'jev') {
    const jev = await armarJev($, options, 0)
    if (jev) selectores.push({ nombre: 'jev', c: jev, meta: { modelo: JEV_MODELO, protocolo: 'systemone', url: JEV_URL } })
    else if (comando.solo === 'jev') avisos.push('sin key de Jev')
  }
  if (comando.solo === null || comando.solo === 'local') {
    const local = await armarLocal($, options, 0)
    if (local) selectores.push({ nombre: 'local', c: local, meta: { modelo: options.localModelo, protocolo: options.localProtocolo === 'openai' ? 'openai' : 'systemone', url: options.localUrl } })
    else if (comando.solo === 'local') avisos.push('falta la URL o el modelo del clasificador local')
  }

  const ahora = new Date(await $.clock.now())
  const partes: string[] = []
  for (const suite of suites) {
    const items = itemsDeSuite(casos, suite, idsReview).slice(0, comando.max ?? undefined)
    for (const s of selectores) {
      const relativa = nombreCorridaSuite(ahora, s.nombre, suite)
      const tokens = s.nombre === 'haiku' ? await muestraTokens($, items.slice(0, comando.tokens ?? 20)) : null
      const enCola = colaEnOrden()
      const guardar = (resultados: readonly ResultadoSuite[]) =>
        enCola(() => $.fs.write(`${cwd}/${relativa}`, JSON.stringify({ fecha: ahora.toISOString(), selector: s.nombre, suite, ...s.meta, hardware: null, concurrencia, tokens, resultados }, null, 1) + '\n'))
      const c = conEsperaCortable($, dormir => conLimite(s.c, LIMITE_BANCO_MS, dormir))
      const resultados = await correrSuite(items, c, {
        concurrencia,
        alAvanzar: async (hechos, _total, parciales) => { if (hechos % 25 === 0) await guardar(parciales).catch(() => {}) },
      })
      await guardar(resultados)
      const errores = resultados.filter(r => r.error !== null).length
      partes.push(`${s.nombre} ${resultados.length - errores} ok / ${errores} error`)
    }
  }
  const aviso = avisos.length ? ` · ${avisos.join(' · ')}` : ''
  return `Banco: ${suites.join('+')} · ${partes.join(' · ') || 'sin selectores'}${aviso}`
}
```

`$.model.complete` no recibe `max_tokens` a propósito: se mide lo que gasta Haiku con su thinking por
defecto. En el test de `register`, `model.complete` no se llama (es `--solo local`).

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `claude plugin test router`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add router/src/banco.ts router/src/overrides.ts router/hooks/register.tsx router/tests/banco.test.ts router/tests/overrides.test.ts router/tests/register.test.ts
git commit -m "feat(router): /router bench --suite runs each selector on the three bench suites, with a Haiku token sample"
```

---

### Task 6: `bench/lib/politica.mjs`, una sola copia de las simulaciones

**Files:**
- Create: `bench/lib/politica.mjs`
- Modify: `bench/analizar-jev-todos.mjs`, `bench/review-talla.mjs` (pasan a importar de `lib/politica.mjs`)

**Interfaces:**
- Consumes: `router/src/reglas.ts` (`clasificarPorReglas`), `router/src/registro.ts` (`tareaDe`).
- Produces (exports de `bench/lib/politica.mjs`):
  - `TALLAS`, `TALLAS_REVIEW`, `REVIEWS`, `respaldoTalla(caso)`, `respaldoAnterior(caso)`
  - `ALCANCE_AMPLIO`, `TAREA_NUMERADA`, `rangoDeTareas(descripcion)`, `avisarSiDiverge()` (el chequeo contra `router/src/tallaReview.ts`, que imprime `AVISO: …` y nombra `bench/lib/politica.mjs` como lugar de la copia)
  - `tallaBuildDe(casos, etiquetas, i)` — la talla de referencia del build anterior más cercano del mismo proyecto y tarea, como `tallaBuild` de hoy.
  - `pasosDeReview(casos, etiquetas, ref)` → `[{ c, i, ref, rango, palabra, build }]`, como `reviews` de hoy.
  - `politicaTallaReview(r, clasificador)` → `{ tipo, paso }`, como `politica` de hoy.
  - `politicaTipos(caso, regla, { tipos, talla }, umbral, decideReviews)` → tipo final: la fase 6 con un selector cualquiera. `tipos` y `talla` son `Map<id, { tipo, confianza }>` (pueden ser `null` para reglas). Reglas: `decideReviews` false, `tipos` y `talla` null. Con `regla` de review por description y `decideReviews`: el selector si `confianza >= umbral` y no elige `explore` o `write`, si no la regla. Con regla `build`: talla del selector si `confianza >= umbral`, si no `respaldoTalla`. Sin regla: el selector sin umbral, o `build-small` si no hay respuesta. El resto de las reglas, la regla.

- [ ] **Step 1: Guardar las salidas de hoy como referencia**

```bash
node bench/analizar-jev-todos.mjs bench/corridas/2026-10-09-1339-jev-todos.json > "$TMPDIR/antes-analizar.txt"
node bench/review-talla.mjs > "$TMPDIR/antes-review.txt"
```

(`review-talla.mjs` sin `JEV_API_KEY` no llama a Jev. Si `TMPDIR` no está definido, usar el scratchpad
de la sesión.)

- [ ] **Step 2: Extraer**

Crear `bench/lib/politica.mjs` moviendo **sin cambiar la lógica** las constantes y funciones de
`review-talla.mjs` (`ALCANCE_AMPLIO`, `FIN`, `TAREA_NUMERADA`, `RANGOS_TXT`, `RANGOS`, el bloque de
aviso como `avisarSiDiverge()`, `rangoDeTareas`, `tallaBuild` como `tallaBuildDe(casos, etiquetas, i)`,
el `map` de `reviews` como `pasosDeReview`, y `politica` como `politicaTallaReview`) y de
`analizar-jev-todos.mjs` (`TALLAS`, `REVIEWS`, `respaldoTalla`, `respaldoAnterior`). Agregar
`politicaTipos`:

```js
// La política de la fase 6 con un selector cualquiera (jev, local, haiku o reglas). Ver el spec §4.
export function politicaTipos(c, regla, { tipos, talla }, umbral, decideReviews) {
  if (regla && REVIEWS.includes(regla.tipo) && !regla.regla.startsWith('subagentType')) {
    if (!decideReviews) return regla.tipo
    const j = tipos?.get(c.id)
    return j?.tipo && j.confianza >= umbral && j.tipo !== 'explore' && j.tipo !== 'write' ? j.tipo : regla.tipo
  }
  if (regla && regla.tipo === 'build') {
    const t = talla?.get(c.id)
    return t?.tipo && TALLAS.includes(t.tipo) && (t.confianza ?? 1) >= umbral ? t.tipo : respaldoTalla(c)
  }
  if (regla) return regla.tipo
  return tipos?.get(c.id)?.tipo ?? 'build-small'
}
```

(`t.confianza ?? 1`: Haiku no tiene confianza y en producción su respuesta de talla se usa siempre.)

En `review-talla.mjs` y `analizar-jev-todos.mjs`, reemplazar las copias por imports de
`./lib/politica.mjs`. `analizar-jev-todos.mjs` mantiene sus funciones propias (`pipelineActual`,
`jevPrimero`, `hibrido`, `fase6`): solo deja de definir lo que ahora importa.

- [ ] **Step 3: Verificar que las salidas no cambian**

```bash
node bench/analizar-jev-todos.mjs bench/corridas/2026-10-09-1339-jev-todos.json > "$TMPDIR/despues-analizar.txt"
node bench/review-talla.mjs > "$TMPDIR/despues-review.txt"
diff "$TMPDIR/antes-analizar.txt" "$TMPDIR/despues-analizar.txt" && diff "$TMPDIR/antes-review.txt" "$TMPDIR/despues-review.txt" && echo IGUALES
```

Expected: `IGUALES`, sin ningún `AVISO:`. Los dos scripts reescriben sus `.md` en `bench/corridas/`:
`git diff --stat bench/corridas` no debe mostrar cambios (si muestra, algo cambió la lógica).

- [ ] **Step 4: Probar `politicaTipos` contra la fase 6**

```bash
node -e "
import('./bench/lib/politica.mjs').then(async p => {
  const fs = await import('node:fs');
  const { clasificarPorReglas } = await import('./router/src/reglas.ts');
  const { casos } = JSON.parse(fs.readFileSync('bench/casos.json', 'utf8'));
  const et = JSON.parse(fs.readFileSync('bench/etiquetas.json', 'utf8'));
  const ok = casos.filter(c => p.politicaTipos(c, clasificarPorReglas(c.descripcion, c.subagentType), { tipos: null, talla: null }, 0.7, false) === et[c.id]?.tipo).length;
  console.log('reglas', ok, '/', casos.length);
})"
```

Expected: imprime un acierto cercano al de la fila "fase 5 con el respaldo nuevo, sin Jev en talla ni
reviews" del análisis (≈ 90%). Anotar el número en el reporte de la tarea.

- [ ] **Step 5: Commit**

```bash
git add bench/lib/politica.mjs bench/analizar-jev-todos.mjs bench/review-talla.mjs
git commit -m "refactor(bench): routing policy simulations in one shared module"
```

---

### Task 7: `bench/selectores.mjs` y el servidor falso

**Files:**
- Create: `bench/lib/servidor-falso.mjs`, `bench/selectores.mjs`
- Delete: `bench/jev-todos.mjs`

**Interfaces:**
- Consumes (Task 1): `pedidoSystemOne`, `leerSystemOne`, `pedidoOpenAI`, `leerOpenAI`, `textoOpenAI` de `router/src/clasificadores/protocolos.ts`; `preguntaJev`, `textoParaHaiku` de `preguntas.ts`.
- Produces:
  - `node bench/lib/servidor-falso.mjs [--puerto 9931] [--logprobs no] [--demora MS]` — `POST /v1/systemone` responde `{ answers: { tipo: { type: 'choice', choice: <primer criterio>, confidence: 0.8, probabilities: {…} } } }`; `POST /v1/chat/completions` responde la letra `A` con logprobs (`A` 0.8, `B` 0.2) salvo `--logprobs no`. Imprime `escuchando en http://127.0.0.1:<puerto>`.
  - Corridas `bench/corridas/<AAAA-MM-DD>-<HHMM>-sel-<jev|local>-<suite>.json` con el formato del spec §3.

- [ ] **Step 1: El servidor falso**

```js
// bench/lib/servidor-falso.mjs
// Un servidor de prueba que habla System One y OpenAI, para probar el clasificador local y el banco
// sin un modelo de verdad. Siempre elige la primera opción.
//   node bench/lib/servidor-falso.mjs [--puerto 9931] [--logprobs no] [--demora MS]
import http from 'node:http'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const puerto = Number(arg('--puerto', '9931'))
const conLogprobs = arg('--logprobs', 'si') !== 'no'
const demora = Number(arg('--demora', '0'))

const responder = (res, cuerpo) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(cuerpo)) }

http.createServer((req, res) => {
  let datos = ''
  req.on('data', d => (datos += d))
  req.on('end', () => setTimeout(() => {
    let pedido
    try { pedido = JSON.parse(datos) } catch { res.writeHead(400); return res.end('json roto') }
    if (req.url === '/v1/systemone') {
      const opciones = Object.keys(pedido.questions?.tipo?.criteria ?? {})
      const probabilities = Object.fromEntries(opciones.map((o, i) => [o, i === 0 ? 0.8 : 0.2 / Math.max(1, opciones.length - 1)]))
      return responder(res, { model: pedido.model, answers: { tipo: { type: 'choice', choice: opciones[0], confidence: 0.8, probabilities } } })
    }
    if (req.url === '/v1/chat/completions') {
      const logprobs = conLogprobs ? { content: [{ token: 'A', logprob: Math.log(0.8), top_logprobs: [{ token: 'A', logprob: Math.log(0.8) }, { token: 'B', logprob: Math.log(0.2) }] }] } : null
      return responder(res, { model: pedido.model, choices: [{ message: { role: 'assistant', content: '{"r":"A"}' }, logprobs }] })
    }
    res.writeHead(404); res.end()
  }, demora))
}).listen(puerto, '127.0.0.1', () => console.log(`escuchando en http://127.0.0.1:${puerto}`))
```

- [ ] **Step 2: `selectores.mjs`**

```js
// Corre un selector (jev o local) sobre las suites del banco, armando el pedido como producción
// (protocolos.ts y preguntas.ts): solo descripción y resumen, nunca el prompt; umbral 0.
//   [JEV_API_KEY=…] [LOCAL_API_KEY=…] node bench/selectores.mjs --selector jev|local --suite tipos|talla|review|todas
//     [--protocolo systemone|openai] [--url U] [--modelo M] [--hardware H] [--max N] [--concurrencia N]
// Escribe bench/corridas/<AAAA-MM-DD>-<HHMM>-sel-<selector>-<suite>.json cada 50 resultados y al final.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { preguntaJev, textoParaHaiku } from '../router/src/clasificadores/preguntas.ts'
import { leerOpenAI, leerSystemOne, pedidoOpenAI, pedidoSystemOne, textoOpenAI } from '../router/src/clasificadores/protocolos.ts'

const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
const JEV_MODELO = 'jev-1.13.0'
const TIPOS = ['review-final', 'review', 're-review', 'build-large', 'build-small', 'fix', 'explore', 'research', 'write']
const ETIQUETAS = { tipos: TIPOS, talla: ['build-large', 'build-small'], review: ['review-large', 'review-small'] }
const LIMITE_MS = 60_000

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const selector = arg('--selector')
const suiteArg = arg('--suite', 'todas')
const uso = 'Uso: node bench/selectores.mjs --selector jev|local --suite tipos|talla|review|todas [--protocolo systemone|openai] [--url U] [--modelo M] [--hardware H] [--max N] [--concurrencia N]'
if (!['jev', 'local'].includes(selector) || !['tipos', 'talla', 'review', 'todas'].includes(suiteArg)) { console.error(uso); process.exit(1) }

const protocolo = selector === 'jev' ? 'systemone' : arg('--protocolo', 'systemone')
const url = selector === 'jev' ? JEV_URL : arg('--url')
const modelo = selector === 'jev' ? JEV_MODELO : arg('--modelo')
const key = selector === 'jev' ? process.env.JEV_API_KEY : process.env.LOCAL_API_KEY
if (selector === 'jev' && !key) { console.error('Falta JEV_API_KEY.'); process.exit(1) }
if (selector === 'local' && (!url || !modelo || !['systemone', 'openai'].includes(protocolo))) { console.error(`El local pide --url, --modelo y --protocolo systemone|openai. ${uso}`); process.exit(1) }
const max = arg('--max') ? Number(arg('--max')) : undefined
const concurrencia = Math.max(1, Number(arg('--concurrencia', '1')))
const hardware = arg('--hardware')

const aqui = path.dirname(fileURLToPath(import.meta.url))
const { casos } = JSON.parse(fs.readFileSync(path.join(aqui, 'casos.json'), 'utf8'))
const idsReview = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(aqui, 'etiquetas-review.json'), 'utf8'))))
const deSuite = s => (s === 'tipos' ? casos : s === 'talla' ? casos.filter(c => c.regla === 'build') : casos.filter(c => idsReview.has(c.id))).slice(0, max)

const tapar = t => (key ? String(t).split(key).join('***') : String(t))
async function clasificar(c, etiquetas) {
  const cuerpo = protocolo === 'systemone'
    ? pedidoSystemOne(modelo, c.tarea, preguntaJev(etiquetas))
    : pedidoOpenAI(modelo, textoOpenAI(textoParaHaiku(c.tarea, etiquetas), etiquetas), etiquetas)
  const inicio = Date.now()
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(LIMITE_MS),
    })
    const texto = await r.text()
    const ms = Date.now() - inicio
    if (!r.ok) return { id: c.id, tipo: null, confianza: null, ms, error: `HTTP ${r.status}` }
    const leido = protocolo === 'systemone' ? leerSystemOne(texto, etiquetas, selector) : leerOpenAI(texto, etiquetas)
    return { id: c.id, tipo: leido.tipo, confianza: leido.confianza, ms, error: null }
  } catch (e) {
    return { id: c.id, tipo: null, confianza: null, ms: Date.now() - inicio, error: tapar(e?.message ?? e) }
  }
}

const ahora = new Date()
const dos = n => String(n).padStart(2, '0')
const sello = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}-${dos(ahora.getHours())}${dos(ahora.getMinutes())}`
// La URL se guarda sin credenciales (usuario:clave@).
const urlGuardada = (() => { try { const u = new URL(url); u.username = ''; u.password = ''; return u.toString() } catch { return null } })()

for (const suite of suiteArg === 'todas' ? ['tipos', 'talla', 'review'] : [suiteArg]) {
  const lista = deSuite(suite)
  const etiquetas = ETIQUETAS[suite]
  const salida = path.join(aqui, 'corridas', `${sello}-sel-${selector}-${suite}.json`)
  const resultados = new Array(lista.length)
  const guardar = () => fs.writeFileSync(salida, JSON.stringify({
    fecha: ahora.toISOString(), selector, suite, modelo, protocolo, url: urlGuardada, hardware, concurrencia, tokens: null,
    resultados: resultados.filter(Boolean),
  }, null, 1) + '\n')
  let siguiente = 0
  let hechos = 0
  await Promise.all(Array.from({ length: concurrencia }, async () => {
    while (siguiente < lista.length) {
      const i = siguiente++
      resultados[i] = await clasificar(lista[i], etiquetas)
      if (++hechos % 50 === 0) { guardar(); console.log(`${suite} ${hechos}/${lista.length}`) }
    }
  }))
  guardar()
  const errores = resultados.filter(r => r.error).length
  console.log(`${suite}: ${lista.length} casos · ${lista.length - errores} ok / ${errores} error → ${path.relative(process.cwd(), salida)}`)
}
```

- [ ] **Step 3: Probar contra el servidor falso**

En una terminal en segundo plano: `node bench/lib/servidor-falso.mjs --puerto 9931`. Después:

```bash
node bench/selectores.mjs --selector local --suite todas --url http://127.0.0.1:9931/v1/systemone --modelo falso --hardware "servidor falso" --max 5
node bench/selectores.mjs --selector local --protocolo openai --suite talla --url http://127.0.0.1:9931/v1/chat/completions --modelo falso --max 5
```

Expected: cuatro archivos `-sel-local-{tipos,talla,review}.json`, cada uno con 5 resultados sin
error y `confianza` 0.8. Revisar uno a mano. **Borrar esos archivos de prueba** (no se commitean).
Parar el servidor.

- [ ] **Step 4: Borrar `jev-todos.mjs` y actualizar referencias**

```bash
git rm bench/jev-todos.mjs
grep -rn "jev-todos.mjs" --include=*.mjs --include=*.md bench router docs | grep -v corridas/
```

En `bench/analizar-jev-todos.mjs`, el comentario de cabecera pasa a decir que analiza corridas viejas
de `jev-todos` (el script ya no existe). Las referencias en docs se arreglan en la tarea 9.

- [ ] **Step 5: Commit**

```bash
git add bench/lib/servidor-falso.mjs bench/selectores.mjs bench/analizar-jev-todos.mjs
git commit -m "feat(bench): selector runner for Jev and local servers, fake System One/OpenAI server; drop jev-todos"
```

---

### Task 8: `bench/informe.mjs` y `bench/precios.json`

**Files:**
- Create: `bench/precios.json`, `bench/informe.mjs`

**Interfaces:**
- Consumes (Task 6): `politicaTipos`, `politicaTallaReview`, `pasosDeReview`, `respaldoTalla`, `avisarSiDiverge`. (Tasks 5 y 7): las corridas `-sel-*.json`.
- Produces: `node bench/informe.mjs [--tope 1000] [corridas…]` → imprime y escribe `bench/corridas/<AAAA-MM-DD>-<HHMM>-informe-selectores.md`.

- [ ] **Step 1: `precios.json`**

```json
{
 "consultado": "2026-10-15",
 "haiku": {
  "modelo": "claude-haiku-5-5",
  "entradaPorMTok": 0.10,
  "salidaPorMTok": 0.50,
  "fuente": "Precio de lista de la API de Anthropic (cacheado 2026-10-06). El thinking se cobra como salida.",
  "nota": "Con Claude Max no se paga por llamada: consume cuota de la ventana de 5 h."
 },
 "jev": {
  "modelo": "jev-1.13.0",
  "entradaPorMTok": 0.042,
  "salidaPorMTok": null,
  "fuente": "typesafe.ai ($42 por mil millones de tokens de entrada), consultado 2026-10-15.",
  "nota": "No publica precio de salida. Los tokens de entrada se estiman: caracteres del pedido / 4."
 },
 "local": { "fuente": "$0 marginal: corre en hardware propio.", "nota": "Ver el hardware de cada corrida." },
 "reglas": { "fuente": "$0: no hay modelo." }
}
```

- [ ] **Step 2: `informe.mjs`**

Reglas de cálculo (todas sobre las mismas suites del spec §3):

- **Elegir corridas:** con argumentos, esas; sin argumentos, de `bench/corridas/*-sel-*.json` la más nueva por `(selector, modelo, protocolo, suite)`. Cada local distinto es una fila: `local · <modelo> (<protocolo>)`.
- **Referencia:** `tipos` y `talla` contra `etiquetas.json` (`tipo`, `seguro`); `review` contra `etiquetas-review.json` (`talla`, `seguro`). Un caso sin referencia no cuenta.
- **Respaldo por suite:** `tipos` → `build-small`; `talla` → `respaldoTalla(caso)`; `review` → `review-small`. La fila **reglas** usa el respaldo en todo, con latencia 0.
- **Umbral del selector:** jev → 0.7; local → `--umbral-local` (por defecto 0.7); haiku → sin umbral (no tiene confianza).
- **Columnas** (spec §4): `n`, `acierta` (sobre los que respondieron), `seguros`, `con umbral` (en `talla` y `review`, con `confianza < umbral` cuenta el respaldo; en `tipos`, igual que `acierta` porque sin regla no hay umbral), `con tope` (además, error o `ms > tope` → respaldo), `p50`, `p95`, `máx` (percentil como `sombra.ts`: `orden[Math.min(n - 1, Math.floor(q * n))]`), `> tope` (%), `errores`, `USD / 1.000`.
- **USD / 1.000:** haiku: `(tokens.entrada × entradaPorMTok + tokens.salida × salidaPorMTok) / 1e6 × 1000`, con `≈`; si la corrida no tiene `tokens`, `sin dato`. jev: tokens de entrada estimados como el promedio de `JSON.stringify(pedidoSystemOne(JEV_MODELO, c.tarea, preguntaJev(etiquetas))).length / 4` sobre los casos de la suite, × `entradaPorMTok` / 1e6 × 1000, con `≈` y la nota `+ salida sin dato`. local y reglas: `$0`.
- **Calibración** (jev y cada local, en `tipos` y `talla`): tramos `[0, 0.5)`, `[0.5, 0.7)`, `[0.7, 0.9)`, `[0.9, 1]`, con `n` y acierto.
- **Política completa:**
  - Tipos (729): para cada selector, `politicaTipos(c, clasificarPorReglas(c.descripcion, c.subagentType), { tipos, talla }, umbral, decideReviews)` con `tipos` y `talla` los `Map` de sus corridas (`null` si falta la suite), `decideReviews` true para jev y local. Reglas: `{ tipos: null, talla: null }`, `decideReviews` false. Con tope: una respuesta con error o `ms > tope` se saca del `Map` antes de simular. Acierto contra `etiquetas.json`, todos y seguros.
  - Talla de review (225): `pasosDeReview(...)` y `politicaTallaReview(r, id => …)` con el clasificador = la elección del selector si `confianza >= umbral` (haiku: siempre), si no `review-small`. Con tope, igual que arriba.
- **Advertencias**, siempre al final: 96 etiquetas dudosas (contar `seguro: false` en `etiquetas.json`); 33 de talla de review sin validar (contar en `etiquetas-review.json`); "192 reviews con build aciertan por construcción"; si hay alguna fila `local`, "experimental: medido en <hardware>, umbral sin calibrar"; latencia de Haiku medida dentro de Claude Code.

Forma del script (completar las funciones con las reglas de arriba; nada de lógica nueva fuera de ellas):

```js
// Compara los selectores (reglas, haiku, jev, local) sobre las suites del banco: acierto, latencia,
// calibración, política completa simulada y precio. Lee las corridas -sel- de bench/corridas/.
//   node bench/informe.mjs [--tope 1000] [--umbral-local 0.7] [corridas…]
// Imprime el informe y lo guarda en bench/corridas/<AAAA-MM-DD>-<HHMM>-informe-selectores.md.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clasificarPorReglas } from '../router/src/reglas.ts'
import { preguntaJev } from '../router/src/clasificadores/preguntas.ts'
import { pedidoSystemOne } from '../router/src/clasificadores/protocolos.ts'
import { avisarSiDiverge, pasosDeReview, politicaTallaReview, politicaTipos, respaldoTalla } from './lib/politica.mjs'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(aqui, 'corridas')
const leer = f => JSON.parse(fs.readFileSync(f, 'utf8'))
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const tope = Number(arg('--tope', '1000'))
const umbralLocal = Number(arg('--umbral-local', '0.7'))
const archivos = process.argv.slice(2).filter((a, i, xs) => a.endsWith('.json') && !['--tope', '--umbral-local'].includes(xs[i - 1]))

const { casos } = leer(path.join(aqui, 'casos.json'))
const etiquetas = leer(path.join(aqui, 'etiquetas.json'))
const ref = leer(path.join(aqui, 'etiquetas-review.json'))
const precios = leer(path.join(aqui, 'precios.json'))
avisarSiDiverge()

// 1. corridas(): elegir los archivos y agruparlos por fila (selector + modelo + protocolo).
// 2. referencia(suite, id) → { tipo, seguro } | null; respaldo(suite, caso) → tipo.
// 3. filaSuite(fila, suite) → las columnas de la tabla por suite; filaReglas(suite).
// 4. usdPor1000(fila, suite) → texto.
// 5. calibracion(fila, suite) → filas por tramo.
// 6. politica(fila) → { tipos: { todos, seguros, todosTope, segurosTope }, review: { todos, todosTope } }.
// 7. Armar el Markdown: una tabla por suite, la calibración, la política completa, los precios
//    (con fuente y nota de precios.json) y las advertencias. Imprimir y escribir el .md.
```

- [ ] **Step 3: Probar con corridas falsas**

Con el servidor falso (`--demora 300` para tener latencias distintas de 0) generar corridas con
`--max 40` de `selectores.mjs` para `local` en `systemone`, y correr:

```bash
node bench/informe.mjs
```

Expected: tablas para `tipos`, `talla` y `review` con filas `reglas` y `local · falso (systemone)`;
el local acierta lo que acierte "siempre la primera opción"; `p50` cerca de 300 ms; `> tope` 0%;
la fila de reglas coincide con el respaldo; la política completa de reglas da el mismo número que el
paso 4 de la tarea 6 (sobre 729, porque reglas no depende de corridas). Con `--tope 200`, `con tope`
del local pasa a ser igual al respaldo. **Borrar las corridas y el informe de prueba.**

- [ ] **Step 4: Probar la fila de Jev con la corrida vieja**

No hay corridas `-sel-jev-` todavía. Convertir la corrida vieja de 9 etiquetas para probar el informe:

```bash
node -e "
const fs=require('fs');const v=JSON.parse(fs.readFileSync('bench/corridas/2026-10-09-1339-jev-todos.json','utf8'));
fs.writeFileSync(process.env.TMPDIR+'/x-sel-jev-tipos.json', JSON.stringify({fecha:v.fecha??null,selector:'jev',suite:'tipos',modelo:'jev-1.13.0',protocolo:'systemone',url:null,hardware:null,concurrencia:3,tokens:null,resultados:v.resultados??v}))"
node bench/informe.mjs "$TMPDIR/x-sel-jev-tipos.json"
```

Expected: en `tipos`, Jev acierta lo mismo que la columna "Jev solo" de
`bench/corridas/2026-10-09-1339-jev-todos-analisis.md` (verificar el número); la calibración por tramos
coincide con la de ese análisis. Borrar el archivo temporal y el informe generado.

- [ ] **Step 5: Commit**

```bash
git add bench/informe.mjs bench/precios.json
git commit -m "feat(bench): selector report with accuracy, latency, calibration, full-policy simulation and price"
```

---

### Task 9: Docs

**Files:**
- Modify: `docs/benchmark.md`, `docs/configuration.md`, `bench/README.md`, `CHANGELOG.md`

- [ ] **Step 1: `docs/benchmark.md` (inglés)**
  - En la tabla de archivos: sacar `jev-todos.mjs`; sumar `selectores.mjs`, `informe.mjs`, `precios.json`, `lib/politica.mjs`, `lib/servidor-falso.mjs`.
  - Sección nueva **"Comparing selectors"**: las tres suites, cómo se corre cada selector (Node para Jev y local; `/router bench --suite` para Haiku, con `--tokens`), el formato de corrida, las columnas del informe y cómo se calculan los precios (con las fuentes de `precios.json` y la nota de Claude Max). Sin tabla de resultados: esa se agrega cuando se corra el benchmark real, después del plan.
  - En *Caveats*, reemplazar el de Haiku 4.5 por: los números de Haiku se vuelven a medir con `/router bench --suite todas --solo haiku`.
- [ ] **Step 2: `docs/configuration.md` (inglés)**: el valor `local` de `clasificador` y `sombra`, las cinco opciones `local…` con su default, la marca **experimental**, y un ejemplo para llama.cpp (`llama-server -m <decision-model>.gguf` → `http://127.0.0.1:9931/v1/systemone`) y para Ollama (`http://127.0.0.1:11434/v1/systemone` o `/v1/chat/completions`). Aclarar que `localUmbral` no está calibrado y cómo elegirlo con `bench/informe.mjs`.
- [ ] **Step 3: `bench/README.md` (castellano)**: secciones nuevas para `selectores.mjs`, `/router bench --suite`, `informe.mjs`, el servidor falso y `precios.json`; la sección de `jev-todos.mjs` se reemplaza por una nota de que las corridas viejas siguen en `corridas/` y se analizan con `analizar-jev-todos.mjs`.
- [ ] **Step 4: `CHANGELOG.md`**, en *Unreleased* (debajo de lo que ya está de la fase 7): `Added` el clasificador `local` (experimental), `/router bench --suite`, `bench/selectores.mjs`, `bench/informe.mjs`; `Changed` la concurrencia por defecto de `/router bench` a 1; `Removed` `bench/jev-todos.mjs`.
- [ ] **Step 5: Verificar links y commit**

```bash
grep -rn "jev-todos.mjs" docs bench/README.md CHANGELOG.md router/README.md
```

Expected: solo menciones históricas (corridas viejas), ninguna instrucción de correrlo.

```bash
git add docs/benchmark.md docs/configuration.md bench/README.md CHANGELOG.md
git commit -m "docs: local classifier, selector benchmark and report"
```

---

### Task 10: README

**Files:**
- Modify: `router/README.md`

- [ ] **Step 1:** En la sección de clasificadores, sumar `local` (experimental) con dos líneas de qué es, que habla System One u OpenAI, y un link a `docs/configuration.md`. Sumar `/router bench --suite …` a la lista de comandos. En castellano si la sección está en castellano; en inglés si está en inglés (seguir el idioma de cada parte del README). Líneas de hasta ~100 caracteres en el fuente.
- [ ] **Step 2: Verificar y commit**

```bash
claude plugin validate --strict router
git add router/README.md
git commit -m "docs(readme): experimental local classifier and bench suites"
```

---

## Después del plan (no son tareas de implementación)

1. Review final de rama con el agente `revisor-final-opus-xhigh`.
2. Verificación en vivo: cargar el mod del worktree (`claude --plugin-dir <worktree>/router`) con el
   servidor falso andando y `clasificador: local`, y confirmar que `$.http.fetch` llega a
   `http://127.0.0.1:9931` (riesgo del spec).
3. Paso 3 de la sesión: correr el benchmark real (reglas, Haiku 5.5, Jev) y el informe.
