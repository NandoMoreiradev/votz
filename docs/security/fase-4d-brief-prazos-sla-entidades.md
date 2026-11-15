# Brief 4D — Prazos (SLA) e gestão de fila para entidades

> Para o Gemini. **Depende do 3D, 4A, 4B e 4C** (reutiliza o `ReportRenderer` de PDF do 4C, os rollups do 4B e o `requireActingOrg`). Leia `docs/negocio/planos-e-beneficios-v1.md` (seções 3 e 3b).
> Objetivo: dar à prefeitura, secretaria ou órgão a **ferramenta de trabalho** que mais dói hoje: saber o que vence, quem cuida do quê e provar que cumpre prazos. É o miolo do plano **Gestão**.

## Princípios

1. **Responder e atualizar status é grátis** para todas as entidades. Paga-se pela **gestão de prazos, equipe e relatórios**.
2. **Transparência pública:** o **percentual de cumprimento do prazo declarado** aparece no perfil público de **toda** entidade (inclusive Básico). O cidadão tem direito de ver; isso reforça o Votz Score por mérito, nunca por pagamento.
3. Cada mudança de status de relato gera `TimelineEvento` (regra do projeto); eventos de SLA também entram na linha do tempo (sem expor dados internos da equipe).
4. Jobs periódicos e notificações **sempre via BullMQ**. Acesso por `requireActingOrg` + `FeatureKey` (4A): `sla_panel`, `outbreak_alerts`, `pdf_report`, `team`.

## T0 — Inspeção

Responder com arquivo:linha: formato real de `Entity.slaHours` (JSON por categoria: `{ "HEALTH": 48, ... }`), onde é lido e validado (`SlaHoursDto`), quais `OrgPermission` existem hoje e se há permissão de atribuir relatos, como `ReportFollower` e notificações funcionam, como o `TimelineEvento` registra o ator, e quais `ReportStatus` pausam ou encerram o prazo.

## T1 — Modelo de prazo

- Regras (documentar em `docs/dados/dicionario-de-metricas.md`, acrescentando versão): o relógio começa na **criação do relato** para a entidade destinatária (ou na atribuição à entidade, se o relato tiver outro destino inicial); o **prazo de primeira resposta** vem de `slaHours[categoria]` (padrão da plataforma quando ausente, constante documentada); o **prazo de resolução** é opcional (campo novo `resolutionSlaHours` por categoria, validado).
- **Pausa:** só em status que signifiquem "aguardando o cidadão" (se existir); caso contrário, sem pausa na v1. Horário comercial **não** na v1 (horas corridas), com `TODO` explícito.
- Campos novos em `Report` ou tabela `report_sla` (justificar): `slaDueAt`, `slaState` (`ON_TIME`, `AT_RISK`, `BREACHED`, `MET`, `MET_LATE`), `slaMetAt`. Índices por (`recipientId`, `slaState`, `slaDueAt`).
- Cálculo em função **pura e testada** (`computeSla(report, policy, now)`), fuso `America/Sao_Paulo`, sem dependência de relógio global (injetar `now`).
- Mudança do `slaHours` da entidade **não reescreve o passado**: vale para relatos novos; relatos abertos recalculam só se a entidade pedir (ação explícita, registrada).

## T2 — Job de vigilância

- Fila `SLA_QUEUE`, varredura a cada 15 min (indexada, em lotes, idempotente): marca `AT_RISK` ao atingir **75%** do prazo, `BREACHED` ao vencer, e emite **notificações** à equipe (in-app e e-mail) e, após violação de X horas configurável, **escalonamento** ao perfil gestor.
- Deduplicação (nunca duas notificações do mesmo marco), agrupamento em resumo quando houver muitos.
- Evento na linha do tempo do relato: "prazo de resposta vencido" (texto simples, sem nome de servidor).

## T3 — Atribuição e fila de trabalho

- Permissão nova `ASSIGN_REPORTS` (enum `OrgPermission`, migração) para atribuir relato a um membro ativo da mesma entidade. Validar no servidor que o alvo é membro `ACTIVE` da **mesma** organização do contexto.
- Endpoints: listar fila (filtros por estado do prazo, categoria, responsável, área, ordenação por vencimento), atribuir/reatribuir, ver carga por membro. Cada atribuição fica em `OrgReportAssignment` com histórico; **nunca exposto em rota pública**.
- Visão **"Meus relatos"** para cada atendente e visão **do gestor** (todos, não atribuídos, vencendo hoje).

## T4 — Painel de prazos (front-end, plano Gestão)

- Telas: Fila (cartões por urgência: vencido, vence hoje, em risco, no prazo), Carga da equipe, Desempenho de SLA (cumprimento por categoria e por mês, tempo mediano vs prazo declarado, evolução), Configuração de prazos por categoria (com aviso do efeito).
- Gráficos e estados de plano bloqueado no mesmo padrão do 4B. Números vêm de rollups do 4B (acrescentar `sla_met`/`sla_breached` por dia e categoria ao `area_metrics_daily` e ao dicionário).
- Plano Básico vê apenas o **percentual público** e a lista simples; a fila, atribuição e configuração exigem `sla_panel`.

## T5 — Relatório mensal em PDF (`pdf_report`)

Reutilizar o `ReportRenderer` do 4C com um modelo "Relatório de atendimento": período, volume, resolução, **cumprimento de prazo**, tempo de resposta, reincidência por área (célula suprimida abaixo do mínimo), categorias, maiores pressões resolvidas. Snapshot imutável com `code` e página pública `/prestacao/:code` (mesmo mecanismo). Geração mensal automática opcional (job), envio por e-mail aos gestores com link assinado.

## T6 — Webhooks e API de dados (`webhooks`, `api_access`, plano Integração)

Reutilizar o módulo de webhooks do 4C (entregas assinadas, retentativas, SSRF) com eventos adicionais `sla.at_risk`, `sla.breached`, `report.assigned`. A **API de dados** (chave de API existente) devolve apenas agregados do 4B e relatos **da própria entidade** com os mesmos campos públicos; teto de requisições por chave **e** por IP; `tier` da chave definido só pelo admin (brief 3D).

## T7 — Testes e critérios de pronto

- `computeSla`: início, 75%, vencimento, resolvido no prazo e fora, mudança de política, viradas de dia e de mês, status que pausam; relógios falsos nos testes.
- Job: idempotência, deduplicação, lote grande (10 mil relatos) sem estourar tempo, escalonamento.
- Autorização: atribuir fora da organização, a membro inativo, sem permissão; ler fila de outra entidade (IDOR).
- Privacidade: nenhuma rota pública expõe responsável, notas ou atribuição.
- Percentual público de cumprimento coerente com o rollup (teste de reconciliação).
- **Pronto quando:** build e `tsc` limpos, suítes verdes (informar o número), `route-auth-audit` e matriz de papéis verdes, migração testada com dados existentes (relatos antigos sem `slaDueAt`: backfill documentado).

## Fora do escopo

Horário comercial e calendário de feriados (v2), integração com sistemas de protocolo do município (Webhooks cobrem o básico), assinatura digital do relatório, cobrança (4E).

## Entregável

Relatório no formato dos anteriores, com respostas do T0, decisões, arquivos alterados, saídas de teste e divergências.
