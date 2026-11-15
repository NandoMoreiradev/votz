# Allowlist de Vulnerabilidades de Dependências (`npm audit --omit=dev`)

Última revisão: 2026-11-14 (Pós-T1 do Brief 3B)

Este documento registra exclusivamente as vulnerabilidades em dependências de produção (`--omit=dev`) que **não possuem correção sem quebra de compatibilidade (major upgrade bloqueado)** no estado atual do monorepo Votz.

O workflow de CI (`.github/workflows/ci.yml`) falha automaticamente caso surja qualquer vulnerabilidade **high** ou **critical** fora desta lista.

## Itens bloqueados / aceitos temporariamente

| Pacote | Severidade | Motivo / Bloqueio | Plano de Remoção |
| --- | --- | --- | --- |
| `@mapbox/node-pre-gyp` | `high` | Transitivo de `bcrypt@5.1.1` (fallback de compilação em tempo de instalação; API usa binário pré-compilado/N-API em runtime). | Migrar `bcrypt` para `v6.x` ou `bcryptjs` / Node `scrypt`. |
| `tar` | `critical` | Transitivo exclusivamente via `@mapbox/node-pre-gyp@1.0.11` (`bcrypt@5.1.1`); não é executado por rotas HTTP da API em produção. | Migrar `bcrypt` para `v6.x` em janela dedicada. |
| `adm-zip` | `high` | Correção exige atualização major (`0.6.1`, mudança de API/compatibilidade nos importadores de dados TSE). | Avaliar e testar importação TSE com `adm-zip@0.6.1`. |
| `@nestjs/common`, `@nestjs/core`, `@nestjs/config`, `@nestjs/platform-express`, `@nestjs/platform-socket.io`, `@nestjs/swagger`, `@nestjs/bullmq`, `@nestjs/bull-shared`, `@nestjs/schedule`, `@nestjs/terminus`, `@nestjs/websockets` | `moderate` / `high` | `@nestjs/*` fixado em `^10.x` (T1); correções de transitivos (`body-parser`, `multer`, `js-yaml`, `lodash`, `file-type`, `qs`, `uuid`) exigem upgrade major para NestJS `v12`. `@nestjs/common` foi atualizado para `10.4.22` eliminando o RCE `GHSA-cj7v-w2c7-cp7c`. | Planejar sprint de upgrade `@nestjs/*` v10 → v11/v12 com testes de regressão completos. |
| `body-parser`, `multer`, `js-yaml`, `lodash`, `file-type`, `qs`, `uuid` | `moderate` / `high` | Subdependências transitivas do Ecossistema Express 4 / `@nestjs/*` v10 acima. | Resolvido automaticamente no upgrade NestJS v12. |
| `react-router`, `react-router-dom` | `moderate` | Fixado em `6.x`; correção reportada pelo npm requer `react-router-dom@7.x` (major upgrade no frontend). | Avaliar migração controlada `react-router-dom` v6 → v7. |
