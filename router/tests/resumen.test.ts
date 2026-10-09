import { describe, expect, test } from 'claude-code/testing'
import { respaldo, TALLAS } from '../src/clasificadores'
import { resumir, tamanoPorRespaldo, textoResumen } from '../src/resumen'
import { TIPOS } from '../src/taxonomia'

const PROMPT_GRANDE = [
  'Implementá la Tarea 11 del plan docs/superpowers/plans/2026-09-10-compilador.md.',
  '1. Leé packages/compilador/respaldo.ts y packages/compilador/index.ts',
  '2. Escribí el test en packages/compilador/respaldo.test.ts',
  '3. Tocá packages/db/esquema.json, packages/db/vista.sql y packages/db/carga.ts',
  '4. Actualizá docs/LEEME.md y AGENTS.md',
  '- [ ] correr pnpm test',
].join('\n')

describe('resumen', () => {
  test('cuenta caracteres, archivos únicos, pasos y si menciona un spec o plan', () => {
    expect(resumir(PROMPT_GRANDE)).toEqual({
      chars: PROMPT_GRANDE.length,
      archivos: 9,
      pasos: 5,
      mencionaSpec: true,
    })
  })

  test('rutas con barra invertida: mismo nombre en carpetas distintas cuenta como archivos distintos', () => {
    expect(resumir('Tocá packages\\db\\index.ts y packages\\api\\index.ts').archivos).toBe(2)
  })

  test('un prompt corto sin archivos', () => {
    expect(resumir('Arreglá el typo del título.')).toEqual({ chars: 27, archivos: 0, pasos: 0, mencionaSpec: false })
  })

  test('el texto del resumen no lleva el prompt, solo números', () => {
    const r = { chars: 6800, archivos: 9, pasos: 14, mencionaSpec: true }
    expect(textoResumen('Implement Task 11: el compilador', r)).toBe(
      'Implement Task 11: el compilador · prompt 6.8k chars · 9 archivos · 14 pasos · menciona spec',
    )
  })

  test('respaldo de talla: más de 5000 caracteres, o más de 3000 nombrando 10 archivos o más, es grande', () => {
    const r = (chars: number, archivos: number) => ({ chars, archivos, pasos: 0, mencionaSpec: true })
    expect(tamanoPorRespaldo(r(5001, 0))).toBe('build-large')
    expect(tamanoPorRespaldo(r(5000, 9))).toBe('build-small')
    expect(tamanoPorRespaldo(r(3001, 10))).toBe('build-large')
    expect(tamanoPorRespaldo(r(3000, 30))).toBe('build-small')
    expect(tamanoPorRespaldo(r(2500, 7))).toBe('build-small') // antes build-large: archivos > 6
  })
})

describe('clasificador respaldo', () => {
  test('con etiquetas de talla usa el tamaño del prompt', async () => {
    const grande = { chars: 9000, archivos: 2, pasos: 0, mencionaSpec: false }
    expect(await respaldo({ descripcion: 'x', resumen: grande, etiquetas: TALLAS })).toEqual({
      tipo: 'build-large', ms: 0, fuente: 'respaldo',
    })
  })

  test('sin regla que aplique, siempre build-small', async () => {
    const grande = { chars: 9000, archivos: 20, pasos: 0, mencionaSpec: true }
    expect((await respaldo({ descripcion: 'x', resumen: grande, etiquetas: TIPOS })).tipo).toBe('build-small')
  })
})
