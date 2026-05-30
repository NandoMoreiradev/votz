-- AlterTable
ALTER TABLE "politicians" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT,
ADD COLUMN IF NOT EXISTS "website" TEXT;
