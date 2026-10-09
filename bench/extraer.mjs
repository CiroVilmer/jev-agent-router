// Extrae los subagentes reales de los transcripts de Claude Code a bench/casos.json.
// Guarda la descripción y el RESUMEN del prompt (largo, archivos, pasos, spec), nunca el prompt.
//   node bench/extraer.mjs [--proyectos C:/Users/.../.claude/projects]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { clasificarPorReglas } from '../router/src/reglas.ts'
import { resumir, textoResumen } from '../router/src/resumen.ts'

const TIPOS = ['review-final', 'review', 're-review', 'build-large', 'build-small', 'fix', 'explore', 'research', 'write']
const TALLAS = ['build-large', 'build-small']
const i = process.argv.indexOf('--proyectos')
const base = i > 0 ? process.argv[i + 1] : path.join(os.homedir(), '.claude', 'projects')

const vistos = new Map()
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
        if (vistos.has(clave)) continue
        const subagentType = x.subagent_type ?? 'general-purpose'
        if (subagentType === 'fork') continue
        const resumen = resumir(x.prompt)
        const regla = clasificarPorReglas(x.description, subagentType)?.tipo ?? null
        vistos.set(clave, {
          id: `c${String(vistos.size + 1).padStart(4, '0')}`,
          descripcion: x.description,
          subagentType,
          pedido: x.model ?? 'inherit',
          proyecto: dir.replace(/^C--Users-[^-]+-Documents-GitHub-/, ''),
          resumen,
          tarea: textoResumen(x.description, resumen),
          regla,
          etiquetasProduccion: regla === 'build' ? TALLAS : regla === null ? TIPOS : null,
        })
      }
    }
  }
}
const casos = [...vistos.values()]
fs.writeFileSync(new URL('./casos.json', import.meta.url), JSON.stringify({ generado: new Date().toISOString(), casos }, null, 1) + '\n')
const porRegla = Object.groupBy(casos, c => c.regla ?? 'ninguna')
console.log(`${casos.length} casos · ` + Object.entries(porRegla).map(([k, v]) => `${k} ${v.length}`).join(' · '))
console.log(`le llegan al clasificador: ${casos.filter(c => c.etiquetasProduccion).length}`)
