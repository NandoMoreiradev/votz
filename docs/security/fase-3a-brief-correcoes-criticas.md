# Votz — Brief 3A: correções críticas de segurança

> **Para quem vai executar (Gemini):** este brief é autocontido. Leia tudo antes de começar. **Não faça commit.** Ao terminar, devolva: arquivos alterados, comandos rodados e resultado dos testes. Regras do projeto no `CLAUDE.md` da raiz (NestJS + Prisma, DTO com `class-validator`, Swagger, **teste unitário Jest para todo Service alterado**, arquivos em kebab-case, banco em snake_case).
>
> **Execute só depois que os briefs 2B e 2C terminarem** (todos alteram `auth.service.ts`, `users.service.ts` e `schema.prisma`; rodar junto gera conflito de migration). Os trechos abaixo citam **funções**, não números de linha, porque os arquivos mudaram.
>
> **Leia antes:** `docs/security/auditoria-seguranca-2026-11.md` (achados H1 a H4, M1, M2, com evidências). Referência de desenho (somente leitura, **não copie código**; o maskot tem dependências que o Votz não tem): `C:\Users\pc\WebstormProjects\maskotCrmEdu\docs\SESSOES_E_TOKENS.md` e `...\backend\src\auth\auth.service.ts` (`generateRefreshToken`, `familyId`).

## Ambiente
Banco PostgreSQL **local** (Docker Compose); R2 não configurado (use mocks de `StorageService`). Nada está em produção, então **invalidar as sessões atuais é aceitável** (todos terão que entrar de novo).

Ordem: **T0 → T1 → T2 → T3 → T4 → T5 → T6**.

---

## T0 — Correções encontradas na revisão do Brief 2B

Três ajustes no que o 2B entregou. Fazem parte deste brief porque tocam em `mail.service.ts` e `auth.service.ts`, que o 2C e o T2 também alteram.

### T0.1 — Aviso de inatividade que falha em silêncio (risco real)

**Problema:** `MailService.sendInactivityNotice` termina com `.catch((err) => this.logger.error(...))`, como os outros envios: **o erro de SMTP é engolido**. `InactivityService.sendInactivityNotices` então grava `inactivityNoticeSentAt = now` e conta como avisado. Se o SMTP estiver fora do ar ou mal configurado, a pessoa é marcada como avisada **sem ter recebido o e-mail** e é **anonimizada 30 dias depois**, quebrando a promessa da Política de Privacidade ("avisando por e-mail antes"). O teste unitário não pega isso, porque o mock do e-mail rejeita, enquanto o `MailService` real nunca rejeita.

**Correção:**
- `sendInactivityNotice` **não pode engolir o erro**: remova o `.catch` (deixe a exceção subir) ou retorne `Promise<boolean>`. Só este método; não mude os demais envios.
- `InactivityService` só grava `inactivityNoticeSentAt` e só incrementa `notified` quando o envio **teve sucesso**. Em falha, mantém `null` (tenta de novo no dia seguinte) e registra um aviso no log.
- Escape o `name` no HTML do e-mail (veja o T4 do brief 3B; se `escapeHtml` ainda não existir, crie um helper simples aqui).

**Aceite:** teste em que o envio **lança erro**: `inactivityNoticeSentAt` continua nulo, o usuário **não** é contado como avisado e **não** é anonimizado nos 30 dias seguintes.

### T0.2 — Não registrar `TOKEN_REFRESH` no log de acesso

**Problema:** `AuthService.refresh` chama `accessLog.record(userId, AccessEvent.TOKEN_REFRESH, ip)`. O `refresh` roda **a cada ~15 minutos** de uso ativo (vida do access token): até ~96 linhas por usuário por dia, guardadas por 6 meses. Com 10 mil usuários ativos por dia, são centenas de milhões de linhas, sem benefício: o Marco Civil pede o registro do **acesso/uso da aplicação**, e o início de sessão (`LOGIN`, `GOOGLE_LOGIN`, `MFA_LOGIN`, `REGISTER`) já cobre isso. A falha de desenho foi do brief 2B, não do Gemini.

**Correção:** remova a chamada de `TOKEN_REFRESH` em `refresh`. **Não** remova o valor do enum (evita migration). Ajuste o teste do `auth.service.spec.ts` e atualize o comentário do `AccessLogService` dizendo que só eventos de **início de sessão** são registrados. No T2 abaixo (refresh em tabela), **também não** registre log em `POST /auth/refresh`.

### T0.3 — Paginação com cursor sobre conjunto que encolhe (baixa)

**Problema:** em `InactivityService.sendInactivityNotices`/`anonymizeInactiveUsers` e `VerificationRetentionService.purgeExpiredDocuments`, os jobs paginam com `cursor + skip: 1` sobre um filtro cujos resultados **saem do conjunto ao serem processados** (aviso enviado, conta apagada, documento purgado). A linha do cursor deixa de existir ou de casar com o filtro, e o `skip: 1` pode **pular um registro válido**, ou a próxima página vir vazia, limitando o processamento a ~100 por dia.

**Correção:** como as linhas processadas saem do filtro, repita `findMany({ where, take: BATCH_SIZE })` **sem cursor** até vir vazio, guardando num `Set` os ids que **falharam** nesta rodada (excluídos por `id: { notIn: [...] }`) para não entrar em laço infinito. **Aceite:** teste com mais de `BATCH_SIZE` registros elegíveis em que todos são processados numa única execução.

---

## T1 — H1: token pré-MFA não pode valer como sessão (bypass de MFA)

**Problema:** `AuthService.login` emite `{ sub, type: 'mfa_pending' }` (5 min) e `{ sub, type: 'mfa_setup_required' }` (30 min) assinados com o **mesmo `JWT_SECRET`** do token de acesso. `JwtStrategy.validate` (`auth/strategies/jwt.strategy.ts`) só busca o usuário por `payload.sub` e **não olha o tipo**. Resultado: quem tem só a senha usa o `mfaToken` como `Authorization: Bearer` em qualquer rota protegida. O mesmo vale em `notifications.gateway.ts` e `debates.gateway.ts` (`jwt.verify(token)` sem checar tipo).

**Correção:**
1. `generateTokens` passa a incluir `typ: 'access'` no payload do **access token**.
2. `JwtStrategy.validate` **recusa** (`UnauthorizedException`) qualquer token cujo `payload.typ !== 'access'`. Fixe também o algoritmo: `algorithms: ['HS256']` nas opções do `super({...})`.
3. Os tokens temporários continuam com seus `type` atuais, mas **nunca** podem passar no `JwtStrategy`. `JwtMfaSetupGuard` e `mfaVerifyLogin` continuam exigindo o `type` correto.
4. Nos dois gateways, após `jwt.verify`, exigir `payload.typ === 'access'` e **consultar o usuário** (existe e `banned === false`); caso contrário `client.disconnect()`.
5. Nas opções do `JwtModule` (e em cada `verifyAsync`/`verify` do projeto) usar `algorithms: ['HS256']`.

**Aceite (testes):**
- `JwtStrategy.validate` rejeita payload `{ sub, type: 'mfa_pending' }` e `{ sub, type: 'mfa_setup_required' }` e payload sem `typ`.
- Aceita payload com `typ: 'access'`.
- Gateway recusa token `mfa_pending` e usuário banido.
- Teste de integração do fluxo: login de usuário com MFA → o `mfaToken` **não** acessa `GET /auth/me` (401).

## T2 — H3: sessão com refresh token opaco, em tabela, com detecção de reuso

**Problema:** `storeRefreshHash` faz `bcrypt.hash(refreshToken)`. O bcrypt só considera os **72 primeiros bytes**, e num JWT isso é o cabeçalho + o início do payload (igual para todo token do mesmo usuário). Comprovado: dois refresh tokens diferentes do mesmo usuário passam na mesma verificação. Logo, o token antigo continua válido após a rotação e o roubo não é detectado. `User.refreshTokenHash` também permite só **uma** sessão por usuário.

**Modelo novo** (`schema.prisma`):
```prisma
model RefreshToken {
  id        String    @id @default(uuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  familyId  String                      // uma "sessão" = uma família de tokens rotacionados
  tokenHash String    @unique           // SHA-256 (hex) do token opaco
  expiresAt DateTime
  usedAt    DateTime?                   // preenchido quando o token é trocado por um novo
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
  @@index([familyId])
  @@map("refresh_tokens")
}
```
(`onDelete: Cascade` mantém a exclusão de conta funcionando. **Inclua `RefreshToken` no teste de `deleteAccount`.**)

**Comportamento:**
1. O refresh token passa a ser **aleatório**: `randomBytes(48).toString('base64url')`. **Não é mais JWT.** O cookie `votz_refresh_token` guarda esse valor, com as mesmas opções de hoje (`httpOnly`, `secure` em produção etc.).
2. Ao emitir (login, registro, Google, MFA): criar uma **nova família** (`familyId = randomUUID()`) e gravar só o `tokenHash` (SHA-256 em hex).
3. `POST /auth/refresh`: ler o cookie → SHA-256 → buscar. Se **não existe**, `expiresAt` vencido ou `revokedAt` preenchido → 401. Se `usedAt` **já está preenchido (reuso)** → **revogar toda a família** (`revokedAt = now`) e 401. Se válido → marcar `usedAt = now`, emitir novo token **na mesma família** e novo access token.
4. Substitua `JwtRefreshStrategy`/guard de refresh por essa lógica no `AuthService` (remova o uso de `JWT_REFRESH_SECRET` onde ele deixar de existir; deixe a variável opcional e documentada como obsoleta em `.env.example`).
5. `logout` revoga **a família da sessão atual**. Novo `POST /auth/logout-all` (JWT) revoga **todas** as famílias do usuário.
6. Revogação em massa também em: troca de senha (se existir), **banimento** (`AdminService.banUser`) e exclusão de conta (cascade).
7. Limpeza: job diário (padrão `mandate-expiry`, BullMQ) que apaga `RefreshToken` com `expiresAt` anterior a 30 dias.
8. Remova `User.refreshTokenHash` do schema (migration) depois de migrar o código. Manter uma sessão ativa por aparelho é o novo comportamento esperado.
9. **Mantenha** o que o brief 2B adicionou nesses fluxos (`inactivityNoticeSentAt`, `lastLoginAt`, e `AccessLog` apenas em **início de sessão**: login, registro, Google, MFA; **não** em `refresh`, ver T0.2).

**Aceite (testes):**
- Token usado duas vezes → segunda vez 401 **e a família inteira é revogada** (o token novo emitido na primeira troca também deixa de valer).
- Token antigo do mesmo usuário **não** passa depois da rotação (o teste que falhava com bcrypt agora passa).
- Dois logins em aparelhos diferentes geram duas famílias independentes; `logout` encerra só uma; `logout-all` encerra todas.
- Usuário banido não consegue refresh.
- `deleteAccount` continua passando e apaga os `RefreshToken`.

## T3 — H4: não gravar refresh token nem código OAuth nos logs

**Problema:** `app.module.ts` configura `pinoHttp` e customiza só o serializer de `req`. O serializer **padrão** de `res` inclui os cabeçalhos da resposta. Comprovado: a linha de log traz `"set-cookie":"votz_refresh_token=...; HttpOnly; Secure"` e a URL `/auth/google/callback?code=...&state=...` completa.

**Correção** (em `LoggerModule.forRoot({ pinoHttp: ... })`):
- `redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'], censor: '[REDACTED]' }`.
- Serializer de `req` registra a URL **sem a query string** (`url.split('?')[0]`).
- Serializer de `res` devolve só `{ statusCode }`.
- Extraia a configuração para um arquivo próprio (ex.: `apps/api/src/common/logger/pino-config.ts`) para poder testar.

**Aceite (teste):** teste unitário que sobe um servidor HTTP mínimo com essa configuração, responde com `Set-Cookie: votz_refresh_token=SEGREDO` e requisição `...?code=ABC`, captura a linha de log e **falha se** `SEGREDO` ou `ABC` aparecerem.

## T4 — H2: cobrança (Stripe) só para quem administra a organização

**Problema:** `POST /subscricoes/checkout` e `POST /subscricoes/portal` recebem `orgId`/`orgType` no corpo e **não conferem se o usuário pertence à organização**. Qualquer conta logada abre o portal de cobrança de outra organização (cancelar assinatura, trocar cartão, ver faturas) ou cria o cliente Stripe dela com o e-mail do atacante.

**Correção:**
1. Nova permissão `MANAGE_BILLING` no enum `OrgPermission` (migration). Conceda-a ao papel de dono/administrador **padrão** de cada tipo de organização (onde as roles padrão são criadas ou semeadas; localize no código/seed).
2. Em `SubscricoesController`, `checkout` e `portal` passam a usar `@UseGuards(JwtAuthGuard, OrgPermissionGuard)` + `@RequireOrgPermission(OrgPermission.MANAGE_BILLING)` (o guard já lê `orgType`/`orgId` do corpo; ambos os DTOs já têm esses campos).
3. `getOrCreateCustomer` deve usar o e-mail do **usuário autenticado que passou no guard** e validar que a organização existe; nunca sobrescrever um `stripeCustomerId` existente.
4. Ajuste o front (`apps/web/src/pages/Planos.tsx` e hooks) se necessário: usuário sem a permissão vê a mensagem "Só quem administra a organização pode contratar ou gerenciar o plano", sem erro genérico.

**Aceite (testes):** usuário **de outra organização** recebe 403 em `checkout` e `portal`; membro sem `MANAGE_BILLING` recebe 403; membro com a permissão recebe a URL; organização inexistente → 404.

## T5 — M1: pré-sequestro de conta via login com Google

**Problema:** `register` cria conta com senha e permite entrar **sem verificar o e-mail**. `googleLogin` busca `OR [googleId, email]` e, ao achar conta sem `googleId`, **vincula e marca `emailVerified = true`**. O atacante cadastra o e-mail da vítima com uma senha dele; quando a vítima entra com Google, as contas se unem e **a senha do atacante continua valendo**.

**Correção** em `AuthService.googleLogin`, ao vincular um `googleId` a uma conta **existente**:
- Se a conta **não tinha o e-mail verificado** (`emailVerified === false`): **anular a senha** (`password = null`), **revogar todas as famílias de refresh** (T2) e só então vincular.
- Se já estava verificada: vincula normalmente.

**Aceite (testes):** conta não verificada com senha + login Google → `password` fica nulo e as sessões antigas são revogadas; conta verificada mantém a senha; conta nova segue o fluxo atual.

## T6 — M2: roles de outra organização (BOLA) e DTO sem validação

**Problema:** `PATCH/DELETE /org-memberships/roles/:id`: o `OrgPermissionGuard` confere o `orgType/orgId` que vêm **no corpo**, mas `updateRole`/`deleteRole` operam pelo `:id` da URL e **não conferem se a role pertence a essa organização**. O `PATCH` usa `Partial<CreateRoleDto>` (tipo do TS, sem decoradores), então o `ValidationPipe` **não valida o corpo**. `CreateRoleDto` aceita `isDefault` vindo do cliente. `updateMemberRole` não confere que a role é da mesma organização (o `invite` confere).

**Correção:**
1. Mude as rotas para `PATCH|DELETE /org-memberships/:orgType/:orgId/roles/:id` (o guard passa a ler `orgType`/`orgId` da **URL**), e atualize os hooks do front (`apps/web/src/hooks/useOrgMemberships.ts` e quem os usa).
2. `updateRole(orgType, orgId, id, data)` e `deleteRole(orgType, orgId, id)` exigem `role.orgType === orgType && role.orgId === orgId`, senão `404`.
3. Crie `UpdateRoleDto` com decoradores (`@IsOptional() @IsString() @MaxLength(60) name`, `@IsOptional() @IsArray() @IsEnum(OrgPermission, { each: true }) permissions`) em vez de `Partial<CreateRoleDto>`.
4. Remova `isDefault` do `CreateRoleDto`; o servidor sempre cria com `isDefault = false`.
5. `updateMemberRole` verifica que a role pertence à mesma organização.

**Aceite (testes):** usuário com `MANAGE_MEMBERS` na organização A **não** consegue editar nem apagar role da organização B (404); o `PATCH` rejeita corpo inválido (400); `isDefault` enviado pelo cliente é ignorado/rejeitado.

---

## Verificação final (rodar e reportar)

```bash
npm run db:migrate --workspace=packages/database -- --name security_refresh_tokens_and_billing_permission
npm run build --workspace=packages/shared-types
npx tsc --noEmit -p apps/api
npx tsc --noEmit -p apps/web
npm run test --workspace=apps/api
npm run build --workspace=apps/api
npm run build --workspace=apps/web
```
Se `db:generate` falhar com EPERM (arquivo bloqueado), pare o servidor de desenvolvimento e tente de novo. Se o Vite mostrar tela branca com "export not found" de `@votz/shared-types`, apague `apps/web/node_modules/.vite` e reinicie.

**No relatório, diga explicitamente:** (1) como confirmou que o `mfaToken` deixou de funcionar como sessão; (2) como testou o reuso de refresh token; (3) quais testes novos cobrem T3 e T4.
