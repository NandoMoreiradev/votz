# Votz — Brief 2C: moderação (sinalizar conteúdo, remover com registro, avisar o autor)

> **Para quem vai executar (Gemini):** este brief é autocontido. Leia tudo antes de começar. **Não faça commit.** Ao terminar, devolva: arquivos alterados, comandos rodados e resultado dos testes. Regras do projeto no `CLAUDE.md` da raiz (NestJS + Prisma, DTO com `class-validator`, Swagger, **teste unitário Jest para todo Service novo/alterado**, Styled Components com `theme` de `apps/web/src/theme` **sem cor hexadecimal nova**, TanStack Query para chamadas no front, arquivos em kebab-case, banco em snake_case). Tom de voz dos textos de tela: direto, justo, firme, sem juridiquês.
>
> **Leia antes:** `apps/web/src/legal/diretrizes-da-comunidade.ts` e `apps/web/src/legal/termos-de-uso.ts` (seção "Moderação, remoção e suspensão"). São as promessas públicas que este brief precisa cumprir.

## 1. Por que isso existe

Os textos legais já publicados prometem:

1. Qualquer pessoa pode **avisar a moderação** sobre um conteúdo problemático. Hoje só existe por e-mail, **não há botão**.
2. Quando o Votz **remover conteúdo ou banir uma conta**, **explica o motivo** ao autor (quando possível) e diz como contestar.
3. A moderação **remove, suspende ou bane**, e o autor pode **contestar** por e-mail.

## 2. Fatos do código que você precisa saber

- **Relato anônimo NÃO guarda o autor.** `Report.authorId = null` quando `anonymous = true` (`apps/api/src/reports/reports.service.ts` ~linha 53; `reports.repository.ts` ~linha 95). Logo, **não há para quem avisar** num relato anônimo (pule o aviso, sem erro). **Nada que você criar pode registrar ou permitir ligar um usuário a um relato anônimo.**
- **Remoção de relato está quebrada.** `AdminRepository.deleteReport` (`apps/api/src/admin/admin.repository.ts` ~linha 60) faz `prisma.report.delete({ where: { id } })`. Todo relato tem pelo menos um `TimelineEvent` (CREATED) e há outras relações obrigatórias sem `onDelete` (padrão `Restrict`): `TimelineEvent`, `Vote`, `Comment`, `Notification`, `ReportFollower`. **O delete falha por chave estrangeira.** Confirme com um teste antes de corrigir.
- `DELETE /admin/reports/:id` é só `ADMIN` (`@Roles(UserType.ADMIN)`). Moderador não consegue remover relato.
- `PATCH /admin/users/:id/ban` usa `SetBanDto` **sem nenhuma validação** (`class SetBanDto { banned: boolean }` em `admin.controller.ts`, sem `class-validator`) e **não impede banir outro admin/moderador**. Banir só liga `banned = true` (login e JWT já bloqueiam: `auth.service.ts` ~linha 167 e `jwt.strategy.ts` ~linha 41).
- Comentários: `CommentsService.delete(id, requesterId, requesterType)` já deixa `MODERATOR`/`ADMIN` removerem qualquer comentário. Áudio de comentário tem `mediaKey` no R2.
- `StorageService`: `delete(key)` e `extractKeyFromUrl(url)`. Mídia de relato fica em `Report.media` (URLs do R2).
- `MailService` (`apps/api/src/mail/mail.service.ts`) já tem `sendAccountDeleted`, `sendRegistrationRejected` etc. Siga o estilo.
- Painel admin: `apps/web/src/pages/Admin.tsx` com abas (`UsersTab`, `ReportsTab`, `EntitiesTab`, `PoliticiansTab`…).
- Comentários no front: `apps/web/src/components/comments/CommentsSection.tsx`. Relato: `apps/web/src/pages/ReportDetail.tsx`.
- E-mail de contato para contestação: `fernandomoreira.dev@gmail.com` (provisório; já existe como constante `SUPPORT_EMAIL` em `users.service.ts`). **Centralize em um único arquivo** (ex.: `apps/api/src/common/legal.constants.ts`) e reuse.

## 3. Tarefas

Ordem: **T1 → T2 → T3 → T4 → T5**. Migrations aditivas. Rode `npm run db:migrate` e `npm run db:generate` ao alterar o schema.

> ⚠️ **Cuidado com exclusão de conta (Fase 1):** toda relação nova com `User` **não pode** reintroduzir erro de chave estrangeira em `UsersService.deleteAccount`. Para cada relação nova com `User`, defina `onDelete` adequado e **inclua no teste de exclusão de conta**.

### T1 — Corrigir a remoção de relato e registrar toda ação de moderação

**Modelo de auditoria** (`schema.prisma`):
```prisma
enum ModerationActionType {
  REPORT_REMOVED
  COMMENT_REMOVED
  USER_BANNED
  USER_UNBANNED
}

model ModerationAction {
  id         String               @id @default(uuid())
  action     ModerationActionType
  targetType String               // "REPORT" | "COMMENT" | "USER"
  targetId   String
  reason     String               // motivo escrito pelo moderador (obrigatório ao remover/banir)
  actorId    String?              // quem moderou
  actor      User?                @relation("ModerationActor", fields: [actorId], references: [id], onDelete: SetNull)
  notifiedAt DateTime?            // quando o autor foi avisado (nulo se não havia a quem avisar)
  createdAt  DateTime             @default(now())

  @@index([targetType, targetId])
  @@map("moderation_actions")
}
```
(adicione o lado inverso em `User` conforme o Prisma exigir.)

**Remoção de relato** (`AdminService.deleteReport`): em **uma transação**, apague as dependências e depois o relato — `Notification`, `Vote`, `Comment` (e áudios deles no R2), `ReportFollower`, `TimelineEvent`, e o `Report`. Depois do commit, apague no R2 a mídia do relato (`Report.media` via `extractKeyFromUrl`) e os áudios dos comentários, em fire-and-forget. Libere a remoção para `MODERATOR` e `ADMIN` (ajuste o `@Roles`). Exija `reason` (texto, 10 a 500 caracteres) no corpo.

**Banimento:** crie DTOs **com validação** (`@IsBoolean()`, `@IsString() @MinLength(10) @MaxLength(500)` para `reason`, obrigatório quando `banned = true`). **Proíba banir** contas `ADMIN`/`MODERATOR` e a si mesmo (`400`).

**Auditoria:** toda remoção de relato, remoção de comentário por moderador/admin, banimento e desbanimento grava uma linha em `ModerationAction` (na mesma transação, quando existir). Para remoção de comentário por moderador (`CommentsService.delete` com `canModerate` e não dono), registre `COMMENT_REMOVED` com `reason` (aceite `reason` opcional na rota e use "Removido pela moderação" como padrão).

**Critérios de aceite T1:** teste que **falha antes e passa depois** reproduzindo `deleteReport` de relato com timeline + votos + comentários; moderador consegue remover; DTO de ban rejeita corpo inválido; não dá para banir admin; todas as ações geram `ModerationAction`.

### T2 — Avisar o autor (motivo + como contestar)

Novo `MailService.sendModerationNotice(email, name, kind, reason)` com `kind` em `REPORT_REMOVED | COMMENT_REMOVED | ACCOUNT_BANNED`. Texto em português, direto e sem juridiquês, dizendo: **o que foi feito**, **o motivo** (o `reason` do moderador), que as regras estão nas [Diretrizes da Comunidade](URL_DO_SITE/diretrizes) e que **dá para contestar respondendo para o e-mail de contato**. Use `APP_URL` do `ConfigService` para montar o link.

- Remoção de relato: avisa o `authorId` (se **não nulo**; relato anônimo não tem a quem avisar, apenas grave `notifiedAt = null`).
- Remoção de comentário: avisa o autor do comentário.
- Banimento: avisa o usuário banido. **Desbanimento** não envia e-mail.
- Preencha `ModerationAction.notifiedAt` quando o e-mail for enviado. Falha de e-mail **não** pode desfazer a moderação (fire-and-forget com log).
- Busque nome e e-mail do autor **antes** de apagar o relato/comentário.

**Critérios de aceite T2:** testes cobrindo: aviso enviado a autor identificado; **nenhum envio e nenhum erro** para relato anônimo; falha de envio não desfaz a remoção; `notifiedAt` preenchido só quando enviado.

### T3 — Sinalizar conteúdo (backend)

**Modelo:**
```prisma
enum FlagTargetType { REPORT COMMENT }

enum FlagReason {
  FALSE_INFO
  OFFENSIVE
  PERSONAL_DATA
  SEXUAL_OR_VIOLENT
  SPAM_OR_ADS
  FAKE_PROFILE
  COPYRIGHT
  OTHER
}

enum FlagStatus { OPEN ACTIONED DISMISSED }

model ContentFlag {
  id             String         @id @default(uuid())
  targetType     FlagTargetType
  targetId       String
  reason         FlagReason
  details        String?        @db.VarChar(500)
  status         FlagStatus     @default(OPEN)
  reporterId     String?
  reporter       User?          @relation("FlagReporter", fields: [reporterId], references: [id], onDelete: SetNull)
  resolvedById   String?
  resolvedAt     DateTime?
  resolutionNote String?        @db.VarChar(500)
  createdAt      DateTime       @default(now())

  @@unique([reporterId, targetType, targetId])
  @@index([status, createdAt])
  @@map("content_flags")
}
```
(inverso em `User`; `resolvedById` pode ser só string sem relação.)

**Módulo `moderation`** (`moderation.module.ts`, `controller`, `service`, `repository`, `dto/`):
- `POST /moderation/flags` — usuário autenticado e com e-mail verificado. Body: `targetType`, `targetId`, `reason`, `details?` (sanitize com DOMPurify como nos outros módulos). Valida que o alvo **existe**; **não deixa sinalizar o próprio conteúdo** (para relato anônimo isso não é checável, então apenas aceite). Sinalização repetida da mesma pessoa no mesmo alvo → `409` com mensagem amigável. `@Throttle` (ex.: 5 por minuto e 20 por hora). Swagger completo.
- `GET /admin/flags?status=OPEN&page=&limit=` — `MODERATOR`/`ADMIN`. Devolve a sinalização com **prévia do alvo** (título/descrição do relato ou texto do comentário, e link). **Nunca devolva `reporterId`/dados de quem sinalizou ao autor do conteúdo**; ao moderador pode mostrar.
- `PATCH /admin/flags/:id/resolve` — corpo `{ action: 'DISMISS' | 'REMOVE_CONTENT', note }`. `DISMISS` → `status = DISMISSED`. `REMOVE_CONTENT` → executa a remoção do alvo **reaproveitando o fluxo do T1/T2** (com `reason` = `note`), `status = ACTIONED`, e marca outras sinalizações abertas do mesmo alvo como `ACTIONED`.
- Em `UsersService.deleteAccount` (Fase 1): **zere `reporterId`** das sinalizações do usuário (já cobre `onDelete: SetNull`, mas inclua no teste).

**Critérios de aceite T3:** testes de serviço para criar (ok, alvo inexistente, duplicada, 400 de DTO), listar, descartar e remover; garantir que remover alvo pela sinalização gera `ModerationAction` e aviso.

### T4 — Botão "Sinalizar" e aba de moderação (frontend)

- **Botão "Sinalizar"** (use este rótulo, **não** "Denunciar") em `ReportDetail.tsx` e em cada comentário de `CommentsSection.tsx`. Só para usuário logado, **escondido no próprio conteúdo**. Abre um modal com: lista de motivos (rótulos em português, simples), campo "Conte o que aconteceu (opcional)" com contador de 500, e botões "Enviar" e "Cancelar". Após enviar, mostra confirmação curta: "Recebemos. A moderação vai analisar." Erro `409`: "Você já sinalizou isto." Use TanStack Query (`useFlagContent` em `apps/web/src/hooks/`), componentes e tokens do `theme`.
- **Aba "Sinalizações"** em `Admin.tsx` (visível para `MODERATOR`/`ADMIN`): lista de abertas com motivo, detalhes, prévia do conteúdo (com link), data; ações **"Descartar"** e **"Remover conteúdo"**, ambas com campo de observação obrigatório (10 a 500 caracteres).
- **Pedir o motivo** nas ações existentes do painel: ao **banir** (`UsersTab`) e ao **remover relato** (`ReportsTab`), abrir um pequeno modal pedindo o motivo (obrigatório), pois agora a API exige `reason`.
- Contador de sinalizações abertas ao lado do nome da aba, se simples de fazer.

**Critérios de aceite T4:** `npx tsc --noEmit -p apps/web` e `npm run build --workspace=apps/web` passam; fluxo manual: logado → sinaliza comentário de outra pessoa → aparece na aba → remover conteúdo → comentário some e autor recebe e-mail.

### T5 — Ajustar o texto das Diretrizes e dos Termos

Edite **somente** `apps/web/src/legal/diretrizes-da-comunidade.ts` e, se preciso, `termos-de-uso.ts`:
- Em "Como funciona a moderação": trocar "analisa conteúdos e denúncias" por "analisa conteúdos e sinalizações".
- Em "Como avisar sobre um problema" (seção `denunciar`, renomeie o `id` para `sinalizar` e o título para "Como sinalizar um problema"): explicar que há o botão **Sinalizar** em cada relato e comentário, e que **por e-mail continua valendo** para quem não tem conta ou para casos especiais.
- Mantenha o resto. **Não** altere `TERMS_VERSION`; informe no relatório que a versão deve ser reavaliada antes do lançamento.

## 4. Fora de escopo

- Registros de acesso e retenção automática: é o **Brief 2B**.
- Soft delete de relatos (ocultar sem apagar): fica como decisão futura. Nesta etapa, a remoção apaga de fato, com trilha de auditoria (`ModerationAction`) preservada.
- Fila de apelação dentro do app (por ora, contestação é por e-mail).

## 5. Verificação final (rodar e reportar)

```bash
npm run db:migrate --workspace=packages/database -- --name add_moderation_flags_and_actions
npm run build --workspace=packages/shared-types
npx tsc --noEmit -p apps/api
npx tsc --noEmit -p apps/web
npm run test --workspace=apps/api
npm run build --workspace=apps/api
npm run build --workspace=apps/web
```
Se `db:generate` falhar com EPERM (arquivo bloqueado por outro processo Node), pare o servidor de desenvolvimento e tente de novo. Se o Vite mostrar tela branca com erro de "export not found" de `@votz/shared-types`, apague `apps/web/node_modules/.vite` e reinicie o servidor.
