import { describe, expect, test } from 'claude-code/testing'
import { TALLAS } from '../src/clasificadores'
import { crearOpenAI } from '../src/clasificadores/openai'

const RESUMEN = { chars: 6800, archivos: 9, pasos: 14, mencionaSpec: true }
const respuesta = (letra: string, p: number) =>
  JSON.stringify({ choices: [{ message: { content: JSON.stringify({ r: letra }) }, logprobs: { content: [{ token: letra, logprob: Math.log(p), top_logprobs: [{ token: letra, logprob: Math.log(p) }, { token: letra === 'A' ? 'B' : 'A', logprob: Math.log(1 - p) }] }] } }] })
let t = 0
const reloj = async () => (t += 50)

describe('crearOpenAI', () => {
  test('arma el pedido con el texto de Haiku más la clave y lee la letra', async () => {
    let cuerpo: any
    const c = crearOpenAI({ post: async b => { cuerpo = JSON.parse(b); return { ok: true, status: 200, text: respuesta('A', 0.9) } }, ahora: reloj, modelo: 'qwen3', umbral: 0.7 })
    const r = await c({ descripcion: 'Implement Task 11: el compilador', resumen: RESUMEN, etiquetas: TALLAS })
    expect(r.tipo).toBe('build-large')
    expect(r.fuente).toBe('local')
    expect(Math.abs((r.confianza ?? 0) - 0.9) < 1e-9).toBe(true)
    expect(cuerpo.model).toBe('qwen3')
    expect(cuerpo.messages[0].content.includes('Implement Task 11')).toBe(true)
    expect(cuerpo.messages[0].content.includes('A = build-large')).toBe(true)
  })

  test('en la talla, con duda, tira "local dudó"', async () => {
    const c = crearOpenAI({ post: async () => ({ ok: true, status: 200, text: respuesta('B', 0.55) }), ahora: reloj, modelo: 'q', umbral: 0.7 })
    let e = ''
    try { await c({ descripcion: 'Implement Task 1', resumen: RESUMEN, etiquetas: TALLAS }) } catch (x) { e = String(x) }
    expect(e).toBe('Error: local dudó (0.55)')
  })
})
