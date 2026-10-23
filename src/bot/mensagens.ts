import { mascararEmail } from '../privacidade.ts'
import type { Fatura } from './clientes.ts'

export const BOAS_VINDAS = 'Olá! Sou o assistente virtual do atendimento.'
export const MENU =
  'Escolha uma opção:\n1 - Segunda via da fatura\n2 - Internet lenta ou sem conexão\n3 - Falar com um atendente'
export const OPCAO_INVALIDA = 'Não entendi. Responda com 1, 2 ou 3.'

export const PEDIR_CPF = 'Para enviar a segunda via, informe o CPF do titular.'
export const CPF_INVALIDO = 'CPF inválido. Confira os 11 números e envie de novo.'
export const CPF_NAO_ENCONTRADO = 'Não encontrei contrato com esse CPF. Confira os números e envie de novo.'
export const SEM_FATURA = 'Você não tem faturas em aberto.'

// O Intl separa "R$" do valor com espaço não separável (U+00A0); a mensagem usa espaço comum.
const moeda = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor).replace(/ /g, ' ')
const data = (iso: string) => iso.split('-').reverse().join('/')

export const segundaVia = (fatura: Fatura, email: string) =>
  `Encontrei a fatura de ${fatura.referencia}: ${moeda(fatura.valor)}, com vencimento em ` +
  `${data(fatura.vencimento)}. Enviei a segunda via para ${mascararEmail(email)}.`

export const REINICIAR_MODEM =
  'Vamos tentar resolver: desligue o modem da tomada, espere 30 segundos e ligue de novo. ' +
  'Depois de 2 minutos, a internet voltou? Responda SIM ou NÃO.'
export const SIM_OU_NAO = 'Responda SIM ou NÃO, por favor.'
export const CONEXAO_VOLTOU = 'Que bom que a conexão voltou!'

export const POSSO_AJUDAR = 'Posso ajudar em algo mais? Envie MENU para ver as opções ou SAIR para encerrar.'
export const DESPEDIDA = 'Atendimento encerrado. Obrigado pelo contato!'
export const ENCERRADA_PELO_ATENDENTE = 'O atendente encerrou a conversa. Obrigado pelo contato!'
export const SO_TEXTO = 'Por enquanto só consigo ler mensagens de texto. Pode escrever sua dúvida?'

export const MOTIVO_DA_TRANSFERENCIA = {
  pedido_do_cliente: null,
  nao_entendeu: 'Vou chamar um atendente para ajudar você.',
  cpf_invalido: 'Não consegui confirmar o CPF. Vou chamar um atendente para ajudar você.',
  suporte_tecnico: 'Vou chamar o suporte técnico para verificar sua conexão.',
} as const

export const NA_FILA = 'Você está na fila. Um atendente vai continuar esta conversa em instantes.'
export const foraDoExpediente = (expediente: string) =>
  `Nosso atendimento humano funciona ${expediente}. Sua mensagem ficou registrada e um atendente ` +
  'responde assim que o expediente começar.'
