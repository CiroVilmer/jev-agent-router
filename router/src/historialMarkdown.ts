import type { Cuenta, Registro } from './historial'
import { filaDeRegistro, resumenDecisiones, ultimosDias } from './historial'

// Puro: arma el texto del export de `/router history`. Leer el store y escribir el archivo lo
// hace hooks/register.tsx.

const dos = (n: number) => String(n).padStart(2, '0')

/** `YYYY-MM-DD` en la hora local. */
export function fechaLocal(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}

/** `HH:MM` en la hora local. */
export function horaLocal(ms: number): string {
  const d = new Date(ms)
  return `${dos(d.getHours())}:${dos(d.getMinutes())}`
}

const momento = (ms: number) => `${fechaLocal(ms)} ${horaLocal(ms)}`

/** `opus 3 · sonnet 2`. */
export const textoCuenta = (c: Cuenta) => c.map(([k, n]) => `${k} ${n}`).join(' · ')

/**
 * Una celda de tabla: sin saltos de línea, con la `\` escapada primero y después el `|`, así un
 * `a\|b` no deja un `|` suelto que abra otra columna.
 */
const celda = (s: string) => s.replace(/\r?\n/g, ' ').replace(/\\/g, '\\\\').replace(/\|/g, '\\|')

/** Agrupa conservando el orden en que aparece cada clave. */
function agrupar<T>(xs: readonly T[], clave: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>()
  for (const x of xs) m.set(clave(x), [...(m.get(clave(x)) ?? []), x])
  return [...m]
}

function seccionTarea(titulo: string, registros: readonly Registro[]): string[] {
  const rondas = registros.filter(r => r.tipo === 're-review').length
  const ciclo = registros.map(r => r.tipo ?? '?').join(' → ')
  const filas = registros.map(r => {
    const f = filaDeRegistro(r)
    const celdas = [horaLocal(f.inicio), f.tipo ?? '—', f.descripcion, `${f.pedido} → ${f.elegido}`, f.modo ?? '—', f.motivos.join(' · ')]
    return `| ${celdas.map(celda).join(' | ')} |`
  })
  return [
    `### ${titulo}`,
    '',
    `Ciclo: ${ciclo} · ${rondas} ${rondas === 1 ? 'ronda' : 'rondas'} de re-review`,
    '',
    '| Hora | Tipo | Descripción | Pedido → elegido | Modo | Motivos |',
    '|---|---|---|---|---|---|',
    ...filas,
    '',
  ]
}

/**
 * El Markdown de `/router history [days]`: un encabezado con la fecha, el rango y el resumen, y
 * una sección por sesión con una tabla por tarea (con su ciclo y sus rondas de re-review). El rango
 * es el de `ultimosDias`: `(ahora - dias, ahora]`, y una tarea entra o queda afuera entera.
 */
export function historialMarkdown(registros: readonly Registro[], ahora: number, dias: number): string {
  const enRango = ultimosDias(registros, ahora, dias)
  const r = resumenDecisiones(enRango.map(filaDeRegistro))
  const rango = dias === 1 ? 'último día' : `últimos ${dias} días`
  const lineas = [
    '# Historial del router',
    '',
    `Exportado el ${momento(ahora)} · ${rango} (${momento(ahora - dias * 86_400_000)} → ${momento(ahora)})`,
    '',
    '## Resumen',
    '',
    `- ${r.total} ${r.total === 1 ? 'decisión' : 'decisiones'}, ${r.reasignadas} ${r.reasignadas === 1 ? 'reasignada' : 'reasignadas'}`,
  ]
  if (r.total > 0) {
    lineas.push(
      `- Por modelo: ${textoCuenta(r.porModelo)}`,
      `- Por tipo → modelo: ${r.porTipo.map(([t, c]) => `${t} → ${textoCuenta(c)}`).join(' · ')}`,
      `- Modo: ${textoCuenta(r.porModo)}`,
    )
  }
  lineas.push('')
  if (r.total === 0) {
    lineas.push('Sin decisiones en el rango.', '')
    return lineas.join('\n')
  }

  const ordenados = [...enRango].sort((a, b) => a.inicio - b.inicio)
  for (const [sesion, deSesion] of agrupar(ordenados, x => x.sesion)) {
    lineas.push(`## Sesión ${sesion.slice(0, 8)} · ${fechaLocal(deSesion[0]!.inicio)}`, '')
    const tareas = agrupar(deSesion, x => x.tarea ?? '')
    // Las tareas en orden de inicio; los subagentes sin tarea, al final.
    for (const [tarea, deTarea] of [...tareas.filter(([t]) => t !== ''), ...tareas.filter(([t]) => t === '')]) {
      lineas.push(...seccionTarea(tarea || 'Sin tarea', deTarea))
    }
  }
  return lineas.join('\n')
}
