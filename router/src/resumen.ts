export type Resumen = { chars: number; archivos: number; pasos: number; mencionaSpec: boolean }

const ARCHIVO = /[\w./\\-]+\.(?:tsx?|jsx?|mjs|py|md|json|sql|ya?ml|css|sh)\b/g
const PASO = /^\s*(?:\d+[.)]\s|- \[ \]|\*\*Step \d+|Step \d+)/gm
const SPEC = /\b(spec|plan)\b|superpowers\/(specs|plans)/i

export function resumir(prompt: string): Resumen {
  return {
    chars: prompt.length,
    archivos: new Set(prompt.match(ARCHIVO) ?? []).size,
    pasos: (prompt.match(PASO) ?? []).length,
    mencionaSpec: SPEC.test(prompt),
  }
}

export function textoResumen(descripcion: string, r: Resumen): string {
  const chars = r.chars >= 1000 ? `${(r.chars / 1000).toFixed(1)}k` : String(r.chars)
  const spec = r.mencionaSpec ? ' · menciona spec' : ''
  return `${descripcion} · prompt ${chars} chars · ${r.archivos} archivos · ${r.pasos} pasos${spec}`
}

/**
 * Más de ~5k caracteres, o ~3k a ~5k nombrando 10 archivos o más. Antes `archivos > 6` mandaba a
 * Opus 56 de 100 builds chicos del banco (los prompts de plan nombran spec, plan y contexto).
 */
export function tamanoPorRespaldo(r: Resumen): 'build-large' | 'build-small' {
  return r.chars > 5000 || (r.chars > 3000 && r.archivos >= 10) ? 'build-large' : 'build-small'
}
