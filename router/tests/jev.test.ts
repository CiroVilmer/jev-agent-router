import { describe, expect, test } from 'claude-code/testing'
import { TALLAS, TALLAS_REVIEW } from '../src/clasificadores'
import { TIPOS } from '../src/taxonomia'
import { crearJev, JEV_MODELO, JEV_URL, leerJev, pedidoJev } from '../src/clasificadores/jev'

const RESUMEN = { chars: 6800, archivos: 9, pasos: 14, mencionaSpec: true }
const PEDIDO = { descripcion: 'Implement Task 11: el compilador', resumen: RESUMEN, etiquetas: TALLAS }
const respuesta = (choice: string, confidence: number) =>
  JSON.stringify({ model: 'jev-1.13.0', answers: { tipo: { type: 'choice', choice, probabilities: { [choice]: confidence }, confidence } }, usage: { input_tokens: 300, output_tokens: 20 } })
let t = 0
const reloj = async () => (t += 250)

describe('jev', () => {
  test('endpoint y modelo fijos', () => {
    expect(JEV_URL).toBe('https://api.typesafe.ai/v1/systemone')
    expect(JEV_MODELO).toBe('jev-1.13.0')
  })

  test('el pedido lleva modelo fijo, la tarea como estado y una pregunta tipo', () => {
    const p = pedidoJev('Implement Task 11 · prompt 6.8k chars', TALLAS) as { model: string; state: unknown; questions: Record<string, { type: string }> }
    expect(p.model).toBe('jev-1.13.0')
    expect(p.state).toEqual({ tarea: 'Implement Task 11 · prompt 6.8k chars' })
    expect(Object.keys(p.questions)).toEqual(['tipo'])
    expect(p.questions.tipo!.type).toBe('choice')
  })

  test('leerJev toma choice y confidence', () => {
    expect(leerJev(respuesta('build-large', 0.83), TALLAS)).toEqual({ tipo: 'build-large', confianza: 0.83 })
  })

  test('leerJev rechaza respuestas rotas u opciones que no se pidieron', () => {
    for (const mala of ['{}', 'no es json', respuesta('review', 0.9)]) {
      let error = ''
      try { leerJev(mala, TALLAS) } catch (e) { error = String(e) }
      expect(error.startsWith('Error: jev')).toBe(true)
    }
  })

  test('crearJev devuelve tipo, confianza y latencia', async () => {
    let cuerpo = ''
    const jev = crearJev(async c => { cuerpo = c; return { ok: true, status: 200, text: respuesta('build-large', 0.83) } }, reloj, 0.5)
    expect(await jev(PEDIDO)).toEqual({ tipo: 'build-large', confianza: 0.83, ms: 250, fuente: 'jev' })
    expect(JSON.parse(cuerpo).state.tarea.includes('9 archivos')).toBe(true)
  })

  test('HTTP con error o confianza bajo el umbral: falla con el motivo', async () => {
    const http = crearJev(async () => ({ ok: false, status: 429, text: '' }), reloj, 0.5)
    let e1 = ''
    try { await http(PEDIDO) } catch (e) { e1 = String(e) }
    expect(e1).toBe('Error: jev: HTTP 429')
    const duda = crearJev(async () => ({ ok: true, status: 200, text: respuesta('build-small', 0.42) }), reloj, 0.5)
    let e2 = ''
    try { await duda(PEDIDO) } catch (e) { e2 = String(e) }
    expect(e2).toBe('Error: jev dudó (0.42)')
  })

  test('sin regla, con duda, decide Jev igual y lo marca', async () => {
    const jev = crearJev(async () => ({ ok: true, status: 200, text: respuesta('review', 0.55) }), reloj, 0.7)
    const r = await jev({ descripcion: 'verif: kubernetes', resumen: RESUMEN, etiquetas: TIPOS })
    expect({ ...r, ms: 0 }).toEqual({ tipo: 'review', confianza: 0.55, ms: 0, fuente: 'jev', detalle: 'sin umbral' })
  })

  test('en la talla de un build, con duda, sigue decidiendo el respaldo', async () => {
    const jev = crearJev(async () => ({ ok: true, status: 200, text: respuesta('build-large', 0.55) }), reloj, 0.7)
    let e = ''
    try { await jev({ descripcion: 'Implement Task 2', resumen: RESUMEN, etiquetas: TALLAS }) } catch (x) { e = String(x) }
    expect(e).toBe('Error: jev dudó (0.55)')
  })

  test('en la talla de una review, con duda, también tira jev dudó', async () => {
    const jev = crearJev(async () => ({ ok: true, status: 200, text: respuesta('review-large', 0.55) }), reloj, 0.7)
    let e = ''
    try { await jev({ descripcion: 'Review Task 2', resumen: RESUMEN, etiquetas: TALLAS_REVIEW }) } catch (x) { e = String(x) }
    expect(e).toBe('Error: jev dudó (0.55)')
  })

  test('sin duda no hay detalle', async () => {
    const jev = crearJev(async () => ({ ok: true, status: 200, text: respuesta('review', 0.9) }), reloj, 0.7)
    const r = await jev({ descripcion: 'verif: kubernetes', resumen: RESUMEN, etiquetas: TIPOS })
    expect(r.detalle).toBe(undefined)
  })
})
