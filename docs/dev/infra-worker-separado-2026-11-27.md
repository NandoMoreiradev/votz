# Worker separado do site (Votz no Cloud Run)

## Como retomar
- **Estado (27/11/2026):** código pronto e testado; **nada foi criado no Google Cloud** (o serviço `votz-worker` só nasce quando alguém roda `deploy.ps1 -Apps worker`). Sem custo novo até lá.
- **O que foi feito:** a variável `RUN_JOBS` liga/desliga o trabalho de fundo do processo. Padrão = ligado (tudo como era: uma instância faz tudo). Com `RUN_JOBS=false` o processo só atende pedidos e tempo real: não processa filas BullMQ e não roda `@Cron`/`@Interval`; continua podendo **colocar** jobs nas filas.
- **Provado (27/11):** testes unitários (`apps/api/src/common/jobs/jobs-mode.spec.ts`, 20) e uma prova com Redis real (teste descartável, apagado): com `RUN_JOBS=false` o job colocado na fila não foi processado e o `@Cron` não disparou; ao subir outra instância com `RUN_JOBS=true`, o mesmo job foi processado e o `@Cron` disparou. `tsc` sem erro nos arquivos novos.
- **NÃO verificado:** `deploy.ps1` (sem PowerShell nem `gcloud` logado aqui; o trecho que cria o serviço copiando a configuração do `votz-api` nunca rodou), o worker de verdade no Cloud Run, e a API inteira subindo com `RUN_JOBS=false` contra o banco (só o mecanismo foi provado, com um módulo de teste).
- **Próximo passo:** quando o dono quiser: (1) `deploy.ps1 -Apps api,worker`; (2) conferir nos logs do `votz-worker` "Trabalho de fundo ... ligado" e que as filas andam; (3) só então desligar no site: `gcloud run services update votz-api --region us-central1 --project votz-prod-515716 --update-env-vars RUN_JOBS=false`. Nessa ordem, para nunca ficar sem ninguém processando as filas. Voltar atrás = `RUN_JOBS=true` no `votz-api`.
- **Arquivos principais:** `apps/api/src/common/jobs/jobs-mode.ts`, `apps/api/src/app.module.ts` (ScheduleModule condicional), `apps/api/src/main.ts` (`configureJobsMode()` antes de criar o app), `infra/gcp/deploy.ps1` (alvo `worker`).
- **Decisões que só o dono muda:** ligar o worker no Cloud Run (custo), região, e quando desligar os jobs no site.

## Como funciona
- `ScheduleModule.forRoot()` só entra nos imports se `RUN_JOBS` não for falso. Sem ele os `@Cron`/`@Interval` ficam inertes.
- Com jobs desligados, `BullModule.workerClass` passa a ser `IdleWorker` (aceita `on`/`close` dos `@OnWorkerEvent`, não abre conexão no Redis e não busca job). É definido uma vez, antes de `NestFactory.create`.
- Valores que desligam: `false`, `0`, `no`, `off`, `nao`, `não` (qualquer caixa). Ausente, vazio ou outro valor: liga.
- O worker usa a **mesma imagem** da API. Quando o worker emite algo em tempo real (notificação, chat), o Redis adapter do Socket.IO entrega às instâncias do site.

## Serviço `votz-worker` (criado só por `-Apps worker`)
- Mesma imagem da API, `RUN_JOBS=true`, `RUN_MIGRATIONS=false`, **CPU sempre alocada** (`--no-cpu-throttling`), 1 vCPU, 1 GiB, **exatamente 1 instância** (`min=max=1`), sem acesso público, mesma saída de rede privada (Redis) e mesmos segredos do `votz-api` (copiados na primeira criação).
- **Custo (estimativa, não medida):** CPU sempre ligada é cobrada o mês inteiro. Pela tabela de preço conferida em 27/11 (Iowa: US$ 0,000018 por vCPU-s e US$ 0,000002 por GiB-s; São Paulo ~40% mais), 1 vCPU + 1 GiB o mês todo dá ~US$ 52 em Iowa e ~US$ 73 em São Paulo (ver [Custo da infraestrutura inicial](https://claude.ai/artifact/6yGajU8W97Vg3zoQ12Au1R)). Hoje, com CPU só nos pedidos, o trabalho de fundo só anda enquanto há pedido: por isso o worker separado é o jeito certo, mas é custo novo.
- Se o `votz-worker` cair, as filas só enchem (os jobs ficam guardados no Redis) e voltam a andar quando ele volta; nada é perdido.
- Atualizar o worker junto com a API: `deploy.ps1 -Apps api,worker`. Com `-Apps api` sozinho o worker fica na versão antiga.
- Se `#20` (migrations em tarefa separada) já estiver no ar, o worker não roda migration (`RUN_MIGRATIONS=false`), só a tarefa `votz-migrate` e o deploy da API.
