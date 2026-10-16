// router/src/clasificadores/protocolos.ts
/**
 * Pedidos y lectura de los dos protocolos de los clasificadores por HTTP: System One (Jev y un
 * servidor local con decision models) y OpenAI (un LLM chico, con la confianza de los logprobs).
 * Sin imports de valor: bench/ importa este archivo directo desde Node, y así el banco arma el
 * mensaje igual que producción.
 */

export function pedidoSystemOne(modelo: string, tarea: string, pregunta: unknown) {
  return { model: modelo, state: { tarea }, questions: { tipo: pregunta } }
}

export function leerSystemOne(texto: string, etiquetas: readonly string[], fuente: string): { tipo: string; confianza: number } {
  let json: { answers?: { tipo?: { type?: string; choice?: unknown; confidence?: unknown; probabilities?: Record<string, number> } } }
  try {
    json = JSON.parse(texto)
  } catch {
    throw new Error(`${fuente}: la respuesta no es JSON`)
  }
  const a = json.answers?.tipo
  if (!a || a.type !== 'choice' || typeof a.choice !== 'string') throw new Error(`${fuente}: la respuesta no trae answers.tipo`)
  if (!etiquetas.includes(a.choice)) throw new Error(`${fuente} eligió una opción que no se pidió: ${a.choice}`)
  const bruta = typeof a.confidence === 'number' ? a.confidence : a.probabilities?.[a.choice]
  const confianza = typeof bruta === 'number' && Number.isFinite(bruta) ? Math.min(1, Math.max(0, bruta)) : 0
  return { tipo: a.choice, confianza }
}

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function letrasDe(etiquetas: readonly string[]): string[] {
  return etiquetas.map((_, i) => LETRAS[i]!)
}

export function textoOpenAI(texto: string, etiquetas: readonly string[]): string {
  const clave = letrasDe(etiquetas).map((l, i) => `${l} = ${etiquetas[i]}`).join('\n')
  return `${texto}\n\nRespondé solo con la letra del tipo, en JSON {"r": "<letra>"}:\n${clave}`
}

export function pedidoOpenAI(modelo: string, texto: string, etiquetas: readonly string[]) {
  return {
    model: modelo,
    messages: [{ role: 'user', content: texto }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'tipo',
        strict: true,
        schema: {
          type: 'object',
          properties: { r: { type: 'string', enum: letrasDe(etiquetas) } },
          required: ['r'],
          additionalProperties: false,
        },
      },
    },
    logprobs: true,
    top_logprobs: 20,
    temperature: 0,
    max_tokens: 16,
    // Los modelos con thinking (Qwen3, Gemma 4) lo apagan; los servidores que no lo conocen lo ignoran.
    chat_template_kwargs: { enable_thinking: false },
  }
}

type Logprob = { token?: unknown; logprob?: unknown; top_logprobs?: unknown }
const limpiar = (token: unknown) => (typeof token === 'string' ? token.replace(/["'{}:\s]/g, '') : '')

/** Probabilidad renormalizada de `elegida` entre las letras de la clave, en la primera posición que es una letra. */
function confianzaDe(logprobs: unknown, letras: readonly string[], elegida: string): number {
  const contenido = (logprobs as { content?: unknown } | null)?.content
  if (!Array.isArray(contenido)) return 0
  const pos = (contenido as Logprob[]).find(p => letras.includes(limpiar(p.token)))
  if (!pos) return 0
  const prob = new Map<string, number>()
  const sumar = (token: unknown, logprob: unknown) => {
    const l = limpiar(token)
    if (!letras.includes(l) || typeof logprob !== 'number') return
    prob.set(l, Math.max(prob.get(l) ?? 0, Math.exp(logprob)))
  }
  sumar(pos.token, pos.logprob)
  if (Array.isArray(pos.top_logprobs)) for (const t of pos.top_logprobs as Logprob[]) sumar(t.token, t.logprob)
  const total = [...prob.values()].reduce((a, b) => a + b, 0)
  return total > 0 ? (prob.get(elegida) ?? 0) / total : 0
}

export function leerOpenAI(texto: string, etiquetas: readonly string[]): { tipo: string; confianza: number } {
  let json: { choices?: { message?: { content?: unknown }; logprobs?: unknown }[] }
  try {
    json = JSON.parse(texto)
  } catch {
    throw new Error('local: la respuesta no es JSON')
  }
  const eleccion = json.choices?.[0]
  if (!eleccion || typeof eleccion.message?.content !== 'string') throw new Error('local: la respuesta no trae choices[0].message.content')
  let r: unknown
  try {
    r = (JSON.parse(eleccion.message.content) as { r?: unknown }).r
  } catch {
    r = undefined
  }
  if (typeof r !== 'string') throw new Error('local: el contenido no es {"r": letra}')
  const letras = letrasDe(etiquetas)
  const i = letras.indexOf(r)
  if (i < 0) throw new Error(`local eligió una letra que no se pidió: ${r}`)
  return { tipo: etiquetas[i]!, confianza: confianzaDe(eleccion.logprobs, letras, r) }
}
