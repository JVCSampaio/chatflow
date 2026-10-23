// Mascaramento de dados pessoais (LGPD): mostra o suficiente para conferir, sem expor o dado inteiro.

const CPF = /\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b/g

/** "123.456.789-09" vira "***.456.789-**" (padrão usado em serviços públicos). */
export const mascararCpfs = (texto: string) => texto.replace(CPF, (_cpf, _a, meio, fim) => `***.${meio}.${fim}-**`)

/** Mantém só os 4 últimos dígitos: "5532999990000" vira "*********0000". */
export function mascararTelefone(numero: string) {
  const digitos = numero.replace(/\D/g, '')
  return digitos.length <= 4 ? '****' : '*'.repeat(digitos.length - 4) + digitos.slice(-4)
}

/** "ana.souza@example.com" vira "a***@example.com". */
export function mascararEmail(email: string) {
  const [usuario, dominio] = email.split('@')
  return `${usuario.slice(0, 1)}***@${dominio}`
}
