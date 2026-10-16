# Comparación de selectores

Tope de latencia: 1000 ms. Umbral: jev 0.7, local 0.7, haiku sin umbral (no tiene confianza). Referencia: etiquetas.json (tipos, talla) y etiquetas-review.json (review).

## Suite `tipos`

El respaldo de esta suite es build-small; la fila reglas lo usa en todos los casos. Los errores no entran en la latencia ni en "acierta", y cuentan como respaldo en "con tope" (y en "con umbral" de talla y review).

| selector | n | acierta | seguros | con umbral | con tope | p50 | p95 | máx | > tope | errores | USD / 1.000 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| reglas | 729 | 16.0% | 12.5% | 16.0% | 16.0% | 0 ms | 0 ms | 0 ms | 0.0% | 0 | $0 |
| haiku | 729 | 87.8% | 93.0% | 87.8% | 72.8% | 825 ms | 2157 ms | 3889 ms | 32.6% | 0 | ≈ $0.244 |
| jev | 729 | 83.8% | 88.9% | 83.8% | 83.8% | 245 ms | 307 ms | 752 ms | 0.0% | 0 | ≈ $0.017 + salida sin dato |

## Suite `talla`

El respaldo de esta suite es respaldoTalla(caso); la fila reglas lo usa en todos los casos. Los errores no entran en la latencia ni en "acierta", y cuentan como respaldo en "con tope" (y en "con umbral" de talla y review).

| selector | n | acierta | seguros | con umbral | con tope | p50 | p95 | máx | > tope | errores | USD / 1.000 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| reglas | 197 | 96.4% | 99.2% | 96.4% | 96.4% | 0 ms | 0 ms | 0 ms | 0.0% | 0 | $0 |
| haiku | 197 | 95.9% | 99.2% | 95.9% | 96.4% | 850 ms | 1381 ms | 2226 ms | 26.9% | 0 | ≈ $0.099 |
| jev | 197 | 95.4% | 99.2% | 96.4% | 96.4% | 241 ms | 304 ms | 457 ms | 0.0% | 0 | ≈ $0.016 + salida sin dato |

## Suite `review`

El respaldo de esta suite es review-small; la fila reglas lo usa en todos los casos. Los errores no entran en la latencia ni en "acierta", y cuentan como respaldo en "con tope" (y en "con umbral" de talla y review).

| selector | n | acierta | seguros | con umbral | con tope | p50 | p95 | máx | > tope | errores | USD / 1.000 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| reglas | 225 | 53.3% | 51.0% | 53.3% | 53.3% | 0 ms | 0 ms | 0 ms | 0.0% | 0 | $0 |
| haiku | 225 | 54.7% | 53.1% | 54.7% | 54.7% | 785 ms | 1463 ms | 3135 ms | 12.4% | 0 | ≈ $0.118 |
| jev | 225 | 60.0% | 59.4% | 63.1% | 63.1% | 244 ms | 290 ms | 600 ms | 0.0% | 0 | ≈ $0.009 + salida sin dato |

## Calibración (acierto por tramo de confianza)

**jev · tipos**

| confianza | n | acierta |
|---|---|---|
| 0–0.5 | 40 | 32.5% |
| 0.5–0.7 | 52 | 53.8% |
| 0.7–0.9 | 128 | 66.4% |
| 0.9–1 | 509 | 95.3% |

**jev · talla**

| confianza | n | acierta |
|---|---|---|
| 0–0.5 | 2 | 50.0% |
| 0.5–0.7 | 4 | 75.0% |
| 0.7–0.9 | 8 | 87.5% |
| 0.9–1 | 183 | 96.7% |

## Política completa simulada

Tipos: los 729 con la política de la fase 6 (regla primero; el selector decide reviews, tallas y lo que la regla no cubre). Talla de review: las 225 con alcance, build y clasificador. Con tope, una respuesta con error o más lenta que el tope se trata como si no hubiera respondido.

| selector | tipos (todos) | tipos (seguros) | tipos con tope (todos) | tipos con tope (seguros) | talla review | talla review con tope |
|---|---|---|---|---|---|---|
| reglas | 90.0% | 92.9% | 90.0% | 92.9% | 96.0% | 96.0% |
| haiku | 91.5% | 95.1% | 90.8% | 93.8% | 94.7% | 95.6% |
| jev | 90.8% | 94.3% | 90.8% | 94.3% | 96.0% | 96.0% |

## Precios

Consultados el 2026-10-15.

- **haiku** (claude-haiku-5-5): Precio de lista de la API de Anthropic (cacheado 2026-10-06). El thinking se cobra como salida. Con Claude Max no se paga por llamada: consume cuota de la ventana de 5 h.
- **jev** (jev-1.13.0): typesafe.ai ($42 por mil millones de tokens de entrada), consultado 2026-10-15. No publica precio de salida. Los tokens de entrada se estiman: caracteres del pedido / 4.
- **local**: $0 marginal: corre en hardware propio. Ver el hardware de cada corrida.
- **reglas**: $0: no hay modelo.

`≈` es estimado; `sin dato` es que falta el número.

## Advertencias

- 96 etiquetas de tipo son dudosas (seguro: false); las columnas "seguros" las excluyen.
- 33 etiquetas de talla de review no están validadas.
- 192 reviews con build aciertan por construcción (la talla sale del build, no del selector).
- La latencia de Haiku está medida dentro de Claude Code.
