-- Devolução de saldo, recarga automática e notas fiscais dos anúncios (plano de anúncios, Etapa 1: o que faltava).

-- CreateEnum
CREATE TYPE "AdRefundStatus" AS ENUM ('REQUESTED', 'PAID', 'REJECTED', 'CANCELED');
CREATE TYPE "AdInvoiceStatus" AS ENUM ('PENDING', 'ISSUED', 'FAILED', 'CANCELED');

-- AlterTable
ALTER TABLE "ad_top_ups" ADD COLUMN "auto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ad_ledger_entries" ADD COLUMN "refund_id" TEXT;

-- CreateTable
CREATE TABLE "ad_refunds" (
    "id" TEXT NOT NULL,
    "ad_account_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "AdRefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "requested_by_id" TEXT NOT NULL,
    "resolved_by_id" TEXT,
    "resolution_note" TEXT,
    "external_id" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "ad_refunds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ad_refunds_amount_positive" CHECK ("amount_cents" > 0)
);

-- CreateTable
CREATE TABLE "ad_auto_top_ups" (
    "ad_account_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "threshold_cents" INTEGER NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "monthly_limit_cents" INTEGER NOT NULL,
    "provider" "AdPaymentProvider" NOT NULL,
    "payment_method_ref" TEXT,
    "consent_at" TIMESTAMP(3),
    "consent_by_id" TEXT,
    "last_triggered_at" TIMESTAMP(3),
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "stopped_reason" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_auto_top_ups_pkey" PRIMARY KEY ("ad_account_id"),
    CONSTRAINT "ad_auto_top_ups_amounts_positive" CHECK ("threshold_cents" > 0 AND "amount_cents" > 0 AND "monthly_limit_cents" >= "amount_cents")
);

-- CreateTable
CREATE TABLE "ad_invoices" (
    "id" TEXT NOT NULL,
    "ad_account_id" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "AdInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "taker_name" TEXT NOT NULL,
    "taker_cnpj" TEXT NOT NULL,
    "provider" TEXT,
    "external_id" TEXT,
    "number" TEXT,
    "pdf_url" TEXT,
    "xml_url" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "issued_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ad_invoices_amount_positive" CHECK ("amount_cents" > 0)
);

-- CreateIndex
CREATE INDEX "ad_refunds_ad_account_id_requested_at_idx" ON "ad_refunds"("ad_account_id", "requested_at");
CREATE INDEX "ad_refunds_status_requested_at_idx" ON "ad_refunds"("status", "requested_at");
CREATE INDEX "ad_invoices_status_created_at_idx" ON "ad_invoices"("status", "created_at");
CREATE UNIQUE INDEX "ad_invoices_ad_account_id_period_start_key" ON "ad_invoices"("ad_account_id", "period_start");
CREATE INDEX "ad_ledger_entries_refund_id_idx" ON "ad_ledger_entries"("refund_id");

-- AddForeignKey
ALTER TABLE "ad_ledger_entries" ADD CONSTRAINT "ad_ledger_entries_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "ad_refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ad_refunds" ADD CONSTRAINT "ad_refunds_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_auto_top_ups" ADD CONSTRAINT "ad_auto_top_ups_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_invoices" ADD CONSTRAINT "ad_invoices_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
