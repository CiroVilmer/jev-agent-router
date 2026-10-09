import type { Subagente } from '../types'

/**
 * Se suma a la descripción de la tool Agent: ahí lo lee Claude justo cuando escribe la
 * `description`. Constante a propósito: el host cachea tool.describe por sesión y un texto que
 * cambia gasta el caché del prompt.
 */
export const CONVENCION_AGENT =
  'Router de subagentes activo. El router elige el modelo y el esfuerzo de cada subagente: omití ' +
  '`model` (se ignora salvo que la description tenga `[pin]`), aunque te hayan pedido un modelo. ' +
  'Empezá `description` con el verbo del tipo de tarea: Implement (construir o editar), Review ' +
  '(verificar o revisar sin editar), Re-review (revisar de nuevo tras un arreglo), Fix (arreglar ' +
  'hallazgos), Explore (leer o mapear código), Research (investigar afuera), Write (redactar ' +
  'notas o docs). Si es parte de un plan, nombrá la unidad como `Task N` y repetí el mismo número ' +
  'en su build, review y fix. Ejemplos: "Implement Task 3: kubernetes", "Review Task 3: ' +
  'kubernetes".'

/** La description no dijo el tipo: ninguna regla la reconoció y decidió un clasificador. */
export function sinReglaDeDescription(motivos: readonly string[]): boolean {
  return motivos.includes('ninguna regla')
}

/** La línea que ve Claude en el resultado de Agent cuando no siguió la convención. */
export function avisoConvencion(s: Subagente): string | null {
  if (s.escalon === null || s.tipo === null || !sinReglaDeDescription(s.motivos)) return null
  const d = s.descripcion.length > 60 ? `${s.descripcion.slice(0, 59)}…` : s.descripcion
  return (
    `router: no reconocí el tipo de "${d}" y lo clasifiqué como ${s.tipo}. Empezá la description ` +
    'con el verbo del tipo (Implement, Review, Re-review, Fix, Explore, Research, Write) y usá `Task N`.'
  )
}
