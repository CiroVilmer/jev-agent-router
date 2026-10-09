// Generado por bench/linea-base.mjs el 2026-10-07. No editar a mano.
// Es una foto congelada: Claude Code borra los transcripts a los ~30 días, así que regenerarlo
// más adelante cambia la base. Regeneralo solo a propósito.
// Base: los Agent/Task de ~/.claude/projects/*/*.jsonl (sin scratch-workspaces) hasta el
// 2026-10-05 23:59:59.999 UTC-3, el día antes de que existiera el router.
// - reviewsEnOpus: de los review, review-final y re-review (por clasificarPorReglas), la
//   proporción que corrió en Opus: el model pedido; si hereda, opus si el subagent_type lo dice
//   y si no el modelo del mensaje que lo lanzó. Da 0.23 y no el 0.17 de la constante vieja
//   porque ahora el modelo heredado se resuelve al del padre (antes 'inherit' contaba como
//   no Opus).
// - rondasPorTarea: re-review por tarea (archivo de sesión + tareaDe), sobre las tareas con review.
// - minutosPorTarea: mediana, en minutos, desde el primer spawn de la tarea hasta la última
//   task-notification de sus subagentes (se cruzan por tool-use id). Es el mismo tramo que mide
//   metricasDe en vivo. Si a algún subagente de la tarea le falta la notificación, la tarea queda
//   afuera porque su fin real no se ve.
export const LINEA_BASE = {
  desde: '2026-09-03',
  hasta: '2026-10-05',
  subagentes: 627,
  reviewsEnOpus: 0.23,
  rondasPorTarea: 0.5,
  minutosPorTarea: 19,
} as const
