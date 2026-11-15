-- AlterEnum
ALTER TYPE "ModerationActionType" ADD VALUE 'API_KEY_TIER_CHANGED';

-- AlterTable
ALTER TABLE "registration_requests" ADD COLUMN     "note" VARCHAR(500);
