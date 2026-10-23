import { Counter, Histogram, Registry, collectDefaultMetrics } from '@prometheus-io/client'

// Registro próprio por aplicação: cada teste começa com os contadores zerados.
export function criarMetricas({ padrao = false } = {}) {
  const registro = new Registry()
  if (padrao) collectDefaultMetrics({ register: registro, prefix: 'chatflow_' })
  const registers = [registro]
  return {
    registro,
    recebidas: new Counter({
      name: 'chatflow_mensagens_recebidas_total',
      help: 'Mensagens de clientes processadas, por canal.',
      labelNames: ['canal'],
      registers,
    }),
    duplicadas: new Counter({
      name: 'chatflow_mensagens_duplicadas_total',
      help: 'Reenvios de webhook ignorados pela idempotência, por canal.',
      labelNames: ['canal'],
      registers,
    }),
    transferencias: new Counter({
      name: 'chatflow_transferencias_total',
      help: 'Conversas passadas do bot para a fila de atendentes, por motivo.',
      labelNames: ['motivo'],
      registers,
    }),
    encerradas: new Counter({
      name: 'chatflow_conversas_encerradas_total',
      help: 'Conversas encerradas, por quem encerrou.',
      labelNames: ['por'],
      registers,
    }),
    duracao: new Histogram({
      name: 'chatflow_http_duracao_segundos',
      help: 'Duração das requisições HTTP.',
      labelNames: ['metodo', 'rota', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers,
    }),
  }
}

export type Metricas = ReturnType<typeof criarMetricas>
