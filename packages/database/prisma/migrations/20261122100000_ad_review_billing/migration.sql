-- Revisão de anúncios e faturamento pré-pago (plano de anúncios, Etapa 1, parte 2).
-- CreateEnum
CREATE TYPE "AdReviewSource" AS ENUM ('HUMAN', 'AI');
CREATE TYPE "AdTopUpMethod" AS ENUM ('PIX', 'BOLETO', 'CARD');
CREATE TYPE "AdPaymentProvider" AS ENUM ('TEST', 'ASAAS', 'STRIPE');
CREATE TYPE "AdTopUpStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELED');
CREATE TYPE "AdLedgerAccount" AS ENUM ('CUSTOMER_BALANCE', 'PAYMENTS_RECEIVED', 'AD_REVENUE', 'PROMO_FUND');
CREATE TYPE "AdLedgerSide" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "AdLedgerEntryType" AS ENUM ('TOPUP', 'SPEND', 'REFUND', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "ad_reviews" (
    "id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "decision" "AdReviewStatus" NOT NULL,
    "source" "AdReviewSource" NOT NULL DEFAULT 'HUMAN',
    "reviewer_id" TEXT,
    "reason" TEXT,
    "creative_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_top_ups" (
    "id" TEXT NOT NULL,
    "ad_account_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "method" "AdTopUpMethod" NOT NULL,
    "provider" "AdPaymentProvider" NOT NULL,
    "status" "AdTopUpStatus" NOT NULL DEFAULT 'PENDING',
    "external_id" TEXT,
    "payment_code" TEXT,
    "checkout_url" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_top_ups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ad_top_ups_amount_positive" CHECK ("amount_cents" > 0)
);

-- CreateTable
CREATE TABLE "ad_ledger_entries" (
    "id" TEXT NOT NULL,
    "ad_account_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "ledger" "AdLedgerAccount" NOT NULL,
    "side" "AdLedgerSide" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "type" "AdLedgerEntryType" NOT NULL,
    "description" TEXT NOT NULL,
    "top_up_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_ledger_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ad_ledger_entries_amount_positive" CHECK ("amount_cents" > 0)
);

-- CreateIndex
CREATE INDEX "ad_reviews_ad_id_created_at_idx" ON "ad_reviews"("ad_id", "created_at");
CREATE INDEX "ad_reviews_reviewer_id_idx" ON "ad_reviews"("reviewer_id");
CREATE UNIQUE INDEX "ad_top_ups_provider_external_id_key" ON "ad_top_ups"("provider", "external_id");
CREATE INDEX "ad_top_ups_ad_account_id_created_at_idx" ON "ad_top_ups"("ad_account_id", "created_at");
CREATE INDEX "ad_top_ups_status_expires_at_idx" ON "ad_top_ups"("status", "expires_at");
CREATE INDEX "ad_ledger_entries_ad_account_id_created_at_idx" ON "ad_ledger_entries"("ad_account_id", "created_at");
CREATE INDEX "ad_ledger_entries_transaction_id_idx" ON "ad_ledger_entries"("transaction_id");
CREATE INDEX "ad_ledger_entries_top_up_id_idx" ON "ad_ledger_entries"("top_up_id");

-- AddForeignKey
ALTER TABLE "ad_reviews" ADD CONSTRAINT "ad_reviews_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_reviews" ADD CONSTRAINT "ad_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ad_top_ups" ADD CONSTRAINT "ad_top_ups_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_ledger_entries" ADD CONSTRAINT "ad_ledger_entries_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_ledger_entries" ADD CONSTRAINT "ad_ledger_entries_top_up_id_fkey" FOREIGN KEY ("top_up_id") REFERENCES "ad_top_ups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- O livro-caixa não se edita nem se apaga: correção é lançamento novo.
CREATE OR REPLACE FUNCTION ad_ledger_entries_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'O livro-caixa de anúncios não pode ser alterado nem apagado.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ad_ledger_entries_no_update BEFORE UPDATE ON "ad_ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ad_ledger_entries_immutable();
