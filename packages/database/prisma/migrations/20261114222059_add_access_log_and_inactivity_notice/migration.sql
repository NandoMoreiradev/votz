-- CreateEnum
CREATE TYPE "AccessEvent" AS ENUM ('REGISTER', 'LOGIN', 'GOOGLE_LOGIN', 'MFA_LOGIN', 'TOKEN_REFRESH');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "inactivityNoticeSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "access_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "event" "AccessEvent" NOT NULL,
    "ip" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "access_logs_createdAt_idx" ON "access_logs"("createdAt");

-- CreateIndex
CREATE INDEX "access_logs_userId_idx" ON "access_logs"("userId");
