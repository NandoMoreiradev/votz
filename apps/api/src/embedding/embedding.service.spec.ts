import { GoogleGenerativeAI } from '@google/generative-ai'
import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, EmbeddingService } from './embedding.service'

const embedContentMock = jest.fn()
const getGenerativeModelMock = jest.fn(() => ({ embedContent: embedContentMock }))

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(() => ({
    getGenerativeModel: getGenerativeModelMock,
  })),
  TaskType: { RETRIEVAL_QUERY: 'RETRIEVAL_QUERY', RETRIEVAL_DOCUMENT: 'RETRIEVAL_DOCUMENT' },
}))

const vector = (n = EMBEDDING_DIMENSIONS) => Array.from({ length: n }, (_, i) => (i + 1) / 1000)
const configWith = (extra: Record<string, string> = {}): any => ({
  getOrThrow: jest.fn().mockReturnValue('fake-gemini-key'),
  get: jest.fn((k: string) => extra[k]),
})

describe('EmbeddingService', () => {
  beforeEach(() => jest.clearAllMocks())

  it('usa o modelo atual (o embedding-001 antigo deu 404), 768 dimensões e tipo "documento" por padrão', async () => {
    embedContentMock.mockResolvedValue({ embedding: { values: vector() } })
    const service = new EmbeddingService(configWith())
    const vec = await service.embed('Buraco na avenida principal')

    expect(GoogleGenerativeAI).toHaveBeenCalledWith('fake-gemini-key')
    expect(getGenerativeModelMock).toHaveBeenCalledWith({ model: DEFAULT_EMBEDDING_MODEL })
    expect(DEFAULT_EMBEDDING_MODEL).toBe('gemini-embedding-001')
    expect(embedContentMock).toHaveBeenCalledWith({
      content: { role: 'user', parts: [{ text: 'Buraco na avenida principal' }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: 768,
    })
    expect(vec).toHaveLength(768)
  })

  it('busca digitada usa o tipo "consulta"; o modelo pode ser trocado por EMBEDDING_MODEL', async () => {
    embedContentMock.mockResolvedValue({ embedding: { values: vector() } })
    const service = new EmbeddingService(configWith({ EMBEDDING_MODEL: ' outro-modelo ' }))
    await service.embed('falta de remédio', 'query')
    expect(getGenerativeModelMock).toHaveBeenCalledWith({ model: 'outro-modelo' })
    expect(embedContentMock).toHaveBeenCalledWith(expect.objectContaining({ taskType: 'RETRIEVAL_QUERY' }))
  })

  it('corta texto muito longo antes de mandar', async () => {
    embedContentMock.mockResolvedValue({ embedding: { values: vector() } })
    await new EmbeddingService(configWith()).embed('a'.repeat(20_000))
    const sent = embedContentMock.mock.calls[0][0].content.parts[0].text as string
    expect(sent).toHaveLength(8000)
  })

  it('recusa vetor do tamanho errado ou com valor inválido (não deixa estragar a coluna do banco)', async () => {
    const service = new EmbeddingService(configWith())
    embedContentMock.mockResolvedValueOnce({ embedding: { values: vector(3072) } })
    await expect(service.embed('x')).rejects.toThrow(/Embedding inválido/)
    embedContentMock.mockResolvedValueOnce({ embedding: { values: [...vector(767), Number.NaN] } })
    await expect(service.embed('x')).rejects.toThrow(/Embedding inválido/)
  })
})
