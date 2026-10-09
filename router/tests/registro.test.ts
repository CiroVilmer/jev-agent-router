import { describe, expect, test } from 'claude-code/testing'
import type { Subagente } from '../types'
import { agruparPorTarea, mediana, metricasDe, tareaDe } from '../src/registro'

const MIN = 60_000
const sub = (c: Partial<Subagente>): Subagente => ({
  agentId: 'a', descripcion: '', tarea: null, tipo: null, pedido: 'sonnet', elegido: 'sonnet',
  escalon: null, motivos: [], reasignado: false, inicio: 0, fin: null, ...c,
})

describe('tareaDe', () => {
  test('reconoce Task, Tarea y T<n>', () => {
    expect(tareaDe('Implement Task 6: ranking de meses')).toBe('Tarea 6')
    expect(tareaDe('Review Tasks 2+3 (spec + quality)')).toBe('Tarea 2')
    expect(tareaDe('Revisión de la tarea 4')).toBe('Tarea 4')
    expect(tareaDe('Re-revision de T10, rondas 2 y 3')).toBe('Tarea 10')
    expect(tareaDe('Task 1c: casos sellado')).toBe('Tarea 1c')
    expect(tareaDe('T3 la cola')).toBe('Tarea 3')
  })

  test('sin tarea', () => {
    expect(tareaDe('Final whole-branch review')).toBe(null)
    expect(tareaDe('Map ingesta path')).toBe(null)
  })

  test('"Fix V5: fecha" ahora agrupa por el nombre', () => {
    expect(tareaDe('Fix V5: fecha')).toBe('fecha')
  })

  test('tareaDe agrupa por el nombre después de un prefijo corto', () => {
    expect(tareaDe('v2: kubernetes')).toBe('kubernetes')
    expect(tareaDe('verif: kubernetes')).toBe('kubernetes')
    expect(tareaDe('Review: Kubernetes')).toBe('kubernetes')
    expect(tareaDe('Code review: backup-como-servicio')).toBe('backup-como-servicio')
    expect(tareaDe('v2: kubernetes [pin]')).toBe('kubernetes')
  })

  test('el prefijo admite hasta 30 caracteres: el par verificar/redactar agrupa igual', () => {
    expect(tareaDe('Verificar formularios: familia A')).toBe('familia a')
    expect(tareaDe('Redactar formularios: familia A')).toBe('familia a')
    expect(tareaDe(`${'a'.repeat(31)}: x`)).toBe(null)
    expect(tareaDe(`v2: ${'n'.repeat(80)}`)).toBe('n'.repeat(60))
  })

  test('Task N gana sobre el prefijo', () => {
    expect(tareaDe('Review Task 3: kubernetes')).toBe('Tarea 3')
    expect(tareaDe('Implement T4: tablas')).toBe('Tarea 4')
  })

  test('sin Task N ni prefijo corto no hay tarea', () => {
    expect(tareaDe('Map ingesta path for new models')).toBe(null)
    expect(tareaDe('Una descripción con un prefijo demasiado largo para serlo: x')).toBe(null)
    expect(tareaDe('v2:')).toBe(null)
  })
})

describe('agruparPorTarea', () => {
  test('arma el ciclo, cuenta rondas y minutos', () => {
    const subs = [
      sub({ agentId: '1', tarea: 'Tarea 4', tipo: 'build-small', inicio: 0, fin: 10 * MIN }),
      sub({ agentId: '2', tarea: 'Tarea 4', tipo: 'review', inicio: 10 * MIN, fin: 18 * MIN }),
      sub({ agentId: '3', tarea: 'Tarea 4', tipo: 're-review', inicio: 20 * MIN, fin: 25 * MIN }),
      sub({ agentId: '4', tarea: 'Tarea 4', tipo: 're-review', inicio: 26 * MIN, fin: 31 * MIN }),
      sub({ agentId: '5', tarea: 'Tarea 6', tipo: 'build-small', inicio: 30 * MIN, fin: null }),
      sub({ agentId: '6', tarea: null, tipo: 'explore', inicio: 0, fin: MIN }),
    ]
    expect(agruparPorTarea(subs, 40 * MIN)).toEqual([
      {
        tarea: 'Tarea 4',
        pasos: [
          { tipo: 'build-small', terminado: true },
          { tipo: 'review', terminado: true },
          { tipo: 're-review', terminado: true },
          { tipo: 're-review', terminado: true },
        ],
        rondas: 2,
        minutos: 31,
        activa: false,
      },
      { tarea: 'Tarea 6', pasos: [{ tipo: 'build-small', terminado: false }], rondas: 0, minutos: 10, activa: true },
    ])
  })
})

describe('metricasDe', () => {
  test('sin subagentes: todo null o cero', () => {
    expect(metricasDe([], 0)).toEqual({ reviewsEnOpus: null, rondasPorTarea: null, minutosPorTarea: null, reasignados: 0, total: 0 })
  })

  // Tarea 1 dura 30 min y Tarea 2, 5: cantidad par, la mediana es (5 + 30) / 2.
  test('calcula sobre la sesión', () => {
    const subs = [
      sub({ agentId: '1', tarea: 'Tarea 1', tipo: 'build-small', inicio: 0, fin: 10 * MIN, reasignado: true }),
      sub({ agentId: '2', tarea: 'Tarea 1', tipo: 'review', escalon: { modelo: 'opus', esfuerzo: 'xhigh' }, inicio: 10 * MIN, fin: 20 * MIN, reasignado: true }),
      sub({ agentId: '3', tarea: 'Tarea 1', tipo: 're-review', escalon: { modelo: 'opus', esfuerzo: 'medium' }, inicio: 20 * MIN, fin: 30 * MIN }),
      sub({ agentId: '4', tarea: 'Tarea 2', tipo: 'review', escalon: null, pedido: 'sonnet', inicio: 0, fin: 5 * MIN }),
    ]
    expect(metricasDe(subs, 60 * MIN)).toEqual({
      reviewsEnOpus: 2 / 3,
      rondasPorTarea: 0.5,
      minutosPorTarea: 17.5,
      reasignados: 2,
      total: 4,
    })
  })

  test('sin escalón, Opus sale del modelo efectivo y no del pedido', () => {
    const subs = [
      // Heredó opus del padre: pedido 'inherit', pero corrió en Opus.
      sub({ agentId: '1', tipo: 'review', pedido: 'inherit', modeloEfectivo: 'claude-opus-5-5' }),
      // Con [pin] y model sonnet: no es Opus.
      sub({ agentId: '2', tipo: 'review', pedido: 'sonnet', modeloEfectivo: 'sonnet' }),
    ]
    expect(metricasDe(subs, 0).reviewsEnOpus).toBe(0.5)
  })
})

describe('mediana', () => {
  test('vacía, impar y par (promedio de los dos del medio)', () => {
    expect(mediana([])).toBe(null)
    expect(mediana([7])).toBe(7)
    expect(mediana([90, 4, 12])).toBe(12)
    expect(mediana([40, 2, 10, 6])).toBe(8)
  })

  test('minutosPorTarea es la mediana de las tareas terminadas, no el promedio', () => {
    const subs = [
      sub({ agentId: '1', tarea: 'Tarea 1', tipo: 'build-small', inicio: 0, fin: 4 * MIN }),
      sub({ agentId: '2', tarea: 'Tarea 2', tipo: 'build-small', inicio: 0, fin: 12 * MIN }),
      sub({ agentId: '3', tarea: 'Tarea 3', tipo: 'build-small', inicio: 0, fin: 90 * MIN }),
      sub({ agentId: '4', tarea: 'Tarea 4', tipo: 'build-small', inicio: 0, fin: null }),
    ]
    // Terminadas: 4, 12 y 90 (promedio 35.3); la activa no cuenta.
    expect(metricasDe(subs, 100 * MIN).minutosPorTarea).toBe(12)
  })
})
