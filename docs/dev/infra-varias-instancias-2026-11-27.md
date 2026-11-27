# Votz em várias instâncias no Google Cloud: auditoria e correções

## Como retomar (27/11/2026)

**Estado:** auditoria feita (só leitura). Relatório completo com arquivo e linha: Claude Doc "Auditoria: Votz em várias instâncias no Google Cloud" (https://claude.ai/artifact/Vp9AvpViDu65S6G3rrXid4). Correções em PRs separados, nesta ordem:

1. **Tarefas recorrentes que rodavam uma vez só** (este PR, feito): `jobId` fixo + `removeOnComplete` faz o BullMQ recusar em silêncio o job seguinte. Agora o nome leva a janela de tempo (`apps/api/src/common/queue/job-window.ts`); jobs por relato usam `deduplication` com `keepLastIfActive`.
2. Desligar com cuidado (`enableShutdownHooks`, `exec node` no `CMD`) e migrations em Cloud Run Job. **Não feito.**
3. Separar o trabalhador (`votz-worker`) do site, com variável que liga/desliga cron e filas. **Não feito.**
4. Tempo real: token novo na reconexão do site, banir em todas as instâncias, API não sobe sem o adaptador Redis. **Não feito.**
5. Envio direto ao bucket (junto com a migração R2 para GCS), 2 GiB de memória. **Não feito.**
6. Synapse no Google Cloud. **Não feito**, depende de decisões do dono (segunda VM, HTTPS na frente, aval para mudar a validação de `CHAT_MATRIX_URL`).

**Verificado no PR 1:** testes unitários dos 15 arquivos tocados, `tsc` limpo, e um teste com Redis real (BullMQ 5.76.8): tarefa diária por 3 dias com 2 "instâncias" por dia rodou 3 vezes (antes, 1); job por relato com dados 1, 2, 3 e 4 processou [1, 3, 4] (um pendente junto vira um só, um que chega durante a execução roda depois).
**Não verificado:** a configuração real do Cloud Run (sem login do gcloud; comandos de leitura estão no relatório) e o efeito no ambiente de teste.

**Decisões que só o dono muda:** onde roda o trabalhador (Cloud Run sempre ligado ou VM), custo extra a partir do lançamento (estimativa US$ 45 a 85 por mês, não conferida), segunda VM para o Synapse.

**Efeito esperado depois de publicar o PR 1:** as limpezas de LGPD e o recálculo de pressão voltam a rodar. Com o ambiente de teste com 0 instâncias, o cron só dispara se houver instância viva (item 3 resolve).
