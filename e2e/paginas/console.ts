import { By, until, type WebDriver } from 'selenium-webdriver'
import { URL_BASE } from '../apoio/navegador.ts'

const ESPERA = 10_000

/** Page Object do console do atendente. */
export class PaginaDoConsole {
  readonly #driver: WebDriver

  constructor(driver: WebDriver) {
    this.#driver = driver
  }

  async abrir(atendente: string) {
    await this.#driver.get(`${URL_BASE}/atendente`)
    const campo = await this.#driver.wait(until.elementLocated(By.css('label.nome input')), ESPERA)
    await campo.sendKeys(atendente)
  }

  /** A fila é atualizada a cada 2 s; espera a conversa do protocolo aparecer e a assume. */
  async assumir(protocolo: string) {
    const botao = await this.#driver.wait(
      until.elementLocated(By.css(`button[aria-label="Assumir ${protocolo}"]`)),
      ESPERA,
      `Conversa ${protocolo} não apareceu na fila`,
    )
    await this.#driver.wait(until.elementIsEnabled(botao), ESPERA)
    await botao.click()
    await this.#driver.wait(until.elementLocated(By.css('#resposta')), ESPERA)
  }

  async responder(texto: string) {
    await this.#driver.findElement(By.css('#resposta')).sendKeys(texto)
    await this.#driver.findElement(By.xpath('//form[@class="envio"]//button[normalize-space()="Enviar"]')).click()
    await this.esperarMensagem('atendente', texto)
  }

  async esperarMensagem(autor: 'cliente' | 'atendente', trecho: string) {
    await this.#driver.wait(
      async () => {
        const elementos = await this.#driver.findElements(By.css(`li.mensagem[data-autor="${autor}"] p`))
        const textos = await Promise.all(elementos.map((elemento) => elemento.getText()))
        return textos.some((texto) => texto.includes(trecho))
      },
      ESPERA,
      `Nenhuma mensagem de ${autor} com "${trecho}"`,
    )
  }

  async encerrar() {
    await this.#driver.findElement(By.xpath('//button[normalize-space()="Encerrar atendimento"]')).click()
    const aviso = await this.#driver.wait(until.elementLocated(By.css('[role="status"]')), ESPERA)
    await this.#driver.wait(until.elementTextIs(aviso, 'Conversa encerrada.'), ESPERA)
  }
}
