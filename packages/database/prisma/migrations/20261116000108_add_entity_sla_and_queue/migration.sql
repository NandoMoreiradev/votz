-- CreateEnum
CREATE TYPE "SlaState" AS ENUM ('ON_TIME', 'AT_RISK', 'BREACHED', 'MET', 'MET_LATE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SLA_AT_RISK';
ALTER TYPE "NotificationType" ADD VALUE 'SLA_BREACHED';
ALTER TYPE "NotificationType" ADD VALUE 'SLA_ESCALATED';
ALTER TYPE "NotificationType" ADD VALUE 'REPORT_ASSIGNED';

-- AlterEnum
ALTER TYPE "OrgPermission" ADD VALUE 'ASSIGN_REPORTS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WebhookEventType" ADD VALUE 'SLA_AT_RISK';
ALTER TYPE "WebhookEventType" ADD VALUE 'SLA_BREACHED';
ALTER TYPE "WebhookEventType" ADD VALUE 'REPORT_ASSIGNED';

-- AlterTable
ALTER TABLE "area_metrics_daily" ADD COLUMN     "sla_breached_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sla_met_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "entities" ADD COLUMN     "auto_monthly_report_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resolution_sla_hours" JSONB,
ADD COLUMN     "sla_escalation_hours" INTEGER NOT NULL DEFAULT 24;

-- AlterTable
ALTER TABLE "recipient_metrics_daily" ADD COLUMN     "sla_breached_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sla_met_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "resolution_sla_due_at" TIMESTAMP(3),
ADD COLUMN     "resolution_sla_met_at" TIMESTAMP(3),
ADD COLUMN     "resolution_sla_state" "SlaState",
ADD COLUMN     "sla_due_at" TIMESTAMP(3),
ADD COLUMN     "sla_met_at" TIMESTAMP(3),
ADD COLUMN     "sla_started_at" TIMESTAMP(3),
ADD COLUMN     "sla_state" "SlaState";

-- CreateTable
CREATE TABLE "org_report_assignments" (
    "id" TEXT NOT NULL,
    "org_type" "OrgType" NOT NULL,
    "org_id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "assignee_user_id" TEXT,
    "assigned_by_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "org_report_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_notification_logs" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "milestone" TEXT NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sla_notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_report_assignments_org_type_org_id_active_assignee_user_idx" ON "org_report_assignments"("org_type", "org_id", "active", "assignee_user_id");

-- CreateIndex
CREATE INDEX "org_report_assignments_report_id_active_created_at_idx" ON "org_report_assignments"("report_id", "active", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sla_notification_logs_dedup_key_key" ON "sla_notification_logs"("dedup_key");

-- CreateIndex
CREATE INDEX "sla_notification_logs_entity_id_sent_at_idx" ON "sla_notification_logs"("entity_id", "sent_at");

-- CreateIndex
CREATE INDEX "reports_recipientType_recipientId_sla_state_sla_due_at_idx" ON "reports"("recipientType", "recipientId", "sla_state", "sla_due_at");

-- CreateIndex
CREATE INDEX "reports_sla_state_sla_due_at_idx" ON "reports"("sla_state", "sla_due_at");

-- AddForeignKey
ALTER TABLE "org_report_assignments" ADD CONSTRAINT "org_report_assignments_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
