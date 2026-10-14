import { describe, expect, test } from 'claude-code/testing'
import { motivoCorto, textoLinea } from '../src/ui/linea'
import type { Subagente } from '../types'

const sub = (cambios: Partial<Subagente> = {}): Subagente => ({
  agentId: 'a1',
  descripcion: 'Review Task 3: parser',
  tarea: 'Tarea 3',
  tipo: 'review',
  pedido: 'inherit',
  modeloEfectivo: 'claude-opus-5-5',
  elegido: 'opus·xhigh',
  escalon: { modelo: 'opus', esfuerzo: 'xhigh' },
  motivos: ['regla review', 'jev → review (0.98)'],
  reasignado: false,
  inicio: 0,
  fin: null,
  ...cambios,
})

describe('línea informativa', () => {
  test('sin subagentes no se muestra', () => {
    expect(textoLinea(undefined)).toBe(undefined)
  })

  test('la última decisión: description, elegido y quién decidió', () => {
    expect(textoLinea(sub())).toBe('router · Review Task 3: parser → opus·xhigh · jev 0.98')
  })

  test('si la política subió, lo dice corto al final', () => {
    const s = sub({ descripcion: 'Implement Task 8', elegido: 'opus·high', motivos: ['regla build', 'jev → build-large (1.00)', 'política +1'] })
    expect(textoLinea(s)).toBe('router · Implement Task 8 → opus·high · jev 1.00 · +1')
  })

  test('recorta descriptions largas a 40 caracteres', () => {
    const t = textoLinea(sub({ descripcion: 'x'.repeat(60) }))!
    expect(t.startsWith(`router · ${'x'.repeat(39)}… → `)).toBe(true)
  })

  test('sin tocar: el modelo pedido y por qué entre corchetes', () => {
    const base = { escalon: null, tipo: null, elegido: 'sonnet', pedido: 'sonnet' } as const
    expect(textoLinea(sub({ ...base, descripcion: 'Fix Task 2', motivos: ['[pin]: respeta lo que pidió Claude'] }))).toBe('router · Fix Task 2 → sonnet [pin]')
    expect(textoLinea(sub({ ...base, motivos: ['router apagado'] }))!.endsWith('→ sonnet [off]')).toBe(true)
    expect(textoLinea(sub({ ...base, motivos: ['fork: hereda el modelo'] }))!.endsWith('→ sonnet [fork]')).toBe(true)
  })

  test('no repite el statusline ni el modo de la política', () => {
    const t = textoLinea(sub({ motivos: ['regla fix', 'política +2'] })) ?? ''
    expect(/%|7d|contexto|reset|subiendo|reasignad/.test(t)).toBe(false)
  })
})

describe('motivoCorto', () => {
  test('quién decidió, en una palabra', () => {
    expect(motivoCorto(['regla review', 'jev dudó (0.55): queda la regla'])).toBe('jev dudó')
    expect(motivoCorto(['ninguna regla', 'jev (sin umbral) → review (0.55)'])).toBe('jev 0.55')
    expect(motivoCorto(['regla build', 'respaldo (jev dudó (0.62)) → build-small'])).toBe('respaldo')
    expect(motivoCorto(['regla review', 'fijado con /router: opus·max'])).toBe('fijado')
    expect(motivoCorto(['regla fix', 'política +1'])).toBe('regla')
    expect(motivoCorto([])).toBe('')
  })
})
