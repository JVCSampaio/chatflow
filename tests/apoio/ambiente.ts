// Monta a aplicação real (rotas, serviço, MongoDB) com relógio controlado e logs capturados em memória.
// Usado pelos testes de API (Vitest) e pelos cenários BDD (Cucumber).
import { randomUUID } from 'node:crypto'
import { Writable } from 'node:stream'
import { MongoClient } from 'mongodb'
import request from 'supertest'
import { criarApp } from '../../src/app.ts'
import { Atendimento } from '../../src/atendimento.ts'
import { lerExpediente } from '../../src/bot/expediente.ts'
import { lerConfig } from '../../src/config.ts'
import { criarLogger } from '../../src/logger.ts'
import { criarMetricas } from '../../src/metricas.ts'
import { Repositorio } from '../../src/repositorio.ts'

/** Sexta-feira, 23/10/2026, 10:00 em Brasília: dentro do expediente padrão. */
export const SEXTA_10H = new Date('2026-10-23T13:00:00Z')

export async function criarAmbiente(mongoUrl: string, env: Record<string, string> = {}) {
  const cliente = await MongoClient.connect(mongoUrl)
  const db = cliente.db(`chatflow_teste_${randomUUID().slice(0, 8)}`)
  const repositorio = new Repositorio(db)
  await repositorio.preparar()

  const linhas: string[] = []
  const destino = new Writable({
    write(pedaco, _codificacao, pronto) {
      linhas.push(String(pedaco))
      pronto()
    },
  })
  const config = lerConfig({ LOG_LEVEL: 'info', ...env })
  const log = criarLogger(config.LOG_LEVEL, destino)
  const metricas = criarMetricas()
  const relogio = { agora: SEXTA_10H }
  const expediente = lerExpediente(config.ATENDIMENTO_DIAS, config.ATENDIMENTO_HORARIO, config.FUSO_HORARIO)
  const atendimento = new Atendimento({ repositorio, expediente, relogio: () => relogio.agora, log, metricas })
  const app = criarApp({ config, repositorio, atendimento, log, metricas })

  return {
    api: request(app),
    config,
    repositorio,
    metricas,
    relogio,
    /** Tudo o que foi escrito no log até agora. */
    logs: () => linhas.join(''),
    async encerrar() {
      await db.dropDatabase()
      await cliente.close()
    },
  }
}

export type Ambiente = Awaited<ReturnType<typeof criarAmbiente>>
