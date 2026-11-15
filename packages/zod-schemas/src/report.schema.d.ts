import { z } from 'zod';
export declare const CreateReportSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodString;
    category: z.ZodEnum<{
        HEALTH: "HEALTH";
        MOBILITY: "MOBILITY";
        SAFETY: "SAFETY";
        EDUCATION: "EDUCATION";
        SANITATION: "SANITATION";
        HOUSING: "HOUSING";
        OTHER: "OTHER";
    }>;
    anonymous: z.ZodDefault<z.ZodBoolean>;
    latitude: z.ZodOptional<z.ZodNumber>;
    longitude: z.ZodOptional<z.ZodNumber>;
    typedAddress: z.ZodOptional<z.ZodString>;
    recipientType: z.ZodOptional<z.ZodEnum<{
        ENTITY: "ENTITY";
        COMPANY: "COMPANY";
        BRANCH: "BRANCH";
        POLITICIAN: "POLITICIAN";
    }>>;
    recipientId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const UpdateStatusSchema: z.ZodObject<{
    status: z.ZodEnum<{
        UNDER_REVIEW: "UNDER_REVIEW";
        IN_PROGRESS: "IN_PROGRESS";
        RESOLVED: "RESOLVED";
        ARCHIVED: "ARCHIVED";
    }>;
    content: z.ZodString;
}, z.core.$strip>;
export declare const DisputeResolutionSchema: z.ZodObject<{
    content: z.ZodString;
}, z.core.$strip>;
export declare const FilterReportsSchema: z.ZodObject<{
    category: z.ZodOptional<z.ZodEnum<{
        HEALTH: "HEALTH";
        MOBILITY: "MOBILITY";
        SAFETY: "SAFETY";
        EDUCATION: "EDUCATION";
        SANITATION: "SANITATION";
        HOUSING: "HOUSING";
        OTHER: "OTHER";
    }>>;
    status: z.ZodOptional<z.ZodEnum<{
        UNDER_REVIEW: "UNDER_REVIEW";
        IN_PROGRESS: "IN_PROGRESS";
        RESOLVED: "RESOLVED";
        ARCHIVED: "ARCHIVED";
        OPEN: "OPEN";
        DISPUTED: "DISPUTED";
    }>>;
    city: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export type CreateReportInput = z.infer<typeof CreateReportSchema>;
export type UpdateStatusInput = z.infer<typeof UpdateStatusSchema>;
export type FilterReportsInput = z.infer<typeof FilterReportsSchema>;
//# sourceMappingURL=report.schema.d.ts.map