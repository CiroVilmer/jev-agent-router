import type { Escalon, Esfuerzo, Modelo, Tipo } from '../types'

export const TIPOS: readonly Tipo[] = [
  'review-final', 'review', 're-review', 'build-large', 'build-small', 'fix', 'explore', 'research', 'write',
]

/** Los tipos que el router asigna al final: `review` se parte en review-large y review-small. */
export const TIPOS_FINALES: readonly Tipo[] = [
  'review-final', 'review-large', 'review-small', 're-review', 'build-large', 'build-small', 'fix', 'explore', 'research', 'write',
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
  'review-large': 8,
  'review-small': 6,
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

/** La base y los techos de cada tipo: los del router, o los que el usuario eligió en /config. */
export type Tabla = { base: Record<Tipo, number>; techo: Partial<Record<Tipo, number>> }

/** La opción de /config que elige el modelo·esfuerzo base de cada tipo. */
export const OPCION_DE_TIPO: Record<Tipo, string> = {
  'review-final': 'modeloReviewFinal',
  review: 'modeloReview',
  'review-large': 'modeloReviewLarge',
  'review-small': 'modeloReviewSmall',
  're-review': 'modeloReReview',
  'build-large': 'modeloBuildLarge',
  'build-small': 'modeloBuildSmall',
  fix: 'modeloFix',
  explore: 'modeloExplore',
  research: 'modeloResearch',
  write: 'modeloWrite',
}

export const POR_DEFECTO = 'por defecto'

/** Lo que se puede elegir en cada opción: solo escalones de la escalera, para que la política pueda subir. */
export const OPCIONES_MODELO: readonly string[] = [POR_DEFECTO, ...ESCALERA.map(formatEscalon)]

/**
 * La tabla con las elecciones de /config. Un valor que no es un escalón de la escalera (o "por
 * defecto") deja la base del router. Si un tipo con techo queda por encima de su techo, el techo
 * sube con él: lo eligió el usuario.
 */
export function tablaDe(options: Readonly<Record<string, unknown>>): Tabla {
  const base = { ...BASE }
  const indiceDe = (v: unknown) =>
    typeof v === 'string' ? ESCALERA.findIndex(e => formatEscalon(e) === v.trim().toLowerCase()) : -1
  for (const tipo of [...TIPOS, 'review-large', 'review-small'] as const) {
    let i = indiceDe(options[OPCION_DE_TIPO[tipo]])
    // modeloReview es legado: vale para las dos tallas si no se eligieron por separado.
    if (i === -1 && (tipo === 'review-large' || tipo === 'review-small')) i = indiceDe(options[OPCION_DE_TIPO.review])
    if (i !== -1) base[tipo] = i
  }
  const techo: Partial<Record<Tipo, number>> = {}
  for (const [tipo, t] of Object.entries(TECHO) as [Tipo, number][]) techo[tipo] = Math.max(t, base[tipo])
  return { base, techo }
}
