import { mkdir, writeFile } from 'node:fs/promises'
import { Builder, type WebDriver } from 'selenium-webdriver'
import { Options } from 'selenium-webdriver/chrome.js'

export const URL_BASE = process.env.CHATFLOW_URL ?? 'http://127.0.0.1:3000'

/** Chrome sem janela (HEADLESS=false para assistir). O Selenium Manager baixa o driver compatível. */
export function abrirNavegador(largura = 1280, altura = 900): Promise<WebDriver> {
  const opcoes = new Options()
  opcoes.addArguments(`--window-size=${largura},${altura}`, '--lang=pt-BR')
  if (process.env.HEADLESS !== 'false') opcoes.addArguments('--headless=new')
  if (process.env.CI) opcoes.addArguments('--no-sandbox', '--disable-dev-shm-usage')
  return new Builder().forBrowser('chrome').setChromeOptions(opcoes).build()
}

export async function salvarTela(driver: WebDriver, arquivo: string) {
  await mkdir(arquivo.slice(0, arquivo.lastIndexOf('/')), { recursive: true })
  await writeFile(arquivo, await driver.takeScreenshot(), 'base64')
}
