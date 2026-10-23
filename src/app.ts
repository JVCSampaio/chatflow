import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import express, { type ErrorRequestHandler, type RequestHandler } from 'express'
import { ObjectId } from 'mongodb'
import type { Logger } from 'pino'
import { pinoHttp } from 'pino-http'
import { z } from 'zod'
import { ErroDeAtendimento, type Atendimento } from './atendimento.ts'
import { lerTelegram, segredoValido } from './canais/telegram.ts'
import type { MensagemRecebida } from './canais/tipos.ts'
import { lerWebchat } from './canais/webchat.ts'
import { assinaturaValida, lerWhatsapp } from './canais/whatsapp.ts'
import type { Config } from './config.ts'
import type { Metricas } from './metricas.ts'
import type { Conversa, Mensagem, Repositorio } from './repositorio.ts'

z.config(z.locales.pt())

export interface Aplicacao {
  config: Config
  repositorio: Repositorio
  atendimento: Atendimento
  log: Logger
  metricas: Metricas
}

const PASTA_WEB = fileURLToPath(new URL('../web/dist', import.meta.url))

const ObjectIdHex = z
  .string()
  .regex(/^[0-9a-f]{24}$/, 'Identificador inválido.')
  .transform((id) => new ObjectId(id))
const Atendente = z.string().trim().min(2).max(60)
const CorpoDoAtendente = z.strictObject({ atendente: Atendente })
const RespostaDoAtendente = z.strictObject({ atendente: Atendente, texto: z.string().trim().min(1).max(1000) })
const FiltroDeConversas = z.strictObject({
  status: z.enum(['bot', 'aguardando', 'em_atendimento', 'encerrada']).optional(),
  canal: z.enum(['whatsapp', 'telegram', 'webchat']).optional(),
  contato: z.string().max(100).optional(),
  atendente: z.string().max(60).optional(),
})
const Acompanhamento = z.strictObject({ depois: ObjectIdHex.optional() })

const paraApi = {
  conversa: (c: Conversa) => ({
    id: c._id.toHexString(),
    canal: c.canal,
    contato: c.contato,
    status: c.status,
    atendente: c.atendente,
    transferencia: c.transferencia,
    criadaEm: c.criadaEm,
    atualizadaEm: c.atualizadaEm,
    encerradaEm: c.encerradaEm,
  }),
  mensagem: (m: Mensagem) => ({
    id: m._id.toHexString(),
    conversaId: m.conversaId.toHexString(),
    autor: m.autor,
    atendente: m.atendente,
    texto: m.texto,
    criadaEm: m.criadaEm,
  }),
}

export function criarApp({ config, repositorio, atendimento, log, metricas }: Aplicacao) {
  const app = express()
  app.disable('x-powered-by')
  app.use(registrarRequisicoes(log))
  app.use(medirDuracao(metricas))
  app.use((_req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' })
    next()
  })

  async function processar(mensagens: MensagemRecebida[]) {
    let recebidas = 0
    let duplicadas = 0
    for (const mensagem of mensagens) {
      if ((await atendimento.receber(mensagem)).duplicada) duplicadas++
      else recebidas++
    }
    return { recebidas, duplicadas }
  }

  // ---------- Saúde e observabilidade ----------

  app.get('/health', async (_req, res) => {
    try {
      await repositorio.ping()
      res.json({ status: 'ok', banco: 'ok' })
    } catch {
      res.status(503).json({ status: 'erro', banco: 'indisponível' })
    }
  })

  app.get('/metrics', async (_req, res) => {
    res.type(metricas.registro.contentType).send(await metricas.registro.metrics())
  })

  // ---------- Canais ----------

  // Verificação do webhook pela Meta: devolve o desafio se o token conferir.
  app.get('/webhooks/whatsapp', (req, res) => {
    const { 'hub.mode': modo, 'hub.verify_token': token, 'hub.challenge': desafio } = req.query
    if (modo === 'subscribe' && token === config.WHATSAPP_VERIFY_TOKEN && /^\d+$/.test(String(desafio))) {
      res.type('text/plain').send(String(desafio))
      return
    }
    res.status(403).json({ erro: 'Token de verificação inválido.' })
  })

  app.post('/webhooks/whatsapp', express.raw({ type: () => true, limit: '256kb' }), async (req, res) => {
    const corpo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
    if (!assinaturaValida(corpo, req.get('x-hub-signature-256'), config.WHATSAPP_APP_SECRET)) {
      req.log.warn({ canal: 'whatsapp' }, 'assinatura_invalida')
      res.status(401).json({ erro: 'Assinatura inválida.' })
      return
    }
    let payload: unknown
    try {
      payload = JSON.parse(corpo.toString('utf8'))
    } catch {
      res.status(400).json({ erro: 'JSON inválido.' })
      return
    }
    res.json(await processar(lerWhatsapp(payload)))
  })

  const conferirSegredoDoTelegram: RequestHandler = (req, res, next) => {
    if (segredoValido(req.get('x-telegram-bot-api-secret-token'), config.TELEGRAM_SECRET_TOKEN)) return next()
    req.log.warn({ canal: 'telegram' }, 'segredo_invalido')
    res.status(401).json({ erro: 'Token secreto inválido.' })
  }

  app.post('/webhooks/telegram', conferirSegredoDoTelegram, express.json({ limit: '256kb' }), async (req, res) => {
    res.json(await processar(lerTelegram(req.body)))
  })

  app.post('/api/webchat/mensagens', express.json({ limit: '16kb' }), async (req, res) => {
    const { duplicada, conversa, mensagens } = await atendimento.receber(lerWebchat(req.body))
    res.json({ duplicada, conversa: paraApi.conversa(conversa), mensagens: mensagens.map(paraApi.mensagem) })
  })

  // O widget consulta periodicamente as mensagens novas da sessão (respostas do atendente).
  app.get('/api/webchat/:sessao/mensagens', async (req, res) => {
    const sessao = z.uuid().parse(req.params.sessao)
    const { depois } = Acompanhamento.parse(req.query)
    const [conversa, mensagens] = await Promise.all([
      repositorio.ultimaConversa('webchat', sessao),
      repositorio.mensagensDoContato('webchat', sessao, depois),
    ])
    res.json({ conversa: conversa && paraApi.conversa(conversa), mensagens: mensagens.map(paraApi.mensagem) })
  })

  // ---------- Console do atendente ----------

  app.get('/api/conversas', async (req, res) => {
    const conversas = await repositorio.listarConversas(FiltroDeConversas.parse(req.query))
    res.json({ itens: conversas.map(paraApi.conversa) })
  })

  app.get('/api/conversas/:id', async (req, res) => {
    const id = ObjectIdHex.parse(req.params.id)
    const conversa = await repositorio.buscarConversa(id)
    if (!conversa) throw new ErroDeAtendimento(404, 'Conversa não encontrada.')
    const mensagens = await repositorio.historico(id)
    res.json({ conversa: paraApi.conversa(conversa), mensagens: mensagens.map(paraApi.mensagem) })
  })

  app.post('/api/conversas/:id/assumir', express.json(), async (req, res) => {
    const id = ObjectIdHex.parse(req.params.id)
    const { atendente } = CorpoDoAtendente.parse(req.body)
    res.json(paraApi.conversa(await atendimento.assumir(id, atendente)))
  })

  app.post('/api/conversas/:id/mensagens', express.json({ limit: '16kb' }), async (req, res) => {
    const id = ObjectIdHex.parse(req.params.id)
    const { atendente, texto } = RespostaDoAtendente.parse(req.body)
    res.status(201).json(paraApi.mensagem(await atendimento.responder(id, atendente, texto)))
  })

  app.post('/api/conversas/:id/encerrar', express.json(), async (req, res) => {
    const id = ObjectIdHex.parse(req.params.id)
    const { atendente } = CorpoDoAtendente.parse(req.body)
    res.json(paraApi.conversa(await atendimento.encerrar(id, atendente)))
  })

  // ---------- Interface (webchat em / e console em /atendente) ----------

  app.use(express.static(PASTA_WEB, { extensions: ['html'] }))
  app.use((_req, res) => {
    res.status(404).json({ erro: 'Rota não encontrada.' })
  })
  app.use(tratarErros)
  return app
}

/** Log por requisição com id de correlação (cabeçalho X-Request-Id, recebido ou gerado). */
function registrarRequisicoes(log: Logger) {
  return pinoHttp({
    logger: log,
    genReqId: (req, res) => {
      const recebido = req.headers['x-request-id']
      const id = typeof recebido === 'string' && /^[\w-]{1,100}$/.test(recebido) ? recebido : randomUUID()
      res.setHeader('X-Request-Id', id)
      return id
    },
    // Sem cabeçalhos nem query string: evitam vazar assinaturas e o token de verificação.
    serializers: {
      req: (req) => ({ id: req.id, metodo: req.method, rota: String(req.url).split('?')[0] }),
      res: (res) => ({ status: res.statusCode }),
    },
    autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/metrics' },
    customSuccessMessage: () => 'requisicao_concluida',
    customErrorMessage: () => 'requisicao_com_erro',
  })
}

function medirDuracao(metricas: Metricas): RequestHandler {
  return (req, res, next) => {
    const terminar = metricas.duracao.startTimer({ metodo: req.method })
    res.on('finish', () => {
      const rota = req.route ? `${req.baseUrl}${req.route.path}` : 'outras'
      terminar({ rota, status: res.statusCode })
    })
    next()
  }
}

const tratarErros: ErrorRequestHandler = (erro, req, res, _next) => {
  if (erro instanceof z.ZodError) {
    const detalhes = erro.issues.map((i) => ({ campo: i.path.join('.') || '(corpo)', mensagem: i.message }))
    res.status(400).json({ erro: 'Dados inválidos.', detalhes })
  } else if (erro instanceof ErroDeAtendimento) {
    res.status(erro.status).json({ erro: erro.message })
  } else if (erro?.type === 'entity.parse.failed') {
    res.status(400).json({ erro: 'JSON inválido.' })
  } else if (erro?.type === 'entity.too.large') {
    res.status(413).json({ erro: 'Conteúdo grande demais.' })
  } else {
    req.log.error({ err: erro }, 'erro_inesperado')
    res.status(500).json({ erro: 'Erro interno. Tente novamente.' })
  }
}
