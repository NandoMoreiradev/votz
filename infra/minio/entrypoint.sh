#!/bin/sh
set -e
BUCKET="${MINIO_BUCKET:-votz-media}"

silo server /data --address ":9000" --console-address ":9001" &
SERVER_PID=$!

# Espera o servidor responder e cria o bucket com as mesmas regras do docker-compose.yml.
until mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  sleep 1
done
mc mb --ignore-existing "local/$BUCKET"
for p in avatars covers reports entities comments posts post-comments; do
  mc anonymous set download "local/$BUCKET/$p"
done
mc anonymous set none "local/$BUCKET/verification"

wait $SERVER_PID
