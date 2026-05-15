import { z } from 'zod'

export const UpdateProfileSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  bio: z.string().max(300).trim().optional(),
  phone: z.string().optional(),
})

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>
