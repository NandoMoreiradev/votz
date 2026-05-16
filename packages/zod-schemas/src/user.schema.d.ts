import { z } from 'zod';
export declare const UpdateProfileSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    bio: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    bio?: string | undefined;
    phone?: string | undefined;
}, {
    name?: string | undefined;
    bio?: string | undefined;
    phone?: string | undefined;
}>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
//# sourceMappingURL=user.schema.d.ts.map