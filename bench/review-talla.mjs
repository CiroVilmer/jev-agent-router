// Mide la talla de las reviews (review-large / review-small) contra bench/etiquetas-review.json:
// cuánto cubren el alcance y el build de la misma tarea y con qué acierto, Jev con las 2 etiquetas
// (sin umbral y con umbral 0.7) y la política completa de tallaDeReview simulada.
//   [JEV_API_KEY=…] node bench/review-talla.mjs
// Sin JEV_API_KEY no llama a Jev: la política simula el clasificador `reglas` (siempre review-small).
// Imprime la tabla y la guarda en bench/corridas/<AAAA-MM-DD>-review-talla.md.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { tareaDe } from '../router/src/registro.ts'
import { preguntaJev } from '../router/src/clasificadores/preguntas.ts'

// Copiados de router/src/tallaReview.ts (ese archivo importa valores sin extensión y Node no lo
// puede importar desde bench/). Si cambian allá, cambialos acá.
const ALCANCE_AMPLIO = /\b(bloque|block|feature|fase|phase|integraci[oó]n|integration|rama|branch|merge)\b/i
const FIN = '(?!\\d|[a-z]|\\.\\d)'
const TAREA_NUMERADA = /\b(?:task|tarea)s?\s+\d+[a-z]?|\bT\d+[a-z]?\b/i
const RANGOS = [
  new RegExp(`\\b(?:tasks?|tareas?)\\s+(\\d+)[a-z]?\\s*(?:-|–|a|to|y|and|,)\\s*(\\d+)${FIN}`, 'i'),
  new RegExp(`\\bT(\\d+)\\s*-\\s*T?(\\d+)${FIN}`, 'i'),
]
function rangoDeTareas(d) {
  for (const re of RANGOS) {
    const m = re.exec(d)
    if (m && Number(m[2]) > Number(m[1])) return m[0]
  }
  return null
}

const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
const JEV_MODELO = 'jev-1.13.0'
const TALLAS = ['review-large', 'review-small']
const RESPALDO = 'review-small'
const UMBRAL = 0.7
const CONCURRENCIA = 3
const LIMITE_MS = 60_000

const aqui = path.dirname(fileURLToPath(import.meta.url))
const { casos } = JSON.parse(fs.readFileSync(path.join(aqui, 'casos.json'), 'utf8'))
const etiquetas = JSON.parse(fs.readFileSync(path.join(aqui, 'etiquetas.json'), 'utf8'))
const ref = JSON.parse(fs.readFileSync(path.join(aqui, 'etiquetas-review.json'), 'utf8'))

/** La talla del build del mismo proyecto y la misma tareaDe: el más cercano anterior, si no el siguiente. */
function tallaBuild(i) {
  const c = casos[i]
  const t = tareaDe(c.descripcion)
  if (!t) return null
  const es = b => b.proyecto === c.proyecto && /^build-/.test(etiquetas[b.id]?.tipo ?? '') && tareaDe(b.descripcion) === t
  for (let j = i - 1; j >= 0; j--) if (es(casos[j])) return etiquetas[casos[j].id].tipo
  for (let j = i + 1; j < casos.length; j++) if (es(casos[j])) return etiquetas[casos[j].id].tipo
  return null
}

const reviews = casos
  .map((c, i) => ({ c, i }))
  .filter(({ c }) => ref[c.id])
  .map(({ c, i }) => {
    const d = c.descripcion
    const rango = rangoDeTareas(d)
    const palabra = TAREA_NUMERADA.test(d) ? null : ALCANCE_AMPLIO.exec(d)?.[0] ?? null
    const build = tallaBuild(i)
    return { c, ref: ref[c.id], rango, palabra, build: build ? build.replace('build-', 'review-') : null }
  })
const sinRef = casos.filter(c => etiquetas[c.id]?.tipo === 'review' && !ref[c.id]).length

// --- Jev ---
const key = process.env.JEV_API_KEY
const jev = new Map()
if (key) {
  const pregunta = preguntaJev(TALLAS)
  async function clasificar(c) {
    const inicio = Date.now()
    try {
      const r = await fetch(JEV_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: JEV_MODELO, state: { tarea: c.tarea }, questions: { tipo: pregunta } }),
        signal: AbortSignal.timeout(LIMITE_MS),
      })
      const ms = Date.now() - inicio
      if (!r.ok) return { tipo: null, confianza: null, ms, error: `HTTP ${r.status}` }
      const a = (await r.json()).answers?.tipo
      if (!a || typeof a.choice !== 'string' || !TALLAS.includes(a.choice)) return { tipo: null, confianza: null, ms, error: 'respuesta sin answers.tipo válido' }
      const confianza = typeof a.confidence === 'number' ? a.confidence : (a.probabilities?.[a.choice] ?? 0)
      return { tipo: a.choice, confianza, ms, error: null }
    } catch (e) {
      // Nunca se imprime la key.
      return { tipo: null, confianza: null, ms: Date.now() - inicio, error: String(e?.message ?? e).split(key).join('***') }
    }
  }
  let siguiente = 0
  async function trabajador() {
    while (siguiente < reviews.length) {
      const { c } = reviews[siguiente++]
      jev.set(c.id, await clasificar(c))
      if (jev.size % 50 === 0) console.log(`jev ${jev.size}/${reviews.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador))
}
const jevSin = id => jev.get(id)?.tipo ?? RESPALDO
const jevCon = id => {
  const j = jev.get(id)
  return j?.tipo && j.confianza >= UMBRAL ? j.tipo : RESPALDO
}

// --- La política de tallaDeReview: rango → build → palabra (sin tarea numerada) → clasificador ---
function politica(r, clasificador) {
  if (r.rango) return { tipo: 'review-large', paso: 'alcance' }
  if (r.build) return { tipo: r.build, paso: 'build' }
  if (r.palabra) return { tipo: 'review-large', paso: 'alcance' }
  return { tipo: clasificador(r.c.id), paso: 'clasificador' }
}

// --- Tabla ---
const pct = (a, n) => (n ? `${((100 * a) / n).toFixed(1)}%` : '—')
const celda = lista => {
  const ok = lista.filter(x => x.ok).length
  return lista.length ? `${ok}/${lista.length} (${pct(ok, lista.length)})` : '—'
}
const fila = (nombre, lista) => {
  const build = lista.filter(x => x.r.ref.fuente === 'build')
  const manual = lista.filter(x => x.r.ref.fuente === 'manual')
  return `| ${nombre} | ${lista.length} | ${celda(lista)} | ${celda(build)} | ${celda(manual)} |`
}
const medir = (lista, f) => lista.map(r => ({ r, ok: f(r) === r.ref.talla }))

const total = reviews.length
const nBuild = reviews.filter(r => r.ref.fuente === 'build').length
const nLarge = reviews.filter(r => r.ref.talla === 'review-large').length
const lineas = [
  `# Talla de reviews · ${new Date().toISOString()}`,
  '',
  `Referencia: bench/etiquetas-review.json, ${total} reviews (${nBuild} con fuente build y seguras, ${total - nBuild} manuales sin validar). ` +
    `${nLarge} review-large y ${total - nLarge} review-small.${sinRef ? ` ${sinRef} reviews de etiquetas.json sin etiqueta de talla.` : ''}`,
  '',
  'Columnas: casos que cubre la fila, acierto en esos casos, y el acierto partido por fuente de la etiqueta. ' +
    'La fila del build acierta por construcción en la fuente build (la etiqueta sale del mismo build): mide cobertura, no acierto.',
  '',
  '| Medida | cubre | acierta | fuente build | fuente manual |',
  '|---|---|---|---|---|',
]
const alcance = reviews.filter(r => r.rango || r.palabra)
lineas.push(fila('Alcance (rango, o palabra sin tarea numerada)', medir(alcance, () => 'review-large')))
lineas.push(fila('  solo rango de tareas', medir(reviews.filter(r => r.rango), () => 'review-large')))
lineas.push(fila('  solo palabra sin tarea numerada', medir(reviews.filter(r => !r.rango && r.palabra), () => 'review-large')))
lineas.push(fila('Build de la misma tarea', medir(reviews.filter(r => r.build), r => r.build)))
lineas.push(fila('Respaldo solo (siempre review-small)', medir(reviews, () => RESPALDO)))
if (key) {
  const errores = [...jev.values()].filter(j => j.error).length
  lineas.push(fila(`Jev 2 etiquetas, sin umbral (${errores} errores → ${RESPALDO})`, medir(reviews, r => jevSin(r.c.id))))
  lineas.push(fila(`Jev 2 etiquetas, umbral ${UMBRAL}`, medir(reviews, r => jevCon(r.c.id))))
}
lineas.push(fila('Política con clasificador reglas (respaldo)', medir(reviews, r => politica(r, () => RESPALDO).tipo)))
if (key) {
  lineas.push(fila('Política con Jev sin umbral', medir(reviews, r => politica(r, jevSin).tipo)))
  lineas.push(fila(`Política con Jev umbral ${UMBRAL}`, medir(reviews, r => politica(r, jevCon).tipo)))
  const llegan = reviews.filter(r => politica(r, jevCon).paso === 'clasificador')
  lineas.push(fila('  solo los que llegan al clasificador, Jev sin umbral', medir(llegan, r => jevSin(r.c.id))))
  lineas.push(fila(`  solo los que llegan al clasificador, Jev umbral ${UMBRAL}`, medir(llegan, r => jevCon(r.c.id))))
} else {
  lineas.push('', 'Sin JEV_API_KEY: no se llamó a Jev.')
}

// Por qué paso decide la política, y los casos donde falla (con el mejor clasificador disponible).
const clasif = key ? jevCon : () => RESPALDO
const pasos = {}
for (const r of reviews) pasos[politica(r, clasif).paso] = (pasos[politica(r, clasif).paso] ?? 0) + 1
lineas.push('', `Paso que decide en la política: ${Object.entries(pasos).map(([p, n]) => `${p} ${n}`).join(' · ')}.`)
const fallos = reviews.filter(r => politica(r, clasif).tipo !== r.ref.talla)
lineas.push('', `Fallos de la política${key ? ` con Jev umbral ${UMBRAL}` : ''} (${fallos.length}):`, '')
lineas.push('| id | description | referencia (fuente) | política | paso | Jev |', '|---|---|---|---|---|---|')
for (const r of fallos) {
  const p = politica(r, clasif)
  const j = jev.get(r.c.id)
  const jt = j ? (j.tipo ? `${j.tipo} ${j.confianza.toFixed(2)}` : j.error) : '—'
  lineas.push(`| ${r.c.id} | ${r.c.descripcion.replace(/\|/g, '/')} | ${r.ref.talla} (${r.ref.fuente}) | ${p.tipo} | ${p.paso} | ${jt} |`)
}

const texto = lineas.join('\n') + '\n'
console.log(texto)
const hoy = new Date()
const dos = n => String(n).padStart(2, '0')
const salida = path.join(aqui, 'corridas', `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}-review-talla.md`)
fs.mkdirSync(path.dirname(salida), { recursive: true })
fs.writeFileSync(salida, texto)
console.log(`guardado: ${path.relative(process.cwd(), salida)}`)
