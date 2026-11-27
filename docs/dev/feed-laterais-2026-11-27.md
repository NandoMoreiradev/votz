# Barras laterais do feed de publicações (27/11/2026)

## Como retomar
- **Estado (27/11/2026):** etapas 1 e 2 feitas e no pull request #15 (sem merge). Tela: `/` com a aba Publicações (não é o feed de Relatos).
- **Esquerda** (`apps/web/src/components/posts/FeedLeftSidebar.tsx`): cartão de perfil com publicações, seguidores e seguindo; notificações não lidas; "Meus assuntos" (pautas que a pessoa segue, ponto vermelho se teve atividade nas últimas 24 horas); filtros recolhidos.
- **Direita** (`FeedRightSidebar.tsx` e `FeedPollCard.tsx`), nesta ordem: pautas em alta numeradas; "Quem acompanhar" com "Seguido por Maria e mais 4"; "Publicações em alta" (3 do `sort=trending`, da região ou do Brasil); "Enquete em alta" (vota direto); anúncio patrocinado.
- **API (sem migration):** `GET /users/me/social-summary`, `GET /topics/me/following`, `GET /posts/who-to-follow`.
- **Anúncio na lateral:** superfície nova `FEED_SIDEBAR` em `AD_SURFACES` (shared-types: `.ts`, `.js` e `.d.ts`). A entrega não distingue superfície além de validar o nome, então reaproveita fila, limite de 3 por pessoa e regras de vizinhança. Só aparece para quem entrou, como no feed. Cada visita ao feed pode contar 1 exibição na lateral.
- **Privacidade ("seguido por"):** só entram pessoas com `publicActivityVisible` ligado (mesmo filtro da busca de pessoas), porque seguir político revela opinião.
- **Também corrigido no PR:** as auditorias `route-auth-audit` e `role-matrix` já falhavam na master (faltava `GET /users/search` e 8 rotas admin).
- **Verificado:** `tsc` do web e da API; Jest de topics, users, posts, ads e segurança; conferência visual no navegador (tema claro, 1480px) com API simulada.
- **Não verificado:** tema escuro, celular (as barras seguem escondidas), dados reais, relatório do Estúdio por superfície (o relatório não separa por superfície hoje).
- **Decisões que só o dono muda:** `GET /users/search` ficar pública; o anúncio na lateral contar no mesmo limite de 3 por pessoa do feed; mostrar "seguido por" (hoje só para quem deixa a atividade pública).
- **Ficou de fora:** atalhos "Minhas publicações" e "Minhas curtidas" na esquerda.
