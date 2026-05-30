import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import OpenAI, { toFile } from 'openai'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { TRANSCRIPTION_QUEUE, TranscriptionJob } from './transcription.service'

const EXT_MIME: Record<string, string> = {
  webm: 'audio/webm',
  mp4:  'audio/mp4',
  m4a:  'audio/mp4',
  ogg:  'audio/ogg',
  wav:  'audio/wav',
}

@Processor(TRANSCRIPTION_QUEUE)
export class TranscriptionProcessor extends WorkerHost {
  private readonly logger = new Logger(TranscriptionProcessor.name)
  private readonly groq: OpenAI

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    super()
    this.groq = new OpenAI({
      apiKey: config.getOrThrow<string>('GROQ_API_KEY'),
      baseURL: 'https://api.groq.com/openai/v1',
    })
  }

  async process(job: Job<TranscriptionJob>): Promise<void> {
    const { commentId, mediaKey } = job.data

    const signedUrl = await this.storage.getSignedDownloadUrl(mediaKey, 300)
    const response = await fetch(signedUrl)
    if (!response.ok) throw new Error(`Falha ao baixar áudio: ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())

    const ext = mediaKey.split('.').pop()?.toLowerCase() ?? 'webm'
    const mimeType = EXT_MIME[ext] ?? 'audio/webm'
    const file = await toFile(buffer, `audio.${ext}`, { type: mimeType })

    const result = await this.groq.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3',
      language: 'pt',
    })

    await this.prisma.comment.update({
      where: { id: commentId },
      data: { transcript: result.text },
    })

    this.logger.log(`Transcrição concluída para comentário ${commentId}`)
  }
}
