# Votz — Brief 2B: registros de acesso e retenção automática de dados

> **Para quem vai executar (Gemini):** este brief é autocontido. Leia tudo antes de começar. **Não faça commit.** Ao terminar, devolva: arquivos alterados, comandos rodados e resultado dos testes. Regras do projeto no `CLAUDE.md` da raiz (NestJS + Prisma, DTO com `class-validator`, Swagger, **teste unitário Jest para todo Service novo/alterado**, arquivos em kebab-case, banco em snake_case, jobs assíncronos sempre via BullMQ).
>
> **Leia antes:** `docs/legal/fase-1-brief-correcoes-de-produto.md` (contexto) e `apps/web/src/legal/politica-de-privacidade.ts` (seção "Por quanto tempo guardamos": é a promessa pública que este brief precisa cumprir).

## 1. Por que isso existe

A Política de Privacidade já publicada promete três coisas que o código **ainda não faz**:

| Promessa no texto | Situação |
|---|---|
| Registros de acesso (data, hora, IP) guardados por **6 meses** | Não existe registro nenhum |
| Documentos de verificação apagados: **30 dias** se recusados, **12 meses** se aprovados | Ficam no R2 para sempre |
| Conta sem acesso por **24 meses** pode ser anonimizada, com aviso por e-mail antes | Não existe |

Este brief implementa as três.

## 2. Fatos do código que você precisa saber

- **Relato anônimo NÃO guarda o autor.** Em `apps/api/src/reports/reports.service.ts` (~linha 53) e `reports.repository.ts` (~linha 95), `authorId` é gravado como `null` quando `anonymous = true` (e o evento CREATED da linha do tempo também). Essa é a garantia de anonimato que o texto legal descreve. **Nada que você criar pode permitir ligar um usuário a um relato anônimo** (ver T1, regra de ouro).
- `main.ts` já faz `trust proxy = 1` (Render), então `req.ip` é o IP real do cliente.
- Padrão de job agendado do projeto: `apps/api/src/mandate-expiry/` (`*.cron.ts` com `@Cron` do `@nestjs/schedule` → `service.enqueue()` → fila BullMQ → `*.processor.ts`). **Siga esse padrão.**
- Exclusão de conta: `UsersService.deleteAccount` (`apps/api/src/users/users.service.ts`) já trata todas as relações do usuário e limpa o R2 depois do commit. Será reaproveitada (T3).
- `StorageService` (`apps/api/src/storage/storage.service.ts`) tem `delete(key)` e `extractKeyFromUrl(url)`.
- `RegistrationRequest` (`packages/database/prisma/schema.prisma`) tem `status` (`PENDING | APPROVED | REJECTED`), `updatedAt` e `payload` (JSON). Os arquivos ficam em `payload.documents` (mapa nome → chave R2 começando com `verification/`).
- `User` tem `lastLoginAt`, `createdAt`, `type`, `banned`, e vínculos em `OrgMembership`.

## 3. Tarefas

Ordem: **T1 → T2 → T3**. Migrations aditivas (novas colunas anuláveis / novas tabelas). Rode `npm run db:migrate` e `npm run db:generate` ao alterar o schema.

### T1 — Registros de acesso (Marco Civil, art. 15) com retenção de 6 meses

**Modelo** (`schema.prisma`):
```prisma
enum AccessEvent {
  REGISTER
  LOGIN
  GOOGLE_LOGIN
  MFA_LOGIN
  TOKEN_REFRESH
}

model AccessLog {
  id        String      @id @default(uuid())
  userId    String?     // SEM relação/FK: o log precisa sobreviver à exclusão da conta (obrigação legal)
  event     AccessEvent
  ip        String
  createdAt DateTime    @default(now())

  @@index([createdAt])
  @@index([userId])
  @@map("access_logs")
}
```
Sem `userAgent`, sem caminho, sem corpo da requisição: **só o mínimo legal** (quem, quando, de qual IP, qual evento).

**Serviço:** `AccessLogService.record(userId, event, ip)` em módulo próprio (`apps/api/src/access-log/`). Deve ser **fire-and-forget**: nunca lançar erro nem atrasar login (`.catch(() => null)` com `Logger.warn`).

**Onde registrar (apenas eventos de autenticação):** register, login (sem MFA e MFA concluído), login com Google, refresh de token. Pegue o IP com `@Ip()`/`req.ip` no `auth.controller.ts` e passe ao serviço.

> **REGRA DE OURO (anonimato):** **não** registre log em criação de relato, comentário, apoio, nem em nenhuma rota de conteúdo. Se registrássemos `userId + horário` na criação de um relato, daria para cruzar com o horário de um relato anônimo e **quebrar o anonimato**. O log fica restrito ao **início de sessão**.

**Retenção:** job diário (padrão do `mandate-expiry`, `@Cron('30 3 * * *')`) que apaga `AccessLog` com `createdAt` anterior a **6 meses** (`new Date()` menos 6 meses).

**Sem endpoint público/admin para ler os logs.** Eles são consultados só diretamente no banco, mediante ordem judicial. (Se quiser facilitar, deixe um comentário no serviço dizendo isso.)

**Em `UsersService.deleteAccount`:** **não apague** `AccessLog` (guarda legal). Adicione um comentário explicando.

**Exportação LGPD** (`lgpd.processor.ts`): inclua a seção `accessLogs` com os registros do titular (`userId`), campos `event`, `ip`, `createdAt`.

**Critérios de aceite T1**
- Login, registro, login Google e refresh geram 1 registro cada; erro no log não derruba o login (teste).
- **Nenhuma** rota de conteúdo grava `AccessLog` (teste/grep: `AccessLogService` só é injetado em `auth`).
- Job apaga registros com mais de 6 meses e preserva os recentes (teste com datas).
- `deleteAccount` preserva os logs do usuário (teste).

### T2 — Retenção dos documentos de verificação

Job diário (`@Cron('0 4 * * *')`, fila BullMQ própria, padrão `mandate-expiry`):
- Seleciona `RegistrationRequest` com `status = REJECTED` e `updatedAt` anterior a **30 dias**, **ou** `status = APPROVED` e `updatedAt` anterior a **12 meses**.
- Para cada uma, apaga no R2 todas as chaves em `payload.documents` que começam com `verification/` e **remove a chave `documents` do `payload`** (mantenha o resto do payload) adicionando `documentsPurgedAt` (ISO). A solicitação em si **permanece** (histórico).
- Deve ser **idempotente** (rodar duas vezes não quebra; ignora quem já não tem `documents`) e processar em lotes (ex.: 100 por rodada).
- Falha ao apagar um arquivo no R2 não pode impedir os demais; só limpe o payload dos arquivos efetivamente apagados.

**Critérios de aceite T2:** teste cobrindo recusada >30d (limpa), recusada <30d (mantém), aprovada >12m (limpa), aprovada <12m (mantém), pendente (nunca limpa), e reexecução idempotente.

### T3 — Anonimização de contas inativas (24 meses), com aviso por e-mail

**Schema:** em `User`, novo campo `inactivityNoticeSentAt DateTime?`.

**Refatoração necessária primeiro:** extraia a lógica de exclusão de dados do usuário (a transação + limpeza do R2 de `deleteAccount`) para um método reutilizável, por exemplo `UsersService.eraseUserData(userId)` (ou um `UserErasureService`). `deleteAccount` passa a chamá-lo depois de validar senha/e-mail. **Comportamento e testes atuais de `deleteAccount` não podem mudar.**

**Job diário** (`@Cron('0 5 * * *')`, fila BullMQ):
1. **Aviso:** usuários com `type = CITIZEN`, sem `OrgMembership` ativa, `banned = false`, cuja última atividade (`lastLoginAt`, ou `createdAt` se nunca entrou) seja anterior a **24 meses** e `inactivityNoticeSentAt` nulo → envia e-mail (novo método `MailService.sendInactivityNotice(email, name)`: tom direto, diz que a conta será anonimizada em 30 dias se a pessoa não entrar, e como entrar) e grava `inactivityNoticeSentAt = now`.
2. **Anonimização:** usuários com `inactivityNoticeSentAt` anterior a **30 dias** e que **continuam sem login depois do aviso** (`lastLoginAt` nulo ou anterior a `inactivityNoticeSentAt`) → `eraseUserData`. Mesmo efeito do encerramento de conta (relatos ficam sem nome; comentários, apoios, etc. apagados).
3. **Reset:** sempre que a pessoa entrar (login, login Google, refresh), zere `inactivityNoticeSentAt = null` (ajuste nos pontos de `lastLoginAt` do `auth.service.ts`).
4. Nunca processe `ADMIN`, `MODERATOR`, contas com perfil de entidade/político ou contas banidas. Processe em lotes e seja idempotente.

**Critérios de aceite T3:** testes para: aviso enviado uma única vez; conta que voltou a entrar após o aviso **não** é apagada e tem o aviso zerado; conta que não voltou é apagada após 30 dias; admin/moderador/org-membro/banido ignorados; `deleteAccount` continua passando em todos os testes existentes.

## 4. Fora de escopo

- Regra de ciclo de vida do R2 para `exports/` (7 dias): é configuração manual no painel do Cloudflare, não código. Liste no seu relatório como ação humana pendente.
- Retenção de backup do Neon (30 dias): conferir no painel, ação humana.
- Qualquer mudança nos textos legais.
- Botão de sinalizar/denunciar e avisos de moderação: é o **Brief 2C**.

## 5. Verificação final (rodar e reportar)

```bash
npm run db:migrate --workspace=packages/database -- --name add_access_log_and_inactivity_notice
npm run build --workspace=packages/shared-types
npx tsc --noEmit -p apps/api
npm run test --workspace=apps/api
npm run build --workspace=apps/api
```
Se `db:generate` falhar com EPERM (arquivo bloqueado por outro processo Node), pare o servidor de desenvolvimento e tente de novo.
