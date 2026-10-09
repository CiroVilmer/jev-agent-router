export type Tipo =
  | 'review-final'
  | 'review'
  | 're-review'
  | 'build-large'
  | 'build-small'
  | 'fix'
  | 'explore'
  | 'research'
  | 'write'

export type Modelo = 'haiku' | 'sonnet' | 'opus'

export type Esfuerzo = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Un punto de la escalera: modelo y esfuerzo. Solo falta el esfuerzo en escalones de Haiku guardados antes de la fase 5. */
export type Escalon = { modelo: Modelo; esfuerzo?: Esfuerzo }

/** Lo que el usuario fijó con /router durante la sesión. */
export type Overrides = {
  activo: boolean
  permitidos: Modelo[] | null
  fijados: Partial<Record<Tipo, Escalon>>
}

/** La ventana de 5 horas como la reportó session.measure. */
export type LecturaUso = { usado: number; resetsAt: string }

/** Un subagente lanzado en la sesión y lo que decidió el router. */
export type Subagente = {
  agentId: string
  descripcion: string
  tarea: string | null
  tipo: Tipo | null
  pedido: string
  /**
   * El modelo con el que corre de verdad: `model` del spawn o, si hereda, el del padre. Puede
   * faltar en un subagente registrado antes de que existiera el campo.
   */
  modeloEfectivo?: string
  elegido: string
  escalon: Escalon | null
  motivos: string[]
  reasignado: boolean
  inicio: number
  fin: number | null
  /**
   * El modo de la política de 5 h al momento del spawn (el `Modo` de src/politica.ts). Falta en
   * un subagente registrado antes de que existiera el campo, o si leer la política falló.
   */
  modo?: 'fuego' | 'sobra' | 'normal'
  /** El `tool_use_id` de la llamada a Agent que lo lanzó: une el spawn con su `tool.call`. */
  toolUseId?: string
}

export type Pestana = 'curso' | 'metricas' | 'historial'

declare module 'claude-code' {
  interface PluginState {
    'agent-router': {
      subagentes: Subagente[]
      overrides: Overrides
      lectura: LecturaUso | null
      pestana: Pestana
    }
  }
}
