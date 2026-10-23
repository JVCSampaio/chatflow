import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import * as M from '../../src/bot/mensagens.ts'
import { criarAmbiente, SEXTA_10H, type Ambiente } from '../apoio/ambiente.ts'
import { enviarWebchat, metrica, novaSessao } from '../apoio/canais.ts'

let ambiente: Ambiente
beforeAll(async () => {
  ambiente = await criarAmbiente(inject('mongoUrl'))
})
afterAll(() => ambiente.encerrar())
beforeEach(() => {
  ambiente.relogio.agora = SEXTA_10H
})

/** Cliente do webchat que pede atendente; devolve o id da conversa na fila. */
async function clienteNaFila(sessao = novaSessao()) {
  await enviarWebchat(ambiente, sessao, 'oi').expect(200)
  const resposta = await enviarWebchat(ambiente, sessao, 'atendente').expect(200)
  return { sessao, id: resposta.body.conversa.id as string, resposta }
}

const assumir = (id: string, atendente: string) => ambiente.api.post(`/api/conversas/${id}/assumir`).send({ atendente })
const responder = (id: string, atendente: string, texto: string) =>
  ambiente.api.post(`/api/conversas/${id}/mensagens`).send({ atendente, texto })
const encerrar = (id: string, atendente: string) =>
  ambiente.api.post(`/api/conversas/${id}/encerrar`).send({ atendente })

describe('transferência para a fila', () => {
  it('pedido de atendente coloca a conversa na fila, com o motivo', async () => {
    const { id, resposta } = await clienteNaFila()
    expect(resposta.body.conversa).toMatchObject({
      status: 'aguardando',
      transferencia: { motivo: 'pedido_do_cliente', foraDoExpediente: false },
    })
    expect(resposta.body.mensagens.at(-1).texto).toBe(M.NA_FILA)
    const fila = await ambiente.api.get('/api/conversas').query({ status: 'aguardando' }).expect(200)
    expect(fila.body.itens.map((c: { id: string }) => c.id)).toContain(id)
  })

  it('a fila começa por quem espera há mais tempo', async () => {
    ambiente.relogio.agora = new Date('2026-10-23T13:05:00Z')
    const primeiro = await clienteNaFila()
    ambiente.relogio.agora = new Date('2026-10-23T13:01:00Z')
    const antes = await clienteNaFila()
    const fila = await ambiente.api.get('/api/conversas').query({ status: 'aguardando' }).expect(200)
    const ids = fila.body.itens.map((c: { id: string }) => c.id)
    expect(ids.indexOf(antes.id)).toBeLessThan(ids.indexOf(primeiro.id))
  })

  it('fora do expediente avisa o horário e marca a conversa', async () => {
    ambiente.relogio.agora = new Date('2026-10-24T13:00:00Z') // sábado, 10h
    const { resposta } = await clienteNaFila()
    expect(resposta.body.conversa.transferencia.foraDoExpediente).toBe(true)
    expect(resposta.body.mensagens.at(-1).texto).toBe(M.foraDoExpediente('de segunda a sexta, das 08h às 18h'))
  })

  it('o bot fica em silêncio enquanto o cliente espera', async () => {
    const { sessao } = await clienteNaFila()
    const resposta = await enviarWebchat(ambiente, sessao, 'alguém aí?').expect(200)
    expect(resposta.body.mensagens.map((m: { autor: string }) => m.autor)).toEqual(['cliente'])
  })
})

describe('POST /api/conversas/:id/assumir', () => {
  it('passa a conversa para o atendente', async () => {
    const { id } = await clienteNaFila()
    const resposta = await assumir(id, 'Marina').expect(200)
    expect(resposta.body).toMatchObject({ id, status: 'em_atendimento', atendente: 'Marina' })
  })

  it('dois atendentes ao mesmo tempo: só um assume', async () => {
    const { id } = await clienteNaFila()
    const respostas = await Promise.all([assumir(id, 'Marina'), assumir(id, 'Paulo')])
    expect(respostas.map((r) => r.status).sort()).toEqual([200, 409])
    const vencedor = respostas.find((r) => r.status === 200)!.body.atendente
    expect(respostas.find((r) => r.status === 409)!.body.erro).toBe(`Esta conversa já está com ${vencedor}.`)
  })

  it('409 para conversa que ainda está com o bot', async () => {
    const resposta = await enviarWebchat(ambiente, novaSessao(), 'oi').expect(200)
    const recusa = await assumir(resposta.body.conversa.id, 'Marina').expect(409)
    expect(recusa.body.erro).toBe('Esta conversa não está aguardando atendente.')
  })

  it.each([
    ['id inválido', 'abc', { atendente: 'Marina' }, 400],
    ['conversa inexistente', '64b7f0f0f0f0f0f0f0f0f0f0', { atendente: 'Marina' }, 404],
    ['nome do atendente vazio', '64b7f0f0f0f0f0f0f0f0f0f0', { atendente: ' ' }, 400],
  ])('%s → %i', async (_caso, id, corpo, status) => {
    await ambiente.api.post(`/api/conversas/${id}/assumir`).send(corpo).expect(status)
  })
})

describe('POST /api/conversas/:id/mensagens', () => {
  it('o atendente responsável responde e o cliente recebe pelo webchat', async () => {
    const { id, sessao } = await clienteNaFila()
    await assumir(id, 'Marina').expect(200)
    const enviada = await responder(id, 'Marina', 'Olá! Sou a Marina, como posso ajudar?').expect(201)
    expect(enviada.body).toMatchObject({ autor: 'atendente', atendente: 'Marina', conversaId: id })

    const novas = await ambiente.api.get(`/api/webchat/${sessao}/mensagens`).expect(200)
    expect(novas.body.conversa).toMatchObject({ status: 'em_atendimento', atendente: 'Marina' })
    expect(novas.body.mensagens.at(-1)).toMatchObject({
      autor: 'atendente',
      texto: 'Olá! Sou a Marina, como posso ajudar?',
    })
  })

  it('403 para outro atendente', async () => {
    const { id } = await clienteNaFila()
    await assumir(id, 'Marina').expect(200)
    const recusa = await responder(id, 'Paulo', 'Oi').expect(403)
    expect(recusa.body.erro).toBe('Esta conversa está com Marina.')
  })

  it('409 antes de assumir a conversa', async () => {
    const { id } = await clienteNaFila()
    const recusa = await responder(id, 'Marina', 'Oi').expect(409)
    expect(recusa.body.erro).toBe('Assuma a conversa antes de responder.')
  })

  it('400 para resposta vazia', async () => {
    const { id } = await clienteNaFila()
    await assumir(id, 'Marina').expect(200)
    await responder(id, 'Marina', '   ').expect(400)
  })
})

describe('POST /api/conversas/:id/encerrar', () => {
  it('encerra, avisa o cliente e a próxima mensagem abre outra conversa', async () => {
    const { id, sessao } = await clienteNaFila()
    await assumir(id, 'Marina').expect(200)
    const encerradasAntes = await metrica(ambiente, 'chatflow_conversas_encerradas_total', 'por="atendente"')

    const resposta = await encerrar(id, 'Marina').expect(200)
    expect(resposta.body).toMatchObject({ status: 'encerrada' })
    expect(resposta.body.encerradaEm).not.toBeNull()
    const novas = await ambiente.api.get(`/api/webchat/${sessao}/mensagens`).expect(200)
    expect(novas.body.mensagens.at(-1).texto).toBe(M.ENCERRADA_PELO_ATENDENTE)
    expect(await metrica(ambiente, 'chatflow_conversas_encerradas_total', 'por="atendente"')).toBe(encerradasAntes + 1)

    const nova = await enviarWebchat(ambiente, sessao, 'oi').expect(200)
    expect(nova.body.conversa.id).not.toBe(id)
    expect(nova.body.conversa.status).toBe('bot')
  })

  it('403 para outro atendente e 409 para conversa já encerrada', async () => {
    const { id } = await clienteNaFila()
    await assumir(id, 'Marina').expect(200)
    await encerrar(id, 'Paulo').expect(403)
    await encerrar(id, 'Marina').expect(200)
    await encerrar(id, 'Marina').expect(409)
  })
})

describe('GET /api/conversas', () => {
  it('filtra as conversas de um atendente', async () => {
    const { id } = await clienteNaFila()
    await assumir(id, 'Joana').expect(200)
    const resposta = await ambiente.api
      .get('/api/conversas')
      .query({ status: 'em_atendimento', atendente: 'Joana' })
      .expect(200)
    expect(resposta.body.itens.map((c: { id: string }) => c.id)).toEqual([id])
  })

  it('400 para status desconhecido', async () => {
    await ambiente.api.get('/api/conversas').query({ status: 'fechada' }).expect(400)
  })

  it('404 para conversa inexistente', async () => {
    const resposta = await ambiente.api.get('/api/conversas/64b7f0f0f0f0f0f0f0f0f0f0').expect(404)
    expect(resposta.body).toEqual({ erro: 'Conversa não encontrada.' })
  })
})
