import { describe, expect, test } from 'claude-code/testing'
import type { Clasificador } from '../src/clasificadores'
import { respaldo } from '../src/clasificadores'
import { ajustarAPermitidos, decidir, motivoError, motivoPolitica } from '../src/decidir'
import type { Contexto, EntradaDecision } from '../src/decidir'
import { OVERRIDES_INICIAL } from '../src/overrides'
import { tablaDe } from '../src/taxonomia'
import type { EstadoPolitica } from '../src/politica'

const NORMAL: EstadoPolitica = { modo: 'normal', escalones: 0, motivo: '', minutosAlReset: 200 }
const FUEGO: EstadoPolitica = { modo: 'fuego', escalones: 2, motivo: '', minutosAlReset: 20 }
const ctx = (cambios: Partial<Contexto> = {}): Contexto => ({
  overrides: OVERRIDES_INICIAL, politica: NORMAL, clasificar: respaldo, jevDecideReviews: false, ...cambios,
})
const entrada = (cambios: Partial<EntradaDecision> = {}): EntradaDecision => ({
  descripcion: 'Review Task 6 (spec + quality)',
  prompt: 'Revisá la tarea 6.',
  subagentType: 'general-purpose',
  modeloPedido: 'sonnet',
  fork: false,
  ...cambios,
})

describe('motivoPolitica', () => {
  test('dice cuánto subió, y nada si no subió', () => {
    expect(motivoPolitica(5, 6)).toBe('política +1')
    expect(motivoPolitica(6, 6)).toBe(null)
  })
})

describe('decidir', () => {
  test('el motivo de la política dice cuánto subió de verdad', async () => {
    const d = await decidir(entrada({ descripcion: 'Re-review Task 2 fix round 1' }), ctx({ politica: FUEGO }))
    expect(d.motivos).toEqual(['regla re-review', 'política +2'])
    const f = await decidir(entrada({ descripcion: 'Fix wave: hallazgos' }), ctx({ politica: FUEGO }))
    expect(f.motivos).toEqual(['regla fix', 'política +2'])
  })

  test('review en modo normal: sin build ni clasificador, review-small opus·medium', async () => {
    const d = await decidir(entrada(), ctx())
    expect(d).toMatchObject({ tocar: true, tipo: 'review-small', escalon: { modelo: 'opus', esfuerzo: 'medium' } })
    expect(d.motivos).toEqual(['regla review', 'respaldo → review-small'])
  })

  test('build chico con 🔥 sube dos niveles: sonnet·medium → opus·medium', async () => {
    const d = await decidir(entrada({ descripcion: 'Implement Task 5b: fecha como marcador' }), ctx({ politica: FUEGO }))
    expect(d).toMatchObject({ tipo: 'build-small', escalon: { modelo: 'opus', esfuerzo: 'medium' } })
    expect(d.motivos).toEqual(['regla build', 'respaldo → build-small', 'política +2'])
  })

  test('explore con 🔥 se frena en su techo, haiku·high', async () => {
    // Base haiku·medium (1) +2 daría sonnet·low (3); el techo de explore lo deja en haiku·high (2).
    const d = await decidir(entrada({ descripcion: 'Explore: ingesta', subagentType: 'Explore' }), ctx({ politica: FUEGO }))
    expect(d).toMatchObject({ tipo: 'explore', escalon: { modelo: 'haiku', esfuerzo: 'high' } })
    expect(d.motivos).toEqual(['regla subagentType Explore', 'política +1', 'techo de explore'])
  })

  test('review-large ya está arriba de todo: la política no lo pasa del tope', async () => {
    const d = await decidir(entrada({ tallaBuildDeTarea: 'build-large' }), ctx({ politica: FUEGO }))
    expect(d).toMatchObject({ escalon: { modelo: 'opus', esfuerzo: 'xhigh' } })
  })

  test('sin regla, el clasificador recibe toda la taxonomía', async () => {
    let etiquetas: readonly string[] = []
    const espia: Clasificador = async p => { etiquetas = p.etiquetas; return { tipo: 'research', ms: 3, fuente: 'haiku', confianza: 0.81 } }
    const d = await decidir(entrada({ descripcion: 'Real data for Inicio' }), ctx({ clasificar: espia }))
    expect(etiquetas.length).toBe(9)
    expect(d).toMatchObject({ tipo: 'research' })
    expect(d.motivos).toEqual(['ninguna regla', 'haiku → research (0.81)'])
  })

  test('un build recibe solo las tallas', async () => {
    let etiquetas: readonly string[] = []
    const espia: Clasificador = async p => { etiquetas = p.etiquetas; return { tipo: 'build-large', ms: 3, fuente: 'jev' } }
    await decidir(entrada({ descripcion: 'Implement Task 11: el compilador' }), ctx({ clasificar: espia }))
    expect(etiquetas).toEqual(['build-large', 'build-small'])
  })

  test('apagado, fork y [pin] no se tocan', async () => {
    expect(await decidir(entrada(), ctx({ overrides: { ...OVERRIDES_INICIAL, activo: false } }))).toEqual({ tocar: false, motivos: ['router apagado'] })
    expect(await decidir(entrada({ fork: true }), ctx())).toEqual({ tocar: false, motivos: ['fork: hereda el modelo'] })
    expect(await decidir(entrada({ descripcion: 'Review Task 6 [pin]' }), ctx())).toEqual({ tocar: false, motivos: ['[pin]: respeta lo que pidió Claude'] })
  })

  test('fijado le gana a la política', async () => {
    const overrides = { ...OVERRIDES_INICIAL, fijados: { 'build-small': { modelo: 'sonnet' as const, esfuerzo: 'low' as const } } }
    const d = await decidir(entrada({ descripcion: 'Implement Task 2: tablas' }), ctx({ overrides, politica: FUEGO }))
    expect(d).toMatchObject({ escalon: { modelo: 'sonnet', esfuerzo: 'low' } })
    expect(d.motivos).toContain('fijado con /router: sonnet·low')
  })

  test('permitidos lleva al modelo permitido más cercano, prefiriendo subir', async () => {
    const overrides = { ...OVERRIDES_INICIAL, permitidos: ['sonnet' as const] }
    const d = await decidir(entrada(), ctx({ overrides }))
    expect(d).toMatchObject({ escalon: { modelo: 'sonnet', esfuerzo: 'high' } })
    expect(d.motivos).toContain('permitidos: sonnet')
  })

  test('el motivo explica por qué se usó el respaldo', async () => {
    const lento: Clasificador = async () => ({ tipo: 'build-large', ms: 0, fuente: 'respaldo', detalle: 'tardó más de 1000 ms' })
    const d = await decidir(entrada({ descripcion: 'Implement Task 11: el compilador' }), ctx({ clasificar: lento }))
    expect(d.motivos).toContain('respaldo (tardó más de 1000 ms) → build-large')
  })
})

describe('ajustarAPermitidos', () => {
  test('sin restricción o modelo permitido: igual', () => {
    const e = { modelo: 'opus' as const, esfuerzo: 'high' as const }
    expect(ajustarAPermitidos(e, null)).toBe(e)
    expect(ajustarAPermitidos(e, ['opus'])).toBe(e)
  })

  test('haiku no permitido sube a sonnet·low', () => {
    expect(ajustarAPermitidos({ modelo: 'haiku' }, ['sonnet', 'opus'])).toEqual({ modelo: 'sonnet', esfuerzo: 'low' })
  })

  test('opus·max (fuera de la escalera) con solo sonnet baja a sonnet·high', () => {
    expect(ajustarAPermitidos({ modelo: 'opus', esfuerzo: 'max' }, ['sonnet'])).toEqual({ modelo: 'sonnet', esfuerzo: 'high' })
  })
})

describe('motivoError', () => {
  test('recorta el motivo a 80 caracteres, como el detalle del clasificador', () => {
    const m = motivoError(new Error('x'.repeat(200)))
    expect(m.startsWith('error del router: Error: xxx')).toBe(true)
    expect(m).toHaveLength(80)
    expect(motivoError('corto')).toBe('error del router: corto')
  })
})

const jevDice = (tipo: string, confianza: number, detalle?: string): Clasificador => async () =>
  ({ tipo: tipo as any, confianza, ms: 1, fuente: 'jev', ...(detalle ? { detalle } : {}) })

describe('Jev decide la familia review', () => {
  test('Jev seguro confirma la review', async () => {
    const d = await decidir(entrada(), ctx({ jevDecideReviews: true, clasificar: jevDice('review', 0.98) }))
    expect(d).toMatchObject({ tocar: true, tipo: 'review-small' })
    expect(d.motivos).toEqual(['regla review', 'jev → review (0.98)', 'jev → review (0.98)'])
  })

  test('Jev seguro cambia el tipo', async () => {
    const d = await decidir(entrada(), ctx({ jevDecideReviews: true, clasificar: jevDice('build-large', 0.93) }))
    expect(d).toMatchObject({ tocar: true, tipo: 'build-large', escalon: { modelo: 'opus', esfuerzo: 'medium' } })
    expect(d.motivos).toEqual(['regla review', 'jev → build-large (0.93)'])
  })

  test('Jev con duda: queda la regla', async () => {
    const d = await decidir(entrada(), ctx({ jevDecideReviews: true, clasificar: jevDice('build-small', 0.55, 'sin umbral') }))
    expect(d).toMatchObject({ tipo: 'review-small' })
    expect(d.motivos).toEqual(['regla review', 'jev dudó (0.55): queda la regla', 'jev (sin umbral) → build-small (0.55)'])
  })

  test('respaldo por tope: queda la regla y lo dice', async () => {
    const tope: Clasificador = async () => ({ tipo: 'build-small', ms: 1000, fuente: 'respaldo', detalle: 'tardó más de 1000 ms' })
    const d = await decidir(entrada({ descripcion: 'Re-review Task 2 fix round 1' }), ctx({ jevDecideReviews: true, clasificar: tope }))
    expect(d).toMatchObject({ tipo: 're-review' })
    expect(d.motivos).toEqual(['regla re-review', 'respaldo (tardó más de 1000 ms): queda la regla'])
  })

  test('Jev dice explore o write sin duda: una review no baja, queda la regla', async () => {
    const d = await decidir(entrada(), ctx({ jevDecideReviews: true, clasificar: jevDice('explore', 0.8) }))
    expect(d).toMatchObject({ tipo: 'review-small' })
    expect(d.motivos).toEqual(['regla review', 'jev → explore (0.80): queda la regla', 'jev → explore (0.80)'])
  })

  test('clasificador reglas (respaldo sin detalle): queda la regla y la talla sale del respaldo', async () => {
    const d = await decidir(entrada(), ctx({ jevDecideReviews: true }))
    expect(d.motivos).toEqual(['regla review', 'respaldo → review-small'])
  })

  test('sin jevDecideReviews no se consulta por el tipo: queda la regla y el clasificador solo da la talla', async () => {
    const etiquetas: (readonly string[])[] = []
    const espia: Clasificador = async p => { etiquetas.push(p.etiquetas); return { tipo: 'fix', ms: 600, fuente: 'haiku' } }
    const d = await decidir(entrada(), ctx({ jevDecideReviews: false, clasificar: espia }))
    expect(d).toMatchObject({ tipo: 'review-small' })
    expect(d.motivos).toEqual(['regla review', 'haiku → fix'])
    expect(etiquetas).toEqual([['review-large', 'review-small']])
  })

  test('regla de subagentType: no consulta', async () => {
    let llamado = false
    const espia: Clasificador = async () => { llamado = true; return { tipo: 'fix', confianza: 1, ms: 1, fuente: 'jev' } }
    const d = await decidir(entrada({ descripcion: 'Revisión final', subagentType: 'revisor-final-opus-xhigh' }), ctx({ jevDecideReviews: true, clasificar: espia }))
    expect(d).toMatchObject({ tipo: 'review-final' })
    expect(llamado).toBe(false)
  })

  test('fix, explore y write no consultan', async () => {
    let llamadas = 0
    const espia: Clasificador = async () => { llamadas++; return { tipo: 'review', confianza: 1, ms: 1, fuente: 'jev' } }
    for (const descripcion of ['Fix Task 3: hallazgos', 'Explore router src', 'Write the vault note'])
      await decidir(entrada({ descripcion }), ctx({ jevDecideReviews: true, clasificar: espia }))
    expect(llamadas).toBe(0)
  })

  test('la política se aplica sobre el tipo que decidió Jev', async () => {
    const d = await decidir(entrada(), ctx({ jevDecideReviews: true, clasificar: jevDice('build-small', 0.95), politica: FUEGO }))
    expect(d).toMatchObject({ tipo: 'build-small', escalon: { modelo: 'opus', esfuerzo: 'medium' } })
  })
})

describe('modelos de /config', () => {
  test('la base de un tipo sale de /config y el motivo lo dice', async () => {
    const d = await decidir(entrada(), ctx({ tabla: tablaDe({ modeloReview: 'opus·high' }) }))
    expect(d).toMatchObject({ tocar: true, tipo: 'review-small', escalon: { modelo: 'opus', esfuerzo: 'high' } })
    expect(d.motivos).toEqual(['regla review', 'respaldo → review-small', 'base de /config: opus·high'])
  })

  test('la política sube desde la base elegida', async () => {
    const d = await decidir(entrada({ descripcion: 'Fix Task 2: hallazgos' }), ctx({ tabla: tablaDe({ modeloFix: 'sonnet·low' }), politica: FUEGO }))
    expect(d).toMatchObject({ escalon: { modelo: 'sonnet', esfuerzo: 'high' } })
  })

  test('/router fijar le gana a /config', async () => {
    const overrides = { ...OVERRIDES_INICIAL, fijados: { 'review-small': { modelo: 'opus' as const, esfuerzo: 'max' as const } } }
    const d = await decidir(entrada(), ctx({ tabla: tablaDe({ modeloReview: 'opus·high' }), overrides }))
    expect(d).toMatchObject({ escalon: { modelo: 'opus', esfuerzo: 'max' } })
  })
})

describe('talla de la review', () => {
  const dice = (tipo: string, confianza?: number): Clasificador => async () =>
    ({ tipo: tipo as any, ms: 1, fuente: 'jev', ...(confianza === undefined ? {} : { confianza }) })

  test('Review Task 3 con build grande: review-large, opus·xhigh', async () => {
    const d = await decidir(entrada({ descripcion: 'Review Task 3', tallaBuildDeTarea: 'build-large' }), ctx())
    expect(d).toMatchObject({ tipo: 'review-large', escalon: { modelo: 'opus', esfuerzo: 'xhigh' } })
    expect(d.motivos).toEqual(['regla review', 'talla del build de Task 3 (build-large)'])
  })

  test('con build chico: review-small, opus·medium', async () => {
    const d = await decidir(entrada({ descripcion: 'Review Task 3', tallaBuildDeTarea: 'build-small' }), ctx())
    expect(d).toMatchObject({ tipo: 'review-small', escalon: { modelo: 'opus', esfuerzo: 'medium' } })
  })

  test('el alcance gana al build chico', async () => {
    const d = await decidir(entrada({ descripcion: 'Review the feature flags block', tallaBuildDeTarea: 'build-small' }), ctx())
    expect(d).toMatchObject({ tipo: 'review-large' })
    expect(d.motivos).toEqual(['regla review', 'talla por alcance (feature)'])
  })

  test('Review Tasks 3-5 es review-large', async () => {
    const d = await decidir(entrada({ descripcion: 'Review Tasks 3-5' }), ctx())
    expect(d).toMatchObject({ tipo: 'review-large' })
  })

  test('sin build, decide el clasificador', async () => {
    const d = await decidir(entrada({ descripcion: 'Review Task 3' }), ctx({ clasificar: dice('review-large', 0.9) }))
    expect(d).toMatchObject({ tipo: 'review-large' })
    expect(d.motivos).toEqual(['regla review', 'jev → review-large (0.90)'])
  })

  test('sin build y sin clasificador: review-small', async () => {
    const d = await decidir(entrada({ descripcion: 'Review Task 3' }), ctx())
    expect(d).toMatchObject({ tipo: 'review-small' })
    expect(d.motivos).toEqual(['regla review', 'respaldo → review-small'])
  })

  test('review-final y re-review no pasan por la talla', async () => {
    let llamadas = 0
    const espia: Clasificador = async () => { llamadas++; return { tipo: 'review-large', ms: 1, fuente: 'jev' } }
    const f = await decidir(entrada({ descripcion: 'Revisión final', subagentType: 'revisor-final-opus-xhigh', tallaBuildDeTarea: 'build-small' }), ctx({ clasificar: espia }))
    const r = await decidir(entrada({ descripcion: 'Re-review Task 2 fix round 1', tallaBuildDeTarea: 'build-small' }), ctx({ clasificar: espia }))
    expect(f).toMatchObject({ tipo: 'review-final' })
    expect(r).toMatchObject({ tipo: 're-review' })
    expect(llamadas).toBe(0)
  })

  test('/router set review-small le gana a la tabla', async () => {
    const overrides = { ...OVERRIDES_INICIAL, fijados: { 'review-small': { modelo: 'opus' as const, esfuerzo: 'high' as const } } }
    const d = await decidir(entrada({ descripcion: 'Review Task 3' }), ctx({ overrides }))
    expect(d).toMatchObject({ tipo: 'review-small', escalon: { modelo: 'opus', esfuerzo: 'high' } })
    expect(d.motivos).toContain('fijado con /router: opus·high')
  })

  test('la política sube review-small: con 🔥 da opus·xhigh', async () => {
    const d = await decidir(entrada({ descripcion: 'Review Task 3' }), ctx({ politica: FUEGO }))
    expect(d).toMatchObject({ tipo: 'review-small', escalon: { modelo: 'opus', esfuerzo: 'xhigh' } })
  })
})
