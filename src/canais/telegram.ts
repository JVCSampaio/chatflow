// Webhook no formato de Update da Telegram Bot API, reduzido aos campos usados aqui.
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { MensagemRecebida } from './tipos.ts'

const Update = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      message_id: z.number().int(),
      from: z.object({ id: z.number().int(), first_name: z.string().optional() }).optional(),
      chat: z.object({ id: z.number().int() }),
      date: z.number().int(),
      text: z.string().optional(),
    })
    .optional(),
})

/** Confere o cabeçalho X-Telegram-Bot-Api-Secret-Token definido ao registrar o webhook. */
export function segredoValido(cabecalho: string | undefined, segredo: string) {
  if (!cabecalho) return false
  const recebido = Buffer.from(cabecalho)
  const esperado = Buffer.from(segredo)
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado)
}

export function lerTelegram(corpo: unknown): MensagemRecebida[] {
  const { update_id, message } = Update.parse(corpo)
  // Edições, botões e outros tipos de update não são mensagens novas do cliente.
  if (!message) return []
  return [
    {
      canal: 'telegram',
      idExterno: String(update_id),
      contato: { id: String(message.chat.id), nome: message.from?.first_name ?? null },
      tipo: message.text === undefined ? 'midia' : 'texto',
      texto: message.text ?? '',
    },
  ]
}
