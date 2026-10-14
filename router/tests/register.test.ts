import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { nombreCorrida } from '../src/banco'
import { CONVENCION_AGENT } from '../src/convencion'
import { LINEA_ROUTER } from '../src/overrides'
import { TIPOS } from '../src/taxonomia'
import type { Muestra } from '../src/clasificadores/sombra'

const AHORA = Date.parse('2026-10-06T12:00:00Z')

const SPAWN = {
  tool_use_id: 'tu-1',
  prompt: 'Revisá la tarea 6 contra el spec.',
  description: 'Review Task 6 (spec + quality)',
  subagentType: 'general-purpose',
  provider: { plugin: 'engine', tier: 'core' },
  model: 'sonnet',
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
} as const

const finDePaso = (e: { turnId: string; index: number }) => ({
  turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null,
})

describe('register', () => {
  test('un review sale en opus y su esfuerzo medium (talla chica por respaldo) llega a cada request del subagente', async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-1' } })
    let esfuerzo: unknown = 'sin tocar'
    on('turn.step', async function* (_$, e) { esfuerzo = e.effort; return finDePaso(e) })

    const r = await $.agent.spawn(SPAWN)
    expect(r.agentId).toBe('ag-1')
    expect(modelo).toBe('opus')

    const paso = $.turn.step({ turnId: 't-1', index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 3, agentId: 'ag-1' })
    for await (const _ of paso) { /* consumir el stream */ }
    expect(esfuerzo).toBe('medium')
  })

  test('los requests de la sesión principal no se tocan', async ($, on) => {
    mock.clock(on, { now: AHORA })
    let esfuerzo: unknown
    on('turn.step', async function* (_$, e) { esfuerzo = e.effort; return finDePaso(e) })
    const paso = $.turn.step({ turnId: 't-2', index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 3 })
    for await (const _ of paso) { /* consumir */ }
    expect(esfuerzo).toBe('medium')
  })

  test('un fork sale tal cual', async ($, on) => {
    mock.clock(on, { now: AHORA })
    let modelo: string | undefined = 'sin llamar'
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: 'inherit', agentId: 'ag-2' } })
    await $.agent.spawn({ ...SPAWN, fork: true, model: undefined })
    expect(modelo).toBe(undefined)
  })

  test('/router off apaga el router y la respuesta lo confirma', async ($, on) => {
    mock.clock(on, { now: AHORA })
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-3' } })
    const out = await $.command.run({ command: 'router', args: 'off' })
    expect(out.text).toBe('Router: apagado. Los subagentes salen con lo que pide Claude.')
    await $.agent.spawn(SPAWN)
    expect(modelo).toBe('sonnet')
  })

  test('con 🔥 y el modo hot prendido, un build chico sube a opus·medium', async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-4' } })
    on('session.measure', async (_$, e) => ({ changed: e.changed }))
    await $.command.run({ command: 'router', args: 'hot on' })
    await $.session.measure({
      context: { window: 1_000_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 38, resetsAt: new Date(AHORA + 24 * 60_000).toISOString() }],
      changed: ['rateLimits'],
    })
    await $.agent.spawn({ ...SPAWN, description: 'Implement Task 5b: fecha como marcador' })
    expect(modelo).toBe('opus')
  })

  test('el modo hot arranca apagado: con 🔥 un build chico no sube', async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-hot0' } })
    on('session.measure', async (_$, e) => ({ changed: e.changed }))
    await $.session.measure({
      context: { window: 1_000_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 38, resetsAt: new Date(AHORA + 24 * 60_000).toISOString() }],
      changed: ['rateLimits'],
    })
    await $.agent.spawn({ ...SPAWN, description: 'Implement Task 5b: fecha como marcador' })
    expect(modelo).toBe('sonnet')
  })

  test('si el store falla, el modo hot queda apagado y el spawn sigue', async ($, on) => {
    mock.clock(on, { now: AHORA })
    let modelo: string | undefined
    on('store.get', async () => { throw new Error('store roto') })
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-hot-err' } })
    on('session.measure', async (_$, e) => ({ changed: e.changed }))
    await $.session.measure({
      context: { window: 1_000_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 38, resetsAt: new Date(AHORA + 24 * 60_000).toISOString() }],
      changed: ['rateLimits'],
    })
    await $.agent.spawn({ ...SPAWN, description: 'Implement Task 5b: fecha como marcador' })
    expect(modelo).toBe('sonnet')
  })

  test('/router hot on|off se guarda en el store y /router hot dice cómo está', async ($, on) => {
    mock.clock(on, { now: AHORA })
    const store = storeEnMemoria(on)
    expect((await $.command.run({ command: 'router', args: 'hot' })).text).toBe('Router: modo hot apagado. Prendelo con /router hot on.')
    await $.command.run({ command: 'router', args: 'hot on' })
    expect(store.get('hot')).toBe(true)
    expect((await $.command.run({ command: 'router', args: 'hot' })).text).toBe('Router: modo hot prendido. Apagalo con /router hot off.')
    await $.command.run({ command: 'router', args: 'hot off' })
    expect(store.get('hot')).toBe(false)
  })

  test('el modelo de cada tipo sale de /config', { options: { modeloBuildSmall: 'haiku·high' } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-cfg' } })
    await $.agent.spawn({ ...SPAWN, description: 'Implement Task 5b: fecha como marcador' })
    expect(modelo).toBe('haiku')
  })

  test('la línea muestra la última decisión del router', async ($, on) => {
    mock.clock(on, { now: AHORA })
    const lineas: (string | undefined)[] = []
    on('ui.status', async (_$, e) => { lineas.push(e.text); return { value: undefined } })
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-linea' }))
    await $.agent.spawn(SPAWN)
    expect(lineas.at(-1)).toBe('router · Review Task 6 (spec + quality) → opus·medium · respaldo')
  })

  test('nunca bloquea: si la decisión falla, el subagente sale con lo que pidió Claude', async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-err' } })
    // Sin prompt, resumir falla en .length: entra el try/catch del hook.
    const r = await $.agent.spawn({ ...SPAWN, description: 'Implement Task 1', prompt: undefined as any })
    expect(r.agentId).toBe('ag-err')
    expect(modelo).toBe('sonnet')
    // Quedó registrado con el motivo del error: el panel lo muestra.
    const ui = await $.ui.mount({
      plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router',
      props: { title: 'Router', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    expect(await ui.find({ text: /Implement Task 1/ })).toBeDefined()
    expect(await ui.find({ text: /error del router: / })).toBeDefined()
    await ui.unmount()
  })

  test('turn.complete marca el fin: el subagente deja de figurar en curso', async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-1' }))
    on('turn.complete', async (_$, e) => ({ text: e.answer }))
    await $.agent.spawn(SPAWN)
    const montar = () => $.ui.mount({
      plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router',
      props: { title: 'Router', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    const antes = await montar()
    expect(await antes.find({ text: /▶ Review Task 6/ })).toBeDefined()
    await antes.unmount()

    await $.turn.complete({
      answer: 'listo', durationMs: 1000, isAborted: false, turnId: 't-1', agentId: 'ag-1', reason: 'answer',
    })
    const despues = await montar()
    expect(await despues.find({ text: /▶ Review Task 6/ })).toBe(undefined)
    expect(await despues.find({ text: /Sin subagentes corriendo/ })).toBeDefined()
    await despues.unmount()
  })

  test('si el paso corre en otro modelo (fallback), no se fuerza el esfuerzo elegido', async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-fb' }))
    let esfuerzo: unknown = 'sin tocar'
    on('turn.step', async function* (_$, e) { esfuerzo = e.effort; return finDePaso(e) })
    await $.agent.spawn(SPAWN)
    const paso = $.turn.step({ turnId: 't-fb', index: 0, model: 'claude-sonnet-5-5', effort: 'medium', messageCount: 3, agentId: 'ag-fb' })
    for await (const _ of paso) { /* consumir */ }
    expect(esfuerzo).toBe('medium')
  })

  test('una review hereda la talla del build de su tarea: build grande, review-large en opus con esfuerzo xhigh', async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    let modelo: string | undefined
    let n = 0
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: `ag-rl-${n++}` } })
    let esfuerzo: unknown = 'sin tocar'
    on('turn.step', async function* (_$, e) { esfuerzo = e.effort; return finDePaso(e) })
    await $.agent.spawn({ ...SPAWN, description: 'Implement Task 3: x', prompt: 'a'.repeat(6000) })
    // Review con prompt corto: sola, por respaldo, sería review-small.
    await $.agent.spawn({ ...SPAWN, tool_use_id: 'tu-2', description: 'Review Task 3: x', prompt: 'Revisá.', model: undefined })
    expect(modelo).toBe('opus')
    for await (const _ of $.turn.step({ turnId: 't-rl', index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 3, agentId: 'ag-rl-1' })) { /* consumir */ }
    expect(esfuerzo).toBe('xhigh')
  })

  test('una review hereda la talla del build de su tarea: build chico, review-small en opus con esfuerzo medium', async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    let modelo: string | undefined
    let n = 0
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: `ag-rs-${n++}` } })
    let esfuerzo: unknown = 'sin tocar'
    on('turn.step', async function* (_$, e) { esfuerzo = e.effort; return finDePaso(e) })
    await $.agent.spawn({ ...SPAWN, description: 'Implement Task 3: x', prompt: 'corto' })
    await $.agent.spawn({ ...SPAWN, tool_use_id: 'tu-2', description: 'Review Task 3: x', prompt: 'a'.repeat(6000), model: undefined })
    expect(modelo).toBe('opus')
    for await (const _ of $.turn.step({ turnId: 't-rs', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 3, agentId: 'ag-rs-1' })) { /* consumir */ }
    expect(esfuerzo).toBe('medium')
  })

  test('el system prompt suma la línea del router', async ($, on) => {
    on('prompt.compose', async () => ({ sections: [{ id: 'intro', text: 'Hola', scope: 'shared' as const }] }))
    const r = await $.prompt.compose({
      model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [],
    })
    expect(r.sections.map(s => s.id)).toEqual(['intro', 'router:pin'])
    expect(r.sections[1]!.text).toBe(LINEA_ROUTER)
  })

  test('la convención de nombres se suma a la descripción de la tool Agent y a ninguna otra', async ($, on) => {
    on('tool.describe', async (_$, e) => ({ description: e.description }))
    const base = { provider: { plugin: 'engine', tier: 'core' } } as const
    const agent = await $.tool.describe({ ...base, tool: 'Agent', description: 'Launch a new agent' })
    expect(agent.description).toBe(`Launch a new agent

${CONVENCION_AGENT}`)
    const bash = await $.tool.describe({ ...base, tool: 'Bash', description: 'Run a command' })
    expect(bash.description).toBe('Run a command')
  })
})

// Un build sin tamaño claro: la regla dice build y el prompt corto, por respaldo, sería build-small.
const BUILD = { ...SPAWN, description: 'Implement Task 2: tablas', prompt: 'Armá las tablas.' } as const
const PANE_PROPS = {
  title: 'Router', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {},
} as const
const respuestaJev = (choice: string, confidence: number) =>
  JSON.stringify({ model: 'jev-1.13.0', answers: { tipo: { type: 'choice', choice, probabilities: { [choice]: confidence }, confidence } } })

describe('clasificadores conectados', () => {
  test('haiku decide el tamaño del build', { options: { clasificador: 'haiku' } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    let pedido: { model?: string } | undefined
    on('model.classify', async (_$, e) => { pedido = e.options; return { value: 'build-large' } })
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-hk' } })
    await $.agent.spawn(BUILD)
    expect(modelo).toBe('opus')
    expect(pedido?.model).toBe('haiku')
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PANE_PROPS })
    expect(await ui.find({ text: /haiku → build-large/ })).toBeDefined()
    await ui.unmount()
  })

  test('jev decide con la key del entorno', { options: { clasificador: 'jev' } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    mock.env(on, { JEV_API_KEY: 'k' })
    let url = ''
    let autorizacion: string | undefined
    on('http.fetch', async (_$, e) => {
      url = e.url
      autorizacion = e.init?.headers?.Authorization
      return { value: { status: 200, ok: true, headers: {}, text: respuestaJev('build-large', 0.9) } }
    })
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-jev' } })
    await $.agent.spawn(BUILD)
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(autorizacion).toBe('Bearer k')
    expect(modelo).toBe('opus')
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PANE_PROPS })
    expect(await ui.find({ text: /jev → build-large \(0\.90\)/ })).toBeDefined()
    await ui.unmount()
  })

  test('jev sin key: decide haiku y avisa con un toast', { options: { clasificador: 'jev' } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    mock.env(on, {})
    const toasts: string[] = []
    on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } })
    on('model.classify', async () => ({ value: 'build-large' }))
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-sk' } })
    await $.agent.spawn(BUILD)
    expect(modelo).toBe('opus')
    expect(toasts.some(t => t.includes('falta la key de Jev'))).toBe(true)
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PANE_PROPS })
    expect(await ui.find({ text: /haiku → build-large/ })).toBeDefined()
    await ui.unmount()
  })

  const motivosDeLaReview = async ($: any, on: any, reloj: any, store: Map<string, unknown>) => {
    on('session.id', async () => ({ value: 'ses-rv' }))
    on('agent.spawn', async (_$: any, e: any) => ({ model: e.model ?? 'inherit', agentId: 'ag-rv' }))
    on('turn.complete', async (_$: any, e: any) => ({ text: e.answer }))
    await $.agent.spawn(SPAWN)
    await $.turn.complete({ ...FIN, agentId: 'ag-rv' })
    await esperar(reloj, () => store.has('historial:ses-rv'))
    return (store.get('historial:ses-rv') as { motivos: string[] }[])[0]!.motivos
  }

  test('con jev y key, una review por description se la pregunta a jev con las 9 etiquetas, y la talla con las 2', { options: { clasificador: 'jev' } }, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const store = storeEnMemoria(on)
    mock.env(on, { JEV_API_KEY: 'k' })
    let pregunta: { choices?: string[] } | undefined
    on('http.fetch', async (_$, e) => {
      pregunta ??= JSON.parse(e.init?.body as string).questions.tipo
      return { value: { status: 200, ok: true, headers: {}, text: respuestaJev('review', 0.98) } }
    })
    expect(await motivosDeLaReview($, on, reloj, store)).toEqual(['regla review', 'jev → review (0.98)', 'respaldo (jev eligió una opción que no se pidió: review) → review-small'])
    expect(Object.keys((pregunta as { criteria: object }).criteria)).toEqual(TIPOS)
  })

  test('con haiku, una review por description lo consulta solo por la talla', { options: { clasificador: 'haiku' } }, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const store = storeEnMemoria(on)
    let clasificados = 0
    on('model.classify', async () => { clasificados++; return { value: 'review-large' } })
    expect(await motivosDeLaReview($, on, reloj, store)).toEqual(['regla review', 'haiku → review-large'])
    expect(clasificados).toBe(1)
  })

  test('con jev y sin key, una review por description no le pregunta a jev: la talla la decide haiku', { options: { clasificador: 'jev' } }, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const store = storeEnMemoria(on)
    mock.env(on, {})
    let clasificados = 0
    let pedidos = 0
    on('model.classify', async () => { clasificados++; return { value: 'review-large' } })
    on('http.fetch', async () => { pedidos++; return { value: { status: 200, ok: true, headers: {}, text: respuestaJev('review', 0.98) } } })
    expect(await motivosDeLaReview($, on, reloj, store)).toEqual(['regla review', 'haiku → review-large'])
    expect(clasificados).toBe(1)
    expect(pedidos).toBe(0)
  })

  test('si el pedido a jev falla, el motivo no lleva la key', { options: { clasificador: 'jev', jevApiKey: 'clave-falsa' } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    on('http.fetch', async (_$, e) => ({ deny: `rechazado: ${e.init?.headers?.Authorization}` }))
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-deny' }))
    await $.agent.spawn(BUILD)
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PANE_PROPS })
    expect(await ui.find({ text: /respaldo \(jev: .*\) → build-small/ })).toBeDefined()
    expect(await ui.find({ text: /clave-falsa/ })).toBe(undefined)
    await ui.unmount()
  })

  test('si haiku se pasa del tope, decide el respaldo y el spawn sale', { options: { clasificador: 'haiku', topeMs: 50 } }, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    mock.store(on)
    // Nunca responde por su cuenta; se suelta cuando su dispatch se aborta.
    on('model.classify', async (_$, _e, next) =>
      new Promise<{ value: undefined }>(r => next.signal.addEventListener('abort', () => r({ value: undefined }))))
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-tope' } })
    const spawn = $.agent.spawn(BUILD)
    await reloj.settle()
    await reloj.advance(50)
    const r = await spawn
    expect(r.agentId).toBe('ag-tope')
    expect(modelo).toBe('sonnet')
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PANE_PROPS })
    expect(await ui.find({ text: /respaldo \(tardó más de 50 ms\) → build-small/ })).toBeDefined()
    await ui.unmount()
  })

  test('modo sombra: guarda las dos respuestas', { options: { clasificador: 'haiku', sombra: 'jev' } }, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    // El $ del test no tiene store (es del plugin): un store en memoria propio deja leer lo que
    // guardó el router. Hace lo mismo que mock.store.
    const store = new Map<string, unknown>()
    on('store.get', async (_$, e) => ({ value: store.get(e.key) }))
    on('store.set', async (_$, e) => { store.set(e.key, e.value); return { value: undefined } })
    mock.env(on, { JEV_API_KEY: 'k' })
    on('model.classify', async () => ({ value: 'build-large' }))
    on('http.fetch', async () => ({ value: { status: 200, ok: true, headers: {}, text: respuestaJev('build-small', 0.8) } }))
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-sombra' } })
    await $.agent.spawn(BUILD)
    expect(modelo).toBe('opus')
    // La sombra y su registro corren en segundo plano: se espera a que aparezca la muestra.
    let lista: { principal: { fuente: string }; sombra: { fuente: string } }[] | undefined
    for (let i = 0; i < 20 && !lista?.length; i++) {
      await reloj.settle()
      lista = store.get('sombra') as typeof lista
    }
    expect(lista?.length).toBe(1)
    expect(lista![0]!.principal.fuente).toBe('haiku')
    expect(lista![0]!.sombra.fuente).toBe('jev')
  })

  test('con reglas y sombra haiku: decide el respaldo y guarda la muestra', { options: { clasificador: 'reglas', sombra: 'haiku' } }, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const store = new Map<string, unknown>()
    on('store.get', async (_$, e) => ({ value: store.get(e.key) }))
    on('store.set', async (_$, e) => { store.set(e.key, e.value); return { value: undefined } })
    on('model.classify', async () => ({ value: 'build-large' }))
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-reglas' } })
    await $.agent.spawn(BUILD)
    // La decisión no cambia: respaldo, build-small, sonnet.
    expect(modelo).toBe('sonnet')
    let lista: { nombres: { principal: string; sombra: string }; principal: { fuente: string } }[] | undefined
    for (let i = 0; i < 20 && !lista?.length; i++) {
      await reloj.settle()
      lista = store.get('sombra') as typeof lista
    }
    expect(lista?.length).toBe(1)
    expect(lista![0]!.nombres).toEqual({ principal: 'reglas', sombra: 'haiku' })
    expect(lista![0]!.principal.fuente).toBe('respaldo')
  })

  test('con reglas y sombra, una review por description consulta a la sombra solo por la talla', { options: { clasificador: 'reglas', sombra: 'haiku' } }, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const store = new Map<string, unknown>()
    on('store.get', async (_$, e) => ({ value: store.get(e.key) }))
    on('store.set', async (_$, e) => { store.set(e.key, e.value); return { value: undefined } })
    let clasificados = 0
    on('model.classify', async () => { clasificados++; return { value: 'build-large' } })
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-review' } })
    await $.agent.spawn(SPAWN)
    let lista: { etiquetas: string[]; nombres: { principal: string; sombra: string } }[] | undefined
    for (let i = 0; i < 20 && !lista?.length; i++) {
      await reloj.settle()
      lista = store.get('sombra') as typeof lista
    }
    expect(modelo).toBe('opus')
    expect(clasificados).toBe(1)
    // La única muestra es la de la talla: las dos etiquetas de review.
    expect(lista?.length).toBe(1)
    expect(lista![0]!.etiquetas).toEqual(['review-large', 'review-small'])
  })

  test('una sombra más lenta que topeMs guarda su tipo, sus ms reales y pasoTope', { options: { clasificador: 'reglas', sombra: 'haiku', topeMs: 1000 } }, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const store = new Map<string, unknown>()
    on('store.get', async (_$, e) => ({ value: store.get(e.key) }))
    on('store.set', async (_$, e) => { store.set(e.key, e.value); return { value: undefined } })
    let soltar: (() => void) | undefined
    on('model.classify', async () => {
      await new Promise<void>(r => { soltar = r })
      return { value: 'build-large' }
    })
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-lenta' } })
    await $.agent.spawn(BUILD)
    expect(modelo).toBe('sonnet')
    for (let i = 0; i < 20 && !soltar; i++) await reloj.settle()
    // Pasa el tope de producción, pero no el límite de la sombra.
    await reloj.advance(1500)
    soltar!()
    let lista: Muestra[] | undefined
    for (let i = 0; i < 20 && !lista?.length; i++) {
      await reloj.settle()
      lista = store.get('sombra') as typeof lista
    }
    expect(lista?.length).toBe(1)
    expect(lista![0]!.sombra).toEqual({ tipo: 'build-large', ms: 1500, fuente: 'haiku' })
    expect(lista![0]!.pasoTope).toBe(true)
  })

  test('una sombra colgada se corta a los 60 s y se guarda como respaldo con su detalle', { options: { clasificador: 'reglas', sombra: 'haiku' } }, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const store = new Map<string, unknown>()
    on('store.get', async (_$, e) => ({ value: store.get(e.key) }))
    on('store.set', async (_$, e) => { store.set(e.key, e.value); return { value: undefined } })
    on('model.classify', async (_$, _e, next) =>
      new Promise<{ value: undefined }>(r => next.signal.addEventListener('abort', () => r({ value: undefined }))))
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-colgada' }))
    await $.agent.spawn(BUILD)
    await reloj.settle()
    await reloj.advance(59_999)
    await reloj.settle()
    expect(store.get('sombra')).toBe(undefined)
    await reloj.advance(1)
    let lista: Muestra[] | undefined
    for (let i = 0; i < 20 && !lista?.length; i++) {
      await reloj.settle()
      lista = store.get('sombra') as typeof lista
    }
    expect(lista![0]!.sombra).toEqual({ tipo: 'build-small', ms: 0, fuente: 'respaldo', detalle: 'tardó más de 60000 ms' })
    expect(lista![0]!.pasoTope).toBe(false)
  })

  test('jev de sombra corre con umbral 0: guarda su elección y su confianza real', { options: { clasificador: 'haiku', sombra: 'jev', jevUmbral: 0.9 } }, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const store = new Map<string, unknown>()
    on('store.get', async (_$, e) => ({ value: store.get(e.key) }))
    on('store.set', async (_$, e) => { store.set(e.key, e.value); return { value: undefined } })
    mock.env(on, { JEV_API_KEY: 'k' })
    on('model.classify', async () => ({ value: 'build-large' }))
    on('http.fetch', async () => ({ value: { status: 200, ok: true, headers: {}, text: respuestaJev('build-small', 0.3) } }))
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-umbral' }))
    await $.agent.spawn(BUILD)
    let lista: Muestra[] | undefined
    for (let i = 0; i < 20 && !lista?.length; i++) {
      await reloj.settle()
      lista = store.get('sombra') as typeof lista
    }
    expect(lista![0]!.sombra).toEqual({ tipo: 'build-small', confianza: 0.3, ms: 0, fuente: 'jev' })
  })

  test('con haiku, sombra jev y sin key: el toast dice que la sombra quedó desactivada', { options: { clasificador: 'haiku', sombra: 'jev' } }, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const store = new Map<string, unknown>()
    on('store.get', async (_$, e) => ({ value: store.get(e.key) }))
    on('store.set', async (_$, e) => { store.set(e.key, e.value); return { value: undefined } })
    mock.env(on, {})
    const toasts: string[] = []
    on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } })
    on('model.classify', async () => ({ value: 'build-large' }))
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-sin-sombra' } })
    await $.agent.spawn(BUILD)
    expect(modelo).toBe('opus')
    expect(toasts).toEqual(['Router: falta la key de Jev (/config o JEV_API_KEY); sombra desactivada'])
    for (let i = 0; i < 5; i++) await reloj.settle()
    expect(store.get('sombra')).toBe(undefined)
  })

  test('con las opciones vacías no llama a ningún clasificador ni busca la key', { options: {} }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    const llamadas: string[] = []
    on('model.classify', async () => { llamadas.push('model.classify'); return { value: 'build-large' } })
    on('http.fetch', async () => { llamadas.push('http.fetch'); return { value: { status: 500, ok: false, headers: {}, text: '' } } })
    on('env.get', async () => { llamadas.push('env.get'); return { value: undefined } })
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-defaults' } })
    // Sin regla: con un clasificador configurado, este spawn lo llamaría.
    await $.agent.spawn({ ...SPAWN, description: 'Real data for Inicio', prompt: 'Conectá los datos reales.' })
    expect(llamadas).toEqual([])
    expect(modelo).toBe('sonnet')
  })

  test('topeMs se acota a [50, 8000]', { options: { clasificador: 'haiku', topeMs: 1 } }, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    mock.store(on)
    on('model.classify', async (_$, _e, next) =>
      new Promise<{ value: undefined }>(r => next.signal.addEventListener('abort', () => r({ value: undefined }))))
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-tope-min' }))
    const spawn = $.agent.spawn(BUILD)
    let termino = false
    void spawn.then(() => { termino = true })
    await reloj.settle()
    await reloj.advance(49)
    await reloj.settle()
    expect(termino).toBe(false)
    await reloj.advance(1)
    expect((await spawn).agentId).toBe('ag-tope-min')
  })

  test('topeMs grande se acota a 8000', { options: { clasificador: 'haiku', topeMs: 99_999 } }, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    mock.store(on)
    on('model.classify', async (_$, _e, next) =>
      new Promise<{ value: undefined }>(r => next.signal.addEventListener('abort', () => r({ value: undefined }))))
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-tope-max' }))
    const spawn = $.agent.spawn(BUILD)
    let termino = false
    void spawn.then(() => { termino = true })
    await reloj.settle()
    await reloj.advance(7999)
    await reloj.settle()
    expect(termino).toBe(false)
    await reloj.advance(1)
    expect((await spawn).agentId).toBe('ag-tope-max')
  })

  test('jevUmbral se acota a 1: con confianza 1, Jev decide', { options: { clasificador: 'jev', jevUmbral: 5 } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    mock.env(on, { JEV_API_KEY: 'k' })
    on('http.fetch', async () => ({ value: { status: 200, ok: true, headers: {}, text: respuestaJev('build-large', 1) } }))
    let modelo: string | undefined
    on('agent.spawn', async (_$, e) => { modelo = e.model; return { model: e.model ?? 'inherit', agentId: 'ag-umbral-max' } })
    await $.agent.spawn(BUILD)
    expect(modelo).toBe('opus')
  })

  test('dos muestras que se guardan a la vez no se pisan', { options: { clasificador: 'reglas', sombra: 'haiku' } }, async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const store = new Map<string, unknown>()
    // Un get lento abre la ventana en la que dos get → set se intercalarían.
    on('store.get', async (_$, e) => {
      for (let i = 0; i < 10; i++) await Promise.resolve()
      return { value: store.get(e.key) }
    })
    on('store.set', async (_$, e) => { store.set(e.key, e.value); return { value: undefined } })
    on('model.classify', async () => ({ value: 'build-large' }))
    let n = 0
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: `ag-par${++n}` }))
    await Promise.all([$.agent.spawn(BUILD), $.agent.spawn({ ...BUILD, tool_use_id: 'tu-2' })])
    let lista: unknown[] | undefined
    for (let i = 0; i < 20 && (lista?.length ?? 0) < 2; i++) {
      await reloj.settle()
      lista = store.get('sombra') as unknown[] | undefined
    }
    expect(lista?.length).toBe(2)
  })
})

const RESUMEN_BANCO = { chars: 6000, archivos: 2, pasos: 3, mencionaSpec: true }
const CASOS_BANCO = JSON.stringify({
  casos: [
    { id: 'c1', descripcion: 'Implement Task 1', resumen: RESUMEN_BANCO, etiquetasProduccion: ['build-large', 'build-small'] },
    { id: 'c2', descripcion: 'Research X', resumen: RESUMEN_BANCO, etiquetasProduccion: null },
    { id: 'c3', descripcion: 'Implement Task 3', resumen: RESUMEN_BANCO, etiquetasProduccion: ['build-large', 'build-small'] },
    { id: 'c4', descripcion: 'Implement Task 4', resumen: RESUMEN_BANCO, etiquetasProduccion: ['build-large', 'build-small'] },
  ],
})

// El nombre va en hora local: se calcula con el mismo helper para no depender del huso del test.
const ARCHIVO = nombreCorrida(new Date(AHORA))

describe('/router banco', () => {
  test('corre haiku y jev sin tope ni umbral y escribe la corrida', { options: { clasificador: 'reglas', topeMs: 1, jevUmbral: 0.99 } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.env(on, { JEV_API_KEY: 'k' })
    on('session.cwd', async () => ({ value: 'C:/proyecto' }))
    // El engine normaliza la ruta (en Windows, con barras invertidas): se compara con barras.
    const barras = (p: string) => p.replaceAll('\\', '/')
    let leido = ''
    on('fs.read', async (_$, e) => { leido = barras(e.path); return { value: CASOS_BANCO } })
    const escrito: Record<string, string> = {}
    on('fs.write', async (_$, e) => { escrito[barras(e.path)] = e.text; return { value: undefined } })
    on('model.classify', async () => ({ value: 'build-large' }))
    // Confianza baja: con el umbral de /config Jev se descartaría; en el banco no.
    on('http.fetch', async () => ({ value: { status: 200, ok: true, headers: {}, text: respuestaJev('build-small', 0.3) } }))

    const out = await $.command.run({ command: 'router', args: 'banco --max 2' })
    expect(leido).toBe('C:/proyecto/bench/casos.json')
    expect(out.text).toBe(`Banco: 2 casos · haiku 2 ok / 0 error · jev 2 ok / 0 error · ${ARCHIVO}`)
    const corrida = JSON.parse(escrito[`C:/proyecto/${ARCHIVO}`]!)
    expect(corrida.fecha).toBe('2026-10-06T12:00:00.000Z')
    expect(corrida.clasificadores).toEqual(['haiku', 'jev'])
    expect(corrida.resultados.map((r: { id: string }) => r.id).sort()).toEqual(['c1', 'c1', 'c3', 'c3'])
    expect(corrida.resultados.find((r: { fuente: string }) => r.fuente === 'jev')).toMatchObject({ tipo: 'build-small', confianza: 0.3, error: null })
    expect(JSON.stringify(escrito).includes('Bearer')).toBe(false)
  })

  test('sin key de Jev corre solo Haiku y lo dice', async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.env(on, {})
    on('session.cwd', async () => ({ value: 'C:/proyecto' }))
    on('fs.read', async () => ({ value: CASOS_BANCO }))
    on('fs.write', async () => ({ value: undefined }))
    on('model.classify', async () => ({ value: 'build-large' }))
    const out = await $.command.run({ command: 'router', args: 'banco --solo jev' })
    expect(out.text).toBe(
      `Banco: 3 casos · haiku 3 ok / 0 error · ${ARCHIVO} · sin key de Jev (/config o JEV_API_KEY): corrió solo Haiku`,
    )
  })

  test('una llamada colgada termina en error a los 60 s y el banco sigue', async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    mock.env(on, {})
    on('session.cwd', async () => ({ value: 'C:/proyecto' }))
    on('fs.read', async () => ({ value: CASOS_BANCO }))
    on('fs.write', async () => ({ value: undefined }))
    // Nunca responde por su cuenta; se suelta cuando su dispatch se aborta.
    on('model.classify', async (_$, _e, next) =>
      new Promise<{ value: undefined }>(r => next.signal.addEventListener('abort', () => r({ value: undefined }))))
    const corrida = $.command.run({ command: 'router', args: 'banco --solo haiku --max 1' })
    await reloj.settle()
    await reloj.advance(59_999)
    let termino = false
    void corrida.then(() => { termino = true })
    await reloj.settle()
    expect(termino).toBe(false)
    await reloj.advance(1)
    const out = await corrida
    expect(out.text).toBe(`Banco: 1 caso · haiku 0 ok / 1 error · ${ARCHIVO}`)
  })

  test('si no encuentra los casos, responde el error', async ($, on) => {
    mock.clock(on, { now: AHORA })
    on('session.cwd', async () => ({ value: 'C:/proyecto' }))
    on('fs.read', async () => ({ deny: 'ENOENT' }))
    const out = await $.command.run({ command: 'router', args: 'banco' })
    expect(out.text.startsWith('Banco: falló (')).toBe(true)
  })
})

// Un store en memoria propio: deja leer lo que guardó el router y simular fallas.
function storeEnMemoria(
  on: On,
  opciones: { setFalla?: boolean; getLento?: boolean; getFalla?: string[]; inicial?: Record<string, unknown> } = {},
) {
  const store = new Map<string, unknown>(Object.entries(opciones.inicial ?? {}))
  const borrados: string[] = []
  on('store.get', async (_$, e) => {
    if (opciones.getLento) for (let i = 0; i < 10; i++) await Promise.resolve()
    if (opciones.getFalla?.includes(e.key)) return { deny: 'lectura caída' }
    return { value: store.get(e.key) }
  })
  on('store.set', async (_$, e) => {
    if (opciones.setFalla) return { deny: 'disco lleno' }
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.keys', async () => ({ value: [...store.keys()] }))
  on('store.delete', async (_$, e) => { borrados.push(e.key); store.delete(e.key); return { value: undefined } })
  return Object.assign(store, { borrados })
}

/** La fila "reviews en Opus", mirando solo la columna de la sesión. */
const reviewsSesion = (valor: string) => new RegExp(`^reviews en Opus\\s+${valor}\\s`)

describe('métricas de subagentes que el router no toca', () => {
  test('un review con [pin] y model sonnet cuenta como review no Opus', async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-pin' }))
    await $.agent.spawn({ ...SPAWN, description: 'Review Task 6 [pin]', model: 'sonnet' })
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PANE_PROPS })
    await ui.press({ key: 'tab-metricas' })
    expect(await ui.find({ text: reviewsSesion('0%') })).toBeDefined()
    await ui.unmount()
  })

  test('un review sin model, con padre Opus y el router apagado, cuenta como Opus', async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-off' }))
    await $.command.run({ command: 'router', args: 'off' })
    await $.agent.spawn({ ...SPAWN, model: undefined, parentModel: 'claude-opus-5-5' })
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PANE_PROPS })
    await ui.press({ key: 'tab-metricas' })
    expect(await ui.find({ text: reviewsSesion('100%') })).toBeDefined()
    await ui.unmount()
  })
})

const FIN = { answer: 'listo', durationMs: 1000, isAborted: false, turnId: 't-1', reason: 'answer' } as const

describe('historial y ventanas', () => {
  test('turn.complete de un subagente deja su registro en el historial', async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const store = storeEnMemoria(on)
    on('session.id', async () => ({ value: 'ses-1' }))
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-h1' }))
    on('turn.complete', async (_$, e) => ({ text: e.answer }))
    await $.agent.spawn(SPAWN)
    await $.turn.complete({ ...FIN, agentId: 'ag-h1' })
    let lista: { sesion: string; tarea: string | null; tipo: string | null; modelo: string | null }[] | undefined
    for (let i = 0; i < 20 && !lista?.length; i++) {
      await reloj.settle()
      lista = store.get('historial:ses-1') as typeof lista
    }
    expect(lista?.length).toBe(1)
    expect(lista![0]).toMatchObject({ sesion: 'ses-1', tarea: 'Tarea 6', tipo: 'review-small', modelo: 'opus', inicio: AHORA, fin: AHORA })
  })

  test('si store.set falla, turn.complete igual resuelve', async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    storeEnMemoria(on, { setFalla: true })
    on('session.id', async () => ({ value: 'ses-1' }))
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-h2' }))
    on('turn.complete', async (_$, e) => ({ text: e.answer }))
    await $.agent.spawn(SPAWN)
    const r = await $.turn.complete({ ...FIN, agentId: 'ag-h2' })
    expect(r.text).toBe('listo')
    for (let i = 0; i < 5; i++) await reloj.settle()
    // Y el panel sale igual.
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PANE_PROPS })
    expect(await ui.find({ text: /Sin subagentes corriendo/ })).toBeDefined()
    await ui.unmount()
  })

  test('session.measure guarda la ventana y una lectura más alta sube maxUsado', async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const store = storeEnMemoria(on)
    on('session.measure', async (_$, e) => ({ changed: e.changed }))
    const resetsAt = new Date(AHORA + 3 * 3_600_000).toISOString()
    const medir = (percentUsed: number) => $.session.measure({
      context: { window: 1_000_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed, resetsAt }],
      changed: ['rateLimits'],
    })
    await medir(20)
    let lista: { resetsAt: string; maxUsado: number }[] | undefined
    for (let i = 0; i < 20 && !lista?.length; i++) {
      await reloj.settle()
      lista = store.get('ventanas') as typeof lista
    }
    expect(lista).toEqual([{ resetsAt, maxUsado: 20, primeraVista: AHORA, ultimaVista: AHORA }])
    await reloj.advance(60_000)
    await medir(45)
    for (let i = 0; i < 20 && lista?.[0]?.maxUsado !== 45; i++) {
      await reloj.settle()
      lista = store.get('ventanas') as typeof lista
    }
    expect(lista).toEqual([{ resetsAt, maxUsado: 45, primeraVista: AHORA, ultimaVista: AHORA + 60_000 }])
  })

  test('dos turn.complete seguidos dejan 2 registros', async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    // Un get lento abre la ventana en la que dos get → set se intercalarían.
    const store = storeEnMemoria(on, { getLento: true })
    on('session.id', async () => ({ value: 'ses-1' }))
    let n = 0
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: `ag-c${++n}` }))
    on('turn.complete', async (_$, e) => ({ text: e.answer }))
    await $.agent.spawn(SPAWN)
    await $.agent.spawn({ ...SPAWN, tool_use_id: 'tu-2', description: 'Implement Task 7' })
    await Promise.all([$.turn.complete({ ...FIN, agentId: 'ag-c1' }), $.turn.complete({ ...FIN, turnId: 't-2', agentId: 'ag-c2' })])
    let lista: { tarea: string | null }[] | undefined
    for (let i = 0; i < 20 && (lista?.length ?? 0) < 2; i++) {
      await reloj.settle()
      lista = store.get('historial:ses-1') as typeof lista
    }
    expect(lista?.map(r => r.tarea).sort()).toEqual(['Tarea 6', 'Tarea 7'])
  })
})

const DIA = 86_400_000
const registroGuardado = (sesion: string, fin: number, c: Record<string, unknown> = {}) => ({
  sesion, tarea: 'Tarea 1', tipo: 'review', modelo: 'opus', pedido: 'opus', reasignado: false, inicio: fin, fin, ...c,
})

/** Espera, moviendo el reloj, hasta que `listo` dé true (o se rinde a las 30 vueltas). */
async function esperar(reloj: { settle: () => Promise<unknown> }, listo: () => boolean) {
  for (let i = 0; i < 30 && !listo(); i++) await reloj.settle()
}

describe('historial por sesión', () => {
  test('dos sesiones escriben en claves distintas y el panel suma las dos', async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const store = storeEnMemoria(on)
    let sesion = 'ses-A'
    on('session.id', async () => ({ value: sesion }))
    let n = 0
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: `ag-s${++n}` }))
    on('turn.complete', async (_$, e) => ({ text: e.answer }))
    // Sesión A: un review que el router sube a Opus.
    await $.agent.spawn(SPAWN)
    await $.turn.complete({ ...FIN, agentId: 'ag-s1' })
    await esperar(reloj, () => store.has('historial:ses-A'))
    // Sesión B: un review con [pin] que queda en Sonnet.
    sesion = 'ses-B'
    await $.agent.spawn({ ...SPAWN, tool_use_id: 'tu-2', description: 'Review Task 6 [pin]' })
    await $.turn.complete({ ...FIN, turnId: 't-2', agentId: 'ag-s2' })
    await esperar(reloj, () => store.has('historial:ses-B'))
    expect(store.has('historial')).toBe(false)
    expect((store.get('historial:ses-A') as { sesion: string }[]).map(r => r.sesion)).toEqual(['ses-A'])
    expect((store.get('historial:ses-B') as { sesion: string }[]).map(r => r.sesion)).toEqual(['ses-B'])
    const ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PANE_PROPS })
    await ui.press({ key: 'tab-metricas' })
    // Columna de 7 días: 2 reviews, 1 en Opus.
    expect(await ui.find({ text: /^reviews en Opus\s+\S+\s+50%\s/ })).toBeDefined()
    await ui.unmount()
  })

  test('al escribir, poda las sesiones cuyo último fin tiene más de 14 días', async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const store = storeEnMemoria(on, {
      inicial: {
        'historial:vieja': [registroGuardado('vieja', AHORA - 20 * DIA), registroGuardado('vieja', AHORA - 15 * DIA)],
        'historial:reciente': [registroGuardado('reciente', AHORA - 20 * DIA), registroGuardado('reciente', AHORA - 13 * DIA)],
        ventanas: [],
      },
    })
    on('session.id', async () => ({ value: 'ses-1' }))
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-p1' }))
    on('turn.complete', async (_$, e) => ({ text: e.answer }))
    await $.agent.spawn(SPAWN)
    await $.turn.complete({ ...FIN, agentId: 'ag-p1' })
    await esperar(reloj, () => store.has('historial:ses-1') && !store.has('historial:vieja'))
    expect([...store.keys()].sort()).toEqual(['historial:reciente', 'historial:ses-1', 'ventanas'])
  })

  test('una clave cuya lectura falla no se poda y la escritura igual entra', async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const store = storeEnMemoria(on, {
      getFalla: ['historial:rota'],
      inicial: { 'historial:rota': [registroGuardado('rota', AHORA - 20 * DIA)], ventanas: [] },
    })
    on('session.id', async () => ({ value: 'ses-1' }))
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-p2' }))
    on('turn.complete', async (_$, e) => ({ text: e.answer }))
    await $.agent.spawn(SPAWN)
    await $.turn.complete({ ...FIN, agentId: 'ag-p2' })
    await esperar(reloj, () => store.has('historial:ses-1'))
    await reloj.advance(100)
    expect(store.borrados).not.toContain('historial:rota')
    expect(store.has('historial:rota')).toBe(true)
  })

  test('migra la clave vieja: la lee como una sesión más y la borra', async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const viejos = [registroGuardado('antes', AHORA - 2 * DIA, { modelo: 'sonnet', pedido: 'sonnet' })]
    const store = storeEnMemoria(on, { inicial: { historial: viejos } })
    on('session.id', async () => ({ value: 'ses-1' }))
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-m1' }))
    on('turn.complete', async (_$, e) => ({ text: e.answer }))
    // Antes de migrar, el panel ya la lee: 1 review, no en Opus.
    let ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PANE_PROPS })
    await ui.press({ key: 'tab-metricas' })
    expect(await ui.find({ text: /^reviews en Opus\s+\S+\s+0%\s/ })).toBeDefined()
    await ui.unmount()

    await $.agent.spawn(SPAWN)
    await $.turn.complete({ ...FIN, agentId: 'ag-m1' })
    await esperar(reloj, () => store.has('historial:ses-1') && !store.has('historial'))
    expect(store.has('historial')).toBe(false)
    expect(store.get('historial:legado')).toEqual(viejos)
    // Después, los registros viejos siguen contando: 2 reviews, 1 en Opus.
    ui = await $.ui.mount({ plugin: 'agent-router', surface: 'terminal', component: 'Pane', requestId: 'router', props: PANE_PROPS })
    await ui.press({ key: 'tab-metricas' })
    expect(await ui.find({ text: /^reviews en Opus\s+\S+\s+50%\s/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('historial de decisiones', () => {
  test('el registro guarda descripción, elegido, motivos y el modo de la política', async ($, on) => {
    const reloj = mock.clock(on, { now: AHORA })
    const store = storeEnMemoria(on)
    on('session.id', async () => ({ value: 'ses-1' }))
    on('session.measure', async (_$, e) => ({ changed: e.changed }))
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-d1' }))
    on('turn.complete', async (_$, e) => ({ text: e.answer }))
    await $.command.run({ command: 'router', args: 'hot on' })
    // 🔥: faltan 24 minutos y se usó 38%.
    await $.session.measure({
      context: { window: 1_000_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 38, resetsAt: new Date(AHORA + 24 * 60_000).toISOString() }],
      changed: ['rateLimits'],
    })
    await $.agent.spawn(SPAWN)
    await $.turn.complete({ ...FIN, agentId: 'ag-d1' })
    await esperar(reloj, () => store.has('historial:ses-1'))
    const [r] = store.get('historial:ses-1') as Record<string, unknown>[]
    expect(r).toMatchObject({ descripcion: 'Review Task 6 (spec + quality)', elegido: 'opus·xhigh', modo: 'fuego' })
    expect((r!.motivos as string[]).some(m => /regla review/.test(m))).toBe(true)
  })
})

describe('/router historial', () => {
  const guardado = (c: Record<string, unknown> = {}) => ({
    sesion: 'vieja-123456', tarea: 'Tarea 1', tipo: 'review', modelo: 'opus', pedido: 'sonnet', reasignado: true,
    inicio: AHORA - DIA, fin: AHORA - DIA + 60_000, descripcion: 'Review Task 1', elegido: 'opus·xhigh',
    motivos: ['regla review'], modo: 'normal', ...c,
  })

  test('exporta el Markdown a <home>/.claude/router-historial.md y responde con la ruta', async ($, on) => {
    mock.clock(on, { now: AHORA })
    storeEnMemoria(on, { inicial: { 'historial:vieja-123456': [guardado(), guardado({ tarea: 'Tarea 2', inicio: AHORA - 9 * DIA, fin: AHORA - 9 * DIA, descripcion: 'Fuera' })] } })
    mock.env(on, { USERPROFILE: 'C:\\Users\\yo', HOME: '/no/este' })
    on('session.id', async () => ({ value: 'ses-1' }))
    const escritos: Record<string, string> = {}
    on('fs.write', async (_$, e) => { escritos[e.path] = e.text; return { value: undefined } })
    const out = await $.command.run({ command: 'router', args: 'historial' })
    // Con el separador que trae el home.
    const ruta = 'C:\\Users\\yo\\.claude\\router-historial.md'
    expect(Object.keys(escritos)).toEqual([ruta])
    expect(out.text).toBe(`Router: 1 decisión de los últimos 7 días → ${ruta}`)
    const md = escritos[ruta]!
    expect(md.startsWith('# Historial del router')).toBe(true)
    expect(md).toContain('## Sesión vieja-12 ·')
    expect(md).toContain('| review | Review Task 1 | sonnet → opus·xhigh | normal | regla review |')
    expect(md).not.toContain('Fuera')
  })

  test('suma lo de esta sesión que todavía no llegó al store, y respeta los días', async ($, on) => {
    mock.clock(on, { now: AHORA })
    // El store no guarda nada: la decisión sale de la memoria.
    storeEnMemoria(on, { setFalla: true, inicial: { 'historial:vieja-123456': [guardado({ inicio: AHORA - 2 * DIA, fin: AHORA - 2 * DIA })] } })
    mock.env(on, { HOME: '/home/yo' })
    on('session.id', async () => ({ value: 'ses-actual-1' }))
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-x1' }))
    on('turn.complete', async (_$, e) => ({ text: e.answer }))
    let escrito = ''
    on('fs.write', async (_$, e) => { escrito = e.text; return { value: undefined } })
    await $.agent.spawn(SPAWN)
    await $.turn.complete({ ...FIN, agentId: 'ag-x1' })
    const out = await $.command.run({ command: 'router', args: 'historial 1' })
    expect(out.text).toBe('Router: 1 decisión del último día → /home/yo/.claude/router-historial.md')
    expect(escrito).toContain('## Sesión ses-actu')
    expect(escrito).toContain('Review Task 6 (spec + quality)')
    expect(escrito).not.toContain('vieja-12')
  })

  test('sin home, responde el error sin romper', async ($, on) => {
    mock.clock(on, { now: AHORA })
    storeEnMemoria(on)
    mock.env(on, {})
    on('fs.write', async () => ({ deny: 'EACCES' }))
    const sinHome = await $.command.run({ command: 'router', args: 'historial' })
    expect(sinHome.text).toBe('Router: no pude exportar el historial (no encuentro el home: USERPROFILE ni HOME)')
  })

  test('si la escritura falla, lo dice', async ($, on) => {
    mock.clock(on, { now: AHORA })
    storeEnMemoria(on)
    mock.env(on, { HOME: '/home/yo' })
    on('fs.write', async () => ({ deny: 'EACCES' }))
    const out = await $.command.run({ command: 'router', args: 'historial' })
    expect(out.text.startsWith('Router: no pude exportar el historial (')).toBe(true)
  })
})

describe('avisos en el resultado de Agent', () => {
  // La llamada a Agent como la hace el modelo: el hook de abajo hace de core y lanza el subagente
  // con el tool_use_id de la llamada, como el Agent tool real.
  const CALL = { tool: 'Agent', description: SPAWN.description, prompt: SPAWN.prompt, subagent_type: 'general-purpose', model: 'sonnet' } as const
  function agentComoCore(on: On, spawnar: (toolUseId: string) => Promise<unknown>) {
    on('agent.spawn', async (_$, e) => ({ model: e.model ?? 'inherit', agentId: 'ag-av' }))
    on('tool.call', async (_$, e) => {
      await spawnar(e.tool_use_id)
      // Solo lo que mira el test: el registro completo del Agent tool no hace falta acá.
      return { result: { agentId: 'ag-av', content: [{ type: 'text', text: 'lanzado' }] } as any }
    })
  }

  test('apagado por defecto: el resultado de Agent no lleva aviso', async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    agentComoCore(on, id => $.agent.spawn({ ...SPAWN, tool_use_id: id }))
    const r = await $.tool.call(CALL)
    expect(r.deny).toBe(undefined)
    expect(r.context ?? []).toEqual([])
  })

  test('prendido, si el router reasignó, Claude ve una línea en el resultado', { options: { avisarAClaude: true } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    agentComoCore(on, id => $.agent.spawn({ ...SPAWN, tool_use_id: id }))
    const r = await $.tool.call(CALL)
    expect(r.context).toEqual(['(router: corre en opus·medium — regla review · respaldo → review-small)'])
  })

  test('un spawn sin model que hereda opus y sale en opus no cuenta como reasignado', { options: { avisarAClaude: true } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    agentComoCore(on, id => $.agent.spawn({ ...SPAWN, tool_use_id: id, model: undefined, parentModel: 'claude-opus-5-5' }))
    const r = await $.tool.call({ ...CALL, model: undefined })
    expect(r.context ?? []).toEqual([])
  })

  test('con el padre en alias (opus) tampoco cuenta como reasignado', { options: { avisarAClaude: true } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    agentComoCore(on, id => $.agent.spawn({ ...SPAWN, tool_use_id: id, model: 'opus', parentModel: 'opus' }))
    const r = await $.tool.call({ ...CALL, model: 'opus' })
    expect(r.context ?? []).toEqual([])
  })

  test('prendido, sin reasignar no avisa', { options: { avisarAClaude: true } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    agentComoCore(on, id => $.agent.spawn({ ...SPAWN, tool_use_id: id, description: 'Review Task 6 [pin]' }))
    const r = await $.tool.call({ ...CALL, description: 'Review Task 6 [pin]' })
    expect(r.context ?? []).toEqual([])
  })

  test('por defecto, sin regla en la description, Claude ve cómo nombrar', async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    const SIN_REGLA = { ...SPAWN, description: 'v2: kubernetes', prompt: 'Servicio: kubernetes.' }
    agentComoCore(on, id => $.agent.spawn({ ...SIN_REGLA, tool_use_id: id }))
    const r = await $.tool.call({ ...CALL, description: 'v2: kubernetes', prompt: 'Servicio: kubernetes.' })
    expect(r.context).toEqual([
      'router: no reconocí el tipo de "v2: kubernetes" y lo clasifiqué como build-small. Empezá la description con el verbo del tipo (Implement, Review, Re-review, Fix, Explore, Research, Write) y usá `Task N`.',
    ])
  })

  test('ensenarConvencion apagado: sin aviso', { options: { ensenarConvencion: false } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    agentComoCore(on, id => $.agent.spawn({ ...SPAWN, tool_use_id: id, description: 'v2: kubernetes', prompt: 'Servicio: kubernetes.' }))
    const r = await $.tool.call({ ...CALL, description: 'v2: kubernetes', prompt: 'Servicio: kubernetes.' })
    expect(r.context ?? []).toEqual([])
  })

  test('con los dos avisos prendidos salen las dos líneas, primero la de avisarAClaude', { options: { avisarAClaude: true } }, async ($, on) => {
    mock.clock(on, { now: AHORA })
    mock.store(on)
    // Pide haiku y el respaldo da build-small (sonnet·medium): hay reasignación y no hubo regla.
    const SIN_REGLA = { description: 'v2: kubernetes', prompt: 'Servicio: kubernetes.', model: 'haiku' }
    agentComoCore(on, id => $.agent.spawn({ ...SPAWN, ...SIN_REGLA, tool_use_id: id }))
    const r = await $.tool.call({ ...CALL, ...SIN_REGLA })
    expect(r.context).toEqual([
      '(router: corre en sonnet·medium — ninguna regla · respaldo → build-small)',
      'router: no reconocí el tipo de "v2: kubernetes" y lo clasifiqué como build-small. Empezá la description con el verbo del tipo (Implement, Review, Re-review, Fix, Explore, Research, Write) y usá `Task N`.',
    ])
  })
})
