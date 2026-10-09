import type { Escalon, Esfuerzo, Modelo, Tipo } from '../types'

export const TIPOS: readonly Tipo[] = [
  'review-final', 'review', 're-review', 'build-large', 'build-small', 'fix', 'explore', 'research', 'write',
]

export const ESCALERA: readonly Escalon[] = [
  { modelo: 'haiku', esfuerzo: 'low' },
  { modelo: 'haiku', esfuerzo: 'medium' },
  { modelo: 'haiku', esfuerzo: 'high' },
  { modelo: 'sonnet', esfuerzo: 'low' },
  { modelo: 'sonnet', esfuerzo: 'medium' },
  { modelo: 'sonnet', esfuerzo: 'high' },
  { modelo: 'opus', esfuerzo: 'medium' },
  { modelo: 'opus', esfuerzo: 'high' },
  { modelo: 'opus', esfuerzo: 'xhigh' },
]

export const TOPE = ESCALERA.length - 1

/** Índice en ESCALERA de la configuración base de cada tipo. */
export const BASE: Record<Tipo, number> = {
  'review-final': 8,
  review: 8,
  're-review': 6,
  'build-large': 6,
  'build-small': 4,
  fix: 5,
  // Haiku 5.5: en low saltea búsquedas y checks; medium para explorar, high para redactar.
  explore: 1,
  research: 4,
  write: 2,
}

/** Techos por velocidad, no por ahorro: explorar no gana nada con un modelo más lento. */
export const TECHO: Partial<Record<Tipo, number>> = { explore: 2 }

export const MODELOS: readonly Modelo[] = ['haiku', 'sonnet', 'opus']
const ESFUERZOS: readonly Esfuerzo[] = ['low', 'medium', 'high', 'xhigh', 'max']

export function formatEscalon(e: Escalon): string {
  return e.esfuerzo ? `${e.modelo}·${e.esfuerzo}` : e.modelo
}

export function parseEscalon(texto: string): Escalon | null {
  const [m, f, sobra] = texto.trim().toLowerCase().split(/[·.\s]+/).filter(Boolean)
  if (sobra !== undefined || m === undefined) return null
  if (!(MODELOS as readonly string[]).includes(m)) return null
  const modelo = m as Modelo
  // Haiku 5.5 admite esfuerzo; "haiku" a secas (como se escribía antes) es haiku·medium.
  if (modelo === 'haiku' && f === undefined) return { modelo, esfuerzo: 'medium' }
  if (f === undefined || !(ESFUERZOS as readonly string[]).includes(f)) return null
  return { modelo, esfuerzo: f as Esfuerzo }
}
