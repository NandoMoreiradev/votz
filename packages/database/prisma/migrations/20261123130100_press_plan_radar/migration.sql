-- Imprensa, fase 2: plano da credencial e radar (regras e achados).

CREATE TYPE "PressPlan" AS ENUM ('GRATUITA', 'PRO');
CREATE TYPE "PressRadarKind" AS ENUM ('SURGE', 'PRESSURE', 'UNANSWERED');
CREATE TYPE "PressRadarFrequency" AS ENUM ('IMMEDIATE', 'DAILY');

ALTER TABLE "press_credentials"
  ADD COLUMN "plan" "PressPlan" NOT NULL DEFAULT 'GRATUITA',
  ADD COLUMN "stripe_customer_id" TEXT,
  ADD COLUMN "stripe_subscription_id" TEXT;

CREATE TABLE "press_radar_rules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "kind" "PressRadarKind" NOT NULL,
    "states" TEXT[],
    "cities" TEXT[],
    "categories" "Category"[],
    "min_pressure" DOUBLE PRECISION,
    "stalled_days" INTEGER,
    "frequency" "PressRadarFrequency" NOT NULL DEFAULT 'DAILY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_digest_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "press_radar_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "press_radar_hits" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "report_id" TEXT,
    "surto_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "press_radar_hits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "press_radar_rules_user_id_active_idx" ON "press_radar_rules"("user_id", "active");
CREATE INDEX "press_radar_rules_kind_active_idx" ON "press_radar_rules"("kind", "active");
CREATE UNIQUE INDEX "press_radar_hits_rule_id_dedup_key_key" ON "press_radar_hits"("rule_id", "dedup_key");
CREATE INDEX "press_radar_hits_rule_id_sent_at_idx" ON "press_radar_hits"("rule_id", "sent_at");

ALTER TABLE "press_radar_rules" ADD CONSTRAINT "press_radar_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "press_radar_hits" ADD CONSTRAINT "press_radar_hits_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "press_radar_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
