import { pino, type DestinationStream, type Logger } from 'pino'
import { mascararTelefone } from './privacidade.ts'

// Logs em JSON (prontos para Datadog, New Relic ou Loki). O texto das mensagens nunca é registrado;
// o identificador do contato (telefone no WhatsApp) sai mascarado.
export function criarLogger(nivel = 'info', destino?: DestinationStream): Logger {
  return pino(
    {
      level: nivel,
      base: { servico: 'chatflow' },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: ['contato.id'], censor: (valor) => mascararTelefone(String(valor)) },
    },
    destino,
  )
}
