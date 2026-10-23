// Fluxo do chatbot como função pura: (estado, mensagem) -> (novo estado, respostas, transferência?).
// Sem banco nem HTTP, o que permite testar cada transição isoladamente.
import { buscarCliente } from './clientes.ts'
import { cpfValido } from './cpf.ts'
import { dentroDoExpediente, descreverExpediente, type Expediente } from './expediente.ts'
import * as M from './mensagens.ts'

export type Etapa = 'inicio' | 'menu' | 'cpf' | 'modem' | 'concluido'
export type MotivoTransferencia = keyof typeof M.MOTIVO_DA_TRANSFERENCIA

export interface EstadoDoBot {
  etapa: Etapa
  tentativas: number
}

export interface Entrada {
  tipo: 'texto' | 'midia'
  texto: string
}

export interface Contexto {
  agora: Date
  expediente: Expediente
}

export interface Decisao {
  estado: EstadoDoBot
  respostas: string[]
  transferencia?: { motivo: MotivoTransferencia; foraDoExpediente: boolean }
  encerrar?: true
}

export const ESTADO_INICIAL: EstadoDoBot = { etapa: 'inicio', tentativas: 0 }

/** Respostas inválidas seguidas antes de transferir para um atendente. */
export const MAX_TENTATIVAS = 3

const PEDIDOS_DE_ATENDENTE = new Set(['atendente', 'humano', 'pessoa', 'falar com atendente'])

/** Minúsculas e sem acento: "NÃO" e "nao" são a mesma resposta. */
const normalizar = (texto: string) => texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const para = (etapa: Etapa, respostas: string[]): Decisao => ({ estado: { etapa, tentativas: 0 }, respostas })

export function decidir(estado: EstadoDoBot, entrada: Entrada, contexto: Contexto): Decisao {
  if (entrada.tipo === 'midia') return { estado, respostas: [M.SO_TEXTO] }

  const texto = normalizar(entrada.texto)
  if (texto === 'menu') return para('menu', [M.MENU])
  if (texto === 'sair' || texto === 'encerrar') return { estado, respostas: [M.DESPEDIDA], encerrar: true }
  if (PEDIDOS_DE_ATENDENTE.has(texto)) return transferir(estado, 'pedido_do_cliente', contexto)

  switch (estado.etapa) {
    case 'inicio':
      return para('menu', [M.BOAS_VINDAS, M.MENU])
    case 'menu':
      if (texto === '1') return para('cpf', [M.PEDIR_CPF])
      if (texto === '2') return para('modem', [M.REINICIAR_MODEM])
      if (texto === '3') return transferir(estado, 'pedido_do_cliente', contexto)
      return tentarDeNovo(estado, M.OPCAO_INVALIDA, 'nao_entendeu', contexto)
    case 'cpf':
      return segundaVia(estado, entrada.texto, contexto)
    case 'modem':
      if (['sim', 's', 'voltou'].includes(texto)) return para('concluido', [M.CONEXAO_VOLTOU, M.POSSO_AJUDAR])
      if (['nao', 'n'].includes(texto)) return transferir(estado, 'suporte_tecnico', contexto)
      return tentarDeNovo(estado, M.SIM_OU_NAO, 'nao_entendeu', contexto)
    case 'concluido':
      return para('menu', [M.MENU])
  }
}

function segundaVia(estado: EstadoDoBot, texto: string, contexto: Contexto): Decisao {
  if (!cpfValido(texto)) return tentarDeNovo(estado, M.CPF_INVALIDO, 'cpf_invalido', contexto)
  const cliente = buscarCliente(texto)
  if (!cliente) return tentarDeNovo(estado, M.CPF_NAO_ENCONTRADO, 'cpf_invalido', contexto)
  const resposta = cliente.fatura ? M.segundaVia(cliente.fatura, cliente.email) : M.SEM_FATURA
  return para('concluido', [resposta, M.POSSO_AJUDAR])
}

function tentarDeNovo(estado: EstadoDoBot, aviso: string, motivo: MotivoTransferencia, contexto: Contexto) {
  const tentativas = estado.tentativas + 1
  if (tentativas >= MAX_TENTATIVAS) return transferir(estado, motivo, contexto)
  return { estado: { ...estado, tentativas }, respostas: [aviso] }
}

function transferir(estado: EstadoDoBot, motivo: MotivoTransferencia, contexto: Contexto): Decisao {
  const foraDoExpediente = !dentroDoExpediente(contexto.agora, contexto.expediente)
  const aviso = foraDoExpediente ? M.foraDoExpediente(descreverExpediente(contexto.expediente)) : M.NA_FILA
  const introducao = M.MOTIVO_DA_TRANSFERENCIA[motivo]
  return {
    estado: { ...estado, tentativas: 0 },
    respostas: introducao ? [introducao, aviso] : [aviso],
    transferencia: { motivo, foraDoExpediente },
  }
}
