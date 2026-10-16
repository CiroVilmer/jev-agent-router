// bench/lib/servidor-falso.mjs
// Un servidor de prueba que habla System One y OpenAI, para probar el clasificador local y el banco
// sin un modelo de verdad. Siempre elige la primera opción.
//   node bench/lib/servidor-falso.mjs [--puerto 9931] [--logprobs no] [--demora MS]
import http from 'node:http'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const puerto = Number(arg('--puerto', '9931'))
const conLogprobs = arg('--logprobs', 'si') !== 'no'
const demora = Number(arg('--demora', '0'))

const responder = (res, cuerpo) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(cuerpo)) }

http.createServer((req, res) => {
  let datos = ''
  req.on('data', d => (datos += d))
  req.on('end', () => setTimeout(() => {
    let pedido
    try { pedido = JSON.parse(datos) } catch { res.writeHead(400); return res.end('json roto') }
    if (req.url === '/v1/systemone') {
      const opciones = Object.keys(pedido.questions?.tipo?.criteria ?? {})
      const probabilities = Object.fromEntries(opciones.map((o, i) => [o, i === 0 ? 0.8 : 0.2 / Math.max(1, opciones.length - 1)]))
      return responder(res, { model: pedido.model, answers: { tipo: { type: 'choice', choice: opciones[0], confidence: 0.8, probabilities } } })
    }
    if (req.url === '/v1/chat/completions') {
      const logprobs = conLogprobs ? { content: [{ token: 'A', logprob: Math.log(0.8), top_logprobs: [{ token: 'A', logprob: Math.log(0.8) }, { token: 'B', logprob: Math.log(0.2) }] }] } : null
      return responder(res, { model: pedido.model, choices: [{ message: { role: 'assistant', content: '{"r":"A"}' }, logprobs }] })
    }
    res.writeHead(404); res.end()
  }, demora))
}).listen(puerto, '127.0.0.1', () => console.log(`escuchando en http://127.0.0.1:${puerto}`))
