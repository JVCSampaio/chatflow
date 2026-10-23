import { describe, expect, it } from 'vitest'
import { lerTelegram, segredoValido } from '../../src/canais/telegram.ts'
import { lerWebchat } from '../../src/canais/webchat.ts'
import { assinaturaValida, lerWhatsapp } from '../../src/canais/whatsapp.ts'
import { assinar, SEGREDO_WHATSAPP, telegram, whatsapp, whatsappStatus } from '../apoio/canais.ts'

describe('WhatsApp', () => {
  it('converte mensagem de texto para o formato interno', () => {
    expect(lerWhatsapp(whatsapp('5532999990000', 'oi', 'wamid.1', 'Ana'))).toEqual([
      {
        canal: 'whatsapp',
        idExterno: 'wamid.1',
        contato: { id: '5532999990000', nome: 'Ana' },
        tipo: 'texto',
        texto: 'oi',
      },
    ])
  })

  it('aceita mensagem sem o bloco de contatos (nome desconhecido)', () => {
    const payload = whatsapp('5532999990000', 'oi')
    delete (payload.entry[0].changes[0].value as { contacts?: unknown }).contacts
    expect(lerWhatsapp(payload)[0].contato).toEqual({ id: '5532999990000', nome: null })
  })

  it('marca áudio como mídia', () => {
    const [mensagem] = lerWhatsapp(whatsapp('5532999990000', { type: 'audio', audio: { id: 'a1' } }))
    expect(mensagem).toMatchObject({ tipo: 'midia', texto: '' })
  })

  it('ignora confirmações de entrega e leitura', () => {
    expect(lerWhatsapp(whatsappStatus('5532999990000'))).toEqual([])
  })

  it.each([
    ['objeto de outro produto', { ...whatsapp('1', 'oi'), object: 'page' }],
    ['sem entradas', { object: 'whatsapp_business_account', entry: [] }],
    ['corpo vazio', {}],
  ])('recusa payload inválido: %s', (_caso, payload) => {
    expect(() => lerWhatsapp(payload)).toThrow()
  })

  describe('assinatura X-Hub-Signature-256', () => {
    const corpo = JSON.stringify(whatsapp('5532999990000', 'oi'))

    it('aceita HMAC-SHA256 do corpo com o segredo do app', () => {
      expect(assinaturaValida(Buffer.from(corpo), assinar(corpo), SEGREDO_WHATSAPP)).toBe(true)
    })

    it.each([
      ['segredo errado', assinar(corpo, 'outro-segredo')],
      ['corpo alterado depois de assinado', assinar(corpo.replace('oi', 'xx'))],
      ['sem prefixo sha256=', assinar(corpo).slice('sha256='.length)],
      ['hexadecimal truncado', assinar(corpo).slice(0, 20)],
      ['cabeçalho ausente', undefined],
    ])('recusa: %s', (_caso, cabecalho) => {
      expect(assinaturaValida(Buffer.from(corpo), cabecalho, SEGREDO_WHATSAPP)).toBe(false)
    })
  })
})

describe('Telegram', () => {
  it('usa o chat como contato e o update_id para deduplicar', () => {
    expect(lerTelegram(telegram(777, 'oi', 9001, 'Bruno'))).toEqual([
      { canal: 'telegram', idExterno: '9001', contato: { id: '777', nome: 'Bruno' }, tipo: 'texto', texto: 'oi' },
    ])
  })

  it('aceita mensagem sem remetente (ex.: post de canal)', () => {
    const { from: _remetente, ...mensagem } = telegram(777, 'oi', 9004).message
    expect(lerTelegram({ update_id: 9004, message: mensagem })[0].contato).toEqual({ id: '777', nome: null })
  })

  it('marca foto como mídia', () => {
    expect(lerTelegram(telegram(777, undefined, 9002))[0].tipo).toBe('midia')
  })

  it('ignora updates sem mensagem nova (ex.: edição)', () => {
    expect(lerTelegram({ update_id: 9003, edited_message: { message_id: 1 } })).toEqual([])
  })

  it.each([
    ['segredo-telegram', true],
    ['segredo-errado', false],
    ['segredo-telegram-maior', false],
    [undefined, false],
  ])('segredo %s → %s', (cabecalho, esperado) => {
    expect(segredoValido(cabecalho, 'segredo-telegram')).toBe(esperado)
  })
})

describe('Webchat', () => {
  const sessao = '0b8c36f5-9f53-4a7f-8d4d-3a1a6fbb2a51'

  it('remove espaços nas pontas do texto', () => {
    expect(lerWebchat({ sessao, texto: '  oi  ' })).toMatchObject({ contato: { id: sessao }, texto: 'oi' })
  })

  it.each([
    ['texto vazio', { sessao, texto: '   ' }],
    ['texto com 1001 caracteres', { sessao, texto: 'a'.repeat(1001) }],
    ['sessão que não é UUID', { sessao: 'abc', texto: 'oi' }],
    ['campo não previsto', { sessao, texto: 'oi', canal: 'whatsapp' }],
  ])('recusa %s', (_caso, corpo) => {
    expect(() => lerWebchat(corpo)).toThrow()
  })

  it('aceita texto com exatamente 1000 caracteres', () => {
    expect(lerWebchat({ sessao, texto: 'a'.repeat(1000) }).texto).toHaveLength(1000)
  })
})
