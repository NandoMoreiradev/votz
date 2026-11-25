# Redesenho do Estúdio (25/11/2026)

Pedido do dono: deixar o Estúdio bonito e intuitivo, com a usabilidade de gerenciadores de anúncios conhecidos (sem copiar marca nem visual de ninguém).

## O que mudou

**Kit comum** (`apps/web/src/components/studio/`)
- `studio-ui.tsx`: `StudioPage` (marca a tela nova para o `StudioLayout` não tirar o espaçamento), `PageHeader` com trilha, botões (`CtaButton`, `DarkButton`, `GhostButton`, `IconButton`), `Panel`, `StatCard` com variação e minigráfico, `StatusPill`, `Switch`, `TabBar`, `Segmented`, `FilterChip`, `DataTable` (cabeçalho fixo, primeira coluna fixa), `EmptyState`, `Skeleton`, `Callout`, `TaskList`, `Drawer` (painel lateral) e `DefList`.
- `TrendChart.tsx`: gráfico de área de uma série por dia, com balão ao passar o mouse ou tocar.
- `components/ads/ads-metrics.ts`: situação de veiculação em português ("Em veiculação", "Sem saldo", "Em revisão"...), o "resultado" de cada objetivo e o custo por resultado.
- Tema: cores `info`, `warning`, `positiveText`, `borderStrong`.

**Moldura** (`pages/studio/StudioLayout.tsx`, `studio-nav.ts`)
- Menu lateral em tela cheia, que recolhe para uma faixa de ícones (lembra a escolha no navegador), troca de perfil num menu no topo, saldo de anúncios no rodapé do menu, e menu em gaveta no celular (abaixo de 960 px).
- Menu de empresa: Visão geral; Anúncios (Campanhas, Relatório, Conversões, Faturamento); Atendimento; Sua página. "Criar campanha" saiu do menu e virou o botão principal da tela de campanhas.
- `StudioGate` não mudou. A tela da vez carrega dentro de um `Suspense` com `ContentFallback` (da frente de transições), para o menu não piscar.
- `App.tsx`: o rodapé do site some no Estúdio, no Mandato, no Painel de dados, nos Prazos e em Nova proposta (antes só em Conversas).

**Telas**
- Visão geral: saudação, 4 números da semana com variação contra a semana anterior, gráfico de 30 dias, as 5 campanhas com mais gasto, lista "Precisa da sua atenção" e atalhos. Político e entidade ganham os mesmos números e pendências.
- Campanhas: período 7/30/90 dias, 5 números com variação, abas Campanhas / Públicos e orçamento / Anúncios, busca e filtros por situação, seleção em lote (ligar/pausar), tabela com resultados, custo por resultado, CTR e totais, e painel lateral com detalhes e edição.
- Relatório: números clicáveis que trocam o gráfico, tabela por campanha e números por dia.
- Criar campanha: etapas na lateral, resumo e prévia fixos ao lado, objetivos em cartões.
- Faturamento, Conversões e Equipe: o mesmo cabeçalho e cartões.

**API** (`apps/api/src/ads/ads-delivery/`)
- Rota nova `GET /ads/COMPANY/:orgId/accounts/:accountId/stats/by-ad?days=7` (permissão de ver anúncios): totais por anúncio no período. A tela soma por público e por campanha.
- `listAccountAdTotals` no repositório e teste "totais por anúncio: só a empresa dona vê, e o gasto sai em centavos".

## Como retomar

Estado em 25/11/2026, **sem commit**.

Verificado:
- `tsc` do site sem erro novo (só o antigo do `@types/qrcode`).
- Teste do serviço de entrega: 31 de 31 passando (rodado com uma configuração temporária do Jest, porque a VM do Claude não lê os atalhos do `node_modules` do Windows).
- Telas vistas no navegador com a API simulada: campanhas, visão geral, relatório, criar campanha, faturamento, painel lateral, menu recolhido (1280 px) e celular (390 px).

Não verificado:
- Com a API e o banco de verdade (a rota `stats/by-ad` contra o Prisma real e as telas com dados reais).
- Num celular de verdade.
- Telas de político e entidade com dados reais (Mandato, Painel de dados e Prazos só ganharam a moldura nova, não foram redesenhadas).

Próximo passo: abrir `/estudio` e `/estudio/anuncios` com a API local, conferir números e o painel lateral, e decidir se Mandato e Painel de dados ganham o mesmo cabeçalho e cartões.
