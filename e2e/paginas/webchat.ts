import { By, until, type WebDriver } from 'selenium-webdriver'
import { URL_BASE } from '../apoio/navegador.ts'

const ESPERA = 10_000

/** Page Object do webchat: os testes falam em "enviar" e "esperar resposta", não em seletores. */
export class PaginaDoWebchat {
  readonly #driver: WebDriver

  constructor(driver: WebDriver) {
    this.#driver = driver
  }

  async abrir() {
    await this.#driver.get(`${URL_BASE}/`)
    await this.#driver.wait(until.elementLocated(By.css('#mensagem')), ESPERA)
  }

  async enviar(texto: string) {
    const antes = (await this.#mensagens()).length
    await this.#driver.findElement(By.css('#mensagem')).sendKeys(texto)
    await this.#driver.findElement(By.css('form.envio button')).click()
    await this.#driver.wait(async () => (await this.#mensagens()).length > antes, ESPERA, `"${texto}" não foi enviado`)
  }

  async esperarMensagem(autor: 'bot' | 'atendente', trecho: string) {
    await this.#driver.wait(
      async () => (await this.textosDe(autor)).some((texto) => texto.includes(trecho)),
      ESPERA,
      `Nenhuma mensagem de ${autor} com "${trecho}"`,
    )
  }

  async esperarSituacao(situacao: string) {
    const selo = await this.#driver.findElement(By.css('[data-testid="situacao"]'))
    await this.#driver.wait(until.elementTextIs(selo, situacao), ESPERA)
  }

  async protocolo() {
    const elemento = await this.#driver.wait(until.elementLocated(By.css('[data-testid="protocolo"]')), ESPERA)
    return (await elemento.getText()).replace('Protocolo ', '')
  }

  async textosDe(autor: string) {
    const elementos = await this.#driver.findElements(By.css(`li.mensagem[data-autor="${autor}"] p`))
    return Promise.all(elementos.map((elemento) => elemento.getText()))
  }

  async temRolagemHorizontal() {
    return this.#driver.executeScript<boolean>(
      'return document.documentElement.scrollWidth > document.documentElement.clientWidth',
    )
  }

  #mensagens() {
    return this.#driver.findElements(By.css('li.mensagem'))
  }
}
