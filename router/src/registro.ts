// bench/linea-base.mjs importa este archivo directo desde Node: dejá solo `import type` arriba.
import type { Subagente, Tipo } from '../types'

export function tareaDe(descripcion: string): string | null {
  const m = descripcion.match(/\b(?:task|tarea)s?\s+(\d+[a-z]?)/i) ?? descripcion.match(/\bT(\d+[a-z]?)\b/)
  if (m) return `Tarea ${m[1]}`
  // Sin número de tarea: "v2: kubernetes" y "verif: kubernetes" son la misma unidad de trabajo.
  const p = descripcion.replace(/\[pin\]/gi, '').match(/^\s*([^\s:]+(?:\s+[^\s:]+)?)\s*:\s*(\S.*?)\s*$/)
  if (!p || p[1]!.length > 30) return null
  return p[2]!.toLowerCase().slice(0, 60)
}

export type ResumenTarea = {
  tarea: string
  pasos: { tipo: Tipo | null; terminado: boolean }[]
  rondas: number
  minutos: number
  activa: boolean
}

export function agruparPorTarea(subs: readonly Subagente[], ahora: number): ResumenTarea[] {
  const grupos = new Map<string, Subagente[]>()
  for (const s of subs) if (s.tarea) grupos.set(s.tarea, [...(grupos.get(s.tarea) ?? []), s])
  return [...grupos].map(([tarea, lista]) => {
    const activa = lista.some(s => s.fin === null)
    const inicio = Math.min(...lista.map(s => s.inicio))
    const fin = activa ? ahora : Math.max(...lista.map(s => s.fin ?? ahora))
    return {
      tarea,
      pasos: lista.map(s => ({ tipo: s.tipo, terminado: s.fin !== null })),
      rondas: lista.filter(s => s.tipo === 're-review').length,
      minutos: Math.round((fin - inicio) / 60_000),
      activa,
    }
  })
}

export type MetricasSesion = {
  reviewsEnOpus: number | null
  rondasPorTarea: number | null
  minutosPorTarea: number | null
  reasignados: number
  total: number
}

const REVISIONES: readonly (Tipo | null)[] = ['review', 'review-final', 're-review']

/** Mediana; con cantidad par, el promedio de los dos del medio. */
export function mediana(xs: readonly number[]): number | null {
  if (!xs.length) return null
  const o = [...xs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

export function metricasDe(subs: readonly Subagente[], ahora: number): MetricasSesion {
  const revisiones = subs.filter(s => REVISIONES.includes(s.tipo))
  const enOpus = revisiones.filter(s => (s.escalon ? s.escalon.modelo === 'opus' : /opus/i.test(s.modeloEfectivo ?? s.pedido))).length
  const tareas = agruparPorTarea(subs, ahora)
  const revisadas = tareas.filter(t => t.pasos.some(p => p.tipo === 'review'))
  const terminadas = tareas.filter(t => !t.activa)
  const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  return {
    reviewsEnOpus: revisiones.length ? enOpus / revisiones.length : null,
    rondasPorTarea: promedio(revisadas.map(t => t.rondas)),
    minutosPorTarea: mediana(terminadas.map(t => t.minutos)),
    reasignados: subs.filter(s => s.reasignado).length,
    total: subs.length,
  }
}
