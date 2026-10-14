import { describe, expect, test } from 'claude-code/testing'
import { TALLAS } from '../src/clasificadores'
import { crearHaiku } from '../src/clasificadores/haiku'
import { COMO_DECIDIR_TALLA, DESCRIPCION, preguntaJev, textoParaHaiku } from '../src/clasificadores/preguntas'
import { TIPOS } from '../src/taxonomia'

const RESUMEN = { chars: 6800, archivos: 9, pasos: 14, mencionaSpec: true }
const PEDIDO = { descripcion: 'Implement Task 11: el compilador', resumen: RESUMEN, etiquetas: TALLAS }
let t = 1000
const reloj = async () => (t += 120)

describe('preguntas', () => {
  test('hay una descripción por tipo', () => {
    expect(Object.keys(DESCRIPCION).sort()).toEqual([...TIPOS, 'review-large', 'review-small'].sort())
  })

  test('el texto para Haiku lista solo las etiquetas pedidas y lleva la tarea', () => {
    const texto = textoParaHaiku('Implement Task 11 · prompt 6.8k chars', TALLAS)
    expect(texto.includes('- build-large: ')).toBe(true)
    expect(texto.includes('- build-small: ')).toBe(true)
    expect(texto.includes('- review: ')).toBe(false)
    expect(texto.endsWith('Tarea: Implement Task 11 · prompt 6.8k chars')).toBe(true)
  })

  test('Haiku y Jev reciben la misma guía de decisión', () => {
    const texto = textoParaHaiku('x', TALLAS)
    for (const linea of COMO_DECIDIR_TALLA) expect(texto.includes(`- ${linea}`)).toBe(true)
    expect(preguntaJev(TALLAS).instructions.como_decidir).toEqual(COMO_DECIDIR_TALLA)
  })

  test('las descripciones de talla llevan el ancla numérica', () => {
    expect(DESCRIPCION['build-large'].includes('5k')).toBe(true)
    expect(DESCRIPCION['build-small'].includes('5k')).toBe(true)
  })

  test('la pregunta de Jev es choice, con un criterio por etiqueta y referencia a `tarea`', () => {
    const q = preguntaJev(TALLAS)
    expect(q.type).toBe('choice')
    expect(Object.keys(q.criteria)).toEqual(['build-large', 'build-small'])
    expect(q.instructions.pregunta.includes('`tarea`')).toBe(true)
  })
})

describe('crearHaiku', () => {
  test('manda el texto con el resumen y devuelve la etiqueta con su latencia', async () => {
    let recibido = ''
    const haiku = crearHaiku(async (texto, etiquetas) => { recibido = texto; return etiquetas[0] }, reloj)
    const r = await haiku(PEDIDO)
    expect(r).toEqual({ tipo: 'build-large', ms: 120, fuente: 'haiku' })
    expect(recibido.includes('Implement Task 11: el compilador · prompt 6.8k chars · 9 archivos · 14 pasos · menciona spec')).toBe(true)
  })

  test('sin respuesta o con una etiqueta que no se pidió, falla (el tope pasa al respaldo)', async () => {
    const vacio = crearHaiku(async () => undefined, reloj)
    let error = ''
    try { await vacio(PEDIDO) } catch (e) { error = String(e) }
    expect(error.includes('haiku no eligió')).toBe(true)
    const otra = crearHaiku(async () => 'review', reloj)
    let error2 = ''
    try { await otra(PEDIDO) } catch (e) { error2 = String(e) }
    expect(error2.includes('haiku no eligió')).toBe(true)
  })
})
