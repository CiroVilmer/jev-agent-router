import { describe, expect, mock, test } from 'claude-code/testing'
import { LINEA_BASE } from '../src/lineaBase'

const AHORA = Date.parse('2026-10-06T12:00:00Z')
const SPAWN = {
  tool_use_id: 'tu-1',
  prompt: 'Revisá la tarea 6.',
  description: 'Review Task 6 (spec + quality)',
  subagentType: 'general-purpose',
  provider: { plugin: 'engine', tier: 'core' },
  model: 'sonnet',
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
} as const
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
/** Una fila de métricas: la etiqueta y las tres columnas, en orden, con espacios entre medio. */
const fila = (etiqueta: string, sesion: string, semana: string, base: string) =>
  new RegExp(`^${[etiqueta, sesion, semana, base].map(escapar).join('\\s+')}$`)
const VENTANAS_VACIAS = '5 h sin usar al reset (7 días): — en 0 ventanas · vs semana anterior — (no hay base previa al router) · 0 sin cobertura'
const PROPS = {
  title: 'Router', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {},
} as const

describe('panel', () => {
  test('En curso muestra la decisión y Métricas compara con la base', async ($, on) => {
    mock.clock(on, { now: AHORA })
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-1' }))
    await $.agent.spawn(SPAWN)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'agent-router', surface, component: 'Pane', requestId: 'router', props: PROPS })
      expect(await ui.find({ text: /Review Task 6/ })).toBeDefined()
      expect(await ui.find({ text: /sonnet → opus·xhigh/ })).toBeDefined()
      expect(await ui.find({ text: /regla review/ })).toBeDefined()

      await ui.press({ key: 'tab-metricas' })
      expect(await ui.find({ text: /reviews en Opus/ })).toBeDefined()
      // Columnas: sesión · 7 días · base. Sin store, la de 7 días va con "—".
      expect(await ui.find({ text: /SESIÓN · 7 DÍAS · BASE/ })).toBeDefined()
      expect(await ui.find({ text: fila('reviews en Opus', '100%', '—', `${Math.round(LINEA_BASE.reviewsEnOpus * 100)}%`) })).toBeDefined()
      expect(await ui.find({ text: fila('rondas/tarea', '0.00', '—', LINEA_BASE.rondasPorTarea.toFixed(2)) })).toBeDefined()
      expect(await ui.find({ text: fila('min/tarea', '—', '—', String(LINEA_BASE.minutosPorTarea)) })).toBeDefined()

      await ui.press({ key: 'tab-curso' })
      await ui.unmount()
    }
  })

  test('angosto oculta los motivos', async ($, on) => {
    mock.clock(on, { now: AHORA })
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-1' }))
    await $.agent.spawn(SPAWN)
    const ui = await $.ui.mount({
      plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: { ...PROPS, bodyColumns: 60 },
    })
    expect(await ui.find({ text: /sonnet → opus·xhigh/ })).toBeDefined()
    expect(await ui.find({ text: /regla review/ })).toBe(undefined)
    await ui.unmount()
  })

  test('después de volver a En curso aparece la ventana', async ($, on) => {
    mock.clock(on, { now: AHORA })
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PROPS })
    await ui.press({ key: 'tab-metricas' })
    await ui.press({ key: 'tab-curso' })
    expect(await ui.find({ text: /VENTANA/ })).toBeDefined()
    await ui.unmount()
  })

  test('sin subagentes avisa que no hay nada corriendo', async ($, on) => {
    mock.clock(on, { now: AHORA })
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PROPS })
    expect(await ui.find({ text: /Sin subagentes corriendo./ })).toBeDefined()
    await ui.unmount()
  })

  test('/router permitir y /router off se ven en el panel', async ($, on) => {
    mock.clock(on, { now: AHORA })
    await $.command.run({ command: 'router', args: 'permitir sonnet,opus' })
    await $.command.run({ command: 'router', args: 'off' })
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PROPS })
    expect(await ui.find({ text: /permitir: sonnet,opus/ })).toBeDefined()
    expect(await ui.find({ text: /Router apagado/ })).toBeDefined()
    await ui.unmount()
  })

  test('Métricas muestra la comparación del modo sombra', async ($, on) => {
    mock.clock(on, { now: AHORA })
    const muestra = {
      fecha: AHORA,
      tarea: 'Implement Task 2: tablas · prompt 0.1k chars',
      etiquetas: ['build-large', 'build-small'],
      nombres: { principal: 'haiku', sombra: 'jev' },
      principal: { tipo: 'build-large', ms: 400, fuente: 'haiku' },
      sombra: { tipo: 'build-large', confianza: 0.9, ms: 700, fuente: 'jev' },
    }
    mock.store(on, { sombra: [muestra] })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'agent-router', surface, component: 'Pane', requestId: 'router', props: PROPS })
      await ui.press({ key: 'tab-metricas' })
      expect(await ui.find({ text: /CLASIFICADORES/ })).toBeDefined()
      expect(await ui.find({ text: /coinciden 1 de 1/ })).toBeDefined()
      expect(await ui.find({ text: /jev: p50 700 ms/ })).toBeDefined()
      await ui.press({ key: 'tab-curso' })
      await ui.unmount()
    }
  })

  test('Métricas separa por par, sin latencia para reglas y con — si no hay respuestas propias', async ($, on) => {
    mock.clock(on, { now: AHORA })
    const base = { fecha: AHORA, tarea: 'Implement Task 2', etiquetas: ['build-large', 'build-small'] }
    mock.store(on, {
      sombra: [
        {
          ...base,
          nombres: { principal: 'reglas', sombra: 'haiku' },
          principal: { tipo: 'build-small', ms: 0, fuente: 'respaldo' },
          sombra: { tipo: 'build-small', ms: 0, fuente: 'respaldo', detalle: 'tardó más de 60000 ms' },
          pasoTope: false,
        },
        {
          ...base,
          nombres: { principal: 'haiku', sombra: 'jev' },
          principal: { tipo: 'build-large', ms: 400, fuente: 'haiku' },
          sombra: { tipo: 'build-large', confianza: 0.9, ms: 1700, fuente: 'jev' },
          pasoTope: true,
        },
      ],
    })
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PROPS })
    await ui.press({ key: 'tab-metricas' })
    expect(await ui.find({ text: /reglas→haiku · 1 muestra · coinciden 0 de 0 comparables/ })).toBeDefined()
    expect(await ui.find({ text: /haiku→jev · 1 muestra · coinciden 1 de 1 comparables \(100%\)/ })).toBeDefined()
    expect(await ui.find({ text: /reglas: decide sin modelo/ })).toBeDefined()
    expect(await ui.find({ text: /reglas: p50/ })).toBe(undefined)
    expect(await ui.find({ text: /haiku: p50 — · p95 — · 1 al respaldo · 0 pasaron el tope/ })).toBeDefined()
    expect(await ui.find({ text: /jev: p50 1700 ms · p95 1700 ms · 0 al respaldo · 1 pasaron el tope/ })).toBeDefined()
    expect(await ui.find({ text: /\b0 ms/ })).toBe(undefined)
    await ui.unmount()
  })

  for (const basura of ['basura', [{}]] as const) {
    test(`un store roto (${JSON.stringify(basura)}) no tira el panel`, async ($, on) => {
      mock.clock(on, { now: AHORA })
      mock.store(on, { sombra: basura })
      const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PROPS })
      await ui.press({ key: 'tab-metricas' })
      expect(await ui.find({ text: /reviews en Opus/ })).toBeDefined()
      expect(await ui.find({ text: /CLASIFICADORES/ })).toBe(undefined)
      await ui.unmount()
    })
  }

  test('Métricas muestra la columna de 7 días y la ventana de 5 h sin usar', async ($, on) => {
    mock.clock(on, { now: AHORA })
    const MIN = 60_000
    const H = 60 * MIN
    const DIA = 24 * H
    const reg = (tarea: string, tipo: string, modelo: string, inicio: number, minutos: number) => ({
      sesion: 's1', tarea, tipo, modelo, pedido: 'sonnet', reasignado: false, inicio, fin: inicio + minutos * MIN,
    })
    const t1 = AHORA - 2 * DIA
    const t2 = AHORA - DIA
    const historial = [
      // Tarea 1: 30 min, 1 ronda; reviews en opus.
      reg('Tarea 1', 'build-small', 'sonnet', t1, 10),
      reg('Tarea 1', 'review', 'opus', t1 + 10 * MIN, 10),
      reg('Tarea 1', 're-review', 'opus', t1 + 20 * MIN, 10),
      // Tarea 2: 20 min, 1 ronda; reviews en sonnet.
      reg('Tarea 2', 'build-small', 'sonnet', t2, 5),
      reg('Tarea 2', 'review', 'sonnet', t2 + 5 * MIN, 5),
      reg('Tarea 2', 're-review', 'sonnet', t2 + 10 * MIN, 10),
      // Hace 10 días: queda afuera de la semana.
      reg('Tarea 9', 'review', 'opus', AHORA - 10 * DIA, 120),
    ]
    const ventana = (resetsAt: number, maxUsado: number, antesDelReset: number) => ({
      resetsAt: new Date(resetsAt).toISOString(), maxUsado, primeraVista: resetsAt - 5 * H, ultimaVista: resetsAt - antesDelReset,
    })
    const ventanas = [
      ventana(AHORA - DIA, 60, 30 * MIN), // 40 sin usar
      ventana(AHORA - 2 * DIA, 90, 10 * MIN), // 10 sin usar
      ventana(AHORA - 3 * DIA, 10, 3 * H), // sin cobertura
      ventana(AHORA - 9 * DIA, 50, 5 * MIN), // semana anterior: 50 sin usar
      ventana(AHORA + 2 * H, 30, -2 * H), // abierta: no cuenta
    ]
    mock.store(on, { historial, ventanas })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'agent-router', surface, component: 'Pane', requestId: 'router', props: PROPS })
      await ui.press({ key: 'tab-metricas' })
      expect(await ui.find({ text: fila('reviews en Opus', '—', '50%', `${Math.round(LINEA_BASE.reviewsEnOpus * 100)}%`) })).toBeDefined()
      expect(await ui.find({ text: fila('rondas/tarea', '—', '1.00', LINEA_BASE.rondasPorTarea.toFixed(2)) })).toBeDefined()
      expect(await ui.find({ text: fila('min/tarea', '—', '25', String(LINEA_BASE.minutosPorTarea)) })).toBeDefined()
      expect(await ui.find({
        text: '5 h sin usar al reset (7 días): 25% en 2 ventanas · vs semana anterior 50% (no hay base previa al router) · 1 sin cobertura',
      })).toBeDefined()
      expect(await ui.find({ text: /0 de 0 subagentes reasignados en esta sesión/ })).toBeDefined()
      await ui.press({ key: 'tab-curso' })
      await ui.unmount()
    }
  })

  const STORES_SIN_DATOS = [
    ['sin store', null],
    ['store vacío', {}],
    ['basura', { historial: 'basura', ventanas: 'basura' }],
    ['elementos rotos', { historial: [{}, null, 7], ventanas: [{}, { resetsAt: 'nada' }] }],
  ] as const
  for (const [nombre, entradas] of STORES_SIN_DATOS) {
    test(`Métricas con ${nombre}: la columna de 7 días y la ventana van con —`, async ($, on) => {
      mock.clock(on, { now: AHORA })
      if (entradas) mock.store(on, entradas)
      const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PROPS })
      await ui.press({ key: 'tab-metricas' })
      expect(await ui.find({ text: fila('reviews en Opus', '—', '—', `${Math.round(LINEA_BASE.reviewsEnOpus * 100)}%`) })).toBeDefined()
      expect(await ui.find({ text: fila('rondas/tarea', '—', '—', LINEA_BASE.rondasPorTarea.toFixed(2)) })).toBeDefined()
      expect(await ui.find({ text: fila('min/tarea', '—', '—', String(LINEA_BASE.minutosPorTarea)) })).toBeDefined()
      expect(await ui.find({ text: VENTANAS_VACIAS })).toBeDefined()
      await ui.unmount()
    })
  }
})

describe('pestaña Historial', () => {
  const MIN = 60_000
  const DIA = 86_400_000
  const guardado = (c: Record<string, unknown>) => ({
    sesion: 'otra', tarea: 'Tarea 1', tipo: 'build-small', modelo: 'sonnet', pedido: 'sonnet', reasignado: false,
    inicio: AHORA - DIA, fin: AHORA - DIA + 10 * MIN, descripcion: 'Implement Task 1', elegido: 'sonnet·medium',
    motivos: ['regla build'], modo: 'normal', ...c,
  })

  test('mezcla la sesión y el store, con resumen arriba y motivos debajo', async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on, {
      'historial:otra': [
        guardado({}),
        guardado({ tipo: 'review', modelo: 'opus', pedido: 'sonnet', elegido: 'opus·xhigh', reasignado: true,
          descripcion: 'Review Task 1', motivos: ['regla review'], modo: 'sobra', inicio: AHORA - DIA + 10 * MIN, fin: AHORA - DIA + 20 * MIN }),
        // Hace 9 días: entra en la lista (son las últimas 25) pero no en el resumen de 7 días.
        guardado({ descripcion: 'Implement Task 0', inicio: AHORA - 9 * DIA, fin: AHORA - 9 * DIA + MIN }),
        // Un registro viejo, sin los campos de la decisión.
        { sesion: 'otra', tarea: null, tipo: 'explore', modelo: 'haiku', pedido: 'haiku', reasignado: false, inicio: AHORA - 2 * DIA, fin: AHORA - 2 * DIA + MIN },
      ],
    })
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-1' }))
    await $.agent.spawn(SPAWN)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'agent-router', surface, component: 'Pane', requestId: 'router', props: PROPS })
      await ui.press({ key: 'tab-historial' })
      // 4 en 7 días: el spawn de ahora y 3 del store. 2 reasignadas (el de ahora y el review).
      expect(await ui.find({ text: '4 decisiones en 7 días · 2 reasignadas · opus 2 · sonnet 1 · haiku 1' })).toBeDefined()
      expect(await ui.find({ text: /Tarea 6 · Review Task 6 \(spec \+ quality\) · sonnet → opus·xhigh · normal/ })).toBeDefined()
      expect(await ui.find({ text: /Tarea 1 · Review Task 1 · sonnet → opus·xhigh · sobra/ })).toBeDefined()
      expect(await ui.find({ text: /Implement Task 0/ })).toBeDefined()
      expect(await ui.find({ text: /— · haiku → haiku · —/ })).toBeDefined()
      expect(await ui.find({ text: /^\s+regla review$/ })).toBeDefined()
      await ui.press({ key: 'tab-curso' })
      await ui.unmount()
    }
  })

  test('angosto oculta los motivos', async ($, on) => {
    mock.clock(on, { now: AHORA })
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-1' }))
    await $.agent.spawn(SPAWN)
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: { ...PROPS, bodyColumns: 60 } })
    await ui.press({ key: 'tab-historial' })
    expect(await ui.find({ text: /sonnet → opus·xhigh/ })).toBeDefined()
    expect(await ui.find({ text: /regla review/ })).toBe(undefined)
    await ui.unmount()
  })

  test('muestra solo las últimas 25', async ($, on) => {
    mock.clock(on, { now: AHORA })
    const muchos = Array.from({ length: 30 }, (_, i) => guardado({ descripcion: `Implement Task ${i}`, tarea: `Tarea ${i}`, inicio: AHORA - DIA + i * MIN, fin: AHORA - DIA + i * MIN }))
    mock.store(on, { 'historial:otra': muchos })
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PROPS })
    await ui.press({ key: 'tab-historial' })
    expect(await ui.find({ text: /Implement Task 29 / })).toBeDefined()
    expect(await ui.find({ text: /Implement Task 5 / })).toBeDefined()
    expect(await ui.find({ text: /Implement Task 4 / })).toBe(undefined)
    expect(await ui.find({ text: /^30 decisiones en 7 días/ })).toBeDefined()
    await ui.unmount()
  })

  test('sin decisiones lo dice', async ($, on) => {
    mock.clock(on, { now: AHORA })
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PROPS })
    await ui.press({ key: 'tab-historial' })
    expect(await ui.find({ text: '0 decisiones en 7 días · 0 reasignadas' })).toBeDefined()
    expect(await ui.find({ text: /Sin decisiones todavía/ })).toBeDefined()
    await ui.unmount()
  })
})
