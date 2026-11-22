-- Permissões de anúncios (plano de anúncios, Etapa 1). Em migration separada: valor novo de enum
-- só pode ser usado depois de gravado.
ALTER TYPE "OrgPermission" ADD VALUE IF NOT EXISTS 'MANAGE_ADS';
ALTER TYPE "OrgPermission" ADD VALUE IF NOT EXISTS 'VIEW_ADS';
