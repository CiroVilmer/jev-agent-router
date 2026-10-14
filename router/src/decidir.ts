import type { Escalon, Modelo, Overrides, Tipo } from '../types'
import type { Clasificacion, Clasificador } from './clasificadores'
import { TALLAS } from './clasificadores'
import { tienePin } from './overrides'
import type { EstadoPolitica } from './politica'
import { subir } from './politica'
import { clasificarPorReglas } from './reglas'
import { resumir } from './resumen'
import type { Tabla } from './taxonomia'
import { BASE, ESCALERA, formatEscalon, TECHO, TIPOS, TOPE } from './taxonomia'

export type EntradaDecision = {
  descripcion: string
  prompt: string
  subagentType: string
  modeloPedido: string | undefined
  fork: boolean
}

export type Contexto = { overrides: Overrides; politica: EstadoPolitica; clasificar: Clasificador; tabla?: Tabla; jevDecideReviews: boolean }

export type Decision =
  | { tocar: false; motivos: string[] }
  | { tocar: true; tipo: Tipo; escalon: Escalon; motivos: string[] }

/** El motivo de una decisión que falló, recortado a 80 caracteres como el detalle del clasificador. */
export function motivoError(error: unknown): string {
  return `error del router: ${String(error)}`.slice(0, 80)
}

const REVIEWS: readonly Tipo[] = ['review-final', 'review', 're-review']

/** Lo que pasó al consultar a Jev por una review: el tipo final y, si corresponde, el motivo. */
export function revisarConJev(regla: Tipo, cl: Clasificacion): { tipo: Tipo; motivo: string | null } {
  const conf = cl.confianza === undefined ? '' : ` (${cl.confianza.toFixed(2)})`
  // Una review no baja a Haiku por Jev: explore y write dejan la regla.
  if (cl.fuente === 'jev' && cl.detalle === undefined && (cl.tipo === 'explore' || cl.tipo === 'write'))
    return { tipo: regla, motivo: `jev → ${cl.tipo}${conf}: queda la regla` }
  if (cl.fuente === 'jev' && cl.detalle === undefined) return { tipo: cl.tipo, motivo: `jev → ${cl.tipo}${conf}` }
  if (cl.fuente === 'jev') return { tipo: regla, motivo: `jev dudó${conf}: queda la regla` }
  // Hoy inalcanzable (solo se consulta con Jev como clasificador principal); queda como defensa.
  if (cl.fuente === 'haiku') return { tipo: regla, motivo: `haiku → ${cl.tipo}: queda la regla` }
  return { tipo: regla, motivo: cl.detalle ? `respaldo (${cl.detalle}): queda la regla` : null }
}

/** Cuánto subió la política de verdad, ya con el techo aplicado. */
export function motivoPolitica(base: number, i: number): string | null {
  return i > base ? `política +${i - base}` : null
}

export async function decidir(e: EntradaDecision, c: Contexto): Promise<Decision> {
  if (!c.overrides.activo) return { tocar: false, motivos: ['router apagado'] }
  if (e.fork) return { tocar: false, motivos: ['fork: hereda el modelo'] }
  if (tienePin(e.descripcion)) return { tocar: false, motivos: ['[pin]: respeta lo que pidió Claude'] }

  const motivos: string[] = []
  const regla = clasificarPorReglas(e.descripcion, e.subagentType)
  let tipo: Tipo
  if (regla && regla.tipo !== 'build') {
    tipo = regla.tipo
    motivos.push(`regla ${regla.regla}`)
    // Jev decide la familia review (le gana a las reglas en el banco): si está seguro, manda él.
    if (c.jevDecideReviews && REVIEWS.includes(regla.tipo) && !regla.regla.startsWith('subagentType')) {
      const cl = await c.clasificar({ descripcion: e.descripcion, resumen: resumir(e.prompt), etiquetas: TIPOS })
      const r = revisarConJev(regla.tipo, cl)
      tipo = r.tipo
      if (r.motivo) motivos.push(r.motivo)
    }
  } else {
    motivos.push(regla ? `regla ${regla.regla}` : 'ninguna regla')
    const cl = await c.clasificar({
      descripcion: e.descripcion,
      resumen: resumir(e.prompt),
      etiquetas: regla ? TALLAS : TIPOS,
    })
    tipo = cl.tipo
    const detalle = cl.detalle ? ` (${cl.detalle})` : ''
    const confianza = cl.confianza === undefined ? '' : ` (${cl.confianza.toFixed(2)})`
    motivos.push(`${cl.fuente}${detalle} → ${cl.tipo}${confianza}`)
  }

  let escalon: Escalon
  const fijado = c.overrides.fijados[tipo]
  if (fijado) {
    escalon = fijado
    motivos.push(`fijado con /router: ${formatEscalon(fijado)}`)
  } else {
    const { base, techo } = c.tabla ?? { base: BASE, techo: TECHO }
    if (base[tipo] !== BASE[tipo]) motivos.push(`base de /config: ${formatEscalon(ESCALERA[base[tipo]]!)}`)
    const deseado = base[tipo] + c.politica.escalones
    const i = subir(base[tipo], c.politica.escalones, techo[tipo])
    const mp = motivoPolitica(base[tipo], i)
    if (mp !== null) motivos.push(mp)
    if (techo[tipo] !== undefined && deseado > techo[tipo]!) motivos.push(`techo de ${tipo}`)
    escalon = ESCALERA[i]!
  }

  const final = ajustarAPermitidos(escalon, c.overrides.permitidos)
  if (final !== escalon) motivos.push(`permitidos: ${c.overrides.permitidos!.join(',')}`)
  return { tocar: true, tipo, escalon: final, motivos }
}

/** Si el modelo no está permitido, busca el escalón permitido más cercano; ante empate, sube. */
export function ajustarAPermitidos(e: Escalon, permitidos: readonly Modelo[] | null): Escalon {
  if (!permitidos || permitidos.includes(e.modelo)) return e
  const exacto = ESCALERA.findIndex(x => x.modelo === e.modelo && x.esfuerzo === e.esfuerzo)
  // Un escalón fijado fuera de la escalera (opus·max) arranca desde el más alto de su modelo.
  const desde = exacto !== -1 ? exacto : ESCALERA.map(x => x.modelo).lastIndexOf(e.modelo)
  for (let d = 1; d <= TOPE; d++) {
    const arriba = ESCALERA[desde + d]
    if (arriba && permitidos.includes(arriba.modelo)) return arriba
    const abajo = ESCALERA[desde - d]
    if (abajo && permitidos.includes(abajo.modelo)) return abajo
  }
  return e
}
