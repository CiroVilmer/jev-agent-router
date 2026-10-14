import type { Tipo } from '../types'
import type { Clasificador } from './clasificadores'
import { TALLAS_REVIEW } from './clasificadores'
import { resumir } from './resumen'

const ALCANCE_AMPLIO = /\b(bloque|block|feature|fase|phase|integraci[oó]n|integration|rama|branch|merge)\b/i
const VARIAS_TAREAS = /\b(?:tasks?|tareas?)\s+\d+[a-z]?\s*(?:-|–|a|to|y|and|,)\s*\d+/i
const RANGO_T = /\bT\d+\s*-\s*T?\d+/i

/** La palabra de la description que nombra un alcance amplio (un bloque, una fase, varias tareas), o null. */
export function alcanceDeReview(descripcion: string): string | null {
  for (const re of [ALCANCE_AMPLIO, VARIAS_TAREAS, RANGO_T]) {
    const m = re.exec(descripcion)
    if (m) return m[0]
  }
  return null
}

type EntradaTalla = {
  descripcion: string
  prompt: string
  tallaBuildDeTarea?: 'build-large' | 'build-small' | null
}

/** La talla de una review: el alcance que nombra la description, el build de la misma tarea o el clasificador. */
export async function tallaDeReview(
  e: EntradaTalla,
  clasificar: Clasificador,
): Promise<{ tipo: 'review-large' | 'review-small'; motivo: string }> {
  const alcance = alcanceDeReview(e.descripcion)
  if (alcance !== null) return { tipo: 'review-large', motivo: `talla por alcance (${alcance})` }
  if (e.tallaBuildDeTarea) {
    const tipo = e.tallaBuildDeTarea === 'build-large' ? 'review-large' : 'review-small'
    const tarea = /\b(?:tasks?|tareas?)\s+\d+[a-z]?/i.exec(e.descripcion)?.[0] ?? 'la tarea'
    return { tipo, motivo: `talla del build de ${tarea} (${e.tallaBuildDeTarea})` }
  }
  const cl = await clasificar({ descripcion: e.descripcion, resumen: resumir(e.prompt), etiquetas: TALLAS_REVIEW })
  const tipo: Tipo = cl.tipo === 'review-large' ? 'review-large' : 'review-small'
  const detalle = cl.detalle ? ` (${cl.detalle})` : ''
  const confianza = cl.confianza === undefined ? '' : ` (${cl.confianza.toFixed(2)})`
  return { tipo: tipo as 'review-large' | 'review-small', motivo: `${cl.fuente}${detalle} → ${cl.tipo}${confianza}` }
}
