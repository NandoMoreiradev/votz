-- Catalogo de planos v1: remove CAMPANHA e unifica enums de EntityPlan e PoliticianPlan
-- Mapeamentos sem perda de linhas:
--   EntityPlan:     PRO -> GESTAO, ENTERPRISE -> INTEGRACAO, GESTAO -> GESTAO, BASICO -> BASICO
--   PoliticianPlan: MANDATOMETRO_PRO -> MANDATO_PRO, CAMPANHA -> MANDATO_PRO, MANDATO -> MANDATO, BASICO -> BASICO

-- 1. EntityPlan
CREATE TYPE "EntityPlan_new" AS ENUM ('BASICO', 'GESTAO', 'INTEGRACAO');

ALTER TABLE "entities" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "entities"
  ALTER COLUMN "plan" TYPE "EntityPlan_new"
  USING (
    CASE "plan"::text
      WHEN 'PRO' THEN 'GESTAO'
      WHEN 'ENTERPRISE' THEN 'INTEGRACAO'
      WHEN 'GESTAO' THEN 'GESTAO'
      ELSE 'BASICO'
    END
  )::"EntityPlan_new";

ALTER TYPE "EntityPlan" RENAME TO "EntityPlan_old";
ALTER TYPE "EntityPlan_new" RENAME TO "EntityPlan";
DROP TYPE "EntityPlan_old";
ALTER TABLE "entities" ALTER COLUMN "plan" SET DEFAULT 'BASICO';

-- 2. PoliticianPlan
CREATE TYPE "PoliticianPlan_new" AS ENUM ('BASICO', 'MANDATO', 'MANDATO_PRO');

ALTER TABLE "politicians" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "politicians"
  ALTER COLUMN "plan" TYPE "PoliticianPlan_new"
  USING (
    CASE "plan"::text
      WHEN 'MANDATOMETRO_PRO' THEN 'MANDATO_PRO'
      WHEN 'CAMPANHA' THEN 'MANDATO_PRO'
      WHEN 'MANDATO' THEN 'MANDATO'
      ELSE 'BASICO'
    END
  )::"PoliticianPlan_new";

ALTER TYPE "PoliticianPlan" RENAME TO "PoliticianPlan_old";
ALTER TYPE "PoliticianPlan_new" RENAME TO "PoliticianPlan";
DROP TYPE "PoliticianPlan_old";
ALTER TABLE "politicians" ALTER COLUMN "plan" SET DEFAULT 'BASICO';
