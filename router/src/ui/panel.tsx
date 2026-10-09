import type { Elements, RenderElement } from 'claude-code'
import type { Overrides, Pestana, Subagente } from '../../types'
import type { Estadisticas, PorClasificador } from '../clasificadores/sombra'
import type { FilaDecision, ResumenDecisiones } from '../historial'
import { fechaLocal, horaLocal, textoCuenta } from '../historialMarkdown'
import type { EstadoPolitica } from '../politica'
import { LINEA_BASE } from '../lineaBase'
import { agruparPorTarea, metricasDe, type MetricasSesion } from '../registro'
import { formatEscalon } from '../taxonomia'
import type { ResumenVentanas } from '../ventanas'

// Vista pura: no toca $ ni atoms. El hook ui.render vive en hooks/register.tsx porque el
// cargador solo acepta read/update sobre atoms declarados ahí y solo deja pasar $ a funciones
// de nivel superior de ese archivo. Acá llegan los elementos, los datos ya leídos y el callback.
export type ElementosPanel = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

export type DatosPanel = {
  pestana: Pestana
  subs: readonly Subagente[]
  overrides: Overrides
  politica: EstadoPolitica
  ahora: number
  bodyColumns: number
  /** Comparación del modo sombra; null si no hay muestras. */
  sombra: Estadisticas | null
  /** Métricas del historial de los últimos 7 días, entre sesiones. */
  semana: MetricasSesion
  /** Ventanas de 5 h cerradas en los últimos 7 días y en los 7 anteriores. */
  ventanas7: ResumenVentanas
  ventanasAntes: ResumenVentanas
  /** Las últimas decisiones (memoria y store), de la más nueva a la más vieja, ya recortadas. */
  decisiones: readonly FilaDecision[]
  /** El resumen de las decisiones de los últimos 7 días. */
  resumen7: ResumenDecisiones
  alElegirPestana: (p: Pestana) => unknown
}

/** Cuántas decisiones lista la pestaña Historial. */
export const DECISIONES_EN_PANEL = 25

const MODO_ICONO = { fuego: '🔥', sobra: '⬆️', normal: '⚪' } as const
const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`)
const num = (x: number | null, d: number) => (x === null ? '—' : x.toFixed(d))
const ms = (x: number | null) => (x === null ? '—' : `${x} ms`)

/** Una fila de métricas: la etiqueta y las columnas sesión · 7 días · base, alineadas. */
const fila = (etiqueta: string, columnas: readonly string[]) =>
  `${etiqueta.padEnd(19)}${columnas.map(c => c.padEnd(6)).join('')}`.trimEnd()

/** El % sin usar ya viene en puntos (0-100), no en fracción. */
const puntos = (x: number | null) => (x === null ? '—' : `${Math.round(x)}%`)

/**
 * La ventana de 5 h: promedio sin usar al reset sobre las ventanas con cobertura de los últimos 7
 * días (n son esas), el de la semana anterior y cuántas de los 7 días quedaron sin cobertura.
 * Se compara contra la semana anterior y no contra la base: los transcripts no traen el %, así
 * que no hay base previa al router para la ventana de 5 h. La línea lo dice.
 */
function lineaVentanas(v7: ResumenVentanas, antes: ResumenVentanas): string {
  const n = v7.cerradas - v7.sinCobertura
  return `5 h sin usar al reset (7 días): ${puntos(v7.sinUsarPromedio)} en ${n} ${n === 1 ? 'ventana' : 'ventanas'} · vs semana anterior ${puntos(antes.sinUsarPromedio)} (no hay base previa al router) · ${v7.sinCobertura} sin cobertura`
}

/** La hora de una decisión; si no es de hoy, con el día adelante. */
function cuando(ms: number, ahora: number): string {
  if (fechaLocal(ms) === fechaLocal(ahora)) return horaLocal(ms)
  const [, mes, dia] = fechaLocal(ms).split('-')
  return `${dia}/${mes} ${horaLocal(ms)}`
}

/** `4 decisiones en 7 días · 2 reasignadas · opus 2 · sonnet 1 · haiku 1`. */
export function lineaResumen7(r: ResumenDecisiones): string {
  const partes = [
    `${r.total} ${r.total === 1 ? 'decisión' : 'decisiones'} en 7 días`,
    `${r.reasignadas} ${r.reasignadas === 1 ? 'reasignada' : 'reasignadas'}`,
  ]
  if (r.porModelo.length) partes.push(textoCuenta(r.porModelo))
  return partes.join(' · ')
}

/** Una línea por clasificador del par: reglas no tiene latencia; sin respuestas propias, "—". */
function lineaClasificador(c: PorClasificador): string {
  if (c.nombre === 'reglas') return 'reglas: decide sin modelo'
  const tope = c.pasoTope === null ? '' : ` · ${c.pasoTope} pasaron el tope`
  return `${c.nombre}: p50 ${ms(c.p50)} · p95 ${ms(c.p95)} · ${c.respaldos} al respaldo${tope}`
}

export function vistaPanel({ Box, Text, Button }: ElementosPanel, d: DatosPanel): RenderElement {
  const { pestana, subs, overrides, politica, ahora } = d
  const conMotivos = d.bodyColumns >= 70

  const pestanas = (
    <Box gap={2}>
      <Button key="tab-curso" hotkey="1" label={pestana === 'curso' ? '● En curso' : 'En curso'}
        onPress={() => d.alElegirPestana('curso')} />
      <Button key="tab-metricas" hotkey="2" label={pestana === 'metricas' ? '● Métricas vs tu base' : 'Métricas vs tu base'}
        onPress={() => d.alElegirPestana('metricas')} />
      <Button key="tab-historial" hotkey="3" label={pestana === 'historial' ? '● Historial' : 'Historial'}
        onPress={() => d.alElegirPestana('historial')} />
    </Box>
  )

  if (pestana === 'historial') {
    return (
      <Box flexDirection="column" gap={1}>
        {pestanas}
        <Box flexDirection="column">
          <Text bold>HISTORIAL</Text>
          <Text>{lineaResumen7(d.resumen7)}</Text>
        </Box>
        <Box flexDirection="column">
          {d.decisiones.length === 0 && <Text dimColor>Sin decisiones todavía.</Text>}
          {d.decisiones.map((f, i) => (
            <Box key={`dec-${i}`} flexDirection="column">
              <Text bold={f.reasignado}>
                {`${f.enCurso ? '▶ ' : ''}${cuando(f.inicio, ahora)} · ${f.tarea ?? '—'} · ${f.descripcion || '—'} · ${f.pedido} → ${f.elegido} · ${f.modo ?? '—'}`}
              </Text>
              {conMotivos && f.motivos.length > 0 && <Text dimColor>{`    ${f.motivos.join(' · ')}`}</Text>}
            </Box>
          ))}
        </Box>
        <Text dimColor>/router historial [días] exporta el detalle a ~/.claude/router-historial.md</Text>
      </Box>
    )
  }

  if (pestana === 'metricas') {
    const m = metricasDe(subs, ahora)
    const sombra = d.sombra
    return (
      <Box flexDirection="column" gap={1}>
        {pestanas}
        <Box flexDirection="column">
          <Text bold>SESIÓN · 7 DÍAS · BASE</Text>
          <Text>{fila('reviews en Opus', [m.reviewsEnOpus, d.semana.reviewsEnOpus, LINEA_BASE.reviewsEnOpus].map(pct))}</Text>
          <Text>{fila('rondas/tarea', [m.rondasPorTarea, d.semana.rondasPorTarea, LINEA_BASE.rondasPorTarea].map(x => num(x, 2)))}</Text>
          <Text>{fila('min/tarea', [m.minutosPorTarea, d.semana.minutosPorTarea, LINEA_BASE.minutosPorTarea].map(x => num(x, 0)))}</Text>
        </Box>
        <Text>{lineaVentanas(d.ventanas7, d.ventanasAntes)}</Text>
        <Text dimColor>{`${m.reasignados} de ${m.total} subagentes reasignados en esta sesión`}</Text>
        {sombra && (
          <Box flexDirection="column">
            <Text bold>CLASIFICADORES (modo sombra)</Text>
            {sombra.pares.map(p => (
              <Box key={`sombra-${p.par}`} flexDirection="column">
                <Text>{`${p.par} · ${p.n} ${p.n === 1 ? 'muestra' : 'muestras'} · coinciden ${p.coinciden} de ${p.comparables} comparables (${pct(p.comparables ? p.coinciden / p.comparables : null)})`}</Text>
                <Text key="principal">{`  ${lineaClasificador(p.principal)}`}</Text>
                <Text key="sombra">{`  ${lineaClasificador(p.sombra)}`}</Text>
              </Box>
            ))}
            <Text dimColor>Comparables: la sombra respondió por su cuenta y el principal también (o es reglas).</Text>
          </Box>
        )}
      </Box>
    )
  }

  const activos = subs.filter(s => s.fin === null)
  const tareas = agruparPorTarea(subs, ahora).slice(-8)
  const fijados = Object.entries(overrides.fijados).map(([t, esc]) => `${t} ${esc ? formatEscalon(esc) : ''}`)
  return (
    <Box flexDirection="column" gap={1}>
      {pestanas}
      <Box flexDirection="column">
        <Text bold>VENTANA</Text>
        <Text>{`${MODO_ICONO[politica.modo]} ${politica.motivo}`}</Text>
        {!overrides.activo && <Text color="yellow">Router apagado: /router on para prenderlo</Text>}
      </Box>
      <Box flexDirection="column">
        <Text bold>EN CURSO</Text>
        {activos.length === 0 && <Text dimColor>Sin subagentes corriendo.</Text>}
        {activos.map(s => (
          <Box key={s.agentId} flexDirection="column">
            <Text bold={s.reasignado}>{`▶ ${s.descripcion} · ${s.tipo ?? '—'} · ${s.pedido} → ${s.elegido}`}</Text>
            {conMotivos && <Text dimColor>{`    ${s.motivos.join(' · ')}`}</Text>}
          </Box>
        ))}
      </Box>
      <Box flexDirection="column">
        <Text bold>POR TAREA</Text>
        {tareas.length === 0 && <Text dimColor>Ningún subagente nombró una tarea todavía.</Text>}
        {tareas.map(t => (
          <Text key={t.tarea}>
            {`${t.tarea} · ${t.pasos.map(p => `${p.tipo ?? '?'} ${p.terminado ? '✓' : '▶'}`).join(' → ')} · ${t.rondas} rondas · ${t.minutos}m`}
          </Text>
        ))}
      </Box>
      {(overrides.permitidos || fijados.length > 0) && (
        <Box flexDirection="column">
          <Text bold>OVERRIDES</Text>
          {overrides.permitidos && <Text>{`permitir: ${overrides.permitidos.join(',')}`}</Text>}
          {fijados.map(f => <Text key={f}>{`fijar ${f}`}</Text>)}
        </Box>
      )}
    </Box>
  )
}
