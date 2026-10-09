import type { Tipo } from '../types'
import type { Clasificador } from './clasificadores'
import type { Resumen } from './resumen'

export type Caso = { id: string; descripcion: string; resumen: Resumen; etiquetasProduccion: Tipo[] | null }
export type ResultadoBanco = { id: string; fuente: 'haiku' | 'jev'; tipo: string | null; confianza: number | null; ms: number; error: string | null }

export function casosDeProduccion<C extends Caso>(casos: readonly C[]): C[] {
  return casos.filter(c => c.etiquetasProduccion !== null)
}

/**
 * Corre cada caso de producción por cada clasificador, sin tope: el banco mide la latencia real.
 * Los errores quedan en `error`. `alAvanzar` recibe además los resultados hasta ahora, para que
 * quien llama pueda ir guardando la corrida.
 */
export async function correrBanco(
  casos: readonly Caso[],
  clasificadores: Partial<Record<'haiku' | 'jev', Clasificador>>,
  opciones: {
    concurrencia: number
    alAvanzar?: (hechos: number, total: number, parciales: readonly ResultadoBanco[]) => Promise<void>
  },
): Promise<ResultadoBanco[]> {
  const trabajos = casosDeProduccion(casos).flatMap(c =>
    (Object.entries(clasificadores) as ['haiku' | 'jev', Clasificador][]).map(([fuente, cl]) => ({ c, fuente, cl })),
  )
  const resultados: ResultadoBanco[] = []
  let siguiente = 0
  const trabajador = async () => {
    while (siguiente < trabajos.length) {
      const { c, fuente, cl } = trabajos[siguiente++]!
      try {
        const r = await cl({ descripcion: c.descripcion, resumen: c.resumen, etiquetas: c.etiquetasProduccion! })
        resultados.push({ id: c.id, fuente, tipo: r.tipo, confianza: r.confianza ?? null, ms: r.ms, error: null })
      } catch (e) {
        resultados.push({ id: c.id, fuente, tipo: null, confianza: null, ms: 0, error: e instanceof Error ? e.message : String(e) })
      }
      await opciones.alAvanzar?.(resultados.length, trabajos.length, resultados.slice())
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opciones.concurrencia) }, trabajador))
  return resultados
}

/**
 * Ruta de la corrida con fecha y hora LOCALES: una prueba con --max no pisa una corrida entera y
 * una corrida de noche queda con la fecha del día. Ordena bien como texto.
 */
export function nombreCorrida(fechaLocal: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  const d = fechaLocal
  return `bench/corridas/${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}-banco.json`
}

/**
 * Cola que corre las tareas de a una, en el orden en que llegan: un guardado lento no pisa a uno
 * posterior. Cada tarea devuelve su propio resultado o rechazo; un rechazo no corta la cola.
 */
export function colaEnOrden(): <T>(tarea: () => Promise<T>) => Promise<T> {
  let ultima: Promise<unknown> = Promise.resolve()
  return tarea => {
    const r = ultima.then(tarea)
    ultima = r.catch(() => {})
    return r
  }
}

/**
 * Límite por llamada del banco: si el clasificador no responde en `ms`, falla con
 * "tardó más de N s" (a diferencia del tope de producción, no decide el respaldo).
 */
export function conLimite(c: Clasificador, ms: number, dormir: (ms: number) => Promise<void>): Clasificador {
  return async p => {
    const r = await Promise.race([c(p), dormir(ms).then(() => 'tarde' as const)])
    if (r === 'tarde') throw new Error(`tardó más de ${Math.round(ms / 1000)} s`)
    return r
  }
}
