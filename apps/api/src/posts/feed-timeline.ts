import { Prisma, PostKind } from '@prisma/client'
import type { ViewerRankingContext } from './feed-ranking.service'

export interface FeedTimelineParams {
  profileUserId?: string
  topicSlug?: string
  cityKey?: string
  state?: string
  kind?: PostKind
  authorType?: 'CITIZEN' | 'POLITICIAN' | 'ENTITY'
  authorUserId?: string
  authorOrgId?: string
  hasPoll?: boolean
  viewerContext?: ViewerRankingContext
  page: number
  limit: number
}

/** One row per original post, ordered by its latest relevant distribution event. */
export function buildFeedTimeline(params: FeedTimelineParams) {
  const context = params.viewerContext
  const reposters = params.profileUserId ? [params.profileUserId] : [...(context?.followedUserIds ?? [])]
  const actorFilter = reposters.length ? Prisma.sql`r.user_id IN (${Prisma.join(reposters)})` : Prisma.sql`FALSE`
  const distribution: Prisma.Sql[] = []
  if (params.profileUserId) {
    distribution.push(Prisma.sql`p.author_user_id = ${params.profileUserId}`, Prisma.sql`repost.id IS NOT NULL`)
  } else {
    if (context?.followedUserIds.size) distribution.push(Prisma.sql`p.author_user_id IN (${Prisma.join([...context.followedUserIds])})`)
    if (context?.followedPoliticianIds.size) distribution.push(Prisma.sql`(p.author_org_type::text = 'POLITICIAN' AND p.author_org_id IN (${Prisma.join([...context.followedPoliticianIds])}))`)
    if (context?.followedEntityIds.size) distribution.push(Prisma.sql`(p.author_org_type::text = 'ENTITY' AND p.author_org_id IN (${Prisma.join([...context.followedEntityIds])}))`)
    if (context?.followedTopicIds.size) distribution.push(Prisma.sql`EXISTS (SELECT 1 FROM post_topics pt WHERE pt.post_id = p.id AND pt.topic_id IN (${Prisma.join([...context.followedTopicIds])}))`)
    if (reposters.length) distribution.push(Prisma.sql`repost.id IS NOT NULL`)
  }
  const filters: Prisma.Sql[] = [distribution.length ? Prisma.sql`(${Prisma.join(distribution, ' OR ')})` : Prisma.sql`FALSE`]
  if (params.topicSlug) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM post_topics pt JOIN civic_topics t ON t.id = pt.topic_id WHERE pt.post_id = p.id AND t.slug = ${params.topicSlug})`)
  if (params.cityKey) filters.push(Prisma.sql`p.city_key = ${params.cityKey}`)
  if (params.state) filters.push(Prisma.sql`p.state = ${params.state}`)
  if (params.kind) filters.push(Prisma.sql`p.kind::text = ${params.kind}`)
  if (params.authorUserId) filters.push(Prisma.sql`p.author_user_id = ${params.authorUserId}`)
  if (params.authorOrgId) filters.push(Prisma.sql`p.author_org_id = ${params.authorOrgId}`)
  if (params.authorType === 'CITIZEN') filters.push(Prisma.sql`p.author_org_type IS NULL`)
  else if (params.authorType) filters.push(Prisma.sql`p.author_org_type::text = ${params.authorType}`)
  if (params.hasPoll) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM post_polls pp WHERE pp.post_id = p.id)`)

  const timeline = Prisma.sql`
    SELECT p.id, repost.id AS "repostId",
      GREATEST(p.created_at, COALESCE(repost.created_at, p.created_at)) AS "activityAt"
    FROM posts p
    LEFT JOIN LATERAL (
      SELECT r.id, r.created_at FROM post_reposts r
      WHERE r.post_id = p.id AND ${actorFilter}
      ORDER BY r.created_at DESC, r.id DESC LIMIT 1
    ) repost ON TRUE
    WHERE ${Prisma.join(filters, ' AND ')}
  `
  return {
    page: Prisma.sql`SELECT * FROM (${timeline}) timeline ORDER BY "activityAt" DESC, id DESC LIMIT ${params.limit} OFFSET ${(params.page - 1) * params.limit}`,
    count: Prisma.sql`SELECT COUNT(*)::int AS total FROM (${timeline}) timeline`,
  }
}
