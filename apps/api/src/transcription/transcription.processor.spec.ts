import { ConfigService } from '@nestjs/config'
import { Job } from 'bullmq'
import { isCommentMediaKey } from '../storage/storage.service'
import { TranscriptionProcessor } from './transcription.processor'
import { TranscriptionJob } from './transcription.service'

describe('TranscriptionProcessor (A3)', () => {
  function makeProcessor() {
    const prisma = {
      comment: { update: jest.fn().mockResolvedValue({ id: 'c1' }) },
    }
    const storage = {
      getSignedDownloadUrl: jest.fn().mockResolvedValue('https://r2.signed.example/audio.webm'),
    }
    const config = {
      getOrThrow: jest.fn().mockReturnValue('groq-test-key'),
    } as unknown as ConfigService

    const processor = new TranscriptionProcessor(prisma as any, storage as any, config)
    return { processor, prisma, storage }
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it.each([
    'verification/11111111-1111-4111-8111-111111111111.pdf',
    'verification/11111111-1111-4111-8111-111111111111.webm',
    'exports/11111111-1111-4111-8111-111111111111.webm',
    'reports/11111111-1111-4111-8111-111111111111.mp4',
    'comments/not-a-uuid.webm',
    'comments/../verification/11111111-1111-4111-8111-111111111111.webm',
    'comments/11111111-1111-4111-8111-111111111111.pdf',
  ])('rejects invalid mediaKey "%s" without calling storage', async (mediaKey) => {
    const { processor, storage } = makeProcessor()

    await expect(
      processor.process({ data: { commentId: 'c1', mediaKey } } as Job<TranscriptionJob>),
    ).rejects.toThrow('Chave de mídia inválida')

    expect(storage.getSignedDownloadUrl).not.toHaveBeenCalled()
  })

  it('signs and transcribes a valid comments/<uuid>.<ext> mediaKey derived from StorageService', async () => {
    const validKey = 'comments/11111111-1111-4111-8111-111111111111.webm'
    expect(isCommentMediaKey(validKey)).toBe(true)

    const { processor, prisma, storage } = makeProcessor()
    ;(processor as any).groq = {
      audio: {
        transcriptions: {
          create: jest.fn().mockResolvedValue({ text: 'Texto transcrito' }),
        },
      },
    }

    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    } as Response)

    await processor.process({
      data: { commentId: 'c1', mediaKey: validKey },
    } as Job<TranscriptionJob>)

    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(validKey, 300)
    expect(fetchSpy).toHaveBeenCalledWith('https://r2.signed.example/audio.webm')
    expect(prisma.comment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { transcript: 'Texto transcrito' },
    })
  })
})
