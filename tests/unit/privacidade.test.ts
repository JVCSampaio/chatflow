import { describe, expect, it } from 'vitest'
import { mascararCpfs, mascararEmail, mascararTelefone } from '../../src/privacidade.ts'

describe('mascararCpfs', () => {
  it.each([
    ['123.456.789-09', '***.456.789-**'],
    ['12345678909', '***.456.789-**'],
    ['meu cpf é 111.444.777-35, obrigado', 'meu cpf é ***.444.777-**, obrigado'],
    ['dois: 12345678909 e 111.444.777-35', 'dois: ***.456.789-** e ***.444.777-**'],
  ])('%s → %s', (texto, esperado) => {
    expect(mascararCpfs(texto)).toBe(esperado)
  })

  it.each(['pedido 12345', 'protocolo 2026102312', 'opção 1'])('não altera números que não são CPF: %s', (texto) => {
    expect(mascararCpfs(texto)).toBe(texto)
  })
})

describe('mascararTelefone', () => {
  it('mantém só os 4 últimos dígitos', () => {
    expect(mascararTelefone('5532999990000')).toBe('*********0000')
    expect(mascararTelefone('+55 (32) 99999-0000')).toBe('*********0000')
  })

  it('mascara tudo quando o número é curto', () => {
    expect(mascararTelefone('123')).toBe('****')
  })
})

describe('mascararEmail', () => {
  it('mantém a primeira letra e o domínio', () => {
    expect(mascararEmail('ana.souza@example.com')).toBe('a***@example.com')
  })
})
