import assert from 'node:assert/strict'
import { Given, Then, When } from '@cucumber/cucumber'
import type { Canal } from '../../src/canais/tipos.ts'
import { whatsapp, enviarWhatsapp } from '../../tests/apoio/canais.ts'
import type { Mundo } from './mundo.ts'

// ---------- Contexto ----------

Given('que estou conversando pelo canal {string}', function (this: Mundo, canal: Canal) {
  this.usarCanal(canal)
})

Given('que agora é {string} no horário de Brasília', function (this: Mundo, momento: string) {
  this.ambiente.relogio.agora = new Date(`${momento.replace(' ', 'T')}:00-03:00`)
})

Given('que já escolhi a opção {string} no menu', async function (this: Mundo, opcao: string) {
  await this.enviar('oi')
  await this.enviar(opcao)
})

Given('que pedi para falar com um atendente', async function (this: Mundo) {
  await this.enviar('oi')
  await this.enviar('atendente')
})

// ---------- Cliente ----------

When('envio {string}', async function (this: Mundo, texto: string) {
  await this.enviar(texto)
})

When('envio um áudio', async function (this: Mundo) {
  await this.enviar(null)
})

When('o WhatsApp entrega a mensagem {string} {int} vezes', async function (this: Mundo, texto: string, vezes: number) {
  const payload = whatsapp(this.contato, texto, 'wamid.reentrega-cenario')
  for (let i = 0; i < vezes; i++) await enviarWhatsapp(this.ambiente, payload).expect(200)
})

Then('o bot responde {string}', function (this: Mundo, trecho: string) {
  assert.ok(
    this.respostas.some((resposta) => resposta.includes(trecho)),
    `Nenhuma resposta contém "${trecho}". Respostas: ${JSON.stringify(this.respostas)}`,
  )
})

Then('o bot não responde', function (this: Mundo) {
  assert.deepEqual(this.respostas, [])
})

Then('recebo a mensagem {string}', async function (this: Mundo, trecho: string) {
  const { mensagens } = await this.historico()
  assert.ok(mensagens.at(-1)?.texto.includes(trecho), `Última mensagem: ${mensagens.at(-1)?.texto}`)
})

// ---------- Situação da conversa ----------

Then('a conversa continua com o bot', async function (this: Mundo) {
  assert.equal((await this.historico()).conversa.status, 'bot')
})

Then('a conversa vai para a fila com o motivo {string}', async function (this: Mundo, motivo: string) {
  const { conversa } = await this.historico()
  assert.equal(conversa.status, 'aguardando')
  assert.equal(conversa.transferencia?.motivo, motivo)
})

Then('a mensagem é processada uma única vez', async function (this: Mundo) {
  const { mensagens } = await this.historico()
  assert.equal(mensagens.filter((m) => m.autor === 'cliente').length, 1)
})

Then('o histórico mostra {string}', async function (this: Mundo, texto: string) {
  const { mensagens } = await this.historico()
  assert.ok(mensagens.some((m) => m.texto.includes(texto)))
})

Then('o histórico não contém {string}', async function (this: Mundo, texto: string) {
  const { mensagens } = await this.historico()
  assert.ok(!mensagens.some((m) => m.texto.includes(texto)))
})

// ---------- Atendente ----------

const idDaConversa = async (mundo: Mundo) => (await mundo.historico()).conversa.id

When('a atendente {string} assume a conversa', async function (this: Mundo, atendente: string) {
  await this.ambiente.api
    .post(`/api/conversas/${await idDaConversa(this)}/assumir`)
    .send({ atendente })
    .expect(200)
})

When('a atendente {string} responde {string}', async function (this: Mundo, atendente: string, texto: string) {
  const id = await idDaConversa(this)
  await this.ambiente.api.post(`/api/conversas/${id}/mensagens`).send({ atendente, texto }).expect(201)
})

When('a atendente {string} encerra a conversa', async function (this: Mundo, atendente: string) {
  await this.ambiente.api
    .post(`/api/conversas/${await idDaConversa(this)}/encerrar`)
    .send({ atendente })
    .expect(200)
})

When(
  '{string} e {string} tentam assumir a conversa ao mesmo tempo',
  async function (this: Mundo, primeira: string, segunda: string) {
    const id = await idDaConversa(this)
    this.tentativas = await Promise.all(
      [primeira, segunda].map((atendente) =>
        this.ambiente.api.post(`/api/conversas/${id}/assumir`).send({ atendente }),
      ),
    )
  },
)

Then('só uma delas fica com a conversa', async function (this: Mundo) {
  assert.deepEqual(this.tentativas.map((t) => t.status).sort(), [200, 409])
  const vencedor = this.tentativas.find((t) => t.status === 200)?.body.atendente
  assert.equal((await this.historico()).conversa.atendente, vencedor)
})

Then('a outra recebe o aviso {string}', function (this: Mundo, aviso: string) {
  assert.ok(this.tentativas.find((t) => t.status === 409)?.body.erro?.startsWith(aviso))
})
