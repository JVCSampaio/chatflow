import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import * as M from '../../src/bot/mensagens.ts'
import { criarAmbiente, type Ambiente } from '../apoio/ambiente.ts'
import {
  assinar,
  enviarWhatsapp,
  historicoDo,
  metrica,
  novoTelefone,
  TOKEN_DE_VERIFICACAO,
  whatsapp,
  whatsappStatus,
} from '../apoio/canais.ts'

let ambiente: Ambiente
beforeAll(async () => {
  ambiente = await criarAmbiente(inject('mongoUrl'))
})
afterAll(() => ambiente.encerrar())

describe('GET /webhooks/whatsapp (verificação da Meta)', () => {
  const verificar = (query: Record<string, string>) => ambiente.api.get('/webhooks/whatsapp').query(query)

  it('devolve o desafio quando o token confere', async () => {
    const resposta = await verificar({
      'hub.mode': 'subscribe',
      'hub.verify_token': TOKEN_DE_VERIFICACAO,
      'hub.challenge': '1158201444',
    }).expect(200)
    expect(resposta.text).toBe('1158201444')
  })

  it.each([
    ['token errado', { 'hub.mode': 'subscribe', 'hub.verify_token': 'outro', 'hub.challenge': '1' }],
    [
      'modo diferente de subscribe',
      { 'hub.mode': 'unsubscribe', 'hub.verify_token': TOKEN_DE_VERIFICACAO, 'hub.challenge': '1' },
    ],
    [
      'desafio que não é número',
      { 'hub.mode': 'subscribe', 'hub.verify_token': TOKEN_DE_VERIFICACAO, 'hub.challenge': '<b>' },
    ],
  ])('403: %s', async (_caso, query) => {
    await verificar(query).expect(403)
  })
})

describe('POST /webhooks/whatsapp', () => {
  it('processa a mensagem e grava as respostas do bot', async () => {
    const telefone = novoTelefone()
    const resposta = await enviarWhatsapp(ambiente, whatsapp(telefone, 'oi')).expect(200)
    expect(resposta.body).toEqual({ recebidas: 1, duplicadas: 0 })

    const { conversa, mensagens } = await historicoDo(ambiente, 'whatsapp', telefone)
    expect(conversa.status).toBe('bot')
    expect(mensagens.map((m) => [m.autor, m.texto])).toEqual([
      ['cliente', 'oi'],
      ['bot', M.BOAS_VINDAS],
      ['bot', M.MENU],
    ])
  })

  describe('segurança', () => {
    const corpo = JSON.stringify(whatsapp('5532999990000', 'oi'))

    it.each([
      ['sem assinatura', ''],
      ['assinada com outro segredo', assinar(corpo, 'segredo-de-outro-app')],
      ['corpo alterado depois de assinado', assinar(corpo.replace('oi', 'tchau'))],
    ])('401: %s', async (_caso, assinatura) => {
      const resposta = await ambiente.api
        .post('/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', assinatura)
        .send(corpo)
        .expect(401)
      expect(resposta.body).toEqual({ erro: 'Assinatura inválida.' })
    })

    it('400 para JSON malformado, mesmo com assinatura válida', async () => {
      const malformado = '{"object": "whatsapp_business_account",'
      await ambiente.api
        .post('/webhooks/whatsapp')
        .set('X-Hub-Signature-256', assinar(malformado))
        .send(malformado)
        .expect(400)
    })

    it('400 para payload fora do formato da Cloud API', async () => {
      const resposta = await enviarWhatsapp(ambiente, { object: 'page', entry: [] }).expect(400)
      expect(resposta.body.erro).toBe('Dados inválidos.')
    })
  })

  describe('idempotência', () => {
    it('reenvio da mesma mensagem (mesmo wamid) é ignorado', async () => {
      const telefone = novoTelefone()
      const payload = whatsapp(telefone, 'oi', 'wamid.reenvio-1')
      await enviarWhatsapp(ambiente, payload).expect(200)
      const reenvio = await enviarWhatsapp(ambiente, payload).expect(200)
      expect(reenvio.body).toEqual({ recebidas: 0, duplicadas: 1 })

      const { mensagens } = await historicoDo(ambiente, 'whatsapp', telefone)
      expect(mensagens.filter((m) => m.autor === 'cliente')).toHaveLength(1)
      expect(mensagens.filter((m) => m.autor === 'bot')).toHaveLength(2)
    })

    it('cinco entregas simultâneas da mesma mensagem geram um único processamento', async () => {
      const telefone = novoTelefone()
      const payload = whatsapp(telefone, 'oi', 'wamid.simultanea-1')
      const duplicadasAntes = await metrica(ambiente, 'chatflow_mensagens_duplicadas_total', 'canal="whatsapp"')
      const respostas = await Promise.all(Array.from({ length: 5 }, () => enviarWhatsapp(ambiente, payload)))
      const totais = respostas.reduce(
        (soma, r) => ({
          recebidas: soma.recebidas + r.body.recebidas,
          duplicadas: soma.duplicadas + r.body.duplicadas,
        }),
        { recebidas: 0, duplicadas: 0 },
      )
      expect(totais).toEqual({ recebidas: 1, duplicadas: 4 })
      const duplicadasDepois = await metrica(ambiente, 'chatflow_mensagens_duplicadas_total', 'canal="whatsapp"')
      expect(duplicadasDepois - duplicadasAntes).toBe(4)
    })

    it('respostas simultâneas do mesmo contato são processadas uma de cada vez', async () => {
      const telefone = novoTelefone()
      await enviarWhatsapp(ambiente, whatsapp(telefone, 'oi')).expect(200)
      // Três respostas inválidas ao mesmo tempo. Sem a fila por contato, as três leriam
      // "0 tentativas" e o cliente nunca seria transferido.
      await Promise.all(['x', 'y', 'z'].map((t) => enviarWhatsapp(ambiente, whatsapp(telefone, t)).expect(200)))
      const { conversa } = await historicoDo(ambiente, 'whatsapp', telefone)
      expect(conversa.status).toBe('aguardando')
      expect(conversa.transferencia).toMatchObject({ motivo: 'nao_entendeu' })
    })
  })

  it('pede texto quando o cliente manda áudio', async () => {
    const telefone = novoTelefone()
    await enviarWhatsapp(ambiente, whatsapp(telefone, { type: 'audio', audio: { id: 'audio-1' } })).expect(200)
    const { mensagens } = await historicoDo(ambiente, 'whatsapp', telefone)
    expect(mensagens.map((m) => m.texto)).toEqual(['[mídia]', M.SO_TEXTO])
  })

  it('aceita confirmações de leitura sem criar conversa', async () => {
    const telefone = novoTelefone()
    const resposta = await enviarWhatsapp(ambiente, whatsappStatus(telefone)).expect(200)
    expect(resposta.body).toEqual({ recebidas: 0, duplicadas: 0 })
    const conversas = await ambiente.api.get('/api/conversas').query({ contato: telefone })
    expect(conversas.body.itens).toEqual([])
  })
})
