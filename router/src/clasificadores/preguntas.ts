import type { Tipo } from '../../types'

/** Un lugar para revisar y editar cómo se describe cada tipo. Lo usan Haiku y Jev por igual. */
export const DESCRIPCION: Record<Tipo, string> = {
  'review-final': 'Revisión final de toda una rama o de todo el trabajo, antes de mergear.',
  review: 'Revisar el trabajo de una tarea: que cumpla el spec y tenga buena calidad.',
  'review-large': 'Revisar un bloque, una feature, una fase, una integración o varias tareas, o un cambio grande con muchos archivos.',
  'review-small': 'Revisar una tarea o un cambio acotado.',
  're-review': 'Volver a revisar solo los arreglos de una revisión anterior.',
  'build-large': 'Implementar algo grande: varios archivos, integración, diseño o mucha lógica nueva. Suele traer un prompt de más de ~5k caracteres.',
  'build-small': 'Implementar algo chico o mediano y acotado: un cambio mecánico o una pieza bien delimitada. Suele traer un prompt de hasta ~5k caracteres.',
  fix: 'Arreglar hallazgos de una revisión o un bug puntual.',
  explore: 'Explorar o mapear código existente sin cambiarlo.',
  research: 'Investigar en la web o en documentación y resumir lo encontrado.',
  write: 'Redactar documentación, notas, bitácoras o resúmenes.',
}

export const PREGUNTA = 'Un orquestador va a lanzar un subagente con esta tarea. ¿Qué tipo de tarea es?'

export const COMO_DECIDIR: readonly string[] = [
  'Elegí por lo que el subagente tiene que hacer, no por palabras sueltas.',
  'Para separar un build grande de uno chico, mirá el largo del prompt, cuántos archivos nombra y cuántos pasos tiene.',
  'El conteo de archivos del resumen cuenta los archivos que el prompt nombra (spec, plan, contexto), no los que la tarea toca: no alcanza solo para decidir la talla.',
]

/**
 * Solo para la pregunta de talla. Los cortes salen del banco (2026-10-09): en las etiquetas
 * seguras, más de ~5k caracteres, o ~3k a ~5k con 10 archivos o más, es grande en el 99%. En la
 * pregunta de 9 etiquetas empeoran las reviews (Jev manda reviews largas a build-large): ahí no.
 */
export const DESCRIPCION_TALLA: Record<'build-large' | 'build-small', string> = {
  'build-large': 'Implementar algo grande: integración entre varias piezas, diseño o mucha lógica nueva. Por el resumen: un prompt de más de ~5k caracteres, o uno de ~3k a ~5k que nombra 10 archivos o más.',
  'build-small': 'Implementar algo chico o mediano y acotado: un cambio mecánico o una pieza bien delimitada. Por el resumen: un prompt de hasta ~3k caracteres, o uno de ~3k a ~5k que nombra menos de 10 archivos.',
}

export const COMO_DECIDIR_TALLA: readonly string[] = [
  'Elegí por lo que el subagente tiene que hacer, no por palabras sueltas.',
  'Para separar un build grande de uno chico, mirá primero el largo del prompt y después los archivos: más de ~5k caracteres es grande; hasta ~3k es chico; entre ~3k y ~5k decide el conteo de archivos (10 o más es grande, menos de 10 es chico).',
  'El conteo de archivos del resumen cuenta los archivos que el prompt nombra (spec, plan, contexto), no los que la tarea toca: solo alcanza para decidir la talla en el tramo de ~3k a ~5k caracteres.',
  'Los pasos y si menciona un spec no separan bien la talla: casi todos los builds de un plan mencionan el spec.',
]

// Sin importar valores de otros módulos: bench/ importa este archivo directo desde Node.
const esTalla = (etiquetas: readonly Tipo[]) =>
  etiquetas.length === 2 && etiquetas.includes('build-large') && etiquetas.includes('build-small')
const descripcion = (etiquetas: readonly Tipo[], t: Tipo) =>
  esTalla(etiquetas) ? DESCRIPCION_TALLA[t as 'build-large' | 'build-small'] : DESCRIPCION[t]
const comoDecidir = (etiquetas: readonly Tipo[]) => (esTalla(etiquetas) ? COMO_DECIDIR_TALLA : COMO_DECIDIR)

export function textoParaHaiku(tarea: string, etiquetas: readonly Tipo[]): string {
  const tipos = etiquetas.map(t => `- ${t}: ${descripcion(etiquetas, t)}`).join('\n')
  const guia = comoDecidir(etiquetas).map(l => `- ${l}`).join('\n')
  return `${PREGUNTA}\n\nTipos:\n${tipos}\n\nCómo decidir:\n${guia}\n\nTarea: ${tarea}`
}

export function preguntaJev(etiquetas: readonly Tipo[]) {
  return {
    type: 'choice' as const,
    instructions: {
      pregunta: `${PREGUNTA} La tarea está en \`tarea\`: su título y un resumen del prompt (largo, archivos que nombra, pasos y si menciona un spec o plan).`,
      como_decidir: comoDecidir(etiquetas),
    },
    criteria: Object.fromEntries(etiquetas.map(t => [t, descripcion(etiquetas, t)])),
  }
}
