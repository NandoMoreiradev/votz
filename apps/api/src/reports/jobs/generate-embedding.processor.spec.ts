import { EMBEDDING_BACKFILL_BATCH, GenerateEmbeddingProcessor } from './generate-embedding.processor'

const embedding = { embed: jest.fn() }
const repository = { updateEmbedding: jest.fn(), findWithoutEmbedding: jest.fn() }

const reports = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, title: `Título ${i}`, description: `Descrição ${i}` }))

describe('GenerateEmbeddingProcessor', () => {
  let processor: GenerateEmbeddingProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    embedding.embed.mockResolvedValue([0.1, 0.2])
    repository.updateEmbedding.mockResolvedValue(undefined)
    processor = new GenerateEmbeddingProcessor(embedding as any, repository as any)
  })

  it('relato novo: gera e grava o embedding', async () => {
    await processor.process({ name: 'generate-embedding', data: { reportId: 'r9', text: 'texto' } } as any)
    expect(embedding.embed).toHaveBeenCalledWith('texto')
    expect(repository.updateEmbedding).toHaveBeenCalledWith('r9', [0.1, 0.2])
  })

  it('preenchimento: pega um lote dos que faltam e grava um por um', async () => {
    repository.findWithoutEmbedding.mockResolvedValue(reports(3))
    await processor.process({ name: 'backfill-embeddings', data: {} } as any)
    expect(repository.findWithoutEmbedding).toHaveBeenCalledWith(EMBEDDING_BACKFILL_BATCH)
    expect(embedding.embed).toHaveBeenCalledTimes(3)
    expect(embedding.embed).toHaveBeenCalledWith('Título 0 Descrição 0')
    expect(repository.updateEmbedding).toHaveBeenCalledTimes(3)
  })

  it('falha de um relato não derruba o lote', async () => {
    repository.findWithoutEmbedding.mockResolvedValue(reports(3))
    embedding.embed.mockRejectedValueOnce(new Error('texto bloqueado')).mockResolvedValue([0.1])
    await expect(processor.backfill()).resolves.toEqual({ done: 2, failed: 1, stoppedByLimit: false })
  })

  it('limite de uso do Google (429) para o lote e deixa o resto para a próxima rodada', async () => {
    repository.findWithoutEmbedding.mockResolvedValue(reports(5))
    embedding.embed.mockResolvedValueOnce([0.1]).mockRejectedValueOnce(new Error('[429] Resource exhausted: quota'))
    await expect(processor.backfill()).resolves.toEqual({ done: 1, failed: 1, stoppedByLimit: true })
    expect(embedding.embed).toHaveBeenCalledTimes(2)
  })

  it('nada faltando: não chama a IA', async () => {
    repository.findWithoutEmbedding.mockResolvedValue([])
    await expect(processor.backfill()).resolves.toEqual({ done: 0, failed: 0, stoppedByLimit: false })
    expect(embedding.embed).not.toHaveBeenCalled()
  })

  it('trabalho desconhecido só avisa', async () => {
    await expect(processor.process({ name: 'outro', data: {} } as any)).resolves.toBeUndefined()
  })
})
