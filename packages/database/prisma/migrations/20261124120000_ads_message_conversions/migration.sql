-- Anúncios: conversas iniciadas pelo anúncio de mensagens, em contagem própria (não somam em `conversions`, que é do anunciante).
ALTER TABLE "ad_daily_stats" ADD COLUMN "message_conversations" INTEGER NOT NULL DEFAULT 0;
