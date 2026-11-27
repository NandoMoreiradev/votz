ALTER TABLE "ad_impressions"
  ADD COLUMN "spend_account_id" TEXT,
  ADD COLUMN "spend_ad_set_id" TEXT,
  ADD COLUMN "spend_day" DATE,
  ADD COLUMN "spend_reserved_until" TIMESTAMP(3),
  ADD COLUMN "billed_millicents" INTEGER;

CREATE INDEX "ad_impressions_spend_account_reservation_idx"
  ON "ad_impressions"("spend_account_id", "spend_reserved_until");

CREATE INDEX "ad_impressions_spend_ad_set_reservation_idx"
  ON "ad_impressions"("spend_ad_set_id", "spend_day", "spend_reserved_until");
