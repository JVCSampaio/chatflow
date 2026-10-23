import { apenasDigitos } from './cpf.ts'

export interface Fatura {
  referencia: string
  valor: number
  vencimento: string
}

export interface Cliente {
  cpf: string
  nome: string
  email: string
  fatura: Fatura | null
}

// Base fictícia de demonstração. Os CPFs são os exemplos sequenciais clássicos de validação
// (123.456.789-09 e 111.444.777-35), não pertencem a clientes reais.
const CLIENTES: Cliente[] = [
  {
    cpf: '12345678909',
    nome: 'Ana Souza',
    email: 'ana.souza@example.com',
    fatura: { referencia: 'outubro/2026', valor: 99.9, vencimento: '2026-11-10' },
  },
  { cpf: '11144477735', nome: 'Bruno Lima', email: 'bruno.lima@example.com', fatura: null },
]

export const buscarCliente = (cpf: string) => CLIENTES.find((c) => c.cpf === apenasDigitos(cpf)) ?? null
