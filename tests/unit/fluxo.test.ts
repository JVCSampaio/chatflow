import { describe, expect, it } from 'vitest'
import { lerExpediente } from '../../src/bot/expediente.ts'
import { decidir, ESTADO_INICIAL, type Entrada, type Etapa } from '../../src/bot/fluxo.ts'
import * as M from '../../src/bot/mensagens.ts'

const expediente = lerExpediente('1-5', '08:00-18:00', 'America/Sao_Paulo')
const noExpediente = { agora: new Date('2026-10-23T13:00:00Z'), expediente } // sexta, 10:00
const sabado = { agora: new Date('2026-10-24T13:00:00Z'), expediente } // sábado, 10:00

const texto = (t: string): Entrada => ({ tipo: 'texto', texto: t })
const em = (etapa: Etapa, tentativas = 0) => ({ etapa, tentativas })

describe('início e menu', () => {
  it('cumprimenta e mostra o menu na primeira mensagem', () => {
    const decisao = decidir(ESTADO_INICIAL, texto('oi'), noExpediente)
    expect(decisao.estado).toEqual(em('menu'))
    expect(decisao.respostas).toEqual([M.BOAS_VINDAS, M.MENU])
  })

  it.each([
    ['1', 'cpf', M.PEDIR_CPF],
    ['2', 'modem', M.REINICIAR_MODEM],
  ] as const)('opção %s leva à etapa "%s"', (opcao, etapa, resposta) => {
    const decisao = decidir(em('menu'), texto(opcao), noExpediente)
    expect(decisao.estado.etapa).toBe(etapa)
    expect(decisao.respostas).toEqual([resposta])
  })

  it('opção 3 transfere a pedido do cliente', () => {
    const decisao = decidir(em('menu'), texto('3'), noExpediente)
    expect(decisao.transferencia).toEqual({ motivo: 'pedido_do_cliente', foraDoExpediente: false })
    expect(decisao.respostas).toEqual([M.NA_FILA])
  })

  it('conta respostas fora do menu e transfere na terceira seguida', () => {
    const primeira = decidir(em('menu'), texto('quero cancelar'), noExpediente)
    expect(primeira).toMatchObject({ estado: em('menu', 1), respostas: [M.OPCAO_INVALIDA] })
    const segunda = decidir(primeira.estado, texto('4'), noExpediente)
    expect(segunda.estado.tentativas).toBe(2)
    const terceira = decidir(segunda.estado, texto('?'), noExpediente)
    expect(terceira.transferencia?.motivo).toBe('nao_entendeu')
    expect(terceira.respostas[0]).toBe(M.MOTIVO_DA_TRANSFERENCIA.nao_entendeu)
  })
})

describe('comandos que valem em qualquer etapa', () => {
  it.each(['menu', 'MENU', '  Menu  '])('"%s" volta ao menu e zera as tentativas', (comando) => {
    expect(decidir(em('cpf', 2), texto(comando), noExpediente)).toEqual({
      estado: em('menu'),
      respostas: [M.MENU],
    })
  })

  it.each(['sair', 'ENCERRAR'])('"%s" encerra a conversa', (comando) => {
    const decisao = decidir(em('modem'), texto(comando), noExpediente)
    expect(decisao.encerrar).toBe(true)
    expect(decisao.respostas).toEqual([M.DESPEDIDA])
  })

  it.each(['atendente', 'Humano', 'PESSOA'])('"%s" transfere a pedido do cliente', (pedido) => {
    expect(decidir(em('cpf', 1), texto(pedido), noExpediente).transferencia?.motivo).toBe('pedido_do_cliente')
  })

  it('pede texto quando chega áudio ou imagem, sem mudar a etapa', () => {
    const decisao = decidir(em('cpf', 1), { tipo: 'midia', texto: '' }, noExpediente)
    expect(decisao).toEqual({ estado: em('cpf', 1), respostas: [M.SO_TEXTO] })
  })
})

describe('segunda via', () => {
  it('envia a fatura com o e-mail mascarado', () => {
    const decisao = decidir(em('cpf'), texto('123.456.789-09'), noExpediente)
    expect(decisao.estado).toEqual(em('concluido'))
    expect(decisao.respostas).toEqual([
      'Encontrei a fatura de outubro/2026: R$ 99,90, com vencimento em 10/11/2026. ' +
        'Enviei a segunda via para a***@example.com.',
      M.POSSO_AJUDAR,
    ])
  })

  it('avisa quando o cliente não tem fatura em aberto', () => {
    expect(decidir(em('cpf'), texto('11144477735'), noExpediente).respostas[0]).toBe(M.SEM_FATURA)
  })

  it.each([
    ['123.456.789-00', M.CPF_INVALIDO],
    ['987.654.321-00', M.CPF_NAO_ENCONTRADO],
  ])('%s → pede de novo e conta a tentativa', (cpf, resposta) => {
    expect(decidir(em('cpf'), texto(cpf), noExpediente)).toEqual({ estado: em('cpf', 1), respostas: [resposta] })
  })

  it('transfere na terceira tentativa sem CPF confirmado', () => {
    const decisao = decidir(em('cpf', 2), texto('00000000000'), noExpediente)
    expect(decisao.transferencia?.motivo).toBe('cpf_invalido')
  })
})

describe('suporte de conexão', () => {
  it.each(['sim', 'SIM', 's', 'voltou'])('"%s" conclui o atendimento', (resposta) => {
    const decisao = decidir(em('modem'), texto(resposta), noExpediente)
    expect(decisao).toEqual({ estado: em('concluido'), respostas: [M.CONEXAO_VOLTOU, M.POSSO_AJUDAR] })
  })

  it.each(['não', 'NAO', 'n'])('"%s" transfere para o suporte técnico', (resposta) => {
    expect(decidir(em('modem'), texto(resposta), noExpediente).transferencia?.motivo).toBe('suporte_tecnico')
  })

  it('pede SIM ou NÃO para outras respostas', () => {
    expect(decidir(em('modem'), texto('talvez'), noExpediente).respostas).toEqual([M.SIM_OU_NAO])
  })
})

describe('depois de concluir', () => {
  it('qualquer mensagem volta ao menu', () => {
    expect(decidir(em('concluido'), texto('obrigado'), noExpediente)).toEqual({
      estado: em('menu'),
      respostas: [M.MENU],
    })
  })
})

describe('fora do expediente', () => {
  it('transfere, avisa o horário do atendimento humano e marca a conversa', () => {
    const decisao = decidir(em('menu'), texto('3'), sabado)
    expect(decisao.transferencia).toEqual({ motivo: 'pedido_do_cliente', foraDoExpediente: true })
    expect(decisao.respostas).toEqual([M.foraDoExpediente('de segunda a sexta, das 08h às 18h')])
  })
})
