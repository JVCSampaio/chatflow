import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { criarAmbiente, type Ambiente } from '../apoio/ambiente.ts'
import { enviarWebchat, enviarWhatsapp, historicoDo, novaSessao, novoTelefone, whatsapp } from '../apoio/canais.ts'

let ambiente: Ambiente
beforeAll(async () => {
  ambiente = await criarAmbiente(inject('mongoUrl'))
})
afterAll(() => ambiente.encerrar())

describe('dados pessoais (LGPD)', () => {
  it('o histórico guarda o CPF mascarado', async () => {
    const sessao = novaSessao()
    for (const texto of ['oi', '1', '123.456.789-09']) await enviarWebchat(ambiente, sessao, texto).expect(200)
    const { mensagens } = await historicoDo(ambiente, 'webchat', sessao)
    const textos = mensagens.map((m) => m.texto).join('\n')
    expect(textos).toContain('***.456.789-**')
    expect(textos).not.toMatch(/123\.?456\.?789-?09/)
  })

  it('o log não registra CPF, texto das mensagens nem o telefone completo', async () => {
    const telefone = novoTelefone()
    for (const texto of ['oi', '1', '111.444.777-35']) {
      await enviarWhatsapp(ambiente, whatsapp(telefone, texto)).expect(200)
    }
    const logs = ambiente.logs()
    expect(logs).toContain('mensagem_recebida')
    expect(logs).toContain(`*********${telefone.slice(-4)}`)
    expect(logs).not.toContain(telefone)
    expect(logs).not.toMatch(/111\.?444\.?777-?35/)
    expect(logs).not.toContain('Enviei a segunda via')
  })

  it('cada linha de log é JSON com nível, horário e serviço', async () => {
    const linhas = ambiente.logs().trim().split('\n')
    for (const linha of linhas) expect(JSON.parse(linha)).toMatchObject({ servico: 'chatflow' })
    expect(JSON.parse(linhas[0])).toHaveProperty('time')
  })

  it('o token de verificação do WhatsApp não aparece no log da requisição', async () => {
    await ambiente.api
      .get('/webhooks/whatsapp')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'token-secreto-123', 'hub.challenge': '1' })
      .expect(403)
    expect(ambiente.logs()).not.toContain('token-secreto-123')
  })
})
