import { describe, expect, it } from 'vitest'
import { lerConfig } from '../../src/config.ts'
import { criarMetricas } from '../../src/metricas.ts'

describe('lerConfig', () => {
  it('usa valores de desenvolvimento quando nada é informado', () => {
    expect(lerConfig({})).toMatchObject({
      PORT: 3000,
      ATENDIMENTO_DIAS: '1-5',
      ATENDIMENTO_HORARIO: '08:00-18:00',
      FUSO_HORARIO: 'America/Sao_Paulo',
    })
  })

  it('exige segredos próprios em produção', () => {
    expect(() => lerConfig({ NODE_ENV: 'production', WHATSAPP_APP_SECRET: 'x' })).toThrow(
      'Defina em produção: WHATSAPP_VERIFY_TOKEN, TELEGRAM_SECRET_TOKEN',
    )
    const producao = {
      NODE_ENV: 'production',
      WHATSAPP_APP_SECRET: 'a',
      WHATSAPP_VERIFY_TOKEN: 'b',
      TELEGRAM_SECRET_TOKEN: 'c',
    }
    expect(lerConfig(producao).NODE_ENV).toBe('production')
  })

  it.each([
    ['ATENDIMENTO_HORARIO', '8h-18h'],
    ['ATENDIMENTO_HORARIO', '08:00-25:00'],
    ['ATENDIMENTO_DIAS', '1-7'],
    ['PORT', 'abc'],
  ])('recusa %s=%s', (chave, valor) => {
    expect(() => lerConfig({ [chave]: valor })).toThrow()
  })
})

describe('criarMetricas', () => {
  it('inclui as métricas do processo Node quando pedido', async () => {
    const { registro } = criarMetricas({ padrao: true })
    expect(await registro.metrics()).toContain('chatflow_process_cpu_user_seconds_total')
  })
})
