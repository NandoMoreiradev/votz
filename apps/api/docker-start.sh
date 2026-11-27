#!/bin/sh
# Sobe a API do Votz dentro do contêiner (Railway, Cloud Run).
#
# - RUN_MIGRATIONS (padrão "true"): roda `prisma migrate deploy` antes de subir. Em ambiente com várias
#   instâncias (Cloud Run), ponha RUN_MIGRATIONS=false e rode as migrations uma vez, num passo separado
#   (Cloud Run Job `votz-migrate`, ver infra/gcp/deploy.ps1). Senão toda instância nova disputa a trava do banco.
# - `exec node`: o Node vira o processo principal (PID 1) e recebe o SIGTERM do Cloud Run/Railway, então a API
#   encerra com cuidado (ver `enableShutdownHooks` em main.ts) em vez de ser morta depois de 10 s.
set -e

if [ "${RUN_MIGRATIONS:-true}" != "false" ]; then
  npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
fi

# O Railway e o Cloud Run injetam PORT; main.ts lê API_PORT.
API_PORT="${PORT:-${API_PORT:-3000}}"
export API_PORT
exec node apps/api/dist/main.js
