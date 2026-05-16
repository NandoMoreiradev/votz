-- AlterTable
ALTER TABLE "users" ADD COLUMN "emailVerificationExpires" TIMESTAMP(3),
ADD COLUMN "emailVerificationToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_emailVerificationToken_key" ON "users"("emailVerificationToken");
