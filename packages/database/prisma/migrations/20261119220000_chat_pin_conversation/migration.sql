-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN IF NOT EXISTS "pinned_at" TIMESTAMP(3);
