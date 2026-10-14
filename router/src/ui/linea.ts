import type { Subagente } from '../../types'

const LARGO_DESCRIPCION = 40

/** El motivo en una palabra: quién decidió el tipo (`jev 0.98`, `jev dudó`, `regla`…). */
export function motivoCorto(motivos: readonly string[]): string {
  const jev = motivos.find(m => m.startsWith('jev'))
  if (jev) {
    if (jev.startsWith('jev dudó')) return 'jev dudó'
    const confianza = jev.match(/\((\d\.\d\d)\)/g)?.at(-1)
    return confianza ? `jev ${confianza.slice(1, -1)}` : 'jev'
  }
  if (motivos.some(m => m.startsWith('respaldo'))) return 'respaldo'
  if (motivos.some(m => m.startsWith('haiku'))) return 'haiku'
  if (motivos.some(m => m.startsWith('fijado'))) return 'fijado'
  if (motivos.some(m => m.startsWith('regla'))) return 'regla'
  return ''
}

/** Por qué no lo tocó, entre corchetes: `[pin]`, `[off]`, `[fork]` o `[error]`. */
function sinTocar(motivos: readonly string[]): string {
  const m = motivos[0] ?? ''
  if (m.startsWith('[pin]')) return '[pin]'
  if (m.startsWith('router apagado')) return '[off]'
  if (m.startsWith('fork')) return '[fork]'
  return '[error]'
}

/**
 * La línea debajo del prompt: la última decisión del router, por ejemplo
 * `router · Review Task 3: parser → opus·xhigh · jev 0.98 · +1`. Sin subagentes no se muestra.
 * No repite lo que ya está en el statusline (modelo, contexto, 5 h, 7 d) ni en la lista de agentes.
 */
export function textoLinea(ultimo: Subagente | undefined): string | undefined {
  if (!ultimo) return undefined
  const d = ultimo.descripcion.trim()
  const descripcion = d.length > LARGO_DESCRIPCION ? `${d.slice(0, LARGO_DESCRIPCION - 1)}…` : d
  if (ultimo.escalon === null) return `router · ${descripcion} → ${ultimo.pedido} ${sinTocar(ultimo.motivos)}`
  const partes = [`router · ${descripcion} → ${ultimo.elegido}`]
  const motivo = motivoCorto(ultimo.motivos)
  if (motivo) partes.push(motivo)
  const politica = ultimo.motivos.find(m => m.startsWith('política '))
  if (politica) partes.push(politica.slice('política '.length))
  return partes.join(' · ')
}
