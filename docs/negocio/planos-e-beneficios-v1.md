# Votz — Planos e benefícios (v1, hipótese a validar)

> Estado em 15/11/2026. **Preços são hipóteses**, não decisões. Devem ficar em configuração editável e ser validados com entrevistas e clientes fundadores antes de cobrar de verdade.
> Base: `estimativa-de-custos-e-planos-v1.md` (custos) e `hospedagem-e-escala.md`.

## 1. Princípios (já decididos)

1. **Responder e atualizar status é sempre grátis**, para qualquer político ou entidade. Isso é o que dá valor ao Votz para o cidadão.
2. **Reputação é conquistada, nunca vendida.** Sem selo, destaque ou posição melhor por pagamento.
3. **Paga-se por ferramenta de trabalho**: equipe, análise, alertas, relatórios, integração. Não por visibilidade.
4. **Plano Campanha foi retirado** (risco eleitoral). Nada de propaganda, impulsionamento ou disparo em massa.
5. **Preço por porte** (cargo do político, população do município), porque o orçamento de cada um é muito diferente.
6. **Só anunciar o que existe.** Benefício ainda não construído aparece como "em breve" ou nem aparece.

## 2. Político

| Benefício | Básico (grátis) | Mandato | Mandato Pro | Situação no código |
|---|---|---|---|---|
| Perfil público, Mandatômetro básico, responder e avocar relatos | ✅ | ✅ | ✅ | Existe |
| Atualizar status de relato com timeline | ✅ | ✅ | ✅ | Existe |
| Equipe de assessores com permissões | 1 pessoa | até 3 | até 10 | **Parcial**: há membros e permissões, **sem limite por plano** |
| Painel de análise: relatos por bairro e tema, tendência, tempo médio de resposta | básico | completo | completo + comparativo | **Parcial**: Mandatômetro tem snapshot, sem filtros por período/bairro |
| Alertas de surto na sua área (e-mail/notificação) | — | ✅ | ✅ | **Parcial**: só alerta de surto; sem regras por tema/bairro |
| Exportação de dados (CSV/JSON) | — | — | ✅ | Existe (`GET /politicians/:id/export`, hoje MANDATOMETRO_PRO+) |
| Relatório de prestação de contas em PDF (para o cidadão e a imprensa) | — | ✅ | ✅ | **Não existe** |
| Cartão compartilhável (imagem com números do mandato) | — | ✅ | ✅ | **Não existe** |
| Propostas com acompanhamento público | — | ✅ | ✅ | Existe, hoje restrito a MANDATOMETRO_PRO/CAMPANHA (ampliar para Mandato) |
| Respostas-modelo e etiquetas internas | — | — | ✅ | **Não existe** |
| Webhook / API para o gabinete | — | — | ✅ | **Não existe** (há API key, mas sem webhooks) |
| Suporte | e-mail | e-mail | prioritário | Processo, não código |

### 2.1 Preço por cargo (decisão de direção: diferenciar por cargo)

Hoje o cargo existe só como texto livre (`Politician.office`, `String`). Para cobrar por cargo é preciso um **enum** (`PoliticianOffice`) ou uma tabela de faixas. O plano é o mesmo; **muda o preço e os limites** conforme o porte do mandato.

| Faixa | Cargos | Mandato (hipótese) | Mandato Pro (hipótese) | Equipe (Mandato / Pro) |
|---|---|---|---|---|
| 1 | Vereador de município até 50 mil hab. | R$ 190 | R$ 390 | 2 / 5 |
| 2 | Vereador de município maior | R$ 290 | R$ 590 | 3 / 8 |
| 3 | Prefeito, vice, deputado estadual | R$ 490 | R$ 990 | 5 / 12 |
| 4 | Deputado federal, senador, governador | R$ 790 | R$ 1.490 | 8 / 20 |

Justificativa: o gabinete maior tem mais equipe, mais relatos e mais orçamento. Pré-candidatos e suplentes ficam no plano Básico (sem venda durante o período eleitoral, ver risco do plano Campanha).

**Faixa de preço anterior (simples, sem cargo):** Mandato **R$ 290/mês** (vereador de cidade pequena pode ter **R$ 190**); Mandato Pro **R$ 790/mês** (deputado, prefeito, senador). Anual = 10 mensalidades (2 meses grátis). **Clientes fundadores: 50% por 12 meses** em troca de feedback e depoimento.

## 3. Entidade (órgão público, ONG, associação)

| Benefício | Básico (grátis) | Gestão | Integração | Situação no código |
|---|---|---|---|---|
| Perfil, receber e responder relatos, atualizar status | ✅ | ✅ | ✅ | Existe |
| Equipe com permissões (RESPOND_REPORTS, MANAGE_PROFILE) | 2 pessoas | até 10 | ilimitada | **Parcial**: sem limite por plano |
| Painel de gestão: fila por prioridade, prazos (SLA), reincidência por local | — | ✅ | ✅ | **Parcial**: `slaHours` é só guardado; sem painel de prazos |
| Alertas de relato novo / prazo vencendo | — | ✅ | ✅ | **Não existe** |
| Exportação de dados | — | ✅ | ✅ | Existe (`GET /entities/:id/export`, GESTAO+) |
| Relatórios mensais em PDF | — | ✅ | ✅ | **Não existe** |
| API e webhooks para o sistema do órgão | — | — | ✅ | **Parcial**: chaves de API existem; webhooks não |
| Suporte e onboarding | e-mail | e-mail | dedicado | Processo |

**Faixas por porte (hipótese):** município até 50 mil hab. **R$ 590**; 50–300 mil **R$ 1.490**; acima disso **R$ 3.200** (Integração). Pagamento por boleto/Pix via Asaas; modalidade jurídica de contratação a confirmar com advogado.

## 3b. Dados por plano (o Votz como agregador de dados)

Foco principal: **prefeituras, órgãos e entidades**; políticos recebem uma versão menor.

**O que o código já coleta** (`Report`, `Vote`, `Comment`, `Surto`): categoria, status e histórico (timeline), localização (lat/long, cidade, bairro), data, pressão, apoios, comentários, relatos parecidos (embedding), surtos por categoria e cidade. **Dá para calcular hoje**, sem coletar nada novo: volume por bairro e tema, tempo de resposta, taxa de resolução, reincidência por local, tendência.

**O que NÃO se vende, em nenhum plano (LGPD e confiança):** quem é o autor de qualquer relato, dados pessoais de cidadãos, relatos anônimos com qualquer vínculo ao autor, e **grupos com poucas pessoas** (agregar só quando houver volume mínimo, ex.: 10 relatos, para ninguém ser identificado por exclusão). Dado vendido é sempre **agregado**.

| Camada de dados | Básico (grátis) | Gestão | Integração |
|---|---|---|---|
| **Relatos da própria área**: lista, filtros, status | ✅ | ✅ | ✅ |
| **Números do município**: total, resolvidos, tempo médio de resposta (os mesmos da página pública) | ✅ | ✅ | ✅ |
| **Histórico**: últimos 30 dias | ✅ | — | — |
| **Histórico completo** e comparação entre períodos | — | ✅ | ✅ |
| **Mapa de calor** por bairro, tema e período | — | ✅ | ✅ |
| **Reincidência**: mesmos locais com problemas repetidos | — | ✅ | ✅ |
| **Tendência e alerta de surto** por tema/bairro | — | ✅ | ✅ |
| **Prazos (SLA)** e relatos vencendo | — | ✅ | ✅ |
| **Comparativo com municípios do mesmo porte** (anonimizado, ranking de resolução) | — | — | ✅ |
| **Exportação** CSV/JSON | — | ✅ | ✅ |
| **API de dados e webhooks** (integração com o sistema do órgão) | — | — | ✅ |
| **Relatório mensal em PDF** (para câmara, imprensa e prestação de contas) | — | ✅ | ✅ |

**Político (versão menor):** Básico vê o Mandatômetro; Mandato adiciona **mapa e análise da sua base** (bairros e temas que mais pedem a atuação dele); Mandato Pro adiciona **comparativo com outros mandatos do mesmo cargo**, histórico completo e exportação. Faixa por cargo continua valendo.

**Dado aberto vs. dado pago:** números básicos de cada município ficam **públicos** (transparência é a promessa do Votz). Paga-se pela **análise pronta, histórico, mapa, alertas e API**, não pelo segredo do número.

**Status no código:** existe só o resumo do Mandatômetro e a exportação. Mapa de calor por filtro, histórico comparativo, comparativo entre municípios, SLA, PDF e API de dados **não existem** e são o miolo do que justifica o plano de entidade. Exigem agregações no banco (consultas pré-calculadas via BullMQ, nunca consultas pesadas ao vivo) e cache.

## 4. Empresa (fase 2, não construir agora)

Starter R$ 300, Business R$ 1.200, Enterprise sob consulta. Só depois de validar políticos e entidades. Fica fora do escopo de código por enquanto.

## 5. O que sai do código atual

- `PoliticianPlan.CAMPANHA`, `PRICE_IDS`, textos em `Planos.tsx`, `Admin.tsx`, `PoliticianProfile.tsx`, `types/api.ts`, `plan.guard.ts`, `propostas.service`, `subscricoes.service`.
- Qualquer menção a **badge de responsividade** e **destaque** como benefício pago.
- Enum de planos atual (`BASICO/MANDATOMETRO_PRO/CAMPANHA`) passa a `BASICO/MANDATO/MANDATO_PRO`; entidade `BASICO/GESTAO/INTEGRACAO` (hoje `PRO`/`ENTERPRISE`). Exige migração com mapeamento dos valores existentes.

## 6. Ordem de construção sugerida (valor ÷ esforço)

| # | Item | Esforço | Por quê |
|---|---|---|---|
| 1 | **Catálogo único de planos** (nomes, preços, limites, benefícios em um arquivo) + remoção do Campanha | Baixo | Base de tudo; a página Planos passa a refletir a verdade |
| 2 | **Limite de membros por plano** | Baixo | Benefício já anunciado e sem aplicação |
| 3 | **Relatório de prestação de contas em PDF** e **cartão compartilhável** | Médio | O que o político mais usa e divulga; traz o Votz para as redes dele |
| 4 | **Painel de análise** com filtros por período/bairro/tema | Médio | Justifica o valor mensal |
| 5 | **Alertas configuráveis** | Médio | Retenção (o produto "avisa" em vez de ser visitado) |
| 6 | **Painel de prazos (SLA)** para entidades | Médio | Principal dor do órgão público |
| 7 | Webhooks, respostas-modelo | Médio/alto | Só se clientes pedirem |
| 8 | **Asaas** (Pix/boleto, NFS-e) | Médio | Necessário para vender ao governo |

## 7. Validar antes de construir tudo

- 5 a 10 entrevistas com assessores de vereadores/deputados e 3 a 5 com secretarias ou ouvidorias.
- Perguntas-chave: quanto gastam hoje com assessoria e monitoramento? Quem decide a compra? **Pode ser pago com verba de gabinete?** (verificar com contador/advogado). O que faria renovar?
- Oferecer **3 a 5 clientes fundadores** com preço reduzido antes de construir os itens 4 a 7.

## 8. Pendências

- Confirmar enquadramento tributário (Simples, 11% é estimativa).
- Parecer jurídico: venda a órgão público (dispensa/inexigibilidade) e pagamento de plano por político (verba de gabinete, regras eleitorais).
- Definir se vereador paga menos (faixa por população do município).
