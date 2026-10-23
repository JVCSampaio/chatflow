import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import * as M from '../../src/bot/mensagens.ts'
import { criarAmbiente, type Ambiente } from '../apoio/ambiente.ts'
import { enviarTelegram, historicoDo, telegram } from '../apoio/canais.ts'

let ambiente: Ambiente
beforeAll(async () => {
  ambiente = await criarAmbiente(inject('mongoUrl'))
})
afterAll(() => ambiente.encerrar())

let proximoUpdate = 5000
const novoChat = () => 100000 + Math.floor(Math.random() * 1e6)

describe('POST /webhooks/telegram', () => {
  it('responde pelo mesmo fluxo do WhatsApp', async () => {
    const chat = novoChat()
    const resposta = await enviarTelegram(ambiente, telegram(chat, 'oi', proximoUpdate++)).expect(200)
    expect(resposta.body).toEqual({ recebidas: 1, duplicadas: 0 })
    const { mensagens } = await historicoDo(ambiente, 'telegram', String(chat))
    expect(mensagens.map((m) => m.texto)).toEqual(['oi', M.BOAS_VINDAS, M.MENU])
  })

  it.each([
    ['token secreto errado', 'outro-segredo'],
    ['token secreto ausente', ''],
  ])('401: %s', async (_caso, segredo) => {
    const resposta = await enviarTelegram(ambiente, telegram(novoChat(), 'oi', proximoUpdate++), segredo).expect(401)
    expect(resposta.body).toEqual({ erro: 'Token secreto inválido.' })
  })

  it('confere o token antes de ler o corpo', async () => {
    await ambiente.api
      .post('/webhooks/telegram')
      .set('Content-Type', 'application/json')
      .send('{corpo quebrado')
      .expect(401)
  })

  it('ignora o reenvio do mesmo update_id', async () => {
    const update = telegram(novoChat(), 'oi', proximoUpdate++)
    await enviarTelegram(ambiente, update).expect(200)
    const reenvio = await enviarTelegram(ambiente, update).expect(200)
    expect(reenvio.body).toEqual({ recebidas: 0, duplicadas: 1 })
  })

  it('aceita updates sem mensagem nova (ex.: edição) sem processar nada', async () => {
    const resposta = await enviarTelegram(ambiente, { update_id: proximoUpdate++, edited_message: {} }).expect(200)
    expect(resposta.body).toEqual({ recebidas: 0, duplicadas: 0 })
  })

  it('400 para update fora do formato da Bot API', async () => {
    await enviarTelegram(ambiente, { update_id: 'abc' }).expect(400)
  })
})
