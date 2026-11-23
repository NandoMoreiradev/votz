-- Credenciamento de imprensa: avisos ao jornalista sobre a decisão do pedido.
-- Fica numa migration só dele porque um valor novo de enum só pode ser usado depois de gravado.
ALTER TYPE "NotificationType" ADD VALUE 'PRESS_CREDENTIAL_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'PRESS_CREDENTIAL_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'PRESS_CREDENTIAL_REVOKED';
