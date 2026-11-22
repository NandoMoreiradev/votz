-- CreateEnum
CREATE TYPE "AdChargeOn" AS ENUM ('VIEWABLE_IMPRESSION', 'CLICK');

-- CreateEnum
CREATE TYPE "AdEventStatus" AS ENUM ('ACCEPTED', 'INVALID');

-- AlterTable
ALTER TABLE "ad_accounts" ADD COLUMN     "pending_spend_millicents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ad_impressions" (
    "id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "charge_on" "AdChargeOn" NOT NULL,
    "charge_millicents" INTEGER NOT NULL,
    "served_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewable_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "hidden_at" TIMESTAMP(3),

    CONSTRAINT "ad_impressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "impression_id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "AdEventStatus" NOT NULL,
    "reason" TEXT,
    "visible_ms" INTEGER,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_daily_stats" (
    "id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "ad_set_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "viewable_impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "hides" INTEGER NOT NULL DEFAULT 0,
    "invalid_events" INTEGER NOT NULL DEFAULT 0,
    "spend_millicents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ad_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_hidden_advertisers" (
    "user_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_hidden_advertisers_pkey" PRIMARY KEY ("user_id","company_id")
);

-- CreateIndex
CREATE INDEX "ad_impressions_user_id_ad_id_served_at_idx" ON "ad_impressions"("user_id", "ad_id", "served_at");

-- CreateIndex
CREATE INDEX "ad_impressions_ad_id_served_at_idx" ON "ad_impressions"("ad_id", "served_at");

-- CreateIndex
CREATE UNIQUE INDEX "ad_events_event_id_key" ON "ad_events"("event_id");

-- CreateIndex
CREATE INDEX "ad_events_impression_id_idx" ON "ad_events"("impression_id");

-- CreateIndex
CREATE INDEX "ad_events_ad_id_received_at_idx" ON "ad_events"("ad_id", "received_at");

-- CreateIndex
CREATE INDEX "ad_daily_stats_ad_set_id_day_idx" ON "ad_daily_stats"("ad_set_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ad_daily_stats_ad_id_day_key" ON "ad_daily_stats"("ad_id", "day");

-- AddForeignKey
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_events" ADD CONSTRAINT "ad_events_impression_id_fkey" FOREIGN KEY ("impression_id") REFERENCES "ad_impressions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_events" ADD CONSTRAINT "ad_events_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_daily_stats" ADD CONSTRAINT "ad_daily_stats_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_hidden_advertisers" ADD CONSTRAINT "ad_hidden_advertisers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_hidden_advertisers" ADD CONSTRAINT "ad_hidden_advertisers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Valores de dinheiro nunca ficam negativos (o banco barra mesmo que o código erre).
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_charge_positive" CHECK ("charge_millicents" > 0);
ALTER TABLE "ad_daily_stats" ADD CONSTRAINT "ad_daily_stats_spend_non_negative" CHECK ("spend_millicents" >= 0);
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_pending_spend_range" CHECK ("pending_spend_millicents" >= 0 AND "pending_spend_millicents" < 1000);
