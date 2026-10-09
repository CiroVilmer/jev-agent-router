// Corre Jev sobre TODOS los casos del banco (no solo los que hoy le llegan), con las 9 etiquetas
// y sin pistas de las reglas, para saber si puede ser el que decide. Mismo pedido que producción
// (descripción + resumen, nunca el prompt), umbral 0: guarda la elección y la confianza.
//   JEV_API_KEY=… node bench/jev-todos.mjs [--max N] [--talla]
// --talla: como producción con regla build, solo los casos con regla `build` y las 2 tallas.
// Escribe bench/corridas/<AAAA-MM-DD>-<HHMM>-jev-todos.json cada 50 resultados y al final.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { preguntaJev } from '../router/src/clasificadores/preguntas.ts'

const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
const JEV_MODELO = 'jev-1.13.0'
const TIPOS = ['review-final', 'review', 're-review', 'build-large', 'build-small', 'fix', 'explore', 'research', 'write']
const CONCURRENCIA = 3
const LIMITE_MS = 60_000

const key = process.env.JEV_API_KEY
if (!key) {
  console.error('Falta JEV_API_KEY.')
  process.exit(1)
}
const aqui = path.dirname(fileURLToPath(import.meta.url))
const { casos } = JSON.parse(fs.readFileSync(path.join(aqui, 'casos.json'), 'utf8'))
const iMax = process.argv.indexOf('--max')
const talla = process.argv.includes('--talla')
const ETIQUETAS = talla ? ['build-large', 'build-small'] : TIPOS
const base = talla ? casos.filter(c => c.regla === 'build') : casos
const lista = iMax > 0 ? base.slice(0, Number(process.argv[iMax + 1])) : base

const ahora = new Date()
const dos = n => String(n).padStart(2, '0')
const nombre = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}-${dos(ahora.getHours())}${dos(ahora.getMinutes())}-jev-${talla ? 'talla' : 'todos'}.json`
const salida = path.join(aqui, 'corridas', nombre)
fs.mkdirSync(path.dirname(salida), { recursive: true })

const pregunta = preguntaJev(ETIQUETAS)
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
    if (!r.ok) return { id: c.id, tipo: null, confianza: null, ms, error: `HTTP ${r.status}` }
    const a = (await r.json()).answers?.tipo
    if (!a || typeof a.choice !== 'string' || !ETIQUETAS.includes(a.choice)) return { id: c.id, tipo: null, confianza: null, ms, error: 'respuesta sin answers.tipo válido' }
    const confianza = typeof a.confidence === 'number' ? a.confidence : (a.probabilities?.[a.choice] ?? 0)
    return { id: c.id, tipo: a.choice, confianza, ms, error: null }
  } catch (e) {
    // Nunca se imprime la key: el mensaje de fetch no la incluye, pero se tapa por las dudas.
    return { id: c.id, tipo: null, confianza: null, ms: Date.now() - inicio, error: String(e?.message ?? e).split(key).join('***') }
  }
}

const resultados = []
const guardar = () =>
  fs.writeFileSync(salida, JSON.stringify({ generado: new Date().toISOString(), modelo: JEV_MODELO, etiquetas: ETIQUETAS, resultados }, null, 1) + '\n')
let siguiente = 0
async function trabajador() {
  while (siguiente < lista.length) {
    const c = lista[siguiente++]
    resultados.push(await clasificar(c))
    if (resultados.length % 50 === 0) {
      guardar()
      console.log(`${resultados.length}/${lista.length}`)
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador))
guardar()
const errores = resultados.filter(r => r.error).length
console.log(`listo: ${resultados.length} casos · ${errores} errores · ${path.relative(process.cwd(), salida)}`)
