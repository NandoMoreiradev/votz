import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GoogleGenerativeAI, TaskType, type EmbedContentRequest } from '@google/generative-ai'

/** Tamanho da coluna `reports.embedding` (pgvector). O modelo novo devolve 3072 e é reduzido para este tamanho. */
export const EMBEDDING_DIMENSIONS = 768
/** O modelo antigo (`embedding-001`) foi desligado pelo Google (404). */
export const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001'
const MAX_INPUT_CHARS = 8000

/** `document` para o texto que fica guardado; `query` para o que a pessoa digita ao buscar. */
export type EmbeddingKind = 'document' | 'query'

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name)
  private readonly client: GoogleGenerativeAI
  private readonly modelName: string

  constructor(private readonly config: ConfigService) {
    this.client = new GoogleGenerativeAI(config.getOrThrow<string>('GOOGLE_AI_API_KEY'))
    this.modelName = config.get<string>('EMBEDDING_MODEL')?.trim() || DEFAULT_EMBEDDING_MODEL
  }

  async embed(text: string, kind: EmbeddingKind = 'document'): Promise<number[]> {
    const model = this.client.getGenerativeModel({ model: this.modelName })
    const request: EmbedContentRequest & { outputDimensionality: number } = {
      content: { role: 'user', parts: [{ text: text.slice(0, MAX_INPUT_CHARS) }] },
      taskType: kind === 'query' ? TaskType.RETRIEVAL_QUERY : TaskType.RETRIEVAL_DOCUMENT,
      outputDimensionality: EMBEDDING_DIMENSIONS,
    }
    const result = await model.embedContent(request)
    const values = result.embedding.values
    // Um vetor do tamanho errado quebraria a coluna do banco (e uma busca silenciosamente errada é pior que um erro).
    if (values.length !== EMBEDDING_DIMENSIONS || !values.every(Number.isFinite)) {
      this.logger.error(`Embedding inválido do modelo ${this.modelName}: ${values.length} dimensões`)
      throw new Error(`Embedding inválido: esperado ${EMBEDDING_DIMENSIONS} números`)
    }
    return values
  }
}
