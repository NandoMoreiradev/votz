/**
 * Pesquisa Votz (pesquisas oficiais anonimizadas) — tipos, enums, limites e textos compartilhados
 * entre API, Web e Mobile.
 */
export declare const SURVEY_KINDS: readonly ["VOTING_INTENTION", "APPROVAL_RATING", "CIVIC_TOPIC"];
export type SurveyKind = (typeof SURVEY_KINDS)[number];
export declare const SURVEY_ORIGINS: readonly ["VOTZ", "PARTNER_INSTITUTE", "PUBLIC_ENTITY"];
export type SurveyOrigin = (typeof SURVEY_ORIGINS)[number];
export declare const SURVEY_DISTRIBUTION_MODES: readonly ["OPEN", "INVITED_SAMPLE"];
export type SurveyDistributionMode = (typeof SURVEY_DISTRIBUTION_MODES)[number];
export declare const SURVEY_METHODOLOGY_TYPES: readonly ["OPEN_PANEL", "WEIGHTED_QUOTA", "REGISTERED_TSE"];
export type SurveyMethodologyType = (typeof SURVEY_METHODOLOGY_TYPES)[number];
export declare const SURVEY_STATUSES: readonly ["DRAFT", "SCHEDULED", "OPEN", "CLOSED", "ARCHIVED", "CANCELLED"];
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];
export declare const SURVEY_SCOPES: readonly ["NATIONAL", "STATE", "MUNICIPAL"];
export type SurveyScope = (typeof SURVEY_SCOPES)[number];
export declare const SURVEY_VERIFICATION_LEVELS: readonly ["STANDARD", "VERIFIED_CPF"];
export type SurveyVerificationLevel = (typeof SURVEY_VERIFICATION_LEVELS)[number];
export declare const SURVEY_QUESTION_TYPES: readonly ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "SCALE_5"];
export type SurveyQuestionType = (typeof SURVEY_QUESTION_TYPES)[number];
export declare const SURVEY_RESULTS_VISIBILITIES: readonly ["AFTER_VOTE", "AFTER_CLOSE"];
export type SurveyResultsVisibility = (typeof SURVEY_RESULTS_VISIBILITIES)[number];
export declare const SURVEY_REVIEW_STATUSES: readonly ["APPROVED", "PENDING_REVIEW", "CHANGES_REQUESTED", "REJECTED"];
export type SurveyReviewStatus = (typeof SURVEY_REVIEW_STATUSES)[number];
export declare const SURVEY_INVITATION_STATUSES: readonly ["INVITED", "RESPONDED", "DECLINED", "EXPIRED"];
export type SurveyInvitationStatus = (typeof SURVEY_INVITATION_STATUSES)[number];
export declare const SURVEY_REVIEW_LABELS: Record<SurveyReviewStatus, string>;
export interface ResearchInstituteView {
    id: string;
    slug: string;
    name: string;
    legalName: string;
    cnpj: string | null;
    logoUrl: string | null;
    website: string | null;
    description: string | null;
    statisticianLead: string | null;
    conreLead: string | null;
    verified: boolean;
    surveysCount?: number;
}
export interface SurveyInvitationView {
    invitationId: string;
    status: SurveyInvitationStatus;
    invitedAt: string;
    expiresAt: string | null;
    survey: SurveySummaryView;
}
export interface SurveyComparisonItem {
    surveyId: string;
    slug: string;
    title: string;
    origin: SurveyOrigin;
    partnerName: string | null;
    instituteSlug: string | null;
    methodologyType: SurveyMethodologyType;
    tseRegistrationCode: string | null;
    marginOfError: number | null;
    closedAt: string | null;
    startsAt: string | null;
    totalBallots: number;
    topQuestionPrompt: string | null;
    options: {
        label: string;
        subtitle: string | null;
        percentage: number;
        votesCount: number;
    }[];
}
export declare const SURVEY_DEFAULTS: {
    readonly MIN_QUORUM_TO_PUBLISH: 100;
    readonly K_ANONYMITY_THRESHOLD: 30;
    readonly MIN_ACCOUNT_AGE_DAYS: 7;
    readonly MIX_POOL_BATCH_SIZE: 20;
    readonly MAX_QUESTIONS: 20;
    readonly MAX_OPTIONS_PER_QUESTION: 25;
};
export declare const SURVEY_KIND_LABELS: Record<SurveyKind, string>;
export declare const SURVEY_ORIGIN_LABELS: Record<SurveyOrigin, string>;
export declare const SURVEY_METHODOLOGY_LABELS: Record<SurveyMethodologyType, string>;
export declare const SURVEY_ANONYMITY_NOTICE = "Seu voto \u00E9 an\u00F4nimo e definitivo. Ao confirmar, o Votz separa sua identidade da sua resposta: nem voc\u00EA nem o sistema poder\u00E3o alterar ou consultar em quem voc\u00EA votou.";
export type SurveyIneligibleReason = 'UNAUTHENTICATED' | 'EMAIL_NOT_VERIFIED' | 'ACCOUNT_TOO_NEW' | 'CPF_REQUIRED' | 'OUT_OF_TERRITORY' | 'SURVEY_NOT_OPEN' | 'ALREADY_VOTED' | 'INVITE_REQUIRED';
export interface SurveyOptionView {
    id: string;
    position: number;
    label: string;
    subtitle: string | null;
    imageUrl: string | null;
    politicianId: string | null;
    isPinnedBottom: boolean;
}
export interface SurveyQuestionView {
    id: string;
    position: number;
    prompt: string;
    helpText: string | null;
    type: SurveyQuestionType;
    required: boolean;
    maxSelections: number;
    randomizeOptions: boolean;
    options: SurveyOptionView[];
}
export interface SurveySummaryView {
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    kind: SurveyKind;
    origin: SurveyOrigin;
    distributionMode: SurveyDistributionMode;
    methodologyType: SurveyMethodologyType;
    status: SurveyStatus;
    scope: SurveyScope;
    targetState: string | null;
    targetCity: string | null;
    verificationLevel: SurveyVerificationLevel;
    resultsVisibility: SurveyResultsVisibility;
    featuredInFeed: boolean;
    partnerName: string | null;
    partnerLogoUrl: string | null;
    instituteSlug?: string | null;
    contractorName: string | null;
    topicKey?: string | null;
    reviewStatus?: SurveyReviewStatus;
    reviewNote?: string | null;
    isElectoral: boolean;
    tseRegistrationCode: string | null;
    startsAt: string | null;
    endsAt: string | null;
    closedAt: string | null;
    totalBallots: number;
    quorumReached: boolean;
    hasVoted: boolean | null;
    eligible: boolean | null;
    ineligibleReason: SurveyIneligibleReason | null;
}
export interface SurveyDetailView extends SurveySummaryView {
    description: string;
    minAccountAgeDays: number;
    minQuorumToPublish: number;
    kAnonymityThreshold: number;
    marginOfError: number | null;
    confidenceLevel: number | null;
    statisticianName: string | null;
    statisticianConre: string | null;
    methodologyNote: string;
    disclaimerText: string;
    questions: SurveyQuestionView[];
}
export interface SurveyOptionResultView {
    optionId: string;
    label: string;
    subtitle: string | null;
    imageUrl: string | null;
    votesCount: number;
    percentage: number;
}
export interface SurveyQuestionResultView {
    questionId: string;
    prompt: string;
    type: SurveyQuestionType;
    totalResponses: number;
    options: SurveyOptionResultView[];
}
export interface SurveyResultsView {
    surveyId: string;
    slug: string;
    status: SurveyStatus;
    segmentKey: string;
    totalBallots: number;
    segmentTotal: number;
    quorumReached: boolean;
    kAnonymitySuppressed: boolean;
    kAnonymityThreshold: number;
    availableSegments: string[];
    updatedAt: string | null;
    questions: SurveyQuestionResultView[];
}
//# sourceMappingURL=surveys.d.ts.map