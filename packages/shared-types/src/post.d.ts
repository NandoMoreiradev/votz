import { Category, PostCommentMediaType, PostKind, ReportStatus, UserType } from './enums';
export type FeedSortMode = 'for_you' | 'trending' | 'following' | 'recent';
export interface PostAuthorInfo {
    userId: string;
    name: string;
    username?: string | null;
    avatarUrl: string | null;
    verified: boolean;
    userType: UserType;
    orgType: 'ENTITY' | 'POLITICIAN' | 'COMPANY' | null;
    orgId: string | null;
    orgName: string | null;
    orgAvatarUrl: string | null;
    orgVerified: boolean;
    orgSubtitle: string | null;
}
export interface PostPollOptionDto {
    id: string;
    text: string;
    position: number;
    votesCount: number;
}
export interface PostPollDto {
    id: string;
    question: string | null;
    expiresAt: string;
    expired: boolean;
    totalVotes: number;
    myVoteOptionId: string | null;
    options: PostPollOptionDto[];
}
export interface EmbeddedReportDto {
    id: string;
    title: string;
    description: string;
    category: Category;
    status: ReportStatus;
    city: string | null;
    state: string | null;
    pressureScore: number;
    media: string[];
    _count: {
        votes: number;
        comments: number;
    };
}
export interface EmbeddedDebateDto {
    id: string;
    title: string;
    description: string | null;
    status: string;
    scheduledFor: string;
    viewerCount: number;
    /** Político anfitrião. Nulo quando quem organiza o debate é uma entidade (veja `hostEntity`). */
    creator: {
        id: string;
        name: string;
        avatarUrl: string | null;
    } | null;
    hostEntity: {
        id: string;
        legalName: string;
        logoUrl: string | null;
    } | null;
}
export interface EmbeddedPropostaDto {
    id: string;
    titulo: string;
    status: string;
    politico: {
        id: string;
        name: string;
        avatarUrl: string | null;
    };
}
export interface EmbeddedDebatePollDto {
    id: string;
    debateId: string;
    debateTitle: string;
    question: string;
    active: boolean;
    myVoteOptionId: string | null;
    options: Array<{
        id: string;
        text: string;
        totalVotes: number;
    }>;
}
export interface CivicTopicSummaryDto {
    id: string;
    slug: string;
    displayTag: string;
    postsCount: number;
    reportsCount: number;
    debatesCount: number;
    tractionScore: number;
    lastActivityAt: string;
}
export interface PostQuoteDto {
    id: string;
    content: string;
    kind: PostKind;
    media: string[];
    createdAt: string;
    author: PostAuthorInfo;
}
export interface PostRepostInfo {
    id: string;
    createdAt: string;
    user: {
        id: string;
        name: string;
        username: string | null;
        avatarUrl: string | null;
    };
}
export interface PostDto {
    id: string;
    content: string;
    kind: PostKind;
    media: string[];
    city: string | null;
    state: string | null;
    likesCount: number;
    commentsCount: number;
    repostsCount: number;
    likedByMe: boolean;
    repostedByMe: boolean;
    /** Distribution context; the post's author and ID always remain the original. */
    repost?: PostRepostInfo | null;
    canCommentWithAudio: boolean;
    hotScore: number;
    /** Só no "Para você": por que este item apareceu fora do círculo da pessoa (ex.: "Em alta na sua cidade"). O texto vem do servidor. */
    feedReason?: string | null;
    createdAt: string;
    updatedAt: string;
    author: PostAuthorInfo;
    poll: PostPollDto | null;
    mentionedReport: EmbeddedReportDto | null;
    mentionedDebate: EmbeddedDebateDto | null;
    mentionedProposta: EmbeddedPropostaDto | null;
    mentionedDebatePoll: EmbeddedDebatePollDto | null;
    quotePost: PostQuoteDto | null;
    topics: Array<{
        id: string;
        slug: string;
        displayTag: string;
    }>;
}
export interface PostCommentDto {
    id: string;
    postId: string;
    parentId: string | null;
    content: string;
    mediaType: PostCommentMediaType;
    mediaUrl: string | null;
    mediaDuration: number | null;
    transcript: string | null;
    createdAt: string;
    updatedAt: string;
    author: PostAuthorInfo;
    _count: {
        replies: number;
    };
    replies?: PostCommentDto[];
}
export interface GifSearchItem {
    id: string;
    title: string;
    previewUrl: string;
    gifUrl: string;
    width: number | null;
    height: number | null;
}
/** Perfil sugerido no cartão "Quem seguir na sua cidade" (quem segue poucas contas). */
export interface FeedSuggestedProfile {
    kind: 'politicians' | 'entities';
    id: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
    verified: boolean;
    /** Cargo/partido do político ou tipo da entidade, em texto simples. */
    subtitle: string | null;
}
export interface FeedSuggestions {
    title: string;
    profiles: FeedSuggestedProfile[];
}
//# sourceMappingURL=post.d.ts.map