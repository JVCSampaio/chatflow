import type { ObjectId } from 'mongodb'
import type { Logger } from 'pino'
import type { Expediente } from './bot/expediente.ts'
import { decidir, type Decisao } from './bot/fluxo.ts'
import { ENCERRADA_PELO_ATENDENTE } from './bot/mensagens.ts'
import type { MensagemRecebida } from './canais/tipos.ts'
import type { Metricas } from './metricas.ts'
import { mascararCpfs } from './privacidade.ts'
import type { Autor, Conversa, Mensagem, Repositorio } from './repositorio.ts'

export class ErroDeAtendimento extends Error {
  readonly status: number

  constructor(status: number, mensagem: string) {
    super(mensagem)
    this.status = status
  }
}

export interface Resultado {
  duplicada: boolean
  conversa: Conversa
  mensagens: Mensagem[]
}

export interface Dependencias {
  repositorio: Repositorio
  expediente: Expediente
  relogio: () => Date
  log: Logger
  metricas: Metricas
}

export class Atendimento {
  readonly #d: Dependencias
  readonly #filas = new Map<string, Promise<unknown>>()

  constructor(dependencias: Dependencias) {
    this.#d = dependencias
  }

  /** Mensagens do mesmo contato são processadas uma de cada vez, na ordem de chegada. */
  receber(entrada: MensagemRecebida): Promise<Resultado> {
    const chave = `${entrada.canal}:${entrada.contato.id}`
    const anterior = this.#filas.get(chave) ?? Promise.resolve()
    const atual = anterior.catch(() => undefined).then(() => this.#processar(entrada))
    this.#filas.set(chave, atual)
    atual.finally(() => this.#filas.get(chave) === atual && this.#filas.delete(chave)).catch(() => undefined)
    return atual
  }

  async #processar(entrada: MensagemRecebida): Promise<Resultado> {
    const { repositorio, expediente, log, metricas } = this.#d
    const agora = this.#d.relogio()
    const conversa = await repositorio.conversaAberta(entrada.canal, entrada.contato, agora)
    const recebida = await repositorio.registrar({
      conversaId: conversa._id,
      canal: entrada.canal,
      contatoId: entrada.contato.id,
      autor: 'cliente',
      atendente: null,
      // O CPF é usado na consulta, mas o histórico guarda só a versão mascarada (minimização, LGPD).
      texto: entrada.tipo === 'midia' ? '[mídia]' : mascararCpfs(entrada.texto),
      ...(entrada.idExterno && { idExterno: entrada.idExterno }),
      criadaEm: agora,
    })
    const contexto = { canal: entrada.canal, conversaId: conversa._id.toHexString() }
    if (!recebida) {
      metricas.duplicadas.inc({ canal: entrada.canal })
      log.info(contexto, 'mensagem_duplicada_ignorada')
      return { duplicada: true, conversa, mensagens: [] }
    }
    metricas.recebidas.inc({ canal: entrada.canal })
    log.info({ ...contexto, contato: entrada.contato, status: conversa.status }, 'mensagem_recebida')

    // Com a conversa na fila ou com um atendente, o bot fica em silêncio.
    if (conversa.status !== 'bot') return { duplicada: false, conversa, mensagens: [recebida] }

    const decisao = decidir(conversa.bot, entrada, { agora, expediente })
    const atualizada = await repositorio.atualizar(conversa._id, mudancas(decisao, agora))
    if (decisao.transferencia) {
      metricas.transferencias.inc({ motivo: decisao.transferencia.motivo })
      log.info({ ...contexto, ...decisao.transferencia }, 'conversa_transferida')
    }
    if (decisao.encerrar) {
      metricas.encerradas.inc({ por: 'cliente' })
      log.info(contexto, 'conversa_encerrada')
    }
    const respostas = await this.#enviar(atualizada, 'bot', null, decisao.respostas, agora)
    return { duplicada: false, conversa: atualizada, mensagens: [recebida, ...respostas] }
  }

  async assumir(id: ObjectId, atendente: string): Promise<Conversa> {
    const agora = this.#d.relogio()
    const mudancas = { status: 'em_atendimento', atendente, atualizadaEm: agora } as const
    const conversa = await this.#d.repositorio.mudarStatus(id, 'aguardando', mudancas)
    if (conversa) {
      this.#d.log.info({ conversaId: id.toHexString(), atendente }, 'conversa_assumida')
      return conversa
    }
    const atual = await this.#existente(id)
    throw new ErroDeAtendimento(
      409,
      atual.status === 'em_atendimento'
        ? `Esta conversa já está com ${atual.atendente}.`
        : 'Esta conversa não está aguardando atendente.',
    )
  }

  async responder(id: ObjectId, atendente: string, texto: string): Promise<Mensagem> {
    const conversa = await this.#existente(id)
    exigirResponsavel(conversa, atendente)
    const agora = this.#d.relogio()
    const [mensagem] = await this.#enviar(conversa, 'atendente', atendente, [texto], agora)
    await this.#d.repositorio.atualizar(id, { atualizadaEm: agora })
    return mensagem
  }

  async encerrar(id: ObjectId, atendente: string): Promise<Conversa> {
    exigirResponsavel(await this.#existente(id), atendente)
    const agora = this.#d.relogio()
    const mudancas = { status: 'encerrada', aberta: false, encerradaEm: agora, atualizadaEm: agora } as const
    const encerrada = await this.#d.repositorio.mudarStatus(id, 'em_atendimento', mudancas, { atendente })
    if (!encerrada) throw new ErroDeAtendimento(409, 'A conversa mudou de situação. Atualize a tela.')
    await this.#enviar(encerrada, 'bot', null, [ENCERRADA_PELO_ATENDENTE], agora)
    this.#d.metricas.encerradas.inc({ por: 'atendente' })
    this.#d.log.info({ conversaId: id.toHexString(), atendente }, 'conversa_encerrada')
    return encerrada
  }

  async #existente(id: ObjectId) {
    const conversa = await this.#d.repositorio.buscarConversa(id)
    if (!conversa) throw new ErroDeAtendimento(404, 'Conversa não encontrada.')
    return conversa
  }

  /** Grava as respostas; nos canais externos, o envio pela API do WhatsApp ou Telegram é simulado. */
  async #enviar(conversa: Conversa, autor: Autor, atendente: string | null, textos: string[], agora: Date) {
    const enviadas: Mensagem[] = []
    for (const texto of textos) {
      const mensagem = { conversaId: conversa._id, canal: conversa.canal, contatoId: conversa.contato.id }
      enviadas.push((await this.#d.repositorio.registrar({ ...mensagem, autor, atendente, texto, criadaEm: agora }))!)
    }
    return enviadas
  }
}

function mudancas(decisao: Decisao, agora: Date): Partial<Conversa> {
  const mudancas: Partial<Conversa> = { bot: decisao.estado, atualizadaEm: agora }
  if (decisao.transferencia) {
    mudancas.status = 'aguardando'
    mudancas.transferencia = { ...decisao.transferencia, em: agora }
  }
  if (decisao.encerrar) Object.assign(mudancas, { status: 'encerrada', aberta: false, encerradaEm: agora })
  return mudancas
}

function exigirResponsavel(conversa: Conversa, atendente: string) {
  if (conversa.status !== 'em_atendimento') throw new ErroDeAtendimento(409, 'Assuma a conversa antes de responder.')
  if (conversa.atendente !== atendente)
    throw new ErroDeAtendimento(403, `Esta conversa está com ${conversa.atendente}.`)
}
