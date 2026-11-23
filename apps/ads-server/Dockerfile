# Servidor de anúncios do Votz (só a entrega e os eventos) para o Railway.
# O contexto de build é a RAIZ do repositório (monorepo com workspaces).
# No Railway: variável RAILWAY_DOCKERFILE_PATH=apps/ads-server/Dockerfile
# Usa as MESMAS variáveis da API (DATABASE_URL, REDIS_URL, JWT_SECRET, CLOUDFLARE_R2_*, APP_URL, AD_CLICK_URL_BASE...).
# Não roda migrations: quem migra o banco é a API.
FROM node:20-bookworm-slim

# openssl: exigido pelo motor do Prisma. ca-certificates: chamadas HTTPS (armazenamento de mídia).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/ads-server/package.json apps/ads-server/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/zod-schemas/package.json packages/zod-schemas/package.json
COPY packages/chat-core/package.json packages/chat-core/package.json
COPY packages/chat-crypto-lab/package.json packages/chat-crypto-lab/package.json
RUN npm ci --include=dev --no-audit --no-fund

COPY . .

# Gera o client do Prisma e compila o pacote compartilhado + o servidor de anúncios (que compila junto o código de
# entrega que importa de apps/api/src). DATABASE_URL/DIRECT_URL falsos: o generate só lê o schema, não conecta.
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x DIRECT_URL=postgresql://x:x@localhost:5432/x \
    npx prisma generate --schema=packages/database/prisma/schema.prisma \
  && npm run build --workspace=packages/shared-types \
  && npm run build --workspace=apps/ads-server

ENV NODE_ENV=production

# O Railway injeta PORT; o servidor lê ADS_SERVER_PORT e depois PORT.
CMD ["sh", "-c", "node apps/ads-server/dist/ads-server/src/main.js"]
