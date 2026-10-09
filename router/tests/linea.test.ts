import { describe, expect, test } from 'claude-code/testing'
import { textoLinea } from '../src/ui/linea'

const pol = (modo: 'fuego' | 'sobra' | 'normal', minutos: number | null = 24) => ({
  modo, escalones: modo === 'fuego' ? 2 : modo === 'sobra' ? 1 : 0, motivo: '', minutosAlReset: minutos,
} as const)

describe('línea informativa', () => {
  test('normal y sin reasignaciones: no se muestra', () => {
    expect(textoLinea(pol('normal'), { reasignados: 0, total: 3 })).toBe(undefined)
  })

  test('🔥 con reasignaciones', () => {
    expect(textoLinea(pol('fuego'), { reasignados: 3, total: 4 })).toBe(
      'router · 🔥 subiendo dos niveles hasta el reset (24m) · 3 de 4 subagentes reasignados · /router',
    )
  })

  test('⬆️ sin reasignaciones', () => {
    expect(textoLinea(pol('sobra', 95), { reasignados: 0, total: 0 })).toBe(
      'router · ⬆️ subiendo un nivel hasta el reset (95m) · /router',
    )
  })

  test('normal con reasignaciones', () => {
    expect(textoLinea(pol('normal'), { reasignados: 2, total: 5 })).toBe('router · 2 de 5 subagentes reasignados · /router')
  })

  test('no repite el statusline: ni porcentaje de 5h ni de 7d', () => {
    const t = textoLinea(pol('fuego'), { reasignados: 1, total: 1 }) ?? ''
    expect(/%|7d|contexto/.test(t)).toBe(false)
  })
})
