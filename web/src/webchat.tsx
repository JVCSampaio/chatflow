import { StrictMode, useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { enviar, juntar, pedir, protocolo, type Conversa, type Mensagem } from './api.ts'
import './estilo.css'

function sessaoDoNavegador() {
  const salva = sessionStorage.getItem('chatflow-sessao')
  if (salva) return salva
  const nova = crypto.randomUUID()
  sessionStorage.setItem('chatflow-sessao', nova)
  return nova
}

function situacao(conversa: Conversa | null) {
  if (!conversa || conversa.status === 'bot') return 'Assistente virtual'
  if (conversa.status === 'aguardando') return 'Aguardando atendente'
  if (conversa.status === 'em_atendimento') return `Em atendimento com ${conversa.atendente}`
  return 'Atendimento encerrado'
}

function Webchat() {
  const [sessao] = useState(sessaoDoNavegador)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [conversa, setConversa] = useState<Conversa | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  // Reenviar depois de uma falha usa o mesmo id: o servidor reconhece e não duplica a mensagem.
  const pendente = useRef<{ texto: string; id: string } | null>(null)
  const fim = useRef<HTMLLIElement>(null)

  // Consulta a cada 1,5 s as mensagens novas (respostas do atendente).
  const ultima = mensagens.at(-1)?.id
  useEffect(() => {
    const consultar = async () => {
      const novas = await pedir<{ conversa: Conversa | null; mensagens: Mensagem[] }>(
        `/api/webchat/${sessao}/mensagens${ultima ? `?depois=${ultima}` : ''}`,
      )
      if (novas.conversa) setConversa(novas.conversa)
      setMensagens((atuais) => juntar(atuais, novas.mensagens))
    }
    const intervalo = setInterval(() => consultar().catch(() => undefined), 1500)
    return () => clearInterval(intervalo)
  }, [sessao, ultima])

  // Corpo em bloco: no Chrome atual, scrollIntoView devolve uma Promise, e o React trataria o
  // retorno como função de limpeza (o teste E2E pegou isso: "destroy is not a function").
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' })
  }, [mensagens.length])

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    const conteudo = texto.trim()
    if (!conteudo) return
    const id = pendente.current?.texto === conteudo ? pendente.current.id : crypto.randomUUID()
    pendente.current = { texto: conteudo, id }
    setEnviando(true)
    setErro('')
    try {
      const resposta = await enviar<{ conversa: Conversa; mensagens: Mensagem[] }>('/api/webchat/mensagens', {
        sessao,
        texto: conteudo,
        id,
      })
      pendente.current = null
      setConversa(resposta.conversa)
      setMensagens((atuais) => juntar(atuais, resposta.mensagens))
      setTexto('')
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="pagina-chat">
      <header className="cabecalho">
        <div>
          <strong>Atendimento</strong>
          {conversa && <small data-testid="protocolo">Protocolo {protocolo(conversa.id)}</small>}
        </div>
        <span className={`situacao ${conversa?.status ?? 'bot'}`} data-testid="situacao">
          {situacao(conversa)}
        </span>
      </header>
      <ol className="mensagens" role="log" aria-live="polite" aria-label="Mensagens da conversa">
        {mensagens.length === 0 && <li className="vazio">Envie uma mensagem para começar, por exemplo "oi".</li>}
        {mensagens.map((m) => (
          <li key={m.id} className={`mensagem ${m.autor}`} data-autor={m.autor}>
            {m.autor === 'atendente' && <span className="autor">{m.atendente}</span>}
            <p>{m.texto}</p>
          </li>
        ))}
        <li ref={fim} aria-hidden="true" />
      </ol>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      <form className="envio" onSubmit={aoEnviar}>
        <label htmlFor="mensagem" className="sr-only">
          Mensagem
        </label>
        <input
          id="mensagem"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={1000}
          autoComplete="off"
          placeholder="Digite sua mensagem"
        />
        <button disabled={enviando || !texto.trim()}>Enviar</button>
      </form>
    </main>
  )
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <Webchat />
  </StrictMode>,
)
