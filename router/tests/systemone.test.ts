import { describe, expect, test } from 'claude-code/testing'
import { TALLAS, limitesDe } from '../src/clasificadores'
import { crearSystemOne } from '../src/clasificadores/systemone'
import { TIPOS } from '../src/taxonomia'

const RESUMEN = { chars: 6800, archivos: 9, pasos: 14, mencionaSpec: true }
const respuesta = (choice: string, confidence: number) => JSON.stringify({ answers: { tipo: { type: 'choice', choice, confidence } } })
let t = 0
const reloj = async () => (t += 100)

describe('crearSystemOne', () => {
  test('manda el modelo configurado y devuelve fuente local', async () => {
    let cuerpo = ''
    const c = crearSystemOne({ post: async b => { cuerpo = b; return { ok: true, status: 200, text: respuesta('build-large', 0.9) } }, ahora: reloj, modelo: 'laya', umbral: 0.7, fuente: 'local' })
    expect(await c({ descripcion: 'Implement Task 1', resumen: RESUMEN, etiquetas: TALLAS })).toEqual({ tipo: 'build-large', confianza: 0.9, ms: 100, fuente: 'local' })
    expect(JSON.parse(cuerpo).model).toBe('laya')
  })

  test('en la talla, con duda, tira "local dudó"; sin regla decide igual', async () => {
    const duda = crearSystemOne({ post: async () => ({ ok: true, status: 200, text: respuesta('build-small', 0.4) }), ahora: reloj, modelo: 'm', umbral: 0.7, fuente: 'local' })
    let e = ''
    try { await duda({ descripcion: 'Implement Task 1', resumen: RESUMEN, etiquetas: TALLAS }) } catch (x) { e = String(x) }
    expect(e).toBe('Error: local dudó (0.40)')
    const sinRegla = crearSystemOne({ post: async () => ({ ok: true, status: 200, text: respuesta('review', 0.4) }), ahora: reloj, modelo: 'm', umbral: 0.7, fuente: 'local' })
    const r = await sinRegla({ descripcion: 'verif: x', resumen: RESUMEN, etiquetas: TIPOS })
    expect(r.detalle).toBe('sin umbral')
  })

  test('HTTP con error', async () => {
    const c = crearSystemOne({ post: async () => ({ ok: false, status: 501, text: '' }), ahora: reloj, modelo: 'm', umbral: 0.7, fuente: 'local' })
    let e = ''
    try { await c({ descripcion: 'Implement Task 1', resumen: RESUMEN, etiquetas: TALLAS }) } catch (x) { e = String(x) }
    expect(e).toBe('Error: local: HTTP 501')
  })
})

describe('limitesDe', () => {
  test('localUmbral acotado a [0, 1], 0.7 por defecto', () => {
    expect(limitesDe({}).localUmbral).toBe(0.7)
    expect(limitesDe({ localUmbral: 2 }).localUmbral).toBe(1)
    expect(limitesDe({ localUmbral: 'x' }).localUmbral).toBe(0.7)
  })
})
