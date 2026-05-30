-- AlterTable: adicionar claimTargetId ao RegistrationRequest
ALTER TABLE "registration_requests" ADD COLUMN "claimTargetId" TEXT;
