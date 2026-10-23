import { MongoServerError, ObjectId, type Collection, type Db, type Filter, type Sort } from 'mongodb'
import { ESTADO_INICIAL, type EstadoDoBot, type MotivoTransferencia } from './bot/fluxo.ts'
import type { Canal } from './canais/tipos.ts'

export type StatusDaConversa = 'bot' | 'aguardando' | 'em_atendimento' | 'encerrada'
export type Autor = 'cliente' | 'bot' | 'atendente'

export interface Conversa {
  _id: ObjectId
  canal: Canal
  contato: { id: string; nome: string | null }
  status: StatusDaConversa
  /** true até o encerramento; um contato tem no máximo uma conversa aberta por canal. */
  aberta: boolean
  bot: EstadoDoBot
  transferencia: { motivo: MotivoTransferencia; foraDoExpediente: boolean; em: Date } | null
  atendente: string | null
  criadaEm: Date
  atualizadaEm: Date
  encerradaEm: Date | null
}

export interface Mensagem {
  _id: ObjectId
  conversaId: ObjectId
  canal: Canal
  contatoId: string
  autor: Autor
  atendente: string | null
  texto: string
  idExterno?: string
  criadaEm: Date
}

export interface FiltroDeConversas {
  status?: StatusDaConversa
  canal?: Canal
  contato?: string
  atendente?: string
}

const CHAVE_DUPLICADA = 11000
const duplicada = (erro: unknown) => erro instanceof MongoServerError && erro.code === CHAVE_DUPLICADA

export class Repositorio {
  readonly #db: Db
  readonly conversas: Collection<Conversa>
  readonly mensagens: Collection<Mensagem>

  constructor(db: Db) {
    this.#db = db
    this.conversas = db.collection('conversas')
    this.mensagens = db.collection('mensagens')
  }

  async preparar() {
    await this.conversas.createIndex(
      { canal: 1, 'contato.id': 1 },
      { name: 'uma_conversa_aberta_por_contato', unique: true, partialFilterExpression: { aberta: true } },
    )
    await this.conversas.createIndex({ status: 1, 'transferencia.em': 1 }, { name: 'fila' })
    await this.mensagens.createIndex(
      { canal: 1, idExterno: 1 },
      { name: 'mensagem_unica_por_canal', unique: true, partialFilterExpression: { idExterno: { $type: 'string' } } },
    )
    await this.mensagens.createIndex({ conversaId: 1, _id: 1 }, { name: 'historico' })
    await this.mensagens.createIndex({ canal: 1, contatoId: 1, _id: 1 }, { name: 'por_contato' })
  }

  async ping() {
    await this.#db.command({ ping: 1 })
  }

  /** Conversa aberta do contato no canal; cria uma nova se não houver. */
  async conversaAberta(canal: Canal, contato: Conversa['contato'], agora: Date): Promise<Conversa> {
    const filtro = { canal, 'contato.id': contato.id, aberta: true }
    const nova = {
      'contato.nome': contato.nome,
      status: 'bot' as const,
      bot: ESTADO_INICIAL,
      transferencia: null,
      atendente: null,
      criadaEm: agora,
      atualizadaEm: agora,
      encerradaEm: null,
    }
    try {
      const conversa = await this.conversas.findOneAndUpdate(
        filtro,
        { $setOnInsert: nova },
        { upsert: true, returnDocument: 'after' },
      )
      return conversa!
    } catch (erro) {
      // Outra instância criou a conversa ao mesmo tempo; o índice único garante que só exista uma.
      if (duplicada(erro)) return (await this.conversas.findOne(filtro))!
      throw erro
    }
  }

  /** Grava a mensagem. Devolve null se o canal já tinha entregado esse idExterno (idempotência). */
  async registrar(mensagem: Omit<Mensagem, '_id'>): Promise<Mensagem | null> {
    const documento = { _id: new ObjectId(), ...mensagem }
    try {
      await this.mensagens.insertOne(documento)
      return documento
    } catch (erro) {
      if (duplicada(erro)) return null
      throw erro
    }
  }

  async atualizar(id: ObjectId, mudancas: Partial<Conversa>): Promise<Conversa> {
    return (await this.conversas.findOneAndUpdate({ _id: id }, { $set: mudancas }, { returnDocument: 'after' }))!
  }

  /** Atualiza só se a conversa ainda estiver no status esperado; null quando outra ação chegou antes. */
  mudarStatus(id: ObjectId, de: StatusDaConversa, mudancas: Partial<Conversa>, condicao: Filter<Conversa> = {}) {
    return this.conversas.findOneAndUpdate(
      { _id: id, status: de, ...condicao },
      { $set: mudancas },
      { returnDocument: 'after' },
    )
  }

  buscarConversa(id: ObjectId) {
    return this.conversas.findOne({ _id: id })
  }

  historico(conversaId: ObjectId) {
    return this.mensagens.find({ conversaId }).sort({ _id: 1 }).toArray()
  }

  /** A fila (aguardando) sai da espera mais antiga para a mais nova; o resto, do mais recente. */
  listarConversas({ status, canal, contato, atendente }: FiltroDeConversas) {
    const filtro: Filter<Conversa> = {}
    if (status) filtro.status = status
    if (canal) filtro.canal = canal
    if (contato) filtro['contato.id'] = contato
    if (atendente) filtro.atendente = atendente
    const ordem: Sort = status === 'aguardando' ? { 'transferencia.em': 1, _id: 1 } : { atualizadaEm: -1, _id: -1 }
    return this.conversas.find(filtro).sort(ordem).limit(100).toArray()
  }

  ultimaConversa(canal: Canal, contatoId: string) {
    return this.conversas.find({ canal, 'contato.id': contatoId }).sort({ _id: -1 }).limit(1).next()
  }

  mensagensDoContato(canal: Canal, contatoId: string, depois?: ObjectId) {
    return this.mensagens
      .find({ canal, contatoId, ...(depois && { _id: { $gt: depois } }) })
      .sort({ _id: 1 })
      .limit(200)
      .toArray()
  }
}
