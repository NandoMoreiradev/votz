-- Denúncia de anúncio passa a pesar no leilão: carimbo por exibição e contagem por dia.
ALTER TABLE "ad_impressions" ADD COLUMN "reported_at" TIMESTAMP(3);
ALTER TABLE "ad_daily_stats" ADD COLUMN "reports" INTEGER NOT NULL DEFAULT 0;
