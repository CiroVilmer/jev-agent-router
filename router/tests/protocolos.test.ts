// router/tests/protocolos.test.ts
import { describe, expect, test } from 'claude-code/testing'
import { leerOpenAI, leerSystemOne, letrasDe, pedidoOpenAI, pedidoSystemOne, textoOpenAI } from '../src/clasificadores/protocolos'

const TALLAS = ['build-large', 'build-small']
const NUEVE = ['review-final', 'review', 're-review', 'build-large', 'build-small', 'fix', 'explore', 'research', 'write']

const systemone = (choice: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ answers: { tipo: { type: 'choice', choice, ...extra } } })

const top = (pares: [string, number][]) => pares.map(([token, p]) => ({ token, logprob: Math.log(p) }))
const openai = (letra: string, logprobs: unknown) =>
  JSON.stringify({ choices: [{ message: { content: JSON.stringify({ r: letra }) }, logprobs }] })

describe('System One', () => {
  test('el pedido lleva modelo, la tarea como estado y la pregunta tipo', () => {
    expect(pedidoSystemOne('laya', 'Implement Task 1 · prompt 1.2k chars', { type: 'choice' })).toEqual({
      model: 'laya',
      state: { tarea: 'Implement Task 1 · prompt 1.2k chars' },
      questions: { tipo: { type: 'choice' } },
    })
  })

  test('lee confidence y, si falta, probabilities[choice]', () => {
    expect(leerSystemOne(systemone('build-large', { confidence: 0.83 }), TALLAS, 'local')).toEqual({ tipo: 'build-large', confianza: 0.83 })
    expect(leerSystemOne(systemone('build-small', { probabilities: { 'build-small': 0.6 } }), TALLAS, 'local')).toEqual({ tipo: 'build-small', confianza: 0.6 })
    expect(leerSystemOne(systemone('build-small'), TALLAS, 'local')).toEqual({ tipo: 'build-small', confianza: 0 })
  })

  test('la confianza es finita y se acota a [0, 1]; cualquier otra cosa vale 0', () => {
    expect(leerSystemOne(systemone('build-large', { confidence: 1.7 }), TALLAS, 'local').confianza).toBe(1)
    expect(leerSystemOne(systemone('build-large', { confidence: -0.2 }), TALLAS, 'local').confianza).toBe(0)
    expect(leerSystemOne(systemone('build-large', { confidence: 'alta' }), TALLAS, 'local').confianza).toBe(0)
    expect(leerSystemOne(systemone('build-large', { probabilities: { 'build-large': 3 } }), TALLAS, 'local').confianza).toBe(1)
    expect(leerSystemOne('{"answers":{"tipo":{"type":"choice","choice":"build-large","confidence":1e999}}}', TALLAS, 'local').confianza).toBe(0)
  })

  test('los errores llevan el nombre de la fuente', () => {
    const errores: string[] = []
    for (const malo of ['no es json', '{}', systemone('review', { confidence: 1 })]) {
      try { leerSystemOne(malo, TALLAS, 'local') } catch (e) { errores.push(String(e)) }
    }
    expect(errores).toEqual([
      'Error: local: la respuesta no es JSON',
      'Error: local: la respuesta no trae answers.tipo',
      'Error: local eligió una opción que no se pidió: review',
    ])
  })
})

describe('OpenAI', () => {
  test('una letra por etiqueta, en orden', () => {
    expect(letrasDe(TALLAS)).toEqual(['A', 'B'])
    expect(letrasDe(NUEVE).at(-1)).toBe('I')
  })

  test('el texto agrega la clave de letras', () => {
    const t = textoOpenAI('¿Qué tipo?', TALLAS)
    expect(t.startsWith('¿Qué tipo?\n\n')).toBe(true)
    expect(t.includes('A = build-large')).toBe(true)
    expect(t.includes('B = build-small')).toBe(true)
  })

  test('el pedido fuerza un enum de letras, pide logprobs y apaga el thinking', () => {
    const p = pedidoOpenAI('qwen3-1.7b', 'texto', TALLAS) as any
    expect(p.model).toBe('qwen3-1.7b')
    expect(p.messages).toEqual([{ role: 'user', content: 'texto' }])
    expect(p.response_format.type).toBe('json_schema')
    expect(p.response_format.json_schema.schema.properties.r.enum).toEqual(['A', 'B'])
    expect(p.logprobs).toBe(true)
    expect(p.top_logprobs).toBe(20)
    expect(p.temperature).toBe(0)
    expect(p.max_tokens).toBe(16)
    expect(p.chat_template_kwargs).toEqual({ enable_thinking: false })
  })

  test('la confianza es el softmax renormalizado sobre las letras de la clave', () => {
    const logprobs = {
      content: [
        { token: '{"', logprob: 0, top_logprobs: [] },
        { token: 'r', logprob: 0, top_logprobs: [] },
        { token: '":"', logprob: 0, top_logprobs: [] },
        { token: 'A', logprob: Math.log(0.6), top_logprobs: top([['A', 0.6], [' B', 0.2], ['"C', 0.1], ['x', 0.1]]) },
      ],
    }
    const r = leerOpenAI(openai('A', logprobs), ['build-large', 'build-small', 'fix'])
    expect(r.tipo).toBe('build-large')
    expect(Math.abs(r.confianza - 0.6 / 0.9) < 1e-9).toBe(true)
  })

  test('un token pegado a llaves o dos puntos (A"}) cuenta como la letra', () => {
    const logprobs = { content: [{ token: '{"r":', logprob: 0, top_logprobs: [] }, { token: 'A"}', logprob: Math.log(0.5), top_logprobs: top([['A"}', 0.5], ['B"}', 0.5]]) }] }
    const r = leerOpenAI(openai('A', logprobs), TALLAS)
    expect(Math.abs(r.confianza - 0.5) < 1e-9).toBe(true)
  })

  test('sin logprobs la etiqueta vale con confianza 0', () => {
    expect(leerOpenAI(openai('B', null), TALLAS)).toEqual({ tipo: 'build-small', confianza: 0 })
  })

  test('letra fuera de la clave o respuesta rota: error local', () => {
    const errores: string[] = []
    for (const malo of [openai('C', null), 'no es json', JSON.stringify({ choices: [] }), JSON.stringify({ choices: [{ message: { content: 'A' } }] })]) {
      try { leerOpenAI(malo, TALLAS) } catch (e) { errores.push(String(e)) }
    }
    expect(errores).toEqual([
      'Error: local eligió una letra que no se pidió: C',
      'Error: local: la respuesta no es JSON',
      'Error: local: la respuesta no trae choices[0].message.content',
      'Error: local: el contenido no es {"r": letra}',
    ])
  })
})
