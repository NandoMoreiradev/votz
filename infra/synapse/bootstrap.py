"""Prepara o Synapse no Railway: cria o banco dele no Postgres do projeto e escreve homeserver.yaml.

Variáveis obrigatórias:
  PGHOST, PGPORT, PGUSER, PGPASSWORD    Postgres do projeto (usuário administrador, só para criar o banco).
  MATRIX_DB_PASSWORD                    Senha do usuário votz_matrix (criado aqui).
  MATRIX_SERVER_NAME                    Nome do servidor (identidade permanente das contas de chat).
  MATRIX_JWT_SECRET                     Igual a CHAT_MATRIX_JWT_SECRET da API.
  MATRIX_REGISTRATION_SECRET            Igual a CHAT_MATRIX_REGISTRATION_SECRET da API.
Opcional: MATRIX_PUBLIC_BASEURL.
"""
import json
import os
import sys
import time

import psycopg2
from psycopg2 import sql


def need(name):
    value = os.environ.get(name, "").strip()
    if not value:
        sys.exit(f"Variável obrigatória ausente: {name}")
    return value


host, port = need("PGHOST"), os.environ.get("PGPORT", "5432")
admin_user, admin_password = need("PGUSER"), need("PGPASSWORD")
db_password = need("MATRIX_DB_PASSWORD")
server_name = need("MATRIX_SERVER_NAME")
jwt_secret = need("MATRIX_JWT_SECRET")
registration_secret = need("MATRIX_REGISTRATION_SECRET")

conn = None
for attempt in range(60):
    try:
        conn = psycopg2.connect(host=host, port=port, user=admin_user, password=admin_password, dbname="postgres", connect_timeout=5)
        break
    except psycopg2.OperationalError as error:
        print(f"Aguardando o Postgres ({attempt + 1}/60): {str(error).strip()[:120]}", flush=True)
        time.sleep(5)
if conn is None:
    sys.exit("Postgres indisponível.")

conn.autocommit = True
with conn.cursor() as cur:
    cur.execute("SELECT 1 FROM pg_roles WHERE rolname = 'votz_matrix'")
    if cur.fetchone():
        cur.execute(sql.SQL("ALTER ROLE votz_matrix WITH LOGIN PASSWORD {}").format(sql.Literal(db_password)))
    else:
        cur.execute(sql.SQL("CREATE ROLE votz_matrix LOGIN PASSWORD {}").format(sql.Literal(db_password)))
    cur.execute("SELECT 1 FROM pg_database WHERE datname = 'votz_matrix'")
    if not cur.fetchone():
        # O Synapse exige banco UTF8 com collation C.
        cur.execute("CREATE DATABASE votz_matrix OWNER votz_matrix ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0")
conn.close()

config = {
    "server_name": server_name,
    "pid_file": "/data/homeserver.pid",
    "report_stats": False,
    "public_baseurl": os.environ.get("MATRIX_PUBLIC_BASEURL") or None,
    "listeners": [{"port": 8008, "tls": False, "type": "http", "x_forwarded": False, "bind_addresses": ["::"], "resources": [{"names": ["client"], "compress": False}]}],
    "database": {"name": "psycopg2", "args": {"user": "votz_matrix", "password": db_password, "database": "votz_matrix", "host": host, "port": int(port), "cp_min": 2, "cp_max": 10}},
    "log_config": "/data/log.config",
    "signing_key_path": f"/data/{server_name}.signing.key",
    "media_store_path": "/data/media_store",
    "enable_registration": False,
    "allow_guest_access": False,
    "registration_shared_secret": registration_secret,
    "jwt_config": {"enabled": True, "secret": jwt_secret, "algorithm": "HS256", "issuer": "votz-chat", "audiences": ["votz-matrix"]},
    "password_config": {"enabled": False},
    "federation_domain_whitelist": [],
    "trusted_key_servers": [],
    "url_preview_enabled": False,
    "max_upload_size": "1K",
    "enable_metrics": False,
    "rc_message": {"per_second": 5, "burst_count": 30},
    # Os logins por JWT vêm só da API do Votz, que já aplica os próprios limites.
    "rc_login": {
        "address": {"per_second": 1, "burst_count": 100},
        "account": {"per_second": 1, "burst_count": 20},
        "failed_attempts": {"per_second": 0.17, "burst_count": 5},
    },
}
config = {key: value for key, value in config.items() if value is not None}

os.makedirs("/data", exist_ok=True)
with open("/data/homeserver.yaml", "w") as handle:
    json.dump(config, handle, indent=2)  # JSON é YAML válido, como no ambiente local
with open("/data/log.config", "w") as handle:
    json.dump({"version": 1, "formatters": {"plain": {"format": "%(asctime)s %(name)s %(levelname)s %(message)s"}}, "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}}, "root": {"level": "WARNING", "handlers": ["console"]}, "disable_existing_loggers": False}, handle)
os.chmod("/data/homeserver.yaml", 0o600)
print("Configuração do Synapse escrita.", flush=True)
