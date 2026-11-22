#!/bin/sh
set -e
# Cria o banco do Synapse (se faltar) e escreve a configuração a partir das variáveis.
python /bootstrap.py
chown -R 991:991 /data
# Entrypoint original da imagem: roda o Synapse com a configuração gerada acima.
exec /start.py
