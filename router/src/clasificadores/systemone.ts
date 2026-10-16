import type { Tipo } from '../../types'
import { textoResumen } from '../resumen'
import type { Reloj } from './haiku'
import type { Clasificacion, Clasificador } from './index'
import { esPreguntaDeTalla } from './index'
import { pedidoSystemOne, leerSystemOne } from './protocolos'
import { preguntaJev } from './preguntas'

export type Post = (cuerpo: string) => Promise<{ ok: boolean; status: number; text: string }>

/**
 * El umbral como en Jev: en las preguntas de talla, con menos confianza falla con "<fuente> dudó" y
 * decide el respaldo; sin regla decide igual y lo marca (`sin umbral`).
 */
export function aplicarUmbral(
  r: { tipo: Tipo; confianza: number },
  ms: number,
  fuente: 'jev' | 'local',
  umbral: number,
  etiquetas: readonly Tipo[],
): Clasificacion {
  if (r.confianza < umbral) {
    if (esPreguntaDeTalla(etiquetas)) throw new Error(`${fuente} dudó (${r.confianza.toFixed(2)})`)
    return { ...r, ms, fuente, detalle: 'sin umbral' }
  }
  return { ...r, ms, fuente }
}

export function crearSystemOne(o: { post: Post; ahora: Reloj; modelo: string; umbral: number; fuente: 'jev' | 'local' }): Clasificador {
  return async ({ descripcion, resumen, etiquetas }) => {
    const inicio = await o.ahora()
    const r = await o.post(JSON.stringify(pedidoSystemOne(o.modelo, textoResumen(descripcion, resumen), preguntaJev(etiquetas))))
    const ms = (await o.ahora()) - inicio
    if (!r.ok) throw new Error(`${o.fuente}: HTTP ${r.status}`)
    const leido = leerSystemOne(r.text, etiquetas, o.fuente)
    return aplicarUmbral({ tipo: leido.tipo as Tipo, confianza: leido.confianza }, ms, o.fuente, o.umbral, etiquetas)
  }
}
