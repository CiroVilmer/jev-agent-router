import type { EstadoPolitica } from '../politica'

export function textoLinea(p: EstadoPolitica, m: { reasignados: number; total: number }): string | undefined {
  const partes: string[] = []
  if (p.modo === 'fuego') partes.push(`🔥 subiendo dos niveles hasta el reset (${p.minutosAlReset}m)`)
  if (p.modo === 'sobra') partes.push(`⬆️ subiendo un nivel hasta el reset (${p.minutosAlReset}m)`)
  if (m.reasignados > 0) partes.push(`${m.reasignados} de ${m.total} subagentes reasignados`)
  return partes.length > 0 ? `router · ${partes.join(' · ')} · /router` : undefined
}
