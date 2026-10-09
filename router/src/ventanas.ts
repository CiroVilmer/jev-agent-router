import type { LecturaUso } from '../types'

/** Una ventana de 5 horas observada: se identifica por su `resetsAt`. */
export type Ventana = { resetsAt: string; maxUsado: number; primeraVista: number; ultimaVista: number }

export const MAX_VENTANAS = 300
/** Para contar una ventana, tiene que haberse visto en la última hora antes del reset. */
export const COBERTURA_MS = 60 * 60_000

export function observarVentana(lista: readonly Ventana[], l: LecturaUso, ahora: number, max = MAX_VENTANAS): Ventana[] {
  const reset = Date.parse(l.resetsAt)
  if (Number.isNaN(reset)) return [...lista]
  // Por instante, no por string: el mismo reset con otra precisión (.000Z, Z, +00:00) es la misma ventana.
  const esLaMisma = (v: Ventana) => Date.parse(v.resetsAt) === reset
  const existe = lista.some(esLaMisma)
  const nueva = existe
    ? lista.map(v => (esLaMisma(v) ? { ...v, maxUsado: Math.max(v.maxUsado, l.usado), ultimaVista: ahora } : v))
    : [...lista, { resetsAt: l.resetsAt, maxUsado: l.usado, primeraVista: ahora, ultimaVista: ahora }]
  return [...nueva].sort((a, b) => Date.parse(a.resetsAt) - Date.parse(b.resetsAt)).slice(-max)
}

export function ventanasDe(valor: unknown): Ventana[] {
  if (!Array.isArray(valor)) return []
  return valor.filter(
    (v): v is Ventana =>
      typeof v === 'object' &&
      v !== null &&
      typeof v.resetsAt === 'string' &&
      !Number.isNaN(Date.parse(v.resetsAt)) &&
      Number.isFinite(v.maxUsado) &&
      typeof v.maxUsado === 'number' &&
      typeof v.primeraVista === 'number' &&
      Number.isFinite(v.primeraVista) &&
      typeof v.ultimaVista === 'number' &&
      Number.isFinite(v.ultimaVista),
  )
}

export type ResumenVentanas = { cerradas: number; sinCobertura: number; sinUsarPromedio: number | null }

/**
 * Ventanas cerradas cuyo reset cae en `(desde, hasta]`; solo las que se vieron cerca del reset
 * entran en el promedio. El borde de abajo es exclusivo: con rangos seguidos (los 7 días y la
 * semana anterior) una ventana justo en el borde cae en uno solo.
 */
export function resumenVentanas(lista: readonly Ventana[], desde: number, hasta: number): ResumenVentanas {
  const cerradas = lista.filter(v => {
    const reset = Date.parse(v.resetsAt)
    return reset <= hasta && reset > desde
  })
  const cubiertas = cerradas.filter(v => v.ultimaVista >= Date.parse(v.resetsAt) - COBERTURA_MS)
  return {
    cerradas: cerradas.length,
    sinCobertura: cerradas.length - cubiertas.length,
    sinUsarPromedio: cubiertas.length ? cubiertas.reduce((a, v) => a + (100 - v.maxUsado), 0) / cubiertas.length : null,
  }
}
