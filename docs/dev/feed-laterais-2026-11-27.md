# Barras laterais do feed de publicações (27/11/2026)

## Como retomar
- **Estado:** etapa 1 feita e em pull request (sem merge). Tela: `/` com a aba Publicações (não é o feed de Relatos).
- **O que mudou na etapa 1**
  - Esquerda (`apps/web/src/components/posts/FeedLeftSidebar.tsx`): cartão de perfil com publicações, seguidores e seguindo; contador de notificações não lidas; card "Meus assuntos" (pautas que a pessoa segue, com ponto vermelho se teve atividade nas últimas 24 horas); filtros começam recolhidos.
  - Direita (`FeedRightSidebar.tsx`): pautas em alta numeradas; card "Publicações em alta" (3 posts do `sort=trending`, da região escolhida ou do Brasil se a região não tiver nenhum).
  - API: `GET /users/me/social-summary` e `GET /topics/me/following` (ambos exigem login; sem migration).
- **Verificado:** `tsc` do web e da API limpos; Jest de `topics` e `users` passando; conferência visual no navegador (tema claro, 1480px) com API simulada.
- **Não verificado:** tema escuro, celular (as barras seguem escondidas), dados reais de produção.
- **Próximo passo (etapa 2, aprovada pelo dono):** "Quem seguir" com seguidores em comum, enquetes para votar na lateral e anúncio patrocinado na lateral (superfície nova `FEED_SIDEBAR` em `AD_SURFACES`, mexe na entrega, no limite de exibição e no relatório do Estúdio).
- **Decisão que só o dono muda:** ordem da etapa 2 (anúncio primeiro ou depois).
