import type { Tipo } from '../../types'
import type { Reloj } from './haiku'
import type { Clasificador } from './index'
import { leerSystemOne, pedidoSystemOne } from './protocolos'
import { preguntaJev } from './preguntas'
import type { Post } from './systemone'
import { crearSystemOne } from './systemone'

export type { Post } from './systemone'

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
/** Fijo: jev-latest cambia de modelo sin aviso y los umbrales se calibran contra una versión. */
export const JEV_MODELO = 'jev-1.13.0'

export function pedidoJev(tarea: string, etiquetas: readonly Tipo[]) {
  return pedidoSystemOne(JEV_MODELO, tarea, preguntaJev(etiquetas))
}

export function leerJev(texto: string, etiquetas: readonly Tipo[]): { tipo: Tipo; confianza: number } {
  const r = leerSystemOne(texto, etiquetas, 'jev')
  return { tipo: r.tipo as Tipo, confianza: r.confianza }
}

// El umbral se calibró para la talla de los builds y para las reviews por description (si Jev duda
// ahí, queda la regla). Cifras: bench/corridas/2026-10-07-1032-comparacion.md y
// bench/corridas/2026-10-09-1339-jev-todos-analisis.md.
export function crearJev(post: Post, ahora: Reloj, umbral: number): Clasificador {
  return crearSystemOne({ post, ahora, modelo: JEV_MODELO, umbral, fuente: 'jev' })
}
