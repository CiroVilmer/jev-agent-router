import type { Tipo } from '../../types'
import { textoResumen } from '../resumen'
import type { Clasificador } from './index'
import { textoParaHaiku } from './preguntas'

export type Reloj = () => Promise<number>
export type FuncionClasificar = (texto: string, etiquetas: readonly string[]) => Promise<string | undefined>

export function crearHaiku(clasificar: FuncionClasificar, ahora: Reloj): Clasificador {
  return async ({ descripcion, resumen, etiquetas }) => {
    const inicio = await ahora()
    const r = await clasificar(textoParaHaiku(textoResumen(descripcion, resumen), etiquetas), etiquetas)
    const ms = (await ahora()) - inicio
    if (r === undefined || !(etiquetas as readonly string[]).includes(r)) {
      throw new Error(`haiku no eligió una etiqueta válida: ${String(r)}`)
    }
    return { tipo: r as Tipo, ms, fuente: 'haiku' }
  }
}
