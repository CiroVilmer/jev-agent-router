// Compara una corrida del banco contra las etiquetas de referencia.
//   node bench/comparar.mjs [bench/corridas/<archivo>-banco.json] [--tope <ms>]
// Sin archivo toma la corrida más nueva de bench/corridas/. Escribe al lado <archivo>-comparacion.md.
// --tope simula el topeMs de producción (1000 por defecto) para las columnas "con tope".
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(aqui, 'corridas')
// Los nombres son <AAAA-MM-DD>-<HHMM>-banco.json (hora local) y ordenan bien como texto. Uno sin
// hora (formato viejo) cuenta como 0000 de ese día.
const clave = f => f.replace(/^(\d{4}-\d{2}-\d{2})-banco\.json$/, '$1-0000-banco.json')
const ultima = () => {
  const corridas = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('-banco.json')).sort((a, b) => clave(a).localeCompare(clave(b)))
    : []
  if (!corridas.length) {
    console.error('No hay corridas en bench/corridas/. Corré /router banco primero.')
    process.exit(1)
  }
  return path.join(dir, corridas.at(-1))
}

const args = process.argv.slice(2)
const iTope = args.indexOf('--tope')
const topeMs = iTope === -1 ? 1000 : Number(args[iTope + 1])
if (!Number.isFinite(topeMs) || topeMs <= 0) {
  console.error('--tope pide un número de ms mayor que 0.')
  process.exit(1)
}
const posicionales = iTope === -1 ? args : args.filter((_, i) => i !== iTope && i !== iTope + 1)
const ruta = path.resolve(posicionales[0] ?? ultima())
const corrida = JSON.parse(fs.readFileSync(ruta, 'utf8'))
const etiquetas = JSON.parse(fs.readFileSync(path.join(aqui, 'etiquetas.json'), 'utf8'))
const { casos } = JSON.parse(fs.readFileSync(path.join(aqui, 'casos.json'), 'utf8'))
const porId = new Map(casos.map(c => [c.id, c]))

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '—')
const perc = (xs, q) => {
  if (!xs.length) return '—'
  const s = [...xs].sort((a, b) => a - b)
  return String(s[Math.min(s.length - 1, Math.floor(q * s.length))])
}
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
const referencia = id => etiquetas[id]?.tipo
// Ganable: la etiqueta de referencia está entre las que se le ofrecen al clasificador. Si no
// (un build cuya referencia es fix), ningún clasificador puede acertar: va aparte.
const ganable = id => (porId.get(id)?.etiquetasProduccion ?? []).includes(referencia(id))
const esBuild = id => porId.get(id)?.regla === 'build'
const sinRegla = id => porId.get(id)?.regla === null

// El respaldo de producción (router/src/clasificadores/index.ts y router/src/resumen.ts): si solo
// se ofrecen las dos tallas, por tamaño (chars > 5000, o chars > 3000 con archivos >= 10); si no, build-small.
const talla = (c, f) => (f(c.resumen) ? 'build-large' : 'build-small')
const tallaActual = r => r.chars > 5000 || (r.chars > 3000 && r.archivos >= 10)
const tallaAnterior = r => r.chars > 5000 || r.archivos > 6
const soloTallas = c => {
  const e = c.etiquetasProduccion ?? []
  return e.length === 2 && e.includes('build-large') && e.includes('build-small')
}
const tipoRespaldo = id => {
  const c = porId.get(id)
  return soloTallas(c) ? talla(c, tallaActual) : 'build-small'
}

const filas = []
const linea = s => { filas.push(s); console.log(s) }

linea(`# Banco del clasificador · ${corrida.fecha}\n`)

// 1. Las reglas contra la referencia (cuánto resuelven sin modelo, y con qué precisión).
const conRegla = casos.filter(c => c.regla && c.regla !== 'build')
const reglaOk = conRegla.filter(c => referencia(c.id) === c.regla).length
linea(`**Reglas:** resuelven solas ${conRegla.length} de ${casos.length} casos (${pct(conRegla.length, casos.length)}), con ${pct(reglaOk, conRegla.length)} de acierto contra la referencia.\n`)

// 2. El respaldo sin modelo y cada clasificador, sobre los mismos casos ganables de producción.
const idsCorrida = [...new Set(corrida.resultados.map(r => r.id))]
const imposibles = idsCorrida.filter(id => !ganable(id))
const ganables = idsCorrida.filter(ganable)
const nSinRegla = ganables.filter(sinRegla).length
const nBuilds = ganables.filter(esBuild).length
linea(
  `Sobre los mismos ${ganables.length} casos ganables de producción: ${plural(nSinRegla, 'caso', 'casos')} sin regla ` +
    `(se ofrecen los 9 tipos) y ${plural(nBuilds, 'build', 'builds')} (se ofrecen las dos tallas). *Con tope* simula ` +
    `producción con \`topeMs\` = ${topeMs} ms: si la llamada tardó más o falló, decide el respaldo. Errores y ` +
    `latencias cuentan las mismas llamadas que el resto de la fila.\n`,
)
linea('| Clasificador | casos | acierta | acierta con tope | sin regla | sin regla con tope | builds | builds con tope | solo seguros | errores | p50 ms | p95 ms |')
linea('|---|---|---|---|---|---|---|---|---|---|---|---|')
// Cada fila recibe respuestas { id, tipo, tipoConTope, ms, error } sobre casos ganables.
const fila = (nombre, rs, conLatencia) => {
  const ok = (sub, campo) => pct(sub.filter(r => r[campo] != null && r[campo] === referencia(r.id)).length, sub.length)
  const sr = rs.filter(r => sinRegla(r.id))
  const bs = rs.filter(r => esBuild(r.id))
  const seguros = rs.filter(r => etiquetas[r.id]?.seguro)
  const ms = rs.filter(r => !r.error).map(r => r.ms)
  const [p50, p95] = conLatencia ? [perc(ms, 0.5), perc(ms, 0.95)] : ['—', '—']
  linea(
    `| ${nombre} | ${rs.length} | ${ok(rs, 'tipo')} | ${ok(rs, 'tipoConTope')} | ${ok(sr, 'tipo')} | ${ok(sr, 'tipoConTope')} | ` +
      `${ok(bs, 'tipo')} | ${ok(bs, 'tipoConTope')} | ${ok(seguros, 'tipo')} | ${rs.filter(r => r.error).length} | ${p50} | ${p95} |`,
  )
}
fila(
  'Respaldo (sin modelo)',
  ganables.map(id => ({ id, tipo: tipoRespaldo(id), tipoConTope: tipoRespaldo(id), ms: 0, error: null })),
  false,
)
for (const fuente of ['haiku', 'jev']) {
  const rs = corrida.resultados.filter(r => r.fuente === fuente && ganable(r.id))
  if (!rs.length) continue
  fila(fuente, rs.map(r => ({ ...r, tipoConTope: r.error || r.ms > topeMs ? tipoRespaldo(r.id) : r.tipo })), true)
}
linea(`\n**Imposibles de acertar** (la referencia no está entre las etiquetas ofrecidas; fuera de la tabla): ${plural(imposibles.length, 'caso', 'casos')}.`)

// 3. Calibración de Jev: acierto por tramo de confianza (sirve para elegir jevUmbral).
const acierta = r => r.tipo !== null && r.tipo === referencia(r.id)
const jev = corrida.resultados.filter(r => r.fuente === 'jev' && r.confianza !== null && ganable(r.id))
if (jev.length) {
  linea('\n**Calibración de Jev** (acierto por tramo de confianza):\n')
  linea('| confianza | n | acierta |')
  linea('|---|---|---|')
  for (const [a, b] of [[0, 0.5], [0.5, 0.7], [0.7, 0.9], [0.9, 1.01]]) {
    const t = jev.filter(r => r.confianza >= a && r.confianza < b)
    if (t.length) linea(`| [${a}, ${Math.min(b, 1)}) | ${t.length} | ${pct(t.filter(acierta).length, t.length)} |`)
  }
}

// 3b. Barrido del umbral de Jev: sin umbral, en todos los casos y solo en la talla de los builds.
//     Con duda (confianza < umbral) decide el respaldo de producción; sin duda, Jev.
const UMBRAL = 0.7
if (jev.length) {
  linea(`\n**Umbral de Jev** (${UMBRAL}): acierto sobre los mismos ${jev.length} casos con confianza:\n`)
  linea('| variante | casos | acierta | sin regla | builds |')
  linea('|---|---|---|---|---|')
  const barrido = (nombre, decide) => {
    const ok = sub => pct(sub.filter(r => decide(r) === referencia(r.id)).length, sub.length)
    linea(`| ${nombre} | ${jev.length} | ${ok(jev)} | ${ok(jev.filter(r => sinRegla(r.id)))} | ${ok(jev.filter(r => esBuild(r.id)))} |`)
  }
  const duda = r => r.confianza < UMBRAL
  barrido('sin umbral', r => r.tipo)
  barrido(`umbral ${UMBRAL} en todo`, r => (duda(r) ? tipoRespaldo(r.id) : r.tipo))
  barrido(`umbral ${UMBRAL} solo en la talla`, r => (duda(r) && soloTallas(porId.get(r.id)) ? tipoRespaldo(r.id) : r.tipo))
}

// 4. Tres variantes del respaldo sobre los builds ganables de casos.json: la de producción (largo o
//    archivos nombrados), la anterior y solo por largo.
const builds = casos.filter(c => c.regla === 'build' && ganable(c.id))
const okCon = f => builds.filter(c => talla(c, f) === referencia(c.id)).length
linea(
  `\n**Variantes del respaldo** en los ${builds.length} builds ganables de casos.json: actual (chars > 5000, o ` +
    `chars > 3000 y archivos >= 10) ${pct(okCon(tallaActual), builds.length)} · anterior (chars > 5000 o ` +
    `archivos > 6) ${pct(okCon(tallaAnterior), builds.length)} · solo por largo (chars > 5000) ` +
    `${pct(okCon(r => r.chars > 5000), builds.length)}.`,
)

const salida = ruta.replace(/-banco\.json$/, '-comparacion.md')
fs.writeFileSync(salida === ruta ? `${ruta}-comparacion.md` : salida, filas.join('\n') + '\n')
