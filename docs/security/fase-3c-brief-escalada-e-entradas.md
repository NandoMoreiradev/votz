# Votz — Brief 3C: escalada de privilégio e entradas do cliente

> **Para quem vai executar (Gemini):** este brief é autocontido. Leia tudo antes de começar. **Não faça commit** (o dono do projeto commita). Ao terminar, devolva: arquivos alterados, comandos rodados e resultado dos testes. Regras do projeto no `CLAUDE.md` da raiz (NestJS + Prisma, DTO com `class-validator`, Swagger, **teste unitário Jest para todo Service alterado**, Styled Components com `theme`, arquivos em kebab-case, banco em snake_case).
>
> **Leia antes:** `docs/security/roteiro-auditoria-nivel-a.md` (achados A0, A3, A4, A6, com a evidência de cada um).
>
> **Ambiente:** banco PostgreSQL **local**; R2 **não** configurado (use mocks de `StorageService` nos testes).

Ordem: **T1 → T2 → T3 → T4 → T5**. **T1 é urgente.**

---

## T1 — A0: moderador não pode promover contas (escalada para ADMIN)

**Problema:** `PATCH /admin/users/:id/type` (`admin.controller.ts`, método `setUserType`) só herda o `@Roles(UserType.MODERATOR, UserType.ADMIN)` da **classe**. Nem o controller nem `AdminService.setUserType` restringem nada, e `SetTypeDto` aceita qualquer `UserType`, inclusive `ADMIN`. **Um moderador consegue tornar qualquer conta, inclusive a própria, ADMIN.**

**Correção:**
1. `@Roles(UserType.ADMIN)` no método `setUserType` (só admin muda papel).
2. `AdminService.setUserType(id, type, actorId, reason)`:
   - **Proíba alterar o próprio papel** (`id === actorId` → 400).
   - **Proíba rebaixar o último ADMIN** (conte os `ADMIN`; se o alvo é o último, 400).
   - Exija `reason` (10 a 500 caracteres) no corpo; crie `SetTypeDto` com `@IsEnum(UserType)` e `reason` validado (siga o padrão do `SetBanDto`).
   - Tipos que representam **vínculo com organização** (`ENTITY`, `POLITICIAN`, `COMPANY`) são concedidos pelo **fluxo de aprovação de cadastro**, não aqui. **Recuse** `ENTITY`, `POLITICIAN` e `COMPANY` neste endpoint (400, mensagem clara). Permitidos aqui: `CITIZEN`, `PRESS`, `NGO`, `RESEARCHER`, `MODERATOR`, `ADMIN`.
   - Grave **auditoria**: adicione `USER_TYPE_CHANGED` ao enum `ModerationActionType` (migration) e registre em `ModerationAction` (`targetType: 'USER'`, `reason`, `actorId`) na **mesma transação** da alteração. Guarde o papel anterior e o novo no `reason` (ex.: `"CITIZEN → MODERATOR: <motivo>"`).
   - Ao mudar o papel de alguém, **revogue as sessões de refresh dele** (reaproveite o método de revogação do 3A) para que o novo papel valha logo.
3. Atualize o front do painel (`apps/web/src/pages/Admin.tsx`, aba de usuários): o seletor de papel só aparece para ADMIN, pede o **motivo** (reaproveite `ModerationReasonModal`) e mostra o erro da API.
4. **Confirme e relate** o papel efetivo de **cada rota** de `AdminController` (tabela no seu relatório). As que devem ser **só ADMIN**: `setUserType`, `entities/:id/plan`, `politicians/:id/plan`, `companies/:id/plan`. Mantenha moderador em: listar, banir (com as regras já existentes), remover relato, verificar entidade e político (decisão do dono: moderadores revisam cadastros). Se achar outra rota que deveria ser só admin, **liste no relatório, não altere**.
5. Confirme também o que `GET /admin/users` devolve e **relate** se há campo sensível além de nome, e-mail e papel.

**Aceite (testes):**
- Moderador chamando `setUserType` → **403** (teste HTTP com guards reais).
- Admin alterando o papel de outra conta → 200 e linha em `ModerationAction`.
- Admin tentando alterar o **próprio** papel → 400.
- Rebaixar o **último** admin → 400.
- `ENTITY`/`POLITICIAN`/`COMPANY` recusados → 400.
- `reason` ausente ou curto → 400.
- Sessões de refresh do alvo revogadas após a mudança.
- `deleteAccount` continua passando com a nova relação.

## T2 — Matriz papel × rota (teste que teria pegado o A0)

Crie `apps/api/src/common/security/role-matrix.spec.ts`:
- Suba um módulo de teste **com os guards reais** (`JwtAuthGuard`, `RolesGuard`) e os services **mockados**.
- Para cada rota de `AdminController`, `AdminFlagsController` (moderação), `RegistrationRequestsController` (rotas de revisão) e dos controllers de sincronização (`camara-sync`, `senado-sync`, `tse-sync`, `ibge-sync`), declare em uma tabela o **conjunto de papéis permitidos**, e teste **todos** os papéis (`CITIZEN`, `ENTITY`, `POLITICIAN`, `COMPANY`, `PRESS`, `NGO`, `RESEARCHER`, `MODERATOR`, `ADMIN`) mais o anônimo: permitido → não é 401/403; negado → 401 (anônimo) ou 403.
- O teste **falha** se aparecer, nesses controllers, uma rota que não esteja na tabela (para forçar quem cria rota nova a declarar o papel).

**Aceite:** a suíte passa; ao remover o `@Roles(ADMIN)` do `setUserType` ela **falha** (rode essa prova e relate).

## T3 — A3: mídia de comentário vinda do cliente

**Problema:** em `create-comment.dto.ts`, `mediaKey` é só `@IsString()` e `mediaUrl` só `@IsUrl()`. O `mediaKey` segue para `TranscriptionProcessor.process`, que chama `storage.getSignedDownloadUrl(mediaKey, ...)` para **qualquer chave do bucket** e envia o conteúdo ao Groq; a transcrição volta para o comentário público.

**Correção:**
1. Crie em `StorageService` (ou arquivo utilitário) `isCommentMediaKey(key)`: confere o padrão exato que o `upload` gera para a pasta `comments`: `comments/<uuid>.<ext>` com `ext` na lista de áudio/vídeo permitidos pelo `ALLOWED_MIME_TYPES` do próprio `StorageService`. **Reaproveite as constantes do serviço, não duplique a lista.**
2. No DTO (`@Matches` ou validador próprio) e **de novo** em `CommentsService.create`: `mediaKey` precisa passar em `isCommentMediaKey`, e `mediaUrl` precisa ser **exatamente** `${publicBase}/${mediaKey}`. Qualquer divergência → 400.
3. **Defesa em profundidade** em `TranscriptionProcessor.process`: antes de assinar, recuse (`throw`) qualquer `mediaKey` que não passe em `isCommentMediaKey`.
4. **Não crie tabela de "quem enviou qual arquivo"** nem qualquer vínculo usuário↔upload. Para mídia de **relato** isso ligaria usuário a relato anônimo e quebraria a garantia de anonimato. A validação de formato é suficiente.

**Aceite (testes):** `mediaKey` de outra pasta (`verification/...`, `exports/...`, `reports/...`) → 400; `mediaUrl` que não bate com o `mediaKey` → 400; `mediaKey` válido passa; o processor recusa chave inválida sem chamar o storage.

## T4 — A4: URLs de mídia e imagem só do nosso storage

**Problema:** `CreateReportDto.media`, `UpdateStatusDto.media`, a evidência de `DisputeDto`, `avatarUrl` (usuário e político) e `logoUrl` (entidade e empresa) aceitam **qualquer** `http`, `https` ou `ftp`. Hospedagem externa permite rastrear o IP de quem vê e trocar o conteúdo depois.

**Correção:**
1. Crie `isOwnStorageUrl(url, folder?)` em `StorageService` (compara com `publicBase`; use o `extractKeyFromUrl` que já existe e confira a pasta esperada: `reports` para mídia de relato/evidência, `avatars` para avatar, `entities` para logo).
2. Use em validação (DTO ou service) nos campos acima: URL que não é do nosso storage → 400 com mensagem clara ("Envie o arquivo pelo Votz").
3. Mantenha como **URL externa permitida** só `website` e `linkExterno`, mas troque o `@IsUrl()` por `@IsUrl({ protocols: ['http', 'https'], require_protocol: true })` (tire o `ftp`).
4. **Não grave** relação usuário↔arquivo (mesma razão do T3).
5. Cuidado com dados já existentes (seed, importações do TSE/Câmara com `avatarUrl` de fonte externa): a validação vale para **entrada nova**. Se o `avatarUrl` de políticos importados vier de domínio oficial, **permita** a origem oficial por uma allowlist de domínios configurável (`ALLOWED_EXTERNAL_IMAGE_HOSTS`), e **documente** no `.env.example`.

**Aceite (testes):** cada campo recusa URL externa e aceita URL do storage da pasta certa; URL do storage de **outra** pasta é recusada; `ftp://` recusado em `website`; importação de políticos continua funcionando.

## T5 — A6: `state` no login com Google (login CSRF)

**Problema:** `GoogleStrategy` só define `scope` e `GoogleAuthGuard` não passa `state`. Um atacante pode fazer a vítima concluir o login **na conta do atacante**.

**Correção (sem sessão de servidor):**
1. Em `GET /auth/google`, gere um `state` aleatório (`randomBytes(24).toString('base64url')`), grave num cookie `votz_oauth_state` (`httpOnly`, `secure` em produção, `sameSite: 'lax'`, `maxAge` de 10 min, `path: '/api/v1/auth/google'`) e envie o mesmo valor como parâmetro `state` ao Google (sobrescreva `getAuthenticateOptions` no `GoogleAuthGuard` para devolver `{ state }`).
2. Em `GET /auth/google/callback`, antes de qualquer outra coisa: o `state` da query **precisa ser igual** ao do cookie (comparação em tempo constante com `timingSafeEqual`). Se faltar ou divergir → 400 e **limpe** o cookie. Em sucesso, limpe o cookie também.
3. Não quebre o fluxo atual do 3B (callback sem token na URL, o front usa `refreshSession()`).

**Aceite (testes):** callback sem cookie → 400; cookie diferente do `state` → 400; igual → segue o fluxo normal; o cookie é limpo ao final.

---

## Verificação final (rodar e reportar)

```bash
npm run db:migrate --workspace=packages/database -- --name security_role_change_audit
npm run build --workspace=packages/shared-types
npx tsc --noEmit -p apps/api
npx tsc --noEmit -p apps/web
npm run test --workspace=apps/api
npm run build --workspace=apps/api
npm run build --workspace=apps/web
```

**No relatório, diga explicitamente:** (1) a tabela de papel efetivo de cada rota do `AdminController`; (2) a prova de que a matriz **falha** quando o `@Roles(ADMIN)` do `setUserType` é removido; (3) o que `GET /admin/users` devolve; (4) como o `state` do Google foi testado.
