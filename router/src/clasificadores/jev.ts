import type { Tipo } from '../../types'
import { textoResumen } from '../resumen'
import type { Reloj } from './haiku'
import type { Clasificador } from './index'
import { soloTallas } from './index'
import { preguntaJev } from './preguntas'

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
/** Fijo: jev-latest cambia de modelo sin aviso y los umbrales se calibran contra una versión. */
export const JEV_MODELO = 'jev-1.13.0'

export type Post = (cuerpo: string) => Promise<{ ok: boolean; status: number; text: string }>

export function pedidoJev(tarea: string, etiquetas: readonly Tipo[]) {
  return { model: JEV_MODELO, state: { tarea }, questions: { tipo: preguntaJev(etiquetas) } }
}

export function leerJev(texto: string, etiquetas: readonly Tipo[]): { tipo: Tipo; confianza: number } {
  let json: { answers?: { tipo?: { type?: string; choice?: unknown; confidence?: unknown; probabilities?: Record<string, number> } } }
  try {
    json = JSON.parse(texto)
  } catch {
    throw new Error('jev: la respuesta no es JSON')
  }
  const a = json.answers?.tipo
  if (!a || a.type !== 'choice' || typeof a.choice !== 'string') throw new Error('jev: la respuesta no trae answers.tipo')
  if (!(etiquetas as readonly string[]).includes(a.choice)) throw new Error(`jev eligió una opción que no se pidió: ${a.choice}`)
  const confianza = typeof a.confidence === 'number' ? a.confidence : (a.probabilities?.[a.choice] ?? 0)
  return { tipo: a.choice as Tipo, confianza }
}

export function crearJev(post: Post, ahora: Reloj, umbral: number): Clasificador {
  return async ({ descripcion, resumen, etiquetas }) => {
    const inicio = await ahora()
    const r = await post(JSON.stringify(pedidoJev(textoResumen(descripcion, resumen), etiquetas)))
    const ms = (await ahora()) - inicio
    if (!r.ok) throw new Error(`jev: HTTP ${r.status}`)
    const { tipo, confianza } = leerJev(r.text, etiquetas)
    if (confianza < umbral) {
      // El umbral se calibró para la talla de los builds y para las reviews por description (si Jev
      // duda ahí, queda la regla). Sin regla, el respaldo siempre dice build-small y acierta menos
      // que Jev con duda. Cifras: bench/corridas/2026-10-07-1032-comparacion.md (talla y sin regla) y
      // bench/corridas/2026-10-09-1339-jev-todos-analisis.md (reviews; 0.7 simulado el 2026-10-09).
      if (soloTallas(etiquetas)) throw new Error(`jev dudó (${confianza.toFixed(2)})`)
      return { tipo, confianza, ms, fuente: 'jev', detalle: 'sin umbral' }
    }
    return { tipo, confianza, ms, fuente: 'jev' }
  }
}
