import { z } from 'zod'

export const RegisterSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().toLowerCase().trim(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
})

export const LoginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
})

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
})

export type RegisterInput = z.infer<typeof RegisterSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>
