// Las simulaciones de la política de ruteo, en una sola copia: las usan analizar-jev-todos.mjs,
// review-talla.mjs y el reporte de selectores.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tareaDe } from '../../router/src/registro.ts'

export const TALLAS = ['build-large', 'build-small']
export const TALLAS_REVIEW = ['review-large', 'review-small']
export const REVIEWS = ['review-final', 'review', 're-review']
export const respaldoTalla = c => (c.resumen.chars > 5000 || (c.resumen.chars > 3000 && c.resumen.archivos >= 10) ? 'build-large' : 'build-small')
export const respaldoAnterior = c => (c.resumen.chars > 5000 || c.resumen.archivos > 6 ? 'build-large' : 'build-small')

// Copiados de router/src/tallaReview.ts (ese archivo importa valores sin extensión y Node no lo
// puede importar desde bench/). Si cambian allá, cambialos acá.
export const ALCANCE_AMPLIO = /\b(bloque|block|feature|fase|phase|integraci[oó]n|integration|rama|branch|merge)\b/i
const FIN = '(?!\\d|[a-z]|\\.\\d)'
export const TAREA_NUMERADA = /\b(?:task|tarea)s?\s+\d+[a-z]?|\bT\d+[a-z]?\b/i
const RANGOS_TXT = [
  String.raw`\b(?:tasks?|tareas?)\s+(\d+)[a-z]?\s*(?:-|–|a|to|y|and|,)\s*(\d+)`,
  String.raw`\bT(\d+)\s*-\s*T?(\d+)`,
]
const RANGOS = RANGOS_TXT.map(t => new RegExp(t + FIN, 'i'))

// Avisa si lo copiado dejó de coincidir con router/src/tallaReview.ts (leído como texto, sin importarlo).
export function avisarSiDiverge() {
  const fuente = fs.readFileSync(fileURLToPath(new URL('../../router/src/tallaReview.ts', import.meta.url)), 'utf8')
  const doble = t => t.replace(/\\/g, '\\\\') // en el .ts están dentro de un string, con la barra duplicada
  const esperados = {
    ALCANCE_AMPLIO: `/${ALCANCE_AMPLIO.source}/i`,
    TAREA_NUMERADA: `/${TAREA_NUMERADA.source}/i`,
    FIN: `'${doble(FIN)}'`,
    'RANGOS[0]': '`' + doble(RANGOS_TXT[0]) + '${FIN}`',
    'RANGOS[1]': '`' + doble(RANGOS_TXT[1]) + '${FIN}`',
  }
  for (const [nombre, texto] of Object.entries(esperados)) {
    if (!fuente.includes(texto)) console.warn(`AVISO: ${nombre} cambió en router/src/tallaReview.ts; actualizá la copia en bench/lib/politica.mjs.`)
  }
}

export function rangoDeTareas(d) {
  for (const re of RANGOS) {
    const m = re.exec(d)
    if (m && Number(m[2]) > Number(m[1])) return m[0]
  }
  return null
}

/**
 * La talla del build del mismo proyecto y la misma tareaDe, como tallaBuildDe del router: el más cercano
 * anterior a la review. El router en vivo solo ve los subagentes que ya corrieron, así que no mira hacia adelante.
 */
export function tallaBuildDe(casos, etiquetas, i) {
  const c = casos[i]
  const t = tareaDe(c.descripcion)
  if (!t) return null
  const es = b => b.proyecto === c.proyecto && /^build-/.test(etiquetas[b.id]?.tipo ?? '') && tareaDe(b.descripcion) === t
  for (let j = i - 1; j >= 0; j--) if (es(casos[j])) return etiquetas[casos[j].id].tipo
  return null
}

// Los pasos de cada review con etiqueta de talla: su alcance (rango o palabra) y la talla del build de su tarea.
export function pasosDeReview(casos, etiquetas, ref) {
  return casos
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => ref[c.id])
    .map(({ c, i }) => {
      const d = c.descripcion
      const rango = rangoDeTareas(d)
      const palabra = TAREA_NUMERADA.test(d) ? null : ALCANCE_AMPLIO.exec(d)?.[0] ?? null
      const build = tallaBuildDe(casos, etiquetas, i)
      return { c, i, ref: ref[c.id], rango, palabra, build: build ? build.replace('build-', 'review-') : null }
    })
}

// La política de tallaDeReview: rango → build → palabra (sin tarea numerada) → clasificador.
export function politicaTallaReview(r, clasificador) {
  if (r.rango) return { tipo: 'review-large', paso: 'alcance' }
  if (r.build) return { tipo: r.build, paso: 'build' }
  if (r.palabra) return { tipo: 'review-large', paso: 'alcance' }
  return { tipo: clasificador(r.c.id), paso: 'clasificador' }
}

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
