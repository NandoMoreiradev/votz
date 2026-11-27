-- Ciclo de vida do relato nível A (27/11/2026): avocação como registro próprio, motivo de arquivamento,
-- confirmação da resolução pelo cidadão e novos avisos. Ver docs/dev/ciclo-de-vida-do-relato-2026-11-27.md

-- CreateEnum
CREATE TYPE "ArchiveReason" AS ENUM ('DUPLICATE', 'OUT_OF_SCOPE', 'INSUFFICIENT_INFO', 'NOT_A_PUBLIC_PROBLEM');

-- CreateEnum
CREATE TYPE "AdvocacyCloseReason" AS ENUM ('WITHDRAWN', 'MANDATE_ENDED');

-- AlterEnum


ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REPORT_ADVOCATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REPORT_RESOLVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DISPUTE_PENDING_REVIEW';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DISPUTE_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ADVOCACY_DEADLINE_PASSED';

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "archive_reason" "ArchiveReason",
ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "resolution_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "resolved_without_evidence" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "report_advocacies" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "org_type" "FollowerActorType" NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT,
    "message" TEXT,
    "promised_for" TIMESTAMP(3),
    "deadline_notified_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "closed_reason" "AdvocacyCloseReason",
    "closed_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_advocacies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_advocacies_org_type_org_id_closed_at_idx" ON "report_advocacies"("org_type", "org_id", "closed_at");

-- CreateIndex
CREATE INDEX "report_advocacies_promised_for_idx" ON "report_advocacies"("promised_for");

-- CreateIndex
CREATE UNIQUE INDEX "report_advocacies_report_id_org_type_org_id_key" ON "report_advocacies"("report_id", "org_type", "org_id");

-- AddForeignKey
ALTER TABLE "report_advocacies" ADD CONSTRAINT "report_advocacies_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Backfill ───────────────────────────────────────────────────────────────

-- 1. Avocações antigas viviam só na linha do tempo (metadata.action = 'advocated'), gravadas como RESPONDED
--    pela página do relato e como UPDATE pelo Portal do Mandato. Viram um registro cada (a mais antiga vale).
INSERT INTO "report_advocacies" ("id", "report_id", "org_type", "org_id", "user_id", "created_at", "updated_at")
SELECT DISTINCT ON (te."reportId", org_type, org_id)
       gen_random_uuid()::text, te."reportId", org_type::"FollowerActorType", org_id, te."authorId", te."createdAt", te."createdAt"
FROM (
  SELECT t.*,
         CASE WHEN t.metadata->>'politicianId' IS NOT NULL THEN 'POLITICIAN' ELSE 'ENTITY' END AS org_type,
         COALESCE(t.metadata->>'politicianId', t.metadata->>'entityId') AS org_id
  FROM "timeline_events" t
  WHERE t.metadata->>'action' = 'advocated'
) te
WHERE te.org_id IS NOT NULL
ORDER BY te."reportId", org_type, org_id, te."createdAt" ASC
ON CONFLICT ("report_id", "org_type", "org_id") DO NOTHING;

-- 2. Compromissos que o fim do mandato já marcou como não cumpridos.
UPDATE "report_advocacies" a
SET "closed_at" = te."createdAt", "closed_reason" = 'MANDATE_ENDED'
FROM "timeline_events" te
WHERE te.metadata->>'action' = 'mandate_ended_unresolved_commitment'
  AND te."reportId" = a."report_id"
  AND a."org_type" = 'POLITICIAN'
  AND a."org_id" = te.metadata->>'politicianId'
  AND a."closed_at" IS NULL;

-- 3. Quem avocou passa a acompanhar (recebe os avisos de andamento).
INSERT INTO "report_followers" ("id", "reportId", "actorType", "actorId", "createdAt")
SELECT gen_random_uuid()::text, a."report_id", a."org_type", a."org_id", a."created_at"
FROM "report_advocacies" a
WHERE a."closed_at" IS NULL
ON CONFLICT ("reportId", "actorType", "actorId") DO NOTHING;

-- 4. Data de arquivamento dos relatos já arquivados (abre a janela de contestação a partir dela).
UPDATE "reports" SET "archived_at" = "updatedAt" WHERE "status" = 'ARCHIVED' AND "archived_at" IS NULL;

-- 5. Relatos reabertos guardavam a data da resolução antiga.
UPDATE "reports" SET "resolved_at" = NULL
WHERE "status" IN ('OPEN', 'UNDER_REVIEW', 'IN_PROGRESS') AND "resolved_at" IS NOT NULL;
