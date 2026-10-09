# Router de subagentes · fase 5: Haiku 5.5 y que los agentes sepan usar el router

Extiende el [diseño del router](2026-10-06-router-de-subagentes-design.md). Lo que no se nombra
acá no cambia.

## Por qué

1. **Haiku 5.5 salió el 2026-10-07** y desde Claude Code 2.1.293 el alias `haiku` resuelve a
   `claude-haiku-5-5` (verificado con `claude -p --model haiku`: `modelUsage` dice
   `claude-haiku-5-5` y el transcript registra el `effort` pedido). A diferencia de Haiku 4.5,
   admite esfuerzo (`low` a `max`, default `medium`). Es fuerte leyendo, buscando y redactando
   (HLE con herramientas 57 contra 64 de Sonnet 5.5; GDPval 1620 contra 1840) y flojo en trabajo
   de agente con código (Terminal-Bench 39 contra 71). Fuente: system card de Haiku 5.5.
2. **La primera sesión real con el router** (proyecto-b, 2026-10-09, 24 subagentes) mostró que
   el orquestador no siguió la convención de las descriptions (`v2: <servicio>`,
   `verif: <servicio>`): ninguna regla matcheó, todo pasó por Jev, y 7 de 12 verificaciones
   (reviews: "NO EDITES NADA") salieron como `build-small` en Sonnet porque Jev dudó (< 0.7) y el
   respaldo manda lo desconocido a `build-small`. Además pasó `model: sonnet` en los 24, porque su
   prompt de arranque lo pedía. Ninguna tarea quedó agrupada (`tarea` null).

## 1. Matriz y escalera con Haiku 5.5

Escalera de 9 escalones:

`haiku·low → haiku·medium → haiku·high → sonnet·low → sonnet·medium → sonnet·high → opus·medium → opus·high → opus·xhigh`

| Tipo | Antes | Ahora | Techo |
|---|---|---|---|
| `review-final`, `review` | opus·xhigh | igual | — |
| `re-review`, `build-large` | opus·medium | igual | — |
| `build-small`, `research` | sonnet·medium | igual | — |
| `fix` | sonnet·high | igual | — |
| `write` | sonnet·low | **haiku·high** | — |
| `explore` | haiku (sin esfuerzo) | **haiku·medium** | **haiku·high** (antes sonnet·medium) |

- `write` en haiku·high: con ⬆️ (+1) vuelve a sonnet·low, lo de antes; con 🔥 (+2), sonnet·medium.
- `explore` no usa `low`: Anthropic avisa que en `low` Haiku 5.5 saltea búsquedas y checks. El
  techo sigue siendo por velocidad.
- `haiku·low` no es base de ningún tipo; queda para `/router fijar`.
- `research`, builds, fixes y reviews no pasan a Haiku: Terminal-Bench y el riesgo de dar por
  hecho un cambio sin verificarlo (documentado para Haiku 5.5 en `low` y `medium`).

**Cambios de tipos:** todos los escalones de la escalera llevan esfuerzo, Haiku incluido.
`Escalon.esfuerzo` sigue opcional en el tipo solo porque el historial guardado tiene escalones
viejos de Haiku sin esfuerzo. `parseEscalon('haiku')` (sin esfuerzo) se lee como `haiku·medium`, para no romper lo que la gente
ya escribe en `/router fijar`, y `haiku·<esfuerzo>` se acepta. `formatEscalon` no cambia
(`modelo·esfuerzo`, o el modelo solo si un registro viejo no trae esfuerzo). Los registros
viejos del historial (`elegido: "haiku"`, `escalon: { modelo: 'haiku' }`) se leen y se muestran
como están; ningún código asume que un escalón guardado trae esfuerzo.

`turn.step` no cambia: ya aplica el esfuerzo cuando el escalón lo trae y el paso corre en ese
modelo.

## 2. Que Claude aprenda la convención

Tres piezas; ninguna bloquea.

**2a. `tool.describe` sobre `Agent`.** Se agrega al final de la descripción de la tool un bloque
fijo (`CONVENCION_AGENT` en `src/convencion.ts`):

```
Router de subagentes activo. El router elige el modelo y el esfuerzo de cada subagente: omití
`model` (se ignora salvo que la description tenga `[pin]`), aunque te hayan pedido un modelo.
Empezá `description` con el verbo del tipo de tarea: Implement (construir o editar), Review
(verificar o revisar sin editar), Re-review (revisar de nuevo tras un arreglo), Fix (arreglar
hallazgos), Explore (leer o mapear código), Research (investigar afuera), Write (redactar
notas o docs). Si es parte de un plan, nombrá la unidad como `Task N` y repetí el mismo número
en su build, review y fix. Ejemplos: "Implement Task 3: kubernetes", "Review Task 3:
kubernetes".
```

- Es constante: el host cachea `tool.describe` por sesión y un texto que cambia gasta el caché
  del prompt.
- Con `/router off` la descripción no cambia (el caché ya la fijó); el aviso de 2b sí respeta
  `/router off`. Se documenta.
- Si el hook falla, la descripción sale como la calculó el host (`.catch` → `next(e)`).

**2b. Aviso cuando ninguna regla reconoce la description.** Nueva opción `ensenarConvencion`
(boolean, **prendida** por defecto) en `plugin.json`. Un hook `tool.call` sobre `Agent`, el mismo
que hoy registra `avisarAClaude`, que se registra si cualquiera de las dos opciones está prendida.
Si el subagente unido por `tool_use_id` tiene el motivo `ninguna regla`, agrega a `context`:

```
router: no reconocí el tipo de "verif: kubernetes" y lo clasifiqué como review. Empezá la description con el verbo del tipo (Implement, Review, Re-review, Fix, Explore, Research, Write) y usá `Task N`.
```

- La description se recorta a 60 caracteres en la línea.
- Si las dos opciones están prendidas y aplican, salen las dos líneas (primero la de
  `avisarAClaude`).
- Va como `context`: lo lee el modelo, no se muestra en el transcript.
- Los subagentes que el router no tocó (`[pin]`, apagado, fork, error) no llevan aviso.

**2c. La sección `router:pin` del system prompt se achica:** queda solo lo que no está en la
tool: que el router decide modelo y esfuerzo, y que el tiempo de elegir modelo se use en
descomponer (paralelizar lo independiente, serializar lo que toca los mismos archivos, comparte
estado o depende de otra tarea). Para los nombres remite a la descripción de la tool Agent.

## 3. Clasificación

**3a. Reglas nuevas para `review`.** La regla `review` matchea también `verif…` (verify,
verificar, verificación), `validar`/`validate`, `audit…`/`auditar` y `check` al comienzo de la
description. Va en el mismo lugar del orden que la regla `review` actual (después de `re-review`,
`fix` y `review-final`). Y la regla `write` matchea también `write` al comienzo: es el verbo que
pide la convención de 2a y hoy no lo reconoce ninguna regla.

**3b. Reglas sobre la primera línea del prompt.** Si la description no matchea ninguna regla, se
aplican las mismas reglas a la primera línea no vacía del prompt (recortada a 200 caracteres).
Corre en local; el prompt sigue sin salir de la máquina. El motivo dice
`regla review (primera línea)`.

- Solo la primera línea: más adentro, un prompt de build suele mencionar "review" o "fix".
- Las reglas de comienzo de texto (`^fix`, `^research`…) se prueban contra la primera línea tal
  cual.
- **Criterio para activarla:** antes se mide con un script nuevo, `bench/primera-linea.mjs`,
  que relee los transcripts que todavía existen (Claude Code los poda a ~30 días), une cada
  subagente con su caso de `casos.json` por descripción y largo del prompt, y aplica las reglas
  a la primera línea de los casos sin regla de description. No guarda texto del prompt: solo
  imprime los conteos y las descriptions de los que fallan. Se activa si acierta **90% o
  más** de los casos donde dispara, contra `etiquetas.json`. Si no llega, el código no entra y el
  resultado queda en la verificación.

**3c. El umbral de Jev solo para la talla.** `jevUmbral` (0.7) se aplica solo cuando el
clasificador elige entre `build-large` y `build-small` (hubo regla `build`). Cuando no hubo
regla, decide la etiqueta de Jev aunque dude, y el motivo lo dice con el `detalle` que ya
existe: `jev (sin umbral) → review (0.55)`. Base: en el banco, los casos sin regla aciertan 43% con Jev
solo y 37% con el umbral (el respaldo siempre devuelve `build-small`). Se re-corre
`node bench/comparar.mjs` con la variante para cuantificarlo.

Desde la fase 6, con clasificador jev, el umbral también decide las reviews por description (con
duda queda la regla). Ver [la fase 6](2026-10-09-router-fase-6-design.md).

## 4. Agrupar por tarea

`tareaDe(descripcion)`: si no hay `Task N`, `Tarea N` ni `TN`, el patrón
`^<prefijo>: <nombre>` agrupa por el nombre, donde `<prefijo>` es una o dos palabras de hasta 30
caracteres en total y `<nombre>` se recorta y se pasa a minúsculas. Así `v2: kubernetes`,
`verif: kubernetes` y `Review: Kubernetes` quedan en la tarea `kubernetes`. Con `Task N` gana
`Task N`. La línea base (`lineaBase.ts`) no se regenera.

## 5. Pruebas y verificación

- Tests unitarios por pieza en la suite de `claude plugin test router`: escalera, `BASE`,
  `TECHO`, `parseEscalon`, `formatEscalon`, reglas nuevas, primera línea (si entra), umbral solo
  para la talla, `tareaDe`, texto de la tool, aviso, sección del system prompt.
- Banco: `primera-linea.mjs` para medir 3b y re-corrida de `comparar.mjs` para 3c.
- **En vivo** con `claude -p --plugin-dir <worktree>/router`: un prompt que pida "usá Sonnet" y
  lance en paralelo una verificación y una implementación, y un explore. Se mira en el store y en
  los transcripts: las descriptions que eligió Claude, tipo, modelo y esfuerzo (Haiku con
  `effort` en el transcript), y que el aviso llegue cuando no hay regla. Se corre antes (con
  `main`) y después.

## Fuera de alcance

- Que el respaldo sin regla vaya hacia arriba: con 3a, 3b y 3c deja de hacer falta.
- Reescribir la description visible del subagente.
- Regenerar la línea base.
