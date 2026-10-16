# Banco del clasificador

Mide qué tan bien eligen el tipo de cada subagente los clasificadores del router (Haiku y
Jev) contra una referencia etiquetada a mano, y cuánto tardan. Sirve para decidir
`clasificador` y `jevUmbral` en `/config` con números y no a ojo.

## Los tres pasos

1. **Extraer los casos.** Lee los transcripts de Claude Code y guarda, por cada subagente, la
   descripción y el resumen del prompt (largo, archivos nombrados, pasos, si menciona un spec);
   nunca el prompt.

   ```
   node bench/extraer.mjs
   ```

   Escribe `bench/casos.json`. Cada caso trae la `regla` que lo resolvería sin modelo y las
   `etiquetasProduccion` que se le ofrecerían a un clasificador (`null` si la regla lo
   resuelve sola y ningún clasificador lo ve).

2. **Etiquetar y revisar.** `bench/etiquetas.json` tiene el tipo de referencia de cada caso
   (`{ id: { tipo, seguro, nota? } }`). Los que quedaron con `seguro: false` están en
   `bench/para-revisar.md`: corregí el `tipo` en `etiquetas.json` y pasá `seguro` a `true`.

3. **Correr el banco y comparar.** En Claude Code, con el mod cargado y parado en la raíz del
   repo:

   ```
   /router bench [--max N] [--solo haiku|jev] [--concurrencia N]
   ```

   Corre Haiku y Jev sobre los casos de producción por el mismo camino que usa el router, pero
   sin el tope de producción, sin sombra y con umbral 0 (Jev nunca se descarta por duda: su
   confianza queda guardada). Una llamada que no responde en 60 s queda como error
   (`tardó más de 60 s`) y el banco sigue. Escribe `bench/corridas/<AAAA-MM-DD>-<HHMM>-banco.json`
   (fecha y hora locales, así una prueba con `--max` no pisa una corrida entera) cada 25
   resultados y al final. `--max N` corre solo los primeros N casos; `--solo` corre uno de los
   dos. Sin key de Jev (`/config` o `JEV_API_KEY`) corre solo Haiku y lo dice.

   Sin `--suite`, el banco hace **1 llamada a la vez** (antes eran 3; se cambia con `--concurrencia N`).
   Con más concurrencia el p50 y el p95 se inflan frente a producción, donde cada spawn hace una
   sola llamada: tomá esa latencia como una cota pesimista. Para comparar selectores con las
   suites mirá la sección de `/router bench --suite`, más abajo. Después:

   ```
   node bench/comparar.mjs [bench/corridas/<archivo>-banco.json] [--tope <ms>]
   ```

   Sin archivo toma la corrida más nueva. `--tope` es el `topeMs` que se simula en las columnas
   *con tope* (1000 por defecto, el de producción). Imprime la comparación y la guarda al lado,
   en `<archivo>-comparacion.md`.

   **Ojo:** volver a correr `comparar.mjs` reescribe el `-comparacion.md` de esa corrida con el
   respaldo vigente, y las corridas viejas dejan de mostrar lo que midieron en su momento. Conviene
   hacerlo sobre una corrida nueva.

## La línea base (`linea-base.mjs`)

La columna **base** de la pestaña de métricas del router sale de acá:

```
node bench/linea-base.mjs [--proyectos C:/Users/.../.claude/projects]
```

Lee los mismos transcripts que `extraer.mjs` (los Agent/Task de `~/.claude/projects/*/*.jsonl`,
sin scratch-workspaces) hasta el 2026-10-05 23:59:59.999 UTC-3, el día antes de que existiera el
router, y calcula `reviewsEnOpus`, `rondasPorTarea` y `minutosPorTarea` (mediana) con los mismos
criterios que `metricasDe` en vivo. Escribe `router/src/lineaBase.ts`, con el detalle de cada
número en el encabezado, e imprime los conteos (subagentes, revisiones, tareas sin fin visible).
Si algún número da `null`, no escribe nada.

Es una foto congelada: Claude Code poda los transcripts a los ~30 días, así que correrlo más
adelante da otra base. Regenerala solo a propósito y revisá el diff de `lineaBase.ts`.

## Jev sobre todos los casos (corridas viejas)

`bench/jev-todos.mjs` ya no existe: lo reemplaza `selectores.mjs` (más abajo). Las corridas
que dejó (`*-jev-todos.json`, `*-jev-talla.json`) siguen en `bench/corridas/` y se analizan
igual que antes:

```
node bench/analizar-jev-todos.mjs [bench/corridas/<archivo>-jev-todos.json]
```

`analizar-jev-todos.mjs` compara la corrida contra `etiquetas.json` y escribe al lado
`<archivo>-analisis.md`: Jev solo por tipo, dónde deciden hoy las reglas, calibración y la
política simulada (fases 5 y 6). Las corridas `2026-10-09-1347-jev-talla-vieja` y
`2026-10-09-1347-jev-todos-nueva` se hicieron con textos de talla distintos de los actuales.
`/router bench` y `comparar.mjs` no miden las reviews por description: para eso está
`review-talla.mjs`, o las suites de abajo.

## Comparar selectores (suites)

Un **selector** es lo que decide un tipo o una talla cuando las reglas no alcanzan: las reglas
solas, Haiku, Jev o un modelo local. Tres **suites** los miden sobre los mismos casos:

| Suite | Casos | Etiquetas que se ofrecen | Referencia |
|---|---|---|---|
| `tipos` | los 729 | los 9 tipos | `etiquetas.json` |
| `talla` | los builds (regla `build`) | `build-large`, `build-small` | `etiquetas.json` |
| `review` | las 225 reviews etiquetadas | `review-large`, `review-small` | `etiquetas-review.json` |

El pedido se arma como en producción (solo description y resumen, nunca el prompt) y sin umbral:
la corrida guarda la confianza y el informe aplica el umbral después.

### `selectores.mjs`: Jev y el local, desde Node

```
[JEV_API_KEY=…] [LOCAL_API_KEY=…] node bench/selectores.mjs --selector jev|local \
  --suite tipos|talla|review|todas [--protocolo systemone|openai] [--url U] [--modelo M] \
  [--hardware H] [--max N] [--concurrencia N]
```

- `jev` pide `JEV_API_KEY`. `local` pide `--url` (el endpoint completo), `--modelo` y
  `--protocolo` (`systemone` por defecto u `openai`); la key del local es opcional
  (`LOCAL_API_KEY`) y sin ella no se manda header.
- `--hardware` es texto libre (por ejemplo la GPU): queda en la corrida y el informe lo cita.
- `--max` y `--concurrencia` (por defecto 1) tienen que ser enteros positivos; si no, el script
  sale con el uso.
- Una llamada que no responde en 60 s queda como error y el script sigue.
- Escribe una corrida por suite, `bench/corridas/<AAAA-MM-DD>-<HHMM>-sel-<selector>-<suite>.json`,
  cada 50 resultados y al final, con la fecha, el selector, la suite, el modelo, el protocolo, la
  URL (sin usuario, contraseña ni query), el hardware, la concurrencia y, por caso, `id`, `tipo`,
  `confianza`, `ms` y `error`. `selectores.mjs` e `informe.mjs` **nunca pisan un archivo anterior**: si el nombre existe,
  agregan `-2`, `-3`…
- Las keys no se imprimen ni se guardan, ni siquiera dentro de un error.

### `/router bench --suite`: Haiku, dentro de Claude Code

```
/router bench [--suite tipos|talla|review|todas] [--solo haiku|jev|local] [--max N] [--concurrencia N] [--tokens N]
```

Con `--suite` escribe una corrida por selector y suite con el mismo formato y nombre que
`selectores.mjs`, pero sin el `-2`: dos corridas del mismo selector y suite en el mismo minuto
se pisan. `--solo local` y `--tokens` piden `--suite`. Sin `--suite` el comando queda
como antes (mismo archivo `-banco.json`). `--tokens N` (20 por defecto) toma una muestra de N
llamadas de Haiku por `$.model.complete` y guarda el uso medio de tokens de entrada y de salida,
que el informe necesita para el precio. El local toma la configuración de `/config` (`localUrl`,
`localModelo`, `localProtocolo`…).

### `informe.mjs`

```
node bench/informe.mjs [--tope 1000] [--umbral-local 0.7] [corridas…]
```

Lee las corridas `-sel-` de `bench/corridas/` (la más nueva por selector, modelo, protocolo y
suite, o las que listes), imprime el informe y lo guarda como
`<AAAA-MM-DD>-<HHMM>-informe-selectores.md`, sin pisar uno anterior (`-2`…). `--tope` es el
`topeMs` simulado (1000) y `--umbral-local` el umbral del local (0.7). Trae:

- **Una tabla por suite**, con una fila por selector (`reglas` es la base) y las columnas `n`,
  `acierta`, `seguros` (solo etiquetas con `seguro: true`), `con umbral` (por debajo del umbral
  decide el respaldo), `con tope` (una llamada con error o más lenta que `--tope` cuenta como el
  respaldo), `p50`, `p95`, `máx`, `> tope` (llamadas que pasan el tope), `errores` y
  `USD / 1.000` pedidos.
- **Calibración**: acierto por tramo de confianza, para los selectores que la informan. Con eso
  se elige `localUmbral`.
- **Política completa simulada**: los 729 casos ruteados con la política actual y cada selector, y
  la talla de las 225 reviews, con y sin tope.
- **Precios** y **advertencias** (etiquetas dudosas, tallas sin validar, hardware del local y
  umbral sin calibrar). Una suite sin corrida sale como `sin dato`.

### `precios.json`

Precios por 1.000.000 de tokens, con la fuente y la fecha: Haiku 5.5 a USD 0,10 de entrada y
USD 0,50 de salida (precio de lista de Anthropic, cacheado el 2026-10-06; el thinking se cobra
como salida) sobre la muestra de `--tokens`; Jev a USD 42 por mil millones de tokens de entrada
(typesafe.ai, consultado el 2026-10-15) sobre los tokens estimados del pedido (caracteres / 4),
sin dato de salida; el local y las reglas, USD 0. Con Claude Max no se paga por llamada: Haiku
consume cuota de la ventana de 5 h. Si cambia un precio, editá el archivo y la fecha.

### Servidor falso (`lib/servidor-falso.mjs`)

```
node bench/lib/servidor-falso.mjs [--puerto 9931] [--logprobs no] [--demora MS]
```

Un servidor local que habla System One (`/v1/systemone`) y OpenAI (`/v1/chat/completions`) y
siempre elige la primera opción. Sirve para probar el clasificador `local` y `selectores.mjs` sin
un modelo de verdad: `--logprobs no` responde sin logprobs y `--demora` agrega milisegundos de
espera para probar el tope. Sus números no miden nada.

## La talla de las reviews (`review-talla.mjs`)

```
[JEV_API_KEY=…] node bench/review-talla.mjs
```

Mide `review-large` contra `review-small` sobre las reviews de `casos.json`, con la referencia de
`bench/etiquetas-review.json` (`{ id: { talla, fuente, seguro, nota? } }`). Las de fuente `build`
toman la talla del build anterior más cercano del mismo proyecto y la misma tarea (`tareaDe`), como
tallaBuildDe del router (nunca miran un build posterior), y son seguras; las de
fuente `manual` las etiquetó el implementador y quedan con `seguro: false` hasta que las valide el
usuario. Imprime cuántas cubren y aciertan el alcance y el build de la misma tarea, Jev con las 2
tallas (sin umbral y con umbral 0.7, respaldo `review-small`) y la política de `tallaDeReview`
simulada (rango de tareas, build de la misma tarea, palabras de alcance solo si no se nombra una tarea numerada, clasificador). Sin `JEV_API_KEY` no llama a Jev. Guarda la tabla en
`bench/corridas/<AAAA-MM-DD>-review-talla.md`. Los regex de alcance están copiados de
`router/src/tallaReview.ts`: el script lee ese archivo como texto y avisa (`AVISO: …`) si alguno cambió;
hay que actualizar la copia.

## La primera línea del prompt (`primera-linea.mjs`)

```
node bench/primera-linea.mjs [--proyectos C:/Users/.../.claude/projects]
```

Mide si las reglas, aplicadas a la primera línea no vacía del prompt, aciertan en los casos del
banco que no tienen regla de description. Lee los transcripts, no guarda nada del prompt (solo
imprime conteos y las descriptions que fallan). La compuerta no pasó: la primera línea dispara
una regla en 17 casos y acierta 9 (9/17, 52,9%; pedía 90%), así que esa regla no se activó.

## Qué mide cada número

- **Reglas:** cuántos casos resuelven las reglas solas, sin modelo, y con qué acierto contra la
  referencia.
- **Tabla principal**, sobre los mismos casos ganables de producción (los que le llegarían a un
  clasificador). La primera fila, **Respaldo (sin modelo)**, es lo que decide hoy el router con
  `clasificador: reglas`: en los builds, la talla por tamaño (`chars > 5000`, o `chars > 3000` con `archivos >= 10`);
  en los casos sin regla, siempre `build-small`. Así la tabla responde "reglas contra el
  clasificador" sobre los mismos casos. Columnas:
  - *acierta*: el tipo elegido coincide con la referencia;
  - *acierta con tope*: simula producción; si la llamada tardó más que `--tope` o falló, cuenta
    la respuesta del respaldo;
  - *sin regla* y *builds*: lo mismo, sin y con tope, solo sobre los casos sin regla (se ofrecen
    los 9 tipos) o solo sobre los de regla `build` (se elige entre build-large y build-small);
  - *solo seguros*: *acierta*, contando solo las etiquetas con `seguro: true`;
  - *errores*: llamadas que fallaron (HTTP, respuesta inválida, más de 60 s);
  - *p50/p95 ms*: latencia de las llamadas que respondieron. Errores y latencias cuentan las
    mismas llamadas que el resto de la fila: las de casos ganables.
- **Imposibles de acertar:** casos cuya referencia no está entre las etiquetas que se le
  ofrecen al clasificador (un build cuya referencia es `fix`: solo se ofrecen las dos tallas).
  Salen del denominador de la tabla y de la calibración, y se informa cuántos son.
- **Calibración de Jev:** acierto por tramo de confianza.
- **Variantes del respaldo**, sobre los builds ganables de `casos.json`: la variante actual (`chars > 5000`, o
  `chars > 3000` con `archivos >= 10`) al lado de la anterior (`chars > 5000` o `archivos > 6`) y de una
  solo por largo (`chars > 5000`). `archivos` cuenta los
  archivos que el prompt *nombra* (spec, plan, contexto), no los que la tarea toca: si otra
  variante acierta más que la actual, conviene cambiar el respaldo.

## Cómo elegir en `/config`

- **`clasificador`:** compará cada fila contra la de **Respaldo (sin modelo)**, sobre todo en
  las columnas *con tope*, que son lo que pasaría en producción. Si ninguno le gana claramente,
  dejá `reglas`. Mientras queden etiquetas dudosas sin revisar en `para-revisar.md`, una
  diferencia de pocos puntos está dentro del ruido.
- **`jevUmbral`:** el borde inferior del tramo de confianza a partir del cual Jev acierta más
  que el respaldo. En producción el umbral se aplica solo a la talla de los builds (ahí, por debajo, decide el respaldo) y, con clasificador jev, a las reviews por description (por debajo, queda la regla). Sin regla, Jev decide igual y el motivo dice `jev (sin umbral)`. La tabla **Umbral de Jev** de `comparar.mjs` lo mide: sin umbral, umbral en todo y umbral solo en la talla (acierto en todos los casos, en los sin regla y en los builds).
