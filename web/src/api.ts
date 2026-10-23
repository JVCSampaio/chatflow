export type Status = 'bot' | 'aguardando' | 'em_atendimento' | 'encerrada'
export type Canal = 'whatsapp' | 'telegram' | 'webchat'

export interface Conversa {
  id: string
  canal: Canal
  contato: { id: string; nome: string | null }
  status: Status
  atendente: string | null
  transferencia: { motivo: string; foraDoExpediente: boolean; em: string } | null
  criadaEm: string
}

export interface Mensagem {
  id: string
  conversaId: string
  autor: 'cliente' | 'bot' | 'atendente'
  atendente: string | null
  texto: string
  criadaEm: string
}

export async function pedir<T>(url: string, opcoes: RequestInit = {}): Promise<T> {
  let resposta: Response
  try {
    resposta = await fetch(url, { ...opcoes, headers: { 'Content-Type': 'application/json', ...opcoes.headers } })
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.')
  }
  const corpo = await resposta.json().catch(() => null)
  if (!resposta.ok) throw new Error(corpo?.erro ?? 'Não foi possível concluir. Tente de novo.')
  return corpo as T
}

export const enviar = <T>(url: string, corpo: object) => pedir<T>(url, { method: 'POST', body: JSON.stringify(corpo) })

/** Protocolo exibido ao cliente e ao atendente para identificar a conversa. */
export const protocolo = (conversaId: string) => `#${conversaId.slice(-6).toUpperCase()}`

export const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Junta mensagens novas às atuais sem repetir (o envio e a consulta periódica podem trazer a mesma). */
export const juntar = (atuais: Mensagem[], novas: Mensagem[]) => {
  const ids = new Set(atuais.map((m) => m.id))
  return [...atuais, ...novas.filter((m) => !ids.has(m.id))]
}
