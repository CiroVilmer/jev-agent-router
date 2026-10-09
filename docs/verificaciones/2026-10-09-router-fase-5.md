# Verificación · router fase 5 (Haiku 5.5 y convención) · 2026-10-09

Claude Code 2.1.293. Corridas headless con `claude -p --dangerously-skip-permissions`, desde un
directorio temporal vacío y con stdin cerrado.

## Alias y esfuerzo de Haiku

- `claude -p --model haiku`: `modelUsage` dice `claude-haiku-5-5`; con `--effort low` el
  transcript registra `"effort":"low"`. El alias `haiku` ya es Haiku 5.5 y admite esfuerzo.
- Subagente `write` con el router de la rama: `elegido: haiku·high`, y los tres turnos del
  subagente en `claude-haiku-5-5` con `"effort":"high"` y `"perTurnEffort":"high"` (la sesión
  corría en `medium`): el esfuerzo lo pone el router (`turn.step`).

## Antes y después: el mismo prompt

Prompt: "Usá subagentes Sonnet. Lanzá en paralelo tres subagentes…: uno que verifique, sin
editar nada, que `reglas.ts` exporta `clasificarPorReglas`; uno que cree `hola.txt`; y uno que
explore `router/src` y liste sus archivos."

| | Antes (`main`) | Después (rama) |
|---|---|---|
| Verificar | `"Verificar export clasificarPorReglas"` · `sonnet → haiku` · `subagentType Explore` | `"Review export of clasificarPorReglas"` · `inherit → haiku·medium` · `subagentType Explore` |
| Crear archivo | `"Crear hola.txt"` · `sonnet → sonnet·medium` · ninguna regla, `respaldo (jev dudó (0.63))` | `"Implement hola.txt file"` · `inherit → sonnet·medium` · `regla build · jev → build-small (1.00)` |
| Explorar | `"Listar archivos de src"` · `sonnet → haiku` · `subagentType Explore` | `"Explore router src files"` · `inherit → haiku·medium` · `subagentType Explore` |

- **Después, Claude siguió la convención en las tres descriptions** (Review, Implement, Explore)
  y **no pasó `model`** aunque el prompt pedía Sonnet. Antes: verbos en castellano libres y
  `model: sonnet` en las tres.
- Los dos explore corrieron en `claude-haiku-5-5` con `effort` `medium`.
- Observación: la verificación la lanzó con `subagentType: Explore`, y la regla de
  `subagentType` le gana a la description ("Review…"), así que fue `explore` en Haiku. Para una
  verificación de solo lectura chica es razonable; queda anotado.

## Banco

- **Reglas nuevas (Task 2):** resuelven solas 462 casos (antes 454) con 96,5% de acierto (antes
  96,9%). Los 8 nuevos aciertan 6; los 2 que fallan son "Verificar literatura…" y "Verificación
  numérica…", que la referencia etiqueta `research`.
- **Umbral de Jev solo en la talla (Task 3)**, corrida `2026-10-07-1032`, 264 casos:

  | variante | acierta | sin regla | builds |
  |---|---|---|---|
  | sin umbral | 67% | 43% | 76% |
  | umbral 0.7 en todo | 76% | 37% | 89% |
  | umbral 0.7 solo en la talla | **78%** | **43%** | **89%** |

- **Reglas sobre la primera línea del prompt (Task 5): no entran.** De 67 casos sin regla, 57
  siguen en los transcripts; la primera línea dispara una regla en 17 y acierta 9 (52,9%, la
  compuerta pedía 90%). Falla en tandas de fix que arrancan citando la review final, y en notas
  que arrancan con "Tarea N". Script: `bench/primera-linea.mjs`.

## Sin verificar

- El aviso de `ensenarConvencion` en vivo: en las corridas Claude siguió la convención y no hubo
  descriptions sin regla. Lo cubren los tests de `register.test.ts`.
- El panel y `/router` en interactivo (las verificaciones siguen siendo headless).
