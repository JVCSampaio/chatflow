export interface Expediente {
  /** 0 = domingo ... 6 = sábado */
  diaInicial: number
  diaFinal: number
  /** Minutos desde 00:00; o fim é exclusivo (18:00 já está fora). */
  minutoInicial: number
  minutoFinal: number
  fuso: string
}

const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const NOMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

const minutos = (hora: string) => {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

/** Lê "1-5" (segunda a sexta) e "08:00-18:00". */
export function lerExpediente(dias: string, horario: string, fuso: string): Expediente {
  const [diaInicial, diaFinal] = dias.split('-').map(Number)
  const [inicio, fim] = horario.split('-')
  return { diaInicial, diaFinal, minutoInicial: minutos(inicio), minutoFinal: minutos(fim), fuso }
}

export function dentroDoExpediente(agora: Date, expediente: Expediente): boolean {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: expediente.fuso,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(agora)
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  const dia = DIAS[parte('weekday')]
  const minuto = Number(parte('hour')) * 60 + Number(parte('minute'))
  return (
    dia >= expediente.diaInicial &&
    dia <= expediente.diaFinal &&
    minuto >= expediente.minutoInicial &&
    minuto < expediente.minutoFinal
  )
}

const hora = (minuto: number) =>
  `${String(Math.floor(minuto / 60)).padStart(2, '0')}h${minuto % 60 ? String(minuto % 60).padStart(2, '0') : ''}`

/** Ex.: "de segunda a sexta, das 08h às 18h". */
export function descreverExpediente(e: Expediente): string {
  return `de ${NOMES[e.diaInicial]} a ${NOMES[e.diaFinal]}, das ${hora(e.minutoInicial)} às ${hora(e.minutoFinal)}`
}
