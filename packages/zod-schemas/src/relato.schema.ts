import { z } from 'zod'

const CategoriaEnum = z.enum([
  'SAUDE', 'MOBILIDADE', 'SEGURANCA', 'EDUCACAO',
  'SANEAMENTO', 'HABITACAO', 'OUTROS',
])

const DestinatarioTipoEnum = z.enum(['ENTIDADE', 'EMPRESA', 'FILIAL', 'POLITICO'])

export const CriarRelatoSchema = z.object({
  titulo: z.string().min(10).max(120).trim(),
  descricao: z.string().min(30).max(2000).trim(),
  categoria: CategoriaEnum,
  anonimo: z.boolean().default(false),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  enderecoDigitado: z.string().max(300).optional(),
  destinatarioTipo: DestinatarioTipoEnum.optional(),
  destinatarioId: z.string().uuid().optional(),
})

export const AtualizarStatusSchema = z.object({
  status: z.enum(['EM_ANALISE', 'EM_ANDAMENTO', 'RESOLVIDO', 'ARQUIVADO']),
  descricao: z.string().min(10).max(500).trim(),
})

export const ContestarResolucaoSchema = z.object({
  descricao: z.string().min(20).max(1000).trim(),
})

export const FiltrarRelatosSchema = z.object({
  categoria: CategoriaEnum.optional(),
  status: z.enum(['ABERTO', 'EM_ANALISE', 'EM_ANDAMENTO', 'RESOLVIDO', 'CONTESTADO', 'ARQUIVADO']).optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type CriarRelatoInput = z.infer<typeof CriarRelatoSchema>
export type AtualizarStatusInput = z.infer<typeof AtualizarStatusSchema>
export type FiltrarRelatosInput = z.infer<typeof FiltrarRelatosSchema>
