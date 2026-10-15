# Talla de reviews · 2026-10-15T12:37:06.925Z

Referencia: bench/etiquetas-review.json, 225 reviews (192 con fuente build y seguras, 33 manuales sin validar). 105 review-large y 120 review-small.

Columnas: casos que cubre la fila, acierto en esos casos, y el acierto partido por fuente de la etiqueta. La fila del build acierta por construcción en la fuente build (la etiqueta sale del mismo build): mide cobertura, no acierto.

| Medida | cubre | acierta | fuente build | fuente manual |
|---|---|---|---|---|
| Alcance (rango, o palabra sin tarea numerada) | 2 | 2/2 (100.0%) | — | 2/2 (100.0%) |
|   solo rango de tareas | 0 | — | — | — |
|   solo palabra sin tarea numerada | 2 | 2/2 (100.0%) | — | 2/2 (100.0%) |
| Build de la misma tarea | 192 | 192/192 (100.0%) | 192/192 (100.0%) | — |
| Respaldo solo (siempre review-small) | 225 | 120/225 (53.3%) | 98/192 (51.0%) | 22/33 (66.7%) |
| Jev 2 etiquetas, sin umbral (0 errores → review-small) | 225 | 137/225 (60.9%) | 116/192 (60.4%) | 21/33 (63.6%) |
| Jev 2 etiquetas, umbral 0.7 | 225 | 144/225 (64.0%) | 120/192 (62.5%) | 24/33 (72.7%) |
| Política con clasificador reglas (respaldo) | 225 | 216/225 (96.0%) | 192/192 (100.0%) | 24/33 (72.7%) |
| Política con Jev sin umbral | 225 | 213/225 (94.7%) | 192/192 (100.0%) | 21/33 (63.6%) |
| Política con Jev umbral 0.7 | 225 | 216/225 (96.0%) | 192/192 (100.0%) | 24/33 (72.7%) |
|   solo los que llegan al clasificador, Jev sin umbral | 31 | 19/31 (61.3%) | — | 19/31 (61.3%) |
|   solo los que llegan al clasificador, Jev umbral 0.7 | 31 | 22/31 (71.0%) | — | 22/31 (71.0%) |

Paso que decide en la política: clasificador 31 · build 192 · alcance 2.

Fallos de la política con Jev umbral 0.7 (9):

| id | description | referencia (fuente) | política | paso | Jev |
|---|---|---|---|---|---|
| c0015 | Verificar formularios: familia D | review-small (manual) | review-large | clasificador | review-large 0.76 |
| c0016 | Verificar formularios: familia A | review-small (manual) | review-large | clasificador | review-large 0.86 |
| c0017 | Verificar formularios: familia C | review-small (manual) | review-large | clasificador | review-large 0.80 |
| c0018 | Verificar formularios: familia B | review-small (manual) | review-large | clasificador | review-large 0.82 |
| c0078 | Code review del paso 1 y la 0014 | review-small (manual) | review-large | clasificador | review-large 0.92 |
| c0102 | Code review del filtro de vencimiento | review-small (manual) | review-large | clasificador | review-large 0.72 |
| c0130 | Code review del trabajo de la 5.3 | review-small (manual) | review-large | clasificador | review-large 0.86 |
| c0357 | Review Task 11 (spec + quality) | review-small (manual) | review-large | clasificador | review-large 0.88 |
| c0373 | Review the real-data reads | review-small (manual) | review-large | clasificador | review-large 0.88 |
