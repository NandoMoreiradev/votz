-- Imprensa, fase 4: avisos do pedido de contato. Migration só dos valores de enum, porque um valor novo só pode ser usado depois de gravado.
ALTER TYPE "NotificationType" ADD VALUE 'PRESS_CONTACT_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'PRESS_CONTACT_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'PRESS_CONTACT_DECLINED';
