# Talla de reviews · 2026-10-14T19:17:47.874Z

Referencia: bench/etiquetas-review.json, 225 reviews (195 con fuente build y seguras, 30 manuales sin validar). 107 review-large y 118 review-small.

Columnas: casos que cubre la fila, acierto en esos casos, y el acierto partido por fuente de la etiqueta.

| Medida | cubre | acierta | fuente build | fuente manual |
|---|---|---|---|---|
| Alcance (rango, o palabra sin tarea numerada) | 2 | 2/2 (100.0%) | — | 2/2 (100.0%) |
|   solo rango de tareas | 0 | — | — | — |
|   solo palabra sin tarea numerada | 2 | 2/2 (100.0%) | — | 2/2 (100.0%) |
| Build de la misma tarea | 195 | 195/195 (100.0%) | 195/195 (100.0%) | — |
| Respaldo solo (siempre review-small) | 225 | 118/225 (52.4%) | 99/195 (50.8%) | 19/30 (63.3%) |
| Jev 2 etiquetas, sin umbral (0 errores → review-small) | 225 | 140/225 (62.2%) | 119/195 (61.0%) | 21/30 (70.0%) |
| Jev 2 etiquetas, umbral 0.7 | 225 | 148/225 (65.8%) | 126/195 (64.6%) | 22/30 (73.3%) |
| Política con clasificador reglas (respaldo) | 225 | 216/225 (96.0%) | 195/195 (100.0%) | 21/30 (70.0%) |
| Política con Jev sin umbral | 225 | 216/225 (96.0%) | 195/195 (100.0%) | 21/30 (70.0%) |
| Política con Jev umbral 0.7 | 225 | 217/225 (96.4%) | 195/195 (100.0%) | 22/30 (73.3%) |
|   solo los que llegan al clasificador, Jev sin umbral | 28 | 19/28 (67.9%) | — | 19/28 (67.9%) |
|   solo los que llegan al clasificador, Jev umbral 0.7 | 28 | 20/28 (71.4%) | — | 20/28 (71.4%) |

Paso que decide en la política: clasificador 28 · build 195 · alcance 2.

Fallos de la política con Jev umbral 0.7 (8):

| id | description | referencia (fuente) | política | paso | Jev |
|---|---|---|---|---|---|
| c0015 | Verificar formularios: familia D | review-small (manual) | review-large | clasificador | review-large 0.74 |
| c0016 | Verificar formularios: familia A | review-small (manual) | review-large | clasificador | review-large 0.80 |
| c0017 | Verificar formularios: familia C | review-small (manual) | review-large | clasificador | review-large 0.76 |
| c0018 | Verificar formularios: familia B | review-small (manual) | review-large | clasificador | review-large 0.88 |
| c0078 | Code review del paso 1 y la 0014 | review-small (manual) | review-large | clasificador | review-large 0.90 |
| c0102 | Code review del filtro de vencimiento | review-small (manual) | review-large | clasificador | review-large 0.74 |
| c0130 | Code review del trabajo de la 5.3 | review-small (manual) | review-large | clasificador | review-large 0.86 |
| c0373 | Review the real-data reads | review-small (manual) | review-large | clasificador | review-large 0.84 |
