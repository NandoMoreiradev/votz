-- AlterEnum
ALTER TYPE "FlagTargetType" ADD VALUE IF NOT EXISTS 'CONVERSATION';

-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN IF NOT EXISTS "muted_until" TIMESTAMP(3);
