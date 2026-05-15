import { z } from 'zod'

const CategoryEnum = z.enum([
  'HEALTH', 'MOBILITY', 'SAFETY', 'EDUCATION',
  'SANITATION', 'HOUSING', 'OTHER',
])

const RecipientTypeEnum = z.enum(['ENTITY', 'COMPANY', 'BRANCH', 'POLITICIAN'])

export const CreateReportSchema = z.object({
  title: z.string().min(10).max(120).trim(),
  description: z.string().min(30).max(2000).trim(),
  category: CategoryEnum,
  anonymous: z.boolean().default(false),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  typedAddress: z.string().max(300).optional(),
  recipientType: RecipientTypeEnum.optional(),
  recipientId: z.string().uuid().optional(),
})

export const UpdateStatusSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'ARCHIVED']),
  content: z.string().min(10).max(500).trim(),
})

export const DisputeResolutionSchema = z.object({
  content: z.string().min(20).max(1000).trim(),
})

export const FilterReportsSchema = z.object({
  category: CategoryEnum.optional(),
  status: z.enum(['OPEN', 'UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'DISPUTED', 'ARCHIVED']).optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type CreateReportInput = z.infer<typeof CreateReportSchema>
export type UpdateStatusInput = z.infer<typeof UpdateStatusSchema>
export type FilterReportsInput = z.infer<typeof FilterReportsSchema>
