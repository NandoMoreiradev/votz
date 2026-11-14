import { GoogleGenerativeAI } from '@google/generative-ai'
import { EmbeddingService } from './embedding.service'

const embedContentMock = jest.fn()
const getGenerativeModelMock = jest.fn(() => ({ embedContent: embedContentMock }))

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(() => ({
    getGenerativeModel: getGenerativeModelMock,
  })),
}))

describe('EmbeddingService', () => {
  it('embeds text using GoogleGenerativeAI embedding-001 model', async () => {
    embedContentMock.mockResolvedValue({ embedding: { values: [0.1, 0.2, 0.3] } })
    const config: any = { getOrThrow: jest.fn().mockReturnValue('fake-gemini-key') }

    const service = new EmbeddingService(config)
    const vec = await service.embed('Buraco na avenida principal')

    expect(GoogleGenerativeAI).toHaveBeenCalledWith('fake-gemini-key')
    expect(getGenerativeModelMock).toHaveBeenCalledWith({ model: 'embedding-001' })
    expect(embedContentMock).toHaveBeenCalledWith('Buraco na avenida principal')
    expect(vec).toEqual([0.1, 0.2, 0.3])
  })
})
