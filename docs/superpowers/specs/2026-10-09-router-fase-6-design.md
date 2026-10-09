# Router de subagentes · fase 6: Jev en el centro

Extiende el [diseño de la fase 5](2026-10-09-router-fase-5-design.md). Lo que no se nombra acá
no cambia.

## Por qué

El usuario quiere que Jev sea el que discrimina, no un respaldo. Hasta la fase 5, Jev solo
decidía la talla de los builds y los casos sin regla (el 37% de los subagentes). Se midió Jev
sobre los 729 casos del banco (`bench/jev-todos.mjs`, corridas del 2026-10-09):

- Con las 9 etiquetas, Jev acierta 98,7% de las reviews, 100% de las re-reviews y 100% de las
  review-final. Le gana a las reglas en esa familia.
- Es flojo en fix (61%), explore (73%), research (39%) y write (24%). Ahí siguen las reglas.
- En la talla erraba los builds grandes de ~3k a ~5k caracteres (55% de acierto en
  build-large): la descripción solo decía "grande suele traer más de ~5k". En el banco, los
  grandes son los de más de ~5k o los de ~3k a ~5k que nombran 10 archivos o más (99% en las
  etiquetas seguras). Con esa descripción, Jev acierta la talla en el 95,4% (antes 75,6% solo,
  89,8% con umbral y respaldo).
- Esa descripción empeora la pregunta de 9 etiquetas (review baja a 93,8%): va solo en la
  pregunta de talla.

Dato de la review final: en el banco, la fase 5 con el respaldo nuevo (sin Jev en talla ni
reviews) da 90,4%, contra 90,5% de la fase 6. Con el texto nuevo, Jev no discrepa del respaldo en la
talla, y en las reviews cambia la regla en 1 de 372. Lo que suma Jev hoy es ser el que decide (y lo
que venga: la intensidad), no aciertos en el banco.

Simulación de la política de abajo sobre el banco: 90,5% en total (actual 88,5%), reviews 99,2%
(98,9%), builds 95,4% (88,9%), fix igual. En las etiquetas seguras, 94,0% (93,5%). Jev se
consulta en 639 de 729 subagentes.

## 1. Jev decide la familia review

Cuando la regla de la **description** dice `review-final`, `review` o `re-review`, el router
consulta al clasificador con las 9 etiquetas:

- Si responde **Jev** con confianza ≥ `jevUmbral` (0.7), decide Jev, aunque elija otro tipo.
- Si Jev duda (confianza < `jevUmbral`), falla, se pasa de `topeMs`, no hay key, o el
  clasificador no es Jev (`reglas` o `haiku`), decide la regla.
- Si Jev, sin duda, elige `explore` o `write`, una review no baja a Haiku: queda la regla, con
  motivo `regla review · jev → explore (0.80): queda la regla`.
- Las reglas de `subagentType` (`Explore`, `revisor-final`) no se consultan: son estructurales.

Motivos:
- Jev confirma o cambia: `regla review · jev → review (0.98)` / `regla review · jev → build-large (0.93)`.
- Decide la regla: `regla review · jev dudó (0.55): queda la regla` (o `respaldo …: queda la regla`
  si no respondió Jev).

Para eso, con las 9 etiquetas, `crearJev` ya devuelve la elección con `detalle: 'sin umbral'`
cuando la confianza está por debajo del umbral (fase 5, §3c). `decidir` usa ese detalle y la
`fuente` para saber si Jev puede cambiar la regla. Los casos **sin regla** siguen como en la
fase 5: decide Jev aunque dude.

## 2. La talla: criterios nuevos solo en la pregunta de 2 etiquetas

`preguntas.ts` tiene dos juegos de textos y elige según las etiquetas:

- **Pregunta de talla** (`build-large` y `build-small` solas):
  - `build-large`: "Implementar algo grande: integración entre varias piezas, diseño o mucha
    lógica nueva. Por el resumen: un prompt de más de ~5k caracteres, o uno de ~3k a ~5k que
    nombra 10 archivos o más."
  - `build-small`: "Implementar algo chico o mediano y acotado: un cambio mecánico o una pieza
    bien delimitada. Por el resumen: un prompt de hasta ~3k caracteres, o uno de ~3k a ~5k que
    nombra menos de 10 archivos."
  - Cómo decidir, además de "elegí por lo que el subagente tiene que hacer":
    - "Para separar un build grande de uno chico, mirá primero el largo del prompt y después los
      archivos: más de ~5k caracteres es grande; hasta ~3k es chico; entre ~3k y ~5k decide el
      conteo de archivos (10 o más es grande, menos de 10 es chico)."
    - "El conteo de archivos del resumen cuenta los archivos que el prompt nombra (spec, plan,
      contexto), no los que la tarea toca: solo alcanza para decidir la talla en el tramo de ~3k
      a ~5k caracteres."
    - "Los pasos y si menciona un spec no separan bien la talla: casi todos los builds de un
      plan mencionan el spec."
- **Pregunta de 9 etiquetas:** los textos de hoy, sin cambios.

Lo usan Jev (`preguntaJev`) y Haiku (`textoParaHaiku`) por igual. `preguntas.ts` lo importa Node
desde `bench/`: el chequeo "es la pregunta de talla" se hace ahí mismo, sin importar valores de
otros módulos.

## 3. El respaldo de la talla

`tamanoPorRespaldo(resumen)` pasa de `chars > 5000 || archivos > 6` a
**`chars > 5000 || (chars > 3000 && archivos >= 10)`**. En el banco: 96,4% contra 71,6% (el de
hoy manda a Opus 56 de 100 builds chicos). Decide cuando Jev duda en la talla, falla o no hay key,
y con `clasificador: reglas`.

## Riesgos

- El corte de ~3k caracteres y 10 archivos sale de las mismas etiquetas del banco (hechas por un
  subagente Opus, 96 todavía dudosas): parte de la mejora puede ser ajuste al banco. Son dos
  cortes gruesos, no un ajuste fino.
- Más llamadas a Jev (639 de 729 subagentes, antes ~275): ~250 ms de mediana por spawn de la
  familia review, con el tope de 1 s de siempre.

## Pruebas

- Unitarios: `decidir` (Jev confirma, cambia, duda, falla y no es Jev; `subagentType` no
  consulta), `preguntas` (los dos juegos de textos), `tamanoPorRespaldo` (los cortes), y los
  motivos.
- Banco: `bench/analizar-jev-todos.mjs` con una fila para esta política, y `comparar.mjs` con el
  respaldo nuevo.
- En vivo: `claude -p` con el plugin de la rama, un prompt que lance una review y un build de
  ~4k caracteres con 10+ archivos nombrados; en el historial, que la review lleve el motivo de
  Jev y el build salga `build-large`.

## Fuera de alcance

- Que Jev discrimine la intensidad de las reviews (profunda / acotada): próxima fase, con
  etiquetas nuevas en el banco.
- Jev en fix, explore, research y write.
