import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { criarAmbiente, type Ambiente } from '../apoio/ambiente.ts'
import { enviarWebchat, novaSessao } from '../apoio/canais.ts'

describe('com o banco fora do ar', () => {
  let ambiente: Ambiente
  beforeAll(async () => {
    ambiente = await criarAmbiente(inject('mongoUrl'))
    await ambiente.encerrar() // apaga o banco do teste e fecha a conexão
  })

  it('/health responde 503', async () => {
    const resposta = await ambiente.api.get('/health').expect(503)
    expect(resposta.body).toEqual({ status: 'erro', banco: 'indisponível' })
  })

  it('a API responde 500 genérico, sem detalhes internos, e registra o erro com o id da requisição', async () => {
    const resposta = await enviarWebchat(ambiente, novaSessao(), 'oi').set('X-Request-Id', 'falha-1').expect(500)
    expect(resposta.body).toEqual({ erro: 'Erro interno. Tente novamente.' })
    const erro = ambiente
      .logs()
      .trim()
      .split('\n')
      .map((linha) => JSON.parse(linha))
      .find((linha) => linha.msg === 'erro_inesperado')
    expect(erro).toMatchObject({ level: 50, req: { id: 'falha-1' } })
  })
})

describe('várias instâncias da aplicação no mesmo banco', () => {
  let ambiente: Ambiente
  beforeAll(async () => {
    ambiente = await criarAmbiente(inject('mongoUrl'))
  })
  afterAll(() => ambiente.encerrar())

  it('primeiras mensagens simultâneas do mesmo contato criam uma única conversa', async () => {
    // Sem a fila por contato (que vale dentro de um processo), quem garante é o índice único parcial.
    const contato = { id: '5532988887777', nome: 'Ana' }
    const conversas = await Promise.all(
      Array.from({ length: 8 }, () => ambiente.repositorio.conversaAberta('whatsapp', contato, new Date())),
    )
    expect(new Set(conversas.map((c) => c._id.toHexString())).size).toBe(1)
    expect(await ambiente.repositorio.conversas.countDocuments({ 'contato.id': contato.id })).toBe(1)
  })
})
