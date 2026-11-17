import { z } from 'zod'

export const CreatePostPollSchema = z.object({
  question: z.string().trim().max(280).optional(),
  options: z.array(z.string().trim().min(1).max(100)).min(2).max(4),
  durationHours: z.coerce.number().int().min(1).max(168).default(24),
})

export const CreatePostSchema = z.object({
  content: z.string().trim().max(2000).default(''),
  media: z.array(z.string().url()).max(4).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().length(2).toUpperCase().optional(),
  mentionedReportId: z.string().uuid().optional(),
  mentionedDebateId: z.string().min(1).max(64).optional(),
  mentionedPropostaId: z.string().uuid().optional(),
  mentionedDebatePollId: z.string().min(1).max(64).optional(),
  quotePostId: z.string().uuid().optional(),
  poll: CreatePostPollSchema.optional(),
})

export const CreatePostCommentSchema = z.object({
  content: z.string().trim().max(1000).optional(),
  parentId: z.string().uuid().optional(),
  mediaType: z.enum(['TEXT', 'IMAGE', 'GIF', 'AUDIO']).default('TEXT'),
  mediaUrl: z.string().url().max(500).optional(),
  mediaKey: z.string().max(300).optional(),
  mediaDuration: z.coerce.number().int().min(1).max(300).optional(),
})

export type CreatePostInput = z.infer<typeof CreatePostSchema>
export type CreatePostCommentInput = z.infer<typeof CreatePostCommentSchema>
