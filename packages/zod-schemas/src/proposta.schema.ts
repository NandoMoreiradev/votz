import { z } from 'zod'

const CategoryEnum = z.enum([
  'HEALTH', 'MOBILITY', 'SAFETY', 'EDUCATION',
  'SANITATION', 'HOUSING', 'ENVIRONMENT', 'INFRASTRUCTURE',
  'URBAN_SERVICES', 'CORRUPTION', 'ACCESSIBILITY', 'SOCIAL_WELFARE', 'OTHER',
])

const PropostaStatusEnum = z.enum([
  'DRAFT', 'PRESENTED', 'IN_VOTE', 'APPROVED', 'REJECTED', 'ARCHIVED',
])

export const CreatePropostaSchema = z.object({
  titulo: z.string().min(10).max(200).trim(),
  descricao: z.string().min(30).max(10000).trim(),
  categorias: z.array(CategoryEnum).min(1).max(5),
  linkExterno: z.string().url().optional().or(z.literal('')),
})

export const UpdatePropostaStatusSchema = z.object({
  status: PropostaStatusEnum,
  conteudo: z.string().min(10).max(1000).trim(),
})

export type CreatePropostaInput = z.infer<typeof CreatePropostaSchema>
export type UpdatePropostaStatusInput = z.infer<typeof UpdatePropostaStatusSchema>
