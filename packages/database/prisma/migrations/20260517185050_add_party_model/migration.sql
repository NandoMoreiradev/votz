/*
  Warnings:

  - You are about to drop the column `party` on the `politicians` table. All the data in the column will be lost.
  - Added the required column `partyId` to the `politicians` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "politicians" DROP COLUMN "party",
ADD COLUMN     "partyId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "parties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parties_abbreviation_key" ON "parties"("abbreviation");

-- CreateIndex
CREATE UNIQUE INDEX "parties_number_key" ON "parties"("number");

-- AddForeignKey
ALTER TABLE "politicians" ADD CONSTRAINT "politicians_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
