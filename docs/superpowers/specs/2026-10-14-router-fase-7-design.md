# Router de subagentes · fase 7: talla de las reviews

Extiende el [diseño de la fase 6](2026-10-09-router-fase-6-design.md) y la v0.2.0 (modelo por tipo
en `/config`, modo hot opcional). Lo que no se nombra acá no cambia.

## Por qué

Todas las reviews van a opus·xhigh, que es lento: en la sesión real del 2026-10-09, entre 5,5 y 18
minutos cada una. En el banco, 199 de 225 reviews son "Review Task N", la review de una tarea de un
plan, y el build de esa tarea fue chico en 151 de 195 casos. El usuario quiere opus·xhigh solo
para las reviews grandes (de bloques, features o builds grandes) y opus·medium (rápido, bueno y
eficiente) para las medianas y chicas.

## 1. Tipos

Hay dos conjuntos de tipos:

- **Tipo de clasificación**, el que deciden las reglas y Jev: los 9 de hoy, con `review` como
  familia. No cambia: las reglas, la pregunta de 9 etiquetas de Jev y el banco siguen igual.
- **Tipo final**, el que define el modelo: 10 tipos. `review` se parte en `review-large` y
  `review-small`.

| Tipo final | Base | ⬆️ | 🔥 |
| --- | --- | --- | --- |
| `review-large` | opus·xhigh | opus·xhigh | opus·xhigh |
| `review-small` | **opus·medium** | opus·high | opus·xhigh |
| `review-final`, `re-review` | sin cambios (opus·xhigh, opus·medium) | | |

Un subagente con tipo de clasificación `review` pasa al paso de talla (§2). Es el mismo patrón que
ya existe para `build` → `build-large` / `build-small`.

## 2. La talla de una review

Orden final tras la review (2026-10-15): rango de tareas → build de la misma tarea → palabras de alcance solo si no se nombra una tarea numerada → clasificador.

Corre después de decidir que el tipo es `review` (por regla o por Jev), en este orden:

1. **Alcance en la description.** Si nombra un alcance grande, es `review-large`:
   - bloque o block;
   - feature;
   - fase o phase;
   - integración o integration;
   - rama o branch;
   - merge;
   - varias tareas ("Tasks 3-5", "Tareas 3 a 5", "T3-T5").

   Motivo: `talla por alcance (<palabra>)`.
2. **El build de la misma tarea en la sesión.** Si la tarea (`tareaDe(description)`) tuvo un build
   en esta sesión, la review hereda su talla: `build-large` da `review-large` y `build-small` da
   `review-small`. Si hubo varios builds, cuenta el último. Motivo:
   `talla del build de Tarea 3 (build-large)`.
3. **El clasificador**, con una pregunta de 2 etiquetas (`review-large` / `review-small`):
   - `review-large`: "Revisar un bloque, una feature, una fase, una integración o varias tareas, o
     un cambio grande con muchos archivos."
   - `review-small`: "Revisar una tarea o un cambio acotado."

   Funciona igual que la talla de los builds: con Jev, el umbral `jevUmbral` se aplica, y con duda,
   falla o sin clasificador, decide el respaldo. El respaldo de la review es siempre `review-small`.
   Motivos: `jev → review-large (0.91)` o `respaldo (…) → review-small`.

## 3. Configuración y comandos

- **`/config`:** `modeloReviewLarge` (default opus·xhigh) y `modeloReviewSmall` (default
  opus·medium). La opción `modeloReview` de la v0.2.0 queda como **legado**: si está en un escalón
  y la opción específica está en "por defecto", se aplica a las dos tallas.
- **`/router set`:** `review-large` y `review-small` se pueden fijar por separado.
  `/router set review <escalón>` fija las dos.
- El techo no cambia: solo `explore` tiene techo.

## 4. Métricas, historial y panel

- **"Reviews en Opus" y "rondas/tarea"** cuentan `review-large`, `review-small` y el `review` de los
  registros viejos.
- El historial y el panel muestran el tipo final. Los registros viejos se ven como `review`.

## 5. Banco

- `bench/etiquetas-review.json` guarda la talla de referencia de las reviews del banco:
  - las reviews con un build de la misma tarea y proyecto toman la talla de ese build;
  - el resto la etiqueta el controller a mano, con `seguro: false` para que la valide el usuario.
- `bench/review-talla.mjs` mide tres cosas:
  - las palabras de alcance;
  - la herencia del build;
  - Jev con la pregunta de 2 etiquetas sobre todas las reviews, con la política completa.

  Lo imprime y lo guarda en `bench/corridas/`. No hay una compuerta: los números quedan en la
  verificación.

## 6. Pruebas

- Unitarios: taxonomía (10 tipos, opciones, legado de `modeloReview`), `set review`, talla de review
  (las tres fuentes, en orden), pregunta de 2 etiquetas, respaldo, métricas con los tipos nuevos y
  viejos.
- En vivo con `claude -p`: un build grande con su review (`review-large`, opus·xhigh) y un build
  chico con la suya (`review-small`, opus·medium).

## Fuera de alcance

- Talla de las re-reviews.
- Pasar a inglés el panel, los mensajes y los motivos.
