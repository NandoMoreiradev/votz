# Synapse (servidor Matrix) privado do Votz para o Railway. Só a API do Votz fala com ele, pela rede interna.
# Não há federação nem cadastro público. Mesma versão e mesma configuração do ambiente local (docker-compose.chat.yml).
# Variáveis: veja bootstrap.py. Precisa de um volume em /data (chave de assinatura do servidor).
FROM ghcr.io/element-hq/synapse:v1.165.0
COPY bootstrap.py /bootstrap.py
COPY entrypoint.sh /votz-entrypoint.sh
ENTRYPOINT ["/bin/sh", "/votz-entrypoint.sh"]
