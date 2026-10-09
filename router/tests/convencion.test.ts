import { describe, expect, test } from 'claude-code/testing'
import { avisoConvencion, CONVENCION_AGENT, sinReglaDeDescription } from '../src/convencion'
import type { Subagente } from '../types'

const SUB: Subagente = {
  agentId: 'a1', descripcion: 'v2: kubernetes', tarea: 'kubernetes', tipo: 'review', pedido: 'sonnet',
  modeloEfectivo: 'sonnet', elegido: 'opus·xhigh', escalon: { modelo: 'opus', esfuerzo: 'xhigh' },
  motivos: ['ninguna regla', 'jev → review (0.79)'], reasignado: true, inicio: 0, fin: null,
}

describe('convencion', () => {
  test('el texto de la tool nombra los verbos, Task N y [pin]', () => {
    for (const v of ['Implement', 'Review', 'Re-review', 'Fix', 'Explore', 'Research', 'Write', 'Task N', '[pin]'])
      expect(CONVENCION_AGENT.includes(v)).toBe(true)
  })

  test('sin regla en la description', () => {
    expect(sinReglaDeDescription(['ninguna regla', 'jev → review (0.79)'])).toBe(true)
    expect(sinReglaDeDescription(['regla review'])).toBe(false)
  })

  test('el aviso dice cómo lo clasificó y cómo nombrarlo', () => {
    expect(avisoConvencion(SUB)).toBe(
      'router: no reconocí el tipo de "v2: kubernetes" y lo clasifiqué como review. Empezá la description con el verbo del tipo (Implement, Review, Re-review, Fix, Explore, Research, Write) y usá `Task N`.',
    )
  })

  test('recorta descriptions largas a 60 caracteres', () => {
    const larga = 'x'.repeat(80)
    expect(avisoConvencion({ ...SUB, descripcion: larga })!.includes(`"${'x'.repeat(59)}…"`)).toBe(true)
  })

  test('sin aviso si hubo regla o si el router no lo tocó', () => {
    expect(avisoConvencion({ ...SUB, motivos: ['regla review'] })).toBe(null)
    expect(avisoConvencion({ ...SUB, escalon: null, tipo: null, motivos: ['[pin]: respeta lo que pidió Claude'] })).toBe(null)
  })
})
