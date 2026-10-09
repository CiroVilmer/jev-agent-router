import type { Modelo, Subagente, Tipo } from '../types'
import type { Modo } from './politica'
import { metricasDe, type MetricasSesion } from './registro'
import { MODELOS } from './taxonomia'

/** Un subagente terminado, en forma compacta, para guardarlo entre sesiones. */
export type Registro = {
  sesion: string
  tarea: string | null
  tipo: Tipo | null
  modelo: Modelo | null
  pedido: string
  reasignado: boolean
  inicio: number
  fin: number
  // Los campos de la decisión. Opcionales: los registros guardados antes de que existieran no los tienen.
  /** La description del subagente, truncada a `MAX_DESCRIPCION` caracteres. */
  descripcion?: string
  /** El escalón como texto (`opus·xhigh`), o el pedido si el router no lo tocó. */
  elegido?: string
  /** La cadena del router: `regla review`, `jev → build-large (0.83)`, `política +2`, `[pin]: …`. */
  motivos?: string[]
  /** La política al momento del spawn. */
  modo?: Modo
}

export const MAX_DESCRIPCION = 100
const MODOS: readonly Modo[] = ['fuego', 'sobra', 'normal']

/** Tope de registros: por sesión y, sumando todas las sesiones, el que dispara la poda. */
export const MAX_HISTORIAL = 3000
/** Una sesión cuyo último registro tiene esta antigüedad o más se borra al podar. */
export const DIAS_HISTORIAL = 14

/** La clave única de antes de guardar por sesión; se migra a `CLAVE_LEGADO` y se borra. */
export const CLAVE_VIEJA = 'historial'
const PREFIJO = 'historial:'
/** Cada sesión escribe solo la suya: dos procesos no se pisan el get → set. */
export const claveHistorial = (sesion: string) => `${PREFIJO}${sesion}`
/** Adonde va a parar la clave vieja al migrarla: queda como una sesión más. */
export const CLAVE_LEGADO = claveHistorial('legado')
/** Las claves que lee el panel: las de cada sesión y la vieja, si todavía no se migró. */
export const esClaveHistorial = (clave: string) => clave === CLAVE_VIEJA || clave.startsWith(PREFIJO)

function modeloDe(s: Subagente): Modelo | null {
  if (s.escalon) return s.escalon.modelo
  // Sin escalón, el modelo con el que corrió (el del padre si heredó), no el pedido.
  const modelo = (s.modeloEfectivo ?? s.pedido).toLowerCase()
  return MODELOS.find(m => modelo.includes(m)) ?? null
}

/** null si el subagente todavía no terminó. */
export function registroDe(s: Subagente, sesion: string): Registro | null {
  if (s.fin === null) return null
  return {
    sesion,
    tarea: s.tarea,
    tipo: s.tipo,
    modelo: modeloDe(s),
    pedido: s.pedido,
    reasignado: s.reasignado,
    inicio: s.inicio,
    fin: s.fin,
    descripcion: s.descripcion.slice(0, MAX_DESCRIPCION),
    elegido: s.elegido,
    motivos: [...s.motivos],
    ...(s.modo ? { modo: s.modo } : {}),
  }
}

export function agregarRegistro(lista: readonly Registro[], r: Registro, max = MAX_HISTORIAL): Registro[] {
  return [...lista, r].slice(-max)
}

/**
 * Valida lo leído del store: descarta lo que no tenga sesión, inicio o fin numéricos, pedido string
 * o tarea string/null. Normaliza `reasignado` a booleano y `modelo` a uno válido o null. De los
 * campos de la decisión (opcionales) quita el que venga malformado, sin tirar el registro.
 */
export function historialDe(valor: unknown): Registro[] {
  if (!Array.isArray(valor)) return []
  return valor
    .filter(
      (r): r is Registro =>
        typeof r === 'object' &&
        r !== null &&
        typeof r.sesion === 'string' &&
        typeof r.pedido === 'string' &&
        (typeof r.tarea === 'string' || r.tarea === null) &&
        typeof r.inicio === 'number' &&
        Number.isFinite(r.inicio) &&
        typeof r.fin === 'number' &&
        Number.isFinite(r.fin),
    )
    .map(r => {
      const limpio: Registro = {
        ...r,
        reasignado: r.reasignado === true,
        modelo: (MODELOS as readonly unknown[]).includes(r.modelo) ? r.modelo : null,
      }
      const crudo = r as Record<string, unknown>
      if (typeof crudo.descripcion !== 'string') delete limpio.descripcion
      if (typeof crudo.elegido !== 'string') delete limpio.elegido
      if (!Array.isArray(crudo.motivos) || !crudo.motivos.every(m => typeof m === 'string')) delete limpio.motivos
      if (!(MODOS as readonly unknown[]).includes(crudo.modo)) delete limpio.modo
      return limpio
    })
}

/** Identifica un registro para no contarlo dos veces al juntar memoria y store. */
const claveRegistro = (r: { sesion: string | null; inicio: number; pedido: string; descripcion?: string }) =>
  `${r.sesion}|${r.inicio}|${r.pedido}|${(r.descripcion ?? '').slice(0, MAX_DESCRIPCION)}`

/** `a` y después los de `b` que no estén en `a` (misma sesión, inicio, pedido y descripción). */
export function unirRegistros(a: readonly Registro[], b: readonly Registro[]): Registro[] {
  const vistos = new Set(a.map(claveRegistro))
  return [...a, ...b.filter(r => !vistos.has(claveRegistro(r)))]
}

/** Una decisión del router como la muestran la pestaña Historial y el export. */
export type FilaDecision = {
  sesion: string | null
  inicio: number
  tarea: string | null
  tipo: Tipo | null
  descripcion: string
  pedido: string
  elegido: string
  /** El modelo con el que corrió (o corre); null si no se sabe. */
  modelo: Modelo | null
  modo: Modo | null
  motivos: string[]
  reasignado: boolean
  enCurso: boolean
}

/** Un registro guardado. Los viejos, sin los campos de la decisión, caen en el modelo y en vacío. */
export function filaDeRegistro(r: Registro): FilaDecision {
  return {
    sesion: r.sesion,
    inicio: r.inicio,
    tarea: r.tarea,
    tipo: r.tipo,
    descripcion: r.descripcion ?? '',
    pedido: r.pedido,
    elegido: r.elegido ?? r.modelo ?? r.pedido,
    modelo: r.modelo,
    modo: r.modo ?? null,
    motivos: r.motivos ?? [],
    reasignado: r.reasignado,
    enCurso: false,
  }
}

/** Un subagente de la memoria de esta sesión, terminado o en curso. */
export function filaDeSub(s: Subagente, sesion: string | null): FilaDecision {
  return {
    sesion,
    inicio: s.inicio,
    tarea: s.tarea,
    tipo: s.tipo,
    descripcion: s.descripcion.slice(0, MAX_DESCRIPCION),
    pedido: s.pedido,
    elegido: s.elegido,
    modelo: modeloDe(s),
    modo: s.modo ?? null,
    motivos: s.motivos,
    reasignado: s.reasignado,
    enCurso: s.fin === null,
  }
}

/**
 * Las decisiones de la memoria (esta sesión, también las que siguen corriendo) y las del store,
 * sin repetir las de esta sesión que ya se guardaron, de la más nueva a la más vieja. Con `n`,
 * solo las `n` más nuevas.
 */
export function ultimasDecisiones(
  subs: readonly Subagente[],
  sesion: string | null,
  guardados: readonly Registro[],
  n = Infinity,
): FilaDecision[] {
  const deMemoria = subs.map(s => filaDeSub(s, sesion))
  // Sin id de sesión, la memoria no sabe en qué clave del store quedó lo suyo: se compara sin la
  // sesión, así un registro ya guardado no aparece dos veces.
  const clave = sesion === null
    ? (r: Parameters<typeof claveRegistro>[0]) => claveRegistro({ ...r, sesion: null })
    : claveRegistro
  const vistos = new Set(deMemoria.map(clave))
  const delStore = guardados.filter(r => !vistos.has(clave(r))).map(filaDeRegistro)
  return [...deMemoria, ...delStore].sort((a, b) => b.inicio - a.inicio).slice(0, n)
}

/** Una cuenta por etiqueta, de la más frecuente a la menos; empatadas, por orden de aparición. */
export type Cuenta = [string, number][]

function contar(etiquetas: readonly string[]): Cuenta {
  const m = new Map<string, number>()
  for (const e of etiquetas) m.set(e, (m.get(e) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1])
}

export type ResumenDecisiones = {
  total: number
  reasignadas: number
  /** Por modelo con el que corrió; `?` si no se sabe. */
  porModelo: Cuenta
  /** Por modo de la política; `sin dato` en los registros viejos. */
  porModo: Cuenta
  /** Por tipo (`sin tipo` si no hay), cada uno con su cuenta por modelo; los tipos, del más frecuente al menos. */
  porTipo: [string, Cuenta][]
}

export function resumenDecisiones(filas: readonly FilaDecision[]): ResumenDecisiones {
  const tipos = new Map<string, string[]>()
  for (const f of filas) {
    const t = f.tipo ?? 'sin tipo'
    tipos.set(t, [...(tipos.get(t) ?? []), f.modelo ?? '?'])
  }
  return {
    total: filas.length,
    reasignadas: filas.filter(f => f.reasignado).length,
    porModelo: contar(filas.map(f => f.modelo ?? '?')),
    porModo: contar(filas.map(f => f.modo ?? 'sin dato')),
    porTipo: [...tipos]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([t, modelos]): [string, Cuenta] => [t, contar(modelos)]),
  }
}

/**
 * Los de los últimos `dias` días: el rango es `(ahora - dias, ahora]`, con el borde de abajo
 * exclusivo, así la semana anterior (la misma llamada con `ahora - 7d`) no repite ninguno. Se
 * decide por grupo `sesion·tarea` según el último `fin` del grupo, que entra o queda afuera
 * entero: una tarea no se parte en el borde. Los registros sin tarea van por su propio `fin`.
 */
export function ultimosDias(lista: readonly Registro[], ahora: number, dias: number): Registro[] {
  const desde = ahora - dias * 86_400_000
  const grupo = (r: Registro) => (r.tarea === null ? null : `${r.sesion}·${r.tarea}`)
  const ultimoFin = new Map<string, number>()
  for (const r of lista) {
    const g = grupo(r)
    if (g !== null) ultimoFin.set(g, Math.max(ultimoFin.get(g) ?? -Infinity, r.fin))
  }
  return lista.filter(r => {
    const g = grupo(r)
    const fin = g === null ? r.fin : ultimoFin.get(g)!
    return fin > desde && fin <= ahora
  })
}

/** Reutiliza `metricasDe`; la tarea lleva la sesión adelante para no mezclar "Tarea 1" de sesiones distintas. */
export function metricasHistorial(lista: readonly Registro[]): MetricasSesion {
  const subs: Subagente[] = lista.map((r, i) => ({
    agentId: String(i),
    descripcion: '',
    tarea: r.tarea === null ? null : `${r.sesion}·${r.tarea}`,
    tipo: r.tipo,
    pedido: r.pedido,
    elegido: r.pedido,
    escalon: r.modelo ? { modelo: r.modelo } : null,
    motivos: [],
    reasignado: r.reasignado,
    inicio: r.inicio,
    fin: r.fin,
  }))
  return metricasDe(subs, 0)
}

/** El historial de una sesión, como lo guarda el store. */
/** `registros: null` marca una lectura fallida: no se sabe qué tiene, así que no se poda. */
export type HistorialSesion = { clave: string; registros: readonly Registro[] | null }

/**
 * Las claves a borrar con `$.store.delete`, nunca `actual` (la de esta sesión):
 * - nunca una sesión con `registros: null` (lectura fallida), que tampoco cuenta en el total;
 * - las sesiones cuyo último `fin` tiene `dias` días o más (o que no tienen registros válidos);
 * - si con las que quedan el total pasa de `max`, las más viejas (por último `fin`) hasta entrar.
 */
export function clavesAPodar(
  sesiones: readonly HistorialSesion[],
  ahora: number,
  actual: string,
  max = MAX_HISTORIAL,
  dias = DIAS_HISTORIAL,
): string[] {
  const limite = ahora - dias * 86_400_000
  const conFin = sesiones
    .filter(s => s.clave !== actual)
    .flatMap(s => (s.registros === null ? [] : [{ clave: s.clave, registros: s.registros }]))
    .map(s => ({ ...s, ultimo: Math.max(-Infinity, ...s.registros.map(r => r.fin)) }))
  const borrar = conFin.filter(s => s.ultimo <= limite).map(s => s.clave)
  let total = sesiones.filter(s => !borrar.includes(s.clave)).reduce((a, s) => a + (s.registros?.length ?? 0), 0)
  const quedan = conFin.filter(s => !borrar.includes(s.clave)).sort((a, b) => a.ultimo - b.ultimo)
  for (const s of quedan) {
    if (total <= max) break
    borrar.push(s.clave)
    total -= s.registros.length
  }
  return borrar
}
