import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import * as M from '../../src/bot/mensagens.ts'
import { criarAmbiente, type Ambiente } from '../apoio/ambiente.ts'
import { enviarWebchat, novaSessao } from '../apoio/canais.ts'

let ambiente: Ambiente
beforeAll(async () => {
  ambiente = await criarAmbiente(inject('mongoUrl'))
})
afterAll(() => ambiente.encerrar())

const textosDoBot = (corpo: { mensagens: { autor: string; texto: string }[] }) =>
  corpo.mensagens.filter((m) => m.autor === 'bot').map((m) => m.texto)

describe('POST /api/webchat/mensagens', () => {
  it('conduz a segunda via do início ao fim', async () => {
    const sessao = novaSessao()
    const oi = await enviarWebchat(ambiente, sessao, 'oi').expect(200)
    expect(oi.body.conversa).toMatchObject({ canal: 'webchat', status: 'bot', contato: { id: sessao } })
    expect(textosDoBot(oi.body)).toEqual([M.BOAS_VINDAS, M.MENU])

    const opcao = await enviarWebchat(ambiente, sessao, '1').expect(200)
    expect(textosDoBot(opcao.body)).toEqual([M.PEDIR_CPF])

    const cpf = await enviarWebchat(ambiente, sessao, '123.456.789-09').expect(200)
    expect(textosDoBot(cpf.body)[0]).toContain('Enviei a segunda via para a***@example.com')
    expect(cpf.body.conversa.id).toBe(oi.body.conversa.id)
  })

  it('devolve a mensagem do cliente e as respostas com o mesmo formato', async () => {
    const resposta = await enviarWebchat(ambiente, novaSessao(), 'oi').expect(200)
    expect(resposta.body.duplicada).toBe(false)
    for (const mensagem of resposta.body.mensagens) {
      expect(Object.keys(mensagem).sort()).toEqual(['atendente', 'autor', 'conversaId', 'criadaEm', 'id', 'texto'])
    }
    expect(resposta.body.mensagens[0]).toMatchObject({ autor: 'cliente', texto: 'oi', atendente: null })
  })

  it('"sair" encerra a conversa e a próxima mensagem começa outra', async () => {
    const sessao = novaSessao()
    const primeira = await enviarWebchat(ambiente, sessao, 'oi').expect(200)
    const sair = await enviarWebchat(ambiente, sessao, 'sair').expect(200)
    expect(sair.body.conversa.status).toBe('encerrada')
    expect(textosDoBot(sair.body)).toEqual([M.DESPEDIDA])

    const nova = await enviarWebchat(ambiente, sessao, 'oi de novo').expect(200)
    expect(nova.body.conversa.id).not.toBe(primeira.body.conversa.id)
    expect(textosDoBot(nova.body)).toEqual([M.BOAS_VINDAS, M.MENU])
  })

  it('não processa duas vezes a mesma mensagem reenviada pelo widget', async () => {
    const sessao = novaSessao()
    const id = randomUUID()
    await enviarWebchat(ambiente, sessao, 'oi', id).expect(200)
    const reenvio = await enviarWebchat(ambiente, sessao, 'oi', id).expect(200)
    expect(reenvio.body).toMatchObject({ duplicada: true, mensagens: [] })
  })
})

describe('validação da entrada', () => {
  const sessao = randomUUID()

  it.each([
    ['texto vazio', { sessao, texto: '   ' }, 'texto'],
    ['texto acima de 1000 caracteres', { sessao, texto: 'a'.repeat(1001) }, 'texto'],
    ['sessão inválida', { sessao: '123', texto: 'oi' }, 'sessao'],
    ['campo não previsto', { sessao, texto: 'oi', autor: 'atendente' }, '(corpo)'],
  ])('400 com o campo indicado: %s', async (_caso, corpo, campo) => {
    const resposta = await ambiente.api.post('/api/webchat/mensagens').send(corpo).expect(400)
    expect(resposta.body.erro).toBe('Dados inválidos.')
    expect(resposta.body.detalhes.map((d: { campo: string }) => d.campo)).toContain(campo)
  })

  it('aceita exatamente 1000 caracteres', async () => {
    await enviarWebchat(ambiente, novaSessao(), 'a'.repeat(1000)).expect(200)
  })

  it('400 para JSON malformado', async () => {
    const resposta = await ambiente.api
      .post('/api/webchat/mensagens')
      .set('Content-Type', 'application/json')
      .send('{"sessao": ')
      .expect(400)
    expect(resposta.body).toEqual({ erro: 'JSON inválido.' })
  })

  it('413 para corpo acima de 16 KB', async () => {
    await ambiente.api
      .post('/api/webchat/mensagens')
      .send({ sessao, texto: 'a'.repeat(17 * 1024) })
      .expect(413)
  })
})

describe('GET /api/webchat/:sessao/mensagens', () => {
  it('devolve só as mensagens depois da última recebida', async () => {
    const sessao = novaSessao()
    const oi = await enviarWebchat(ambiente, sessao, 'oi').expect(200)
    await enviarWebchat(ambiente, sessao, '1').expect(200)
    const ultimaDoOi = oi.body.mensagens.at(-1).id

    const resposta = await ambiente.api
      .get(`/api/webchat/${sessao}/mensagens`)
      .query({ depois: ultimaDoOi })
      .expect(200)
    expect(resposta.body.mensagens.map((m: { texto: string }) => m.texto)).toEqual(['1', M.PEDIR_CPF])
    expect(resposta.body.conversa.status).toBe('bot')
  })

  it('devolve conversa nula para sessão sem mensagens', async () => {
    const resposta = await ambiente.api.get(`/api/webchat/${novaSessao()}/mensagens`).expect(200)
    expect(resposta.body).toEqual({ conversa: null, mensagens: [] })
  })

  it.each([
    ['sessão inválida', '/api/webchat/abc/mensagens'],
    ['marcador "depois" inválido', `/api/webchat/${randomUUID()}/mensagens?depois=xyz`],
  ])('400: %s', async (_caso, url) => {
    await ambiente.api.get(url).expect(400)
  })
})
