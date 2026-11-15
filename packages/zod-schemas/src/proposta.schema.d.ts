import { z } from 'zod';
export declare const CreatePropostaSchema: z.ZodObject<{
    titulo: z.ZodString;
    descricao: z.ZodString;
    categorias: z.ZodArray<z.ZodEnum<{
        HEALTH: "HEALTH";
        MOBILITY: "MOBILITY";
        SAFETY: "SAFETY";
        EDUCATION: "EDUCATION";
        SANITATION: "SANITATION";
        HOUSING: "HOUSING";
        OTHER: "OTHER";
        ENVIRONMENT: "ENVIRONMENT";
        INFRASTRUCTURE: "INFRASTRUCTURE";
        URBAN_SERVICES: "URBAN_SERVICES";
        CORRUPTION: "CORRUPTION";
        ACCESSIBILITY: "ACCESSIBILITY";
        SOCIAL_WELFARE: "SOCIAL_WELFARE";
    }>>;
    linkExterno: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
}, z.core.$strip>;
export declare const UpdatePropostaStatusSchema: z.ZodObject<{
    status: z.ZodEnum<{
        ARCHIVED: "ARCHIVED";
        DRAFT: "DRAFT";
        PRESENTED: "PRESENTED";
        IN_VOTE: "IN_VOTE";
        APPROVED: "APPROVED";
        REJECTED: "REJECTED";
    }>;
    conteudo: z.ZodString;
}, z.core.$strip>;
export type CreatePropostaInput = z.infer<typeof CreatePropostaSchema>;
export type UpdatePropostaStatusInput = z.infer<typeof UpdatePropostaStatusSchema>;
//# sourceMappingURL=proposta.schema.d.ts.map