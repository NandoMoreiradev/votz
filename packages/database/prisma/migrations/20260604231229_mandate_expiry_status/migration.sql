-- CreateEnum
CREATE TYPE "PoliticianStatus" AS ENUM ('ATIVO', 'ENCERRADO', 'AFASTADO');

-- AlterTable
ALTER TABLE "politicians" ADD COLUMN     "status" "PoliticianStatus" NOT NULL DEFAULT 'ATIVO';
