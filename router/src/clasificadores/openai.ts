import type { Tipo } from '../../types'
import { textoResumen } from '../resumen'
import type { Reloj } from './haiku'
import type { Clasificador } from './index'
import { leerOpenAI, pedidoOpenAI, textoOpenAI } from './protocolos'
import { textoParaHaiku } from './preguntas'
import type { Post } from './systemone'
import { aplicarUmbral } from './systemone'

/**
 * El plan B del clasificador local: un LLM por /v1/chat/completions que responde una letra; la
 * confianza sale de los logprobs (0 si el servidor no los devuelve: en la talla decide el respaldo).
 */
export function crearOpenAI(o: { post: Post; ahora: Reloj; modelo: string; umbral: number }): Clasificador {
  return async ({ descripcion, resumen, etiquetas }) => {
    const texto = textoOpenAI(textoParaHaiku(textoResumen(descripcion, resumen), etiquetas), etiquetas)
    const inicio = await o.ahora()
    const r = await o.post(JSON.stringify(pedidoOpenAI(o.modelo, texto, etiquetas)))
    const ms = (await o.ahora()) - inicio
    if (!r.ok) throw new Error(`local: HTTP ${r.status}`)
    const leido = leerOpenAI(r.text, etiquetas)
    return aplicarUmbral({ tipo: leido.tipo as Tipo, confianza: leido.confianza }, ms, 'local', o.umbral, etiquetas)
  }
}
