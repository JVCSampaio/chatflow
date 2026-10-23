export const apenasDigitos = (texto: string) => texto.replace(/\D/g, '')

/** Aceita "12345678909" ou "123.456.789-09" e confere os dois dígitos verificadores. */
export function cpfValido(texto: string): boolean {
  if (!/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(texto.trim())) return false
  const digitos = apenasDigitos(texto)
  if (/^(\d)\1{10}$/.test(digitos)) return false
  const verificador = (quantidade: number) => {
    let soma = 0
    for (let i = 0; i < quantidade; i++) soma += Number(digitos[i]) * (quantidade + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return verificador(9) === Number(digitos[9]) && verificador(10) === Number(digitos[10])
}
