-- Devolução de saldo, recarga automática e notas fiscais dos anúncios: valores novos de enum.
-- Ficam numa migration só deles porque um valor novo de enum só pode ser usado depois de gravado.

-- Avisos ao anunciante.
ALTER TYPE "NotificationType" ADD VALUE 'AD_REFUND_PAID';
ALTER TYPE "NotificationType" ADD VALUE 'AD_REFUND_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'AD_AUTO_TOPUP_STOPPED';
ALTER TYPE "NotificationType" ADD VALUE 'AD_INVOICE_ISSUED';

-- Conta do livro-caixa para devoluções pedidas e ainda não pagas.
ALTER TYPE "AdLedgerAccount" ADD VALUE 'REFUNDS_PAYABLE';
