export type Canal = 'whatsapp' | 'telegram' | 'webchat'

/** Mensagem de qualquer canal no formato interno: o resto do sistema não conhece os formatos externos. */
export interface MensagemRecebida {
  canal: Canal
  /** Identificador da mensagem no canal; garante que reenvios do webhook não sejam processados duas vezes. */
  idExterno: string | null
  contato: { id: string; nome: string | null }
  tipo: 'texto' | 'midia'
  texto: string
}
