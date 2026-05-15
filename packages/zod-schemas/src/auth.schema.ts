import { z } from 'zod'

export const RegisterSchema = z.object({
  nome: z.string().min(2).max(100).trim(),
  email: z.string().email().toLowerCase().trim(),
  senha: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Deve conter ao menos um número'),
})

export const LoginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  senha: z.string().min(1),
})

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
})

export type RegisterInput = z.infer<typeof RegisterSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>
