import { describe, expect, test } from 'claude-code/testing'
import type { Clasificador } from '../src/clasificadores'
import { TALLAS } from '../src/clasificadores'
import type { Caso, ResultadoBanco } from '../src/banco'
import { casosDeProduccion, colaEnOrden, conLimite, correrBanco, nombreCorrida } from '../src/banco'

const RESUMEN = { chars: 1200, archivos: 1, pasos: 2, mencionaSpec: false }
const CASOS: Caso[] = [
  { id: 'c1', descripcion: 'Implement Task 1', resumen: RESUMEN, etiquetasProduccion: [...TALLAS] },
  { id: 'c2', descripcion: 'Research X', resumen: RESUMEN, etiquetasProduccion: null },
  { id: 'c3', descripcion: 'Translate docs', resumen: RESUMEN, etiquetasProduccion: ['write', 'fix'] },
]

const haiku: Clasificador = async ({ etiquetas }) => ({ tipo: etiquetas[0]!, ms: 120, fuente: 'haiku' })
const jev: Clasificador = async ({ descripcion, etiquetas }) => {
  if (descripcion.startsWith('Translate')) throw new Error('jev: HTTP 500')
  return { tipo: etiquetas[1]!, confianza: 0.8, ms: 300, fuente: 'jev' }
}

describe('casosDeProduccion', () => {
  test('deja solo los casos que llegan a un clasificador', () => {
    expect(casosDeProduccion(CASOS).map(c => c.id)).toEqual(['c1', 'c3'])
  })
})

describe('correrBanco', () => {
  test('corre cada caso de producción por cada clasificador y atrapa los errores', async () => {
    const avances: [number, number][] = []
    const rs = await correrBanco(CASOS, { haiku, jev }, {
      concurrencia: 2,
      alAvanzar: async (hechos, total) => {
        avances.push([hechos, total])
      },
    })
    expect(rs.length).toBe(4)
    const orden = (a: ResultadoBanco, b: ResultadoBanco) => (a.id + a.fuente).localeCompare(b.id + b.fuente)
    expect([...rs].sort(orden)).toEqual([
      { id: 'c1', fuente: 'haiku', tipo: 'build-large', confianza: null, ms: 120, error: null },
      { id: 'c1', fuente: 'jev', tipo: 'build-small', confianza: 0.8, ms: 300, error: null },
      { id: 'c3', fuente: 'haiku', tipo: 'write', confianza: null, ms: 120, error: null },
      { id: 'c3', fuente: 'jev', tipo: null, confianza: null, ms: 0, error: 'jev: HTTP 500' },
    ])
    expect(avances.length).toBe(4)
    expect(avances.at(-1)).toEqual([4, 4])
  })

  test('con un solo clasificador, un resultado por caso', async () => {
    const rs = await correrBanco(CASOS, { haiku }, { concurrencia: 3 })
    expect(rs.map(r => r.fuente)).toEqual(['haiku', 'haiku'])
  })

  test('alAvanzar recibe los resultados parciales', async () => {
    const tamanos: number[] = []
    await correrBanco(CASOS, { haiku, jev }, {
      concurrencia: 1,
      alAvanzar: async (hechos, _total, parciales) => {
        tamanos.push(parciales.length)
        expect(parciales.length).toBe(hechos)
      },
    })
    expect(tamanos).toEqual([1, 2, 3, 4])
  })

  test('no supera la concurrencia pedida', async () => {
    let vivos = 0
    let maximo = 0
    const lento: Clasificador = async ({ etiquetas }) => {
      vivos++
      maximo = Math.max(maximo, vivos)
      await Promise.resolve()
      await Promise.resolve()
      vivos--
      return { tipo: etiquetas[0]!, ms: 1, fuente: 'haiku' }
    }
    const muchos: Caso[] = Array.from({ length: 10 }, (_, i) => ({ ...CASOS[0]!, id: `m${i}` }))
    const rs = await correrBanco(muchos, { haiku: lento }, { concurrencia: 3 })
    expect(rs.length).toBe(10)
    expect(maximo).toBe(3)
  })
})

describe('nombreCorrida', () => {
  test('fecha y hora locales, con ceros', () => {
    expect(nombreCorrida(new Date(2026, 9, 6, 23, 5))).toBe('bench/corridas/2026-10-06-2305-banco.json')
    expect(nombreCorrida(new Date(2026, 0, 2, 3, 4))).toBe('bench/corridas/2026-01-02-0304-banco.json')
  })
})

describe('colaEnOrden', () => {
  test('una tarea empieza cuando terminó la anterior, aunque la anterior tarde más', async () => {
    const cola = colaEnOrden()
    const orden: string[] = []
    let soltar = () => {}
    const lenta = cola(() => new Promise<void>(r => { orden.push('lenta empieza'); soltar = () => { orden.push('lenta termina'); r() } }))
    const rapida = cola(async () => { orden.push('rápida') })
    await Promise.resolve()
    await Promise.resolve()
    expect(orden).toEqual(['lenta empieza'])
    soltar()
    await Promise.all([lenta, rapida])
    expect(orden).toEqual(['lenta empieza', 'lenta termina', 'rápida'])
  })

  test('una tarea que falla rechaza su promesa pero no corta la cola', async () => {
    const cola = colaEnOrden()
    const mala = cola(async () => { throw new Error('disco lleno') })
    const buena = cola(async () => 'ok')
    let error = ''
    await mala.catch(e => { error = (e as Error).message })
    expect(error).toBe('disco lleno')
    expect(await buena).toBe('ok')
  })
})

describe('conLimite', () => {
  test('un clasificador que nunca responde termina en error al vencer el límite', async () => {
    const colgado: Clasificador = () => new Promise(() => {})
    const rs = await correrBanco(CASOS, { haiku: conLimite(colgado, 60_000, async () => {}) }, { concurrencia: 2 })
    expect(rs.map(r => r.error)).toEqual(['tardó más de 60 s', 'tardó más de 60 s'])
  })

  test('si responde antes, pasa tal cual', async () => {
    const r = await conLimite(haiku, 60_000, () => new Promise(() => {}))({ descripcion: 'x', resumen: RESUMEN, etiquetas: TALLAS })
    expect(r).toEqual({ tipo: 'build-large', ms: 120, fuente: 'haiku' })
  })
})
