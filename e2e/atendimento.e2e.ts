import type { WebDriver } from 'selenium-webdriver'
import { describe, expect, it, onTestFinished } from 'vitest'
import { abrirNavegador, salvarTela } from './apoio/navegador.ts'
import { PaginaDoConsole } from './paginas/console.ts'
import { PaginaDoWebchat } from './paginas/webchat.ts'

/** Navegadores novos (sessão limpa) para o teste; fechados no fim, com captura da tela em caso de falha. */
function navegadores() {
  const abertos: { nome: string; driver: WebDriver }[] = []
  onTestFinished(async ({ task }) => {
    for (const { nome, driver } of abertos) {
      if (task.result?.state === 'fail') {
        await salvarTela(driver, `reports/e2e/${task.name}-${nome}.png`).catch(() => undefined)
      }
      await driver.quit()
    }
  })
  return async (nome: string, largura?: number, altura?: number) => {
    const driver = await abrirNavegador(largura, altura)
    abertos.push({ nome, driver })
    return driver
  }
}

describe('webchat do cliente', () => {
  it('consulta a segunda via sem ajuda de atendente', async () => {
    const abrir = navegadores()
    const webchat = new PaginaDoWebchat(await abrir('cliente'))
    await webchat.abrir()
    await webchat.enviar('oi')
    await webchat.esperarMensagem('bot', '1 - Segunda via da fatura')
    await webchat.enviar('1')
    await webchat.esperarMensagem('bot', 'informe o CPF do titular')
    await webchat.enviar('123.456.789-09')
    await webchat.esperarMensagem('bot', 'Enviei a segunda via para a***@example.com')
    expect(await webchat.textosDe('cliente')).toContain('***.456.789-**')
  })

  it('funciona em tela de celular sem rolagem horizontal', async () => {
    const abrir = navegadores()
    const webchat = new PaginaDoWebchat(await abrir('celular', 390, 844))
    await webchat.abrir()
    await webchat.enviar('oi')
    await webchat.esperarMensagem('bot', '3 - Falar com um atendente')
    expect(await webchat.temRolagemHorizontal()).toBe(false)
  })
})

describe('cliente e atendente em tempo real', () => {
  it('cliente pede atendente; a atendente assume, conversa e encerra', async () => {
    const abrir = navegadores()
    const webchat = new PaginaDoWebchat(await abrir('cliente'))
    const atendente = new PaginaDoConsole(await abrir('atendente'))

    await webchat.abrir()
    await webchat.enviar('oi')
    await webchat.enviar('atendente')
    await webchat.esperarMensagem('bot', 'Você está na fila')
    await webchat.esperarSituacao('Aguardando atendente')
    const protocolo = await webchat.protocolo()

    await atendente.abrir('Marina')
    await atendente.assumir(protocolo)
    await webchat.esperarSituacao('Em atendimento com Marina')

    await atendente.responder('Oi, sou a Marina. Como posso ajudar?')
    await webchat.esperarMensagem('atendente', 'Oi, sou a Marina. Como posso ajudar?')

    await webchat.enviar('Minha internet caiu de novo')
    await atendente.esperarMensagem('cliente', 'Minha internet caiu de novo')

    await atendente.encerrar()
    await webchat.esperarMensagem('bot', 'O atendente encerrou a conversa')
    await webchat.esperarSituacao('Atendimento encerrado')
  })
})
