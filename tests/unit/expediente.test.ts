import { describe, expect, it } from 'vitest'
import { dentroDoExpediente, descreverExpediente, lerExpediente } from '../../src/bot/expediente.ts'

const comercial = lerExpediente('1-5', '08:00-18:00', 'America/Sao_Paulo')

describe('dentroDoExpediente (segunda a sexta, 08:00 às 18:00, horário de Brasília)', () => {
  // Datas em UTC; Brasília é UTC-3. Os limites são o ponto mais provável de erro.
  it.each([
    ['2026-10-23T10:59:00Z', 'sexta 07:59', false],
    ['2026-10-23T11:00:00Z', 'sexta 08:00 (abertura)', true],
    ['2026-10-23T20:59:00Z', 'sexta 17:59', true],
    ['2026-10-23T21:00:00Z', 'sexta 18:00 (fechamento não incluído)', false],
    ['2026-10-24T13:00:00Z', 'sábado 10:00', false],
    ['2026-10-25T13:00:00Z', 'domingo 10:00', false],
    ['2026-10-26T11:00:00Z', 'segunda 08:00', true],
    ['2026-10-24T01:30:00Z', 'sexta 22:30 (já é sábado em UTC)', false],
  ])('%s = %s → %s', (utc, _local, esperado) => {
    expect(dentroDoExpediente(new Date(utc), comercial)).toBe(esperado)
  })

  it('aceita expediente de 24 horas, todos os dias', () => {
    const sempre = lerExpediente('0-6', '00:00-24:00', 'America/Sao_Paulo')
    expect(dentroDoExpediente(new Date('2026-10-25T03:00:00Z'), sempre)).toBe(true)
  })

  it('descreve o expediente para o cliente', () => {
    expect(descreverExpediente(comercial)).toBe('de segunda a sexta, das 08h às 18h')
    expect(descreverExpediente(lerExpediente('1-6', '08:30-12:00', 'America/Sao_Paulo'))).toBe(
      'de segunda a sábado, das 08h30 às 12h',
    )
  })
})
