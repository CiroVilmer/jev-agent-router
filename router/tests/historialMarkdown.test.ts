import { describe, expect, test } from 'claude-code/testing'
import type { Registro } from '../src/historial'
import { fechaLocal, historialMarkdown, horaLocal } from '../src/historialMarkdown'

const MIN = 60_000
const DIA = 86_400_000
const AHORA = Date.parse('2026-10-07T15:00:00Z')
const reg = (c: Partial<Registro>): Registro => ({
  sesion: 's1', tarea: null, tipo: null, modelo: null, pedido: 'sonnet', reasignado: false, inicio: 0, fin: 1, ...c,
})
const dos = (n: number) => String(n).padStart(2, '0')

describe('fecha y hora locales', () => {
  test('salen de la hora local, con ceros', () => {
    const d = new Date(AHORA)
    expect(fechaLocal(AHORA)).toBe(`${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`)
    expect(horaLocal(AHORA)).toBe(`${dos(d.getHours())}:${dos(d.getMinutes())}`)
  })
})

describe('historialMarkdown', () => {
  const t1 = AHORA - 2 * DIA
  const t2 = AHORA - DIA
  const registros = [
    // Sesión abcdef123456, Tarea 6: build → review (reasignado) → fix → re-review.
    reg({ sesion: 'abcdef123456', tarea: 'Tarea 6', tipo: 'build-small', modelo: 'sonnet', inicio: t1, fin: t1 + 10 * MIN,
      descripcion: 'Implement Task 6', elegido: 'sonnet·medium', motivos: ['regla build', 'respaldo → build-small'], modo: 'normal' }),
    reg({ sesion: 'abcdef123456', tarea: 'Tarea 6', tipo: 'review', modelo: 'opus', reasignado: true, inicio: t1 + 10 * MIN, fin: t1 + 20 * MIN,
      descripcion: 'Review Task 6 | spec', elegido: 'opus·xhigh', motivos: ['regla review'], modo: 'fuego' }),
    reg({ sesion: 'abcdef123456', tarea: 'Tarea 6', tipo: 'fix', modelo: 'sonnet', inicio: t1 + 20 * MIN, fin: t1 + 30 * MIN,
      descripcion: 'Fix Task 6', elegido: 'sonnet·high', motivos: ['regla fix'], modo: 'normal' }),
    reg({ sesion: 'abcdef123456', tarea: 'Tarea 6', tipo: 're-review', modelo: 'opus', reasignado: true, inicio: t1 + 30 * MIN, fin: t1 + 40 * MIN,
      descripcion: 'Re-review Task 6', elegido: 'opus·medium', motivos: ['regla re-review'], modo: 'normal' }),
    // Sin tarea, en la misma sesión.
    reg({ sesion: 'abcdef123456', tipo: 'explore', modelo: 'haiku', inicio: t1 + 50 * MIN, fin: t1 + 55 * MIN,
      descripcion: 'Explore repo', elegido: 'haiku', motivos: ['regla explore'], modo: 'normal' }),
    // Otra sesión, un registro viejo sin los campos de la decisión.
    reg({ sesion: 'zzzz9999', tarea: 'Tarea 1', tipo: 'review', modelo: 'opus', pedido: 'opus', inicio: t2, fin: t2 + 5 * MIN }),
    // Fuera de rango: hace 10 días.
    reg({ sesion: 'vieja000', tarea: 'Tarea 9', tipo: 'review', modelo: 'opus', inicio: AHORA - 10 * DIA, fin: AHORA - 10 * DIA + MIN }),
  ]
  const md = historialMarkdown(registros, AHORA, 7)

  test('encabezado: fecha, rango y resumen', () => {
    expect(md.startsWith('# Historial del router\n')).toBe(true)
    expect(md).toContain(`Exportado el ${fechaLocal(AHORA)} ${horaLocal(AHORA)}`)
    expect(md).toContain(`últimos 7 días (${fechaLocal(AHORA - 7 * DIA)} ${horaLocal(AHORA - 7 * DIA)} → ${fechaLocal(AHORA)} ${horaLocal(AHORA)})`)
    expect(md).toContain('- 6 decisiones, 2 reasignadas')
    expect(md).toContain('- Por modelo: opus 3 · sonnet 2 · haiku 1')
    expect(md).toContain('- Por tipo → modelo: review → opus 2 · build-small → sonnet 1 · fix → sonnet 1 · re-review → opus 1 · explore → haiku 1')
    expect(md).toContain('- Modo: normal 4 · fuego 1 · sin dato 1')
  })

  test('una sección por sesión, con id corto y fecha, en orden', () => {
    const a = md.indexOf(`## Sesión abcdef12 · ${fechaLocal(t1)}`)
    const b = md.indexOf(`## Sesión zzzz9999 · ${fechaLocal(t2)}`)
    expect(a).toBeGreaterThan(-1)
    expect(b).toBeGreaterThan(a)
    expect(md).not.toContain('vieja000')
    expect(md).not.toContain('Tarea 9')
  })

  test('por tarea: ciclo, rondas y tabla con hora, tipo, descripción, pedido → elegido, modo y motivos', () => {
    expect(md).toContain('### Tarea 6')
    expect(md).toContain('Ciclo: build-small → review → fix → re-review · 1 ronda de re-review')
    expect(md).toContain('| Hora | Tipo | Descripción | Pedido → elegido | Modo | Motivos |')
    expect(md).toContain(`| ${horaLocal(t1)} | build-small | Implement Task 6 | sonnet → sonnet·medium | normal | regla build · respaldo → build-small |`)
    // El | de la descripción se escapa para no romper la tabla.
    expect(md).toContain(`| ${horaLocal(t1 + 10 * MIN)} | review | Review Task 6 \\| spec | sonnet → opus·xhigh | fuego | regla review |`)
    expect(md.indexOf('### Tarea 6')).toBeLessThan(md.indexOf('### Sin tarea'))
    expect(md).toContain('Ciclo: explore · 0 rondas de re-review')
  })

  test('un registro viejo sale con lo que hay', () => {
    expect(md).toContain('Ciclo: review · 0 rondas de re-review')
    expect(md).toContain(`| ${horaLocal(t2)} | review |  | opus → opus | — |  |`)
  })

  test('sin registros en el rango lo dice', () => {
    const vacio = historialMarkdown([], AHORA, 3)
    expect(vacio).toContain('últimos 3 días')
    expect(vacio).toContain('- 0 decisiones, 0 reasignadas')
    expect(vacio).toContain('Sin decisiones en el rango.')
  })

  test('1 día va en singular', () => {
    expect(historialMarkdown([], AHORA, 1)).toContain('último día')
  })
})

describe('celdas de la tabla', () => {
  test('escapa la barra invertida antes que el |: a\\|b no rompe la fila', () => {
    const md = historialMarkdown([reg({ tarea: 'Tarea 1', inicio: AHORA - MIN, fin: AHORA, descripcion: 'a\\|b' })], AHORA, 7)
    // a \ | b → a \\ \| b: la barra queda literal y el | escapado, sin abrir una columna nueva.
    expect(md).toContain(' | a\\\\\\|b | ')
  })
})
