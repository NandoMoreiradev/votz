# API do Votz (NestJS) para o Railway.
# O contexto de build é a RAIZ do repositório (monorepo com workspaces).
# No Railway: variável RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile
FROM node:20-bookworm-slim

# openssl: exigido pelo motor do Prisma. ca-certificates: chamadas HTTPS (S3, YouTube, etc.).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências primeiro (melhor cache). O mobile e o chat-crypto-lab ficam fora (.dockerignore).
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/ads-server/package.json apps/ads-server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/zod-schemas/package.json packages/zod-schemas/package.json
COPY packages/chat-core/package.json packages/chat-core/package.json
COPY packages/chat-crypto-lab/package.json packages/chat-crypto-lab/package.json
RUN npm ci --include=dev --no-audit --no-fund

COPY . .

# Gera o client do Prisma e compila pacotes compartilhados + API.
# DATABASE_URL/DIRECT_URL falsos: o generate só lê o schema, não conecta.
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x DIRECT_URL=postgresql://x:x@localhost:5432/x \
    npx prisma generate --schema=packages/database/prisma/schema.prisma \
  && npm run build --workspace=packages/shared-types \
  && npm run build --workspace=packages/zod-schemas \
  && npm run build --workspace=apps/api

ENV NODE_ENV=production

# Roda as migrations e sobe a API. O Railway injeta PORT; main.ts lê API_PORT, então ligamos os dois.
CMD ["sh", "-c", "npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma && API_PORT=${PORT:-3000} node apps/api/dist/main.js"]
