-- AlterTable
-- Controle dos avisos de saldo, para avisar uma vez por situacao (e de novo so depois que ela passar e voltar).
ALTER TABLE "ad_accounts" ADD COLUMN "low_balance_alerted_at" TIMESTAMP(3),
  ADD COLUMN "paused_for_balance_at" TIMESTAMP(3),
  ADD COLUMN "paused_alert_sent_at" TIMESTAMP(3);
