import { FlagReason, FlagSource, FlagStatus, FlagTargetType, ModerationStatus } from '@prisma/client'
import { ContentSafetyProcessor } from './content-safety.processor'

describe('ContentSafetyProcessor', () => {
  const analyzer = {
    isAvailable: jest.fn(),
    modelName: 'gemini-2.5-flash',
    analyze: jest.fn(),
  }

  const prisma = {
    contentFlag: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    report: {
      updateMany: jest.fn(),
    },
  }

  let processor: ContentSafetyProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    analyzer.isAvailable.mockReturnValue(true)
    prisma.contentFlag.findFirst.mockResolvedValue(null)
    prisma.contentFlag.create.mockResolvedValue({ id: 'flag-1' })
    prisma.report.updateMany.mockResolvedValue({ count: 1 })
    processor = new ContentSafetyProcessor(analyzer as any, prisma as any)
  })

  it('conteúdo limpo: não abre flag e não altera moderationStatus', async () => {
    analyzer.analyze.mockResolvedValue({
      findings: [],
      confidence: 0.95,
      explanation: 'Relato objetivo sobre buraco na via pública.',
    })

    const res = await processor.review({
      targetType: 'REPORT',
      targetId: 'rep-1',
      texts: ['Buraco na Avenida Paulista', 'Aberto há duas semanas causando risco.'],
    })

    expect(res).toEqual({ action: 'ALLOW', flagged: false })
    expect(prisma.contentFlag.create).not.toHaveBeenCalled()
    expect(prisma.report.updateMany).not.toHaveBeenCalled()
  })

  it('abuso grave em relato (confiança >= 0.85): cria flag AUTO_AI e coloca relato em quarentena (HIDDEN)', async () => {
    analyzer.analyze.mockResolvedValue({
      findings: [{ category: 'hate_speech', confidence: 0.93 }],
      confidence: 0.93,
      explanation: 'Discurso de ódio explícito.',
    })

    const res = await processor.review({
      targetType: 'REPORT',
      targetId: 'rep-2',
      texts: ['Texto ofensivo'],
    })

    expect(res).toEqual({ action: 'QUARANTINE', flagged: true })
    expect(prisma.contentFlag.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetType: FlagTargetType.REPORT,
        targetId: 'rep-2',
        reason: FlagReason.OFFENSIVE,
        source: FlagSource.AUTO_AI,
        reporterId: null,
      }),
    })
    expect(prisma.report.updateMany).toHaveBeenCalledWith({
      where: { id: 'rep-2' },
      data: { moderationStatus: ModerationStatus.HIDDEN },
    })
  })

  it('suspeita média em relato: cria flag AUTO_AI e marca UNDER_REVIEW (sem ocultar)', async () => {
    analyzer.analyze.mockResolvedValue({
      findings: [{ category: 'defamation', confidence: 0.68 }],
      confidence: 0.72,
      explanation: 'Acusação pessoal sem evidência.',
    })

    const res = await processor.review({
      targetType: 'REPORT',
      targetId: 'rep-3',
      texts: ['Fulano é ladrão'],
    })

    expect(res).toEqual({ action: 'FLAG_FOR_REVIEW', flagged: true })
    expect(prisma.report.updateMany).toHaveBeenCalledWith({
      where: { id: 'rep-3' },
      data: { moderationStatus: ModerationStatus.UNDER_REVIEW },
    })
  })

  it('comentário ou publicação sinalizado: cria flag AUTO_AI sem chamar report.updateMany', async () => {
    analyzer.analyze.mockResolvedValue({
      findings: [{ category: 'profanity_insult', confidence: 0.88 }],
      confidence: 0.9,
      explanation: 'Xingamento direto contra outro usuário.',
    })

    const res = await processor.review({
      targetType: 'POST_COMMENT',
      targetId: 'pc-1',
      texts: ['Você é um completo idiota'],
    })

    expect(res).toEqual({ action: 'QUARANTINE', flagged: true })
    expect(prisma.contentFlag.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetType: FlagTargetType.POST_COMMENT,
        targetId: 'pc-1',
        source: FlagSource.AUTO_AI,
      }),
    })
    expect(prisma.report.updateMany).not.toHaveBeenCalled()
  })

  it('não duplica flag AUTO_AI se já existir uma aberta para o mesmo alvo', async () => {
    prisma.contentFlag.findFirst.mockResolvedValue({ id: 'flag-existing' })
    analyzer.analyze.mockResolvedValue({
      findings: [{ category: 'spam', confidence: 0.8 }],
      confidence: 0.8,
      explanation: 'Propaganda comercial.',
    })

    await processor.review({ targetType: 'POST', targetId: 'post-1', texts: ['Compre agora!'] })

    expect(prisma.contentFlag.findFirst).toHaveBeenCalledWith({
      where: {
        targetType: FlagTargetType.POST,
        targetId: 'post-1',
        source: FlagSource.AUTO_AI,
        status: FlagStatus.OPEN,
      },
      select: { id: true },
    })
    expect(prisma.contentFlag.create).not.toHaveBeenCalled()
  })
})
