-- A revisão por IA passa a ler a foto e os quadros do vídeo do anúncio.
ALTER TABLE "ad_ai_analyses" ADD COLUMN "media_scope" TEXT,
ADD COLUMN "media_summary" TEXT,
ADD COLUMN "media_text" TEXT;
