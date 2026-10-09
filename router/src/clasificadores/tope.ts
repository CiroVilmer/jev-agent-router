import type { Clasificador } from './index'
import { respaldo } from './index'

export type Dormir = (ms: number) => Promise<void>

/** Nunca tarda más que `ms` ni falla: si el clasificador se pasa o falla, decide el respaldo. */
export function conTope(c: Clasificador, ms: number, dormir: Dormir): Clasificador {
  return async p => {
    try {
      const tarde = dormir(ms).then(() => 'tarde' as const)
      const r = await Promise.race([c(p), tarde])
      if (r !== 'tarde') return r
      return { ...(await respaldo(p)), detalle: `tardó más de ${ms} ms` }
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error)
      return { ...(await respaldo(p)), detalle: mensaje.slice(0, 80) }
    }
  }
}
