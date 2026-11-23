-- Imprensa, fase 2: valores novos de enum (aviso do radar e auditoria da troca de plano).
-- Ficam numa migration só deles porque um valor novo de enum só pode ser usado depois de gravado.
ALTER TYPE "NotificationType" ADD VALUE 'PRESS_RADAR_HIT';
ALTER TYPE "ModerationActionType" ADD VALUE 'PRESS_PLAN_CHANGED';
