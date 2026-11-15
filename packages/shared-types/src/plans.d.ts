import { CompanyPlan } from './enums';
export type OrgPlanType = 'POLITICIAN' | 'ENTITY' | 'COMPANY';
export type PoliticianPlan = 'BASICO' | 'MANDATO' | 'MANDATO_PRO';
export type EntityPlan = 'BASICO' | 'GESTAO' | 'INTEGRACAO';
export type AnyPlanCode = PoliticianPlan | EntityPlan | `${CompanyPlan}`;
export type FeatureKey = 'respond_reports' | 'team' | 'export_data' | 'propostas' | 'outbreak_alerts' | 'analytics_basic' | 'analytics_full' | 'heatmap' | 'sla_panel' | 'pdf_report' | 'share_card' | 'api_access' | 'webhooks' | 'peer_comparison' | 'reply_templates' | 'priority_support';
export type FeatureAvailability = 'available' | 'soon';
export type PoliticianPriceTier = 1 | 2 | 3 | 4;
export type EntityPopulationTier = 'UP_TO_50K' | 'FROM_50K_TO_300K' | 'OVER_300K';
export interface FeatureMeta {
    key: FeatureKey;
    label: string;
    description: string;
    status: FeatureAvailability;
}
/**
 * Status real de implementação de cada funcionalidade no código atual.
 * Regra de ouro: só marcar como 'available' o que já existe funcionalmente.
 */
export declare const FEATURE_STATUS: Record<FeatureKey, FeatureAvailability>;
export declare const FEATURE_CATALOG: Record<FeatureKey, FeatureMeta>;
export interface PlanLimits {
    /** null = ilimitado */
    maxMembers: number | null;
    maxMembersByTier?: Record<PoliticianPriceTier, number>;
    /** null = histórico completo */
    historyDays: number | null;
}
export interface PlanConfig<P extends string = string> {
    code: P;
    orgType: OrgPlanType;
    label: string;
    description: string;
    limits: PlanLimits;
    features: Record<FeatureKey, boolean>;
    status: Record<FeatureKey, FeatureAvailability>;
}
export declare const POLITICIAN_TIER_LABELS: Record<PoliticianPriceTier, string>;
export declare const ENTITY_POPULATION_TIER_LABELS: Record<EntityPopulationTier, string>;
/**
 * Tabela editável de preços em centavos (BRL/mês).
 * Preços são hipóteses iniciais de negócio — manter centralizados aqui.
 */
export declare const PLAN_PRICES: {
    readonly POLITICIAN: {
        readonly BASICO: Record<PoliticianPriceTier, number>;
        readonly MANDATO: Record<PoliticianPriceTier, number>;
        readonly MANDATO_PRO: Record<PoliticianPriceTier, number>;
    };
    readonly ENTITY: {
        readonly BASICO: Record<EntityPopulationTier, number>;
        readonly GESTAO: Record<EntityPopulationTier, number>;
        readonly INTEGRACAO: Record<EntityPopulationTier, number>;
    };
    readonly COMPANY: Record<`${CompanyPlan}`, number | null>;
};
export declare const POLITICIAN_PLANS: Record<PoliticianPlan, PlanConfig<PoliticianPlan>>;
export declare const ENTITY_PLANS: Record<EntityPlan, PlanConfig<EntityPlan>>;
export declare const COMPANY_PLANS: Record<`${CompanyPlan}`, PlanConfig<`${CompanyPlan}`>>;
export declare const PLANS_CATALOG: {
    readonly POLITICIAN: Record<PoliticianPlan, PlanConfig<PoliticianPlan>>;
    readonly ENTITY: Record<EntityPlan, PlanConfig<EntityPlan>>;
    readonly COMPANY: Record<"STARTER" | "BUSINESS" | "ENTERPRISE" | "WHITE_LABEL", PlanConfig<"STARTER" | "BUSINESS" | "ENTERPRISE" | "WHITE_LABEL">>;
};
export declare function getPlanConfig(orgType: OrgPlanType, plan: string): PlanConfig | null;
export declare function hasFeature(orgType: OrgPlanType, plan: string, feature: FeatureKey): boolean;
export declare function getMaxMembers(orgType: OrgPlanType, plan: string, tier?: PoliticianPriceTier): number | null;
export declare function getRequiredPlanForFeature(orgType: OrgPlanType, feature: FeatureKey): PlanConfig | null;
export declare function getPoliticianTier(office: string | null | undefined, logger?: {
    warn: (message: string) => void;
}): PoliticianPriceTier;
//# sourceMappingURL=plans.d.ts.map