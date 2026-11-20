-- Equipes que já existem ganham as permissões novas nos papéis padrão
-- (OWNER, MANAGER e AGENT lêem e respondem; VIEWER só vê o painel).
UPDATE "org_roles"
SET "permissions" = "permissions" || ARRAY['READ_MESSAGES', 'REPLY_MESSAGES']::"OrgPermission"[]
WHERE "isDefault" = true
  AND "name" IN ('OWNER', 'MANAGER', 'AGENT')
  AND NOT ('READ_MESSAGES' = ANY("permissions"));
