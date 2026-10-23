import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { criarAmbiente, type Ambiente } from '../apoio/ambiente.ts'
import { enviarWebchat, novaSessao } from '../apoio/canais.ts'

let ambiente: Ambiente
beforeAll(async () => {
  ambiente = await criarAmbiente(inject('mongoUrl'))
})
afterAll(() => ambiente.encerrar())

describe('GET /health', () => {
  it('confirma o serviço e o banco', async () => {
    const resposta = await ambiente.api.get('/health').expect(200)
    expect(resposta.body).toEqual({ status: 'ok', banco: 'ok' })
  })
})

describe('GET /metrics', () => {
  it('expõe os contadores no formato do Prometheus', async () => {
    await enviarWebchat(ambiente, novaSessao(), 'oi').expect(200)
    const resposta = await ambiente.api.get('/metrics').expect(200)
    expect(resposta.headers['content-type']).toContain('text/plain')
    expect(resposta.text).toContain('chatflow_mensagens_recebidas_total{canal="webchat"} 1')
    expect(resposta.text).toMatch(/chatflow_http_duracao_segundos_count\{.*rota="\/api\/webchat\/mensagens".*\} 1/)
  })
})

describe('X-Request-Id (correlação de logs)', () => {
  it('devolve o id recebido e o registra no log da requisição', async () => {
    const resposta = await ambiente.api.get('/api/conversas').set('X-Request-Id', 'teste-123').expect(200)
    expect(resposta.headers['x-request-id']).toBe('teste-123')
    expect(ambiente.logs()).toContain('"id":"teste-123"')
  })

  it('gera um UUID quando o cliente não envia', async () => {
    const resposta = await ambiente.api.get('/api/conversas').expect(200)
    expect(resposta.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('troca ids com caracteres inválidos (evita injeção no log)', async () => {
    const resposta = await ambiente.api.get('/api/conversas').set('X-Request-Id', 'a"b{c}').expect(200)
    expect(resposta.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('respostas gerais', () => {
  it('devolve 404 em JSON para rota inexistente', async () => {
    const resposta = await ambiente.api.get('/api/nao-existe').expect(404)
    expect(resposta.body).toEqual({ erro: 'Rota não encontrada.' })
  })

  it('envia cabeçalhos de segurança e não expõe o framework', async () => {
    const resposta = await ambiente.api.get('/health')
    expect(resposta.headers['x-content-type-options']).toBe('nosniff')
    expect(resposta.headers['x-powered-by']).toBeUndefined()
  })
})
