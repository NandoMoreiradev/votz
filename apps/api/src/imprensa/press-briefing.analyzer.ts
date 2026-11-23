import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const DEFAULT_BRIEFING_MODEL = 'gemini-2.5-flash'
const TIMEOUT_MS = 45_000

/** Cliente do Gemini para o briefing. Sem a chave, o briefing sai só com os números (sem texto de IA). */
@Injectable()
export class PressBriefingAnalyzer {
  private readonly logger = new Logger(PressBriefingAnalyzer.name)
  private readonly client: GoogleGenerativeAI | null
  readonly model: string

  constructor(config: ConfigService) {
    const key = config.get<string>('GOOGLE_AI_API_KEY')?.trim()
    this.client = key ? new GoogleGenerativeAI(key) : null
    this.model = config.get<string>('PRESS_BRIEFING_MODEL')?.trim() || DEFAULT_BRIEFING_MODEL
    if (!this.client) this.logger.warn('GOOGLE_AI_API_KEY ausente: o briefing de surto sai só com os números.')
  }

  get available(): boolean {
    return this.client !== null
  }

  /** Devolve o texto bruto (JSON) da IA. Falha por tempo, limite de uso ou resposta bloqueada vira erro. */
  async generate(prompt: string): Promise<string> {
    if (!this.client) throw new Error('IA indisponível')
    const model = this.client.getGenerativeModel({
      model: this.model,
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 4096 },
    })
    let timer: NodeJS.Timeout | undefined
    try {
      const result = await Promise.race([
        model.generateContent(prompt),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`A IA não respondeu em ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)
        }),
      ])
      return result.response.text()
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}
