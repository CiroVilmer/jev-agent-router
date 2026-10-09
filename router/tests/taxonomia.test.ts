import { describe, expect, test } from 'claude-code/testing'
import { BASE, ESCALERA, formatEscalon, parseEscalon, TECHO, TIPOS, TOPE } from '../src/taxonomia'

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
