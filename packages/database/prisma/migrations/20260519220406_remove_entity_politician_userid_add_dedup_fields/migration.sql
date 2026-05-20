-- DropForeignKey
ALTER TABLE "entities" DROP CONSTRAINT "entities_userId_fkey";

-- DropForeignKey
ALTER TABLE "politicians" DROP CONSTRAINT "politicians_userId_fkey";

-- DropIndex
DROP INDEX "entities_userId_key";

-- DropIndex
DROP INDEX "politicians_userId_key";

-- AlterTable: entities — remover userId, adicionar createdByUserId (auditoria)
ALTER TABLE "entities" DROP COLUMN "userId",
ADD COLUMN "createdByUserId" TEXT;

-- AlterTable: politicians — remover userId, adicionar cpf (dedup) e tseId (TSE futuro)
ALTER TABLE "politicians" DROP COLUMN "userId",
ADD COLUMN "cpf" TEXT,
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "tseId" TEXT;

-- AlterTable: registration_requests — rastrear org criada na aprovação
ALTER TABLE "registration_requests"
ADD COLUMN "approvedOrgId" TEXT,
ADD COLUMN "approvedOrgType" "OrgType";

-- CreateIndex: cpf e tseId únicos em politicians
CREATE UNIQUE INDEX "politicians_cpf_key" ON "politicians"("cpf");
CREATE UNIQUE INDEX "politicians_tseId_key" ON "politicians"("tseId");
