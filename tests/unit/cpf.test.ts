import { describe, expect, it } from 'vitest'
import { cpfValido } from '../../src/bot/cpf.ts'

describe('cpfValido', () => {
  it.each([
    ['123.456.789-09', 'com pontuação'],
    ['12345678909', 'só números'],
    ['111.444.777-35', 'outro CPF válido'],
    ['  123.456.789-09  ', 'com espaços nas pontas'],
  ])('aceita %s (%s)', (cpf) => {
    expect(cpfValido(cpf)).toBe(true)
  })

  it.each([
    ['123.456.789-19', 'primeiro dígito verificador errado'],
    ['123.456.789-00', 'segundo dígito verificador errado'],
    ['1234567890', '10 dígitos'],
    ['123456789091', '12 dígitos'],
    ['111.111.111-11', 'todos os dígitos iguais'],
    ['000.000.000-00', 'zeros'],
    ['123.456.789/09', 'separador inválido'],
    ['abc.def.ghi-jk', 'letras'],
    ['', 'vazio'],
  ])('recusa %s (%s)', (cpf) => {
    expect(cpfValido(cpf)).toBe(false)
  })
})
