-- Credenciamento de imprensa (jornalista, veículo ou freelancer): pedido, confirmação do e-mail da redação e decisão.

CREATE TYPE "PressOutletType" AS ENUM ('TV', 'RADIO', 'NEWSPAPER', 'PORTAL', 'AGENCY', 'INDEPENDENT', 'FREELANCER', 'OTHER');

CREATE TYPE "PressCredentialStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

CREATE TABLE "press_credentials" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "outlet_name" VARCHAR(120) NOT NULL,
    "outlet_type" "PressOutletType" NOT NULL,
    "job_title" VARCHAR(80),
    "website" VARCHAR(300) NOT NULL,
    "newsroom_email" VARCHAR(200) NOT NULL,
    "coverage_area" VARCHAR(160),
    "portfolio_urls" TEXT[],
    "note" VARCHAR(500),
    "email_confirmed_at" TIMESTAMP(3),
    "email_token_hash" TEXT,
    "email_token_expires" TIMESTAMP(3),
    "status" "PressCredentialStatus" NOT NULL DEFAULT 'PENDING',
    "reviewer_id" TEXT,
    "review_note" VARCHAR(500),
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "press_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "press_credentials_email_token_hash_key" ON "press_credentials"("email_token_hash");

CREATE INDEX "press_credentials_user_id_status_idx" ON "press_credentials"("user_id", "status");

CREATE INDEX "press_credentials_status_created_at_idx" ON "press_credentials"("status", "created_at");

ALTER TABLE "press_credentials" ADD CONSTRAINT "press_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "press_credentials" ADD CONSTRAINT "press_credentials_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
