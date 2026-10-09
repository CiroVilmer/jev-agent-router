import type { Escalon, Modelo, Overrides, Tipo } from '../types'
import { formatEscalon, MODELOS, parseEscalon, TIPOS } from './taxonomia'

export const OVERRIDES_INICIAL: Overrides = { activo: true, permitidos: null, fijados: {} }

export type Comando =
  | { accion: 'panel' }
  | { accion: 'on' }
  | { accion: 'off' }
  | { accion: 'reset' }
  | { accion: 'permitir'; modelos: Modelo[] }
  | { accion: 'fijar'; tipo: Tipo; escalon: Escalon }
  | { accion: 'banco'; max: number | null; solo: 'haiku' | 'jev' | null }
  | { accion: 'historial'; dias: number }
  | { accion: 'error'; mensaje: string }

export const AYUDA =
  'Uso: /router · /router on|off|reset · /router permitir sonnet,opus · /router fijar <tipo> <modelo>·<esfuerzo> · /router banco · /router historial [días]'

const USO_BANCO = 'Uso: /router banco [--max N] [--solo haiku|jev]'

function parsearBanco(resto: readonly string[]): Comando {
  let max: number | null = null
  let solo: 'haiku' | 'jev' | null = null
  for (let i = 0; i < resto.length; i += 2) {
    const opcion = resto[i]!
    const valor = resto[i + 1]
    if (opcion.toLowerCase() === '--max') {
      if (valor === undefined || !/^\d+$/.test(valor) || Number(valor) < 1) {
        return { accion: 'error', mensaje: `--max pide un número de casos mayor que 0. ${USO_BANCO}` }
      }
      max = Number(valor)
    } else if (opcion.toLowerCase() === '--solo') {
      const v = valor?.toLowerCase()
      if (v !== 'haiku' && v !== 'jev') {
        return { accion: 'error', mensaje: `--solo es haiku o jev, no "${valor ?? ''}". ${USO_BANCO}` }
      }
      solo = v
    } else {
      return { accion: 'error', mensaje: `Opción desconocida: ${opcion}. ${USO_BANCO}` }
    }
  }
  return { accion: 'banco', max, solo }
}

/** Días del export de `/router historial` cuando no se dicen. */
export const DIAS_EXPORT = 7

function parsearHistorial(resto: readonly string[]): Comando {
  if (resto.length === 0) return { accion: 'historial', dias: DIAS_EXPORT }
  const [dias] = resto
  if (resto.length > 1 || !/^\d+$/.test(dias!) || Number(dias) < 1) {
    return { accion: 'error', mensaje: `Uso: /router historial [días], con días mayor que 0 (${DIAS_EXPORT} si no lo decís)` }
  }
  return { accion: 'historial', dias: Number(dias) }
}

export function parsearComando(args: string): Comando {
  const [verbo = '', ...resto] = args.trim().split(/\s+/).filter(Boolean)
  switch (verbo.toLowerCase()) {
    case '':
    case 'panel':
      return { accion: 'panel' }
    case 'on':
      return { accion: 'on' }
    case 'off':
      return { accion: 'off' }
    case 'reset':
      return { accion: 'reset' }
    case 'permitir': {
      const modelos = resto.join(',').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      const malos = modelos.filter(m => !(MODELOS as readonly string[]).includes(m))
      if (modelos.length === 0) {
        return { accion: 'error', mensaje: 'Decime qué modelos: /router permitir sonnet,opus' }
      }
      if (malos.length > 0) {
        return { accion: 'error', mensaje: `Modelos no válidos: ${malos.join(', ')}. ${AYUDA}` }
      }
      return { accion: 'permitir', modelos: [...new Set(modelos)] as Modelo[] }
    }
    case 'fijar': {
      const [tipo, ...escalonTexto] = resto
      if (tipo === undefined || !(TIPOS as readonly string[]).includes(tipo.toLowerCase())) {
        return { accion: 'error', mensaje: `Tipo no válido: ${tipo ?? '(vacío)'}. Tipos: ${TIPOS.join(', ')}` }
      }
      const escalon = parseEscalon(escalonTexto.join(' '))
      if (!escalon) {
        return {
          accion: 'error',
          mensaje: `Escalón no válido: "${escalonTexto.join(' ')}". Ejemplos: opus·xhigh, sonnet·medium, haiku·high`,
        }
      }
      return { accion: 'fijar', tipo: tipo.toLowerCase() as Tipo, escalon }
    }
    case 'banco':
      return parsearBanco(resto)
    case 'historial':
      return parsearHistorial(resto)
    default:
      return { accion: 'error', mensaje: `No entiendo "${verbo}". ${AYUDA}` }
  }
}

export function aplicarComando(o: Overrides, c: Comando): Overrides {
  switch (c.accion) {
    case 'on':
      return { ...o, activo: true }
    case 'off':
      return { ...o, activo: false }
    case 'reset':
      return OVERRIDES_INICIAL
    case 'permitir':
      return { ...o, permitidos: c.modelos }
    case 'fijar':
      return { ...o, fijados: { ...o.fijados, [c.tipo]: c.escalon } }
    default:
      return o
  }
}

export function describirComando(c: Comando): string {
  switch (c.accion) {
    case 'on':
      return 'Router: prendido.'
    case 'off':
      return 'Router: apagado. Los subagentes salen con lo que pide Claude.'
    case 'reset':
      return 'Router: sin overrides en esta sesión.'
    case 'permitir':
      return `Router: en esta sesión solo se usan ${c.modelos.join(', ')}.`
    case 'fijar':
      return `Router: ${c.tipo} queda fijado en ${formatEscalon(c.escalon)} para esta sesión.`
    case 'error':
      return c.mensaje
    case 'panel':
      return 'Panel del router abierto.'
    case 'banco':
      return 'Router: corriendo el banco de prueba.'
    case 'historial':
      return `Router: exportando el historial de ${c.dias === 1 ? 'el último día' : `los últimos ${c.dias} días`}.`
  }
}

export function tienePin(descripcion: string): boolean {
  return /\[pin\]/i.test(descripcion)
}

/**
 * La sección `router:pin` del system prompt: le saca a Claude la elección del modelo y le pide usar
 * ese razonamiento en descomponer y paralelizar sin conflictos. Cómo nombrar los subagentes va en
 * la descripción de la tool Agent (CONVENCION_AGENT), donde Claude lo lee al usarla.
 */
export const LINEA_ROUTER =
  'Router de subagentes activo: el modelo y el esfuerzo de cada subagente los elige un router ' +
  'según el tipo de tarea y según cuánto queda de la ventana de 5 horas. No gastes razonamiento ' +
  'eligiendo `model` para los subagentes. Usá ese tiempo en descomponer bien el trabajo: lanzá en ' +
  'paralelo las tareas independientes y serializá las que tocan los mismos archivos, comparten ' +
  'estado o dependen del resultado de otra. Cómo nombrar cada subagente está en la descripción ' +
  'de la tool Agent.'
