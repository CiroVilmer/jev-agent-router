import { describe, expect, test } from 'claude-code/testing'
import { COBERTURA_MS, observarVentana, resumenVentanas, ventanasDe, type Ventana } from '../src/ventanas'

const H = 3_600_000
const R1 = '2026-10-07T15:00:00.000Z'
const R2 = '2026-10-07T20:00:00.000Z'
const t = (iso: string) => Date.parse(iso)
const vent = (c: Partial<Ventana>): Ventana => ({ resetsAt: R1, maxUsado: 0, primeraVista: 0, ultimaVista: 0, ...c })

describe('observarVentana', () => {
  test('crea la ventana', () => {
    expect(observarVentana([], { usado: 30, resetsAt: R1 }, 100)).toEqual([
      { resetsAt: R1, maxUsado: 30, primeraVista: 100, ultimaVista: 100 },
    ])
  })

  test('mismo resetsAt: queda el máximo y la última vista', () => {
    let l = observarVentana([], { usado: 30, resetsAt: R1 }, 100)
    l = observarVentana(l, { usado: 80, resetsAt: R1 }, 200)
    l = observarVentana(l, { usado: 50, resetsAt: R1 }, 300)
    expect(l).toEqual([{ resetsAt: R1, maxUsado: 80, primeraVista: 100, ultimaVista: 300 }])
  })

  test('el mismo reset con otra precisión es la misma ventana', () => {
    let l = observarVentana([], { usado: 30, resetsAt: '2026-10-07T18:00:00.000Z' }, 100)
    l = observarVentana(l, { usado: 50, resetsAt: '2026-10-07T18:00:00Z' }, 200)
    l = observarVentana(l, { usado: 40, resetsAt: '2026-10-07T18:00:00+00:00' }, 300)
    expect(l).toEqual([{ resetsAt: '2026-10-07T18:00:00.000Z', maxUsado: 50, primeraVista: 100, ultimaVista: 300 }])
  })

  test('otro resetsAt crea otra ventana (dos cuentas)', () => {
    let l = observarVentana([], { usado: 30, resetsAt: R1 }, 100)
    l = observarVentana(l, { usado: 10, resetsAt: R2 }, 200)
    expect(l.map(v => v.resetsAt)).toEqual([R1, R2])
  })

  test('recorta a las max más recientes por resetsAt', () => {
    let l: Ventana[] = []
    l = observarVentana(l, { usado: 1, resetsAt: R2 }, 1, 2)
    l = observarVentana(l, { usado: 1, resetsAt: R1 }, 2, 2)
    l = observarVentana(l, { usado: 1, resetsAt: '2026-10-07T10:00:00.000Z' }, 3, 2)
    expect(l.map(v => v.resetsAt)).toEqual([R1, R2])
  })

  test('resetsAt inválido no cambia nada', () => {
    const l = [vent({})]
    expect(observarVentana(l, { usado: 5, resetsAt: 'nada' }, 9)).toEqual(l)
  })
})

describe('resumenVentanas', () => {
  const desde = t('2026-10-01T00:00:00.000Z')
  const hasta = t('2026-10-08T00:00:00.000Z')

  test('promedio de lo sin usar en las cerradas con cobertura', () => {
    const l = [
      vent({ resetsAt: R1, maxUsado: 70, ultimaVista: t(R1) - 10 * 60_000 }), // sin usar 30
      vent({ resetsAt: R2, maxUsado: 90, ultimaVista: t(R2) - COBERTURA_MS }), // borde: cubierta, sin usar 10
    ]
    // (30 + 10) / 2 = 20
    expect(resumenVentanas(l, desde, hasta)).toEqual({ cerradas: 2, sinCobertura: 0, sinUsarPromedio: 20 })
  })

  test('sin cobertura: última vista 3 h antes del reset', () => {
    const l = [
      vent({ resetsAt: R1, maxUsado: 70, ultimaVista: t(R1) - 3 * H }),
      vent({ resetsAt: R2, maxUsado: 60, ultimaVista: t(R2) - 5 * 60_000 }), // sin usar 40
    ]
    expect(resumenVentanas(l, desde, hasta)).toEqual({ cerradas: 2, sinCobertura: 1, sinUsarPromedio: 40 })
  })

  test('solo cuenta cerradas y dentro del rango', () => {
    const l = [
      vent({ resetsAt: R1, maxUsado: 50, ultimaVista: t(R1) }), // dentro: sin usar 50
      vent({ resetsAt: '2026-09-30T23:59:59.000Z', maxUsado: 0, ultimaVista: t('2026-09-30T23:59:59.000Z') }), // antes de desde
      vent({ resetsAt: '2026-10-08T00:00:01.000Z', maxUsado: 0, ultimaVista: t('2026-10-08T00:00:01.000Z') }), // abierta/posterior
    ]
    expect(resumenVentanas(l, desde, hasta)).toEqual({ cerradas: 1, sinCobertura: 0, sinUsarPromedio: 50 })
  })

  test('el rango es (desde, hasta]: una ventana en el borde cae en una sola semana', () => {
    const SEMANA = 7 * 24 * H
    const ahora = t('2026-10-15T00:00:00.000Z')
    const borde = new Date(ahora - SEMANA).toISOString()
    const l = [
      vent({ resetsAt: borde, maxUsado: 40, ultimaVista: ahora - SEMANA }), // justo en ahora - 7d
      vent({ resetsAt: new Date(ahora).toISOString(), maxUsado: 80, ultimaVista: ahora }), // justo en ahora
    ]
    expect(resumenVentanas(l, ahora - SEMANA, ahora)).toEqual({ cerradas: 1, sinCobertura: 0, sinUsarPromedio: 20 })
    expect(resumenVentanas(l, ahora - 2 * SEMANA, ahora - SEMANA)).toEqual({ cerradas: 1, sinCobertura: 0, sinUsarPromedio: 60 })
  })

  test('null si no hay ninguna con cobertura', () => {
    expect(resumenVentanas([], desde, hasta)).toEqual({ cerradas: 0, sinCobertura: 0, sinUsarPromedio: null })
    const l = [vent({ resetsAt: R1, ultimaVista: 0 })]
    expect(resumenVentanas(l, desde, hasta)).toEqual({ cerradas: 1, sinCobertura: 1, sinUsarPromedio: null })
  })
})

describe('ventanasDe', () => {
  test('valida lo que viene del store', () => {
    const ok = vent({ maxUsado: 10, primeraVista: 1, ultimaVista: 2 })
    expect(ventanasDe('x')).toEqual([])
    expect(ventanasDe([ok, { ...ok, resetsAt: 7 }, { ...ok, resetsAt: 'nada' }, { ...ok, maxUsado: 'a' }, { ...ok, ultimaVista: undefined }, null])).toEqual([ok])
  })
})
