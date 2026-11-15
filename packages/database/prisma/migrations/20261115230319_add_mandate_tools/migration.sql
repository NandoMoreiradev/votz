-- CreateEnum
CREATE TYPE "AlertRuleType" AS ENUM ('NEW_REPORT', 'PRESSURE_THRESHOLD', 'SURTO', 'STALLED_REPORT');

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "AlertFrequency" AS ENUM ('IMMEDIATE', 'DAILY_DIGEST');

-- CreateEnum
CREATE TYPE "AccountabilityReportStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ShareCardFormat" AS ENUM ('FEED', 'STORIES');

-- CreateEnum
CREATE TYPE "WebhookEventType" AS ENUM ('REPORT_CREATED', 'REPORT_STATUS_CHANGED', 'REPORT_PRESSURE_THRESHOLD', 'OUTBREAK_DETECTED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ModerationActionType" ADD VALUE 'ORG_ITEM_CREATED';
ALTER TYPE "ModerationActionType" ADD VALUE 'ORG_ITEM_DELETED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ALERT_RULE_MATCHED';
ALTER TYPE "NotificationType" ADD VALUE 'WEEKLY_DIGEST';

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_reportId_fkey";

-- AlterTable
ALTER TABLE "area_metrics_daily" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "reportId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "recipient_metrics_daily" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "recurrence_cells" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "mandate_settings" (
    "id" TEXT NOT NULL,
    "org_type" "OrgType" NOT NULL,
    "org_id" TEXT NOT NULL,
    "monthly_goal" INTEGER,
    "digest_enabled" BOOLEAN NOT NULL DEFAULT false,
    "digest_day_of_week" INTEGER NOT NULL DEFAULT 1,
    "digest_hour" INTEGER NOT NULL DEFAULT 8,
    "digest_unsubscribe_token" TEXT NOT NULL,
    "digest_legal_basis" TEXT,
    "digest_legal_basis_accepted_at" TIMESTAMP(3),
    "digest_last_sent_week" TEXT,
    "onboarding_dismissed" BOOLEAN NOT NULL DEFAULT false,
    "territory_confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mandate_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" TEXT NOT NULL,
    "org_type" "OrgType" NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rule_type" "AlertRuleType" NOT NULL,
    "categories" "Category"[],
    "cell7s" TEXT[],
    "whole_area" BOOLEAN NOT NULL DEFAULT true,
    "min_pressure" DOUBLE PRECISION,
    "stalled_days" INTEGER,
    "channels" "AlertChannel"[],
    "frequency" "AlertFrequency" NOT NULL DEFAULT 'IMMEDIATE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_trigger_logs" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "report_id" TEXT,
    "surto_id" TEXT,
    "dedup_key" TEXT NOT NULL,
    "batch_key" TEXT,
    "digest_sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_trigger_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reply_templates" (
    "id" TEXT NOT NULL,
    "org_type" "OrgType" NOT NULL,
    "org_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" "Category",
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reply_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_report_tags" (
    "id" TEXT NOT NULL,
    "org_type" "OrgType" NOT NULL,
    "org_id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_report_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_report_notes" (
    "id" TEXT NOT NULL,
    "org_type" "OrgType" NOT NULL,
    "org_id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_report_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountability_reports" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "org_type" "OrgType" NOT NULL,
    "org_id" TEXT NOT NULL,
    "period_start" TEXT NOT NULL,
    "period_end" TEXT NOT NULL,
    "dictionary_version" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "pdf_key" TEXT,
    "pdf_expires_at" TIMESTAMP(3),
    "status" "AccountabilityReportStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accountability_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_card_cache" (
    "id" TEXT NOT NULL,
    "politician_id" TEXT NOT NULL,
    "format" "ShareCardFormat" NOT NULL,
    "period_start" TEXT NOT NULL,
    "period_end" TEXT NOT NULL,
    "metrics_hash" TEXT NOT NULL,
    "image_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_card_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" TEXT NOT NULL,
    "org_type" "OrgType" NOT NULL,
    "org_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" "WebhookEventType"[],
    "secret_encrypted" TEXT NOT NULL,
    "secret_prefix" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "disabled_reason" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "endpoint_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" "WebhookEventType" NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "http_status" INTEGER,
    "latency_ms" INTEGER,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mandate_settings_digest_unsubscribe_token_key" ON "mandate_settings"("digest_unsubscribe_token");

-- CreateIndex
CREATE UNIQUE INDEX "mandate_settings_org_type_org_id_key" ON "mandate_settings"("org_type", "org_id");

-- CreateIndex
CREATE INDEX "alert_rules_org_type_org_id_active_idx" ON "alert_rules"("org_type", "org_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "alert_trigger_logs_dedup_key_key" ON "alert_trigger_logs"("dedup_key");

-- CreateIndex
CREATE INDEX "alert_trigger_logs_rule_id_delivered_at_idx" ON "alert_trigger_logs"("rule_id", "delivered_at");

-- CreateIndex
CREATE INDEX "alert_trigger_logs_batch_key_digest_sent_at_idx" ON "alert_trigger_logs"("batch_key", "digest_sent_at");

-- CreateIndex
CREATE INDEX "reply_templates_org_type_org_id_idx" ON "reply_templates"("org_type", "org_id");

-- CreateIndex
CREATE INDEX "org_report_tags_org_type_org_id_report_id_idx" ON "org_report_tags"("org_type", "org_id", "report_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_report_tags_org_type_org_id_report_id_label_key" ON "org_report_tags"("org_type", "org_id", "report_id", "label");

-- CreateIndex
CREATE INDEX "org_report_notes_org_type_org_id_report_id_idx" ON "org_report_notes"("org_type", "org_id", "report_id");

-- CreateIndex
CREATE UNIQUE INDEX "accountability_reports_code_key" ON "accountability_reports"("code");

-- CreateIndex
CREATE INDEX "accountability_reports_org_type_org_id_created_at_idx" ON "accountability_reports"("org_type", "org_id", "created_at");

-- CreateIndex
CREATE INDEX "share_card_cache_politician_id_created_at_idx" ON "share_card_cache"("politician_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "share_card_cache_politician_id_format_period_start_period_e_key" ON "share_card_cache"("politician_id", "format", "period_start", "period_end", "metrics_hash");

-- CreateIndex
CREATE INDEX "webhook_endpoints_org_type_org_id_active_idx" ON "webhook_endpoints"("org_type", "org_id", "active");

-- CreateIndex
CREATE INDEX "webhook_deliveries_endpoint_id_created_at_idx" ON "webhook_deliveries"("endpoint_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_endpoint_id_event_id_key" ON "webhook_deliveries"("endpoint_id", "event_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_trigger_logs" ADD CONSTRAINT "alert_trigger_logs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_report_tags" ADD CONSTRAINT "org_report_tags_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_report_notes" ADD CONSTRAINT "org_report_notes_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
