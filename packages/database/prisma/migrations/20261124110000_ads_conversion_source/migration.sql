-- Anúncios: de onde veio a conversão. As que já existem vieram da API do anunciante.
ALTER TABLE "ad_conversions" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'API';
