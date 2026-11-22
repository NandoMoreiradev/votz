#!/bin/sh
# Se SITE_PASSWORD estiver definida, o site inteiro pede usuário e senha (teste fechado).
# Sem ela, o site fica aberto.
set -e

if [ -n "$SITE_PASSWORD" ]; then
  SITE_USER="${SITE_USER:-votz}"
  HASH="$(caddy hash-password --plaintext "$SITE_PASSWORD")"
  cat > /etc/caddy/auth.caddy <<EOF
basic_auth {
  $SITE_USER $HASH
}
EOF
else
  : > /etc/caddy/auth.caddy
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
