import { z } from 'zod'
import type { MensagemRecebida } from './tipos.ts'

const Corpo = z.strictObject({
  sessao: z.uuid(),
  texto: z.string().trim().min(1).max(1000),
  /** Gerado pelo widget a cada mensagem: um reenvio após falha de rede não duplica a mensagem. */
  id: z.uuid().optional(),
})

export function lerWebchat(corpo: unknown): MensagemRecebida {
  const { sessao, texto, id } = Corpo.parse(corpo)
  return { canal: 'webchat', idExterno: id ?? null, contato: { id: sessao, nome: null }, tipo: 'texto', texto }
}
