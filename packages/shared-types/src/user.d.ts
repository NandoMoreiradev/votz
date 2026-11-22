import { UserType } from './enums';
export type OrgContextType = 'ENTITY' | 'POLITICIAN' | 'COMPANY';
export interface ActiveContext {
    type: OrgContextType;
    id: string;
    name: string;
    logoUrl: string | null;
    permissions: string[];
}
export interface PublicUser {
    id: string;
    name: string;
    username?: string | null;
    type: UserType;
    verified: boolean;
    reputation: number;
    avatarUrl: string | null;
    bio?: string | null;
    createdAt: string;
}
export interface AuthenticatedUser extends PublicUser {
    email: string;
    emailVerified: boolean;
    mfaEnabled?: boolean;
    hasPassword?: boolean;
    termsAcceptedAt?: string | null;
    termsVersion?: string | null;
    privacyVersion?: string | null;
    ageConfirmedAt?: string | null;
    phone?: string | null;
    zipCode?: string | null;
    street?: string | null;
    streetNumber?: string | null;
    complement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string;
    latitude?: number | null;
    longitude?: number | null;
    /** Só em `GET /users/me` e na edição do próprio perfil; nunca no perfil público. AAAA-MM-DD (vem como data ISO). */
    birthDate?: string | null;
    /** Só para a própria pessoa; nunca no perfil público. Valores de `USER_GENDERS`. */
    gender?: 'FEMALE' | 'MALE' | 'OTHER' | 'UNDISCLOSED' | null;
}
//# sourceMappingURL=user.d.ts.map