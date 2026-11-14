"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdatePropostaStatusSchema = exports.CreatePropostaSchema = void 0;
const zod_1 = require("zod");
const CategoryEnum = zod_1.z.enum([
    'HEALTH', 'MOBILITY', 'SAFETY', 'EDUCATION',
    'SANITATION', 'HOUSING', 'ENVIRONMENT', 'INFRASTRUCTURE',
    'URBAN_SERVICES', 'CORRUPTION', 'ACCESSIBILITY', 'SOCIAL_WELFARE', 'OTHER',
]);
const PropostaStatusEnum = zod_1.z.enum([
    'DRAFT', 'PRESENTED', 'IN_VOTE', 'APPROVED', 'REJECTED', 'ARCHIVED',
]);
exports.CreatePropostaSchema = zod_1.z.object({
    titulo: zod_1.z.string().min(10).max(200).trim(),
    descricao: zod_1.z.string().min(30).max(10000).trim(),
    categorias: zod_1.z.array(CategoryEnum).min(1).max(5),
    linkExterno: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
});
exports.UpdatePropostaStatusSchema = zod_1.z.object({
    status: PropostaStatusEnum,
    conteudo: zod_1.z.string().min(10).max(1000).trim(),
});
//# sourceMappingURL=proposta.schema.js.map