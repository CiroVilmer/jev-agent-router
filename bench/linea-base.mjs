// Calcula la línea base del router desde los transcripts de Claude Code y escribe
// router/src/lineaBase.ts. Mismos archivos que bench/extraer.mjs y criterios de metricasDe.
//   node bench/linea-base.mjs [--proyectos C:/Users/.../.claude/projects]
// El corte es un instante fijo, 2026-10-05 23:59:59.999 en UTC-3: la base es lo de antes del
// router. Los timestamps de los transcripts vienen en UTC y se comparan como instantes.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { clasificarPorReglas } from '../router/src/reglas.ts'
import { mediana, tareaDe } from '../router/src/registro.ts'

const HASTA = '2026-10-05'
const CORTE = Date.parse('2026-10-05T23:59:59.999-03:00')
const UTC_3 = -3 * 3_600_000
const REVISIONES = ['review', 'review-final', 're-review']
const i = process.argv.indexOf('--proyectos')
const base = i > 0 ? process.argv[i + 1] : path.join(os.homedir(), '.claude', 'projects')

/** Día AAAA-MM-DD en UTC-3, sin depender de la zona de la máquina. */
const diaUtc3 = ms => new Date(ms + UTC_3).toISOString().slice(0, 10)

/** Texto de un mensaje user: string o bloques text. */
const textoDe = contenido =>
  typeof contenido === 'string' ? contenido
    : Array.isArray(contenido) ? contenido.map(c => (c?.type === 'text' ? c.text : '')).join('\n') : ''

const vistos = new Set()
const llamadas = [] // { id, sesion, inicio, tipo, enOpus, tarea }
const finDe = new Map() // tool-use id → timestamp de la última task-notification
let posterioresAlCorte = 0
const ilegibles = []
for (const dir of fs.readdirSync(base)) {
  if (dir.includes('scratch-workspaces')) continue
  const carpeta = path.join(base, dir)
  let archivos
  try {
    if (!fs.statSync(carpeta).isDirectory()) continue
    archivos = fs.readdirSync(carpeta).filter(f => f.endsWith('.jsonl'))
  } catch (e) { ilegibles.push(`${dir}: ${e.code ?? e.message}`); continue }
  for (const archivo of archivos) {
    const sesion = `${dir}/${archivo}`
    try {
      const rl = readline.createInterface({ input: fs.createReadStream(path.join(carpeta, archivo)), crlfDelay: Infinity })
      for await (const linea of rl) {
        let o
        try { o = JSON.parse(linea) } catch { continue }
        const ts = Date.parse(o.timestamp)
        if (!Number.isFinite(ts)) continue
        if (o.type === 'user') {
          // Todos los spawns son async: el fin llega como <task-notification> con el tool-use id.
          const texto = textoDe(o.message?.content)
          if (!texto.includes('<task-notification>')) continue
          for (const m of texto.matchAll(/<tool-use-id>([^<]+)<\/tool-use-id>/g)) finDe.set(m[1], Math.max(finDe.get(m[1]) ?? 0, ts))
          continue
        }
        if (o.type !== 'assistant') continue
        for (const c of o.message?.content ?? []) {
          if (c?.type !== 'tool_use' || (c.name !== 'Agent' && c.name !== 'Task')) continue
          const x = c.input ?? {}
          if (typeof x.description !== 'string' || !x.description) continue
          const subagentType = x.subagent_type ?? 'general-purpose'
          if (subagentType === 'fork') continue
          // Una sesión reanudada copia mensajes viejos: el id del tool_use evita contarlos dos veces.
          const clave = c.id ?? `${sesion}\u0000${o.timestamp}\u0000${x.description}`
          if (vistos.has(clave)) continue
          vistos.add(clave)
          if (ts > CORTE) { posterioresAlCorte++; continue }
          const tipo = clasificarPorReglas(x.description, subagentType)?.tipo ?? null
          // Modelo efectivo: el pedido; si hereda, opus por subagent_type o el modelo del padre.
          const modelo = typeof x.model === 'string' && x.model && x.model !== 'inherit' ? x.model
            : /opus/i.test(subagentType) ? 'opus' : String(o.message?.model ?? '')
          llamadas.push({ id: c.id, sesion, inicio: ts, tipo, enOpus: /opus/i.test(modelo), tarea: tareaDe(x.description) })
        }
      }
    } catch (e) { ilegibles.push(`${sesion}: ${e.code ?? e.message}`) }
  }
}

const promedio = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

// reviewsEnOpus: sobre review, review-final y re-review, la proporción que corrió en Opus.
const revisiones = llamadas.filter(l => REVISIONES.includes(l.tipo))
const reviewsEnOpus = revisiones.length ? revisiones.filter(l => l.enOpus).length / revisiones.length : null

// Tareas: (archivo de sesión, tareaDe(descripcion)).
const tareas = new Map()
for (const l of llamadas) {
  if (!l.tarea) continue
  const k = `${l.sesion}\u0000${l.tarea}`
  if (!tareas.has(k)) tareas.set(k, [])
  tareas.get(k).push(l)
}

// rondasPorTarea: re-review por tarea, sobre las tareas con al menos un review.
const revisadas = [...tareas.values()].filter(t => t.some(l => l.tipo === 'review'))
const rondasPorTarea = promedio(revisadas.map(t => t.filter(l => l.tipo === 're-review').length))

// minutosPorTarea: primer spawn → última task-notification de sus llamadas. Mediana. Como en vivo
// (una tarea está terminada cuando ningún subagente sigue corriendo), si a alguna llamada le falta
// la notificación el fin real no se ve y la tarea queda afuera.
const minutos = []
let sinFin = 0
for (const t of tareas.values()) {
  const fines = t.map(l => finDe.get(l.id)).filter(f => f !== undefined)
  if (fines.length < t.length) { sinFin++; continue }
  minutos.push(Math.round((Math.max(...fines) - Math.min(...t.map(l => l.inicio))) / 60_000))
}
const minutosPorTarea = mediana(minutos)

const redondear = (x, d) => (x === null ? null : Number(x.toFixed(d)))
const valores = {
  desde: llamadas.length ? diaUtc3(Math.min(...llamadas.map(l => l.inicio))) : null,
  hasta: HASTA,
  subagentes: llamadas.length,
  reviewsEnOpus: redondear(reviewsEnOpus, 2),
  rondasPorTarea: redondear(rondasPorTarea, 2),
  minutosPorTarea: redondear(minutosPorTarea, 0),
}

console.log(`corte: ${new Date(CORTE).toISOString()} (2026-10-05 23:59:59.999 UTC-3)`)
console.log(`${llamadas.length} subagentes del ${valores.desde} al ${HASTA} · ${posterioresAlCorte} quedaron afuera por el corte`)
console.log(`archivos ilegibles: ${ilegibles.length}${ilegibles.length ? ` (${ilegibles.join('; ')})` : ''}`)
console.log(`reviewsEnOpus ${valores.reviewsEnOpus} (${revisiones.filter(l => l.enOpus).length} de ${revisiones.length} revisiones)`)
console.log(`rondasPorTarea ${valores.rondasPorTarea} (${revisadas.length} tareas con review)`)
console.log(`minutosPorTarea ${valores.minutosPorTarea} = mediana · n ${minutos.length} · promedio ${redondear(promedio(minutos), 1)} · ${sinFin} tareas con algún subagente sin notificación quedaron afuera`)

const nulos = Object.entries(valores).filter(([, v]) => v === null).map(([k]) => k)
if (nulos.length) {
  console.error(`no escribo router/src/lineaBase.ts: ${nulos.join(', ')} ${nulos.length === 1 ? 'dio' : 'dieron'} null (sin datos suficientes antes del corte)`)
  process.exit(1)
}

const ts = `// Generado por bench/linea-base.mjs el ${diaUtc3(Date.now())}. No editar a mano.
// Es una foto congelada: Claude Code borra los transcripts a los ~30 días, así que regenerarlo
// más adelante cambia la base. Regeneralo solo a propósito.
// Base: los Agent/Task de ~/.claude/projects/*/*.jsonl (sin scratch-workspaces) hasta el
// ${HASTA} 23:59:59.999 UTC-3, el día antes de que existiera el router.
// - reviewsEnOpus: de los review, review-final y re-review (por clasificarPorReglas), la
//   proporción que corrió en Opus: el model pedido; si hereda, opus si el subagent_type lo dice
//   y si no el modelo del mensaje que lo lanzó. Da 0.23 y no el 0.17 de la constante vieja
//   porque ahora el modelo heredado se resuelve al del padre (antes 'inherit' contaba como
//   no Opus).
// - rondasPorTarea: re-review por tarea (archivo de sesión + tareaDe), sobre las tareas con review.
// - minutosPorTarea: mediana, en minutos, desde el primer spawn de la tarea hasta la última
//   task-notification de sus subagentes (se cruzan por tool-use id). Es el mismo tramo que mide
//   metricasDe en vivo. Si a algún subagente de la tarea le falta la notificación, la tarea queda
//   afuera porque su fin real no se ve.
export const LINEA_BASE = {
  desde: '${valores.desde}',
  hasta: '${valores.hasta}',
  subagentes: ${valores.subagentes},
  reviewsEnOpus: ${valores.reviewsEnOpus},
  rondasPorTarea: ${valores.rondasPorTarea},
  minutosPorTarea: ${valores.minutosPorTarea},
} as const
`
fs.writeFileSync(new URL('../router/src/lineaBase.ts', import.meta.url), ts)
console.log('escrito router/src/lineaBase.ts')
