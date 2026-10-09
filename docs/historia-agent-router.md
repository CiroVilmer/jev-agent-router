# Historia del agent-router: decisiones y contexto que no están en el código

Es la fuente para documentar el proyecto en la vault. Junta todo lo que se decidió en la sesión
de diseño y construcción (2026-10-02 al 2026-10-07) y que el repo no registra solo. Para el
detalle técnico, ver el spec, los planes y las verificaciones en `docs/`.

## Origen (2026-10-02)

- El usuario vio el anuncio de **Claude Code Mods**, lanzado el 2026-10-01: plugins con hooks de
  función en TypeScript que corren dentro de Claude Code. Pidió que se lo explicara, cuáles eran
  los primeros mods conocidos y cuáles le servían.
- Mods de la comunidad relevados ese día:
  - firstmate-calm (kunchenguid/firstmate)
  - terminal-browser (zenbu-labs; solo macOS y Linux)
  - storybloq
  - cjavdev/mods (cache-shot-clock, context-meter, cache-saver)
  - karanb192/claude-code-mods (cache-tax, fable-pin, mod-builder)
  - ray-amjad secret-redactor
  - lossless-claude/lcm
  - los de muestra de Anthropic en anthropics/claude-code-playground: blast-radius,
    token-weather, replay-theater
  - directorios: claude-mods.com y karanb192/awesome-claude-code-mods
- **Análisis de las sesiones del usuario** en ~/.claude/projects, sobre proyecto-a,
  proyecto-c y proyecto-b. Patrones que aparecieron:
  - ~96 comandos rechazados por usar rutas fuera del worktree;
  - ~73 fallos de scripts inline por comillas;
  - ~62 veces que pegó `/context`, varias con el contexto al 86-87%;
  - traspasos entre sesiones con "prompt de arranque" y la vault;
  - ~130 pausas de más de 1 h (el caché vence);
  - orquestación pesada: 471 Agent y 135 SendMessage en uno de los proyectos;
  - ~300 `ssh vm-proyecto`;
  - el dev server sin levantar (curl con exit 7);
  - keys que entraban al contexto.
- **Mods recomendados en base a eso** (backlog de ideas, no implementados):
  1. guardián del worktree (reescribe las rutas al worktree);
  2. rotador de sesión con handoff a la vault;
  3. secret-redactor;
  4. arreglador de scripts inline (los guarda en un archivo);
  5. blast-radius;
  6. panel de la VM y de las corridas de automatizaciones;
  7. dev server y typecheck automático;
  8. panel de subagentes y router de modelos (**el elegido**);
  9. cache-saver o cache-tax.

## Diseño (brainstorming)

- **Objetivo del usuario:** balancear el uso para aprovechar las ventanas de 5 h y maximizar la
  calidad de los subagentes. La matriz que dio él:
  - construir algo grande: Opus 5.5 medium;
  - code review: Opus 5.5 xhigh;
  - construir algo chico o mediano: Sonnet 5.5;
  - explorar código propio: Sonnet 5.5 o Haiku.
- **Clasificador:** quiso comparar Haiku contra Jev (TypeSafe AI) en velocidad y accuracy. Dio
  el OK para que a Jev le lleguen los títulos de las tareas y un resumen numérico, nunca el
  prompt.
- **Taxonomía de 9 tipos**, aprobada con re-review en Opus medium. Había unas 110 re-reviews en
  su historial y en xhigh iban a consumir mucho.
- **Override.** Él suele repetir en cada sesión qué modelos usar ("sonnet 5.5 y opus 5.5 para lo
  grande"). La decisión fue que decida el router, con overrides por sesión (`/router permitir` y
  `/router fijar`) y por subagente (`[pin]`).
- **Enfoque A:** un solo mod, construido en fases.
- **Política de uso.** Al principio tenía modos de ahorro y reserva y un bloqueo por el uso
  semanal. **El usuario lo cambió:** "tengo 2 cuentas Claude Max, la gracia es sacarle el jugo,
  nunca tener miedo a gastar". Desde entonces la política **solo sube** (🔥 +2, ⬆️ +1) y no
  frena nunca.
- **Paralelizar builds automáticamente: descartado.** Se evaluó contra sus sesiones: el
  orquestador ya paraleliza lo que el plan permite, el mod no conoce las dependencias y un
  botón agregaba fricción. El usuario pidió explícitamente una evaluación honesta.
  - Dato de esa evaluación: en 698 subagentes, el orquestador **no cumplía** su instrucción de
    modelos. Los reviews salían 173 en Sonnet y 23 en Opus; las re-reviews, 32 en Haiku; los
    explore heredaban Opus. Ahí está el valor real del router.
- **Multi-lente para reviews:** descartado como default. Queda como experimento futuro, solo
  para review-final.
- **Interfaz.** La franja de varias filas era redundante con su statusline (modelo, contexto,
  5h y 7d) y con la lista nativa de agentes. Quedó una **línea informativa mínima** y el detalle
  en el panel `/router`. Las métricas van en una segunda pestaña.
- **Preferencias generales del usuario:** nada que bloquee ni que repita información que ya ve;
  reviews con Opus; desarrollo subagent-driven con specs de superpowers.

## Fase 1 (núcleo): mergeada el 2026-10-06, con 128 tests

- Reglas, política, overrides, línea, panel y clasificador de respaldo.
- **Lo que se descubrió del cargador de mods** (son reglas; romperlas hace que el módulo no
  cargue):
  1. los atoms de `$.state` solo se aceptan si están declarados en el archivo de hooks;
  2. `$` solo se puede pasar a funciones de nivel superior de ese archivo;
  3. `agent.spawn` necesita `.catch`.
- **Reescribir `model` con el id completo** (`claude-opus-5-5`) loguea un ZodError. Con el
  alias (`opus`) no, y el alias resuelve al modelo vigente.
- **`$CLAUDE_EFFORT`** dentro de un subagente muestra el esfuerzo de la sesión, no el del
  request. El esfuerzo real se ve en el transcript.
- Se verificó en vivo con `claude -p`: un review pedido en sonnet salió en Opus 5.5 con xhigh.

## Fase 2 (clasificadores y banco): mergeada el 2026-10-07, con 212 tests

- Haiku y Jev intercambiables, con tope de 1 s, modo sombra y banco con 729 casos reales
  (275 llegan al clasificador).
- **Etiquetas:** las hizo un subagente Opus; 96 quedaron dudosas en `bench/para-revisar.md`.
  **El usuario todavía no las revisó.**
- **Decisión de talla.** El conteo de "archivos" cuenta los archivos que el prompt *nombra*
  (spec, plan, contexto), no los que la tarea toca. Por eso la talla se ancla al largo del
  prompt (~5k caracteres), y hay 32 builds "chicos con muchos archivos" listados aparte. El
  respaldo de producción (`chars > 5000 || archivos > 6`) **no se cambió**.
- **Primera corrida con Jev: 401.** La key era válida; la sesión de Claude Code se había abierto
  antes de setear `JEV_API_KEY` (variable de usuario de Windows). Solución: abrir una terminal
  nueva.
- **Resultado del banco** (2026-10-07, 264 casos ganables):

  | | Acierto | p50 |
  |---|---|---|
  | Respaldo | 60% | — |
  | Haiku | 66% | 645 ms |
  | Jev | 67% | 275 ms |

  - Jev está **calibrado**. Con `jevUmbral` 0.7 (si duda, decide el respaldo) llega al 76%, y al
    89% en builds.
  - Errores: el respaldo se equivoca hacia lo caro (manda builds chicos a Opus); los
    clasificadores, hacia el lado que baja calidad.
- **Decisiones del usuario:** `clasificador: jev` y `jevUmbral: 0.7`.
  - El default del plugin para `jevUmbral` pasó a 0.7; el de `clasificador` sigue en `reglas`.
  - La config del usuario está en `~/.claude/settings.json` → `pluginConfigs` →
    `router@inline`.

## Fase 3 (métricas): 2026-10-07

- **Línea base** calculada de los transcripts hasta el 2026-10-05: reviews en Opus 23%, rondas
  por tarea 0,50 y mediana de 19 minutos por tarea (n=118).
  - Se mide igual que en vivo: mediana, fin real de la tarea según los task-notification, y el
    modelo heredado resuelto al del padre.
  - La primera versión favorecía al router (media de 66 minutos con un proxy) y se corrigió.
- Las métricas en vivo cuentan también los subagentes que el router no toca (`[pin]` o el
  router apagado).
- **Historial:** una clave por sesión (`historial:<id>`) para no pisarse entre procesos, con
  poda a 14 días y 3000 registros.
- **Ventanas de 5 h:** el máximo uso visto por cada `resetsAt` (así quedan separadas las 2
  cuentas), con cobertura de 60 minutos. No hay base previa al router: se compara contra la
  semana anterior.
- Riesgos que quedan:
  - la poda por tope puede borrar una sesión viva de otro proceso;
  - si dos procesos migran la clave vieja a la vez, puede duplicar registros;
  - si el host reescribe todo el archivo del store en cada `set`, procesos distintos podrían
    pisarse.

## Fase 4 (fast): cerrada

- Un mod solo podría prender fast con `$.command.run('fast')`. Pero fast se cobra con
  **créditos de uso aparte**, no con el plan Max, aplica a la sesión principal y la cuenta lo
  tiene deshabilitado (`extra_usage_disabled`).
- **El usuario lo descartó:** "no quiero pagar por API".

## Cómo se trabajó (proceso)

- Brainstorming → spec → plan por fase → subagent-driven development, con review de spec y
  calidad por tarea (en Opus), re-review acotada después de cada arreglo y review final de rama.
  Las decisiones del controller quedaron en ledgers.
- Worktrees en `.claude/worktrees/` del repo.
- Gotchas del entorno:
  - Claude Code se actualizó solo a 2.1.292 a mitad de la fase 2, y el kit de tests pasó a exigir
    que los hooks de test devuelvan resultado;
  - `claude -p` desde Bash se cuelga si stdin queda abierto (`< /dev/null`);
  - con la máquina cargada (CPU 99%) la suite da timeouts de 5 s que no son del código;
  - un reviewer hizo `git checkout` y dejó HEAD detached.

## Pendientes y próximos pasos

- El usuario tiene que revisar las 96 etiquetas dudosas (`bench/para-revisar.md`) y después
  re-correr `node bench/comparar.mjs`.
- Usar el router unos días con `clasificador: jev` y mirar la pestaña de métricas: sesión, 7 días
  y base.
- Backlog de mods: la lista de ideas del Origen.
- El repo `claude-mods` no tiene remote en GitHub.

## Ubicaciones

- Repo: `<repo>`, con el plugin en `router/`.
- Spec: `docs/superpowers/specs/2026-10-06-router-de-subagentes-design.md`.
- Planes: `docs/superpowers/plans/2026-10-06-router-fase-1.md`, `…fase-2.md` y
  `2026-10-07-router-fase-3.md`.
- Verificaciones: `docs/verificaciones/` (fase 1, fase 2 con el banco de Jev, y fase 4 de fast).
- Banco: `bench/` (`extraer.mjs`, `casos.json`, `etiquetas.json`, `para-revisar.md`,
  `comparar.mjs`, `linea-base.mjs`, `corridas/`).
- Cargarlo: `claude --plugin-dir <repo>/router`.
