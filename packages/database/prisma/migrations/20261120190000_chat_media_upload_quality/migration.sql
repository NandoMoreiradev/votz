-- Qualidade das fotos e vídeos que a pessoa envia nas conversas (NORMAL ou HIGH).
ALTER TABLE "chat_privacy" ADD COLUMN "media_upload_quality" TEXT NOT NULL DEFAULT 'NORMAL';
