#!/bin/bash
# Script de partida da VM votz-synapse (Container-Optimized OS, sem IP público).
# A cada boot: lê os segredos do Secret Manager e sobe o Postgres e o Synapse em contêineres.
# Configuração da VM (metadata): SYNAPSE_IMAGE, POSTGRES_IMAGE, MATRIX_SERVER_NAME.
# Segredos usados: matrix-pg-admin-password, matrix-db-password, matrix-jwt-secret, matrix-registration-secret.
set -u

md() { curl -s -H 'Metadata-Flavor: Google' "http://metadata.google.internal/computeMetadata/v1/$1"; }
PROJECT="$(md project/project-id)"
TOKEN="$(md instance/service-accounts/default/token | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
secret() {
  curl -s -H "Authorization: Bearer $TOKEN" \
    "https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/$1/versions/latest:access" |
    sed -n 's/.*"data": *"\([^"]*\)".*/\1/p' | tr '_-' '/+' | base64 -d
}

SYNAPSE_IMAGE="$(md instance/attributes/SYNAPSE_IMAGE)"
POSTGRES_IMAGE="$(md instance/attributes/POSTGRES_IMAGE)"
MATRIX_SERVER_NAME="$(md instance/attributes/MATRIX_SERVER_NAME)"
PG_ADMIN_PASSWORD="$(secret matrix-pg-admin-password)"
MATRIX_DB_PASSWORD="$(secret matrix-db-password)"
MATRIX_JWT_SECRET="$(secret matrix-jwt-secret)"
MATRIX_REGISTRATION_SECRET="$(secret matrix-registration-secret)"

for v in SYNAPSE_IMAGE POSTGRES_IMAGE MATRIX_SERVER_NAME PG_ADMIN_PASSWORD MATRIX_DB_PASSWORD MATRIX_JWT_SECRET MATRIX_REGISTRATION_SECRET; do
  if [ -z "${!v}" ]; then echo "FALTA: $v" ; exit 1; fi
done

# Acesso ao Artifact Registry (as imagens vêm de lá, a VM não tem internet pública).
export HOME=/home/chronos
docker-credential-gcr configure-docker --registries="$(echo "$SYNAPSE_IMAGE" | cut -d/ -f1)" >/dev/null 2>&1

docker network create votz-chat >/dev/null 2>&1 || true

docker rm -f votz-chat-postgres votz-synapse >/dev/null 2>&1 || true

# Banco do Synapse: só na rede interna do Docker, nunca publicado fora da VM.
docker run -d --name votz-chat-postgres --restart unless-stopped --network votz-chat \
  -e POSTGRES_PASSWORD="$PG_ADMIN_PASSWORD" \
  -v votz_chat_pgdata:/var/lib/postgresql/data \
  "$POSTGRES_IMAGE"

# Synapse: o entrypoint da nossa imagem cria o banco votz_matrix e escreve a configuração.
docker run -d --name votz-synapse --restart unless-stopped --network votz-chat \
  -p 8008:8008 \
  -e PGHOST=votz-chat-postgres -e PGPORT=5432 -e PGUSER=postgres -e PGPASSWORD="$PG_ADMIN_PASSWORD" \
  -e MATRIX_DB_PASSWORD="$MATRIX_DB_PASSWORD" \
  -e MATRIX_SERVER_NAME="$MATRIX_SERVER_NAME" \
  -e MATRIX_JWT_SECRET="$MATRIX_JWT_SECRET" \
  -e MATRIX_REGISTRATION_SECRET="$MATRIX_REGISTRATION_SECRET" \
  -v votz_chat_data:/data \
  "$SYNAPSE_IMAGE"
