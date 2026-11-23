# Servidor de anúncios (`apps/ads-server`)

> **Estado (23/11/2026):** código pronto e **provado localmente**: subiu com banco e Redis reais (porta 3100) ao lado da API (3000), entregou anúncio com carrossel igual à API, recebeu evento (a API viu o mesmo evento como duplicado), respondeu 401 sem token e dividiu com a API o limite de 3 exibições e o cache por pessoa. **Teste de carga feito (23/11 à tarde, ver seção abaixo):** achou e corrigiu uma contenção de linha na entrega; um processo sustentou ~300 pedidos/s nesta máquina compartilhada. **Falta:** medir a meta (1.000 pedidos/s, p99 < 40 ms) em ambiente isolado, comparação com sorteio controlado e o serviço no Railway (**não foi ao ar**).

## O que é

Um segundo processo NestJS que serve **só** as duas rotas quentes dos anúncios, com os mesmos caminhos e as mesmas respostas da API:

| Rota | O que faz |
|---|---|
| `GET /api/v1/ads/next` | O anúncio da vez para o espaço do feed (ou nenhum) |
| `POST /api/v1/ads/events` | Eventos em lote: visível, clique, esconder |
| `GET /api/v1/ads-server/health` | Para o balanceador (sem login) |

Todo o resto (relatórios, Estúdio, moderação, cobrança, avisos) continua na API.

## Por que separar

- **Escala sozinho:** o espaço de anúncio pede a cada ~8 publicações; é a rota que mais cresce. Dá para ter 3 cópias do servidor de anúncios e 1 da API.
- **Falha sozinho:** se a entrega ficar lenta ou cair, o feed segue sem anúncio e a API continua de pé (e o contrário).
- **Mais leve:** não carrega filas, WebSocket, e-mail, nem as dezenas de módulos da API. Sobe em poucos segundos e usa pouca memória.

## Como compartilha o código (sem copiar)

`ads-server.module.ts` importa direto de `apps/api/src` o `AdsDeliveryService`, o repositório, o ritmo (`AdsPacingService`), o estado por pessoa, a cópia do cadastro e a regra de vizinhança. **A lógica de entrega é uma só**: privacidade, leilão, ritmo, antifraude e cobrança não podem divergir entre os dois. O `tsc` do servidor compila junto os arquivos que importa (`rootDir` é `apps/`), então `dist/ads-server/src/main.js` é o ponto de entrada.

## Escolhas e custos

- **Login sem banco:** `AdsAuthGuard` confere assinatura HS256, validade e `typ: "access"` do mesmo token da API, sem consultar o banco. Custo: quem foi banido ainda vê anúncio até o token vencer (15 min).
- **Sem agendador:** o `@Cron` do fechamento do gasto (`closeSpend`) e os avisos de saldo **continuam só na API**. Se o servidor de anúncios também tivesse agendador, o fechamento rodaria em dobro.
- **Mesmo Redis e mesmo banco da API.** A cópia por pessoa (escondidos, limite diário, cadastro) fica no Redis, e a API apaga a cópia quando a pessoa muda o perfil ou o aceite, então as duas pontas enxergam a mesma coisa. Redis fora do ar: lê do banco, como já fazia.
- **Freio por IP:** 600 pedidos por minuto (`ADS_SERVER_RATE_LIMIT_PER_MINUTE`), em memória. Só contra abuso: a regra de verdade (3 exibições por pessoa e anúncio em 24 h, antifraude) está na entrega.
- **Cache de candidatos, estatística e qualidade** continua por processo (15 s, 1 min, 10 min). Com 3 cópias, cada uma lê o banco uma vez por janela, o que é pouco.

## Variáveis

As mesmas da API: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `CLOUDFLARE_R2_BUCKET`, `CLOUDFLARE_R2_ENDPOINT`, `CLOUDFLARE_R2_PUBLIC_URL`, `AD_CLICK_URL_BASE` / `APP_URL`, `ADS_DELIVERY_BUDGET_MS`. Porta: `ADS_SERVER_PORT` (padrão 3100) ou `PORT`. **`JWT_SECRET` precisa ser igual ao da API.** Em desenvolvimento, `NODE_ENV=development` liga o motivo de "sem anúncio" (`debugReason`).

## Como rodar

```powershell
# Desenvolvimento (a API também pode estar rodando; usam portas diferentes)
npm run start:dev --workspace=apps/ads-server

# Compilar e rodar
npm run build --workspace=apps/ads-server
npm run start --workspace=apps/ads-server

# Testes
npm test --workspace=apps/ads-server
```

Docker: `apps/ads-server/Dockerfile` (contexto na raiz do repositório; no Railway `RAILWAY_DOCKERFILE_PATH=apps/ads-server/Dockerfile`).

## Como ligar na frente (proxy)

O site e o celular chamam `<API>/api/v1/ads/...`. Para usar o servidor de anúncios, o proxy da frente manda **só** estes dois caminhos para ele, e o resto para a API. Exemplo de Caddy:

```
handle /api/v1/ads/next   { reverse_proxy ads-server:3100 }
handle /api/v1/ads/events { reverse_proxy ads-server:3100 }
handle /api/v1/*          { reverse_proxy api:3000 }
```

Sem proxy (ou sem o servidor de anúncios no ar), a API continua respondendo as mesmas rotas: nada quebra. Para voltar atrás, basta tirar as duas regras.

## Teste de carga (23/11/2026, à tarde)

**Cenário:** `GET /ads/next` no `apps/ads-server` (porta 3100), 3.000 usuários de teste em Campinas com aceite e interesse que casam com 2 campanhas ativas, gerador aberto (pedidos saem no ritmo alvo, sem esperar resposta), Docker Desktop com Postgres, Redis e MinIO, **tudo na mesma máquina de 4 núcleos** (junto com o gerador, a API de outro projeto do dono e o Vite). Cadastros aquecidos antes. O script ficou só no scratchpad do Claude (não está no repositório).

**Defeito achado e corrigido:** `createImpression` incrementava `ad_daily_stats` **dentro da transação de cada entrega**. Os pedidos do mesmo anúncio travavam a mesma linha: 46 a 57 de 60 conexões ficaram em `Lock/transactionid`, a API devolvia `Unable to start a transaction in the given time` e o servidor parava perto de 100 pedidos/s (p50 de 1 a 2 s e centenas de erros 500, mesmo com pool de 60 conexões). Agora a exibição é um `INSERT` só e o contador do dia sobe **em lote** (uma gravação por anúncio e dia por segundo, por processo: `flushImpressionCounts`, 6 testes em `ads-delivery.impression-counter.spec.ts`). **Custo aceito:** o contador "exibições entregues" atrasa até 1 s e, se o processo morrer sem aviso, perde o que estava no buffer. Ele só alimenta relatório e taxas (qualidade, visibilidade, experimento); a cobrança vem dos eventos visível e clique, que **continuam transacionais e exatos**.

**Resultado depois da correção (pool padrão do Prisma, 9 conexões):**

| Pedidos/s | Com anúncio | Erros | p50 | p99 |
|---|---|---|---|---|
| 150 | 93% | 0 | 29 ms | 108 ms |
| 200 | 93% | 0 | 31 ms | 238 ms |
| 300 | 90% | 0 | 89 ms | 711 ms |
| 500 | 4 a 10% (tempo-limite de 250 ms estoura e a entrega devolve "sem anúncio", como projetado) | 0 | 650 a 1100 ms | 1,7 a 3 s |
| 1.000 | ~1% | 3 a 4% (conexões recusadas) | 3,6 a 4,2 s | 8 a 9 s |

Pool de 40 conexões não mudou o teto. **Conclusão honesta:** um processo sustentou **cerca de 300 pedidos/s** nesta máquina, com a máquina inteira perto de 84% de CPU. **A meta do plano (p99 abaixo de 40 ms com 1.000 pedidos/s) NÃO foi provada nem refutada**: este computador dividido com o gerador e o Docker não serve para isso. O que o teste prova é que a contenção de linha, que impediria qualquer escala, saiu. **Falta** medir em ambiente isolado (Railway ou máquina dedicada) com 2 a 3 cópias e o gerador em outra máquina.

**Ainda é gargalo conhecido, não medido aqui:** `applyEvent` (`POST /ads/events`) faz `upsert` na mesma linha do dia e soma `pending_spend_millicents` na **linha da conta**, ambos dentro da transação. Um anunciante grande com muitos eventos por segundo vai ter a mesma fila de linha. Tirar isso da transação mexe na cobrança exata ("cobra uma vez"), então **precisa de decisão do dono** antes (opções: contadores em Redis com descarga em lote, ou fragmentar a linha em N partes e somar na leitura).

## Falta

- **Subir de verdade e comparar:** feito em 23/11 (a API e o servidor deram a mesma resposta). Falta a comparação com sorteio controlado.
- **Teste de carga em ambiente isolado** (ver acima): a meta é p99 abaixo de 40 ms com 1.000 pedidos/s; nesta máquina, um processo aguentou ~300 pedidos/s e o p99 ficou em 238 ms a 200 pedidos/s.
- **Serviço no Railway** (`RAILWAY_DOCKERFILE_PATH`, variáveis, domínio interno) e a regra do proxy.
- **Observabilidade:** log de latência e de tempo-limite por instância (hoje só o aviso de tempo-limite a cada 10 s).
- **Separar o banco de leitura** (réplica) só se a carga pedir.
