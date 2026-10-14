import type { Clasificador } from './clasificadores'
import { TALLAS_REVIEW } from './clasificadores'
import { tareaDe } from './registro'
import { resumir } from './resumen'

const ALCANCE_AMPLIO = /\b(bloque|block|feature|fase|phase|integraci[oó]n|integration|rama|branch|merge)\b/i
// El segundo número no puede seguir con dígitos, letra ni decimal: "Task 3 - 2nd" y "Task 3 to 2.0" no son rangos.
const FIN = '(?!\\d|[a-z]|\\.\\d)'
// Una tarea numerada (la misma forma que lee tareaDe): con ella, las palabras sueltas no cuentan.
const TAREA_NUMERADA = /\b(?:task|tarea)s?\s+\d+[a-z]?|\bT\d+[a-z]?\b/i
const RANGOS = [
  new RegExp(`\\b(?:tasks?|tareas?)\\s+(\\d+)[a-z]?\\s*(?:-|–|a|to|y|and|,)\\s*(\\d+)${FIN}`, 'i'),
  new RegExp(`\\bT(\\d+)\\s*-\\s*T?(\\d+)${FIN}`, 'i'),
]

/** El texto de la description que nombra varias tareas (el segundo número mayor que el primero), o null. */
export function rangoDeTareas(descripcion: string): string | null {
  for (const re of RANGOS) {
    const m = re.exec(descripcion)
    if (m && Number(m[2]) > Number(m[1])) return m[0]
  }
  return null
}

/** La palabra de la description que nombra un alcance amplio (un bloque, una fase), o null. */
export function palabraDeAlcance(descripcion: string): string | null {
  return ALCANCE_AMPLIO.exec(descripcion)?.[0] ?? null
}

/** Lo que la description dice del alcance: un rango de tareas o una palabra de alcance, o null. */
export function alcanceDeReview(descripcion: string): string | null {
  return rangoDeTareas(descripcion) ?? palabraDeAlcance(descripcion)
}

type EntradaTalla = {
  descripcion: string
  prompt: string
  tallaBuildDeTarea?: 'build-large' | 'build-small' | null
}

/**
 * La talla de una review, en este orden: un rango de tareas; el build de la tarea, si hay; las palabras de
 * alcance, salvo que nombre una tarea numerada; el clasificador.
 */
export async function tallaDeReview(
  e: EntradaTalla,
  clasificar: Clasificador,
): Promise<{ tipo: 'review-large' | 'review-small'; motivo: string }> {
  const rango = rangoDeTareas(e.descripcion)
  if (rango !== null) return { tipo: 'review-large', motivo: `talla por alcance (${rango})` }
  if (e.tallaBuildDeTarea) {
    const tipo = e.tallaBuildDeTarea === 'build-large' ? 'review-large' : 'review-small'
    return { tipo, motivo: `talla del build de ${tareaDe(e.descripcion) ?? 'la tarea'} (${e.tallaBuildDeTarea})` }
  }
  if (!TAREA_NUMERADA.test(e.descripcion)) {
    const palabra = palabraDeAlcance(e.descripcion)
    if (palabra !== null) return { tipo: 'review-large', motivo: `talla por alcance (${palabra})` }
  }
  const cl = await clasificar({ descripcion: e.descripcion, resumen: resumir(e.prompt), etiquetas: TALLAS_REVIEW })
  const detalle = cl.detalle ? ` (${cl.detalle})` : ''
  const confianza = cl.confianza === undefined ? '' : ` (${cl.confianza.toFixed(2)})`
  const valido = TALLAS_REVIEW.includes(cl.tipo)
  const tipo = cl.tipo === 'review-large' ? 'review-large' : 'review-small'
  return { tipo, motivo: `${cl.fuente}${detalle} → ${cl.tipo}${confianza}${valido ? '' : ': queda review-small'}` }
}
