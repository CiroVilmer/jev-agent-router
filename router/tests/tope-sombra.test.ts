import { describe, expect, test } from 'claude-code/testing'
import type { Clasificador } from '../src/clasificadores'
import { limitesDe, respaldo, TALLAS, TALLAS_REVIEW } from '../src/clasificadores'
import type { Muestra } from '../src/clasificadores/sombra'
import { agregarMuestra, conSombra, estadisticasSombra, muestrasDe } from '../src/clasificadores/sombra'
import { conTope } from '../src/clasificadores/tope'

const GRANDE = { chars: 9000, archivos: 2, pasos: 0, mencionaSpec: false }
const PEDIDO = { descripcion: 'Implement Task 11', resumen: GRANDE, etiquetas: TALLAS }
const nunca: Promise<void> = new Promise(() => {})
const yaVencio = async () => {}

describe('respaldo', () => {
  test('con las etiquetas de talla de review decide review-small', async () => {
    const r = await respaldo({ descripcion: 'Review Task 2', resumen: GRANDE, etiquetas: TALLAS_REVIEW })
    expect(r).toEqual({ tipo: 'review-small', ms: 0, fuente: 'respaldo' })
  })

  test('con las de build sigue por tamaño; sin regla, build-small', async () => {
    expect((await respaldo(PEDIDO)).tipo).toBe('build-large')
    expect((await respaldo({ ...PEDIDO, etiquetas: ['build-small', 'fix'] })).tipo).toBe('build-small')
  })
})

describe('conTope', () => {
  test('si el clasificador responde, pasa tal cual', async () => {
    const rapido: Clasificador = async () => ({ tipo: 'build-small', ms: 80, fuente: 'haiku' })
    expect(await conTope(rapido, 1000, () => nunca)(PEDIDO)).toEqual({ tipo: 'build-small', ms: 80, fuente: 'haiku' })
  })

  test('si se pasa del tope, respaldo con detalle', async () => {
    const lento: Clasificador = () => new Promise(() => {})
    expect(await conTope(lento, 1000, yaVencio)(PEDIDO)).toEqual({
      tipo: 'build-large', ms: 0, fuente: 'respaldo', detalle: 'tardó más de 1000 ms',
    })
  })

  test('si falla, respaldo con el mensaje del error', async () => {
    const roto: Clasificador = async () => { throw new Error('jev dudó (0.42)') }
    expect(await conTope(roto, 1000, () => nunca)(PEDIDO)).toEqual({
      tipo: 'build-large', ms: 0, fuente: 'respaldo', detalle: 'jev dudó (0.42)',
    })
  })
})

const NOMBRES = { principal: 'haiku', sombra: 'jev' }
const vaciar = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }

describe('conSombra', () => {
  const haiku: Clasificador = async () => ({ tipo: 'build-small', ms: 300, fuente: 'haiku' })
  const jev: Clasificador = async () => ({ tipo: 'build-large', ms: 200, fuente: 'jev', confianza: 0.8 })

  test('decide el principal, registra los dos', async () => {
    const muestras: Muestra[] = []
    const c = conSombra(haiku, jev, async m => { muestras.push(m) }, async () => 42, NOMBRES, 1000)
    expect((await c(PEDIDO)).tipo).toBe('build-small')
    await vaciar()
    expect(muestras).toEqual([{
      fecha: 42,
      tarea: 'Implement Task 11 · prompt 9.0k chars · 2 archivos · 0 pasos',
      etiquetas: ['build-large', 'build-small'],
      nombres: NOMBRES,
      principal: { tipo: 'build-small', ms: 300, fuente: 'haiku' },
      sombra: { tipo: 'build-large', ms: 200, fuente: 'jev', confianza: 0.8 },
      pasoTope: false,
    }])
  })

  test('una sombra más lenta que el tope guarda su respuesta y pasoTope', async () => {
    const lenta: Clasificador = async () => ({ tipo: 'build-large', ms: 1500, fuente: 'haiku' })
    const muestras: Muestra[] = []
    const c = conSombra(jev, lenta, async m => { muestras.push(m) }, async () => 0, { principal: 'jev', sombra: 'haiku' }, 1000)
    expect((await c(PEDIDO)).tipo).toBe('build-large')
    await vaciar()
    expect(muestras[0]!.sombra).toEqual({ tipo: 'build-large', ms: 1500, fuente: 'haiku' })
    expect(muestras[0]!.pasoTope).toBe(true)
  })

  test('una sombra que cae al respaldo no cuenta como que pasó el tope', async () => {
    const caida: Clasificador = async () => ({ tipo: 'build-large', ms: 0, fuente: 'respaldo', detalle: 'tardó más de 60000 ms' })
    const muestras: Muestra[] = []
    const c = conSombra(haiku, caida, async m => { muestras.push(m) }, async () => 0, NOMBRES, 1000)
    await c(PEDIDO)
    await vaciar()
    expect(muestras[0]!.pasoTope).toBe(false)
  })

  test('una sombra que nunca responde no demora la decisión', async () => {
    const colgada: Clasificador = () => new Promise(() => {})
    const muestras: Muestra[] = []
    const c = conSombra(haiku, colgada, async m => { muestras.push(m) }, async () => 0, NOMBRES, 1000)
    expect((await c(PEDIDO)).tipo).toBe('build-small')
    await vaciar()
    expect(muestras).toEqual([])
  })

  test('una sombra que falla no afecta la decisión ni registra', async () => {
    const rota: Clasificador = async () => { throw new Error('jev caído') }
    const muestras: Muestra[] = []
    const c = conSombra(haiku, rota, async m => { muestras.push(m) }, async () => 0, NOMBRES, 1000)
    expect((await c(PEDIDO)).tipo).toBe('build-small')
    await vaciar()
    expect(muestras).toEqual([])
  })

  test('si registrar falla o se cuelga, la decisión sale igual', async () => {
    const falla = conSombra(haiku, haiku, async () => { throw new Error('store lleno') }, async () => 0, NOMBRES, 1000)
    expect((await falla(PEDIDO)).tipo).toBe('build-small')
    const cuelga = conSombra(haiku, haiku, () => nunca, async () => 0, NOMBRES, 1000)
    expect((await cuelga(PEDIDO)).tipo).toBe('build-small')
    await vaciar()
  })
})

describe('estadísticas', () => {
  type Fuente = 'haiku' | 'jev' | 'respaldo'
  type Opciones = { fuenteP?: Fuente; fuenteS?: Fuente; nombres?: { principal: string; sombra: string }; pasoTope?: boolean }
  const m = (p: string, s: string, msP: number, msS: number, o: Opciones = {}): Muestra => ({
    fecha: 0, tarea: '', etiquetas: [], nombres: o.nombres ?? NOMBRES,
    principal: { tipo: p as 'build-small', ms: msP, fuente: o.fuenteP ?? 'haiku' },
    sombra: { tipo: s as 'build-small', ms: msS, fuente: o.fuenteS ?? 'jev' },
    pasoTope: o.pasoTope ?? false,
  })
  const REGLAS = { principal: 'reglas', sombra: 'haiku' }

  test('agregarMuestra guarda las últimas N', () => {
    const lista = Array.from({ length: 3 }, (_, i) => m('build-small', 'build-small', i, i))
    expect(agregarMuestra(lista, m('fix', 'fix', 9, 9), 3).map(x => x.principal.ms)).toEqual([1, 2, 9])
  })

  test('coincidencia, p50/p95, respaldos y pasoTope por par', () => {
    const lista = [
      m('build-small', 'build-small', 100, 200),
      m('build-large', 'build-small', 300, 1400, { pasoTope: true }),
      m('build-small', 'build-small', 500, 0, { fuenteS: 'respaldo' }),
    ]
    // jev: 3 muestras, una cayó al respaldo; sus latencias propias son [200, 1400] -> p50 = p95 = 1400.
    // La que cayó al respaldo no es comparable, aunque las dos digan build-small.
    expect(estadisticasSombra(lista)).toEqual({
      n: 3,
      pares: [{
        par: 'haiku→jev',
        n: 3,
        comparables: 2,
        coinciden: 1,
        principal: { nombre: 'haiku', n: 3, p50: 300, p95: 500, respaldos: 0, pasoTope: null },
        sombra: { nombre: 'jev', n: 3, p50: 1400, p95: 1400, respaldos: 1, pasoTope: 1 },
      }],
    })
    expect(estadisticasSombra([])).toBe(null)
  })

  test('una sombra o un principal que cae al respaldo no cuenta como coincidencia', () => {
    const lista = [
      m('build-small', 'build-small', 0, 0, { fuenteS: 'respaldo' }),
      m('build-small', 'build-small', 0, 300, { fuenteP: 'respaldo' }),
    ]
    const par = estadisticasSombra(lista)!.pares[0]!
    expect(par.comparables).toBe(0)
    expect(par.coinciden).toBe(0)
  })

  test('con reglas de principal, su respaldo es la respuesta normal y se compara contra la sombra', () => {
    const lista = [
      m('build-small', 'build-small', 0, 700, { fuenteP: 'respaldo', fuenteS: 'haiku', nombres: REGLAS }),
      m('build-small', 'build-large', 0, 900, { fuenteP: 'respaldo', fuenteS: 'haiku', nombres: REGLAS }),
      m('build-small', 'build-small', 0, 0, { fuenteP: 'respaldo', fuenteS: 'respaldo', nombres: REGLAS }),
    ]
    const par = estadisticasSombra(lista)!.pares[0]!
    expect(par.par).toBe('reglas→haiku')
    expect(par.comparables).toBe(2)
    expect(par.coinciden).toBe(1)
    // Reglas no tiene latencia propia ni cuenta respaldos: decidir sin modelo es su forma normal.
    expect(par.principal).toEqual({ nombre: 'reglas', n: 3, p50: null, p95: null, respaldos: 0, pasoTope: null })
    expect(par.sombra).toEqual({ nombre: 'haiku', n: 3, p50: 900, p95: 900, respaldos: 1, pasoTope: 0 })
  })

  test('sin respuestas propias, p50 y p95 quedan en null y no en 0', () => {
    const par = estadisticasSombra([m('fix', 'fix', 0, 0, { fuenteP: 'respaldo', fuenteS: 'respaldo' })])!.pares[0]!
    expect(par.principal.p50).toBe(null)
    expect(par.principal.p95).toBe(null)
    expect(par.sombra.p50).toBe(null)
    expect(par.sombra.p95).toBe(null)
  })

  test('las estadísticas se reportan por par principal→sombra', () => {
    const lista = [
      m('build-small', 'build-small', 100, 200),
      m('build-small', 'build-large', 0, 800, { fuenteP: 'respaldo', fuenteS: 'haiku', nombres: REGLAS }),
      m('build-large', 'build-large', 150, 250),
    ]
    const e = estadisticasSombra(lista)!
    expect(e.n).toBe(3)
    expect(e.pares.map(p => [p.par, p.n, p.comparables, p.coinciden])).toEqual([
      ['haiku→jev', 2, 2, 2],
      ['reglas→haiku', 1, 1, 0],
    ])
  })

  test('una muestra vieja, sin pasoTope, se lee como false', () => {
    const { pasoTope: _, ...vieja } = m('fix', 'fix', 1, 1, { pasoTope: true })
    expect(muestrasDe([vieja])[0]!.pasoTope).toBe(false)
  })
})

describe('limitesDe', () => {
  test('acota topeMs a [50, 8000] y jevUmbral a [0, 1]', () => {
    expect(limitesDe({})).toEqual({ topeMs: 1000, jevUmbral: 0.7 })
    expect(limitesDe({ topeMs: 1, jevUmbral: -2 })).toEqual({ topeMs: 50, jevUmbral: 0 })
    expect(limitesDe({ topeMs: 99_999, jevUmbral: 5 })).toEqual({ topeMs: 8000, jevUmbral: 1 })
    expect(limitesDe({ topeMs: 1500, jevUmbral: 0.7 })).toEqual({ topeMs: 1500, jevUmbral: 0.7 })
    expect(limitesDe({ topeMs: 'mucho', jevUmbral: Number.NaN })).toEqual({ topeMs: 1000, jevUmbral: 0.7 })
  })
})
