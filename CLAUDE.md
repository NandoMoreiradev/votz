# Votz — Infraestrutura de Accountability Cívico

## Visão do Produto
Plataforma que transforma reclamação em registro, registro em pressão e pressão em ação.
Conecta cidadãos, entidades públicas, políticos e empresas privadas.

## Estrutura do Monorepo
```
votz/
├── apps/api/          → NestJS backend (porta 3000)
├── apps/web/          → React + Vite frontend (porta 5173)
├── packages/database/ → Prisma schema + migrations
├── packages/shared-types/ → tipos TypeScript compartilhados
└── packages/zod-schemas/  → schemas de validação compartilhados
```

## Stack
- **Backend:** NestJS v10, PostgreSQL v15, Prisma v5, Redis, BullMQ
- **Frontend:** React 18, Vite, Styled Components, Radix UI, TanStack Query, Zustand
- **Infra local:** Docker Compose (PostgreSQL + Redis)
- **Package manager:** npm com workspaces

## Comandos Principais
```bash
# Iniciar banco e redis locais
docker compose up -d

# Instalar dependências
npm install

# Gerar Prisma client
npm run db:generate

# Rodar migrations
npm run db:migrate

# Dev (api + web em paralelo)
npm run dev

# Dev só API
npm run dev --workspace=apps/api

# Dev só Web
npm run dev --workspace=apps/web
```

## Convenções de Código (seção 12.2 do escopo)
- **Arquivos:** kebab-case (`relatos.service.ts`)
- **Classes:** PascalCase (`RelatosService`)
- **Variáveis/funções:** camelCase
- **Constantes:** UPPER_SNAKE_CASE
- **Banco (Prisma):** snake_case nos campos

## Organização de Módulo NestJS
```
modulo/
├── modulo.module.ts     → imports, exports
├── modulo.controller.ts → rotas, DTOs entrada/saída, Swagger
├── modulo.service.ts    → regras de negócio
├── modulo.repository.ts → queries Prisma isoladas
└── dto/                 → DTOs com class-validator
```

## Regras Obrigatórias
- Usar Prisma para TODAS as queries — nunca `$queryRaw` com input do usuário
- Validar inputs com `class-validator` nos DTOs antes de chegar no Service
- Cada mudança de status de Relato DEVE gerar um `TimelineEvento`
- Jobs assíncronos (notificações, cálculo de pressão) sempre via BullMQ
- Styled Components com `theme` da pasta `apps/web/src/theme` — nunca cores hardcoded
- TanStack Query para fetching — sem fetch/axios direto em componentes React
- Testes unitários obrigatórios para Services (Jest)
- Documentar endpoints com Swagger (`@nestjs/swagger`) desde o início

## Identidade Visual (seção 5)
| Token     | Hex       | Uso                                    |
|-----------|-----------|----------------------------------------|
| primary   | #1A1A2E   | Azul noite — seriedade, Estado         |
| action    | #E63946   | Vermelho — urgência, força cidadã      |
| positive  | #2DC653   | Verde — resolvido, progresso           |
| neutral   | #F4F4F4   | Off-white — fundo, leitura             |
| text      | #0D0D0D   | Quase preto — legibilidade máxima      |

**Fontes:** Space Grotesk Bold (headings), Inter Regular (corpo), JetBrains Mono (dados)

## Tom de Voz
Direto. Justo. Firme. Nunca juridiquês. Nunca difícil para ensino médio incompleto.

## Prisma Schema
O schema completo está em `packages/database/prisma/schema.prisma`.
Principais entidades: `Usuario`, `Relato`, `TimelineEvento`, `Entidade`, `Politico`, `Empresa`, `Filial`, `Voto`, `Comentario`.

## Nomenclatura do Sistema (seção 4)
| Nome           | O que é                              |
|----------------|--------------------------------------|
| Relato         | A postagem de um problema            |
| Apoio          | O upvote — não é like, é apoio       |
| Pressão        | Nível coletivo de urgência           |
| Mandatômetro   | Painel de performance do político    |
| Memória        | Histórico público imutável           |
| Avocar         | Quando político assume um problema   |
| Contestar      | Quando cidadão nega um "resolvido"   |
| Surto          | Alerta de problema em escala         |
| Votz Score     | Reputação de entidade ou político    |

## Score de Pressão (seção 8.3)
```
pressao = (votos * 1.5) + (comentarios * 1) + (diasSemResposta * 2) + (relatosSimilares * 3)
```
Calculado via BullMQ job a cada hora.

## Módulos NestJS (seção 10)
AuthModule, UsuariosModule, RelatosModule, TimelineModule, EntidadesModule, PoliticosModule,
VotosModule, ComentariosModule, NotificacoesModule, AlertasModule, MapaModule,
ImprensaModule, AdminModule, ApiPublicaModule, HealthModule

## Segurança (seção 16)
- bcrypt custo 12 para senhas
- JWT access: 15min (memória) | refresh: 7 dias (httpOnly cookie)
- Rate limiting granular via @nestjs/throttler + Redis
- DOMPurify em todos os textos livres antes de persistir
- MFA obrigatório para Entidade, Político, Empresa, Admin
- LGPD: CPF criptografado AES-256, relatos anônimos sem exposição de autorId em queries públicas
