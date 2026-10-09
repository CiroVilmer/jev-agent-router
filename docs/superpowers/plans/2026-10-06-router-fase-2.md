# Router de subagentes · fase 2 · plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sumar los clasificadores Haiku y Jev al router, intercambiables, con tope de 1 segundo
y modo sombra, y un banco de prueba con tus ~700 subagentes reales para compararlos en
accuracy, latencia y calibración. De paso, saldar las deudas menores que dejó la fase 1.

**Architecture:**
- Los clasificadores son funciones puras que reciben sus dependencias inyectadas. Haiku recibe
  una función `clasificar`, Jev una función `post`, y el tope una función `dormir`. Ninguno toca
  `$`: así se testean sin red.
- `hooks/register.tsx` arma los clasificadores reales con `$.model.classify`, `$.http.fetch` y
  `$.clock`, y los entrega a `decidir` como un `Clasificador` más.
- El banco tiene tres partes:
  - un script de Node que extrae los casos de los transcripts;
  - un etiquetado hecho por un subagente;
  - un comando `/router banco` que corre ambos clasificadores **dentro de Claude Code**, con el
    mismo camino que en producción.

  Al final, un script de Node compara los resultados.

**Tech Stack:** API de mods de Claude Code 2.1.288 o posterior, en TypeScript y TSX. Tests con
`claude-code/testing` corridos por `claude plugin test router`. Node 24 para los scripts del
banco: importa los `.ts` del router con type stripping, sin build. La API de Jev
(TypeSafe System One) es `POST https://api.typesafe.ai/v1/systemone`.

**Spec:** `docs/superpowers/specs/2026-10-06-router-de-subagentes-design.md` (secciones
Clasificadores y Banco offline).

## Global Constraints

- Todo lo de la fase 1 sigue valiendo:
  - la política solo sube;
  - nunca bloquea;
  - los `fork` no se tocan;
  - `[pin]` manda;
  - el modelo se reescribe con alias (`opus`, `sonnet`, `haiku`).
- **Reglas del cargador de mods** (descubiertas en la fase 1; romperlas hace que el módulo no
  cargue):
  1. `read`/`update` de `$.state` solo con atoms declarados en un `const` de
     `hooks/register.tsx`.
  2. `$` solo se pasa a funciones declaradas en el nivel superior de `hooks/register.tsx`.
     Pasar closures que capturan `$` a módulos de `src/` está permitido; el panel ya lo hace.
  3. Los hooks que gatean (`agent.spawn`) llevan `.catch`.
- Jev:
  - modelo fijo **`jev-1.13.0`**, nunca `jev-latest`;
  - header `Authorization: Bearer <key>`;
  - a Jev solo le llega el **título de la tarea más el resumen estructural**, nunca el prompt
    (el usuario lo aprobó).
- La key de Jev sale de `userConfig.jevApiKey` (sensible, en secure storage) o de la variable
  de entorno `JEV_API_KEY`. Nunca se escribe en archivos ni se imprime. Si falta, el
  clasificador `jev` cae en Haiku y se avisa una sola vez con un toast.
- Tope por clasificación: `topeMs`, por defecto **1000**. Si se pasa, falla, o Jev tiene
  confianza menor a `jevUmbral` (por defecto **0.5**), se usa el respaldo de la fase 1, con un
  motivo que dice por qué.
- Por defecto: `clasificador = "reglas"` y `sombra = "off"`, hasta que el usuario elija mirando
  el banco. El plan **no** cambia esos defaults.
- Sin dependencias npm. Textos en castellano rioplatense; identificadores en castellano.
- Ejecutar desde la raíz del repo, en el worktree que arme la ejecución.

**Desvíos del spec, decididos al planificar:**
- **El modo sombra guarda en `$.store`, no en `sombra.jsonl`.** `$.fs.write` reemplaza el
  archivo entero (no hay append) y no es atómico entre sesiones; `$.store` es compartido entre
  sesiones. Se guardan las últimas 500 muestras.
- **El pre-etiquetado lo hace un subagente (Opus) y no un script con Opus.** La cuenta es una
  suscripción Max, sin API key para un script.
- **Haiku se corre en el banco con `/router banco` dentro de Claude Code**, por la misma
  razón. Además así se mide el camino real de producción.
- **Haiku se llama con el alias `haiku` y no con el id completo** (`claude-haiku-4-5-20251001`,
  como dice el spec): `$.model.classify(..., { model: 'haiku' })`. El alias resuelve al Haiku
  vigente, igual que en la reescritura del modelo de la fase 1.

---

## Mapa de archivos

```
claude-mods/
├── .gitattributes                         (Task 1) eol=lf
├── router/
│   ├── .claude-plugin/plugin.json         (Task 5) userConfig: clasificador, sombra, jevApiKey, jevUmbral, topeMs
│   ├── hooks/register.tsx                 (Task 1, 5, 8) arma clasificadores reales, store de sombra, /router banco
│   ├── src/reglas.ts                      (Task 1) fix con \b; build antes que write
│   ├── src/politica.ts                    (Task 1) resetsAt inválido → sin lectura
│   ├── src/overrides.ts                   (Task 1) MODELOS importado; fijar sin mayúsculas; permitir vacío
│   ├── src/taxonomia.ts                   (Task 1) exporta MODELOS
│   ├── src/decidir.ts                     (Task 1, 4) motivo +N exacto; detalle del clasificador
│   ├── src/clasificadores/index.ts        (Task 4) Clasificacion.detalle
│   ├── src/clasificadores/preguntas.ts    (Task 2) descripciones de tipos y textos para Haiku y Jev
│   ├── src/clasificadores/haiku.ts        (Task 2)
│   ├── src/clasificadores/jev.ts          (Task 3)
│   ├── src/clasificadores/tope.ts         (Task 4)
│   ├── src/clasificadores/sombra.ts       (Task 4) conSombra, muestras y estadísticas
│   ├── src/banco.ts                       (Task 8) lógica pura del banco
│   ├── src/ui/panel.tsx                   (Task 1, 5) tests faltantes; sección de clasificadores
│   └── tests/*.test.ts(x)
└── bench/
    ├── extraer.mjs                        (Task 6) transcripts → casos.json
    ├── casos.json                         (Task 6, generado)
    ├── etiquetas.json, para-revisar.md    (Task 7)
    ├── comparar.mjs                       (Task 8)
    ├── README.md                          (Task 8)
    └── corridas/                          (Task 9)
```

---

### Task 1: Deudas de la fase 1

Son cambios chicos, cada uno con su test. Salen de la triage de la review final de la fase 1.

**Files:** `.gitattributes`, `router/src/{taxonomia,reglas,politica,overrides,decidir}.ts`,
`router/src/ui/panel.tsx` (solo si un test lo pide), `router/hooks/register.tsx` (un
comentario), `docs/verificaciones/2026-10-06-router-fase-1.md`, y los tests de cada módulo.

**Interfaces:**
- Produces: `MODELOS: readonly Modelo[]` exportado desde `src/taxonomia.ts`.
  `src/overrides.ts` lo importa en lugar de su copia local.

- [ ] **Step 1: Tests que fallan.** Agregar exactamente esto:
  - `tests/reglas.test.ts`, en `CASOS`:
    - `['Fixture loader for tests', 'general-purpose', null]`
    - `['Fixtures de e2e', 'general-purpose', null]`
    - `['Implement vault sync', 'general-purpose', 'build']`
    - `['Task 3: vault export', 'general-purpose', 'build']`

    Los 60 casos existentes tienen que seguir pasando.
  - `tests/politica.test.ts`:
    ```ts
    test('resetsAt que no se puede leer: sin lectura', () => {
      expect(lecturaDe([{ kind: 'five_hour', percentUsed: 30, resetsAt: 'mañana' }])).toBe(null)
    })
    test('reset ya pasado cuenta como 0 minutos', () => {
      expect(pol(40, -5)).toMatchObject({ modo: 'fuego', minutosAlReset: 0 })
    })
    test('motivos de sobra y normal', () => {
      expect(pol(75, 100).motivo).toBe('queda 25% de 5h y el reset es en 100m')
      expect(pol(90, 200).motivo).toBe('usaste 90% de 5h, reset en 200m')
    })
    ```
  - `tests/overrides.test.ts`:
    ```ts
    test('fijar acepta el tipo en mayúsculas', () => {
      expect(parsearComando('fijar Review opus·high')).toEqual({
        accion: 'fijar', tipo: 'review', escalon: { modelo: 'opus', esfuerzo: 'high' },
      })
    })
    test('permitir sin modelos pide cuáles', () => {
      const c = parsearComando('permitir')
      expect(c.accion === 'error' && c.mensaje.startsWith('Decime qué modelos')).toBe(true)
    })
    test('describirComando para on, off, reset, panel y error', () => {
      expect(describirComando({ accion: 'on' })).toBe('Router: prendido.')
      expect(describirComando({ accion: 'off' })).toBe('Router: apagado. Los subagentes salen con lo que pide Claude.')
      expect(describirComando({ accion: 'reset' })).toBe('Router: sin overrides en esta sesión.')
      expect(describirComando({ accion: 'panel' })).toBe('Panel del router abierto.')
      expect(describirComando({ accion: 'error', mensaje: 'x' })).toBe('x')
    })
    ```
  - `tests/decidir.test.ts`: el motivo de la política dice cuánto subió de verdad. Agregar:
    ```ts
    test('el motivo de la política dice cuánto subió de verdad', async () => {
      const d = await decidir(entrada({ descripcion: 'Re-review Task 2 fix round 1' }), ctx({ politica: FUEGO }))
      expect(d.motivos).toEqual(['regla re-review', 'política +2'])
      const f = await decidir(entrada({ descripcion: 'Fix wave: hallazgos' }), ctx({ politica: FUEGO }))
      expect(f.motivos).toEqual(['regla fix', 'política +2'])
    })
    ```
    re-review: 4 + 2 = 6. fix: 3 + 2 = 5. En los dos casos sube +2 completo. El recorte
    (`+1` cuando la base es 5) no tiene tipo que lo dispare hoy: cubrirlo con un test de
    `motivoPolitica(base, i)` (ver Step 3).
  - `tests/register.test.ts`: `turn.complete` marca el fin. Después de un spawn y un
    `$.turn.complete({ ... agentId: 'ag-1' ... })`, la pestaña "En curso" del panel montado ya no
    muestra el subagente en EN CURSO. Copiar los campos de `TurnCompleteInput` de los tipos.
  - `tests/panel.test.tsx`:
    - después de `press tab-curso`, `find({ text: /VENTANA/ })` está definido;
    - sin subagentes, aparece `Sin subagentes corriendo.`;
    - con `/router permitir sonnet,opus`, aparece `permitir: sonnet,opus`;
    - con `/router off`, aparece `Router apagado`.

- [ ] **Step 2: Correr y ver que fallan los nuevos.**
  Run: `claude plugin test router`. Expected: fallan los tests nuevos y los anteriores pasan.

- [ ] **Step 3: Implementar.**
  - `src/taxonomia.ts`: `export const MODELOS: readonly Modelo[] = ['haiku', 'sonnet', 'opus']`.
    Reemplazar la const local por esta.
  - `src/overrides.ts`:
    - importar `MODELOS`;
    - en `fijar`, comparar `tipo.toLowerCase()`;
    - si `permitir` viene sin modelos, devolver
      `{ accion: 'error', mensaje: 'Decime qué modelos: /router permitir sonnet,opus' }`;
    - si hay modelos inválidos, mantener el mensaje actual.
  - `src/reglas.ts`:
    - el patrón de fix pasa a ser `/^(fix(e[sd]|ing)?\b|arregl|correg|ola de arreglos)/i`;
    - mover la regla `build` **antes** de `write`;
    - el orden final queda: re-review, fix, review-final, review, research, explore, build,
      write.
  - `src/politica.ts`: en `lecturaDe`, devolver `null` si `Number.isNaN(Date.parse(resetsAt))`.
  - `src/decidir.ts`:
    - exportar `motivoPolitica(base: number, i: number): string | null`, que devuelve
      `política +${i - base}` cuando `i > base` y `null` si no;
    - usarlo en lugar de la condición actual;
    - test: `motivoPolitica(5, 6)` da `'política +1'` y `motivoPolitica(6, 6)` da `null`.
  - `hooks/register.tsx`: el comentario que dice "agent.spawn solo acepta alias" pasa a decir
    "un consumidor interno de Claude Code valida `model` contra los alias; con un id completo
    logueaba un ZodError".
  - `docs/verificaciones/2026-10-06-router-fase-1.md`: tachar con `~~…~~` el ítem pendiente del
    ZodError y agregar "resuelto en 97c46ce (alias)".
  - `.gitattributes`: `* text=auto eol=lf`. Después: `git add --renormalize .` en un commit
    propio.

- [ ] **Step 4: Correr y ver que pasa.**
  Run: `claude plugin test router` y `claude plugin validate router`. Expected: todo pasa y
  `validate` no da warnings.

- [ ] **Step 5: Commits.**
  - `chore: normalizar fin de línea a LF` (solo `.gitattributes` y el renormalize).
  - `fix(router): deudas menores de la fase 1` (el resto).

---

### Task 2: Descripciones de tipos y clasificador Haiku

**Files:**
- Create: `router/src/clasificadores/preguntas.ts`
- Create: `router/src/clasificadores/haiku.ts`
- Test: `router/tests/haiku.test.ts`

**Interfaces:**
- Consumes: `Tipo`; `textoResumen` (de `src/resumen.ts`); `Clasificador`, `Clasificacion`,
  `PedidoClasificacion` (de `src/clasificadores/index.ts`).
- Produces:
  - `DESCRIPCION: Record<Tipo, string>`
  - `PREGUNTA: string`
  - `textoParaHaiku(tarea: string, etiquetas: readonly Tipo[]): string`
  - `preguntaJev(etiquetas: readonly Tipo[]): { type: 'choice'; instructions: { pregunta: string; como_decidir: string[] }; criteria: Record<string, string> }`
  - `type Reloj = () => Promise<number>`
  - `type FuncionClasificar = (texto: string, etiquetas: readonly string[]) => Promise<string | undefined>`
  - `crearHaiku(clasificar: FuncionClasificar, ahora: Reloj): Clasificador`

Las descripciones y las preguntas viven en un solo archivo, como recomienda la documentación de
Jev, para que el usuario las revise y edite en un solo lugar. Haiku y Jev usan las mismas
descripciones, así la comparación es justa.

- [ ] **Step 1: Test (falla).** `router/tests/haiku.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import { TALLAS } from '../src/clasificadores'
import { crearHaiku } from '../src/clasificadores/haiku'
import { DESCRIPCION, preguntaJev, textoParaHaiku } from '../src/clasificadores/preguntas'
import { TIPOS } from '../src/taxonomia'

const RESUMEN = { chars: 6800, archivos: 9, pasos: 14, mencionaSpec: true }
const PEDIDO = { descripcion: 'Implement Task 11: el compilador', resumen: RESUMEN, etiquetas: TALLAS }
let t = 1000
const reloj = async () => (t += 120)

describe('preguntas', () => {
  test('hay una descripción por tipo', () => {
    expect(Object.keys(DESCRIPCION).sort()).toEqual([...TIPOS].sort())
  })

  test('el texto para Haiku lista solo las etiquetas pedidas y lleva la tarea', () => {
    const texto = textoParaHaiku('Implement Task 11 · prompt 6.8k chars', TALLAS)
    expect(texto.includes('- build-large: ')).toBe(true)
    expect(texto.includes('- build-small: ')).toBe(true)
    expect(texto.includes('- review: ')).toBe(false)
    expect(texto.endsWith('Tarea: Implement Task 11 · prompt 6.8k chars')).toBe(true)
  })

  test('la pregunta de Jev es choice, con un criterio por etiqueta y referencia a `tarea`', () => {
    const q = preguntaJev(TALLAS)
    expect(q.type).toBe('choice')
    expect(Object.keys(q.criteria)).toEqual(['build-large', 'build-small'])
    expect(q.instructions.pregunta.includes('`tarea`')).toBe(true)
  })
})

describe('crearHaiku', () => {
  test('manda el texto con el resumen y devuelve la etiqueta con su latencia', async () => {
    let recibido = ''
    const haiku = crearHaiku(async (texto, etiquetas) => { recibido = texto; return etiquetas[0] }, reloj)
    const r = await haiku(PEDIDO)
    expect(r).toEqual({ tipo: 'build-large', ms: 120, fuente: 'haiku' })
    expect(recibido.includes('Implement Task 11: el compilador · prompt 6.8k chars · 9 archivos · 14 pasos · menciona spec')).toBe(true)
  })

  test('sin respuesta o con una etiqueta que no se pidió, falla (el tope pasa al respaldo)', async () => {
    const vacio = crearHaiku(async () => undefined, reloj)
    let error = ''
    try { await vacio(PEDIDO) } catch (e) { error = String(e) }
    expect(error.includes('haiku no eligió')).toBe(true)
    const otra = crearHaiku(async () => 'review', reloj)
    let error2 = ''
    try { await otra(PEDIDO) } catch (e) { error2 = String(e) }
    expect(error2.includes('haiku no eligió')).toBe(true)
  })
})
```

- [ ] **Step 2:** Run `claude plugin test router`. Expected: FAIL, porque no existen
  `preguntas.ts` ni `haiku.ts`.

- [ ] **Step 3: Implementar.** `router/src/clasificadores/preguntas.ts`:
```ts
import type { Tipo } from '../../types'

/** Un lugar para revisar y editar cómo se describe cada tipo. Lo usan Haiku y Jev por igual. */
export const DESCRIPCION: Record<Tipo, string> = {
  'review-final': 'Revisión final de toda una rama o de todo el trabajo, antes de mergear.',
  review: 'Revisar el trabajo de una tarea: que cumpla el spec y tenga buena calidad.',
  're-review': 'Volver a revisar solo los arreglos de una revisión anterior.',
  'build-large': 'Implementar algo grande: varios archivos, integración, diseño o mucha lógica nueva.',
  'build-small': 'Implementar algo chico o mediano y acotado: uno o dos archivos, un cambio mecánico.',
  fix: 'Arreglar hallazgos de una revisión o un bug puntual.',
  explore: 'Explorar o mapear código existente sin cambiarlo.',
  research: 'Investigar en la web o en documentación y resumir lo encontrado.',
  write: 'Redactar documentación, notas, bitácoras o resúmenes.',
}

export const PREGUNTA = 'Un orquestador va a lanzar un subagente con esta tarea. ¿Qué tipo de tarea es?'

export function textoParaHaiku(tarea: string, etiquetas: readonly Tipo[]): string {
  const tipos = etiquetas.map(t => `- ${t}: ${DESCRIPCION[t]}`).join('\n')
  return `${PREGUNTA}\n\nTipos:\n${tipos}\n\nTarea: ${tarea}`
}

export function preguntaJev(etiquetas: readonly Tipo[]) {
  return {
    type: 'choice' as const,
    instructions: {
      pregunta: `${PREGUNTA} La tarea está en \`tarea\`: su título y un resumen del prompt (largo, archivos que nombra, pasos y si menciona un spec o plan).`,
      como_decidir: [
        'Elegí por lo que el subagente tiene que hacer, no por palabras sueltas.',
        'Para separar un build grande de uno chico, mirá el largo del prompt, cuántos archivos nombra y cuántos pasos tiene.',
      ],
    },
    criteria: Object.fromEntries(etiquetas.map(t => [t, DESCRIPCION[t]])),
  }
}
```

`router/src/clasificadores/haiku.ts`:
```ts
import type { Tipo } from '../../types'
import { textoResumen } from '../resumen'
import type { Clasificador } from './index'
import { textoParaHaiku } from './preguntas'

export type Reloj = () => Promise<number>
export type FuncionClasificar = (texto: string, etiquetas: readonly string[]) => Promise<string | undefined>

export function crearHaiku(clasificar: FuncionClasificar, ahora: Reloj): Clasificador {
  return async ({ descripcion, resumen, etiquetas }) => {
    const inicio = await ahora()
    const r = await clasificar(textoParaHaiku(textoResumen(descripcion, resumen), etiquetas), etiquetas)
    const ms = (await ahora()) - inicio
    if (r === undefined || !(etiquetas as readonly string[]).includes(r)) {
      throw new Error(`haiku no eligió una etiqueta válida: ${String(r)}`)
    }
    return { tipo: r as Tipo, ms, fuente: 'haiku' }
  }
}
```

- [ ] **Step 4:** Run `claude plugin test router`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(router): descripciones de tipos y clasificador Haiku`

---

### Task 3: Clasificador Jev

**Files:**
- Create: `router/src/clasificadores/jev.ts`
- Test: `router/tests/jev.test.ts`

**Interfaces:**
- Consumes: `preguntaJev` y `Reloj` (Task 2); `textoResumen`; `Clasificador`.
- Produces:
  - `JEV_URL`, `JEV_MODELO`
  - `type Post = (cuerpo: string) => Promise<{ ok: boolean; status: number; text: string }>`
  - `pedidoJev(tarea: string, etiquetas: readonly Tipo[]): object`
  - `leerJev(texto: string, etiquetas: readonly Tipo[]): { tipo: Tipo; confianza: number }`
  - `crearJev(post: Post, ahora: Reloj, umbral: number): Clasificador`

La respuesta de Jev viene en `answers.tipo`, con forma `{ type: 'choice', choice, probabilities, confidence }`.
Fuente: la documentación de TypeSafe, guardada en
`proyecto-b/docs/info/jev/2026-09-29-docs-typesafe-llms-full.txt`.

- [ ] **Step 1: Test (falla).** `router/tests/jev.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import { TALLAS } from '../src/clasificadores'
import { crearJev, JEV_MODELO, JEV_URL, leerJev, pedidoJev } from '../src/clasificadores/jev'

const RESUMEN = { chars: 6800, archivos: 9, pasos: 14, mencionaSpec: true }
const PEDIDO = { descripcion: 'Implement Task 11: el compilador', resumen: RESUMEN, etiquetas: TALLAS }
const respuesta = (choice: string, confidence: number) =>
  JSON.stringify({ model: 'jev-1.13.0', answers: { tipo: { type: 'choice', choice, probabilities: { [choice]: confidence }, confidence } }, usage: { input_tokens: 300, output_tokens: 20 } })
let t = 0
const reloj = async () => (t += 250)

describe('jev', () => {
  test('endpoint y modelo fijos', () => {
    expect(JEV_URL).toBe('https://api.typesafe.ai/v1/systemone')
    expect(JEV_MODELO).toBe('jev-1.13.0')
  })

  test('el pedido lleva modelo fijo, la tarea como estado y una pregunta tipo', () => {
    const p = pedidoJev('Implement Task 11 · prompt 6.8k chars', TALLAS) as { model: string; state: unknown; questions: Record<string, { type: string }> }
    expect(p.model).toBe('jev-1.13.0')
    expect(p.state).toEqual({ tarea: 'Implement Task 11 · prompt 6.8k chars' })
    expect(Object.keys(p.questions)).toEqual(['tipo'])
    expect(p.questions.tipo!.type).toBe('choice')
  })

  test('leerJev toma choice y confidence', () => {
    expect(leerJev(respuesta('build-large', 0.83), TALLAS)).toEqual({ tipo: 'build-large', confianza: 0.83 })
  })

  test('leerJev rechaza respuestas rotas u opciones que no se pidieron', () => {
    for (const mala of ['{}', 'no es json', respuesta('review', 0.9)]) {
      let error = ''
      try { leerJev(mala, TALLAS) } catch (e) { error = String(e) }
      expect(error.startsWith('Error: jev')).toBe(true)
    }
  })

  test('crearJev devuelve tipo, confianza y latencia', async () => {
    let cuerpo = ''
    const jev = crearJev(async c => { cuerpo = c; return { ok: true, status: 200, text: respuesta('build-large', 0.83) } }, reloj, 0.5)
    expect(await jev(PEDIDO)).toEqual({ tipo: 'build-large', confianza: 0.83, ms: 250, fuente: 'jev' })
    expect(JSON.parse(cuerpo).state.tarea.includes('9 archivos')).toBe(true)
  })

  test('HTTP con error o confianza bajo el umbral: falla con el motivo', async () => {
    const http = crearJev(async () => ({ ok: false, status: 429, text: '' }), reloj, 0.5)
    let e1 = ''
    try { await http(PEDIDO) } catch (e) { e1 = String(e) }
    expect(e1).toBe('Error: jev: HTTP 429')
    const duda = crearJev(async () => ({ ok: true, status: 200, text: respuesta('build-small', 0.42) }), reloj, 0.5)
    let e2 = ''
    try { await duda(PEDIDO) } catch (e) { e2 = String(e) }
    expect(e2).toBe('Error: jev dudó (0.42)')
  })
})
```

- [ ] **Step 2:** Run `claude plugin test router`. Expected: FAIL.

- [ ] **Step 3: Implementar.** `router/src/clasificadores/jev.ts`:
```ts
import type { Tipo } from '../../types'
import { textoResumen } from '../resumen'
import type { Reloj } from './haiku'
import type { Clasificador } from './index'
import { preguntaJev } from './preguntas'

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
/** Fijo: jev-latest cambia de modelo sin aviso y los umbrales se calibran contra una versión. */
export const JEV_MODELO = 'jev-1.13.0'

export type Post = (cuerpo: string) => Promise<{ ok: boolean; status: number; text: string }>

export function pedidoJev(tarea: string, etiquetas: readonly Tipo[]) {
  return { model: JEV_MODELO, state: { tarea }, questions: { tipo: preguntaJev(etiquetas) } }
}

export function leerJev(texto: string, etiquetas: readonly Tipo[]): { tipo: Tipo; confianza: number } {
  let json: { answers?: { tipo?: { type?: string; choice?: unknown; confidence?: unknown; probabilities?: Record<string, number> } } }
  try {
    json = JSON.parse(texto)
  } catch {
    throw new Error('jev: la respuesta no es JSON')
  }
  const a = json.answers?.tipo
  if (!a || a.type !== 'choice' || typeof a.choice !== 'string') throw new Error('jev: la respuesta no trae answers.tipo')
  if (!(etiquetas as readonly string[]).includes(a.choice)) throw new Error(`jev eligió una opción que no se pidió: ${a.choice}`)
  const confianza = typeof a.confidence === 'number' ? a.confidence : (a.probabilities?.[a.choice] ?? 0)
  return { tipo: a.choice as Tipo, confianza }
}

export function crearJev(post: Post, ahora: Reloj, umbral: number): Clasificador {
  return async ({ descripcion, resumen, etiquetas }) => {
    const inicio = await ahora()
    const r = await post(JSON.stringify(pedidoJev(textoResumen(descripcion, resumen), etiquetas)))
    const ms = (await ahora()) - inicio
    if (!r.ok) throw new Error(`jev: HTTP ${r.status}`)
    const { tipo, confianza } = leerJev(r.text, etiquetas)
    if (confianza < umbral) throw new Error(`jev dudó (${confianza.toFixed(2)})`)
    return { tipo, confianza, ms, fuente: 'jev' }
  }
}
```

- [ ] **Step 4:** Run `claude plugin test router`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(router): clasificador Jev`

---

### Task 4: Tope, sombra y detalle del respaldo

**Files:**
- Modify: `router/src/clasificadores/index.ts` (agrega `detalle?: string` a `Clasificacion`)
- Modify: `router/src/decidir.ts` (el motivo incluye el detalle)
- Create: `router/src/clasificadores/tope.ts`
- Create: `router/src/clasificadores/sombra.ts`
- Test: `router/tests/tope-sombra.test.ts`
- Test: en `router/tests/decidir.test.ts`, un caso con detalle

**Interfaces:**
- Produces:
  - `type Clasificacion = { tipo; confianza?; ms; fuente; detalle?: string }`
  - `type Dormir = (ms: number) => Promise<void>`
  - `conTope(c: Clasificador, ms: number, dormir: Dormir): Clasificador`
  - `type Muestra = { fecha: number; tarea: string; etiquetas: Tipo[]; principal: Clasificacion; sombra: Clasificacion }`
  - `conSombra(principal: Clasificador, sombra: Clasificador, registrar: (m: Muestra) => Promise<void>, ahora: Reloj): Clasificador`
  - `agregarMuestra(lista: readonly Muestra[], m: Muestra, max?: number): Muestra[]` (500 por defecto)
  - `type Estadisticas = { n: number; coinciden: number; porFuente: Record<string, { n: number; p50: number; p95: number; respaldos: number }> }`
  - `estadisticasSombra(lista: readonly Muestra[]): Estadisticas | null`
- Motivo en `decidir`: `${fuente}${detalle ? ` (${detalle})` : ''} → ${tipo}`, más
  ` (${confianza.toFixed(2)})` si hay confianza. Sin detalle, el texto queda igual que antes, así
  que los tests de la fase 1 no cambian.

- [ ] **Step 1: Test (falla).** `router/tests/tope-sombra.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'
import type { Clasificador } from '../src/clasificadores'
import { TALLAS } from '../src/clasificadores'
import type { Muestra } from '../src/clasificadores/sombra'
import { agregarMuestra, conSombra, estadisticasSombra } from '../src/clasificadores/sombra'
import { conTope } from '../src/clasificadores/tope'

const GRANDE = { chars: 9000, archivos: 2, pasos: 0, mencionaSpec: false }
const PEDIDO = { descripcion: 'Implement Task 11', resumen: GRANDE, etiquetas: TALLAS }
const nunca: Promise<void> = new Promise(() => {})
const yaVencio = async () => {}

describe('conTope', () => {
  test('si el clasificador responde, pasa tal cual', async () => {
    const rapido: Clasificador = async () => ({ tipo: 'build-small', ms: 80, fuente: 'haiku' })
    expect(await conTope(rapido, 1000, () => nunca)(PEDIDO)).toEqual({ tipo: 'build-small', ms: 80, fuente: 'haiku' })
  })

  test('si se pasa del tope, respaldo con detalle', async () => {
    const lento: Clasificador = () => new Promise(() => {})
    expect(await conTope(lento, 1000, yaVencio)(PEDIDO)).toEqual({
      tipo: 'build-large', ms: 0, fuente: 'respaldo', detalle: 'tardó más de 1000 ms',
    })
  })

  test('si falla, respaldo con el mensaje del error', async () => {
    const roto: Clasificador = async () => { throw new Error('jev dudó (0.42)') }
    expect(await conTope(roto, 1000, () => nunca)(PEDIDO)).toEqual({
      tipo: 'build-large', ms: 0, fuente: 'respaldo', detalle: 'jev dudó (0.42)',
    })
  })
})

describe('conSombra', () => {
  test('decide el principal, registra los dos', async () => {
    const haiku: Clasificador = async () => ({ tipo: 'build-small', ms: 300, fuente: 'haiku' })
    const jev: Clasificador = async () => ({ tipo: 'build-large', ms: 200, fuente: 'jev', confianza: 0.8 })
    const muestras: Muestra[] = []
    const c = conSombra(haiku, jev, async m => { muestras.push(m) }, async () => 42)
    expect((await c(PEDIDO)).tipo).toBe('build-small')
    expect(muestras).toEqual([{
      fecha: 42,
      tarea: 'Implement Task 11 · prompt 9.0k chars · 2 archivos · 0 pasos',
      etiquetas: ['build-large', 'build-small'],
      principal: { tipo: 'build-small', ms: 300, fuente: 'haiku' },
      sombra: { tipo: 'build-large', ms: 200, fuente: 'jev', confianza: 0.8 },
    }])
  })

  test('si registrar falla, la decisión sale igual', async () => {
    const haiku: Clasificador = async () => ({ tipo: 'build-small', ms: 1, fuente: 'haiku' })
    const c = conSombra(haiku, haiku, async () => { throw new Error('store lleno') }, async () => 0)
    expect((await c(PEDIDO)).tipo).toBe('build-small')
  })
})

describe('estadísticas', () => {
  const m = (p: string, s: string, msP: number, msS: number, fuenteS = 'jev'): Muestra => ({
    fecha: 0, tarea: '', etiquetas: [],
    principal: { tipo: p as 'build-small', ms: msP, fuente: 'haiku' },
    sombra: { tipo: s as 'build-small', ms: msS, fuente: fuenteS as 'jev' },
  })

  test('agregarMuestra guarda las últimas N', () => {
    const lista = Array.from({ length: 3 }, (_, i) => m('build-small', 'build-small', i, i))
    expect(agregarMuestra(lista, m('fix', 'fix', 9, 9), 3).map(x => x.principal.ms)).toEqual([1, 2, 9])
  })

  test('coincidencia, p50/p95 y respaldos por fuente', () => {
    const lista = [
      m('build-small', 'build-small', 100, 200),
      m('build-large', 'build-small', 300, 400),
      m('build-small', 'build-small', 500, 0, 'respaldo'),
    ]
    expect(estadisticasSombra(lista)).toEqual({
      n: 3,
      coinciden: 2,
      porFuente: {
        haiku: { n: 3, p50: 300, p95: 500, respaldos: 0 },
        jev: { n: 2, p50: 400, p95: 400, respaldos: 0 },
        respaldo: { n: 1, p50: 0, p95: 0, respaldos: 1 },
      },
    })
    expect(estadisticasSombra([])).toBe(null)
  })
})
```

Y en `router/tests/decidir.test.ts`:
```ts
test('el motivo explica por qué se usó el respaldo', async () => {
  const lento: Clasificador = async () => ({ tipo: 'build-large', ms: 0, fuente: 'respaldo', detalle: 'tardó más de 1000 ms' })
  const d = await decidir(entrada({ descripcion: 'Implement Task 11: el compilador' }), ctx({ clasificar: lento }))
  expect(d.motivos).toContain('respaldo (tardó más de 1000 ms) → build-large')
})
```

- [ ] **Step 2:** Run `claude plugin test router`. Expected: FAIL.

- [ ] **Step 3: Implementar.**
  - En `src/clasificadores/index.ts`, agregar `detalle?: string` a `Clasificacion`.
  - En `src/decidir.ts`, cambiar el `motivos.push` del clasificador por:
    ```ts
    const detalle = cl.detalle ? ` (${cl.detalle})` : ''
    const confianza = cl.confianza === undefined ? '' : ` (${cl.confianza.toFixed(2)})`
    motivos.push(`${cl.fuente}${detalle} → ${cl.tipo}${confianza}`)
    ```

`router/src/clasificadores/tope.ts`:
```ts
import type { Clasificador } from './index'
import { respaldo } from './index'

export type Dormir = (ms: number) => Promise<void>

/** Nunca tarda más que `ms` ni falla: si el clasificador se pasa o falla, decide el respaldo. */
export function conTope(c: Clasificador, ms: number, dormir: Dormir): Clasificador {
  return async p => {
    const tarde = dormir(ms).then(() => 'tarde' as const)
    try {
      const r = await Promise.race([c(p), tarde])
      if (r !== 'tarde') return r
      return { ...(await respaldo(p)), detalle: `tardó más de ${ms} ms` }
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error)
      return { ...(await respaldo(p)), detalle: mensaje.slice(0, 80) }
    }
  }
}
```

`router/src/clasificadores/sombra.ts`:
```ts
import type { Tipo } from '../../types'
import { textoResumen } from '../resumen'
import type { Reloj } from './haiku'
import type { Clasificacion, Clasificador } from './index'

export type Muestra = { fecha: number; tarea: string; etiquetas: Tipo[]; principal: Clasificacion; sombra: Clasificacion }

/** Corre los dos en paralelo (cada uno ya con su tope), decide el principal y registra ambos. */
export function conSombra(
  principal: Clasificador,
  sombra: Clasificador,
  registrar: (m: Muestra) => Promise<void>,
  ahora: Reloj,
): Clasificador {
  return async p => {
    const [a, b] = await Promise.all([principal(p), sombra(p)])
    const muestra: Muestra = {
      fecha: await ahora(),
      tarea: textoResumen(p.descripcion, p.resumen),
      etiquetas: [...p.etiquetas],
      principal: a,
      sombra: b,
    }
    await registrar(muestra).catch(() => {})
    return a
  }
}

export function agregarMuestra(lista: readonly Muestra[], m: Muestra, max = 500): Muestra[] {
  return [...lista, m].slice(-max)
}

export type Estadisticas = {
  n: number
  coinciden: number
  porFuente: Record<string, { n: number; p50: number; p95: number; respaldos: number }>
}

const percentil = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0
}

export function estadisticasSombra(lista: readonly Muestra[]): Estadisticas | null {
  if (lista.length === 0) return null
  const porFuente: Estadisticas['porFuente'] = {}
  const latencias: Record<string, number[]> = {}
  for (const r of lista.flatMap(m => [m.principal, m.sombra])) {
    ;(latencias[r.fuente] ??= []).push(r.ms)
  }
  for (const [fuente, ms] of Object.entries(latencias)) {
    porFuente[fuente] = {
      n: ms.length,
      p50: percentil(ms, 0.5),
      p95: percentil(ms, 0.95),
      respaldos: fuente === 'respaldo' ? ms.length : 0,
    }
  }
  return { n: lista.length, coinciden: lista.filter(m => m.principal.tipo === m.sombra.tipo).length, porFuente }
}
```

Verificación a mano del test de estadísticas:
- **haiku:** las latencias son [100, 300, 500]. p50 = s[floor(1.5) = 1] = 300 y p95 =
  s[floor(2.85) = 2] = 500.
- **jev:** las latencias son [200, 400]. p50 = s[1] = 400 y p95 = s[1] = 400.
- **respaldo:** una sola latencia, [0]. p50 = 0 y p95 = 0, con respaldos = 1.

- [ ] **Step 4:** Run `claude plugin test router`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(router): tope de 1 s, modo sombra y detalle del respaldo`

---

### Task 5: Conectar los clasificadores reales

**Files:**
- Modify: `router/.claude-plugin/plugin.json`
- Modify: `router/hooks/register.tsx`
- Modify: `router/src/ui/panel.tsx` (sección de clasificadores en la pestaña de métricas)
- Test: `router/tests/register.test.ts`
- Test: `router/tests/panel.test.tsx`

**Interfaces:**
- Consumes: `crearHaiku` (Task 2), `crearJev`, `JEV_URL` (Task 3), `conTope`, `conSombra`,
  `agregarMuestra`, `estadisticasSombra`, `Muestra` (Task 4).
- Produces:
  - En `register.tsx`, una función de nivel superior
    `armarClasificador($: EngineInterface, options: PluginOptions): Promise<Clasificador>`.
  - `DatosPanel.sombra: Estadisticas | null`.

- [ ] **Step 1: `userConfig`.** Agregar a `plugin.json`:
```json
"clasificador": { "type": "string", "title": "Clasificador", "description": "Quién decide el tipo cuando las reglas no alcanzan: reglas (sin modelo), haiku o jev", "options": ["reglas", "haiku", "jev"], "default": "reglas" },
"sombra": { "type": "string", "title": "Modo sombra", "description": "Corre otro clasificador en paralelo, sin afectar la decisión, y guarda las dos respuestas para comparar", "options": ["off", "haiku", "jev"], "default": "off" },
"jevApiKey": { "type": "string", "title": "API key de Jev", "description": "Key de TypeSafe. Si falta, se usa la variable de entorno JEV_API_KEY", "sensitive": true },
"jevUmbral": { "type": "number", "title": "Umbral de confianza de Jev", "description": "Con menos confianza que esto, decide el respaldo", "default": 0.5 },
"topeMs": { "type": "number", "title": "Tope por clasificación (ms)", "description": "Si el clasificador tarda más, decide el respaldo", "default": 1000 }
```
Run `claude plugin validate router`. Si rechaza un campo sin `default` (`jevApiKey`), agregar
`"required": false` o lo que pida el mensaje.

- [ ] **Step 2: Tests (fallan)** en `router/tests/register.test.ts`. Usar
  `test(nombre, { options: {...} }, body)`.
  - **`clasificador: 'haiku'`:**
    - El test responde `model.classify` con `on('model.classify', async () => 'build-large')`;
      buscar en los tipos la forma exacta del input y del resultado de `'model.classify'`.
    - Un spawn `'Implement Task 2: tablas'` (prompt corto) sale en `opus` (build-large es
      opus·medium) y el motivo en el panel dice `haiku → build-large`.
  - **`clasificador: 'jev'` con `mock.env(on, { JEV_API_KEY: 'k' })`:**
    - El test responde `http.fetch` con `on('http.fetch', async (_$, e) => ...)`, verificando
      `e.url === 'https://api.typesafe.ai/v1/systemone'` y que el header `Authorization` sea
      `'Bearer k'`.
    - Devuelve `{ status: 200, ok: true, headers: {}, text: <respuesta jev build-large 0.9> }`.
    - Expected: el modelo es `opus` y el motivo es `jev → build-large (0.90)`.
  - **`clasificador: 'jev'` sin key:**
    - Lo responde Haiku.
    - Aparece un toast con `falta la key de Jev`: responder `ui.toast` en el test y capturar el
      texto.
  - **`clasificador: 'haiku'`, con `model.classify` que nunca resuelve y `topeMs: 50`:** usar
    `mock.clock` y `advance`. Expected: el motivo es `respaldo (tardó más de 50 ms) → build-small`
    y el spawn sale.
  - **`clasificador: 'haiku'`, `sombra: 'jev'`, con `mock.store(on)`:** después de un spawn,
    `$.store.get('sombra')` tiene 1 muestra con `principal.fuente === 'haiku'` y
    `sombra.fuente === 'jev'`.
  - **`panel.test.tsx`:** con 1 muestra en el store (`mock.store(on, { sombra: [ ... ] })`), la
    pestaña de métricas muestra `CLASIFICADORES` y `coinciden`.

  Si el kit no deja observar algo de esto, ajustá el **acceso**, nunca la aserción, y explicalo
  en el reporte.

- [ ] **Step 3: Implementar en `register.tsx`.**
```tsx
// Arma el clasificador según /config. $ entra acá (función de nivel superior) y sale capturado
// en closures: decidir recibe un Clasificador y no conoce $.
let avisoSinKey = false
export async function armarClasificador($: EngineInterface, options: PluginOptions): Promise<Clasificador> {
  const tope = typeof options.topeMs === 'number' ? options.topeMs : 1000
  const umbral = typeof options.jevUmbral === 'number' ? options.jevUmbral : 0.5
  const ahora = () => $.clock.now()
  const dormir = (ms: number) => $.clock.sleep(ms)
  const haiku = crearHaiku((texto, etiquetas) => $.model.classify(texto, etiquetas, { model: 'haiku' }), ahora)
  const key = (typeof options.jevApiKey === 'string' && options.jevApiKey) || (await $.env.get('JEV_API_KEY'))
  const jev = key
    ? crearJev(
        cuerpo => $.http.fetch(JEV_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: cuerpo,
        }),
        ahora,
        umbral,
      )
    : null
  const elegir = (nombre: unknown): Clasificador | null => {
    if (nombre === 'haiku') return haiku
    if (nombre === 'jev') {
      if (jev) return jev
      if (!avisoSinKey) {
        avisoSinKey = true
        $.ui.toast('Router: falta la key de Jev (/config o JEV_API_KEY); uso Haiku')
      }
      return haiku
    }
    return null
  }
  const principal = elegir(options.clasificador)
  if (!principal) return respaldo
  const sombra = options.sombra !== 'off' && options.sombra !== options.clasificador ? elegir(options.sombra) : null
  if (!sombra) return conTope(principal, tope, dormir)
  return conSombra(conTope(principal, tope, dormir), conTope(sombra, tope, dormir), m => guardarMuestra($, m), ahora)
}

export async function guardarMuestra($: EngineInterface, m: Muestra): Promise<void> {
  const lista = ((await $.store.get('sombra')) as Muestra[] | undefined) ?? []
  await $.store.set('sombra', agregarMuestra(lista, m))
}
```
Ajustá las firmas de `$.env.get`, `$.store.get`, `$.store.set` y `$.clock.sleep` a las de los
tipos. Si `$.env.get` es sincrónico, sacá el `await`.

En el hook `agent.spawn`, dentro del `try`:
`clasificar: await armarClasificador($, options)` en lugar de `respaldo`.

En el hook `ui.render`, leer `$.store.get('sombra')` y pasar
`sombra: estadisticasSombra(lista ?? [])` a `vistaPanel`.

**Si `$.clock.sleep` queda vivo después de que gana el clasificador:** dormir cuenta en el
presupuesto del hook (10 s), y el tope es como máximo `topeMs`. Si el kit o el cargador se
quejan de un sleep colgado, pasale a `dormir` el `next.signal` del hook (por ejemplo
`$.clock.sleep(ms, { signal })`), armando `armarClasificador` con un parámetro `signal`
opcional.

- [ ] **Step 4: Panel.** En la pestaña de métricas, después de lo existente, agregar esto cuando
  `d.sombra` no es `null`:
```tsx
<Text bold>CLASIFICADORES (modo sombra)</Text>
<Text>{`coinciden ${d.sombra.coinciden} de ${d.sombra.n} (${pct(d.sombra.coinciden / d.sombra.n)})`}</Text>
{Object.entries(d.sombra.porFuente).map(([f, s]) =>
  <Text key={`sombra-${f}`}>{`${f}: p50 ${s.p50} ms · p95 ${s.p95} ms · ${s.n} respuestas`}</Text>)}
```

- [ ] **Step 5:** Run `claude plugin test router` y `claude plugin validate router`. Expected:
  todo pasa. `validate` lista las llamadas nuevas: `model.classify`, `http.fetch`, `env.get`,
  `store.get` y `store.set`.
- [ ] **Step 6: Commit.** `feat(router): clasificadores Haiku y Jev conectados, con tope y sombra`

---

### Task 6: Extraer los casos reales

**Files:**
- Create: `bench/extraer.mjs`
- Create: `bench/casos.json` (generado)
- Create: `bench/.gitignore` (vacío por ahora)

**Interfaces:**
- Produces: `bench/casos.json` con la forma
  `{ generado: string, casos: Caso[] }`, donde
  `Caso = { id: string; descripcion: string; subagentType: string; pedido: string; proyecto: string; resumen: Resumen; tarea: string; regla: string | null; etiquetasProduccion: string[] | null }`.
  - `tarea` es `textoResumen(descripcion, resumen)`, lo único que verían Haiku y Jev.
  - `regla` es `clasificarPorReglas(...)?.tipo ?? null`.
  - `etiquetasProduccion` es lo que el router le pediría al clasificador: `TALLAS` si la regla
    es `build`, `TIPOS` si no hay regla, y `null` si la regla ya decide sola.

- [ ] **Step 1: Script.** `bench/extraer.mjs`:
```js
// Extrae los subagentes reales de los transcripts de Claude Code a bench/casos.json.
// Guarda la descripción y el RESUMEN del prompt (largo, archivos, pasos, spec), nunca el prompt.
//   node bench/extraer.mjs [--proyectos C:/Users/.../.claude/projects]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { clasificarPorReglas } from '../router/src/reglas.ts'
import { resumir, textoResumen } from '../router/src/resumen.ts'

const TIPOS = ['review-final', 'review', 're-review', 'build-large', 'build-small', 'fix', 'explore', 'research', 'write']
const TALLAS = ['build-large', 'build-small']
const i = process.argv.indexOf('--proyectos')
const base = i > 0 ? process.argv[i + 1] : path.join(os.homedir(), '.claude', 'projects')

const vistos = new Map()
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
        if (vistos.has(clave)) continue
        const subagentType = x.subagent_type ?? 'general-purpose'
        if (subagentType === 'fork') continue
        const resumen = resumir(x.prompt)
        const regla = clasificarPorReglas(x.description, subagentType)?.tipo ?? null
        vistos.set(clave, {
          id: `c${String(vistos.size + 1).padStart(4, '0')}`,
          descripcion: x.description,
          subagentType,
          pedido: x.model ?? 'inherit',
          proyecto: dir.replace(/^C--Users-[^-]+-Documents-GitHub-/, ''),
          resumen,
          tarea: textoResumen(x.description, resumen),
          regla,
          etiquetasProduccion: regla === 'build' ? TALLAS : regla === null ? TIPOS : null,
        })
      }
    }
  }
}
const casos = [...vistos.values()]
fs.writeFileSync(new URL('./casos.json', import.meta.url), JSON.stringify({ generado: new Date().toISOString(), casos }, null, 1) + '\n')
const porRegla = Object.groupBy(casos, c => c.regla ?? 'ninguna')
console.log(`${casos.length} casos · ` + Object.entries(porRegla).map(([k, v]) => `${k} ${v.length}`).join(' · '))
console.log(`le llegan al clasificador: ${casos.filter(c => c.etiquetasProduccion).length}`)
```

- [ ] **Step 2: Correr.** Run `node bench/extraer.mjs`.
  - Expected: imprime unos 500 a 700 casos con su distribución por regla.
  - Si Node se queja de importar `.ts`, probar con `node --experimental-strip-types`. Si aun así
    falla porque `reglas.ts` importa `'../types'`, revisar que ese import sea `import type` (Node
    lo borra).
- [ ] **Step 3: Revisar** que `casos.json` no tenga ningún campo `prompt`:
  `grep -c '"prompt"' bench/casos.json` tiene que dar 0.
- [ ] **Step 4: Commit.** `feat(bench): extraer los subagentes reales a casos.json`

---

### Task 7: Etiquetar los casos

Esta tarea no lleva código: es juicio. La hace un subagente Opus. El usuario revisa después
solo los dudosos.

**Files:**
- Create: `bench/etiquetas.json`, con la forma
  `{ "<id>": { "tipo": "<Tipo>", "seguro": boolean, "nota"?: string } }`
- Create: `bench/para-revisar.md`

- [ ] **Step 1: Etiquetar cada caso de `bench/casos.json`** con un tipo de los 9, usando
  **solo** `descripcion`, `subagentType` y `resumen`, con las definiciones de
  `router/src/clasificadores/preguntas.ts`.
  - `seguro: false` cuando la descripción no alcanza para decidir con confianza. Por ejemplo, un
    build sin pistas de tamaño, o una descripción ambigua.
  - En esos casos, `nota` dice en una línea por qué.
- [ ] **Step 2: Escribir `bench/para-revisar.md`.** Una tabla con los casos `seguro: false`
  (id, descripción, resumen, etiqueta propuesta y nota), ordenada por tipo propuesto, con
  instrucciones al inicio de cómo corregir: editar `bench/etiquetas.json`.
- [ ] **Step 3: Chequeo de consistencia.**
  - Todos los ids de `casos.json` tienen etiqueta.
  - Todas las etiquetas son uno de los 9 tipos.
  - Contar cuántas etiquetas contradicen a la regla, en los casos con regla de tipo fijo. Si son
    más del 5%, anotarlo en el reporte: puede ser una regla mala o una etiqueta mala.
- [ ] **Step 4: Commit.** `feat(bench): etiquetas de referencia y casos a revisar`

---

### Task 8: `/router banco` y el comparador

**Files:**
- Create: `router/src/banco.ts` (lógica pura)
- Modify: `router/hooks/register.tsx` (subcomando `banco`)
- Modify: `router/src/overrides.ts` (parser: `banco [--max N] [--solo haiku|jev]`)
- Create: `bench/comparar.mjs`
- Create: `bench/README.md`
- Test: `router/tests/banco.test.ts`
- Test: en `router/tests/overrides.test.ts`, el parser de `banco`

**Interfaces:**
- `Comando` suma `{ accion: 'banco'; max: number | null; solo: 'haiku' | 'jev' | null }`.
- `src/banco.ts`:
  - `type ResultadoBanco = { id: string; fuente: 'haiku' | 'jev'; tipo: string | null; confianza: number | null; ms: number; error: string | null }`
  - `casosDeProduccion(casos): Caso[]`: los que tienen `etiquetasProduccion`.
  - `correrBanco(casos, clasificadores: Partial<Record<'haiku' | 'jev', Clasificador>>, opciones: { concurrencia: number; alAvanzar?: (hechos: number, total: number) => Promise<void> }): Promise<ResultadoBanco[]>`
    - Corre cada caso por cada clasificador **sin tope**: el banco mide la latencia real.
    - Atrapa los errores, que quedan en `error`.
    - Usa la concurrencia dada.
- En `register.tsx`, el subcomando `banco`:
  - lee `${await $.session.cwd()}/bench/casos.json` con `$.fs.read`;
  - arma Haiku y Jev **sin tope y sin sombra**, reutilizando `crearHaiku`/`crearJev` con
    `$.model.classify` y `$.http.fetch`, y umbral 0 para que Jev no se descarte por duda;
  - corre con concurrencia 3 y escribe
    `bench/corridas/<AAAA-MM-DD>-banco.json` = `{ fecha, clasificadores, resultados }`, cada 25
    casos y al final;
  - responde con un resumen de una línea.
  - Si se pide `jev` (o no hay `--solo`) y no hay key, corre solo Haiku y lo dice en la
    respuesta.

- [ ] **Step 1: Tests (fallan).**
  - **`banco.test.ts`:**
    - con 3 casos (uno con `etiquetasProduccion: null`) y dos clasificadores falsos (uno que
      falla en un caso), `correrBanco` devuelve 4 resultados (2 casos × 2 fuentes), uno con
      `error`;
    - `alAvanzar` se llama con `(4, 4)` al final.
  - **`overrides.test.ts`:**
    - `parsearComando('banco')` da `{ accion: 'banco', max: null, solo: null }`;
    - `parsearComando('banco --max 50 --solo jev')` da `{ accion: 'banco', max: 50, solo: 'jev' }`;
    - `parsearComando('banco --solo gpt')` da un `error`.
- [ ] **Step 2:** Run `claude plugin test router`. Expected: FAIL.
- [ ] **Step 3: Implementar.** `router/src/banco.ts`:
```ts
import type { Tipo } from '../types'
import type { Clasificador } from './clasificadores'
import type { Resumen } from './resumen'

export type Caso = { id: string; descripcion: string; resumen: Resumen; etiquetasProduccion: Tipo[] | null }
export type ResultadoBanco = { id: string; fuente: 'haiku' | 'jev'; tipo: string | null; confianza: number | null; ms: number; error: string | null }

export function casosDeProduccion<C extends Caso>(casos: readonly C[]): C[] {
  return casos.filter(c => c.etiquetasProduccion !== null)
}

export async function correrBanco(
  casos: readonly Caso[],
  clasificadores: Partial<Record<'haiku' | 'jev', Clasificador>>,
  opciones: { concurrencia: number; alAvanzar?: (hechos: number, total: number) => Promise<void> },
): Promise<ResultadoBanco[]> {
  const trabajos = casosDeProduccion(casos).flatMap(c =>
    (Object.entries(clasificadores) as ['haiku' | 'jev', Clasificador][]).map(([fuente, cl]) => ({ c, fuente, cl })),
  )
  const resultados: ResultadoBanco[] = []
  let siguiente = 0
  const trabajador = async () => {
    while (siguiente < trabajos.length) {
      const { c, fuente, cl } = trabajos[siguiente++]!
      try {
        const r = await cl({ descripcion: c.descripcion, resumen: c.resumen, etiquetas: c.etiquetasProduccion! })
        resultados.push({ id: c.id, fuente, tipo: r.tipo, confianza: r.confianza ?? null, ms: r.ms, error: null })
      } catch (e) {
        resultados.push({ id: c.id, fuente, tipo: null, confianza: null, ms: 0, error: e instanceof Error ? e.message : String(e) })
      }
      await opciones.alAvanzar?.(resultados.length, trabajos.length)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opciones.concurrencia) }, trabajador))
  return resultados
}
```
En `register.tsx`, una función de nivel superior `correrBancoEnSesion($, options, comando)`
arma los clasificadores y llama a `correrBanco`. `alAvanzar` escribe el archivo cada 25 casos
con `$.fs.write`. Al terminar devuelve
`Banco: N casos · haiku X ok / Y error · jev X ok / Y error · bench/corridas/<archivo>`.

`bench/comparar.mjs` (Node):
```js
// Compara una corrida del banco contra las etiquetas de referencia.
//   node bench/comparar.mjs [bench/corridas/<archivo>-banco.json]
import fs from 'node:fs'

const dir = new URL('./corridas/', import.meta.url)
const ruta = process.argv[2] ?? new URL(fs.readdirSync(dir).filter(f => f.endsWith('-banco.json')).sort().at(-1), dir)
const corrida = JSON.parse(fs.readFileSync(ruta, 'utf8'))
const etiquetas = JSON.parse(fs.readFileSync(new URL('./etiquetas.json', import.meta.url), 'utf8'))
const { casos } = JSON.parse(fs.readFileSync(new URL('./casos.json', import.meta.url), 'utf8'))
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '—')
const perc = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0 }
const filas = []
const linea = s => { filas.push(s); console.log(s) }

linea(`# Banco del clasificador · ${corrida.fecha}\n`)
// 1. Las reglas contra la referencia (cuánto resuelven sin modelo, y con qué precisión).
const conRegla = casos.filter(c => c.regla && c.regla !== 'build')
const reglaOk = conRegla.filter(c => etiquetas[c.id]?.tipo === c.regla).length
linea(`**Reglas:** resuelven solas ${conRegla.length} de ${casos.length} casos (${pct(conRegla.length, casos.length)}), con ${pct(reglaOk, conRegla.length)} de acierto contra la referencia.\n`)
// 2. Cada clasificador sobre los casos que le llegarían en producción.
linea('| Clasificador | casos | acierta | acierta (solo seguros) | errores | p50 ms | p95 ms |')
linea('|---|---|---|---|---|---|---|')
for (const fuente of ['haiku', 'jev']) {
  const rs = corrida.resultados.filter(r => r.fuente === fuente)
  if (!rs.length) continue
  const ok = rs.filter(r => r.tipo && r.tipo === etiquetas[r.id]?.tipo)
  const seguros = rs.filter(r => etiquetas[r.id]?.seguro)
  const okSeg = seguros.filter(r => r.tipo === etiquetas[r.id]?.tipo)
  const ms = rs.filter(r => !r.error).map(r => r.ms)
  linea(`| ${fuente} | ${rs.length} | ${pct(ok.length, rs.length)} | ${pct(okSeg.length, seguros.length)} | ${rs.filter(r => r.error).length} | ${perc(ms, 0.5)} | ${perc(ms, 0.95)} |`)
}
// 3. Calibración de Jev: acierto por tramo de confianza (sirve para elegir jevUmbral).
const jev = corrida.resultados.filter(r => r.fuente === 'jev' && r.confianza !== null)
if (jev.length) {
  linea('\n**Calibración de Jev** (acierto por tramo de confianza):\n')
  linea('| confianza | n | acierta |')
  linea('|---|---|---|')
  for (const [a, b] of [[0, 0.5], [0.5, 0.7], [0.7, 0.9], [0.9, 1.01]]) {
    const t = jev.filter(r => r.confianza >= a && r.confianza < b)
    if (t.length) linea(`| [${a}, ${Math.min(b, 1)}) | ${t.length} | ${pct(t.filter(r => r.tipo === etiquetas[r.id]?.tipo).length, t.length)} |`)
  }
}
// 4. El respaldo de la fase 1 (sin modelo) sobre los mismos casos, como piso.
const builds = casos.filter(c => c.regla === 'build')
const respaldoOk = builds.filter(c => (c.resumen.chars > 5000 || c.resumen.archivos > 6 ? 'build-large' : 'build-small') === etiquetas[c.id]?.tipo).length
linea(`\n**Respaldo sin modelo** (talla por largo y archivos) en los ${builds.length} builds: ${pct(respaldoOk, builds.length)} de acierto.`)
const salida = String(ruta).replace(/-banco\.json$/, '-comparacion.md')
fs.writeFileSync(new URL(salida, 'file://'), filas.join('\n') + '\n')
```
(Si `new URL(salida, 'file://')` falla con la ruta de Windows, usar `fs.writeFileSync(salida, ...)`
con la ruta como string.)

`bench/README.md`: los tres pasos y sus comandos (extraer, etiquetar/revisar, `/router banco`
seguido de `node bench/comparar.mjs`), qué mide cada número y cómo elegir `clasificador` y
`jevUmbral` en `/config` a partir de la comparación.

- [ ] **Step 4:** Run `claude plugin test router` y `claude plugin validate router`. Expected:
  todo pasa.
- [ ] **Step 5: Commit.** `feat(router): /router banco y comparador del banco`

---

### Task 9: Correr el banco y verificar en vivo

No cambia código del plugin. Si algo falla, se anota con evidencia.

**Files:**
- Create: `bench/corridas/<fecha>-banco.json` y `bench/corridas/<fecha>-comparacion.md`
- Create: `docs/verificaciones/2026-10-06-router-fase-2.md`

- [ ] **Step 1: Key de Jev.**
  - Si la variable de entorno `JEV_API_KEY` no está seteada en el proceso, **no la busques en
    archivos**: corré el banco con `--solo haiku` y anotá que Jev queda pendiente de que el
    usuario configure la key.
  - Hay dos formas de configurarla: `/plugin configure router@…` → `jevApiKey`, o exportar
    `JEV_API_KEY`.
- [ ] **Step 2: Correr el banco headless.** Desde la raíz del repo, con dos turnos en un mismo
  proceso, como en la fase 1 (`--input-format stream-json`):
  - el comando es `/router banco` (o `/router banco --solo haiku`);
  - el modelo de la sesión, `--model sonnet`;
  - `--plugin-dir "$(pwd)/router"`.

  Esperar a que termine (puede tardar varios minutos) y verificar que exista
  `bench/corridas/<fecha>-banco.json`.
- [ ] **Step 3: Comparar.** Run `node bench/comparar.mjs`. Expected: se imprime la tabla y se
  escribe `<fecha>-comparacion.md`.
- [ ] **Step 4: Probar en vivo `explore` → Haiku.** Esto quedó pendiente de la fase 1.
  - Un `claude -p` que lance un subagente `Explore` con description `"Explore: mapear router/src"`
    y que solo responda "ok".
  - En el transcript del subagente, confirmar que el modelo es Haiku y si los requests llevan o
    no `effort`. Anotar el resultado.
- [ ] **Step 5: Probar en vivo el clasificador conectado.** Un `claude -p` con
  `--settings '{"pluginConfigs":{"router@inline":{"options":{"clasificador":"haiku","sombra":"off"}}}}'`
  (o la forma que acepten los tipos o la doc para un `--plugin-dir`).
  - El subagente tiene description `"Implement Task 2: tablas"` y solo responde "ok".
  - En el debug log, confirmar que hubo `model.classify` y cuál fue el modelo final.
- [ ] **Step 6: Escribir la verificación.** En `docs/verificaciones/2026-10-06-router-fase-2.md`
  van:
  - los comandos;
  - la tabla de `comparar.mjs`;
  - los dos chequeos en vivo, con evidencia;
  - una recomendación de `clasificador` y `jevUmbral` para el usuario. **No cambiar los
    defaults:** decide el usuario.
- [ ] **Step 7: Commit.** `docs(router): banco del clasificador y verificación en vivo de la fase 2`
