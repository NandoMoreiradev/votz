import { UserType } from './enums'

export interface PublicUser {
  id: string
  name: string
  type: UserType
  verified: boolean
  reputation: number
  avatarUrl: string | null
  bio?: string
  createdAt: string
}

export interface AuthenticatedUser extends PublicUser {
  email: string
  emailVerified: boolean
}
