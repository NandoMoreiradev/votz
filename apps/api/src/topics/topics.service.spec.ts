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

  it('lists followed topics with the limit kept between 1 and 20', async () => {
    const repo = {
      findFollowedTopics: jest.fn().mockResolvedValue([{ id: 't1', slug: 'saude' }]),
    } as unknown as TopicsRepository
    const service = new TopicsService(repo)

    await expect(service.getFollowed('u1', 6)).resolves.toEqual([{ id: 't1', slug: 'saude' }])
    await service.getFollowed('u1', 500)
    await service.getFollowed('u1', 0)

    expect(repo.findFollowedTopics).toHaveBeenNthCalledWith(1, 'u1', 6)
    expect(repo.findFollowedTopics).toHaveBeenNthCalledWith(2, 'u1', 20)
    expect(repo.findFollowedTopics).toHaveBeenNthCalledWith(3, 'u1', 1)
  })
})
