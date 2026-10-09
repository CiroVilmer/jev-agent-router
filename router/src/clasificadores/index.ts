import type { Tipo } from '../../types'
import type { Resumen } from '../resumen'
import { tamanoPorRespaldo } from '../resumen'

export type Clasificacion = { tipo: Tipo; confianza?: number; ms: number; fuente: 'respaldo' | 'haiku' | 'jev'; detalle?: string }

export type PedidoClasificacion = { descripcion: string; resumen: Resumen; etiquetas: readonly Tipo[] }

export type Clasificador = (p: PedidoClasificacion) => Promise<Clasificacion>

export const TALLAS: readonly Tipo[] = ['build-large', 'build-small']

export function soloTallas(etiquetas: readonly Tipo[]): boolean {
  return etiquetas.length === TALLAS.length && TALLAS.every(t => etiquetas.includes(t))
}

/** Decide sin modelo: por tamaño si es un build; si no hubo regla, build-small. */
export const respaldo: Clasificador = async ({ resumen, etiquetas }) => ({
  tipo: soloTallas(etiquetas) ? tamanoPorRespaldo(resumen) : 'build-small',
  ms: 0,
  fuente: 'respaldo',
})

export const TOPE_MS = { min: 50, max: 8000, porDefecto: 1000 } as const
// 0.7: calibrado en el banco del 2026-10-07; las cifras están en la tabla "Umbral de Jev" de
// bench/corridas/2026-10-07-1032-comparacion.md.
export const JEV_UMBRAL = { min: 0, max: 1, porDefecto: 0.7 } as const

const acotar = (x: unknown, l: { min: number; max: number; porDefecto: number }) =>
  typeof x === 'number' && Number.isFinite(x) ? Math.min(l.max, Math.max(l.min, x)) : l.porDefecto

/**
 * Los límites de /config, acotados: `topeMs` a [50, 8000] porque el hook tiene 10 s de
 * presupuesto y la espera cuenta; `jevUmbral` a [0, 1]. Un valor que no es número toma el default.
 */
export function limitesDe(options: { topeMs?: unknown; jevUmbral?: unknown }): { topeMs: number; jevUmbral: number } {
  return { topeMs: acotar(options.topeMs, TOPE_MS), jevUmbral: acotar(options.jevUmbral, JEV_UMBRAL) }
}
