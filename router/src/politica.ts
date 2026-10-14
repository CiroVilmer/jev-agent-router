import type { LecturaUso } from '../types'
import { TOPE } from './taxonomia'

export type Modo = 'fuego' | 'sobra' | 'normal'

export type Umbrales = { fuegoMinutos: number; fuegoUsado: number; sobraMinutos: number; sobraUsado: number }

export const UMBRALES_DEFAULT: Umbrales = { fuegoMinutos: 60, fuegoUsado: 70, sobraMinutos: 120, sobraUsado: 80 }

export type EstadoPolitica = { modo: Modo; escalones: 0 | 1 | 2; motivo: string; minutosAlReset: number | null }

export function umbralesDe(options: Readonly<Record<string, unknown>>): Umbrales {
  const n = (k: keyof Umbrales): number => {
    const v = options[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : UMBRALES_DEFAULT[k]
  }
  return { fuegoMinutos: n('fuegoMinutos'), fuegoUsado: n('fuegoUsado'), sobraMinutos: n('sobraMinutos'), sobraUsado: n('sobraUsado') }
}

export function lecturaDe(
  rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[],
): LecturaUso | null {
  const ventana = rateLimits.find(r => r.kind === 'five_hour')
  if (!ventana?.resetsAt || Number.isNaN(Date.parse(ventana.resetsAt))) return null
  return { usado: ventana.percentUsed, resetsAt: ventana.resetsAt }
}

/** Solo sube: nunca devuelve escalones negativos. */
export function politicaDe(lectura: LecturaUso | null, ahoraMs: number, u: Umbrales): EstadoPolitica {
  if (!lectura) return { modo: 'normal', escalones: 0, motivo: 'sin datos de uso', minutosAlReset: null }
  const minutos = Math.max(0, Math.round((Date.parse(lectura.resetsAt) - ahoraMs) / 60_000))
  const libre = Math.round(100 - lectura.usado)
  if (minutos <= u.fuegoMinutos && lectura.usado <= u.fuegoUsado) {
    return {
      modo: 'fuego',
      escalones: 2,
      motivo: `queda ${libre}% de 5h y el reset es en ${minutos}m: lo que no uses se pierde`,
      minutosAlReset: minutos,
    }
  }
  if (minutos <= u.sobraMinutos && lectura.usado <= u.sobraUsado) {
    return { modo: 'sobra', escalones: 1, motivo: `queda ${libre}% de 5h y el reset es en ${minutos}m`, minutosAlReset: minutos }
  }
  return {
    modo: 'normal',
    escalones: 0,
    motivo: `usaste ${Math.round(lectura.usado)}% de 5h, reset en ${minutos}m`,
    minutosAlReset: minutos,
  }
}

export function subir(base: number, escalones: number, techo: number | undefined): number {
  return Math.min(base + escalones, techo ?? TOPE, TOPE)
}

/** El modo hot (`/router hot on|off`) prende o apaga la política. Apagado, nunca sube. */
export function politicaSegunHot(hot: boolean, lectura: LecturaUso | null, ahoraMs: number, u: Umbrales): EstadoPolitica {
  const p = politicaDe(lectura, ahoraMs, u)
  return hot ? p : { modo: 'normal', escalones: 0, motivo: `modo hot apagado (/router hot on) · ${p.motivo}`, minutosAlReset: p.minutosAlReset }
}
