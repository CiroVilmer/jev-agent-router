# Router de subagentes · selector self-hosted y benchmark de selectores

Extiende el [diseño de la fase 7](2026-10-14-router-fase-7-design.md). Lo que no se nombra acá no
cambia: reglas, tallas, matriz, política y Jev en producción siguen igual.

## Por qué

- **Selector self-hosted.** Hoy el clasificador es `reglas`, `haiku` o `jev`. El usuario quiere poder
  usar un modelo propio (local o en un servidor suyo) con la misma interfaz. Desde septiembre de 2026,
  llama.cpp (PR #29818, mergeado el 2026-10-02) y Ollama (v0.35.0) sirven en local la misma API
  `/v1/systemone` que Jev, con "decision models" de pesos abiertos. La vía principal es esa; el plan B
  es un LLM chico por la API OpenAI-compatible, con la confianza sacada de los logprobs.
- **Experimental.** La PC del usuario (Ryzen 7 PRO 7735U, 16 GB, sin GPU dedicada) no es la máquina
  para medirlo. El selector se diseña, se implementa y se prueba con servidores falsos; se mide
  después en otra máquina. Hasta entonces su umbral no está calibrado y lo dice en todos lados.
- **Benchmark de selectores.** Comparar con honestidad reglas, Haiku 5.5, Jev y el self-hosted:
  acierto, latencia p50/p95 y precio, sobre el banco de 729 casos, la talla de los builds y la talla
  de las reviews. Haiku no se midió desde Haiku 4.5.

## 1. El clasificador `local`

### Interfaz

La misma de siempre: `Clasificador = (p: { descripcion, resumen, etiquetas }) => Promise<Clasificacion>`.
`Clasificacion.fuente` suma `'local'`. Recibe la description y el resumen numérico, nunca el prompt.

### Dos protocolos

`localProtocolo` elige cómo se le habla al servidor:

**`systemone` (por defecto).** El mismo pedido y la misma lectura que Jev, con URL y modelo de
`/config`:

- `POST <localUrl>` con `{ model: <localModelo>, state: { tarea }, questions: { tipo: preguntaJev(etiquetas) } }`.
- Lee `answers.tipo.choice` y la confianza de `confidence` o, si falta, de `probabilities[choice]`.
- `localUrl` es la URL completa del endpoint (por ejemplo `http://127.0.0.1:9931/v1/systemone`).

**`openai` (plan B).** `POST <localUrl>` a un `/v1/chat/completions` OpenAI-compatible
(llama.cpp `llama-server`, Ollama, LM Studio, vLLM):

- Un solo mensaje de usuario: el texto de `textoParaHaiku` (las mismas descripciones y guía que Haiku)
  más una clave de letras: cada etiqueta ofrecida recibe una letra, en orden (`A = review-final`,
  `B = review`, …), y se pide responder solo la letra.
- Salida forzada: `response_format: { type: 'json_schema', json_schema: { name: 'tipo', strict: true,
  schema: { type: 'object', properties: { r: { type: 'string', enum: [letras] } }, required: ['r'],
  additionalProperties: false } } }`.
- `logprobs: true`, `top_logprobs: 20`, `temperature: 0`, `max_tokens: 16`,
  `chat_template_kwargs: { enable_thinking: false }` (los servidores que no lo conocen lo ignoran).
- **Elección:** la letra de `choices[0].message.content` (JSON `{ "r": "C" }`), mapeada a su etiqueta.
  Una letra fuera de la clave es un error.
- **Confianza:** en `choices[0].logprobs.content`, la primera posición cuyo token, sin comillas ni
  espacios, es una de las letras. De sus `top_logprobs` se toman las letras de la clave (normalizadas
  igual), se pasa a probabilidad y se renormaliza sobre las letras encontradas. La confianza es la
  probabilidad de la letra elegida. Si el servidor no devolvió logprobs o no aparece la posición, la
  confianza es 0: la etiqueta vale, pero en la talla decide el respaldo.

### Cómo se comporta

Igual que Jev, en todo:

- Decide la talla de los builds y de las reviews con su umbral `localUmbral`: con menos confianza
  decide el respaldo.
- Sin regla, decide aunque dude, y el motivo lo marca: `local (sin umbral) → review (0.55)`.
- Con `clasificador: local` y configuración completa, también decide las reviews por description
  (con confianza ≥ `localUmbral`; si duda, falla o elige explore o write, queda la regla). En el
  código, `jevDecideReviews` pasa a llamarse `decideReviews`.
- El tope `topeMs` lo corta igual que a Jev y Haiku. **Nunca bloquea.**
- Sin `localUrl` o sin `localModelo`: avisa una vez por carga (`Router: falta la URL o el modelo del
  clasificador local; uso el respaldo`) y decide el respaldo, sin modelo. No cae a Haiku.
- Modo sombra: `sombra: local` corre el local en segundo plano (umbral 0), como hoy `jev` o `haiku`.

### Código

- **`router/src/clasificadores/protocolos.ts` (nuevo).** Armado de pedidos y lectura de respuestas de
  los dos protocolos: `pedidoSystemOne`, `leerSystemOne`, `letrasDe`, `textoOpenAI`, `pedidoOpenAI`,
  `leerOpenAI`. **Sin imports de valor** (como `preguntas.ts`): lo importa el banco desde Node. Recibe
  la pregunta o el texto ya armados por parámetro.
- **`router/src/clasificadores/systemone.ts` (nuevo).** `crearSystemOne({ post, ahora, modelo, umbral,
  fuente })`, el clasificador con umbral, que hoy vive en `crearJev`.
- **`jev.ts`** queda como envoltorio de `crearSystemOne` con `JEV_URL` y `JEV_MODELO` fijos. Por fuera
  no cambia: `crearJev(post, ahora, umbral)`, `pedidoJev`, `leerJev` siguen exportados (los tests
  actuales pasan sin tocarlos).
- **`router/src/clasificadores/openai.ts` (nuevo).** `crearOpenAI({ post, ahora, modelo, umbral })`.
- **`register.tsx`:** `keyLocal` (de `localApiKey` o `LOCAL_API_KEY`), `postLocal` (como `postJev`:
  header `Authorization: Bearer` solo si hay key, y la key tapada en los errores), `armarLocal($,
  options, umbral)` y el valor `local` en `armarClasificador` y en la sombra.
- **`index.ts`:** `LOCAL_UMBRAL` y `limitesDe` devuelve también `localUmbral` (acotado a [0, 1]).

## 2. `/config` (`plugin.json`)

| Opción | Tipo | Por defecto | Descripción (en castellano, como las demás) |
| --- | --- | --- | --- |
| `clasificador` | suma `local` | `reglas` | … `local` (experimental): un modelo propio por System One u OpenAI |
| `sombra` | suma `local` | `off` | |
| `localProtocolo` | `systemone` \| `openai` | `systemone` | Experimental. Cómo hablarle al servidor |
| `localUrl` | string | — | Experimental. URL completa del endpoint |
| `localModelo` | string | — | Experimental. Nombre del modelo en el servidor |
| `localApiKey` | string, sensible | — | Experimental. Opcional; si falta, `LOCAL_API_KEY` |
| `localUmbral` | number | 0.7 | Experimental, sin calibrar: elegilo con `bench/informe.mjs` |

## 3. El banco unificado

### Suites

Los mismos casos para cada selector:

| Suite | Casos | Etiquetas | Fuente de la referencia |
| --- | --- | --- | --- |
| `tipos` | los 729 de `casos.json` | las 9 | `etiquetas.json` |
| `talla` | los de regla `build` | `build-large`, `build-small` | `etiquetas.json` |
| `review` | las 225 de `etiquetas-review.json` | `review-large`, `review-small` | `etiquetas-review.json` |

En `review` se le pregunta al selector por las 225, para medir el selector solo; la política completa
(§4) usa su respuesta solo en las que le llegan.

### Formato de corrida

`bench/corridas/<AAAA-MM-DD>-<HHMM>-sel-<selector>-<suite>.json`:

```json
{
  "fecha": "<ISO UTC>", "selector": "haiku|jev|local", "suite": "tipos|talla|review",
  "modelo": "…", "protocolo": "systemone|openai|null", "url": "…|null", "hardware": "…|null",
  "concurrencia": 1,
  "tokens": { "muestra": 20, "entrada": 512.3, "salida": 140.8 },
  "resultados": [{ "id": "c0001", "tipo": "research", "confianza": 0.93, "ms": 241, "error": null }]
}
```

`tokens` solo en Haiku (§5); `hardware`, texto libre que se pasa por flag (`--hardware`), para el
local. La URL se guarda sin credenciales.

### Quién corre cada selector

- **Node: `bench/selectores.mjs`.**
  `node bench/selectores.mjs --selector jev|local --suite tipos|talla|review|todas [--protocolo systemone|openai] [--url U] [--modelo M] [--hardware H] [--max N] [--concurrencia N]`.
  - Arma los pedidos con `protocolos.ts` y `preguntas.ts`, igual que producción.
  - Keys: `JEV_API_KEY`, `LOCAL_API_KEY` (opcional). Nunca se imprimen.
  - Límite de 60 s por llamada; guarda cada 50 resultados y al final.
  - Reemplaza a `jev-todos.mjs`, que se borra (sus corridas viejas quedan en `corridas/`).
- **Claude Code: `/router bench`.**
  `/router bench [--suite tipos|talla|review|todas] [--solo haiku|jev|local] [--max N] [--concurrencia N] [--tokens N]`.
  - Sin `--suite`, hace lo de hoy (los casos de producción, formato viejo), para no romper
    `comparar.mjs`.
  - Con `--suite`, escribe el formato nuevo, un archivo por selector y suite. Es la única forma de
    medir Haiku.
  - `--tokens N` (solo Haiku): además corre N casos de la suite con `$.model.complete({ model: 'haiku',
    prompt })`, con el mismo texto que recibe `classify`, y guarda la media de tokens de entrada y de
    salida (thinking incluido) de `usage`. Es aproximado: `classify` agrega un prompt fijo propio que
    no vemos. Por defecto, 20.
- **Concurrencia 1 por defecto** en los dos, para que la latencia se parezca a producción (un spawn,
  una llamada). Hoy `/router bench` usa 3.
- **Reglas:** no hace llamadas; su fila sale del respaldo en el informe.

## 4. El informe: `bench/informe.mjs`

`node bench/informe.mjs [--tope 1000] [corridas…]`. Sin archivos, toma la corrida `sel-` más nueva de
cada selector y suite. Escribe `bench/corridas/<AAAA-MM-DD>-<HHMM>-informe-selectores.md` y lo imprime.

**Por suite**, una fila por selector (reglas, haiku, jev, y cada local medido, nombrado por modelo y
protocolo):

| Columna | Qué es |
| --- | --- |
| n | casos con respuesta o error |
| acierta | elección = referencia, sobre los que respondieron |
| seguros | lo mismo, solo etiquetas con `seguro: true` |
| con umbral | aplicando el umbral del selector como producción: en las suites de talla, con menos confianza decide el respaldo |
| con tope | además, si tardó más que `--tope` o falló, decide el respaldo (lo que pasaría en producción) |
| p50 / p95 / máx | ms de las llamadas que respondieron |
| > tope | % de llamadas más lentas que el tope |
| errores | llamadas fallidas |
| USD / 1.000 | §5 |

Reglas usa el respaldo en todas las columnas y latencia 0.

**Calibración**, por selector con confianza (jev, local): acierto por tramo de confianza (0–0.5,
0.5–0.7, 0.7–0.9, 0.9–1) en `tipos` y en `talla`. Es la tabla para elegir `localUmbral`.

**Política completa simulada**, por selector usado como `clasificador`:

- **Tipos (729):** la política de la fase 6 con ese selector: regla si la hay; reviews por description
  decididas por el selector si es `jev` o `local` (umbral, explore/write no); talla de build con umbral
  y respaldo; sin regla, el selector sin umbral (o `build-small` con reglas). Es la cifra comparable
  con el 90,5% de hoy.
- **Talla de review (225):** la política de `tallaDeReview` (rango → build de la misma tarea →
  palabras de alcance sin tarea numerada → selector con umbral, respaldo `review-small`). Comparable
  con el 96,0% de hoy.

Las dos simulaciones hoy están en `analizar-jev-todos.mjs` (`fase6`) y `review-talla.mjs`
(`politica`). Se extraen a **`bench/lib/politica.mjs`** y esos scripts pasan a importarla: una sola
copia. Los regex de alcance siguen copiados de `tallaReview.ts`, con el aviso de divergencia.

**Advertencias que el informe imprime siempre:** las 96 etiquetas dudosas y las 33 de talla de review
sin validar; que las 192 reviews con build aciertan por construcción; que el local es experimental y
dónde se midió.

## 5. Precios

`bench/precios.json`, con fuente y fecha de cada número:

| Selector | Cálculo | Fuente |
| --- | --- | --- |
| reglas | $0 | — |
| haiku | (entrada × $0,10 + salida × $0,50) / 1e6, por llamada, con los tokens de `--tokens` | Precio de lista de Claude Haiku 5.5 (Anthropic, cacheado 2026-10-06). El thinking se cobra como salida. Con Claude Max no se paga por llamada: consume cuota |
| jev | tokens de entrada estimados (caracteres del pedido / 4) × $42 / 1e9 | typesafe.ai, consultado 2026-10-15. No publica precio de salida: la columna lo aclara |
| local | $0 marginal | Nota con el hardware de la corrida |

Si falta un dato, la celda dice `sin dato`; nunca se inventa. Las cifras estimadas llevan `≈`.

## 6. Tests

En `router/tests/` (con `claude plugin test router`):

- `protocolos`: pedido System One y OpenAI (forma exacta), clave de letras, lectura con y sin
  `confidence`, letra fuera de la clave, JSON roto, logprobs ausentes (confianza 0), tokens con
  comillas y espacios, renormalización.
- `systemone` / `openai`: umbral en la talla (lanza `dudó`), sin umbral fuera de la talla, HTTP no ok.
- `jev`: los tests de hoy, sin cambios.
- `register`: `local` sin URL o sin modelo → respaldo y un aviso; con key, el header; sin key, sin
  header; la key nunca en el `detalle`; `sombra: local`; `decideReviews` con `local`; un servidor
  colgado lo corta el tope.
- `overrides`: `/router bench --suite …`, `--solo local`, `--concurrencia`, `--tokens`, errores de uso.
- `banco`: correr una suite con clasificadores falsos y el formato de corrida.

En `bench/`, los scripts de Node se prueban a mano contra un servidor falso local
(`bench/lib/servidor-falso.mjs`, que responde System One y OpenAI con logprobs): no entran en el kit.

## 7. Docs

- `docs/benchmark.md` (inglés): la sección de selectores y la tabla del informe.
- `docs/configuration.md` y `router/README.md`: el clasificador `local` como experimental, cómo
  levantar llama.cpp u Ollama y qué URL poner.
- `bench/README.md` (castellano): `selectores.mjs`, `informe.mjs`, las suites y `/router bench --suite`.
- `CHANGELOG.md`, *Unreleased*.

## Fuera de alcance

- Instalar servidores o descargar modelos en esta PC.
- Entrenar un encoder o un clasificador propio con el banco.
- Cambiar el comportamiento de Jev, Haiku o las reglas.
- Calibrar `localUmbral`: se hace al medir en la otra máquina, con la tabla de calibración.
- Streaming, reintentos y un pool de conexiones.

## Riesgos

- **`$.http.fetch` a `http://localhost`:** los tipos dicen que acepta http a cualquier host que la
  máquina alcance, salvo una política de la organización. Se verifica en vivo con el servidor falso
  antes de cerrar.
- **Contrato de System One:** Ollama tiene un issue abierto (#18718) con `criteria` de tipo objeto.
  Nosotros mandamos strings.
- **Caché de prefijo:** en modelos híbridos o SWA el prefijo fijo puede no reutilizarse; impacta la
  latencia, no el diseño. Se mide en la otra máquina.
- **Haiku en el banco:** `--tokens` es una aproximación; y una corrida de Haiku sobre ~1.150 casos
  consume cuota de Max (unos 20 minutos con concurrencia 1).
