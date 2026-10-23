// Construtores de payloads no formato de cada canal e envio assinado pelos webhooks.
import { createHmac, randomUUID } from 'node:crypto'
import type { Ambiente } from './ambiente.ts'

export const SEGREDO_WHATSAPP = 'segredo-de-desenvolvimento'
export const TOKEN_DE_VERIFICACAO = 'token-de-verificacao'
export const SEGREDO_TELEGRAM = 'segredo-telegram'

type Conteudo = { type: 'text'; text: { body: string } } | { type: 'audio' | 'image'; [campo: string]: unknown }

export function whatsapp(de: string, conteudo: Conteudo | string, id = `wamid.${randomUUID()}`, nome = 'Ana') {
  const mensagem = typeof conteudo === 'string' ? { type: 'text', text: { body: conteudo } } : conteudo
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '102290129340398',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '553230000000', phone_number_id: '106540352242922' },
              contacts: [{ profile: { name: nome }, wa_id: de }],
              messages: [{ from: de, id, timestamp: '1792760400', ...mensagem }],
            },
          },
        ],
      },
    ],
  }
}

/** Confirmação de entrega/leitura: chega no mesmo webhook, sem mensagem nova. */
export const whatsappStatus = (de: string) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '102290129340398',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            statuses: [{ id: `wamid.${randomUUID()}`, status: 'read', timestamp: '1792760460', recipient_id: de }],
          },
        },
      ],
    },
  ],
})

export const assinar = (corpo: string, segredo = SEGREDO_WHATSAPP) =>
  `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`

export function enviarWhatsapp(ambiente: Ambiente, payload: object, assinatura?: string) {
  const corpo = JSON.stringify(payload)
  return ambiente.api
    .post('/webhooks/whatsapp')
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', assinatura ?? assinar(corpo))
    .send(corpo)
}

export const telegram = (chatId: number, texto: string | undefined, updateId: number, nome = 'Bruno') => ({
  update_id: updateId,
  message: {
    message_id: updateId,
    from: { id: chatId, is_bot: false, first_name: nome },
    chat: { id: chatId, type: 'private' },
    date: 1792760400,
    ...(texto === undefined ? { photo: [{ file_id: 'AgAC', width: 90, height: 90 }] } : { text: texto }),
  },
})

export const enviarTelegram = (ambiente: Ambiente, update: object, segredo = SEGREDO_TELEGRAM) =>
  ambiente.api.post('/webhooks/telegram').set('X-Telegram-Bot-Api-Secret-Token', segredo).send(update)

export const enviarWebchat = (ambiente: Ambiente, sessao: string, texto: string, id?: string) =>
  ambiente.api.post('/api/webchat/mensagens').send({ sessao, texto, ...(id && { id }) })

/** Conversa mais recente do contato no canal, com o histórico completo. */
export async function historicoDo(ambiente: Ambiente, canal: string, contato: string) {
  const { body } = await ambiente.api.get('/api/conversas').query({ canal, contato }).expect(200)
  if (!body.itens.length) throw new Error(`Nenhuma conversa de ${contato} no canal ${canal}`)
  const detalhe = await ambiente.api.get(`/api/conversas/${body.itens[0].id}`).expect(200)
  return detalhe.body as {
    conversa: { id: string; status: string; atendente: string | null; transferencia: Record<string, unknown> | null }
    mensagens: { id: string; autor: string; texto: string }[]
  }
}

/** Valor atual de um contador em /metrics (0 se ainda não existe). */
export async function metrica(ambiente: Ambiente, nome: string, rotulos: string) {
  const { text } = await ambiente.api.get('/metrics').expect(200)
  const linha = text.split(/\r?\n/).find((l: string) => l.startsWith(`${nome}{${rotulos}} `))
  return linha ? Number(linha.split(' ').at(-1)) : 0
}

/** Telefones e sessões únicos: cada teste conversa com um contato novo. */
export const novoTelefone = () => `5532${String(Math.floor(Math.random() * 1e9)).padStart(9, '9')}`
export const novaSessao = () => randomUUID()
