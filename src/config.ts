import { z } from 'zod'

const SEGREDOS_DE_DESENVOLVIMENTO = {
  WHATSAPP_APP_SECRET: 'segredo-de-desenvolvimento',
  WHATSAPP_VERIFY_TOKEN: 'token-de-verificacao',
  TELEGRAM_SECRET_TOKEN: 'segredo-telegram',
}

const Esquema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGO_URL: z.string().optional(),
  MONGO_DB: z.string().default('chatflow'),
  WHATSAPP_APP_SECRET: z.string().min(1).default(SEGREDOS_DE_DESENVOLVIMENTO.WHATSAPP_APP_SECRET),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1).default(SEGREDOS_DE_DESENVOLVIMENTO.WHATSAPP_VERIFY_TOKEN),
  TELEGRAM_SECRET_TOKEN: z.string().min(1).default(SEGREDOS_DE_DESENVOLVIMENTO.TELEGRAM_SECRET_TOKEN),
  /** 0 = domingo ... 6 = sábado */
  ATENDIMENTO_DIAS: z
    .string()
    .regex(/^[0-6]-[0-6]$/)
    .default('1-5'),
  ATENDIMENTO_HORARIO: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]|24):[0-5]\d$/)
    .default('08:00-18:00'),
  FUSO_HORARIO: z.string().default('America/Sao_Paulo'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})

export type Config = z.infer<typeof Esquema>

export function lerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = Esquema.parse(env)
  if (config.NODE_ENV === 'production') {
    const padrao = Object.entries(SEGREDOS_DE_DESENVOLVIMENTO).filter(
      ([chave, valor]) => config[chave as keyof Config] === valor,
    )
    if (padrao.length) throw new Error(`Defina em produção: ${padrao.map(([chave]) => chave).join(', ')}`)
  }
  return config
}
