-- Teste A/B e modo sombra da entrega de anúncios.
ALTER TABLE "ad_impressions" ADD COLUMN "experiment" TEXT;
CREATE INDEX "ad_impressions_experiment_served_at_idx" ON "ad_impressions"("experiment", "served_at");

CREATE TABLE "ad_shadow_decisions" (
    "id" TEXT NOT NULL,
    "experiment" TEXT NOT NULL,
    "arm" TEXT NOT NULL,
    "served_ad_id" TEXT,
    "shadow_ad_id" TEXT,
    "agreed" BOOLEAN NOT NULL,
    "served_price_cents" INTEGER,
    "shadow_price_cents" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_shadow_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ad_shadow_decisions_experiment_arm_created_at_idx" ON "ad_shadow_decisions"("experiment", "arm", "created_at");
