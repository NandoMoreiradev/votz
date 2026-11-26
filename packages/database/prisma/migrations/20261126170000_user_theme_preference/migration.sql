-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('SYSTEM', 'LIGHT', 'DARK');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "theme_preference" "ThemePreference" NOT NULL DEFAULT 'SYSTEM';
