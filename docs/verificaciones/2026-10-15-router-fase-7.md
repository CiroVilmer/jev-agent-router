# Verificación · router fase 7 (talla de las reviews) · 2026-10-15

Claude Code 2.1.293, `clasificador: jev`. Corrida headless con
`claude -p --plugin-dir <rama>/router --dangerously-skip-permissions` desde un directorio temporal,
con un plan de dos tareas en orden: un build grande (prompt de 5,8k caracteres que nombra 12
archivos) con su review, y un build chico con la suya.

## En vivo

| Subagente | Decisión | Motivos |
|---|---|---|
| "Implement Task 1: esqueleto facturación" | `build-large` · opus·medium | `regla build · jev → build-large (1.00)` |
| "Review Task 1: esqueleto facturación" | **`review-large` · opus·xhigh** | `regla review · jev dudó (0.46): queda la regla · talla del build de Tarea 1 (build-large)` |
| "Implement Task 2: crear hola.txt" | `build-small` · sonnet·medium | `regla build · jev → build-small (1.00)` |
| "Review Task 2: crear hola.txt" | **`review-small` · opus·medium** | `regla review · jev dudó (0.43): queda la regla · talla del build de Tarea 2 (build-small)` |

- Cada review heredó la talla del build de su tarea: la grande corrió en opus·xhigh y la chica en
  opus·medium.
- Jev, al confirmar la familia review, dudó en las dos (0.46 y 0.43) y quedó la regla, como pide
  la fase 6.

## Banco

`bench/review-talla.mjs`, 225 reviews (192 con el build de la misma tarea, 33 etiquetadas a mano y
sin validar): la política da 96,0% con Jev (umbral 0.7) y también con el respaldo solo, sin Jev.
El build de la tarea decide 192, el alcance 2 y el clasificador 31. Detalle en
`docs/benchmark.md` y `bench/corridas/2026-10-15-review-talla.md`.

## Sin verificar

- Una review sin build de la tarea en vivo, que pase por el clasificador (lo cubren los tests).
- `/router set review …` y las opciones `modeloReviewLarge` y `modeloReviewSmall` en interactivo
  (los cubren los tests).
