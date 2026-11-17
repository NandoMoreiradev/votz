import { z } from 'zod';
export declare const CreatePostPollSchema: z.ZodObject<{
    question: z.ZodOptional<z.ZodString>;
    options: z.ZodArray<z.ZodString>;
    durationHours: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const CreatePostSchema: z.ZodObject<{
    content: z.ZodDefault<z.ZodString>;
    media: z.ZodOptional<z.ZodArray<z.ZodString>>;
    city: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
    mentionedReportId: z.ZodOptional<z.ZodString>;
    mentionedDebateId: z.ZodOptional<z.ZodString>;
    mentionedPropostaId: z.ZodOptional<z.ZodString>;
    mentionedDebatePollId: z.ZodOptional<z.ZodString>;
    quotePostId: z.ZodOptional<z.ZodString>;
    poll: z.ZodOptional<z.ZodObject<{
        question: z.ZodOptional<z.ZodString>;
        options: z.ZodArray<z.ZodString>;
        durationHours: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const CreatePostCommentSchema: z.ZodObject<{
    content: z.ZodOptional<z.ZodString>;
    parentId: z.ZodOptional<z.ZodString>;
    mediaType: z.ZodDefault<z.ZodEnum<{
        TEXT: "TEXT";
        IMAGE: "IMAGE";
        GIF: "GIF";
        AUDIO: "AUDIO";
    }>>;
    mediaUrl: z.ZodOptional<z.ZodString>;
    mediaKey: z.ZodOptional<z.ZodString>;
    mediaDuration: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export type CreatePostInput = z.infer<typeof CreatePostSchema>;
export type CreatePostCommentInput = z.infer<typeof CreatePostCommentSchema>;
//# sourceMappingURL=post.schema.d.ts.map