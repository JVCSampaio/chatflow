import { StrictMode, useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { enviar, hora, pedir, protocolo, type Canal, type Conversa, type Mensagem } from './api.ts'
import './estilo.css'

const CANAIS: Record<Canal, string> = { whatsapp: 'WhatsApp', telegram: 'Telegram', webchat: 'Site' }
const MOTIVOS: Record<string, string> = {
  pedido_do_cliente: 'Pediu atendente',
  nao_entendeu: 'Bot não entendeu',
  cpf_invalido: 'CPF não confirmado',
  suporte_tecnico: 'Suporte técnico',
}
const nomeDo = (c: Conversa) => c.contato.nome ?? 'Visitante do site'

type Detalhe = { conversa: Conversa; mensagens: Mensagem[] }

function Console() {
  const [nome, setNome] = useState(() => localStorage.getItem('chatflow-atendente') ?? '')
  const [fila, setFila] = useState<Conversa[]>([])
  const [minhas, setMinhas] = useState<Conversa[]>([])
  const [aberta, setAberta] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)
  const [resposta, setResposta] = useState('')
  const [aviso, setAviso] = useState('')
  const [versao, setVersao] = useState(0)
  const fim = useRef<HTMLLIElement>(null)
  const atendente = nome.trim()

  useEffect(() => {
    localStorage.setItem('chatflow-atendente', nome)
  }, [nome])

  // Fila e conversas do atendente, atualizadas a cada 2 s.
  useEffect(() => {
    let ativo = true
    const carregar = async () => {
      const [espera, minhasConversas] = await Promise.all([
        pedir<{ itens: Conversa[] }>('/api/conversas?status=aguardando'),
        atendente
          ? pedir<{ itens: Conversa[] }>(
              `/api/conversas?status=em_atendimento&atendente=${encodeURIComponent(atendente)}`,
            )
          : { itens: [] },
      ])
      if (!ativo) return
      setFila(espera.itens)
      setMinhas(minhasConversas.itens)
    }
    carregar().catch((e) => setAviso(e.message))
    const intervalo = setInterval(() => carregar().catch(() => undefined), 2000)
    return () => {
      ativo = false
      clearInterval(intervalo)
    }
  }, [atendente, versao])

  // Conversa aberta, atualizada a cada 1,5 s.
  useEffect(() => {
    if (!aberta) {
      setDetalhe(null)
      return
    }
    let ativo = true
    const carregar = async () => {
      const dados = await pedir<Detalhe>(`/api/conversas/${aberta}`)
      if (ativo) setDetalhe(dados)
    }
    carregar().catch((e) => setAviso(e.message))
    const intervalo = setInterval(() => carregar().catch(() => undefined), 1500)
    return () => {
      ativo = false
      clearInterval(intervalo)
    }
  }, [aberta, versao])

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' })
  }, [detalhe?.mensagens.length])

  async function executar(acao: () => Promise<unknown>, sucesso = '') {
    setAviso('')
    try {
      await acao()
      setAviso(sucesso)
    } catch (e) {
      setAviso((e as Error).message)
    } finally {
      setVersao((v) => v + 1)
    }
  }

  const assumir = (id: string) =>
    executar(async () => {
      await enviar(`/api/conversas/${id}/assumir`, { atendente })
      setAberta(id)
    })

  const responder = (evento: FormEvent) => {
    evento.preventDefault()
    executar(async () => {
      await enviar(`/api/conversas/${aberta}/mensagens`, { atendente, texto: resposta })
      setResposta('')
    })
  }

  const encerrar = () =>
    executar(async () => {
      await enviar(`/api/conversas/${aberta}/encerrar`, { atendente })
      setAberta(null)
    }, 'Conversa encerrada.')

  return (
    <main className="console">
      <header className="cabecalho">
        <strong>Console do atendente</strong>
        <label className="nome">
          Seu nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Marina" maxLength={60} />
        </label>
      </header>
      {aviso && (
        <p className="aviso" role="status">
          {aviso}
        </p>
      )}
      <div className="colunas">
        <section className="painel" aria-labelledby="titulo-fila">
          <h2 id="titulo-fila">Fila de espera ({fila.length})</h2>
          <ul className="cartoes">
            {fila.length === 0 && <li className="vazio">Ninguém aguardando.</li>}
            {fila.map((c) => (
              <li key={c.id} className="cartao">
                <span className={`canal ${c.canal}`}>{CANAIS[c.canal]}</span>
                <strong>
                  {nomeDo(c)} <small>{protocolo(c.id)}</small>
                </strong>
                <small>
                  {MOTIVOS[c.transferencia?.motivo ?? ''] ?? 'Transferida'} · desde{' '}
                  {hora(c.transferencia?.em ?? c.criadaEm)}
                  {c.transferencia?.foraDoExpediente && ' · fora do expediente'}
                </small>
                <button disabled={!atendente} onClick={() => assumir(c.id)} aria-label={`Assumir ${protocolo(c.id)}`}>
                  Assumir
                </button>
              </li>
            ))}
          </ul>
          <h2>Minhas conversas ({minhas.length})</h2>
          <ul className="cartoes">
            {minhas.map((c) => (
              <li key={c.id} className={`cartao ${c.id === aberta ? 'selecionado' : ''}`}>
                <span className={`canal ${c.canal}`}>{CANAIS[c.canal]}</span>
                <strong>
                  {nomeDo(c)} <small>{protocolo(c.id)}</small>
                </strong>
                <button className="secundario" onClick={() => setAberta(c.id)} aria-label={`Abrir ${protocolo(c.id)}`}>
                  Abrir
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="painel conversa" aria-label="Conversa aberta">
          {!detalhe ? (
            <p className="vazio">{atendente ? 'Assuma uma conversa da fila.' : 'Informe seu nome para atender.'}</p>
          ) : (
            <>
              <h2>
                {nomeDo(detalhe.conversa)} · {CANAIS[detalhe.conversa.canal]} · {protocolo(detalhe.conversa.id)}
              </h2>
              <ol className="mensagens" role="log" aria-label="Histórico da conversa">
                {detalhe.mensagens.map((m) => (
                  <li key={m.id} className={`mensagem ${m.autor}`} data-autor={m.autor}>
                    <span className="autor">
                      {m.autor === 'atendente' ? m.atendente : m.autor === 'bot' ? 'Bot' : 'Cliente'}
                    </span>
                    <p>{m.texto}</p>
                  </li>
                ))}
                <li ref={fim} aria-hidden="true" />
              </ol>
              {detalhe.conversa.status === 'em_atendimento' && (
                <form className="envio" onSubmit={responder}>
                  <label htmlFor="resposta" className="sr-only">
                    Resposta
                  </label>
                  <input
                    id="resposta"
                    value={resposta}
                    onChange={(e) => setResposta(e.target.value)}
                    maxLength={1000}
                    autoComplete="off"
                    placeholder="Escreva a resposta"
                  />
                  <button disabled={!resposta.trim()}>Enviar</button>
                  <button type="button" className="secundario" onClick={encerrar}>
                    Encerrar atendimento
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  )
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <Console />
  </StrictMode>,
)
