import { z } from 'zod'

export const AtualizarPerfilSchema = z.object({
  nome: z.string().min(2).max(100).trim().optional(),
  bio: z.string().max(300).trim().optional(),
  telefone: z.string().optional(),
})

export type AtualizarPerfilInput = z.infer<typeof AtualizarPerfilSchema>
