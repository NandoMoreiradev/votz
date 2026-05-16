import { z } from 'zod';
export declare const CreateReportSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodString;
    category: z.ZodEnum<["HEALTH", "MOBILITY", "SAFETY", "EDUCATION", "SANITATION", "HOUSING", "OTHER"]>;
    anonymous: z.ZodDefault<z.ZodBoolean>;
    latitude: z.ZodOptional<z.ZodNumber>;
    longitude: z.ZodOptional<z.ZodNumber>;
    typedAddress: z.ZodOptional<z.ZodString>;
    recipientType: z.ZodOptional<z.ZodEnum<["ENTITY", "COMPANY", "BRANCH", "POLITICIAN"]>>;
    recipientId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title: string;
    description: string;
    category: "HEALTH" | "MOBILITY" | "SAFETY" | "EDUCATION" | "SANITATION" | "HOUSING" | "OTHER";
    anonymous: boolean;
    latitude?: number | undefined;
    longitude?: number | undefined;
    typedAddress?: string | undefined;
    recipientType?: "ENTITY" | "COMPANY" | "BRANCH" | "POLITICIAN" | undefined;
    recipientId?: string | undefined;
}, {
    title: string;
    description: string;
    category: "HEALTH" | "MOBILITY" | "SAFETY" | "EDUCATION" | "SANITATION" | "HOUSING" | "OTHER";
    anonymous?: boolean | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
    typedAddress?: string | undefined;
    recipientType?: "ENTITY" | "COMPANY" | "BRANCH" | "POLITICIAN" | undefined;
    recipientId?: string | undefined;
}>;
export declare const UpdateStatusSchema: z.ZodObject<{
    status: z.ZodEnum<["UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "ARCHIVED"]>;
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "UNDER_REVIEW" | "IN_PROGRESS" | "RESOLVED" | "ARCHIVED";
    content: string;
}, {
    status: "UNDER_REVIEW" | "IN_PROGRESS" | "RESOLVED" | "ARCHIVED";
    content: string;
}>;
export declare const DisputeResolutionSchema: z.ZodObject<{
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    content: string;
}, {
    content: string;
}>;
export declare const FilterReportsSchema: z.ZodObject<{
    category: z.ZodOptional<z.ZodEnum<["HEALTH", "MOBILITY", "SAFETY", "EDUCATION", "SANITATION", "HOUSING", "OTHER"]>>;
    status: z.ZodOptional<z.ZodEnum<["OPEN", "UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "DISPUTED", "ARCHIVED"]>>;
    city: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "UNDER_REVIEW" | "IN_PROGRESS" | "RESOLVED" | "ARCHIVED" | "OPEN" | "DISPUTED" | undefined;
    category?: "HEALTH" | "MOBILITY" | "SAFETY" | "EDUCATION" | "SANITATION" | "HOUSING" | "OTHER" | undefined;
    city?: string | undefined;
    state?: string | undefined;
}, {
    status?: "UNDER_REVIEW" | "IN_PROGRESS" | "RESOLVED" | "ARCHIVED" | "OPEN" | "DISPUTED" | undefined;
    category?: "HEALTH" | "MOBILITY" | "SAFETY" | "EDUCATION" | "SANITATION" | "HOUSING" | "OTHER" | undefined;
    city?: string | undefined;
    state?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
}>;
export type CreateReportInput = z.infer<typeof CreateReportSchema>;
export type UpdateStatusInput = z.infer<typeof UpdateStatusSchema>;
export type FilterReportsInput = z.infer<typeof FilterReportsSchema>;
//# sourceMappingURL=report.schema.d.ts.map