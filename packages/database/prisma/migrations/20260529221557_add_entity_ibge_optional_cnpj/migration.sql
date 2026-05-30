-- AlterTable: tornar cnpj opcional (DROP NOT NULL)
ALTER TABLE "entities" ALTER COLUMN "cnpj" DROP NOT NULL;

-- AlterTable: adicionar ibgeCode
ALTER TABLE "entities" ADD COLUMN "ibgeCode" TEXT;

-- CreateIndex: garantir unicidade do ibgeCode
CREATE UNIQUE INDEX "entities_ibgeCode_key" ON "entities"("ibgeCode");
