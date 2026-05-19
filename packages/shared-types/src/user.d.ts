import { UserType } from './enums';
export interface PublicUser {
    id: string;
    name: string;
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
}
//# sourceMappingURL=user.d.ts.map