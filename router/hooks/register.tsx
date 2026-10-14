import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'
import type { LecturaUso, Pestana, Subagente } from '../types'
import type { Caso, ResultadoBanco } from '../src/banco'
import { casosDeProduccion, colaEnOrden, conLimite, correrBanco, nombreCorrida } from '../src/banco'
import type { Clasificador } from '../src/clasificadores'
import { limitesDe, respaldo } from '../src/clasificadores'
import { crearHaiku } from '../src/clasificadores/haiku'
import { crearJev, JEV_URL } from '../src/clasificadores/jev'
import type { Muestra } from '../src/clasificadores/sombra'
import { agregarMuestra, conSombra, estadisticasSombra, muestrasDe } from '../src/clasificadores/sombra'
import { conTope } from '../src/clasificadores/tope'
import { avisoConvencion, CONVENCION_AGENT } from '../src/convencion'
import type { Decision } from '../src/decidir'
import { decidir, motivoError } from '../src/decidir'
import type { HistorialSesion } from '../src/historial'
import {
  agregarRegistro,
  CLAVE_LEGADO,
  CLAVE_VIEJA,
  claveHistorial,
  clavesAPodar,
  esClaveHistorial,
  historialDe,
  MAX_HISTORIAL,
  metricasHistorial,
  registroDe,
  resumenDecisiones,
  ultimasDecisiones,
  ultimosDias,
  unirRegistros,
} from '../src/historial'
import { historialMarkdown } from '../src/historialMarkdown'
import { aplicarComando, describirComando, LINEA_ROUTER, OVERRIDES_INICIAL, parsearComando } from '../src/overrides'
import { lecturaDe, politicaSegunHot, umbralesDe } from '../src/politica'
import { tareaDe } from '../src/registro'
import { clasificarPorReglas } from '../src/reglas'
import { formatEscalon, tablaDe } from '../src/taxonomia'
import { textoLinea } from '../src/ui/linea'
import { DECISIONES_EN_PANEL, vistaPanel } from '../src/ui/panel'
import { observarVentana, resumenVentanas, ventanasDe } from '../src/ventanas'

export const PANE = 'router'

// Los atoms viven en este archivo y no en un módulo aparte: el cargador de hooks lista lo que
// el módulo lee y escribe, y solo acepta en read/update un atom declarado en un const de este
// mismo archivo (un atom importado hace que el módulo no cargue).
export const subagentesAtom = atom({ plugin: 'agent-router', key: 'subagentes' } as const, [] as Subagente[])
export const overridesAtom = atom({ plugin: 'agent-router', key: 'overrides' } as const, OVERRIDES_INICIAL)
export const lecturaAtom = atom({ plugin: 'agent-router', key: 'lectura' } as const, null as LecturaUso | null)
export const pestanaAtom = atom({ plugin: 'agent-router', key: 'pestana' } as const, 'curso' as Pestana)

// El cargador de hooks solo deja pasar $ a funciones declaradas en el nivel superior del
// archivo: por eso refrescarLinea vive acá afuera.
export async function refrescarLinea($: EngineInterface): Promise<void> {
  // La última decisión del router: los subagentes se agregan en orden de spawn.
  $.ui.status(textoLinea((await read($, subagentesAtom)).at(-1)))
}

// Cada aviso de que falta la key de Jev sale una sola vez por carga del módulo.
const avisosSinKey = new Set<string>()

/** Límite de la sombra: generoso, como el del banco. Corre en segundo plano y no frena la decisión. */
export const LIMITE_SOMBRA_MS = 60_000

/**
 * El tope de tiempo con una espera propia por llamada: cuando el clasificador gana la carrera,
 * la espera se corta y no queda viva gastando el presupuesto del hook. Si llega `signal` (el del
 * hook), abandonar el dispatch también la corta, y entonces decide el respaldo.
 */
export function conTopeVivo($: EngineInterface, c: Clasificador, ms: number, signal?: AbortSignal): Clasificador {
  return conEsperaCortable($, dormir => conTope(c, ms, dormir), signal)
}

/**
 * Arma, por llamada, un clasificador con una espera de `$.clock.sleep` que se corta al terminar
 * la llamada (o al abortar `signal`). La usan el tope de producción y el límite del banco.
 */
export function conEsperaCortable(
  $: EngineInterface,
  armar: (dormir: (ms: number) => Promise<void>) => Clasificador,
  signal?: AbortSignal,
): Clasificador {
  return async p => {
    const corte = new AbortController()
    const cortar = () => corte.abort()
    signal?.addEventListener('abort', cortar)
    try {
      return await armar(espera => $.clock.sleep(espera, { signal: corte.signal }))(p)
    } finally {
      signal?.removeEventListener('abort', cortar)
      corte.abort()
    }
  }
}

/**
 * El POST a Jev. Si el pedido falla, el mensaje sale sin la key (por si el error la repitiera):
 * termina en el `detalle` del respaldo, que el panel muestra.
 */
export async function postJev($: EngineInterface, key: string, cuerpo: string) {
  try {
    return await $.http.fetch(JEV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: cuerpo,
    })
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    throw new Error(`jev: ${mensaje.split(key).join('***')}`)
  }
}

/** Haiku por `$.model.classify`, sin tope: el tope lo pone quien lo usa. */
export function armarHaiku($: EngineInterface): Clasificador {
  return crearHaiku((texto, etiquetas) => $.model.classify(texto, etiquetas, { model: 'haiku' }), () => $.clock.now())
}

/** La key de Jev, de /config o de JEV_API_KEY; null si no hay. Nunca se loguea ni se guarda. */
export async function keyJev($: EngineInterface, options: PluginOptions): Promise<string | null> {
  return (typeof options.jevApiKey === 'string' && options.jevApiKey) || (await $.env.get('JEV_API_KEY')) || null
}

/**
 * Jev con una key ya buscada, sin tope. La key queda capturada en el closure y solo sale en el
 * header del POST (postJev la tapa en los errores).
 */
export function armarJevConKey($: EngineInterface, key: string, umbral: number): Clasificador {
  return crearJev(cuerpo => postJev($, key, cuerpo), () => $.clock.now(), umbral)
}

/** Jev con la key de /config o de JEV_API_KEY, sin tope; null si no hay key. */
export async function armarJev($: EngineInterface, options: PluginOptions, umbral: number): Promise<Clasificador | null> {
  const key = await keyJev($, options)
  return key ? armarJevConKey($, key, umbral) : null
}

export function avisarSinKey($: EngineInterface, consecuencia: string): void {
  const texto = `Router: falta la key de Jev (/config o JEV_API_KEY); ${consecuencia}`
  if (avisosSinKey.has(texto)) return
  avisosSinKey.add(texto)
  $.ui.toast(texto)
}

// Arma el clasificador según /config. $ entra acá (función de nivel superior) y sale capturado
// en closures: decidir recibe un Clasificador y no conoce $.
export async function armarClasificador(
  $: EngineInterface,
  options: PluginOptions,
  signal?: AbortSignal,
): Promise<{ clasificar: Clasificador; jevDecideReviews: boolean }> {
  const principalReglas = options.clasificador !== 'haiku' && options.clasificador !== 'jev'
  // Con reglas y sin sombra no hace falta nada más: decide el respaldo, sin modelo.
  if (principalReglas && options.sombra !== 'haiku' && options.sombra !== 'jev') {
    return { clasificar: respaldo, jevDecideReviews: false }
  }
  const { topeMs, jevUmbral } = limitesDe(options)
  const ahora = () => $.clock.now()

  // La key se busca solo si alguien va a usar Jev.
  const key = options.clasificador === 'jev' || options.sombra === 'jev' ? await keyJev($, options) : null

  // El principal: reglas (el respaldo, sin tope: no espera a nadie, y así se juntan muestras de
  // un clasificador antes de pasarse a él), haiku, o jev con su umbral. Jev sin key cae a haiku.
  let principal: { nombre: string; c: Clasificador }
  if (principalReglas) principal = { nombre: 'reglas', c: respaldo }
  else if (options.clasificador === 'haiku') principal = { nombre: 'haiku', c: armarHaiku($) }
  else if (key) principal = { nombre: 'jev', c: armarJevConKey($, key, jevUmbral) }
  else {
    avisarSinKey($, 'uso Haiku')
    principal = { nombre: 'haiku', c: armarHaiku($) }
  }
  // Las reviews por description consultan a Jev solo si Jev es el principal y hay key.
  const jevDecideReviews = principal.nombre === 'jev'
  const decide = principalReglas ? respaldo : conTopeVivo($, principal.c, topeMs, signal)

  // La sombra: Jev con umbral 0, para guardar su elección y su confianza reales. Jev sin key no
  // se reemplaza por otro: la sombra queda desactivada.
  let sombra: { nombre: string; c: Clasificador } | null = null
  if (options.sombra === 'haiku') sombra = { nombre: 'haiku', c: armarHaiku($) }
  else if (options.sombra === 'jev' && key) sombra = { nombre: 'jev', c: armarJevConKey($, key, 0) }
  else if (options.sombra === 'jev' && options.clasificador !== 'jev') avisarSinKey($, 'sombra desactivada')
  if (!sombra || sombra.nombre === principal.nombre) return { clasificar: decide, jevDecideReviews }

  // La sombra no lleva el signal del hook ni el tope de producción: sigue en segundo plano después
  // de que el spawn sale, con un límite generoso, y guarda sus ms reales y si pasó topeMs.
  const clasificar = conSombra(decide, conTopeVivo($, sombra.c, LIMITE_SOMBRA_MS), m => guardarMuestra($, m), ahora, {
    principal: principal.nombre,
    sombra: sombra.nombre,
  }, topeMs)
  return { clasificar, jevDecideReviews }
}

// Una cola de escrituras por clave del store: dos escrituras que llegan juntas (dos sombras, dos
// subagentes que terminan a la vez) no se pisan el get → set.
const colas = new Map<string, Promise<void>>()

/**
 * Encola `get → f → set` sobre `clave`. Registrar es secundario: una falla (del store o de `f`)
 * se traga y no corta la cola. Devuelve la promesa de esta escritura, que nunca rechaza.
 */
export function escribirEnCola(
  $: EngineInterface,
  clave: string,
  f: (actual: unknown) => unknown | Promise<unknown>,
): Promise<void> {
  const escritura = (colas.get(clave) ?? Promise.resolve())
    .then(async () => {
      const nuevo = await f(await $.store.get(clave))
      await $.store.set(clave, nuevo)
    })
    .catch(() => {})
  colas.set(clave, escritura)
  return escritura
}

export function guardarMuestra($: EngineInterface, m: Muestra): Promise<void> {
  return escribirEnCola($, 'sombra', actual => agregarMuestra(muestrasDe(actual), m))
}

/**
 * Suma al historial el subagente que acaba de terminar, en la clave de esta sesión
 * (`historial:<sessionId>`), y después poda. Nunca rechaza: registrar es secundario.
 */
export async function guardarRegistro($: EngineInterface, sub: Subagente): Promise<void> {
  const sesion = await $.session.id().catch(() => null)
  if (sesion === null) return
  const r = registroDe(sub, sesion)
  if (!r) return
  const clave = claveHistorial(sesion)
  await escribirEnCola($, clave, actual => agregarRegistro(historialDe(actual), r))
  await podarHistorial($, clave)
}

/** Lee el historial de todas las sesiones (y la clave vieja, si sigue). Una clave que falla queda con `registros: null`. */
export async function leerHistoriales($: EngineInterface): Promise<HistorialSesion[]> {
  const claves = (await $.store.keys()).filter(esClaveHistorial)
  return Promise.all(
    claves.map(async clave => ({ clave, registros: await $.store.get(clave).then(historialDe, () => null) })),
  )
}

/**
 * Migra la clave vieja `historial`: la suma a `historial:legado`, que queda como una sesión más, y
 * la borra. Si la escritura falla, no borra: se reintenta en la próxima poda.
 */
export async function migrarHistorialViejo($: EngineInterface): Promise<void> {
  const viejo = historialDe(await $.store.get(CLAVE_VIEJA))
  if (viejo.length) {
    const legado = historialDe(await $.store.get(CLAVE_LEGADO))
    await $.store.set(CLAVE_LEGADO, [...legado, ...viejo].slice(-MAX_HISTORIAL))
  }
  await $.store.delete(CLAVE_VIEJA)
}

// Las podas del proceso van de a una: dos que terminan juntas no leen y borran a la vez.
let colaPoda: Promise<void> = Promise.resolve()

/**
 * Poda el historial al escribir: migra la clave vieja y borra las sesiones de más de 14 días y,
 * si el total pasa de MAX_HISTORIAL, las más viejas. Nunca toca `actual` y nunca rechaza.
 */
export function podarHistorial($: EngineInterface, actual: string): Promise<void> {
  colaPoda = colaPoda
    .then(async () => {
      if ((await $.store.keys()).includes(CLAVE_VIEJA)) await migrarHistorialViejo($).catch(() => {})
      const [sesiones, ahora] = await Promise.all([leerHistoriales($), $.clock.now()])
      await Promise.all(clavesAPodar(sesiones, ahora, actual).map(clave => $.store.delete(clave).catch(() => {})))
    })
    .catch(() => {})
  return colaPoda
}

/**
 * Suma la lectura de 5 h a la ventana que le toca. La hora se lee dentro de la cola: dos lecturas
 * seguidas quedan en orden y `ultimaVista` nunca retrocede.
 */
export function guardarVentana($: EngineInterface, lectura: LecturaUso): Promise<void> {
  return escribirEnCola($, 'ventanas', async actual => observarVentana(ventanasDe(actual), lectura, await $.clock.now()))
}

/** Adónde va el export de `/router historial`, dentro del home. */
export const ARCHIVO_HISTORIAL = ['.claude', 'router-historial.md'] as const

/** `<home>/.claude/router-historial.md`, con el separador que ya usa el home (`\` en Windows). */
export function rutaHistorial(home: string): string {
  const sep = home.includes('\\') ? '\\' : '/'
  return [home.replace(/[\\/]+$/, ''), ...ARCHIVO_HISTORIAL].join(sep)
}

/**
 * /router historial [días]: arma el Markdown con el historial guardado de todas las sesiones más lo
 * de esta que todavía no llegó al store, lo escribe en `<home>/.claude/router-historial.md`
 * (sobrescribe) y devuelve la línea de respuesta. Rechaza si no hay home o si la escritura falla.
 */
export async function exportarHistorial($: EngineInterface, dias: number): Promise<string> {
  const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME'))
  if (!home) throw new Error('no encuentro el home: USERPROFILE ni HOME')
  const [guardado, subs, sesion, ahora] = await Promise.all([
    leerHistoriales($).catch(() => [] as HistorialSesion[]),
    read($, subagentesAtom),
    $.session.id().catch(() => null),
    $.clock.now(),
  ])
  const enMemoria = sesion === null ? [] : subs.flatMap(s => registroDe(s, sesion) ?? [])
  const registros = unirRegistros(guardado.flatMap(s => s.registros ?? []), enMemoria)
  const ruta = rutaHistorial(home)
  await $.fs.write(ruta, historialMarkdown(registros, ahora, dias))
  const n = ultimosDias(registros, ahora, dias).length
  const rango = dias === 1 ? 'del último día' : `de los últimos ${dias} días`
  return `Router: ${n} ${n === 1 ? 'decisión' : 'decisiones'} ${rango} → ${ruta}`
}

/** La línea que ve Claude en el resultado de Agent cuando el router reasignó el subagente. */
export function avisoReasignado(s: Subagente): string {
  const motivos = s.motivos.join(' · ')
  return `(router: corre en ${s.elegido}${motivos ? ` — ${motivos}` : ''})`
}

/** Límite por llamada del banco: generoso, solo para que una llamada colgada no lo frene. */
export const LIMITE_BANCO_MS = 60_000

/**
 * /router banco: corre Haiku y Jev sobre los casos de producción de bench/casos.json, por el
 * mismo camino que producción pero sin tope ni sombra, y con umbral 0 para que Jev no se
 * descarte por duda (la confianza queda en la corrida). Guarda bench/corridas/<fecha>-<hora>-banco.json
 * cada 25 resultados y al final; devuelve el resumen de una línea.
 */
export async function correrBancoEnSesion(
  $: EngineInterface,
  options: PluginOptions,
  comando: { max: number | null; solo: 'haiku' | 'jev' | null },
): Promise<string> {
  const cwd = await $.session.cwd()
  const { casos } = JSON.parse(String(await $.fs.read(`${cwd}/bench/casos.json`))) as { casos: Caso[] }
  const elegidos = casosDeProduccion(casos).slice(0, comando.max ?? undefined)

  const clasificadores: Partial<Record<'haiku' | 'jev', Clasificador>> = {}
  let aviso = ''
  if (comando.solo !== 'jev') clasificadores.haiku = armarHaiku($)
  if (comando.solo !== 'haiku') {
    const jev = await armarJev($, options, 0)
    if (jev) {
      clasificadores.jev = jev
    } else {
      clasificadores.haiku ??= armarHaiku($)
      aviso = ' · sin key de Jev (/config o JEV_API_KEY): corrió solo Haiku'
    }
  }

  // Sin tope de producción, pero con un límite generoso por llamada: una colgada no frena el banco.
  const conLimites: Partial<Record<'haiku' | 'jev', Clasificador>> = {}
  for (const [fuente, c] of Object.entries(clasificadores) as ['haiku' | 'jev', Clasificador][]) {
    conLimites[fuente] = conEsperaCortable($, dormir => conLimite(c, LIMITE_BANCO_MS, dormir))
  }

  const ahora = new Date(await $.clock.now())
  // `fecha` va en ISO UTC; el nombre del archivo, en hora local.
  const fecha = ahora.toISOString()
  const relativa = nombreCorrida(ahora)
  const nombres = Object.keys(clasificadores)
  // Los guardados pasan por una cola: uno lento no pisa a uno posterior.
  const enCola = colaEnOrden()
  const guardar = (resultados: readonly ResultadoBanco[]) =>
    enCola(() => $.fs.write(`${cwd}/${relativa}`, JSON.stringify({ fecha, clasificadores: nombres, resultados }, null, 1) + '\n'))

  const resultados = await correrBanco(elegidos, conLimites, {
    concurrencia: 3,
    alAvanzar: async (hechos, _total, parciales) => {
      // Un guardado parcial que falla no corta el banco: el final vuelve a intentar.
      if (hechos % 25 === 0) await guardar(parciales).catch(() => {})
    },
  })
  await guardar(resultados)

  const cuenta = (fuente: 'haiku' | 'jev') => {
    const rs = resultados.filter(r => r.fuente === fuente)
    const errores = rs.filter(r => r.error !== null).length
    return ` · ${fuente} ${rs.length - errores} ok / ${errores} error`
  }
  const partes = (['haiku', 'jev'] as const).filter(f => clasificadores[f]).map(cuenta).join('')
  return `Banco: ${elegidos.length} ${elegidos.length === 1 ? 'caso' : 'casos'}${partes} · ${relativa}${aviso}`
}

/** El modo hot se guarda en el store: vale para todas las sesiones. Arranca apagado. */
const CLAVE_HOT = 'hot'

export async function leerHot($: EngineInterface): Promise<boolean> {
  try {
    return (await $.store.get(CLAVE_HOT)) === true
  } catch {
    // Sin store (o si falla), apagado: la política nunca sube sin que el usuario la prenda.
    return false
  }
}

export async function guardarHot($: EngineInterface, valor: boolean): Promise<void> {
  await $.store.set(CLAVE_HOT, valor)
}

export const register: Register = (on, options) => {
  const umbrales = umbralesDe(options)
  const tabla = tablaDe(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'router',
      description: 'Router de subagentes: panel, overrides (on, off, reset, permitir, fijar), modo hot, banco e historial',
    })
    return next(e)
  })

  on('prompt.compose', async (_$, e, next) => {
    const r = await next(e)
    return { sections: [...r.sections, { id: 'router:pin', text: LINEA_ROUTER, scope: 'session' }] }
  })

  // La convención de nombres va en la tool Agent: Claude la lee justo cuando escribe la
  // description. Si el hook falla, sale la descripción que calculó el host.
  on('tool.describe', { tool: 'Agent' }, async (_$, e, next) => {
    const r = await next(e)
    return { ...r, description: `${r.description}

${CONVENCION_AGENT}` }
  })
    .catch((_$, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    const lectura = lecturaDe(e.rateLimits)
    if (lectura) {
      await update($, lecturaAtom, () => lectura)
      // En segundo plano y en cola: guardar la ventana nunca frena ni rompe la medición.
      void guardarVentana($, lectura)
    }
    await refrescarLinea($)
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const ahora = await $.clock.now()
    let decision: Decision
    let modo: Subagente['modo']
    try {
      const [overrides, lectura, hot] = await Promise.all([read($, overridesAtom), read($, lecturaAtom), leerHot($)])
      const politica = politicaSegunHot(hot, lectura, ahora, umbrales)
      modo = politica.modo
      const { clasificar, jevDecideReviews } = await armarClasificador($, options, next.signal)
      decision = await decidir(
        { descripcion: e.description, prompt: e.prompt, subagentType: e.subagentType, modeloPedido: e.model, fork: e.fork },
        { overrides, politica, clasificar, jevDecideReviews, tabla },
      )
    } catch (error) {
      // Nunca bloquea: si el router falla, el subagente sale con lo que pidió Claude.
      decision = { tocar: false, motivos: [motivoError(error)] }
    }

    // Se reescribe con el alias ('opus', 'sonnet', 'haiku'): un consumidor interno de Claude Code
    // valida `model` contra los alias; con un id completo logueaba un ZodError. El alias resuelve
    // al modelo vigente.
    const resultado = decision.tocar ? await next({ ...e, model: decision.escalon.modelo }) : await next(e)

    if (resultado.agentId !== undefined) {
      const pedido = e.model ?? 'inherit'
      // Un subagente que el router no tocó ([pin], /router off, un error) igual entra en las
      // métricas, con el tipo de las reglas, como en la línea base. Un build sin talla queda null.
      const porReglas = e.fork ? null : (clasificarPorReglas(e.description, e.subagentType)?.tipo ?? null)
      const sub: Subagente = {
        agentId: resultado.agentId,
        descripcion: e.description,
        tarea: tareaDe(e.description),
        tipo: decision.tocar ? decision.tipo : porReglas === 'build' ? null : porReglas,
        pedido,
        modeloEfectivo: e.model ?? e.parentModel,
        elegido: decision.tocar ? formatEscalon(decision.escalon) : pedido,
        escalon: decision.tocar ? decision.escalon : null,
        motivos: decision.motivos,
        // Sin model el subagente hereda el del padre: se compara contra ese, no contra 'inherit'.
        reasignado: decision.tocar && !(e.model ?? e.parentModel).toLowerCase().includes(decision.escalon.modelo),
        inicio: ahora,
        fin: null,
        ...(modo ? { modo } : {}),
        toolUseId: e.tool_use_id,
      }
      try {
        await update($, subagentesAtom, lista => [...lista, sub].slice(-200))
        await refrescarLinea($)
      } catch {
        // Registrar es secundario: el subagente ya salió.
      }
    }
    return resultado
  })
    // Red de seguridad solo para fallas ANTES de next (un $ que falla, un hook que se pasa de
    // tiempo): ahí el subagente sale con lo que pidió Claude. Si next ya se llamó, next es
    // replay-safe y el .catch repite su resultado o su rechazo; no reintenta con otro modelo.
    .catch(($, e, next) => next(e))

  // Avisos en el resultado de Agent (`context`: lo lee el modelo y el usuario no): avisarAClaude
  // (apagado por defecto) dice que el router reasignó el subagente; ensenarConvencion (prendido
  // por defecto) dice cómo nombrarlo cuando ninguna regla reconoció la description. Con las dos
  // apagadas el hook ni se registra: el camino de Agent queda intacto. El spawn corre dentro de
  // next: al volver, el subagente ya está en el atom, unido por el tool_use_id.
  const avisar = options.avisarAClaude === true
  const ensenar = options.ensenarConvencion !== false
  if (avisar || ensenar) on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined) return r
    try {
      const sub = (await read($, subagentesAtom)).find(s => s.toolUseId === e.tool_use_id)
      if (!sub) return r
      const lineas: string[] = []
      if (avisar && sub.reasignado) lineas.push(avisoReasignado(sub))
      const aviso = ensenar ? avisoConvencion(sub) : null
      if (aviso) lineas.push(aviso)
      return lineas.length ? { ...r, context: [...(r.context ?? []), ...lineas] } : r
    } catch {
      // Avisar es secundario: el resultado sale igual.
      return r
    }
  })
    // Como en agent.spawn: si el hook falla, next es replay-safe y el resultado sale sin aviso.
    .catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) return yield* next(e)
    const subs = await read($, subagentesAtom)
    const escalon = subs.find(s => s.agentId === e.agentId)?.escalon
    // Solo si el paso corre en el modelo elegido (alias o id resuelto): tras un fallback de
    // modelo no se fuerza un esfuerzo pensado para otro.
    const aplica = escalon?.esfuerzo !== undefined && e.model.toLowerCase().includes(escalon.modelo)
    return yield* next(aplica ? { ...e, effort: escalon!.esfuerzo } : e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const ahora = await $.clock.now()
      // El que se marca ahora (y no uno que ya había terminado): ese va al historial.
      let terminado = undefined as Subagente | undefined
      await update($, subagentesAtom, lista => {
        // update puede reintentar el callback: se arranca de cero para no registrarlo dos veces.
        terminado = undefined
        return lista.map(s => (s.agentId === e.agentId && s.fin === null ? (terminado = { ...s, fin: ahora }) : s))
      })
      // Al historial, en segundo plano y en cola: guardarRegistro nunca rechaza ni frena el hook.
      if (terminado) void guardarRegistro($, terminado)
      await refrescarLinea($)
    }
    return next(e)
  })

  on('command.run', { command: 'router' }, async ($, e) => {
    const comando = parsearComando(e.args)
    if (comando.accion === 'panel') {
      await $.ui.open({ id: PANE, title: 'Router' })
      return { text: describirComando(comando) }
    }
    if (comando.accion === 'banco') {
      try {
        return { text: await correrBancoEnSesion($, options, comando) }
      } catch (error) {
        return { text: `Banco: falló (${error instanceof Error ? error.message : String(error)})` }
      }
    }
    if (comando.accion === 'hot') {
      if (comando.valor === null) {
        return {
          text: (await leerHot($))
            ? 'Router: modo hot prendido. Apagalo con /router hot off.'
            : 'Router: modo hot apagado. Prendelo con /router hot on.',
        }
      }
      try {
        await guardarHot($, comando.valor)
      } catch (error) {
        return { text: `Router: no pude guardar el modo hot (${error instanceof Error ? error.message : String(error)})` }
      }
      return { text: describirComando(comando) }
    }
    if (comando.accion === 'historial') {
      try {
        return { text: await exportarHistorial($, comando.dias) }
      } catch (error) {
        return { text: `Router: no pude exportar el historial (${error instanceof Error ? error.message : String(error)})` }
      }
    }
    if (comando.accion !== 'error') {
      await update($, overridesAtom, o => aplicarComando(o, comando))
      await refrescarLinea($)
    }
    return { text: describirComando(comando) }
  })

  // El panel: este hook lee los atoms y src/ui/panel.tsx arma el árbol sin tocar $.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [pestana, subs, overrides, lectura, ahora, muestras, guardado, vistas, sesion, hot] = await Promise.all([
      read($, pestanaAtom), read($, subagentesAtom), read($, overridesAtom), read($, lecturaAtom), $.clock.now(),
      // Sin store (o si falla), el panel sale igual: sin la sección de sombra y con "—" en la
      // columna de 7 días y en la ventana sin usar.
      $.store.get('sombra').catch(() => undefined),
      leerHistoriales($).catch(() => [] as HistorialSesion[]),
      $.store.get('ventanas').catch(() => undefined),
      $.session.id().catch(() => null),
      leerHot($),
    ])
    const historial = guardado.flatMap(s => s.registros ?? [])
    const ventanas = ventanasDe(vistas)
    const SEMANA = 7 * 86_400_000
    const decisiones = ultimasDecisiones(subs, sesion, historial)
    return vistaPanel($.ui.resolve(e), {
      pestana,
      subs,
      overrides,
      politica: politicaSegunHot(hot, lectura, ahora, umbrales),
      ahora,
      bodyColumns: e.props.bodyColumns,
      sombra: estadisticasSombra(muestrasDe(muestras)),
      semana: metricasHistorial(ultimosDias(historial, ahora, 7)),
      ventanas7: resumenVentanas(ventanas, ahora - SEMANA, ahora),
      ventanasAntes: resumenVentanas(ventanas, ahora - 2 * SEMANA, ahora - SEMANA),
      decisiones: decisiones.slice(0, DECISIONES_EN_PANEL),
      // Por el momento de la decisión (el spawn), así cuentan también las que siguen corriendo.
      resumen7: resumenDecisiones(decisiones.filter(f => f.inicio > ahora - SEMANA && f.inicio <= ahora)),
      alElegirPestana: p => update($, pestanaAtom, () => p),
    })
  })
}
