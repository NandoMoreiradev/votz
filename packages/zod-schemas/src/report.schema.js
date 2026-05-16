"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilterReportsSchema = exports.DisputeResolutionSchema = exports.UpdateStatusSchema = exports.CreateReportSchema = void 0;
const zod_1 = require("zod");
const CategoryEnum = zod_1.z.enum([
    'HEALTH', 'MOBILITY', 'SAFETY', 'EDUCATION',
    'SANITATION', 'HOUSING', 'OTHER',
]);
const RecipientTypeEnum = zod_1.z.enum(['ENTITY', 'COMPANY', 'BRANCH', 'POLITICIAN']);
exports.CreateReportSchema = zod_1.z.object({
    title: zod_1.z.string().min(10).max(120).trim(),
    description: zod_1.z.string().min(30).max(2000).trim(),
    category: CategoryEnum,
    anonymous: zod_1.z.boolean().default(false),
    latitude: zod_1.z.number().min(-90).max(90).optional(),
    longitude: zod_1.z.number().min(-180).max(180).optional(),
    typedAddress: zod_1.z.string().max(300).optional(),
    recipientType: RecipientTypeEnum.optional(),
    recipientId: zod_1.z.string().uuid().optional(),
});
exports.UpdateStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'ARCHIVED']),
    content: zod_1.z.string().min(10).max(500).trim(),
});
exports.DisputeResolutionSchema = zod_1.z.object({
    content: zod_1.z.string().min(20).max(1000).trim(),
});
exports.FilterReportsSchema = zod_1.z.object({
    category: CategoryEnum.optional(),
    status: zod_1.z.enum(['OPEN', 'UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'DISPUTED', 'ARCHIVED']).optional(),
    city: zod_1.z.string().optional(),
    state: zod_1.z.string().optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(50).default(20),
});
//# sourceMappingURL=report.schema.js.map