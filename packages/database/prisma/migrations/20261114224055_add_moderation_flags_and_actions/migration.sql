-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM ('REPORT_REMOVED', 'COMMENT_REMOVED', 'USER_BANNED', 'USER_UNBANNED');

-- CreateEnum
CREATE TYPE "FlagTargetType" AS ENUM ('REPORT', 'COMMENT');

-- CreateEnum
CREATE TYPE "FlagReason" AS ENUM ('FALSE_INFO', 'OFFENSIVE', 'PERSONAL_DATA', 'SEXUAL_OR_VIOLENT', 'SPAM_OR_ADS', 'FAKE_PROFILE', 'COPYRIGHT', 'OTHER');

-- CreateEnum
CREATE TYPE "FlagStatus" AS ENUM ('OPEN', 'ACTIONED', 'DISMISSED');

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" TEXT NOT NULL,
    "action" "ModerationActionType" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_flags" (
    "id" TEXT NOT NULL,
    "targetType" "FlagTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" "FlagReason" NOT NULL,
    "details" VARCHAR(500),
    "status" "FlagStatus" NOT NULL DEFAULT 'OPEN',
    "reporterId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moderation_actions_targetType_targetId_idx" ON "moderation_actions"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "content_flags_status_createdAt_idx" ON "content_flags"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "content_flags_reporterId_targetType_targetId_key" ON "content_flags"("reporterId", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_flags" ADD CONSTRAINT "content_flags_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
