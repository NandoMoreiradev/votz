import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GoogleGenerativeAI } from '@google/generative-ai'

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name)
  private readonly client: GoogleGenerativeAI

  constructor(private readonly config: ConfigService) {
    this.client = new GoogleGenerativeAI(config.getOrThrow<string>('GOOGLE_AI_API_KEY'))
  }

  async embed(text: string): Promise<number[]> {
    const model = this.client.getGenerativeModel({ model: 'embedding-001' })
    const result = await model.embedContent(text)
    return result.embedding.values
  }
}
