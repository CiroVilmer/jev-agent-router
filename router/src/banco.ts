import type { Tipo } from '../types'
import type { Clasificador } from './clasificadores'
import { TALLAS, TALLAS_REVIEW } from './clasificadores'
import { TIPOS } from './taxonomia'
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

export type Suite = 'tipos' | 'talla' | 'review'
export const SUITES: readonly Suite[] = ['tipos', 'talla', 'review']
export type CasoSuite = { id: string; descripcion: string; resumen: Resumen; regla?: string | null }
export type ItemSuite = { id: string; descripcion: string; resumen: Resumen; etiquetas: readonly Tipo[] }
export type ResultadoSuite = { id: string; tipo: string | null; confianza: number | null; ms: number; error: string | null }

/** Los casos de una suite, con las etiquetas que se le ofrecen al selector (§3 del spec). */
export function itemsDeSuite(casos: readonly CasoSuite[], suite: Suite, idsReview: ReadonlySet<string>): ItemSuite[] {
  const con = (c: CasoSuite, etiquetas: readonly Tipo[]): ItemSuite => ({ id: c.id, descripcion: c.descripcion, resumen: c.resumen, etiquetas })
  if (suite === 'tipos') return casos.map(c => con(c, TIPOS))
  if (suite === 'talla') return casos.filter(c => c.regla === 'build').map(c => con(c, TALLAS))
  return casos.filter(c => idsReview.has(c.id)).map(c => con(c, TALLAS_REVIEW))
}

/** Corre una suite con un selector, sin tope (mide la latencia real); los errores quedan en `error`. */
export async function correrSuite(
  items: readonly ItemSuite[],
  c: Clasificador,
  opciones: { concurrencia: number; alAvanzar?: (hechos: number, total: number, parciales: readonly ResultadoSuite[]) => Promise<void> },
): Promise<ResultadoSuite[]> {
  const resultados: (ResultadoSuite | undefined)[] = new Array(items.length)
  let siguiente = 0
  let hechos = 0
  const trabajador = async () => {
    while (siguiente < items.length) {
      const i = siguiente++
      const it = items[i]!
      try {
        const r = await c({ descripcion: it.descripcion, resumen: it.resumen, etiquetas: it.etiquetas })
        resultados[i] = { id: it.id, tipo: r.tipo, confianza: r.confianza ?? null, ms: r.ms, error: null }
      } catch (e) {
        resultados[i] = { id: it.id, tipo: null, confianza: null, ms: 0, error: e instanceof Error ? e.message : String(e) }
      }
      hechos++
      await opciones.alAvanzar?.(hechos, items.length, resultados.filter((r): r is ResultadoSuite => r !== undefined))
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opciones.concurrencia) }, trabajador))
  return resultados as ResultadoSuite[]
}

export function nombreCorridaSuite(fechaLocal: Date, selector: string, suite: Suite): string {
  return nombreCorrida(fechaLocal).replace(/-banco\.json$/, `-sel-${selector}-${suite}.json`)
}

/** La URL de un selector sin credenciales ni query (pueden traer keys); null si no se puede parsear. */
export function urlSinCredenciales(url: string): string | null {
  try {
    const u = new URL(url)
    u.username = ''
    u.password = ''
    u.search = ''
    return u.toString()
  } catch {
    return null
  }
}
