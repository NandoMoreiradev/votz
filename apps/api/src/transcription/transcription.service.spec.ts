import { TranscriptionService } from './transcription.service'

describe('TranscriptionService', () => {
  it('enqueues audio transcription job with deduplicated jobId and exponential backoff', async () => {
    const queue: any = { add: jest.fn().mockResolvedValue({ id: 'transcribe:c1' }) }
    const service = new TranscriptionService(queue)

    await service.enqueue({ commentId: 'c1', mediaKey: 'comments/a.webm' })

    expect(queue.add).toHaveBeenCalledWith(
      'transcribe',
      { commentId: 'c1', mediaKey: 'comments/a.webm' },
      expect.objectContaining({
        jobId: 'transcribe-c1',
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      }),
    )
  })
})
