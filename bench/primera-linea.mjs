// Mide si las reglas aplicadas a la primera línea del prompt aciertan en los casos del banco sin
// regla de description. No guarda nada del prompt: imprime conteos y las descriptions que fallan.
//   node bench/primera-linea.mjs [--proyectos C:/Users/.../.claude/projects]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { clasificarPorReglas } from '../router/src/reglas.ts'

const TALLAS = ['build-large', 'build-small']
const i = process.argv.indexOf('--proyectos')
const base = i > 0 ? process.argv[i + 1] : path.join(os.homedir(), '.claude', 'projects')
const { casos } = JSON.parse(fs.readFileSync(new URL('./casos.json', import.meta.url), 'utf8'))
const etiquetas = JSON.parse(fs.readFileSync(new URL('./etiquetas.json', import.meta.url), 'utf8'))
const sinRegla = new Map(casos.filter(c => c.regla === null).map(c => [`${c.descripcion}\u0000${c.resumen.chars}`, c]))

const vistos = new Set()
let encontrados = 0, disparan = 0, aciertan = 0
const fallan = []
for (const dir of fs.readdirSync(base)) {
  if (dir.includes('scratch-workspaces')) continue
  const carpeta = path.join(base, dir)
  if (!fs.statSync(carpeta).isDirectory()) continue
  for (const archivo of fs.readdirSync(carpeta).filter(f => f.endsWith('.jsonl'))) {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(carpeta, archivo)), crlfDelay: Infinity })
    for await (const linea of rl) {
      let o
      try { o = JSON.parse(linea) } catch { continue }
      if (o.type !== 'assistant') continue
      for (const c of o.message?.content ?? []) {
        if (c?.type !== 'tool_use' || (c.name !== 'Agent' && c.name !== 'Task')) continue
        const x = c.input ?? {}
        if (!x.description || typeof x.prompt !== 'string') continue
        const clave = `${x.description}\u0000${x.prompt.length}`
        const caso = sinRegla.get(clave)
        if (!caso || vistos.has(clave)) continue
        vistos.add(clave)
        encontrados++
        const primera = (x.prompt.split('\n').map(l => l.trim()).find(Boolean) ?? '').slice(0, 200)
        const r = clasificarPorReglas(primera, '')
        if (!r) continue
        disparan++
        const ref = etiquetas[caso.id]?.tipo
        const ok = r.tipo === 'build' ? TALLAS.includes(ref) : r.tipo === ref
        if (ok) aciertan++
        else fallan.push(`${caso.id} "${caso.descripcion}" → ${r.tipo} (ref ${ref})`)
      }
    }
  }
}
console.log(`casos sin regla en el banco: ${sinRegla.size} · encontrados en transcripts: ${encontrados}`)
console.log(`la primera línea dispara una regla en ${disparan} · aciertan ${aciertan}` +
  (disparan ? ` (${(100 * aciertan / disparan).toFixed(1)}%)` : ''))
if (fallan.length) console.log('fallan:\n' + fallan.join('\n'))
