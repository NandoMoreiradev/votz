# Servidor de anúncios (`apps/ads-server`)

> **Estado (23/11/2026):** código pronto e **provado localmente**: subiu com banco e Redis reais (porta 3100) ao lado da API (3000), entregou anúncio com carrossel igual à API, recebeu evento (a API viu o mesmo evento como duplicado), respondeu 401 sem token e dividiu com a API o limite de 3 exibições e o cache por pessoa. **Falta:** teste de carga, comparação com sorteio controlado e o serviço no Railway (**não foi ao ar**).

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

## Falta

- **Subir de verdade e comparar:** com banco e Redis, o mesmo pedido na API e no servidor de anúncios precisa dar a mesma resposta (fora o sorteio).
- **Teste de carga** do servidor sozinho: a meta do plano é p99 abaixo de 40 ms com 1.000 pedidos/s (hoje, dentro da API, mede-se p99 de ~49 ms com 20 simultâneos).
- **Serviço no Railway** (`RAILWAY_DOCKERFILE_PATH`, variáveis, domínio interno) e a regra do proxy.
- **Observabilidade:** log de latência e de tempo-limite por instância (hoje só o aviso de tempo-limite a cada 10 s).
- **Separar o banco de leitura** (réplica) só se a carga pedir.
