# Votz — Brief 3B: endurecimento de segurança

> **Para quem vai executar (Gemini):** este brief é autocontido. Leia tudo antes de começar. **Não faça commit.** Ao terminar, devolva: arquivos alterados, comandos rodados e resultado dos testes. Regras do projeto no `CLAUDE.md` da raiz (NestJS + Prisma, DTO com `class-validator`, Swagger, **teste unitário Jest para todo Service alterado**, Styled Components com `theme` sem cor hexadecimal nova, arquivos em kebab-case).
>
> **Execute depois do Brief 3A** (que por sua vez vem depois de 2B e 2C). Cite sempre funções, não linhas.
>
> **Leia antes:** `docs/security/auditoria-seguranca-2026-11.md` (achados M3 a M8 e L1 a L11). Referências de desenho do maskot (somente leitura, **não copie código**): `C:\Users\pc\WebstormProjects\maskotCrmEdu\docs\ROTACAO_SEGREDOS.md`, `CRIPTOGRAFIA_DADOS_SENSIVEIS.md`, `INCIDENTES_SEGURANCA.md`, `TESTE_IDOR.md` e `backend\src\common\security\csp.ts`.

Ordem: **T1 → T8**. Cada tarefa é independente, então pode entregar em partes e reportar cada uma.

---

## T1 — M3: dependências vulneráveis

`npm audit --omit=dev` (14/11/2026): **44 vulnerabilidades (3 críticas, 21 altas)**. Destaques: `dompurify` (é o nosso sanitizador), `nodemailer`, `axios`, `multer`/`body-parser` (via `@nestjs/platform-express`), `socket.io-parser`/`engine.io`/`ws`, `zod`, `maplibre-gl` (front), `proxy-addr`, `tar`.

1. Rode `npm audit fix` (**sem** `--force`). Rode build e testes. Reporte o que sobrou.
2. Atualize **individualmente**, com build e teste a cada uma: `dompurify`, `nodemailer`, `axios`, `zod`, `maplibre-gl` (confirme que o mapa continua funcionando). Para `zod` e `maplibre-gl` há saltos de versão maior: leia o changelog e só atualize se o build e os testes passarem; senão documente o bloqueio.
3. **Não faça salto de versão maior do NestJS** (`@nestjs/*`) neste brief. Liste no relatório o que o audit só resolve com essa atualização, para decisão separada.
4. Entregue uma tabela final: pacote, severidade, estado (corrigido / bloqueado e por quê / aceito).

## T2 — M4: cabeçalhos de segurança no site (front)

O `render.yaml` do `votz-web` só define `Cache-Control`. Adicione, em `headers` (`path: /*`):
- `Content-Security-Policy`: `default-src 'self'`; `script-src 'self'`; `style-src 'self' 'unsafe-inline'` (Styled Components); `font-src 'self'`; `img-src 'self' data: https:`; `connect-src 'self'` + origem da API (`VITE_API_URL`) + `wss:` para a API + `https://api.maptiler.com` + `https://*.livekit.cloud` (confira a URL real do LiveKit) + `https://brasilapi.com.br`; `worker-src 'self' blob:` (MapLibre usa workers); `frame-ancestors 'none'`; `base-uri 'self'`; `object-src 'none'`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(self), geolocation=(self)` (o mapa pede geolocalização e comentários em áudio pedem microfone) e `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- Como o CSP depende de URLs de ambiente, deixe os valores **comentados com instruções** no `render.yaml` onde forem específicos do deploy. Teste localmente com `vite preview` conferindo no console do navegador que **nenhum recurso foi bloqueado** (mapa, login com Google, fontes, debate).

## T3 — M5: não colocar o token de acesso na URL do Google

`AuthController.googleCallback` hoje redireciona para `${APP_URL}/auth/google/callback?token=<accessToken>`. Troque por: definir o cookie de refresh (como já faz) e redirecionar para `${APP_URL}/auth/google/callback` **sem token**. No front, `GoogleCallback.tsx` chama `POST /auth/refresh` (cookie) para obter o access token e segue o fluxo atual. Garanta `window.history.replaceState` removendo qualquer query. Teste: o redirect não contém `token=`.

## T4 — M6: escapar HTML no popup do mapa e nos e-mails

1. **Mapa** (`apps/web/src/pages/MapView.tsx`): o popup monta uma string HTML com `props.title`, `categoryLabel` etc. e usa `setHTML`. Troque por **nós DOM criados com `textContent`** (ou `setDOMContent`), nunca interpolando texto de usuário em HTML. Mantenha a aparência.
2. **E-mails** (`apps/api/src/mail/mail.service.ts`): crie `escapeHtml()` (`& < > " '`) e aplique a **todo** valor interpolado vindo de usuário/organização: `name`, `orgName`, `roleName`, `reviewNote`, etc. No `subject`, remova quebras de linha (`\r\n`) para evitar injeção de cabeçalho. Teste: `name = '<a href="https://x">clique</a>'` aparece escapado no HTML enviado.

## T5 — M7: autorização "negada por padrão"

Hoje só o `ThrottlerGuard` é global; toda rota nova esquecida nasce pública. O `JwtAuthGuard` já respeita `@Public()` (`IS_PUBLIC_KEY`).
1. Registre `JwtAuthGuard` como `APP_GUARD` (depois do Throttler) e marque `@Public()` **todas** as rotas hoje públicas: cadastro, login, verificar e-mail, `mfa/verify`, `refresh`, Google, webhook do Stripe, health e os `GET` públicos de leitura (relatos, políticos, entidades, empresas, partidos, mapa, imprensa, alertas, debates, propostas, perfil público de usuário, votos). A API pública (`api-publica/*`) usa `ApiKeyGuard`, então também precisa de `@Public()` para escapar do JWT.
2. **Teste de varredura** (unitário, lendo os metadados dos controllers): lista toda rota **sem** `@Public()` e **sem** guard/roles e falha se aparecer alguma nova que altere dados sem guard explícito. Inclua uma allowlist fixa das rotas públicas esperadas, para que adicionar uma rota pública exija mudar o teste de propósito.
3. Rode a suíte inteira: nada pode mudar de comportamento para o usuário.

## T6 — M8 e L9: segredos e criptografia

1. **Validação no boot** (`apps/api/src/config/` ou no `ConfigModule` via `validate`): `JWT_SECRET` e `JWT_REFRESH_SECRET` (se ainda usado) com **pelo menos 32 caracteres** e diferentes entre si; `CPF_ENCRYPTION_KEY` com **exatamente 64 caracteres hexadecimais** (32 bytes). Em produção, **recusar iniciar** se inválido; em desenvolvimento, só avisar. Atualize `.env.example` com a instrução de geração.
2. **Versão no texto cifrado** (`crypto.service.ts`): `encrypt` passa a gravar `v1:<iv>:<tag>:<dados>`. `decrypt` aceita **os dois formatos** (com e sem `v1:`) para não quebrar dados existentes. Isso prepara a rotação futura de chave. Atualize os testes.
3. **`User.mfaSecret` em texto puro:** cifrar com o `CryptoService` ao gravar e decifrar ao usar (`otpVerify`). Migração de dados: script idempotente `npm run security:encrypt-mfa-secrets` (simula por padrão; `-- --apply` aplica) que cifra os segredos ainda em texto puro (detecte pelo ausente `v1:`). **Nunca** logar o segredo.
4. **JWT sem algoritmo fixo:** se o 3A não tiver fixado em algum ponto, fixe `HS256` em todos os `sign`/`verify`.

## T7 — Baixas rápidas (L1, L2, L3, L4, L7, L10)

- **L1 — MFA:** contador de tentativas **por usuário** no `mfaVerifyLogin` (reaproveite `failedLoginAttempts`/`lockedUntil` ou crie `mfaFailedAttempts`): 5 erros → bloqueio de 15 min. Zera no acerto.
- **L2 — enumeração:** no `login`, quando o e-mail não existe, rode `bcrypt.compare` contra um **hash fictício constante** para igualar o tempo e devolva o mesmo `Invalid credentials`. (O cadastro continua devolvendo 409; documente como aceito.)
- **L3 — Throttler em Redis:** configure o `ThrottlerModule` com storage em Redis (usa o `REDIS_URL` já existente; avalie `@nest-lab/throttler-storage-redis` ou implemente o `ThrottlerStorage`). Se o Redis cair, o comportamento deve ser **não derrubar a API** (log de aviso).
- **L4 — CSRF nos endpoints de cookie:** em `POST /auth/refresh` e `POST /auth/logout(-all)`, exigir que o cabeçalho `Origin` (ou `Referer`) seja igual a `FRONTEND_URL`; senão 403. Teste com origem correta e incorreta.
- **L7 — Stripe:** guardar o `event.id` processado (tabela `StripeEvent { id, type, processedAt }`) e ignorar repetidos (responder 200); proteger `sub.metadata` indefinido (`sub.metadata ?? {}`); trocar `console.warn` pelo `Logger` sem dados de cliente.
- **L10 — WebSocket:** nos dois gateways, rechecar a cada 5 minutos se o usuário continua existindo e não está banido (desconectar se não); e desconectar na hora quando `AdminService.banUser` banir.

## T8 — Processo: CI e plano de incidente

1. **CI** (`.github/workflows/ci.yml`, gatilho `workflow_dispatch` **e** `pull_request`): instala, `prisma generate`, `tsc --noEmit` (api e web), testes do `apps/api`, build do web, e `npm audit --omit=dev --audit-level=high` (falha se houver alta/crítica **fora** de uma allowlist registrada em `docs/security/audit-allowlist.md`). Adicione `.github/dependabot.yml` (npm, semanal, agrupando atualizações menores).
2. **Plano de incidente** `docs/security/plano-de-incidentes.md`, em português, inspirado em `maskotCrmEdu/docs/INCIDENTES_SEGURANCA.md` mas **escrito para o Votz** (não copie nomes de escola/tenant): como detectar, contenção em 1 hora (revogar sessões via `logout-all` global, rotacionar `JWT_SECRET`, desativar chaves de API), avaliação de risco, **comunicação à ANPD e aos titulares** (LGPD art. 48: em prazo razoável; defina internamente 3 dias úteis), registro do incidente e lições aprendidas. Inclua checklist, contatos (use o e-mail do encarregado de `apps/web/src/legal/types.ts`) e um modelo de comunicado.
3. **Teste automatizado de autorização por organização** (método do `maskot/docs/TESTE_IDOR.md`): spec que, para cada rota com `orgId`/`orgType`/`:id` de recurso de organização (org-memberships, subscrições, registration-requests, propostas, debates), tenta com **usuário de outra organização** e espera 403/404. Comece pelas rotas que o 3A corrigiu.

---

## Verificação final (rodar e reportar)

```bash
npm run db:migrate --workspace=packages/database -- --name security_hardening
npm run build --workspace=packages/shared-types
npx tsc --noEmit -p apps/api
npx tsc --noEmit -p apps/web
npm run test --workspace=apps/api
npm run build --workspace=apps/api
npm run build --workspace=apps/web
npm audit --omit=dev
```
No relatório, inclua a **tabela da T1** (estado de cada vulnerabilidade) e diga o que ficou **bloqueado** e por quê.
