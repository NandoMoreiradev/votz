# Brief 4B — Painel de dados (camada de agregação e análise)

> Para o Gemini. **Depende do 3D e do 4A** (catálogo de planos, `FeatureKey`, `requireActingOrg`). Leia antes: `docs/negocio/planos-e-beneficios-v1.md` (seção 3b, dados por plano).
> Objetivo: transformar os relatos do Votz em **dados de qualidade nível A** para prefeituras, entidades e políticos: métricas **definidas, reproduzíveis, auditáveis e privadas**. O Votz é um agregador de dados; a confiança no número é o produto.

## Princípios inegociáveis

1. **Só agregado.** Nunca devolver autor, nem dado que permita identificar autor (relato anônimo inclusive). Nenhuma tabela nova liga usuário a relato.
2. **Mínimo de volume (k-anonimato):** qualquer célula (bairro/tema/período) com **menos de 10 relatos** é suprimida (`null` + `suppressed: true`) nas saídas de plano pago e públicas. Constante configurável `MIN_CELL_SIZE = 10`.
3. **Coordenada nunca exata:** mapas usam **células geohash de precisão 7** (~150 m). Nunca devolver latitude/longitude originais de relato.
4. **Nada pesado ao vivo.** Painel lê de tabelas de **rollup pré-calculadas** por BullMQ. Proibido `GROUP BY` sobre `reports` inteira em requisição de usuário.
5. **Toda métrica tem definição escrita e versão** (`docs/dados/dicionario-de-metricas.md`). Mudou a fórmula, sobe a versão e o painel mostra a data da definição.
6. **Todo número exibe frescor e tamanho da amostra** (`computedAt`, `sampleSize`).
7. Prisma para tudo; `$queryRaw` só para SQL fixo, **sem input do usuário concatenado** (parametrizado com `Prisma.sql`).

## T0 — Inspeção obrigatória antes de codar

Responda por escrito no relatório (com arquivo:linha):
- Como `Report.city`, `state` e `neighborhood` são preenchidos hoje (texto livre? normalizado? vem do geocoder?). Há código IBGE? Se não houver, proponha normalização (minúsculas, sem acento, trim) e **não** use `neighborhood` bruto como chave de agrupamento sem normalizar.
- Como `TimelineEvento` registra **quem** (organização/papel) e **quando** mudou o status. A partir dele é possível calcular **primeira resposta oficial**? Se não, adicionar `Report.firstResponseAt` (preenchido na primeira ação de uma organização com permissão `RESPOND_REPORTS`) e `resolvedAt` (primeira vez em `RESOLVED`), com **backfill** a partir da timeline.
- Quais status existem (`ReportStatus`) e o que cada um significa para as métricas (resolvido, contestado, em andamento).
- Fuso: todos os cortes diários em `America/Sao_Paulo`.

## T1 — Dicionário de métricas

Criar `docs/dados/dicionario-de-metricas.md` com, para cada métrica: nome, definição exata, fórmula, fonte, janela, tratamento de nulos, limites de uso, versão. Métricas mínimas (v1):

| Métrica | Definição |
|---|---|
| `volume` | relatos criados no período |
| `resolution_rate` | resolvidos ÷ (resolvidos + abertos com mais de 7 dias), explicando o denominador |
| `first_response_median_h` e `p90` | tempo da criação à primeira resposta oficial (horas), só relatos respondidos; mostrar também `response_rate` (respondidos ÷ total) para evitar viés |
| `resolution_time_median_h` e `p90` | criação até `resolvedAt` |
| `backlog` e `backlog_age_p50/p90` | relatos abertos e idade deles |
| `contest_rate` | contestados ÷ resolvidos (resolução que o cidadão negou) |
| `reincidence` | pares (célula geohash 7 + categoria) com 2 ou mais relatos em 90 dias; `recurrence_index` = relatos em células reincidentes ÷ total |
| `trend_7d/30d/90d` | variação percentual contra o período anterior equivalente, com aviso quando a base for pequena |
| `pressure_p50/p90` e top relatos por pressão | do `pressureScore` existente |
| `category_mix` | participação por categoria |
| `support_volume` e `comment_volume` | engajamento agregado |
| `outbreak_history` | surtos por categoria e período (`Surto`) |

Regra: **toda razão publica numerador e denominador**.

## T2 — Rollups (tabelas e jobs)

- Tabela `area_metrics_daily` (chave: `day`, `state`, `city_key`, `cell7` nullable, `category`) com contadores brutos agregáveis (`created`, `resolved`, `open_eod`, `contested`, `response_count`, somas e **sketches** para percentis, ou um conjunto de buckets de histograma por faixa de horas). Escolha e justifique: percentis exatos exigem histograma por faixas (ex.: 1h, 4h, 12h, 24h, 48h, 7d, 30d, 30d+); **não** armazene só médias.
- Tabela `recurrence_cells` (`cell7`, `category`, `window_end`, `count_90d`, `first_seen`, `last_seen`).
- Jobs BullMQ (fila `ANALYTICS_QUEUE`): **incremental horário** (reprocessa o dia corrente e o anterior) e **reconstrução noturna** idempotente (`UPSERT`). Comando de **backfill** para qualquer intervalo.
- **Idempotência e reconciliação:** teste que recalcula um dia do zero a partir de `reports` e compara com o rollup (deve bater exatamente). Job noturno de verificação por amostragem que registra divergência em log e métrica.
- Índices justificados com `EXPLAIN ANALYZE` anexado ao relatório.

## T3 — Escopo territorial por organização

Defina e documente a regra de "área" de cada organização e aplique **no servidor**, a partir do contexto ativo (`requireActingOrg`), nunca por parâmetro do cliente:
- Entidade: município (e estado) da entidade.
- Político: vereador e prefeito = município; deputado estadual/federal, senador e governador = estado.
- `GET` com `cityKey`/`cell` fora da área do contexto → `403`.
- Relatos endereçados à organização (`recipientType/Id`) ficam em visão separada ("direcionados a mim") da visão territorial.

## T4 — API (módulo `analytics`, com controller/service/repository/DTO/Swagger)

Todas exigem contexto de organização + `FeatureKey` do catálogo (4A) e respondem `403 PLAN_REQUIRED` com `requiredPlan`:

| Rota | Feature | Conteúdo |
|---|---|---|
| `GET /analytics/overview?period=` | `analytics_basic` | volume, resolução, tempo de resposta, backlog (30 dias para plano Básico de entidade, conforme `historyDays`) |
| `GET /analytics/timeseries?metric=&granularity=&from=&to=` | `analytics_full` | série diária/semanal/mensal com comparação com período anterior |
| `GET /analytics/categories` | `analytics_basic` | mix e evolução por categoria |
| `GET /analytics/heatmap?category=&from=&to=` | `heatmap` | células geohash 7 com contagem e intensidade, **suprimidas abaixo de `MIN_CELL_SIZE`** |
| `GET /analytics/recurrence` | `analytics_full` | células reincidentes, ranking, dias entre ocorrências |
| `GET /analytics/response-times` | `analytics_full` | distribuição e percentis por categoria |
| `GET /analytics/outbreaks` | `analytics_full` | histórico de surtos |
| `GET /analytics/export?format=csv|json` | `export_data` | **dado agregado**, nunca linha por relato com campos pessoais; cabeçalho com definição das métricas e versão |

Regras: validar `from/to` (máximo 24 meses; Básico limitado a `historyDays`), `granularity` e `metric` por enum, paginação com teto, limite de requisições por usuário, cache Redis de 15 minutos por (organização, rota, parâmetros) com invalidação pelo job, e resposta sempre com `computedAt`, `sampleSize`, `definitionVersion`.

## T5 — Números públicos (todos os planos, sem login)

Endpoint público por município e por entidade/político: volume, taxa de resolução, tempo mediano de primeira resposta, **respeitando `MIN_CELL_SIZE`**. Cache de CDN (`Cache-Control` curto) e `ETag`. É a promessa de transparência e a vitrine do que o plano pago aprofunda.

## T6 — Front-end do painel

- Páginas em `apps/web` para entidade e político (conforme contexto): Visão geral, Mapa de calor, Reincidência, Tempos de resposta, Categorias, Exportar.
- TanStack Query (nada de fetch direto), Styled Components com `theme` (sem cor hardcoded), fontes JetBrains Mono para números. Gráficos: escolha uma biblioteca leve, acessível e com tema (justificar); sempre com tabela alternativa para leitor de tela.
- **Mapa de calor com MapTiler:** a chave é restrita por domínio; células desenhadas sobre o mapa; sem popup que injete HTML (usar `textContent`).
- Estado "bloqueado por plano": mostrar **prévia com dados de exemplo desfocados e rótulo "exemplo"** (nunca dados reais de outra área) e botão "Ver planos" ligado ao catálogo.
- Tom de voz simples; cada gráfico traz uma frase "O que isso mostra" e o ícone de definição (abre a definição da métrica).
- Estados de carregamento, vazio ("poucos relatos para mostrar com segurança") e erro.

## T7 — Comparativo com municípios do mesmo porte (opcional, só se houver dado de população)

Só implementar se existir população por município no banco. Caso contrário, deixar apenas a interface do serviço e `feature: 'peer_comparison'` como "Em breve". Regras: mínimo de 5 municípios na faixa, **resposta em percentil e faixa** (nunca nome de outro município), faixas por população definidas em constante.

## T8 — Testes e critérios de pronto

- Testes unitários dos serviços (Jest) e dos cálculos de métrica (fixtures com casos de borda: sem respostas, um só relato, fuso, virada de mês).
- Teste de **reconciliação** rollup × consulta bruta.
- Teste de **privacidade**: nenhuma resposta do módulo contém `authorId`, e-mail, coordenadas originais, nem células abaixo do mínimo; relato anônimo contado sem vazamento. Percorrer o JSON de saída recursivamente.
- Teste de **escopo territorial** (organização A não lê a área de B) e de **plano** (cada rota × cada plano).
- Teste de desempenho: com 500 mil relatos sintéticos, `overview` e `heatmap` abaixo de 300 ms p95 a partir do rollup (anexar medições).
- `route-auth-audit.spec.ts` e a matriz de papéis atualizados e verdes.
- **Pronto quando:** build e `tsc` limpos; suítes verdes (informar o número); dicionário de métricas escrito; EXPLAIN anexado; nenhuma rota do módulo pesada ao vivo.

## Fora do escopo

PDF e cartão (4C), prazos/SLA e alertas (4C/4D), cobrança (4E), IA preditiva, qualquer dado pessoal de cidadão.

## Entregável

Relatório no formato dos anteriores: respostas do T0, arquivos alterados, decisões, saída de testes/tsc/build, EXPLAIN, medições e divergências do brief.
