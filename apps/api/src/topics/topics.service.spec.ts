import { extractHashtags, normalizeTopicSlug, TopicsService } from './topics.service'
import { TopicsRepository } from './topics.repository'

describe('TopicsService', () => {
  it('extracts and normalizes Unicode hashtags up to max 5 without duplicates', () => {
    const parsed = extractHashtags(
      'Cobramos solução #SaúdePública #saudepublica #Mobilidade_SP #ônibus #Água #Educação #Extra',
    )
    expect(parsed).toHaveLength(5)
    expect(parsed.map((p) => p.slug)).toEqual([
      'saudepublica',
      'mobilidade_sp',
      'onibus',
      'agua',
      'educacao',
    ])
    expect(parsed[0].displayTag).toBe('#SaúdePública')
  })

  it('normalizes slugs consistently', () => {
    expect(normalizeTopicSlug('#SaneamentoBásico')).toBe('saneamentobasico')
  })

  it('syncs post topics and refreshes counts', async () => {
    const repo = {
      upsertTopic: jest.fn().mockResolvedValue({ id: 't1', slug: 'saude' }),
      replacePostTopics: jest.fn().mockResolvedValue(['t1']),
      refreshTopicCounts: jest.fn().mockResolvedValue(undefined),
    } as unknown as TopicsRepository

    const service = new TopicsService(repo)
    const topics = await service.syncPostTopics('p1', 'Precisamos melhorar a #Saúde')

    expect(topics).toHaveLength(1)
    expect(repo.upsertTopic).toHaveBeenCalledWith('saude', '#Saúde')
    expect(repo.replacePostTopics).toHaveBeenCalledWith('p1', ['t1'])
    expect(repo.refreshTopicCounts).toHaveBeenCalledWith(['t1'])
  })
})
