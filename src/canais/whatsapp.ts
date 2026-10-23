// Webhook no formato da WhatsApp Cloud API (Meta), reduzido aos campos usados aqui.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { MensagemRecebida } from './tipos.ts'

const Mensagem = z.object({
  from: z.string().min(1),
  id: z.string().min(1),
  timestamp: z.string().regex(/^\d+$/),
  type: z.string().min(1),
  text: z.object({ body: z.string() }).optional(),
})

const Payload = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z
    .array(
      z.object({
        id: z.string(),
        changes: z.array(
          z.object({
            field: z.string(),
            value: z.object({
              messaging_product: z.literal('whatsapp'),
              contacts: z
                .array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).optional() }))
                .optional(),
              messages: z.array(Mensagem).optional(),
              // Confirmações de entrega e leitura chegam aqui e são ignoradas.
              statuses: z.array(z.unknown()).optional(),
            }),
          }),
        ),
      }),
    )
    .min(1),
})

/** Confere o cabeçalho X-Hub-Signature-256: HMAC-SHA256 do corpo bruto com o segredo do app. */
export function assinaturaValida(corpoBruto: Buffer, cabecalho: string | undefined, segredo: string) {
  if (!cabecalho?.startsWith('sha256=')) return false
  const esperada = createHmac('sha256', segredo).update(corpoBruto).digest()
  const recebida = Buffer.from(cabecalho.slice('sha256='.length), 'hex')
  return recebida.length === esperada.length && timingSafeEqual(recebida, esperada)
}

export function lerWhatsapp(corpo: unknown): MensagemRecebida[] {
  const payload = Payload.parse(corpo)
  return payload.entry
    .flatMap((entrada) => entrada.changes)
    .filter((mudanca) => mudanca.field === 'messages')
    .flatMap(({ value }) => {
      const nomes = new Map(value.contacts?.map((c) => [c.wa_id, c.profile?.name ?? null]))
      return (value.messages ?? []).map((m): MensagemRecebida => ({
        canal: 'whatsapp',
        idExterno: m.id,
        contato: { id: m.from, nome: nomes.get(m.from) ?? null },
        tipo: m.type === 'text' ? 'texto' : 'midia',
        texto: m.text?.body ?? '',
      }))
    })
}
