-- AlterEnum: adiciona tipos de notificação faltantes para relatos, publicações e pesquisas oficiais
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMMENT_REPLY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REPORT_UPDATE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'NEW_REPORT_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REPORT_REASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REPORT_DISPUTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POST_COMMENT_REPLY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POST_QUOTE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'OFFICIAL_SURVEY_PUBLISHED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SURVEY_REVIEWED';

-- CreateIndex: índices quentes para listagem, contagem de não lidas e deduplicação por janela
CREATE INDEX IF NOT EXISTS "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "notifications_userId_read_idx" ON "notifications"("userId", "read");
CREATE INDEX IF NOT EXISTS "notifications_userId_type_createdAt_idx" ON "notifications"("userId", "type", "createdAt" DESC);
