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
   /router bench [--max N] [--solo haiku|jev]
   ```

   Corre Haiku y Jev sobre los casos de producción por el mismo camino que usa el router, pero
   sin el tope de producción, sin sombra y con umbral 0 (Jev nunca se descarta por duda: su
   confianza queda guardada). Una llamada que no responde en 60 s queda como error
   (`tardó más de 60 s`) y el banco sigue. Escribe `bench/corridas/<AAAA-MM-DD>-<HHMM>-banco.json`
   (fecha y hora locales, así una prueba con `--max` no pisa una corrida entera) cada 25
   resultados y al final. `--max N` corre solo los primeros N casos; `--solo` corre uno de los
   dos. Sin key de Jev (`/config` o `JEV_API_KEY`) corre solo Haiku y lo dice.

   El banco hace hasta **3 llamadas a la vez** (concurrencia 3). Eso puede inflar el p50 y el
   p95 frente a producción, donde cada spawn hace una sola llamada: tomá la latencia del banco
   como una cota pesimista. Después:

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

## Jev sobre todos los casos (`jev-todos.mjs`, `analizar-jev-todos.mjs`)

```
JEV_API_KEY=… node bench/jev-todos.mjs [--max N] [--talla]
node bench/analizar-jev-todos.mjs [bench/corridas/<archivo>-jev-todos.json]
```

`jev-todos.mjs` manda a Jev todos los casos de `casos.json` con las 9 etiquetas y sin pistas de
las reglas (solo description y resumen, nunca el prompt), con umbral 0: guarda la elección y la
confianza. Con `--talla` manda solo los casos con regla `build` y las 2 tallas, como producción.
Escribe `bench/corridas/<AAAA-MM-DD>-<HHMM>-jev-todos.json` (o `-jev-talla.json` con `--talla`).
`analizar-jev-todos.mjs` lo compara contra `etiquetas.json` y escribe al lado
`<archivo>-analisis.md`: Jev solo por tipo, dónde deciden hoy las reglas, calibración y la política
simulada (fases 5 y 6).

Las corridas `2026-10-09-1347-jev-talla-vieja` y `2026-10-09-1347-jev-todos-nueva` se hicieron con
textos de talla distintos de los actuales. `/router bench` y `comparar.mjs` no miden las reviews
por description: para eso está este banco.

## La talla de las reviews (`review-talla.mjs`)

```
[JEV_API_KEY=…] node bench/review-talla.mjs
```

Mide `review-large` contra `review-small` sobre las reviews de `casos.json`, con la referencia de
`bench/etiquetas-review.json` (`{ id: { talla, fuente, seguro, nota? } }`). Las de fuente `build`
toman la talla del build del mismo proyecto y la misma tarea (`tareaDe`) y son seguras; las de
fuente `manual` las etiquetó el implementador y quedan con `seguro: false` hasta que las valide el
usuario. Imprime cuántas cubren y aciertan el alcance y el build de la misma tarea, Jev con las 2
tallas (sin umbral y con umbral 0.7, respaldo `review-small`) y la política de `tallaDeReview`
simulada (alcance, build, clasificador). Sin `JEV_API_KEY` no llama a Jev. Guarda la tabla en
`bench/corridas/<AAAA-MM-DD>-review-talla.md`. Los regex de alcance están copiados de
`router/src/tallaReview.ts`: si cambian allá, hay que cambiarlos en el script.

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
