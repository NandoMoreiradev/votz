# Dicionário de Métricas — Votz Analytics (v1.0.0)

- **Versão da definição:** `v1.0.0`
- **Data da definição:** `2026-11-15`
- **Fuso horário de corte diário:** `America/Sao_Paulo` (`timezone('America/Sao_Paulo', ts)::date`)
- **Limiar mínimo de privacidade (k-anonimato):** `MIN_CELL_SIZE = 10`
- **Precisão espacial:** Célula **Geohash precisão 7** (~150 m × 150 m). Coordenadas originais (`latitude`/`longitude`) e `authorId` nunca são retornados pela camada de análise.

> **Regra de razões:** toda métrica percentual ou razão publica obrigatoriamente **numerador**, **denominador**, `sampleSize`, `computedAt` e `definitionVersion`.  
> **Regra de supressão (`MIN_CELL_SIZE = 10`):** qualquer célula territorial/temática/pública com `0 < count < 10` tem seus valores detalhados mascarados (`null` + `suppressed: true`), ou é omitida no mapa de calor mantendo apenas o contador agregado `suppressedCells` para impedir reidentificação por exclusão.

---

## Catálogo de métricas (v1)

| Chave | Nome | Definição exata | Fórmula | Fonte | Janela | Tratamento de nulos | Limites de uso | Versão |
|---|---|---|---|---|---|---|---|---|
| `volume` | Volume de relatos | Total de relatos criados no período e escopo. | `SUM(created_count)` | `area_metrics_daily` / `recipient_metrics_daily` | `[from, to]` (até 24 meses; Básico Entidade: 30d) | Retorna `0` se não houver linhas; se `sampleSize < 10` em recorte sub-granular ou público, marca `suppressed: true`. | Não mede subnotificação onde há baixa adoção digital. | `v1.0.0` |
| `resolution_rate` | Taxa de resolução | Proporção de relatos resolvidos frente aos maduros (resolvidos + ainda abertos com idade > 7 dias). | `num = SUM(resolved_count)`; `den = num + SUM(open_current_count WHERE day <= hoje_sp - 7d)`; razão `num ÷ den` | `area_metrics_daily` | `[from, to]` | Se `den = 0`, valor é `null` (publica `num=0, den=0`). Nunca exibe `100%` artificial quando há apenas relatos novos. | Exclui `ARCHIVED` do numerador e denominador e evita penalizar relatos recentes (<7d). | `v1.0.0` |
| `first_response_median_h` e `first_response_p90_h` | Tempo de primeira resposta (p50 / p90) + `response_rate` | Horas entre criação e `firstResponseAt` entre relatos respondidos; `response_rate` indica cobertura (`respondidos ÷ volume`). | Percentis interpolados sobre histograma de 8 faixas (`[1, 4, 12, 24, 48, 168, 720, >720]h`); `response_rate = SUM(response_count) ÷ SUM(created_count)` | `area_metrics_daily` (`resp_buckets`) | `[from, to]` | `null` quando `response_count = 0` ou recorte suprimido. | Deve ser lida junto com `response_rate` para evitar viés de seleção. | `v1.0.0` |
| `resolution_time_median_h` e `resolution_time_p90_h` | Tempo de resolução (p50 / p90) | Horas entre `createdAt` e `resolvedAt` entre relatos resolvidos. | Percentis interpolados sobre `res_buckets` (8 faixas horárias). | `area_metrics_daily` (`res_buckets`) | `[from, to]` | `null` quando não há relatos com `resolvedAt`. | Mede apenas relatos concluídos, não o backlog aberto. | `v1.0.0` |
| `backlog` e `backlog_age_p50_h/p90_h` | Backlog e idade do backlog | Quantidade de relatos ainda não resolvidos (`OPEN`, `UNDER_REVIEW`, `IN_PROGRESS`, `DISPUTED`) e percentis p50/p90 de idade em horas. | `backlog = SUM(open_current_count)`; idade = `(hoje_sp - day) * 24h` ponderada por `open_current_count`. | `area_metrics_daily` | `[from, to]` | Percentis `null` quando `backlog = 0`. | Usa granularidade diária no cálculo de idade em `America/Sao_Paulo`. | `v1.0.0` |
| `contest_rate` | Taxa de contestação | Proporção de relatos cuja resolução foi contestada pelo autor cidadão. | `num = SUM(contested_count)`; `den = SUM(resolved_count) + SUM(contested_count)`; razão `num ÷ den` | `area_metrics_daily` | `[from, to]` | `null` quando `den = 0`. | Relatos anônimos não permitem contestação autenticada (`reports.service.ts`). | `v1.0.0` |
| `reincidence` e `recurrence_index` | Reincidência espacial por tema | Pares `(cell7, category)` com `count_90d >= 2` nos últimos 90 dias; índice = soma de relatos nessas células ÷ total de relatos com `cell7` na janela de 90d. | `SUM(count_90d WHERE count_90d >= 2) ÷ total_geo_90d` | `recurrence_cells` + `area_metrics_daily` | Janela móvel de 90 dias até `window_end` | Células com `count_90d < 10` têm contagem individual suprimida na saída; índice `null` se `total_geo_90d = 0`. | Exige coordenadas válidas no cadastro do relato para compor `cell7`. | `v1.0.0` |
| `trend_7d/30d/90d` | Tendência comparativa | Variação percentual do volume frente ao período anterior de mesma duração. | `((atual - anterior) ÷ anterior) * 100` | `area_metrics_daily` | `7d`, `30d` ou `90d` | `null` quando `anterior = 0`. Emite alerta explícito (`smallBaseWarning: true`) quando `anterior < 10` ou `atual < 10`. | Bases muito pequenas geram variações percentuais ruidosas. | `v1.0.0` |
| `pressure_p50/p90` e áreas com maior pressão | Pressão cidadã agregada | Mediana e p90 de `pressureScore`, mais ranking agregado de células/temas respeitando `MIN_CELL_SIZE`. | Interpolação em 9 faixas de `pressureScore` (`[5, 10, 25, 50, 100, 250, 500, 1000]`). | `area_metrics_daily` (`pressure_buckets`) | `[from, to]` | `null` se `sampleSize = 0` ou se todas as células estiverem abaixo de `MIN_CELL_SIZE`. | Não expõe títulos nem IDs individuais quando há risco de identificação. | `v1.0.0` |
| `category_mix` | Mix por categoria | Distribuição absoluta e percentual por `Category`. | `num = SUM(created_count) por category`; `den = SUM(created_count) total` | `area_metrics_daily` | `[from, to]` | Categorias com `0 < count < 10` têm números suprimidos (`null`, `suppressed: true`). | — | `v1.0.0` |
| `support_volume` e `comment_volume` | Engajamento agregado | Soma de votos (`SUPPORT` + `ME_TOO`) e comentários nos relatos criados no período. | `SUM(support_count)` e `SUM(comment_count)` | `area_metrics_daily` | `[from, to]` | `0` quando vazio; `null` quando suprimido por `MIN_CELL_SIZE`. | Mede engajamento na coorte de criação do relato. | `v1.0.0` |
| `outbreak_history` | Histórico de surtos | Surtos registrados pelo detector de surtos na área territorial da organização. | Contagem e listagem de `Surto` no estado/município do escopo | `surtos` | `[from, to]` | Lista vazia quando não houve surtos no recorte. | Detector dispara em `>= 5` relatos/24h por categoria/cidade (`alerts.service.ts`). | `v1.0.0` |

---

## Status de relato (`ReportStatus`) e significado nas métricas

- `OPEN`: criado, sem atendimento inicial; compõe `volume` e `backlog`.
- `UNDER_REVIEW`: em análise pela organização; permanece no `backlog` até resolução.
- `IN_PROGRESS`: em andamento/avocado; permanece no `backlog` até resolução.
- `RESOLVED`: marcado como resolvido (registra `resolvedAt`); compõe `resolution_rate` e `resolution_time`, deixa o `backlog`.
- `DISPUTED`: cidadão contestou resolução anterior; compõe o numerador de `contest_rate` e retorna ao `backlog` enquanto pendente.
- `ARCHIVED`: arquivado; contado no `volume` histórico de criação, excluído do `backlog` e não contado como resolvido em `resolution_rate`.
