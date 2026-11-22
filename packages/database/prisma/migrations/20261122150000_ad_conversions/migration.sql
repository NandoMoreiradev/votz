-- AlterTable: identificador do clique e primeira abertura do link do botão
ALTER TABLE "ad_impressions" ADD COLUMN     "click_token" TEXT,
ADD COLUMN     "landed_at" TIMESTAMP(3);

-- AlterTable: conversões contadas por dia
ALTER TABLE "ad_daily_stats" ADD COLUMN     "conversions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "conversion_value_cents" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ad_conversion_keys" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "ad_conversion_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_conversions" (
    "id" TEXT NOT NULL,
    "impression_id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "key_id" TEXT,
    "event_name" TEXT NOT NULL,
    "value_cents" INTEGER NOT NULL DEFAULT 0,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupe_key" TEXT NOT NULL,

    CONSTRAINT "ad_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ad_impressions_click_token_key" ON "ad_impressions"("click_token");

-- CreateIndex
CREATE UNIQUE INDEX "ad_conversion_keys_key_hash_key" ON "ad_conversion_keys"("key_hash");

-- CreateIndex
CREATE INDEX "ad_conversion_keys_account_id_idx" ON "ad_conversion_keys"("account_id");

-- CreateIndex
CREATE INDEX "ad_conversions_impression_id_idx" ON "ad_conversions"("impression_id");

-- CreateIndex
CREATE INDEX "ad_conversions_ad_id_occurred_at_idx" ON "ad_conversions"("ad_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "ad_conversions_account_id_dedupe_key_key" ON "ad_conversions"("account_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "ad_conversion_keys" ADD CONSTRAINT "ad_conversion_keys_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_conversions" ADD CONSTRAINT "ad_conversions_impression_id_fkey" FOREIGN KEY ("impression_id") REFERENCES "ad_impressions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_conversions" ADD CONSTRAINT "ad_conversions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_conversions" ADD CONSTRAINT "ad_conversions_key_id_fkey" FOREIGN KEY ("key_id") REFERENCES "ad_conversion_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- O banco também barra valor negativo (a API já recusa).
ALTER TABLE "ad_conversions" ADD CONSTRAINT "ad_conversions_value_cents_check" CHECK ("value_cents" >= 0);
