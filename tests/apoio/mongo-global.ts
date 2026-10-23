import { MongoMemoryServer } from 'mongodb-memory-server'
import type { TestProject } from 'vitest/node'

// Com MONGO_URL (CI com o MongoDB em container), usa esse servidor; sem ela, sobe um em memória.
// Cada arquivo de teste cria o próprio banco nesse servidor (ver ambiente.ts).
export default async function iniciarMongo(projeto: TestProject) {
  if (process.env.MONGO_URL) {
    projeto.provide('mongoUrl', process.env.MONGO_URL)
    return
  }
  const servidor = await MongoMemoryServer.create()
  projeto.provide('mongoUrl', servidor.getUri())
  return async () => {
    await servidor.stop()
  }
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUrl: string
  }
}
