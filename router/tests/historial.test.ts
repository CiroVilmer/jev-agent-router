import { describe, expect, test } from 'claude-code/testing'
import type { Subagente } from '../types'
import {
  agregarRegistro, claveHistorial, clavesAPodar, esClaveHistorial, filaDeRegistro, filaDeSub, historialDe, metricasHistorial, registroDe,
  resumenDecisiones, ultimasDecisiones, ultimosDias, unirRegistros, type Registro,
} from '../src/historial'

const MIN = 60_000
const DIA = 86_400_000
const reg = (c: Partial<Registro>): Registro => ({
  sesion: 's1', tarea: null, tipo: null, modelo: null, pedido: 'sonnet', reasignado: false, inicio: 0, fin: 1, ...c,
})
const sub = (c: Partial<Subagente>): Subagente => ({
  agentId: 'a', descripcion: 'Task 1', tarea: 'Tarea 1', tipo: 'build-small', pedido: 'sonnet', elegido: 'sonnet',
  escalon: { modelo: 'sonnet', esfuerzo: 'high' }, motivos: [], reasignado: true, inicio: 5, fin: 9, ...c,
})

describe('registroDe', () => {
  test('copia los campos', () => {
    expect(registroDe(sub({}), 'ses')).toEqual({
      sesion: 'ses', tarea: 'Tarea 1', tipo: 'build-small', modelo: 'sonnet', pedido: 'sonnet',
      reasignado: true, inicio: 5, fin: 9, descripcion: 'Task 1', elegido: 'sonnet', motivos: [],
    })
  })

  test('guarda la decisión: descripción truncada a 100, elegido, motivos y modo', () => {
    const larga = 'Review Task 6 '.padEnd(150, 'x')
    const r = registroDe(sub({
      descripcion: larga, elegido: 'opus·xhigh', motivos: ['regla review', 'política +0'], modo: 'fuego',
    }), 'ses')
    expect(r?.descripcion).toBe(larga.slice(0, 100))
    expect(r?.elegido).toBe('opus·xhigh')
    expect(r?.motivos).toEqual(['regla review', 'política +0'])
    expect(r?.modo).toBe('fuego')
  })

  test('los motivos se copian: cambiar el subagente después no toca el registro', () => {
    const s = sub({ motivos: ['regla review'] })
    const r = registroDe(s, 'ses')
    s.motivos.push('otro')
    expect(r?.motivos).toEqual(['regla review'])
  })

  test('null si no terminó', () => {
    expect(registroDe(sub({ fin: null }), 'ses')).toBe(null)
  })

  test('deduce el modelo del pedido sin escalón', () => {
    expect(registroDe(sub({ escalon: null, pedido: 'claude-opus-5-5' }), 's')?.modelo).toBe('opus')
    expect(registroDe(sub({ escalon: null, pedido: 'haiku' }), 's')?.modelo).toBe('haiku')
    expect(registroDe(sub({ escalon: null, pedido: 'raro' }), 's')?.modelo).toBe(null)
  })

  test('sin escalón, el modelo sale del modelo efectivo (el heredado del padre)', () => {
    expect(registroDe(sub({ escalon: null, pedido: 'inherit', modeloEfectivo: 'claude-opus-5-5' }), 's')?.modelo).toBe('opus')
    expect(registroDe(sub({ escalon: null, pedido: 'inherit', modeloEfectivo: 'claude-sonnet-5' }), 's')?.modelo).toBe('sonnet')
  })
})

describe('agregarRegistro', () => {
  test('recorta a max dejando los últimos', () => {
    const l = [reg({ inicio: 1 }), reg({ inicio: 2 })]
    expect(agregarRegistro(l, reg({ inicio: 3 }), 2).map(r => r.inicio)).toEqual([2, 3])
    expect(l).toHaveLength(2)
  })
})

describe('historialDe', () => {
  test('basura da []', () => {
    expect(historialDe('basura')).toEqual([])
    expect(historialDe(null)).toEqual([])
  })

  test('descarta elementos inválidos', () => {
    const ok = reg({})
    const lista = historialDe([ok, { ...ok, sesion: undefined }, { ...ok, fin: 'x' }, { ...ok, inicio: undefined }, 7, null])
    expect(lista).toEqual([ok])
  })

  test('descarta pedido o tarea mal tipados y normaliza reasignado y modelo', () => {
    const ok = reg({ tarea: 'Tarea 1', modelo: 'opus', reasignado: true })
    const lista = historialDe([
      ok,
      { ...ok, pedido: 7 },
      { ...ok, pedido: undefined },
      { ...ok, tarea: 3 },
      { ...ok, tarea: undefined },
      { ...ok, tarea: null, reasignado: 'sí' },
      { ...ok, reasignado: 1, modelo: 'gpt' },
      { ...ok, modelo: undefined },
    ])
    expect(lista).toEqual([
      ok,
      { ...ok, tarea: null, reasignado: false },
      { ...ok, reasignado: false, modelo: null },
      { ...ok, modelo: null },
    ])
  })
})

describe('historialDe con los campos de la decisión', () => {
  test('conserva los campos válidos', () => {
    const ok = reg({ descripcion: 'Review Task 6', elegido: 'opus·xhigh', motivos: ['regla review'], modo: 'sobra' })
    expect(historialDe([ok])).toEqual([ok])
  })

  test('un registro viejo, sin los campos nuevos, sigue entrando tal cual', () => {
    const viejo = reg({ tarea: 'Tarea 1' })
    expect(historialDe([viejo])).toEqual([viejo])
  })

  test('descarta el campo malformado y no el registro', () => {
    const base = reg({})
    const lista = historialDe([
      { ...base, descripcion: 7 },
      { ...base, elegido: null },
      { ...base, motivos: 'regla review' },
      { ...base, motivos: ['ok', 3] },
      { ...base, modo: 'turbo' },
    ])
    expect(lista).toEqual([base, base, base, base, base])
    for (const r of lista) {
      expect('descripcion' in r || 'elegido' in r || 'motivos' in r || 'modo' in r).toBe(false)
    }
  })
})

describe('unirRegistros', () => {
  test('junta dos listas sin repetir el mismo registro', () => {
    const a = reg({ sesion: 'A', inicio: 1, fin: 2, descripcion: 'Task 1' })
    const b = reg({ sesion: 'A', inicio: 3, fin: 4, descripcion: 'Task 2' })
    const c = reg({ sesion: 'B', inicio: 1, fin: 2, descripcion: 'Task 1' })
    expect(unirRegistros([a, b], [b, c])).toEqual([a, b, c])
  })
})

describe('ultimasDecisiones', () => {
  test('mezcla memoria y store, sin repetir, de la más nueva a la más vieja y con tope', () => {
    const guardados = [
      reg({ sesion: 'vieja', inicio: 10, fin: 20, descripcion: 'Review Task 1', elegido: 'opus·xhigh', modelo: 'opus' }),
      // Ya terminado en esta sesión: está en el store y en memoria.
      reg({ sesion: 'ses', tarea: 'Tarea 1', inicio: 30, fin: 40, descripcion: 'Task 1', pedido: 'sonnet', elegido: 'sonnet', modelo: 'sonnet' }),
    ]
    const subs = [
      sub({ inicio: 30, fin: 40 }),
      sub({ agentId: 'b', descripcion: 'Explore Task 2', tarea: 'Tarea 2', inicio: 50, fin: null, motivos: ['regla explore'] }),
    ]
    const filas = ultimasDecisiones(subs, 'ses', guardados, 25)
    expect(filas.map(f => f.inicio)).toEqual([50, 30, 10])
    expect(filas[0]).toMatchObject({ sesion: 'ses', descripcion: 'Explore Task 2', enCurso: true, motivos: ['regla explore'] })
    expect(filas[1]!.enCurso).toBe(false)
    expect(ultimasDecisiones(subs, 'ses', guardados, 2).map(f => f.inicio)).toEqual([50, 30])
  })

  test('sin sesión conocida, la memoria igual entra', () => {
    expect(ultimasDecisiones([sub({})], null, [], 25)).toHaveLength(1)
  })
})

describe('filas', () => {
  test('un registro viejo cae en el modelo para elegido y en vacío para lo demás', () => {
    expect(filaDeRegistro(reg({ modelo: 'opus', pedido: 'sonnet' }))).toMatchObject({
      descripcion: '', elegido: 'opus', motivos: [], modo: null, enCurso: false,
    })
    expect(filaDeRegistro(reg({ modelo: null, pedido: 'raro' })).elegido).toBe('raro')
  })

  test('de un subagente sale el modelo con el que corre', () => {
    expect(filaDeSub(sub({ escalon: { modelo: 'opus', esfuerzo: 'xhigh' }, modo: 'fuego' }), 'ses')).toMatchObject({
      modelo: 'opus', modo: 'fuego', enCurso: false,
    })
  })
})

describe('resumenDecisiones', () => {
  test('cuenta total, reasignadas, por modelo, por modo y por tipo → modelo', () => {
    const filas = [
      reg({ tipo: 'review', modelo: 'opus', reasignado: true, modo: 'normal' }),
      reg({ tipo: 'review', modelo: 'opus', modo: 'fuego' }),
      reg({ tipo: 'build-small', modelo: 'sonnet', reasignado: true }),
      reg({ tipo: null, modelo: null }),
    ].map(filaDeRegistro)
    const r = resumenDecisiones(filas)
    expect(r.total).toBe(4)
    expect(r.reasignadas).toBe(2)
    expect(r.porModelo).toEqual([['opus', 2], ['sonnet', 1], ['?', 1]])
    expect(r.porModo).toEqual([['sin dato', 2], ['normal', 1], ['fuego', 1]])
    expect(r.porTipo).toEqual([
      ['review', [['opus', 2]]],
      ['build-small', [['sonnet', 1]]],
      ['sin tipo', [['?', 1]]],
    ])
  })
})

describe('ultimosDias', () => {
  test('el rango es (ahora - dias, ahora]: el borde de abajo queda afuera y ahora adentro', () => {
    const ahora = 10 * DIA
    const l = [reg({ fin: 3 * DIA }), reg({ fin: 3 * DIA + 1 }), reg({ fin: 9 * DIA }), reg({ fin: ahora }), reg({ fin: ahora + 1 })]
    // límite = 10d - 7d = 3d, exclusivo: así un registro no cae en esta semana y en la anterior
    expect(ultimosDias(l, ahora, 7).map(r => r.fin)).toEqual([3 * DIA + 1, 9 * DIA, ahora])
    // La semana anterior, (ahora - 14d, ahora - 7d], se lleva el del borde.
    expect(ultimosDias(l, ahora - 7 * DIA, 7).map(r => r.fin)).toEqual([3 * DIA])
  })

  test('decide por grupo sesión·tarea según el último fin: no parte una tarea en el borde', () => {
    const ahora = 10 * DIA
    const l = [
      // s1·Tarea 1 termina adentro (4d): entra entera, también el paso de 2d.
      reg({ sesion: 's1', tarea: 'Tarea 1', fin: 2 * DIA }),
      reg({ sesion: 's1', tarea: 'Tarea 1', fin: 4 * DIA }),
      // s2·Tarea 1 es otro grupo y termina afuera (2d): queda afuera entera.
      reg({ sesion: 's2', tarea: 'Tarea 1', fin: 1 * DIA }),
      reg({ sesion: 's2', tarea: 'Tarea 1', fin: 2 * DIA }),
      // Sin tarea: cada uno por su propio fin.
      reg({ sesion: 's1', tarea: null, fin: 2 * DIA }),
      reg({ sesion: 's1', tarea: null, fin: 5 * DIA }),
    ]
    expect(ultimosDias(l, ahora, 7).map(r => `${r.sesion}·${r.tarea}·${r.fin / DIA}`)).toEqual([
      's1·Tarea 1·2', 's1·Tarea 1·4', 's1·null·5',
    ])
  })
})

describe('metricasHistorial', () => {
  test('no junta la misma tarea de sesiones distintas', () => {
    const lista = [
      // A·Tarea 1: review en opus (0-10), re-review en sonnet (10-20): 1 ronda, 20 min
      reg({ sesion: 'A', tarea: 'Tarea 1', tipo: 'review', modelo: 'opus', inicio: 0, fin: 10 * MIN }),
      reg({ sesion: 'A', tarea: 'Tarea 1', tipo: 're-review', modelo: 'sonnet', inicio: 10 * MIN, fin: 20 * MIN, reasignado: true }),
      // B·Tarea 1: un review en sonnet (0-30): 0 rondas, 30 min
      reg({ sesion: 'B', tarea: 'Tarea 1', tipo: 'review', modelo: 'sonnet', inicio: 0, fin: 30 * MIN }),
    ]
    const m = metricasHistorial(lista)
    expect(m.total).toBe(3)
    expect(m.reasignados).toBe(1)
    expect(m.reviewsEnOpus).toBe(1 / 3) // 3 revisiones, 1 en opus
    expect(m.rondasPorTarea).toBe(0.5) // (1 + 0) / 2 tareas; juntas serían 1
    expect(m.minutosPorTarea).toBe(25) // mediana de 20 y 30; juntas serían 30
  })

  test('lista vacía', () => {
    expect(metricasHistorial([])).toEqual({
      reviewsEnOpus: null, rondasPorTarea: null, minutosPorTarea: null, reasignados: 0, total: 0,
    })
  })
})

describe('claves del historial', () => {
  test('una por sesión; la vieja también cuenta como historial', () => {
    expect(claveHistorial('ses-1')).toBe('historial:ses-1')
    expect(esClaveHistorial('historial:ses-1')).toBe(true)
    expect(esClaveHistorial('historial')).toBe(true)
    expect(esClaveHistorial('ventanas')).toBe(false)
    expect(esClaveHistorial('historiales')).toBe(false)
  })
})

describe('clavesAPodar', () => {
  const ahora = 100 * DIA
  const sesion = (clave: string, ...fines: number[]) => ({ clave, registros: fines.map(fin => reg({ fin })) })

  test('borra las sesiones cuyo último fin tiene más de 14 días, nunca la actual', () => {
    const sesiones = [
      sesion('historial:vieja', ahora - 30 * DIA, ahora - 15 * DIA),
      sesion('historial:borde', ahora - 14 * DIA), // exactamente 14 días: se borra
      sesion('historial:reciente', ahora - 20 * DIA, ahora - 13 * DIA), // la decide el último fin
      sesion('historial:vacia'), // sin registros válidos: se borra
      sesion('historial:actual', ahora - 20 * DIA),
    ]
    expect(clavesAPodar(sesiones, ahora, 'historial:actual')).toEqual(['historial:vieja', 'historial:borde', 'historial:vacia'])
  })

  test('si el total pasa de max, borra las sesiones más viejas hasta entrar', () => {
    const sesiones = [
      sesion('historial:b', ahora - 2 * DIA, ahora - 2 * DIA),
      sesion('historial:a', ahora - 3 * DIA, ahora - 3 * DIA),
      sesion('historial:c', ahora - DIA, ahora - DIA),
      sesion('historial:actual', ahora - 5 * DIA, ahora),
    ]
    // 8 registros con max 5: se va a (la más vieja) y después b; c y la actual quedan (4).
    expect(clavesAPodar(sesiones, ahora, 'historial:actual', 5)).toEqual(['historial:a', 'historial:b'])
    expect(clavesAPodar(sesiones, ahora, 'historial:actual', 8)).toEqual([])
  })
})

describe('ultimasDecisiones sin id de sesión', () => {
  test('no repite lo de memoria que ya está en el store', () => {
    const guardados = [reg({ sesion: 'ses', tarea: 'Tarea 1', inicio: 30, fin: 40, descripcion: 'Task 1', pedido: 'sonnet' })]
    const filas = ultimasDecisiones([sub({ inicio: 30, fin: 40 })], null, guardados, 25)
    expect(filas).toHaveLength(1)
    expect(filas[0]!.sesion).toBe(null)
  })
})
