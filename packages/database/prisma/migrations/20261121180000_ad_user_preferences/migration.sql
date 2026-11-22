-- Preferências de anúncios (plano de anúncios, seção 3.4). Personalização desligada por padrão (opt-in).
-- CreateTable
CREATE TABLE "ad_user_preferences" (
    "user_id" TEXT NOT NULL,
    "personalization_consent" BOOLEAN NOT NULL DEFAULT false,
    "consent_at" TIMESTAMP(3),
    "consent_version" TEXT,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_user_preferences_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "ad_user_preferences" ADD CONSTRAINT "ad_user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
