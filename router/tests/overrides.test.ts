import { describe, expect, test } from 'claude-code/testing'
import {
  AYUDA, aplicarComando, describirComando, LINEA_ROUTER, OVERRIDES_INICIAL, parsearComando, tienePin,
} from '../src/overrides'

describe('parsearComando', () => {
  test('sin argumentos o "panel" abre el panel', () => {
    expect(parsearComando('')).toEqual({ accion: 'panel' })
    expect(parsearComando('  panel ')).toEqual({ accion: 'panel' })
  })

  test('on, off, reset', () => {
    expect(parsearComando('off')).toEqual({ accion: 'off' })
    expect(parsearComando('ON')).toEqual({ accion: 'on' })
    expect(parsearComando('reset')).toEqual({ accion: 'reset' })
  })

  test('permitir con comas o espacios, sin repetidos', () => {
    expect(parsearComando('permitir sonnet,opus')).toEqual({ accion: 'permitir', modelos: ['sonnet', 'opus'] })
    expect(parsearComando('permitir sonnet, opus sonnet')).toEqual({ accion: 'permitir', modelos: ['sonnet', 'opus'] })
  })

  test('permitir rechaza modelos desconocidos', () => {
    expect(parsearComando('permitir gpt')).toMatchObject({ accion: 'error' })
    expect(parsearComando('permitir')).toMatchObject({ accion: 'error' })
  })

  test('fijar tipo y escalón', () => {
    expect(parsearComando('fijar review-final opus·max')).toEqual({
      accion: 'fijar', tipo: 'review-final', escalon: { modelo: 'opus', esfuerzo: 'max' },
    })
    expect(parsearComando('fijar explore sonnet low')).toEqual({
      accion: 'fijar', tipo: 'explore', escalon: { modelo: 'sonnet', esfuerzo: 'low' },
    })
  })

  test('fijar rechaza tipos o escalones inválidos', () => {
    expect(parsearComando('fijar cualquiera opus·high')).toMatchObject({ accion: 'error' })
    expect(parsearComando('fijar review opus')).toMatchObject({ accion: 'error' })
  })

  test('un verbo desconocido es un error con ayuda', () => {
    const c = parsearComando('bla')
    expect(c.accion).toBe('error')
    expect(c.accion === 'error' && c.mensaje.includes('Uso: /router')).toBe(true)
  })
})

describe('parsearComando: casos de borde', () => {
  test('fijar acepta el tipo en mayúsculas', () => {
    expect(parsearComando('fijar Review opus·high')).toEqual({
      accion: 'fijar', tipo: 'review', escalon: { modelo: 'opus', esfuerzo: 'high' },
    })
  })
  test('permitir sin modelos pide cuáles', () => {
    const c = parsearComando('permitir')
    expect(c.accion === 'error' && c.mensaje.startsWith('Decime qué modelos')).toBe(true)
  })
  test('describirComando para on, off, reset, panel y error', () => {
    expect(describirComando({ accion: 'on' })).toBe('Router: prendido.')
    expect(describirComando({ accion: 'off' })).toBe('Router: apagado. Los subagentes salen con lo que pide Claude.')
    expect(describirComando({ accion: 'reset' })).toBe('Router: sin overrides en esta sesión.')
    expect(describirComando({ accion: 'panel' })).toBe('Panel del router abierto.')
    expect(describirComando({ accion: 'error', mensaje: 'x' })).toBe('x')
  })
})

describe('aplicarComando', () => {
  test('off y on', () => {
    const off = aplicarComando(OVERRIDES_INICIAL, { accion: 'off' })
    expect(off.activo).toBe(false)
    expect(aplicarComando(off, { accion: 'on' }).activo).toBe(true)
  })

  test('permitir y fijar se acumulan; reset vuelve al inicio', () => {
    let o = aplicarComando(OVERRIDES_INICIAL, { accion: 'permitir', modelos: ['sonnet', 'opus'] })
    o = aplicarComando(o, { accion: 'fijar', tipo: 'review', escalon: { modelo: 'opus', esfuerzo: 'max' } })
    expect(o).toEqual({
      activo: true,
      permitidos: ['sonnet', 'opus'],
      fijados: { review: { modelo: 'opus', esfuerzo: 'max' } },
    })
    expect(aplicarComando(o, { accion: 'reset' })).toEqual(OVERRIDES_INICIAL)
  })

  test('panel y error no cambian nada', () => {
    expect(aplicarComando(OVERRIDES_INICIAL, { accion: 'panel' })).toBe(OVERRIDES_INICIAL)
    expect(aplicarComando(OVERRIDES_INICIAL, { accion: 'error', mensaje: 'x' })).toBe(OVERRIDES_INICIAL)
  })

  test('describirComando confirma en una línea', () => {
    expect(describirComando({ accion: 'fijar', tipo: 'review', escalon: { modelo: 'opus', esfuerzo: 'max' } }))
      .toBe('Router: review queda fijado en opus·max para esta sesión.')
    expect(describirComando({ accion: 'permitir', modelos: ['sonnet', 'opus'] }))
      .toBe('Router: en esta sesión solo se usan sonnet, opus.')
  })
})

describe('pin', () => {
  test('detecta [pin] sin importar mayúsculas', () => {
    expect(tienePin('Review Task 3 [pin]')).toBe(true)
    expect(tienePin('[PIN] Explore')).toBe(true)
    expect(tienePin('Review Task 3')).toBe(false)
  })

  test('la línea para el system prompt manda a la descripción de la tool Agent', () => {
    expect(LINEA_ROUTER).toContain('está en la descripción de la tool Agent')
    expect(LINEA_ROUTER.includes('[pin]')).toBe(false)
  })

  test('la línea pide no elegir model y usar ese tiempo en paralelizar sin conflictos', () => {
    expect(LINEA_ROUTER.startsWith('Router de subagentes activo:')).toBe(true)
    expect(LINEA_ROUTER).toContain('No gastes razonamiento eligiendo `model` para los subagentes.')
    expect(LINEA_ROUTER).toContain('lanzá en paralelo las tareas independientes')
    expect(LINEA_ROUTER).toContain('serializá las que tocan los mismos archivos')
    // Un solo párrafo: sin saltos ni espacios dobles al concatenar.
    expect(/\n| {2}/.test(LINEA_ROUTER)).toBe(false)
  })
})

describe('parsearComando banco', () => {
  test('sin opciones', () => {
    expect(parsearComando('banco')).toEqual({ accion: 'banco', max: null, solo: null })
  })

  test('con --max y --solo', () => {
    expect(parsearComando('banco --max 50 --solo jev')).toEqual({ accion: 'banco', max: 50, solo: 'jev' })
    expect(parsearComando('banco --solo HAIKU')).toEqual({ accion: 'banco', max: null, solo: 'haiku' })
  })

  test('rechaza opciones inválidas', () => {
    expect(parsearComando('banco --solo gpt')).toMatchObject({ accion: 'error' })
    expect(parsearComando('banco --max cero')).toMatchObject({ accion: 'error' })
    expect(parsearComando('banco --max 0')).toMatchObject({ accion: 'error' })
    expect(parsearComando('banco --max')).toMatchObject({ accion: 'error' })
    expect(parsearComando('banco --rapido')).toMatchObject({ accion: 'error' })
  })
})

describe('parsearComando historial', () => {
  test('7 días por defecto', () => {
    expect(parsearComando('historial')).toEqual({ accion: 'historial', dias: 7 })
    expect(parsearComando('HISTORIAL 30')).toEqual({ accion: 'historial', dias: 30 })
  })

  test('rechaza días inválidos', () => {
    expect(parsearComando('historial 0')).toMatchObject({ accion: 'error' })
    expect(parsearComando('historial siete')).toMatchObject({ accion: 'error' })
    expect(parsearComando('historial 3 4')).toMatchObject({ accion: 'error' })
  })

  test('la ayuda lo menciona', () => {
    expect(AYUDA).toContain('/router historial')
  })
})

describe('/router hot', () => {
  test('on, off y consulta', () => {
    expect(parsearComando('hot on')).toEqual({ accion: 'hot', valor: true })
    expect(parsearComando('HOT off')).toEqual({ accion: 'hot', valor: false })
    expect(parsearComando('hot')).toEqual({ accion: 'hot', valor: null })
    expect(parsearComando('hot quizas').accion).toBe('error')
  })

  test('cómo lo describe', () => {
    expect(describirComando({ accion: 'hot', valor: true })).toBe(
      'Router: modo hot prendido, también para las próximas sesiones. Cerca del reset de la ventana de 5 h, con uso de sobra, los subagentes suben uno o dos escalones.',
    )
    expect(describirComando({ accion: 'hot', valor: false })).toBe(
      'Router: modo hot apagado, también para las próximas sesiones. Cada tipo de tarea corre en su modelo base.',
    )
  })

  test('no cambia los overrides de la sesión', () => {
    expect(aplicarComando(OVERRIDES_INICIAL, { accion: 'hot', valor: true })).toBe(OVERRIDES_INICIAL)
  })
})
