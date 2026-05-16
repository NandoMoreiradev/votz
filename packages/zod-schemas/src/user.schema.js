"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateProfileSchema = void 0;
const zod_1 = require("zod");
exports.UpdateProfileSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(100).trim().optional(),
    bio: zod_1.z.string().max(300).trim().optional(),
    phone: zod_1.z.string().optional(),
});
//# sourceMappingURL=user.schema.js.map