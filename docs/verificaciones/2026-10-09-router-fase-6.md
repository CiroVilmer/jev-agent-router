# Verificación · router fase 6 (Jev en el centro) · 2026-10-09

Claude Code 2.1.293, `clasificador: jev`, `jevUmbral: 0.7`. Corridas headless con
`claude -p --plugin-dir <rama>/router --dangerously-skip-permissions`, desde directorios
temporales.

## En vivo

| Subagente | Decisión | Motivos |
|---|---|---|
| Review por description, subagente `general-purpose` ("Review resumen.ts quality") | `inherit → opus·xhigh` | `regla review · jev → review (1.00)` |
| Build con prompt de 4,1k caracteres que nombra 12 archivos ("Implement esqueleto módulo de pedidos") | `inherit → opus·high` (`build-large` + ⬆️) | `regla build · jev → build-large (1.00) · política +1` |
| Review lanzada con `subagentType: Explore` | `haiku·high` (`explore` + ⬆️) | `regla subagentType Explore · política +1`: las reglas de `subagentType` no consultan a Jev, como pide el spec |

- El build de 4,1k caracteres con 12 archivos es justo el tramo que Jev erraba con la descripción
  vieja (55% de acierto en `build-large`); con la nueva lo dio grande con confianza 1.00.
- Claude tiende a lanzar las verificaciones de solo lectura con el agente `Explore`, que va a
  Haiku sin pasar por Jev. Queda como observación.

## Banco (fila de `bench/analizar-jev-todos.mjs`, 729 casos)

| Política | Total | Reviews | Builds | Fix |
|---|---|---|---|---|
| Fase 5 con el respaldo nuevo, sin Jev en talla ni reviews | 90,4% | 98,9% | 95,4% | 71,2% |
| Fase 5 con el respaldo nuevo (Jev en la talla) | 88,1% | 98,9% | 87,6% | 71,2% |
| **Fase 6** | **90,5%** | **99,2%** | **95,4%** | 71,2% |

- Talla (197 builds con regla `build`): Jev con la descripción nueva 95,4% (antes 75,6% solo y
  89,8% con umbral y respaldo). Respaldo nuevo 96,4% (antes 71,6%).
- Dato de la review final: la fase 5 con el respaldo nuevo y sin Jev en talla ni reviews da 90,4%
  contra 90,5% de la fase 6. Con el texto nuevo Jev no discrepa del respaldo en la talla, y en las
  reviews cambia la regla en 1 de 372. Lo que suma Jev hoy es ser el que decide (y lo que venga:
  la intensidad), no aciertos en el banco.
- Jev se consulta en 639 de 729 subagentes cuando es el clasificador principal.

## Sin verificar

- Con `clasificador: reglas` o `haiku`, que las reviews no consulten: lo cubren los tests
  (`jevDecideReviews` false y, en `register.test.ts`, los de clasificador `haiku` y de `jev` sin key,
  que no llaman a `model.classify` ni a fetch).
- El panel en interactivo.
