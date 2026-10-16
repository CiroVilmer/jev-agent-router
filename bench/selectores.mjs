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
const entero = (n, d) => { if (!process.argv.includes(n)) return d === undefined ? undefined : Number(d); const v = arg(n); if (!/^[0-9]+$/.test(String(v ?? '')) || Number(v) < 1) { console.error(`${n} pide un entero positivo. ${uso}`); process.exit(1) } return Number(v) }
const max = entero('--max', undefined)
const concurrencia = entero('--concurrencia', '1')
const hardware = arg('--hardware')

const aqui = path.dirname(fileURLToPath(import.meta.url))
const { casos } = JSON.parse(fs.readFileSync(path.join(aqui, 'casos.json'), 'utf8'))
const idsReview = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(aqui, 'etiquetas-review.json'), 'utf8'))))
const deSuite = s => (s === 'tipos' ? casos : s === 'talla' ? casos.filter(c => c.regla === 'build') : casos.filter(c => idsReview.has(c.id))).slice(0, max)

// fetch rechaza URLs con credenciales: se piden por Basic y la URL se usa sin ellas.
const { urlPedido, basic } = (() => {
  try { const u = new URL(url); const b = u.username || u.password ? Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString('base64') : null; u.username = ''; u.password = ''; return { urlPedido: u.toString(), basic: b } } catch { return { urlPedido: url, basic: null } }
})()
// Los errores nunca llevan la key ni la URL (puede traer credenciales o query).
const tapar = t => { let s = String(t); for (const x of [key, url, urlPedido]) if (x) s = s.split(x).join('***'); return s }
async function clasificar(c, etiquetas) {
  const cuerpo = protocolo === 'systemone'
    ? pedidoSystemOne(modelo, c.tarea, preguntaJev(etiquetas))
    : pedidoOpenAI(modelo, textoOpenAI(textoParaHaiku(c.tarea, etiquetas), etiquetas), etiquetas)
  const inicio = Date.now()
  try {
    const r = await fetch(urlPedido, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : basic ? { Authorization: `Basic ${basic}` } : {}) },
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
// La URL se guarda sin credenciales ni query string, como urlSinCredenciales del banco.
const urlGuardada = (() => { try { const u = new URL(url); u.username = ''; u.password = ''; u.search = ''; return u.toString() } catch { return null } })()

for (const suite of suiteArg === 'todas' ? ['tipos', 'talla', 'review'] : [suiteArg]) {
  const lista = deSuite(suite)
  const etiquetas = ETIQUETAS[suite]
  // Nunca pisa una corrida anterior: primer nombre libre (-2, -3, …).
  const base = path.join(aqui, 'corridas', `${sello}-sel-${selector}-${suite}`)
  let salida = `${base}.json`
  for (let n = 2; fs.existsSync(salida); n++) salida = `${base}-${n}.json`
  fs.writeFileSync(salida, '', { flag: 'wx' })
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
