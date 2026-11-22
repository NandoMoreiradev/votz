-- CreateEnum
CREATE TYPE "AdFraudLevel" AS ENUM ('REVIEW', 'EXTREME');

-- CreateEnum
CREATE TYPE "AdFraudStatus" AS ENUM ('OPEN', 'CONFIRMED', 'DISMISSED');

-- CreateTable
CREATE TABLE "ad_fraud_flags" (
    "id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "level" "AdFraudLevel" NOT NULL,
    "signals" TEXT[],
    "viewable" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "clicks_without_view" INTEGER NOT NULL,
    "invalid_clicks" INTEGER NOT NULL,
    "credited_millicents" INTEGER NOT NULL DEFAULT 0,
    "paused_ad" BOOLEAN NOT NULL DEFAULT false,
    "status" "AdFraudStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_fraud_flags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ad_fraud_flags_counts_valid" CHECK ("viewable" >= 0 AND "clicks" >= 0 AND "clicks_without_view" >= 0 AND "invalid_clicks" >= 0 AND "invalid_clicks" <= "clicks"),
    CONSTRAINT "ad_fraud_flags_credit_non_negative" CHECK ("credited_millicents" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "ad_fraud_flags_ad_id_day_key" ON "ad_fraud_flags"("ad_id", "day");

-- CreateIndex
CREATE INDEX "ad_fraud_flags_status_created_at_idx" ON "ad_fraud_flags"("status", "created_at");

-- CreateIndex
CREATE INDEX "ad_fraud_flags_account_id_idx" ON "ad_fraud_flags"("account_id");

-- AddForeignKey
ALTER TABLE "ad_fraud_flags" ADD CONSTRAINT "ad_fraud_flags_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
