"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefreshTokenSchema = exports.LoginSchema = exports.RegisterSchema = void 0;
const zod_1 = require("zod");
exports.RegisterSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(100).trim(),
    email: zod_1.z.string().email().toLowerCase().trim(),
    password: zod_1.z
        .string()
        .min(8)
        .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
        .regex(/[0-9]/, 'Must contain at least one number'),
});
exports.LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email().toLowerCase().trim(),
    password: zod_1.z.string().min(1),
});
exports.RefreshTokenSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1),
});
//# sourceMappingURL=auth.schema.js.map