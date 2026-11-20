-- Conversão do vídeo para 1080p: duração e estado do processamento de cada arquivo de relato.
ALTER TABLE "report_media" ADD COLUMN "duration_ms" INTEGER;
ALTER TABLE "report_media" ADD COLUMN "processing" TEXT NOT NULL DEFAULT 'NONE';

CREATE INDEX "report_media_processing_created_at_idx" ON "report_media"("processing", "created_at");
