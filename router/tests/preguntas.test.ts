import { describe, expect, test } from 'claude-code/testing'
import { COMO_DECIDIR, COMO_DECIDIR_TALLA, COMO_DECIDIR_TALLA_REVIEW, DESCRIPCION, DESCRIPCION_TALLA_REVIEW, DESCRIPCION_TALLA, preguntaJev, textoParaHaiku } from '../src/clasificadores/preguntas'

const TALLAS = ['build-large', 'build-small'] as const
const TALLAS_REVIEW = ['review-large', 'review-small'] as const
const TIPOS = ['review-final', 'review', 're-review', 'build-large', 'build-small', 'fix', 'explore', 'research', 'write'] as const

describe('preguntas', () => {
  test('la pregunta de talla usa los criterios de largo y archivos', () => {
    const p = preguntaJev(TALLAS)
    expect(p.criteria['build-large']).toBe(DESCRIPCION_TALLA['build-large'])
    expect(p.criteria['build-small']).toBe(DESCRIPCION_TALLA['build-small'])
    expect(p.instructions.como_decidir).toEqual(COMO_DECIDIR_TALLA)
    expect(DESCRIPCION_TALLA['build-large'].includes('10 archivos o más')).toBe(true)
    expect(DESCRIPCION_TALLA['build-small'].includes('hasta ~3k caracteres')).toBe(true)
  })

  test('el orden de las etiquetas no importa para reconocer la talla', () => {
    expect(preguntaJev(['build-small', 'build-large']).criteria['build-large']).toBe(DESCRIPCION_TALLA['build-large'])
  })

  test('la pregunta de 9 etiquetas no cambia', () => {
    const p = preguntaJev(TIPOS)
    expect(p.criteria['build-large']).toBe(DESCRIPCION['build-large'])
    expect(p.instructions.como_decidir).toEqual(COMO_DECIDIR)
  })

  test('Haiku usa los mismos dos juegos', () => {
    expect(textoParaHaiku('t', TALLAS).includes(DESCRIPCION_TALLA['build-large'])).toBe(true)
    expect(textoParaHaiku('t', TIPOS).includes(DESCRIPCION['build-large'])).toBe(true)
    expect(textoParaHaiku('t', TIPOS).includes(DESCRIPCION_TALLA['build-large'])).toBe(false)
    // La primera línea es igual en los dos juegos; las propias de la talla no van con 9 etiquetas.
    const t9 = textoParaHaiku('t', TIPOS)
    for (const l of COMO_DECIDIR_TALLA.slice(1)) expect(t9.includes(l)).toBe(false)
  })

  test('la pregunta de review usa sus textos, en cualquier orden', () => {
    for (const et of [TALLAS_REVIEW, ['review-small', 'review-large'] as const]) {
      const p = preguntaJev(et)
      expect(p.criteria['review-large']).toBe(DESCRIPCION_TALLA_REVIEW['review-large'])
      expect(p.criteria['review-small']).toBe(DESCRIPCION_TALLA_REVIEW['review-small'])
      expect(p.instructions.como_decidir).toEqual(COMO_DECIDIR_TALLA_REVIEW)
    }
    expect(DESCRIPCION_TALLA_REVIEW['review-large']).toBe(DESCRIPCION['review-large'])
    expect(DESCRIPCION_TALLA_REVIEW['review-small']).toBe(DESCRIPCION['review-small'])
    expect(COMO_DECIDIR_TALLA_REVIEW[0]).toBe('Elegí por el alcance de lo que se revisa, no por palabras sueltas.')
    const t = textoParaHaiku('t', TALLAS_REVIEW)
    expect(t.includes(DESCRIPCION_TALLA_REVIEW['review-large'])).toBe(true)
    for (const l of COMO_DECIDIR_TALLA_REVIEW) expect(t.includes(l)).toBe(true)
    expect(t.includes(COMO_DECIDIR_TALLA[1])).toBe(false)
  })
})
