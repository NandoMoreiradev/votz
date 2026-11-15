# Brief 4A — Catálogo de planos, remoção do Campanha e limites por plano

> Para o Gemini. Contexto de negócio: `docs/negocio/planos-e-beneficios-v1.md` (matriz aprovada) e `docs/negocio/estimativa-de-custos-e-planos-v1.md` (seção 0, decisões). **Preços são hipóteses e precisam ficar em configuração editável.** Leia os dois antes de começar.
> Regra de ouro: **só anunciar o que existe**. Benefício não construído aparece como "Em breve".

## Escopo desta fase

Esta fase **não** constrói mapa de calor, PDF, SLA, API de dados nem comparativo entre municípios (virão em briefs 4B+). Aqui entram só: catálogo único, remoção do Campanha/badge/destaque, limite de membros, faixa por cargo e página Planos honesta.

## T1 — Catálogo único de planos (fonte da verdade)

Criar `packages/shared-types/src/plans.ts` (exportado pelo pacote), usado por API e web:

- Planos por tipo de organização:
  - **Político:** `BASICO`, `MANDATO`, `MANDATO_PRO`
  - **Entidade:** `BASICO`, `GESTAO`, `INTEGRACAO`
  - **Empresa:** manter como está (`STARTER`, `BUSINESS`, `ENTERPRISE`, `WHITE_LABEL`), **sem alterar e sem destacar na página** (fase 2 do negócio).
- Para cada plano: `label`, `limits` (ex.: `maxMembers`, `historyDays: number | null`), `features: Record<FeatureKey, boolean>` e `status` de cada benefício (`available` | `soon`).
- `FeatureKey` inicial (use exatamente estes): `respond_reports`, `team`, `export_data`, `propostas`, `outbreak_alerts`, `analytics_basic`, `analytics_full`, `heatmap`, `sla_panel`, `pdf_report`, `share_card`, `api_access`, `webhooks`, `peer_comparison`, `reply_templates`, `priority_support`. Marque como `soon` tudo que **não** existe no código hoje (`heatmap`, `sla_panel`, `pdf_report`, `share_card`, `webhooks`, `peer_comparison`, `reply_templates`, `analytics_full`); verifique no código antes de marcar `available`.
- **Preços** em estrutura separada e editável (`PLAN_PRICES`), em centavos, por plano e por faixa. Não espalhar valores pelo código. Valores iniciais (hipótese):

| Político | Mandato | Mandato Pro |
|---|---|---|
| Faixa 1 (vereador, município até 50 mil hab.) | 19000 | 39000 |
| Faixa 2 (vereador, município maior) | 29000 | 59000 |
| Faixa 3 (prefeito, vice, deputado estadual) | 49000 | 99000 |
| Faixa 4 (deputado federal, senador, governador) | 79000 | 149000 |

Entidade: o negócio definiu só três **faixas de preço por população** (até 50 mil hab. R$ 590; 50 a 300 mil R$ 1.490; acima de 300 mil R$ 3.200), ainda sem separar Gestão de Integração. Modele `PLAN_PRICES` das entidades por faixa de população, com esses valores no plano `GESTAO` e `INTEGRACAO` marcado como `TODO: confirmar preço` (use o mesmo valor provisoriamente, comentado). Não invente combinações que o negócio não definiu.

- Limites de equipe (`maxMembers`): Político Básico 1; Mandato/Mandato Pro por faixa: F1 2/5, F2 3/8, F3 5/12, F4 8/20. Entidade Básico 2, Gestão 10, Integração ilimitado (`null`).
- Histórico: Entidade Básico `historyDays: 30`; demais `null`.
- Funções puras e testadas: `getPlanConfig(orgType, plan)`, `hasFeature(orgType, plan, feature)`, `getMaxMembers(orgType, plan, tier?)`, `getPoliticianTier(office: string): 1|2|3|4`.
  - `getPoliticianTier`: mapear o texto de `Politician.office` (inspecione os valores reais no seed/TSE) para a faixa. **Cargo desconhecido → faixa 2** e registrar aviso (não quebrar). Vereador não distingue tamanho de município hoje: usar faixa 2 e deixar `TODO` para distinguir F1 por população quando o dado existir.

## T2 — Migração do schema e remoção do Campanha

Em `packages/database/prisma/schema.prisma`:

- `PoliticianPlan`: `BASICO | MANDATO | MANDATO_PRO`. Mapear dados existentes na migração: `MANDATOMETRO_PRO → MANDATO_PRO`, `CAMPANHA → MANDATO_PRO` (ninguém paga ainda; documentar). Sem perda de linhas.
- `EntityPlan`: `BASICO | GESTAO | INTEGRACAO`. Mapear `PRO → GESTAO`, `ENTERPRISE → INTEGRACAO`.
- **Remover todo vestígio de Campanha**: `plan.guard.ts`, `propostas.service(.spec)`, `subscricoes.service(.spec)`, `Admin.tsx`, `Planos.tsx`, `PoliticianProfile.tsx`, `types/api.ts`, `PRICE_IDS`, expiração de mandato ligada ao plano (`mandate-expiry`, se existir). Rode `grep -ri campanha` ao final e explique o que restar.
- **Remover** qualquer menção a badge de responsividade e destaque como benefício pago (UI e textos). Se o selo existir por mérito (calculado), pode ficar, mas **nunca ligado a plano**.
- Migração nomeada `plans_catalog_v1`. Cuidado: alterar enums no Postgres exige criar o tipo novo e converter a coluna; teste com dados semeados nos dois sentidos.

## T3 — Guards e serviços usando o catálogo

- `PlanGuard`/`@RequiresPlan` passam a consultar o catálogo (por `FeatureKey`), não listas fixas de planos. Sugestão: `@RequiresFeature('export_data')`.
- `GET /entities/:id/export` exige `export_data` (Gestão+). `GET /politicians/:id/export` exige `export_data` (Mandato Pro).
- `PropostasService.create` exige `propostas` (Mandato e Mandato Pro), em vez de `PROPOSTA_PLANS`.
- O plano que vale é o **da organização do contexto ativo** (`requireActingOrg` do brief 3D, se já aplicado; se ainda não, use a organização carregada pelo id do recurso e **não** `user.type`).
- Erro padrão ao faltar plano: `403` com `{ code: 'PLAN_REQUIRED', feature, requiredPlan }`, texto em português simples, sem juridiquês.

## T4 — Limite de membros por plano

- Ao convidar/adicionar membro (serviço de OrgMembership), bloquear com `403 { code: 'PLAN_LIMIT_MEMBERS', limit, current }` quando exceder `getMaxMembers`.
- Contar membros `ACTIVE` e convites pendentes. Rebaixar plano **não** remove membros existentes: bloqueia só novos (documentar).
- Endpoint de leitura `GET /plans/me` (ou equivalente) devolvendo plano atual, limites, uso atual (`members: {used, max}`) e features disponíveis, para o front exibir.

## T5 — Página Planos e Admin

- `Planos.tsx` renderiza **a partir do catálogo** (nada de lista duplicada). Cada benefício mostra ✅ (`available`) ou "Em breve" (`soon`). Preço por faixa de cargo do político: mostrar a tabela por cargo, não um valor único.
- Remover texto "só cartão Stripe" do FAQ **apenas se** a integração do Asaas for tratada em outro brief; por ora trocar por "formas de pagamento serão informadas na contratação" (sem prometer Pix/boleto antes de existir).
- `Admin.tsx`: seletor de plano usa os enums novos.
- Estilos só com `theme` (sem cores hardcoded). Tom de voz: direto, simples.
- Stripe: manter funcionando para o que existir; `PRICE_IDS` reorganizados para os planos novos e configuráveis por variável de ambiente (sem ID fixo no código). Preço da Stripe é separado do catálogo: documentar a relação.

## T6 — Testes (Jest) e critérios de pronto

- Testes unitários do catálogo: `hasFeature` por plano; `getMaxMembers` por faixa; `getPoliticianTier` com cargos conhecidos, desconhecido e vazio.
- Testes dos serviços: export bloqueado/liberado por plano; proposta por plano; limite de membros (no limite, acima, rebaixamento).
- Teste de migração (script ou checklist documentado) provando o mapeamento de planos antigos.
- `route-auth-audit.spec.ts` e matriz de papéis continuam verdes.
- **Pronto quando:** `npm run build` e `tsc` limpos; todas as suítes verdes (reportar o número); `grep -ri campanha` sem resíduos funcionais; página Planos reflete o catálogo; nenhum preço fora de `PLAN_PRICES`.

## Fora do escopo (não fazer)

Mapa de calor, PDF, cartão compartilhável, SLA, alertas configuráveis, comparativo entre municípios, API de dados/webhooks, integração Asaas, planos de empresa, limite por taxa de IP. Cada um virá em brief próprio.

## Restrições permanentes

- Dado vendido é **sempre agregado**; nunca expor autor de relato nem vínculo com relato anônimo.
- Reputação nunca depende de plano.
- Cada mudança de status de Relato gera `TimelineEvento` (não mexer nisso).
- Responder e atualizar status é grátis para todos os planos.

## Entregável

Relatório no mesmo formato dos anteriores: arquivos alterados, decisões tomadas, saída dos testes/tsc/build, e qualquer ponto em que o código divergiu do brief.
