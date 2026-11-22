-- AlterEnum
-- Avisos ao anunciante: saldo para menos de um dia e campanhas pausadas por falta de saldo.
ALTER TYPE "NotificationType" ADD VALUE 'AD_LOW_BALANCE';
ALTER TYPE "NotificationType" ADD VALUE 'AD_PAUSED_NO_BALANCE';
