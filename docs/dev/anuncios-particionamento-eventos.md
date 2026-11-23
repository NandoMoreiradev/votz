# Anúncios: partição das tabelas de eventos (quando o volume crescer)

> **Estado (23/11/2026): ainda NÃO particionado, de propósito.** O que existe é um vigia (`apps/api/src/ads/ads-volume`) que mede o tamanho das tabelas todo dia às 4h30 (horário de São Paulo) e escreve um aviso no log quando uma passa do limite. Este documento diz o que fazer quando o aviso aparecer. O SQL abaixo é rascunho: **nunca foi rodado** (o banco local estava desligado quando foi escrito). Teste num banco com cópia dos dados antes de usar.

## Por que não agora

- O volume de hoje (beta) é de milhares de linhas. Partição não ajuda nada abaixo de dezenas de milhões de linhas e custa complexidade (criar partições todo mês, `DEFAULT`, ferramentas que não entendem).
- Duas regras do banco impedem partir `ad_impressions` sem mexer no código: o `click_token` é **único no banco todo** (o link `votz.app/c/<id>` procura por ele) e `ad_events` e `ad_conversions` apontam para `ad_impressions.id`. Numa tabela particionada, toda restrição de unicidade precisa conter a chave da partição.

## Limites do vigia (`volume-rules.ts`)

| Tabela | Avisa com | Dá para particionar? |
|---|---|---|
| `ad_events` | 20 milhões de linhas ou 8 GB | **Sim**, é a primeira (ninguém aponta para ela) |
| `ad_shadow_decisions` | 10 milhões de linhas ou 4 GB | Sim (é só registro de comparação) |
| `ad_impressions` | 20 milhões de linhas ou 8 GB | Não sem redesenho (veja abaixo) |

Para ler o aviso: `grep "particionar" ` no log da API. Para ver agora: chamar `AdsVolumeService.check()`.

## `ad_events`: partição mensal por `occurred_at`

**Chave da partição: `occurred_at`** (a hora que o aparelho informou), e não `received_at`. O motivo: o aparelho repete o mesmo evento (mesmo `event_id` e mesmo `occurred_at`) quando reenvia, então a unicidade `(event_id, occurred_at)` continua barrando duplicados. Com `received_at` (que muda a cada recebimento) a barreira deixaria de funcionar. O servidor já rejeita evento com relógio fora de 5 minutos, mas **evento inválido fica guardado** com a hora que veio, por isso é preciso uma partição `DEFAULT` para datas estranhas.

### Passos

1. **Código antes do SQL** (`schema.prisma`, modelo `AdEvent`): trocar `@id` por `@@id([id, occurredAt])` e `eventId @unique` por `@@unique([eventId, occurredAt])`. `AdsDeliveryRepository.applyEvent` grava com `createMany({ skipDuplicates: true })` (`ON CONFLICT DO NOTHING`) e trata "nada gravado" como duplicado: continua valendo com a unicidade composta, desde que o reenvio traga o mesmo `occurred_at`.
2. **Tabela nova**, partição mensal:

```sql
-- RASCUNHO, NÃO APLICADO
CREATE TABLE "ad_events_p" (LIKE "ad_events" INCLUDING DEFAULTS) PARTITION BY RANGE ("occurred_at");
ALTER TABLE "ad_events_p" ADD PRIMARY KEY ("id", "occurred_at");
CREATE UNIQUE INDEX "ad_events_p_event_id_occurred_at_key" ON "ad_events_p" ("event_id", "occurred_at");
CREATE INDEX "ad_events_p_impression_id_idx" ON "ad_events_p" ("impression_id");
CREATE INDEX "ad_events_p_ad_id_received_at_idx" ON "ad_events_p" ("ad_id", "received_at");
ALTER TABLE "ad_events_p" ADD CONSTRAINT "ad_events_p_impression_id_fkey" FOREIGN KEY ("impression_id") REFERENCES "ad_impressions"("id") ON DELETE CASCADE;
ALTER TABLE "ad_events_p" ADD CONSTRAINT "ad_events_p_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads"("id") ON DELETE CASCADE;

CREATE TABLE "ad_events_default" PARTITION OF "ad_events_p" DEFAULT;
-- uma por mês, do mês mais antigo que existe até o mês seguinte ao atual:
CREATE TABLE "ad_events_2026_11" PARTITION OF "ad_events_p" FOR VALUES FROM ('2026-11-01 03:00:00') TO ('2026-12-01 03:00:00');
```

3. **Copiar em lotes** (por mês, fora do horário de pico) e conferir a contagem: `INSERT INTO ad_events_p SELECT * FROM ad_events WHERE occurred_at >= ... AND occurred_at < ...`.
4. **Trocar os nomes numa janela curta** (`ALTER TABLE ... RENAME`), com a API parada ou em modo de leitura, e conferir que `ad_events` (já particionada) responde.
5. **Tarefa mensal** que cria a partição do mês seguinte (`@Cron`, no dia 20, idempotente com `CREATE TABLE IF NOT EXISTS`). Sem ela, tudo cai na partição `DEFAULT` e o ganho some.

### Ganhos e cuidados

- Relatórios e antifraude filtram por data: leem só as partições do período.
- Apagar ou arquivar um mês vira `DETACH PARTITION` (instantâneo) em vez de `DELETE` de milhões de linhas. **Prazo de guarda dos eventos é decisão do dono com o contador e o advogado** (eventos servem de prova de cobrança e de tráfego inválido; a LGPD pede guardar só o necessário). Hoje nada é apagado.
- O Prisma enxerga a tabela particionada como uma tabela normal; `prisma migrate` não cria partições, então a migration que troca os nomes é escrita à mão.

## `ad_impressions`: não particionar, redesenhar antes

- `click_token` único global: trocar a busca do `/c/<id>` por um token que carregue a data (por exemplo, `<yyyymm>.<aleatório>`), para dar para buscar só a partição certa e usar `UNIQUE (click_token, served_at)`.
- `ad_events` e `ad_conversions` precisam apontar para `(id, served_at)`, o que muda o formato do evento que o aparelho manda (hoje manda só `impressionId`).
- Alternativa bem mais barata, que costuma bastar: **manter a tabela inteira e apagar o que passou do prazo**, porque `ad_daily_stats` já guarda o consolidado por dia. Isso também depende da decisão do prazo de guarda.

## Quando fazer

- Aviso do vigia na `ad_events`: planejar a partição para as próximas 2 a 4 semanas (a cópia demora e precisa de janela).
- Consulta de relatório passando de 1 s com índice: não esperar o aviso.
