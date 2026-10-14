import { describe, expect, test } from 'claude-code/testing'
import { BASE, ESCALERA, formatEscalon, OPCION_DE_TIPO, OPCIONES_MODELO, parseEscalon, tablaDe, TECHO, TIPOS, TOPE } from '../src/taxonomia'

describe('taxonomia', () => {
  test('la escalera va de haiku·low a opus·xhigh, con tres escalones de Haiku', () => {
    expect(ESCALERA.map(formatEscalon)).toEqual([
      'haiku·low', 'haiku·medium', 'haiku·high',
      'sonnet·low', 'sonnet·medium', 'sonnet·high',
      'opus·medium', 'opus·high', 'opus·xhigh',
    ])
    expect(TOPE).toBe(8)
    expect(ESCALERA.every(e => e.esfuerzo !== undefined)).toBe(true)
  })

  test('la matriz base coincide con el spec de la fase 5', () => {
    const base = Object.fromEntries(TIPOS.map(t => [t, formatEscalon(ESCALERA[BASE[t]]!)]))
    expect(base).toEqual({
      'review-final': 'opus·xhigh',
      review: 'opus·xhigh',
      're-review': 'opus·medium',
      'build-large': 'opus·medium',
      'build-small': 'sonnet·medium',
      fix: 'sonnet·high',
      explore: 'haiku·medium',
      research: 'sonnet·medium',
      write: 'haiku·high',
    })
    expect(formatEscalon(ESCALERA[TECHO.explore!]!)).toBe('haiku·high')
  })

  test('parseEscalon acepta ·, punto y espacio, y Haiku con esfuerzo', () => {
    expect(parseEscalon('opus·xhigh')).toEqual({ modelo: 'opus', esfuerzo: 'xhigh' })
    expect(parseEscalon('sonnet.medium')).toEqual({ modelo: 'sonnet', esfuerzo: 'medium' })
    expect(parseEscalon('Opus max')).toEqual({ modelo: 'opus', esfuerzo: 'max' })
    expect(parseEscalon('haiku·high')).toEqual({ modelo: 'haiku', esfuerzo: 'high' })
    expect(parseEscalon('haiku low')).toEqual({ modelo: 'haiku', esfuerzo: 'low' })
  })

  test('parseEscalon lee haiku a secas como haiku·medium', () => {
    expect(parseEscalon('haiku')).toEqual({ modelo: 'haiku', esfuerzo: 'medium' })
  })

  test('parseEscalon rechaza lo inválido', () => {
    expect(parseEscalon('gpt·high')).toBe(null)
    expect(parseEscalon('opus')).toBe(null)
    expect(parseEscalon('haiku·turbo')).toBe(null)
    expect(parseEscalon('sonnet·turbo')).toBe(null)
    expect(parseEscalon('')).toBe(null)
  })

  test('un escalón guardado sin esfuerzo se sigue mostrando', () => {
    expect(formatEscalon({ modelo: 'haiku' })).toBe('haiku')
  })
})

describe('tabla de /config', () => {
  test('sin opciones, la tabla del router', () => {
    const t = tablaDe({})
    expect(t.base).toEqual(BASE)
    expect(t.techo).toEqual(TECHO)
  })

  test('cada tipo toma su modelo·esfuerzo de /config', () => {
    const t = tablaDe({ modeloReview: 'opus·high', modeloWrite: 'sonnet·low' })
    expect(formatEscalon(ESCALERA[t.base.review]!)).toBe('opus·high')
    expect(formatEscalon(ESCALERA[t.base.write]!)).toBe('sonnet·low')
    expect(t.base.fix).toBe(BASE.fix)
  })

  test('"por defecto" o un valor inválido dejan la tabla del router', () => {
    expect(tablaDe({ modeloReview: 'por defecto', modeloFix: 'gpt·high', modeloWrite: 3 }).base).toEqual(BASE)
  })

  test('si explore queda por encima de su techo, el techo sube con él', () => {
    const t = tablaDe({ modeloExplore: 'sonnet·medium' })
    expect(formatEscalon(ESCALERA[t.base.explore]!)).toBe('sonnet·medium')
    expect(t.techo.explore).toBe(t.base.explore)
  })

  test('las opciones son "por defecto" más los escalones de la escalera, una por tipo', () => {
    expect(OPCIONES_MODELO).toEqual(['por defecto', ...ESCALERA.map(formatEscalon)])
    expect(Object.keys(OPCION_DE_TIPO).sort()).toEqual([...TIPOS].sort())
    expect(OPCION_DE_TIPO['review-final']).toBe('modeloReviewFinal')
    expect(OPCION_DE_TIPO['re-review']).toBe('modeloReReview')
  })
})
