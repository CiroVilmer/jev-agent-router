import type { Tipo } from '../types'

export type ResultadoRegla = { tipo: Tipo | 'build'; regla: string } | null

const REGLAS: readonly { regla: string; patron: RegExp; tipo: Tipo | 'build' }[] = [
  { regla: 're-review', patron: /\bre-?revi/i, tipo: 're-review' },
  { regla: 'fix', patron: /^(fix(e[sd]|ing)?\b|arregl|correg|ola de arreglos)/i, tipo: 'fix' },
  {
    regla: 'review-final',
    patron: /whole-branch|\bfinal\b.*\b(review|revisi)|\b(review|revisi)\w*\b.*\bfinal\b/i,
    tipo: 'review-final',
  },
  { regla: 'review', patron: /\b(review|revis)|^(verif\w*|valid\w*|audit\w*|check)\b/i, tipo: 'review' },
  { regla: 'research', patron: /^(research|investig)/i, tipo: 'research' },
  { regla: 'explore', patron: /^(explore|map|relevar)\b/i, tipo: 'explore' },
  { regla: 'build', patron: /^(implement\w*|task|tarea|t\d+[a-z]?)\b/i, tipo: 'build' },
  { regla: 'write', patron: /^(write(?!(?:\s+\S+){0,2}?\s+(?:tests?|script|code|migration|parser|function)\b)|redactar|bitácora|bitacora|documentar|escribir)\b|\bvault\b/i, tipo: 'write' },
]

export function clasificarPorReglas(descripcion: string, subagentType: string): ResultadoRegla {
  if (subagentType === 'Explore') return { tipo: 'explore', regla: 'subagentType Explore' }
  if (/revisor-final/i.test(subagentType)) return { tipo: 'review-final', regla: `subagentType ${subagentType}` }
  for (const r of REGLAS) if (r.patron.test(descripcion)) return { tipo: r.tipo, regla: r.regla }
  return null
}
