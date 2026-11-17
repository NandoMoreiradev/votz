"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatePostCommentSchema = exports.CreatePostSchema = exports.CreatePostPollSchema = void 0;
const zod_1 = require("zod");
exports.CreatePostPollSchema = zod_1.z.object({
    question: zod_1.z.string().trim().max(280).optional(),
    options: zod_1.z.array(zod_1.z.string().trim().min(1).max(100)).min(2).max(4),
    durationHours: zod_1.z.coerce.number().int().min(1).max(168).default(24),
});
exports.CreatePostSchema = zod_1.z.object({
    content: zod_1.z.string().trim().max(2000).default(''),
    media: zod_1.z.array(zod_1.z.string().url()).max(4).optional(),
    city: zod_1.z.string().trim().max(100).optional(),
    state: zod_1.z.string().trim().length(2).toUpperCase().optional(),
    mentionedReportId: zod_1.z.string().uuid().optional(),
    mentionedDebateId: zod_1.z.string().min(1).max(64).optional(),
    mentionedPropostaId: zod_1.z.string().uuid().optional(),
    mentionedDebatePollId: zod_1.z.string().min(1).max(64).optional(),
    quotePostId: zod_1.z.string().uuid().optional(),
    poll: exports.CreatePostPollSchema.optional(),
});
exports.CreatePostCommentSchema = zod_1.z.object({
    content: zod_1.z.string().trim().max(1000).optional(),
    parentId: zod_1.z.string().uuid().optional(),
    mediaType: zod_1.z.enum(['TEXT', 'IMAGE', 'GIF', 'AUDIO']).default('TEXT'),
    mediaUrl: zod_1.z.string().url().max(500).optional(),
    mediaKey: zod_1.z.string().max(300).optional(),
    mediaDuration: zod_1.z.coerce.number().int().min(1).max(300).optional(),
});
//# sourceMappingURL=post.schema.js.map