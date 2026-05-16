import { Category, RecipientType, ReportStatus } from './enums';
export interface PublicReport {
    id: string;
    title: string;
    description: string;
    category: Category;
    status: ReportStatus;
    anonymous: boolean;
    latitude?: number;
    longitude?: number;
    normalizedAddress?: string;
    city?: string;
    state?: string;
    neighborhood?: string;
    media: string[];
    pressureScore: number;
    recipientType?: RecipientType;
    recipientId?: string;
    totalSupport: number;
    totalMeToo: number;
    totalComments: number;
    createdAt: string;
    updatedAt: string;
    author?: {
        id: string;
        name: string;
        avatarUrl?: string;
    };
}
export interface PublicTimelineEvent {
    id: string;
    type: string;
    content: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
    author?: {
        id: string;
        name: string;
    };
}
//# sourceMappingURL=report.d.ts.map