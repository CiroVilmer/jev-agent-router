import type { Tipo } from '../../types'
import { textoResumen } from '../resumen'
import type { Reloj } from './haiku'
import type { Clasificacion, Clasificador } from './index'

export type Nombres = { principal: string; sombra: string }

export type Muestra = {
  fecha: number
  tarea: string
  etiquetas: Tipo[]
  nombres: Nombres
  principal: Clasificacion
  sombra: Clasificacion
  /** La sombra respondió por su cuenta, pero tardó más que `topeMs`: en producción habría decidido el respaldo. */
  pasoTope: boolean
}

/**
 * Decide el principal y lo devuelve apenas responde. La sombra corre en paralelo y en segundo
 * plano: nunca se espera, y cualquier fallo suyo (o del reloj o del registro) se traga.
 * `topeMs` no corta a la sombra: solo marca en la muestra si se pasó (`pasoTope`).
 */
export function conSombra(
  principal: Clasificador,
  sombra: Clasificador,
  registrar: (m: Muestra) => Promise<void>,
  ahora: Reloj,
  nombres: Nombres,
  topeMs: number,
): Clasificador {
  return p => {
    const a = principal(p)
    void (async () => {
      const b = await sombra(p)
      const resultado = await a
      const muestra: Muestra = {
        fecha: await ahora(),
        tarea: textoResumen(p.descripcion, p.resumen),
        etiquetas: [...p.etiquetas],
        nombres,
        principal: resultado,
        sombra: b,
        pasoTope: b.fuente !== 'respaldo' && b.ms > topeMs,
      }
      await registrar(muestra)
    })().catch(() => {})
    return a
  }
}

export function agregarMuestra(lista: readonly Muestra[], m: Muestra, max = 500): Muestra[] {
  return [...lista, m].slice(-max)
}

/**
 * Un clasificador dentro de un par. p50/p95 miden solo las respuestas propias (sin respaldo) y
 * son null si no hay ninguna, o si es `reglas` (decide sin modelo). `pasoTope` es null para el
 * principal: a él lo corta el tope, y esos cortes ya cuentan como respaldos.
 */
export type PorClasificador = {
  nombre: string
  n: number
  p50: number | null
  p95: number | null
  respaldos: number
  pasoTope: number | null
}

/**
 * Un par principal→sombra. Una muestra es comparable si la sombra respondió por su cuenta y el
 * principal también (o es `reglas`, cuyo respaldo es su forma normal de decidir): comparar contra
 * un respaldo forzado por el tope o por un error mediría el respaldo, no al clasificador.
 */
export type EstadisticasPar = {
  par: string
  n: number
  comparables: number
  coinciden: number
  principal: PorClasificador
  sombra: PorClasificador
}

export type Estadisticas = { n: number; pares: EstadisticasPar[] }

const percentil = (xs: number[], q: number): number | null => {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!
}

function porClasificador(nombre: string, rs: readonly Clasificacion[], pasoTope: number | null): PorClasificador {
  if (nombre === 'reglas') return { nombre, n: rs.length, p50: null, p95: null, respaldos: 0, pasoTope }
  const propias = rs.filter(r => r.fuente !== 'respaldo').map(r => r.ms)
  return {
    nombre,
    n: rs.length,
    p50: percentil(propias, 0.5),
    p95: percentil(propias, 0.95),
    respaldos: rs.length - propias.length,
    pasoTope,
  }
}

export function esComparable(m: Muestra): boolean {
  return m.sombra.fuente !== 'respaldo' && (m.nombres.principal === 'reglas' || m.principal.fuente !== 'respaldo')
}

/** Estadísticas por par principal→sombra (al cambiar /config se mezclan pares), en orden de aparición. */
export function estadisticasSombra(lista: readonly Muestra[]): Estadisticas | null {
  if (lista.length === 0) return null
  const grupos = new Map<string, Muestra[]>()
  for (const m of lista) {
    const par = `${m.nombres.principal}→${m.nombres.sombra}`
    grupos.set(par, [...(grupos.get(par) ?? []), m])
  }
  const pares = [...grupos].map(([par, ms]): EstadisticasPar => {
    const comparables = ms.filter(esComparable)
    return {
      par,
      n: ms.length,
      comparables: comparables.length,
      coinciden: comparables.filter(m => m.principal.tipo === m.sombra.tipo).length,
      principal: porClasificador(ms[0]!.nombres.principal, ms.map(m => m.principal), null),
      sombra: porClasificador(ms[0]!.nombres.sombra, ms.map(m => m.sombra), ms.filter(m => m.pasoTope).length),
    }
  })
  return { n: lista.length, pares }
}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null

/**
 * Lo que hay en el store, ya validado: el store sobrevive a versiones del plugin y a ediciones a
 * mano, así que algo que no es lista vale como lista vacía y una muestra rota se descarta. Una
 * muestra de antes de `pasoTope` lo toma como false.
 */
export function muestrasDe(valor: unknown): Muestra[] {
  if (!Array.isArray(valor)) return []
  return valor
    .filter(
      (m): m is Muestra =>
        esObjeto(m) &&
        esObjeto(m.nombres) &&
        typeof m.nombres.principal === 'string' &&
        typeof m.nombres.sombra === 'string' &&
        esObjeto(m.principal) &&
        esObjeto(m.sombra),
    )
    .map(m => ({ ...m, pasoTope: m.pasoTope === true }))
}
