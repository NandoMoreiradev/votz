import { z } from 'zod';
export declare const CreatePropostaSchema: z.ZodObject<{
    titulo: z.ZodString;
    descricao: z.ZodString;
    categorias: z.ZodArray<z.ZodEnum<["HEALTH", "MOBILITY", "SAFETY", "EDUCATION", "SANITATION", "HOUSING", "ENVIRONMENT", "INFRASTRUCTURE", "URBAN_SERVICES", "CORRUPTION", "ACCESSIBILITY", "SOCIAL_WELFARE", "OTHER"]>, "many">;
    linkExterno: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
}, "strip", z.ZodTypeAny, {
    titulo: string;
    descricao: string;
    categorias: ("HEALTH" | "MOBILITY" | "SAFETY" | "EDUCATION" | "SANITATION" | "HOUSING" | "OTHER" | "ENVIRONMENT" | "INFRASTRUCTURE" | "URBAN_SERVICES" | "CORRUPTION" | "ACCESSIBILITY" | "SOCIAL_WELFARE")[];
    linkExterno?: string | undefined;
}, {
    titulo: string;
    descricao: string;
    categorias: ("HEALTH" | "MOBILITY" | "SAFETY" | "EDUCATION" | "SANITATION" | "HOUSING" | "OTHER" | "ENVIRONMENT" | "INFRASTRUCTURE" | "URBAN_SERVICES" | "CORRUPTION" | "ACCESSIBILITY" | "SOCIAL_WELFARE")[];
    linkExterno?: string | undefined;
}>;
export declare const UpdatePropostaStatusSchema: z.ZodObject<{
    status: z.ZodEnum<["DRAFT", "PRESENTED", "IN_VOTE", "APPROVED", "REJECTED", "ARCHIVED"]>;
    conteudo: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "ARCHIVED" | "DRAFT" | "PRESENTED" | "IN_VOTE" | "APPROVED" | "REJECTED";
    conteudo: string;
}, {
    status: "ARCHIVED" | "DRAFT" | "PRESENTED" | "IN_VOTE" | "APPROVED" | "REJECTED";
    conteudo: string;
}>;
export type CreatePropostaInput = z.infer<typeof CreatePropostaSchema>;
export type UpdatePropostaStatusInput = z.infer<typeof UpdatePropostaStatusSchema>;
//# sourceMappingURL=proposta.schema.d.ts.map