import { describe, expect, test } from 'claude-code/testing'
import { lecturaDe, politicaDe, politicaSegunHot, subir, UMBRALES_DEFAULT, umbralesDe } from '../src/politica'

const AHORA = Date.parse('2026-10-06T12:00:00Z')
const enMinutos = (m: number) => new Date(AHORA + m * 60_000).toISOString()
const pol = (usado: number, minutos: number) =>
  politicaDe({ usado, resetsAt: enMinutos(minutos) }, AHORA, UMBRALES_DEFAULT)

describe('política', () => {
  test('sin lectura: normal', () => {
    expect(politicaDe(null, AHORA, UMBRALES_DEFAULT)).toEqual({
      modo: 'normal', escalones: 0, motivo: 'sin datos de uso', minutosAlReset: null,
    })
  })

  test('🔥 en los bordes: T ≤ 60 y U ≤ 70', () => {
    expect(pol(70, 60).modo).toBe('fuego')
    expect(pol(70, 60).escalones).toBe(2)
    expect(pol(70.1, 60).modo).toBe('sobra')
    expect(pol(70, 61).modo).toBe('sobra')
  })

  test('⬆️ en los bordes: T ≤ 120 y U ≤ 80', () => {
    expect(pol(80, 120).modo).toBe('sobra')
    expect(pol(80, 120).escalones).toBe(1)
    expect(pol(80.1, 120).modo).toBe('normal')
    expect(pol(10, 121).modo).toBe('normal')
  })

  test('nunca frena: uso muy alto queda en normal, nunca negativo', () => {
    expect(pol(99, 200)).toMatchObject({ modo: 'normal', escalones: 0 })
    expect(pol(100, 5)).toMatchObject({ modo: 'normal', escalones: 0 })
  })

  test('el motivo explica en una frase', () => {
    expect(pol(38, 24).motivo).toBe('queda 62% de 5h y el reset es en 24m: lo que no uses se pierde')
    expect(pol(38, 24).minutosAlReset).toBe(24)
  })

  test('lecturaDe toma la ventana five_hour', () => {
    expect(
      lecturaDe([
        { kind: 'seven_day', percentUsed: 61, resetsAt: enMinutos(3000) },
        { kind: 'five_hour', percentUsed: 31, resetsAt: enMinutos(90) },
      ]),
    ).toEqual({ usado: 31, resetsAt: enMinutos(90) })
    expect(lecturaDe([{ kind: 'five_hour', percentUsed: 31 }])).toBe(null)
    expect(lecturaDe([])).toBe(null)
  })

  test('subir respeta el tope de la escalera y el techo del tipo', () => {
    expect(subir(4, 2, undefined)).toBe(6)
    expect(subir(6, 2, undefined)).toBe(8)
    expect(subir(8, 2, undefined)).toBe(8)
    expect(subir(0, 2, 2)).toBe(2)
    expect(subir(0, 1, 2)).toBe(1)
  })

  test('umbralesDe usa los defaults para lo que falta o no es número', () => {
    expect(umbralesDe({})).toEqual(UMBRALES_DEFAULT)
    expect(umbralesDe({ fuegoMinutos: 45, sobraUsado: 'x' })).toEqual({ ...UMBRALES_DEFAULT, fuegoMinutos: 45 })
  })

  test('resetsAt que no se puede leer: sin lectura', () => {
    expect(lecturaDe([{ kind: 'five_hour', percentUsed: 30, resetsAt: 'mañana' }])).toBe(null)
  })
  test('reset ya pasado cuenta como 0 minutos', () => {
    expect(pol(40, -5)).toMatchObject({ modo: 'fuego', minutosAlReset: 0 })
  })
  test('motivos de sobra y normal', () => {
    expect(pol(75, 100).motivo).toBe('queda 25% de 5h y el reset es en 100m')
    expect(pol(90, 200).motivo).toBe('usaste 90% de 5h, reset en 200m')
  })
})

describe('modo hot', () => {
  const lectura = { usado: 38, resetsAt: new Date(Date.parse('2026-10-06T12:00:00Z') + 24 * 60_000).toISOString() }
  const ahora = Date.parse('2026-10-06T12:00:00Z')

  test('apagado: la política no sube aunque sea 🔥', () => {
    const p = politicaSegunHot(false, lectura, ahora, UMBRALES_DEFAULT)
    expect(p).toMatchObject({ modo: 'normal', escalones: 0, minutosAlReset: 24 })
    // Sin perder el estado de la ventana: el panel lo sigue mostrando.
    expect(p.motivo).toBe('modo hot apagado (/router hot on) · queda 62% de 5h y el reset es en 24m: lo que no uses se pierde')
  })

  test('prendido: la política de siempre', () => {
    expect(politicaSegunHot(true, lectura, ahora, UMBRALES_DEFAULT)).toEqual(politicaDe(lectura, ahora, UMBRALES_DEFAULT))
  })
})
