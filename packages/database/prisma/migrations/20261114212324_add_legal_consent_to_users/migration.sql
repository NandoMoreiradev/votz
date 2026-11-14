-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ageConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "privacyVersion" TEXT,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;
