# MinIO (armazenamento S3) do Votz para o Railway: sobe o servidor e cria o bucket com as pastas públicas.
# Mesma imagem do docker-compose local. Variáveis: MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, MINIO_BUCKET.
FROM pgsty/silo:latest
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
