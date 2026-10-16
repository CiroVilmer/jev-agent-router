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
import { avisarSiDiverge, pasosDeReview, politicaTallaReview, politicaTipos, respaldoTalla, TALLAS, TALLAS_REVIEW } from './lib/politica.mjs'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(aqui, 'corridas')
const leer = f => JSON.parse(fs.readFileSync(f, 'utf8'))
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const numero = (n, d) => { const v = Number(arg(n, d)); if (!Number.isFinite(v) || v < 0) { console.error(`${n} pide un número no negativo.`); process.exit(1) } return v }
const tope = numero('--tope', '1000')
const umbralLocal = numero('--umbral-local', '0.7')
const archivos = process.argv.slice(2).filter((a, i, xs) => a.endsWith('.json') && !['--tope', '--umbral-local'].includes(xs[i - 1]))

const { casos } = leer(path.join(aqui, 'casos.json'))
const etiquetas = leer(path.join(aqui, 'etiquetas.json'))
const ref = leer(path.join(aqui, 'etiquetas-review.json'))
const precios = leer(path.join(aqui, 'precios.json'))
avisarSiDiverge()

const SUITES = ['tipos', 'talla', 'review']
const TIPOS = ['review-final', 'review', 're-review', 'build-large', 'build-small', 'fix', 'explore', 'research', 'write']
const casoPorId = new Map(casos.map(c => [c.id, c]))
const pct = (a, n) => (n ? `${((100 * a) / n).toFixed(1)}%` : 'sin dato')
const UMBRAL = { jev: 0.7, local: umbralLocal, haiku: 0 } // haiku no tiene confianza: no hay umbral

// 1. Elegir las corridas: la más nueva por (selector, modelo, protocolo, suite); cada combinación distinta es una fila.
function corridas() {
  const lista = archivos.length ? archivos : fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /-sel-.*\.json$/.test(f)).map(f => path.join(dir, f)) : []
  const validas = []
  for (const f of lista) {
    try {
      const r = leer(f)
      if (!r || !Array.isArray(r.resultados) || !SUITES.includes(r.suite) || !r.selector) throw new Error('no es una corrida de selector')
      validas.push({ ...r, archivo: path.basename(f).replace(/\.json$/, '') })
    } catch (e) { console.error(`AVISO: se salta ${path.basename(f)} (${e.message.split('\n')[0]}).`) }
  }
  // Por fecha y, si empatan o falta, por nombre sin extensión (así "-talla-2" va después de "-talla").
  const t = r => { const v = Date.parse(r.fecha ?? ''); return Number.isNaN(v) ? 0 : v }
  validas.sort((a, b) => t(a) - t(b) || (a.archivo < b.archivo ? -1 : a.archivo > b.archivo ? 1 : 0))
  const filas = new Map()
  for (const r of validas) {
    const k = `${r.selector}|${r.modelo ?? ''}|${r.protocolo ?? ''}`
    if (!filas.has(k)) filas.set(k, { selector: r.selector, modelo: r.modelo ?? null, protocolo: r.protocolo ?? null, hardware: null, suites: {} })
    const fila = filas.get(k)
    fila.suites[r.suite] = r // la más nueva pisa a la anterior
    if (r.hardware) fila.hardware = r.hardware
  }
  const arr = [...filas.values()]
  for (const f of arr) {
    const otros = arr.filter(o => o.selector === f.selector).length > 1
    f.nombre = f.selector === 'local' ? `local · ${f.modelo} (${f.protocolo})` : otros ? `${f.selector} · ${f.modelo}` : f.selector
  }
  const orden = { haiku: 0, jev: 1, local: 2 }
  return arr.sort((a, b) => (orden[a.selector] ?? 9) - (orden[b.selector] ?? 9) || a.nombre.localeCompare(b.nombre))
}

// 2. Referencia y respaldo por suite.
function referencia(suite, id) {
  if (suite === 'review') return ref[id] ? { tipo: ref[id].talla, seguro: ref[id].seguro !== false } : null
  const e = etiquetas[id]
  if (!e) return null
  if (suite === 'talla' && !TALLAS.includes(e.tipo)) return null // la referencia de talla es build-large o build-small
  return { tipo: e.tipo, seguro: e.seguro !== false }
}
const respaldo = (suite, c) => (suite === 'tipos' ? 'build-small' : suite === 'talla' ? respaldoTalla(c) : 'review-small')
const ok = r => r.error === null || r.error === undefined

const percentil = (orden, q) => (orden.length ? orden[Math.min(orden.length - 1, Math.floor(q * orden.length))] : null)
const msTxt = v => (v === null ? 'sin dato' : `${Math.round(v)} ms`)
const sobre = (lista, f) => pct(lista.filter(f).length, lista.length)

// 3. Las columnas de una suite para una fila.
function filaSuite(fila, suite) {
  const run = fila.suites[suite]
  if (!run) return null
  const umbral = UMBRAL[fila.selector] ?? 0
  const items = run.resultados.map(r => ({ r, c: casoPorId.get(r.id), refe: referencia(suite, r.id) })).filter(x => x.c && x.refe)
  const buenas = items.filter(x => ok(x.r))
  const acierta = x => x.r.tipo === x.refe.tipo
  // Lo que decide cada columna: la respuesta, o el respaldo si dudó (talla y review) o falló.
  const elige = (x, conTope) => {
    if (!ok(x.r) || (conTope && x.r.ms > tope)) return respaldo(suite, x.c)
    if (suite !== 'tipos' && typeof x.r.confianza === 'number' && x.r.confianza < umbral) return respaldo(suite, x.c)
    return x.r.tipo
  }
  const orden = buenas.map(x => x.r.ms).sort((a, b) => a - b)
  return {
    n: items.length,
    acierta: sobre(buenas, acierta),
    seguros: sobre(buenas.filter(x => x.refe.seguro), acierta),
    // En tipos no hay umbral (sin regla no hay con qué compararlo): igual que acierta.
    conUmbral: suite === 'tipos' ? sobre(buenas, acierta) : sobre(items, x => elige(x, false) === x.refe.tipo),
    conTope: sobre(items, x => elige(x, true) === x.refe.tipo),
    p50: msTxt(percentil(orden, 0.5)), p95: msTxt(percentil(orden, 0.95)), max: msTxt(orden.at(-1) ?? null),
    sobreTope: pct(orden.filter(ms => ms > tope).length, orden.length),
    errores: items.length - buenas.length,
  }
}
function filaReglas(suite) {
  const items = casos.map(c => ({ c, refe: referencia(suite, c.id) })).filter(x => x.refe && (suite !== 'talla' || x.c.regla === 'build') && (suite !== 'review' || ref[x.c.id]))
  const a = x => respaldo(suite, x.c) === x.refe.tipo
  const t = sobre(items, a)
  return { n: items.length, acierta: t, seguros: sobre(items.filter(x => x.refe.seguro), a), conUmbral: t, conTope: t, p50: '0 ms', p95: '0 ms', max: '0 ms', sobreTope: '0.0%', errores: 0 }
}

// 4. Precio por 1.000 pedidos.
function usdPor1000(fila, suite) {
  if (fila.selector === 'local' || fila.selector === 'reglas') return '$0'
  if (fila.selector === 'haiku') {
    const t = fila.suites[suite]?.tokens
    if (!t || t.entrada == null || t.salida == null) return 'sin dato'
    const p = precios.haiku
    return `≈ $${(((t.entrada * p.entradaPorMTok + t.salida * p.salidaPorMTok) / 1e6) * 1000).toFixed(3)}`
  }
  if (fila.selector === 'jev') {
    const lista = suite === 'tipos' ? casos : suite === 'talla' ? casos.filter(c => c.regla === 'build') : casos.filter(c => ref[c.id])
    const etq = suite === 'tipos' ? TIPOS : suite === 'talla' ? TALLAS : TALLAS_REVIEW
    if (!lista.length) return 'sin dato'
    const tokens = lista.reduce((s, c) => s + JSON.stringify(pedidoSystemOne(precios.jev.modelo, c.tarea, preguntaJev(etq))).length / 4, 0) / lista.length
    return `≈ $${(((tokens * precios.jev.entradaPorMTok) / 1e6) * 1000).toFixed(3)} + salida sin dato`
  }
  return 'sin dato'
}

// 5. Calibración: acierto por tramo de confianza.
const TRAMOS = [[0, 0.5], [0.5, 0.7], [0.7, 0.9], [0.9, 1.0001]]
function calibracion(fila, suite) {
  const run = fila.suites[suite]
  if (!run) return null
  const items = run.resultados.filter(ok).map(r => ({ r, refe: referencia(suite, r.id) })).filter(x => x.refe && typeof x.r.confianza === 'number')
  return TRAMOS.map(([a, b]) => {
    const l = items.filter(x => x.r.confianza >= a && x.r.confianza < b)
    return { tramo: `${a}–${b > 1 ? 1 : b}`, n: l.length, acierta: sobre(l, x => x.r.tipo === x.refe.tipo) }
  })
}

// 6. Política completa: los 729 con la política de la fase 6 y las 225 reviews con tallaDeReview.
const pasos = pasosDeReview(casos, etiquetas, ref)
function politica(fila) {
  const esReglas = fila.selector === 'reglas'
  const decideReviews = fila.selector === 'jev' || fila.selector === 'local' // como en producción
  const umbral = UMBRAL[fila.selector] ?? 0
  const mapa = (suite, conTope) => {
    const run = fila.suites[suite]
    if (!run) return null
    return new Map(run.resultados.filter(r => ok(r) && (!conTope || r.ms <= tope)).map(r => [r.id, { tipo: r.tipo, confianza: r.confianza }]))
  }
  const tipos = conTope => {
    const sel = esReglas ? { tipos: null, talla: null } : { tipos: mapa('tipos', conTope), talla: mapa('talla', conTope) }
    const lista = casos.filter(c => etiquetas[c.id]).map(c => ({ bien: politicaTipos(c, clasificarPorReglas(c.descripcion, c.subagentType), sel, umbral, decideReviews) === etiquetas[c.id].tipo, seguro: etiquetas[c.id].seguro !== false }))
    return { todos: sobre(lista, x => x.bien), seguros: sobre(lista.filter(x => x.seguro), x => x.bien) }
  }
  const review = conTope => {
    const m = mapa('review', conTope)
    const clas = id => { const j = m?.get(id); return j?.tipo && TALLAS_REVIEW.includes(j.tipo) && (j.confianza ?? 1) >= umbral ? j.tipo : 'review-small' }
    return sobre(pasos, r => politicaTallaReview(r, clas).tipo === r.ref.talla)
  }
  const [t, tt] = [tipos(false), tipos(true)]
  return {
    tipos: { todos: t.todos, seguros: t.seguros, todosTope: tt.todos, segurosTope: tt.seguros },
    review: { todos: review(false), todosTope: review(true) },
    falta: esReglas ? [] : SUITES.filter(s => !fila.suites[s]),
  }
}

// 7. El Markdown.
const filas = corridas()
const reglas = { selector: 'reglas', nombre: 'reglas', suites: {} }
const tabla = (cab, rows) => [`| ${cab.join(' | ')} |`, `|${cab.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n')
const out = ['# Comparación de selectores', '', `Tope de latencia: ${tope} ms. Umbral: jev 0.7, local ${umbralLocal}, haiku sin umbral (no tiene confianza). Referencia: etiquetas.json (tipos, talla) y etiquetas-review.json (review).`, '']
if (!filas.length) out.push('No hay corridas `-sel-` en bench/corridas/: corré `node bench/selectores.mjs` o `/router bench --suite`. Solo se muestran las reglas.', '')

const CAB = ['selector', 'n', 'acierta', 'seguros', 'con umbral', 'con tope', 'p50', 'p95', 'máx', '> tope', 'errores', 'USD / 1.000']
const COLS = ['n', 'acierta', 'seguros', 'conUmbral', 'conTope', 'p50', 'p95', 'max', 'sobreTope', 'errores']
for (const suite of SUITES) {
  const rg = filaReglas(suite)
  const rows = [['reglas', ...COLS.map(k => String(rg[k])), '$0']]
  for (const f of filas) {
    const s = filaSuite(f, suite)
    rows.push(s ? [f.nombre, ...COLS.map(k => String(s[k])), usdPor1000(f, suite)] : [f.nombre, ...Array(COLS.length + 1).fill('sin dato')])
  }
  const resp = suite === 'tipos' ? 'build-small' : suite === 'talla' ? 'respaldoTalla(caso)' : 'review-small'
  out.push(`## Suite \`${suite}\``, '', `El respaldo de esta suite es ${resp}; la fila reglas lo usa en todos los casos. Los errores no entran en la latencia ni en "acierta", y cuentan como respaldo en "con tope" (y en "con umbral" de talla y review).`, '', tabla(CAB, rows), '')
}

out.push('## Calibración (acierto por tramo de confianza)', '')
for (const f of filas.filter(f => f.selector !== 'haiku')) {
  for (const suite of ['tipos', 'talla']) {
    const c = calibracion(f, suite)
    if (c) out.push(`**${f.nombre} · ${suite}**`, '', tabla(['confianza', 'n', 'acierta'], c.map(x => [x.tramo, x.n, x.acierta])), '')
  }
}

out.push('## Política completa simulada', '', 'Tipos: los 729 con la política de la fase 6 (regla primero; el selector decide reviews, tallas y lo que la regla no cubre). Talla de review: las 225 con alcance, build y clasificador. Con tope, una respuesta con error o más lenta que el tope se trata como si no hubiera respondido.', '')
const filasPol = [reglas, ...filas].map(f => ({ f, p: politica(f) }))
out.push(tabla(['selector', 'tipos (todos)', 'tipos (seguros)', 'tipos con tope (todos)', 'tipos con tope (seguros)', 'talla review', 'talla review con tope'],
  filasPol.map(({ f, p }) => [f.nombre, p.tipos.todos, p.tipos.seguros, p.tipos.todosTope, p.tipos.segurosTope, p.review.todos, p.review.todosTope])), '')
for (const { f, p } of filasPol) if (p.falta.length) out.push(`- ${f.nombre}: sin corrida de ${p.falta.join(', ')}; esa parte de la política cae al respaldo.`)
if (filasPol.some(({ p }) => p.falta.length)) out.push('')

out.push('## Precios', '', `Consultados el ${precios.consultado}.`, '')
for (const k of ['haiku', 'jev', 'local', 'reglas']) out.push(`- **${k}**${precios[k].modelo ? ` (${precios[k].modelo})` : ''}: ${precios[k].fuente}${precios[k].nota ? ' ' + precios[k].nota : ''}`)
out.push('', '`≈` es estimado; `sin dato` es que falta el número.', '')

const dudosas = Object.values(etiquetas).filter(e => e.seguro === false).length
const sinValidar = Object.values(ref).filter(e => e.seguro === false).length
out.push('## Advertencias', '', `- ${dudosas} etiquetas de tipo son dudosas (seguro: false); las columnas "seguros" las excluyen.`, `- ${sinValidar} etiquetas de talla de review no están validadas.`, '- 192 reviews con build aciertan por construcción (la talla sale del build, no del selector).')
for (const f of filas.filter(f => f.selector === 'local')) out.push(`- Experimental: ${f.nombre} medido en ${f.hardware ?? 'hardware sin dato'}, umbral sin calibrar.`)
if (filas.some(f => f.selector === 'haiku')) out.push('- La latencia de Haiku está medida dentro de Claude Code.')
out.push('')

const texto = out.join('\n')
console.log(texto)
const d = new Date()
const dos = n => String(n).padStart(2, '0')
const base = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}-informe-selectores`
fs.mkdirSync(dir, { recursive: true })
// Nunca pisa un informe anterior: el primer nombre libre (-2, -3…), con creación exclusiva.
let destino
for (let n = 1; ; n++) {
  destino = path.join(dir, n === 1 ? base + '.md' : base + '-' + n + '.md')
  try { fs.writeFileSync(destino, texto, { flag: 'wx' }); break } catch (e) { if (e.code !== 'EEXIST') throw e }
}
console.log(`Informe guardado en ${path.relative(process.cwd(), destino)}`)
