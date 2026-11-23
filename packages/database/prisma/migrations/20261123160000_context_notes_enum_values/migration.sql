-- Contexto da Comunidade: valores novos de enum. Migration só dos valores, porque um valor novo só pode ser usado depois de gravado.
ALTER TYPE "NotificationType" ADD VALUE 'CONTEXT_NOTE_SHOWN';
ALTER TYPE "ModerationActionType" ADD VALUE 'CONTEXT_NOTE_REMOVED';
ALTER TYPE "FlagTargetType" ADD VALUE 'CONTEXT_NOTE';
