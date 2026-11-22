# Web do Votz (React + Vite) servido pelo Caddy, com senha de acesso opcional (teste fechado).
# O contexto de build é a RAIZ do repositório.
# No Railway: variável RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/zod-schemas/package.json packages/zod-schemas/package.json
COPY packages/chat-core/package.json packages/chat-core/package.json
COPY packages/chat-crypto-lab/package.json packages/chat-crypto-lab/package.json
RUN npm ci --include=dev --no-audit --no-fund

COPY . .

# Variáveis do Vite são embutidas no build. No Railway, declare-as no serviço do web.
ARG VITE_API_URL
ARG VITE_MAPTILER_KEY
ARG VITE_LIVEKIT_URL
ENV VITE_API_URL=$VITE_API_URL \
    VITE_MAPTILER_KEY=$VITE_MAPTILER_KEY \
    VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL

RUN npm run build --workspace=packages/shared-types \
  && npm run build --workspace=packages/zod-schemas \
  && npm run build --workspace=packages/chat-core \
  && npm run build --workspace=apps/web

FROM caddy:2-alpine
COPY --from=build /app/apps/web/dist /srv
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY apps/web/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]
