import { UserType } from './enums'

export const THEME_PREFERENCES = ['SYSTEM', 'LIGHT', 'DARK'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]
export const THEME_PREFERENCE_LABELS: Record<ThemePreference, string> = {
  SYSTEM: 'Automático (sistema)',
  LIGHT: 'Claro',
  DARK: 'Escuro',
}

export type OrgContextType = 'ENTITY' | 'POLITICIAN' | 'COMPANY'

export interface ActiveContext {
  type: OrgContextType
  id: string
  name: string
  logoUrl: string | null
  permissions: string[]
}

export interface PublicUser {
  id: string
  name: string
  username?: string | null
  type: UserType
  verified: boolean
  reputation: number
  avatarUrl: string | null
  bio?: string | null
  createdAt: string
}

export interface AuthenticatedUser extends PublicUser {
  email: string
  emailVerified: boolean
  mfaEnabled?: boolean
  hasPassword?: boolean
  termsAcceptedAt?: string | null
  termsVersion?: string | null
  privacyVersion?: string | null
  ageConfirmedAt?: string | null
  phone?: string | null
  zipCode?: string | null
  street?: string | null
  streetNumber?: string | null
  complement?: string | null
  neighborhood?: string | null
  city?: string | null
  state?: string | null
  country?: string
  latitude?: number | null
  longitude?: number | null
  /** Só em `GET /users/me` e na edição do próprio perfil; nunca no perfil público. AAAA-MM-DD (vem como data ISO). */
  birthDate?: string | null
  /** Só para a própria pessoa; nunca no perfil público. Valores de `USER_GENDERS`. */
  gender?: 'FEMALE' | 'MALE' | 'OTHER' | 'UNDISCLOSED' | null
  /** Preferência de aparência salva no perfil do usuário (SYSTEM | LIGHT | DARK). */
  themePreference?: ThemePreference
}

export interface UserAccountPreferencesView {
  inAppEnabled: boolean
  emailEnabled: boolean
  pushEnabled: boolean
  reportUpdates: boolean
  reportComments: boolean
  officialResponses: boolean
  localSurges: boolean
  officialSurveys: boolean
  mentions: boolean
  weeklyDigest: boolean
  quietHoursStart: number | null
  quietHoursEnd: number | null
  defaultAnonymousReports: boolean
  publicActivityVisible: boolean
  acceptPressContact: boolean
}

export interface ActiveSessionView {
  familyId: string
  createdAt: string
  expiresAt: string
  current: boolean
}
