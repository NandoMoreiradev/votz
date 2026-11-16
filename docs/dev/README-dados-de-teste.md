# Dados de teste locais (ambiente de desenvolvimento)

> Só para o seu computador. **Nunca** rode isto contra um banco de produção. As contas usam e-mails `@votz.test` e senha fixa de teste.

## O que já existe no banco do Docker

Além dos dados do seed original (`prisma/seed.ts`: 5.573 entidades, 65.778 políticos, 32 partidos e 8 relatos em São Paulo, com as contas `admin@votz.app`, `moderador@votz.app` etc.), há **dados de demonstração em Aracaju (SE)**: 179 relatos de 8 bairros (140 distribuídos nos últimos 75 dias + 39 em 3 pontos quentes reincidentes nos últimos 80 dias — Centro/Infraestrutura com 14, Atalaia/Saneamento com 13 e Farolândia/Mobilidade com 12 — na mesma célula geohash-7 direcionados à Prefeitura), com apoios, comentários e linha do tempo.

### Contas de demonstração

Senha de **todas**: `Demo@Votz2026!x`

| Conta | Papel | Plano | Para ver |
|---|---|---|---|
| `demo.admin@votz.test` | Administrador | | Painel admin (MFA) |
| `demo.moderador@votz.test` | Moderador | | Moderação e aprovação de cadastros (MFA) |
| `demo.cidadao1@votz.test` (2 e 3) | Cidadão | | Criar, apoiar e comentar relatos |
| `demo.prefeitura@votz.test` | Gestor da **Prefeitura de Aracaju (Demo)** | **Integração** | Painel de dados completo, mapa de calor, fila de prazos (SLA), API de dados. Tem prazos próprios declarados |
| `demo.saude@votz.test` | Gestor da **Secretaria de Saúde (Demo)** | **Gestão** | Painel e prazos **sem** prazos próprios (mostra o "prazo padrão") |
| `demo.ouvidoria@votz.test` | Gestor da **Ouvidoria Municipal (Demo)** | **Básico** | Telas bloqueadas por plano (prévia com "Exemplo") |
| `demo.vereador@votz.test` | **Vereador Demo** | **Básico** | Caixa do mandato gratuita |
| `demo.prefeito@votz.test` | **Prefeito Demo** | **Mandato** | PDF de prestação de contas, cartões, alertas |
| `demo.deputado@votz.test` | **Deputado Demo** | **Mandato Pro** | Tudo liberado, modelos de resposta, webhooks |

As contas de organização exigem **código MFA** para entrar no perfil da organização.

## Como usar

1. **Docker ligado** (Postgres, Redis e MinIO). Se estiverem parados: `docker compose up -d`.
2. Subir a API e o site: `npm run dev` (ou os servidores `votz-api` e `votz-web` do painel do app).
3. Entrar em `http://localhost:5173/entrar` com o e-mail e a senha acima.
4. Para trocar para o perfil da organização: menu do usuário → **Trocar perfil** → escolher a organização → digitar o código MFA.
5. **Código MFA a qualquer momento:**

```bash
node docs/dev/mfa.mjs prefeitura
```

Sem argumento, o comando lista as contas que têm MFA. O código vale 30 segundos.

6. Para o **mapa**, a chave do MapTiler deve estar em `apps/web/.env.local` (variável `VITE_MAPTILER_KEY`).

## Recriar ou limpar

```bash
node docs/dev/seed-demo.mjs            # cria ou completa os dados demo (a API precisa estar no ar)
node docs/dev/seed-demo.mjs --reset    # apaga só os dados demo e recria
npm run analytics:backfill --workspace=apps/api   # recalcula as tabelas do painel de dados
```

O `--reset` apaga somente o que for "demo" (contas `demo.*@votz.test`, organizações terminadas em "(Demo)" e relatos com título `[Demo]`). Ele **não** mexe nos dados do seed original. Os segredos de MFA de teste ficam em `docs/dev/demo-state.json` (ignorado pelo Git).

## Observações

- A Prefeitura tem relatos "vencidos", "em risco", "no prazo" e "respondidos" (em andamento/análise após a 1ª resposta) para a fila de prazos ter variedade, além de 3 pontos quentes geohash-7 para visualizar **Reincidência** e células no modo **Detalhe (150 m)** do mapa de calor. O estado de SLA muda com o tempo (um relato "no prazo" vira "em risco" e depois "vencido"); para renovar, use o `--reset`.
- Os testes automáticos de QA (`docs/security/qa-scripts/`) usam contas `qa.*` e limpam depois (`09-cleanup.mjs`). Não afetam estas contas.
