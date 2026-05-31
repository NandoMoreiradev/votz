/*
  Warnings:

  - A unique constraint covering the columns `[stripeCustomerId]` on the table `companies` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeSubscriptionId]` on the table `companies` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeCustomerId]` on the table `entities` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeSubscriptionId]` on the table `entities` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeCustomerId]` on the table `politicians` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeSubscriptionId]` on the table `politicians` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT;

-- AlterTable
ALTER TABLE "entities" ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT;

-- AlterTable
ALTER TABLE "politicians" ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "companies_stripeCustomerId_key" ON "companies"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_stripeSubscriptionId_key" ON "companies"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "entities_stripeCustomerId_key" ON "entities"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "entities_stripeSubscriptionId_key" ON "entities"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "politicians_stripeCustomerId_key" ON "politicians"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "politicians_stripeSubscriptionId_key" ON "politicians"("stripeSubscriptionId");
