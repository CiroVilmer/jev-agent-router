import { describe, expect, test } from 'claude-code/testing'
import { alcanceDeReview } from '../src/tallaReview'

describe('alcanceDeReview', () => {
  test('palabras de alcance amplio', () => {
    expect(alcanceDeReview('Review the feature flags block')).toBe('feature')
    expect(alcanceDeReview('Revisión de la fase 7')).toBe('fase')
    expect(alcanceDeReview('Review integración con el hook')).toBe('integración')
    expect(alcanceDeReview('Review before merge')).toBe('merge')
    expect(alcanceDeReview('Review del BLOQUE 2')).toBe('BLOQUE')
    expect(alcanceDeReview('Review the branch')).toBe('branch')
  })

  test('varias tareas', () => {
    expect(alcanceDeReview('Review Tasks 3-5')).toBe('Tasks 3-5')
    expect(alcanceDeReview('Review tareas 3 y 4')).toBe('tareas 3 y 4')
    expect(alcanceDeReview('Review tasks 2a to 4')).toBe('tasks 2a to 4')
    expect(alcanceDeReview('Review T3-T5')).toBe('T3-T5')
    expect(alcanceDeReview('Review T3 - 5')).toBe('T3 - 5')
  })

  test('una sola tarea no tiene alcance', () => {
    expect(alcanceDeReview('Review Task 3')).toBe(null)
    expect(alcanceDeReview('Review Task 3 (spec + quality)')).toBe(null)
    expect(alcanceDeReview('Review T3')).toBe(null)
  })

  test('bordes de palabra: blocking, features, branching no matchean', () => {
    expect(alcanceDeReview('Review Task 3: blocking calls')).toBe(null)
    expect(alcanceDeReview('Review Task 3: features nuevas')).toBe(null)
    expect(alcanceDeReview('Review Task 3: branching logic')).toBe(null)
    expect(alcanceDeReview('Review Task 3: merged cells')).toBe(null)
    expect(alcanceDeReview('Review Task 3: phased rollout')).toBe(null)
  })
})
