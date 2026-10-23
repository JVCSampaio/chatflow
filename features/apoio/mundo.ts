import { After, AfterAll, Before, BeforeAll, setWorldConstructor, World } from '@cucumber/cucumber'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { Canal } from '../../src/canais/tipos.ts'
import { criarAmbiente, type Ambiente } from '../../tests/apoio/ambiente.ts'
import {
  enviarTelegram,
  enviarWebchat,
  enviarWhatsapp,
  historicoDo,
  novaSessao,
  novoTelefone,
  telegram,
  whatsapp,
} from '../../tests/apoio/canais.ts'

let mongoUrl = process.env.MONGO_URL ?? ''
let mongoEmMemoria: MongoMemoryServer | undefined
let proximoUpdate = 1

BeforeAll(async () => {
  if (mongoUrl) return
  mongoEmMemoria = await MongoMemoryServer.create()
  mongoUrl = mongoEmMemoria.getUri()
})

AfterAll(async () => {
  await mongoEmMemoria?.stop()
})

/** Estado de um cenário: um cliente conversando por um canal com a aplicação real. */
export class Mundo extends World {
  ambiente!: Ambiente
  canal: Canal = 'webchat'
  contato = ''
  /** Respostas do bot à última mensagem enviada. */
  respostas: string[] = []
  /** Resultado das tentativas simultâneas de assumir a conversa. */
  tentativas: { status: number; body: { atendente?: string; erro?: string } }[] = []

  usarCanal(canal: Canal) {
    this.canal = canal
    this.contato =
      canal === 'whatsapp'
        ? novoTelefone()
        : canal === 'telegram'
          ? String(Math.floor(Math.random() * 1e9))
          : novaSessao()
  }

  async enviar(texto: string | null, idExterno?: string) {
    if (this.canal === 'webchat') {
      const resposta = await enviarWebchat(this.ambiente, this.contato, texto ?? '').expect(200)
      this.respostas = resposta.body.mensagens
        .filter((m: { autor: string }) => m.autor === 'bot')
        .map((m: { texto: string }) => m.texto)
      return
    }
    if (this.canal === 'whatsapp') {
      const conteudo = texto === null ? { type: 'audio' as const, audio: { id: 'audio-1' } } : texto
      await enviarWhatsapp(this.ambiente, whatsapp(this.contato, conteudo, idExterno)).expect(200)
    } else {
      const update = telegram(Number(this.contato), texto ?? undefined, proximoUpdate++)
      await enviarTelegram(this.ambiente, update).expect(200)
    }
    // Nos canais externos, as respostas são as mensagens do bot gravadas depois da última do cliente.
    const { mensagens } = await this.historico()
    const ultimaDoCliente = mensagens.findLastIndex((m) => m.autor === 'cliente')
    this.respostas = mensagens
      .slice(ultimaDoCliente + 1)
      .filter((m) => m.autor === 'bot')
      .map((m) => m.texto)
  }

  historico() {
    return historicoDo(this.ambiente, this.canal, this.contato)
  }
}

setWorldConstructor(Mundo)

Before(async function (this: Mundo) {
  this.ambiente = await criarAmbiente(mongoUrl)
})

After(async function (this: Mundo) {
  await this.ambiente.encerrar()
})
