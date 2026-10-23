import { MongoClient } from 'mongodb'
import { criarApp } from './app.ts'
import { Atendimento } from './atendimento.ts'
import { lerExpediente } from './bot/expediente.ts'
import { lerConfig } from './config.ts'
import { criarLogger } from './logger.ts'
import { criarMetricas } from './metricas.ts'
import { Repositorio } from './repositorio.ts'

const config = lerConfig()
const log = criarLogger(config.LOG_LEVEL)

let url = config.MONGO_URL
let emMemoria: { stop(): Promise<unknown> } | undefined
if (!url) {
  // Só para desenvolvimento: sobe um MongoDB temporário (pacote de desenvolvimento).
  const { MongoMemoryServer } = await import('mongodb-memory-server')
  const servidor = await MongoMemoryServer.create()
  emMemoria = servidor
  url = servidor.getUri()
  log.warn('MONGO_URL não definida: usando MongoDB em memória; os dados somem ao encerrar.')
}

const cliente = await MongoClient.connect(url)
const repositorio = new Repositorio(cliente.db(config.MONGO_DB))
await repositorio.preparar()

const metricas = criarMetricas({ padrao: true })
const expediente = lerExpediente(config.ATENDIMENTO_DIAS, config.ATENDIMENTO_HORARIO, config.FUSO_HORARIO)
const atendimento = new Atendimento({ repositorio, expediente, relogio: () => new Date(), log, metricas })
const servidor = criarApp({ config, repositorio, atendimento, log, metricas }).listen(config.PORT, () => {
  log.info({ porta: config.PORT }, `ChatFlow em http://localhost:${config.PORT}`)
})

async function encerrar(sinal: string) {
  log.info({ sinal }, 'encerrando')
  servidor.close()
  await cliente.close()
  await emMemoria?.stop()
  process.exit(0)
}
process.once('SIGINT', () => void encerrar('SIGINT'))
process.once('SIGTERM', () => void encerrar('SIGTERM'))
