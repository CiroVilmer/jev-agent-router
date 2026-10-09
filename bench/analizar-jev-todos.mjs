// Analiza una corrida de jev-todos.mjs contra etiquetas.json: ¿puede Jev decidir el tipo de todos
// los subagentes, o al menos de las reviews y los builds, sin perder contra las reglas?
//   node bench/analizar-jev-todos.mjs [bench/corridas/<archivo>-jev-todos.json]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clasificarPorReglas } from '../router/src/reglas.ts'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(aqui, 'corridas')
const archivo = process.argv[2] ?? path.join(dir, fs.readdirSync(dir).filter(f => f.endsWith('-jev-todos.json')).sort().at(-1))
const { resultados } = JSON.parse(fs.readFileSync(archivo, 'utf8'))
const { casos } = JSON.parse(fs.readFileSync(path.join(aqui, 'casos.json'), 'utf8'))
const etiquetas = JSON.parse(fs.readFileSync(path.join(aqui, 'etiquetas.json'), 'utf8'))
// La corrida del pipeline actual: Jev con las etiquetas de producción (talla o 9) y umbral 0.
const actual = JSON.parse(fs.readFileSync(path.join(dir, '2026-10-07-1032-banco.json'), 'utf8'))
const jevActual = new Map((actual.resultados ?? actual).filter(r => r.fuente === 'jev').map(r => [r.id, r]))

// La corrida de talla con los textos nuevos (fase 6), para la fila "fase 6".
const tallaNueva = new Map(JSON.parse(fs.readFileSync(path.join(dir, '2026-10-09-1347-jev-talla-nueva.json'), 'utf8')).resultados.map(r => [r.id, r]))

const TALLAS = ['build-large', 'build-small']
const UMBRAL = 0.7
const porId = new Map(resultados.map(r => [r.id, r]))
const respaldoTalla = c => (c.resumen.chars > 5000 || (c.resumen.chars > 3000 && c.resumen.archivos >= 10) ? 'build-large' : 'build-small')
const respaldoAnterior = c => (c.resumen.chars > 5000 || c.resumen.archivos > 6 ? 'build-large' : 'build-small')
const pct = (a, n) => (n ? `${((100 * a) / n).toFixed(1)}%` : '—')

// El pipeline de la fase 5 (con el respaldo de talla que se le pasa): regla si no es build; build → Jev talla con umbral (si no, respaldo);
// sin regla → Jev sin umbral (si falta, build-small).
function pipelineActual(c, regla, respaldo = respaldoTalla) {
  if (regla && regla.tipo !== 'build') return regla.tipo
  const j = jevActual.get(c.id)
  if (regla) return j?.tipo && TALLAS.includes(j.tipo) && j.confianza >= UMBRAL ? j.tipo : respaldo(c)
  return j?.tipo ?? 'build-small'
}

// Jev decide; con confianza < u decide la regla (build → talla del respaldo); sin regla, Jev igual.
function jevPrimero(c, regla, u) {
  const j = porId.get(c.id)
  if (j?.tipo && (j.confianza >= u || !regla)) return j.tipo
  if (!regla) return 'build-small'
  return regla.tipo === 'build' ? respaldoTalla(c) : regla.tipo
}

// Híbrido: Jev (9 etiquetas) decide todo lo que toque la familia review (por su elección o por la
// regla), con umbral; los builds siguen con la talla de Jev (2 etiquetas); fix, explore, research y
// write, por reglas.
const REVIEWS = ['review-final', 'review', 're-review']
function hibrido(c, regla, u) {
  const j = porId.get(c.id)
  const tocaReview = (j?.tipo && REVIEWS.includes(j.tipo) && j.confianza >= u) || (regla && REVIEWS.includes(regla.tipo))
  if (!tocaReview) return pipelineActual(c, regla)
  if (j?.tipo && j.confianza >= u) return j.tipo
  return regla && regla.tipo !== 'build' ? regla.tipo : pipelineActual(c, regla)
}

// Fase 6: regla de review por description → Jev (9 etiquetas) decide si confianza ≥ u, si no la regla;
// builds → talla nueva con umbral u (si no, respaldo nuevo); regla de subagentType y el resto, como hoy.
function fase6(c, regla, u) {
  if (regla && REVIEWS.includes(regla.tipo) && !regla.regla.startsWith('subagentType')) {
    const j = porId.get(c.id)
    return j?.tipo && j.confianza >= u ? j.tipo : regla.tipo
  }
  if (regla && regla.tipo === 'build') {
    const t = tallaNueva.get(c.id)
    return t?.tipo && TALLAS.includes(t.tipo) && t.confianza >= u ? t.tipo : respaldoTalla(c)
  }
  return pipelineActual(c, regla)
}

const lineas = []
const log = s => lineas.push(s)
for (const [titulo, filtro] of [['Todos los casos', () => true], ['Solo etiquetas seguras', c => etiquetas[c.id]?.seguro]]) {
  const cs = casos.filter(c => porId.get(c.id) && etiquetas[c.id] && filtro(c))
  const ref = c => etiquetas[c.id].tipo
  const jev = c => porId.get(c.id).tipo
  log(`\n## ${titulo} (${cs.length})\n`)

  log('### Jev solo, por tipo de referencia\n')
  log('| referencia | n | Jev acierta | confusiones más comunes |\n|---|---|---|---|')
  const tipos = [...new Set(cs.map(ref))]
  for (const t of tipos.sort()) {
    const g = cs.filter(c => ref(c) === t)
    const ok = g.filter(c => jev(c) === t).length
    const conf = Object.entries(Object.groupBy(g.filter(c => jev(c) !== t), jev)).sort((a, b) => b[1].length - a[1].length).slice(0, 3).map(([k, v]) => `${k} ${v.length}`).join(', ')
    log(`| ${t} | ${g.length} | ${pct(ok, g.length)} | ${conf} |`)
  }
  log(`| **total** | ${cs.length} | **${pct(cs.filter(c => jev(c) === ref(c)).length, cs.length)}** | |`)

  const conRegla = cs.filter(c => { const r = clasificarPorReglas(c.descripcion, c.subagentType); return r && r.tipo !== 'build' })
  const okR = conRegla.filter(c => clasificarPorReglas(c.descripcion, c.subagentType).tipo === ref(c)).length
  const okJ = conRegla.filter(c => jev(c) === ref(c)).length
  log(`\n### Donde hoy deciden las reglas (${conRegla.length} casos)\n`)
  log(`Reglas ${pct(okR, conRegla.length)} · Jev solo ${pct(okJ, conRegla.length)}`)
  const desacuerdo = conRegla.filter(c => jev(c) !== clasificarPorReglas(c.descripcion, c.subagentType).tipo)
  const ganaJev = desacuerdo.filter(c => jev(c) === ref(c)).length
  const ganaRegla = desacuerdo.filter(c => clasificarPorReglas(c.descripcion, c.subagentType).tipo === ref(c)).length
  log(`Desacuerdos: ${desacuerdo.length} · tiene razón Jev ${ganaJev} · tiene razón la regla ${ganaRegla} · ninguno ${desacuerdo.length - ganaJev - ganaRegla}`)
  const altos = desacuerdo.filter(c => porId.get(c.id).confianza >= 0.9)
  log(`Desacuerdos con Jev ≥ 0.9: ${altos.length} · tiene razón Jev ${altos.filter(c => jev(c) === ref(c)).length}`)

  log('\n### Calibración de Jev (todos los casos)\n')
  log('| confianza | n | acierta |\n|---|---|---|')
  for (const [a, b] of [[0, 0.5], [0.5, 0.7], [0.7, 0.9], [0.9, 1.01]]) {
    const g = cs.filter(c => porId.get(c.id).confianza >= a && porId.get(c.id).confianza < b)
    log(`| ${a}–${b === 1.01 ? 1 : b} | ${g.length} | ${pct(g.filter(c => jev(c) === ref(c)).length, g.length)} |`)
  }

  log('\n### Política: Jev decide y, si duda, decide la regla\n')
  const familias = { reviews: ['review-final', 'review', 're-review'], builds: TALLAS, fix: ['fix'] }
  log(`| variante | total | ${Object.keys(familias).join(' | ')} |\n|---|---|${Object.keys(familias).map(() => '---').join('|')}|`)
  const fila = (nombre, f) => {
    const acierta = g => pct(g.filter(c => f(c, clasificarPorReglas(c.descripcion, c.subagentType)) === ref(c)).length, g.length)
    log(`| ${nombre} | ${acierta(cs)} | ${Object.values(familias).map(ts => acierta(cs.filter(c => ts.includes(ref(c))))).join(' | ')} |`)
  }
  fila('fase 5 tal como corría (respaldo anterior)', (c, r) => pipelineActual(c, r, respaldoAnterior))
  fila('fase 5 con el respaldo nuevo', pipelineActual)
  fila('fase 5 con el respaldo nuevo, sin Jev en talla ni reviews', (c, r) => (r && r.tipo === 'build' ? respaldoTalla(c) : pipelineActual(c, r)))
  for (const u of [0, 0.5, 0.7, 0.8, 0.9, 0.95]) fila(`Jev primero, umbral ${u}`, (c, r) => jevPrimero(c, r, u))
  fila('fase 6: Jev decide reviews + talla nueva', (c, r) => fase6(c, r, UMBRAL))
  for (const u of [0.7, 0.8, 0.9]) fila(`híbrido: Jev en reviews + talla, umbral ${u}`, (c, r) => hibrido(c, r, u))
}
const errores = resultados.filter(r => r.error).length
const ms = resultados.filter(r => !r.error).map(r => r.ms).sort((a, b) => a - b)
log(`\nLatencia Jev: p50 ${ms[Math.floor(ms.length / 2)]} ms · p95 ${ms[Math.floor(ms.length * 0.95)]} ms · errores ${errores}`)
const md = `# Jev sobre todos los casos · ${path.basename(archivo)}\n` + lineas.join('\n') + '\n'
fs.writeFileSync(archivo.replace(/\.json$/, '-analisis.md'), md)
console.log(md)
