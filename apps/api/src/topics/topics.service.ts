import { Injectable, NotFoundException } from '@nestjs/common'
import { TopicsRepository } from './topics.repository'

const HASHTAG_REGEX = /#([\p{L}\p{N}_]{2,40})/gu
const MAX_TOPICS_PER_ITEM = 5

export interface ParsedTopic {
  slug: string
  displayTag: string
}

export function normalizeTopicSlug(raw: string): string {
  return raw
    .replace(/^#/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function extractHashtags(text: string): ParsedTopic[] {
  if (!text) return []
  const seen = new Map<string, ParsedTopic>()

  for (const match of text.matchAll(HASHTAG_REGEX)) {
    const rawTag = match[1]
    const slug = normalizeTopicSlug(rawTag)
    if (slug.length < 2) continue
    if (!seen.has(slug)) {
      seen.set(slug, { slug, displayTag: `#${rawTag}` })
    }
    if (seen.size >= MAX_TOPICS_PER_ITEM) break
  }

  return Array.from(seen.values())
}

@Injectable()
export class TopicsService {
  constructor(private readonly repo: TopicsRepository) {}

  getFollowed(userId: string, limit = 6) {
    return this.repo.findFollowedTopics(userId, Math.min(Math.max(limit, 1), 20))
  }

  async syncPostTopics(postId: string, text: string) {
    const parsed = extractHashtags(text)
    const topics = await Promise.all(parsed.map((t) => this.repo.upsertTopic(t.slug, t.displayTag)))
    const affected = await this.repo.replacePostTopics(
      postId,
      topics.map((t) => t.id),
    )
    if (affected.length > 0) {
      await this.repo.refreshTopicCounts(affected)
    }
    return topics
  }

  async syncReportTopics(reportId: string, text: string) {
    const parsed = extractHashtags(text)
    if (parsed.length === 0) return []
    const topics = await Promise.all(parsed.map((t) => this.repo.upsertTopic(t.slug, t.displayTag)))
    const affected = await this.repo.replaceReportTopics(
      reportId,
      topics.map((t) => t.id),
    )
    if (affected.length > 0) {
      await this.repo.refreshTopicCounts(affected)
    }
    return topics
  }

  async syncDebateTopics(debateId: string, text: string) {
    const parsed = extractHashtags(text)
    if (parsed.length === 0) return []
    const topics = await Promise.all(parsed.map((t) => this.repo.upsertTopic(t.slug, t.displayTag)))
    const affected = await this.repo.replaceDebateTopics(
      debateId,
      topics.map((t) => t.id),
    )
    if (affected.length > 0) {
      await this.repo.refreshTopicCounts(affected)
    }
    return topics
  }

  getTrending(limit = 10, state?: string, city?: string) {
    const cityKey = city
      ? city
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim()
      : undefined
    return this.repo.findTrending(Math.min(limit, 25), state?.trim().toUpperCase(), cityKey)
  }

  search(q: string, limit = 8) {
    return this.repo.searchByPrefix(q, Math.min(limit, 20))
  }

  async getBySlug(slug: string, userId?: string) {
    const normalized = normalizeTopicSlug(slug)
    const topic = await this.repo.findBySlug(normalized)
    if (!topic) throw new NotFoundException('Pauta não encontrada')

    const detail = await this.repo.findTopicDetailData(topic.id, userId)
    return {
      topic,
      ...detail,
    }
  }

  async toggleFollow(slug: string, userId: string) {
    const normalized = normalizeTopicSlug(slug)
    const topic = await this.repo.findBySlug(normalized)
    if (!topic) throw new NotFoundException('Pauta não encontrada')
    return this.repo.toggleFollow(userId, topic.id)
  }
}
