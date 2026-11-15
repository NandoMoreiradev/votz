# Votz — Brief 3D: correções encontradas no teste ponta a ponta

> **Para quem vai executar (Gemini):** este brief é autocontido. Leia tudo antes de começar. **Não faça commit** (o dono do projeto commita). Ao terminar, devolva: arquivos alterados, comandos rodados e resultado dos testes. Regras do projeto no `CLAUDE.md` da raiz (NestJS + Prisma, DTO com `class-validator`, Swagger, **teste unitário Jest para todo Service alterado**, Styled Components com `theme` sem cor hexadecimal nova, arquivos em kebab-case, banco em snake_case).
>
> **Leia antes:** `docs/security/relatorio-teste-ponta-a-ponta-2026-11-15.md` (achados B-1 a B-10, com evidências) e `docs/security/README.md`.
>
> **Ambiente:** PostgreSQL, Redis e MinIO rodam no Docker. O Docker Desktop fica em `E:\Dev\Docker` e **não inicia sozinho**: se precisar dele, rode `Start-Process "E:\Dev\Docker\Docker Desktop.exe"`, espere o engine responder e depois `docker compose up -d`. Se não conseguir subi-lo, diga isso no relatório e entregue os testes que não dependem de banco real.
>
> **Ordem:** T1 → T2 → T3 → T4 → T5 → T6. **T1 é o mais importante** (sem ele entidades e políticos não conseguem responder a relatos).

---

## T1 — Autorizar o que a instituição faz pelo CONTEXTO ATIVO (B-1 e B-6)

### O problema (provado por experimento)
Quem tem perfil de entidade ou político aprovado pelo fluxo de cadastro **continua com `User.type = CITIZEN`**. O papel institucional vive no **contexto ativo** do token (`ctx`, definido na troca de perfil com MFA) e na associação `OrgMembership`. Mas vários serviços ainda decidem pelo tipo legado `user.type`:

| Arquivo | Onde | Efeito hoje |
|---|---|---|
| `reports/reports.service.ts` | `updateStatus` (~linhas 150 a 215) | **403** "Não autorizado" ao mudar o status (em andamento, resolvido) |
| `reports/reports.service.ts` | `follow`, `unfollow`, `getFollowStatus` (~linhas 303 a 355) | Não conseguem acompanhar relatos |
| `propostas/propostas.service.ts` | `create` (~linha 14) e `updateStatus` (~linha 75) | **"Apenas políticos podem criar propostas"**, mesmo no plano pago |
| `comments/comments.service.ts` | comentário de voz (~linhas 43 a 62) | Idem; além disso usa a **primeira** associação ativa do tipo, não a organização escolhida |
| `entities/entities.service.ts` e `politicians/politicians.service.ts` | `advocate` | Autoriza só por associação, **sem exigir o contexto com MFA** (o MFA vira decorativo) |

**Prova do experimento:** a mesma conta, com o mesmo token de contexto correto, recebe 403 com `type = CITIZEN` e 200 com `type = ENTITY`.

Os finders `findEntityByUserId` e `findPoliticianByUserId` (`reports.repository.ts` e `debates.repository.ts`) usam `findFirst`: se a pessoa pertence a **duas** entidades, o sistema escolhe uma por conta própria, não a que ela selecionou. Isso também precisa acabar.

### O que construir
1. **Um resolvedor único** (ex.: `apps/api/src/auth/acting-org.ts` com uma função `requireActingOrg(user, orgType, permission)`), usado por todos os pontos acima:
   - Exige que `user.ctx` exista e que `ctx.type === orgType` (`'ENTITY'` ou `'POLITICIAN'` ou `'COMPANY'`). Senão, **403** com a mensagem: `"Troque para o perfil de entidade/político (com verificação em duas etapas) para realizar esta ação."`
   - **Rechecar no banco** que a `OrgMembership` do usuário nessa organização continua `ACTIVE` (o token vive 15 min; quem foi removido da equipe não pode continuar agindo).
   - Exigir a **permissão** pedida (`ctx.permissions` e/ou a role da associação): `RESPOND_REPORTS` para status, acompanhar e avocar; `MANAGE_PROFILE` para criar e alterar propostas.
   - Devolve `{ orgType, orgId, permissions }`, e **o `orgId` vem de `ctx.id`**, nunca de `findFirst`.
2. **Trocar todas as checagens por `user.type`** pelos itens acima. Rode `grep -rnE "UserType\.(ENTITY|POLITICIAN|COMPANY)|user\.type|userType" apps/api/src --include=*.ts` (ignorando `spec`) e trate **todo** ponto que decide acesso institucional; liste no relatório o que encontrou e o que mudou. Os `Roles(...)` de `MODERATOR`/`ADMIN` **não** mudam.
3. **Moderador e admin continuam podendo** mudar status de qualquer relato (`isModAdmin`), sem contexto.
4. **Sem fallback para o tipo antigo.** Contas que hoje têm `type = ENTITY/POLITICIAN` (dados de seed) só agem se tiverem `OrgMembership` e trocarem de contexto. Confira o `packages/database/prisma/seed.ts`: os usuários de seed institucionais precisam ter associação; ajuste o seed se faltar.
5. **Front:** onde a tela mostra ações institucionais (formulário de resposta/status no relato, "Criar proposta", acompanhar), mostrar **somente** quando o perfil ativo (`activeContext`) for da organização certa; caso contrário, um aviso curto: "Para responder como [nome da organização], troque de perfil" com botão que abre a troca de perfil. Procure em `ReportDetail.tsx`, `PoliticianProfile.tsx`, `EntityProfile.tsx`, `CreateProposta.tsx` e `PropostaDetail.tsx`.

### Aceite
- **Teste de jornada completa** (HTTP, sem simular o `type`): cadastra usuário → cria solicitação de entidade → moderador aprova → o dono ativa MFA → troca de contexto com código → **muda o status do relato e recebe 200**. Repita para político: cria proposta (no plano `MANDATOMETRO_PRO`), muda o status da proposta, acompanha um relato. Pode ser um spec com `Test.createTestingModule` e Prisma real do Docker, ou, se o Docker não subir, com Prisma simulado que reproduza **`User.type = CITIZEN`** (o ponto central é **não** forçar o tipo).
- Sem contexto ativo (token de cidadão, mesmo sendo membro) → 403 em status, propostas, acompanhar e **avocar**.
- Contexto de **outra** organização → 403 (entidade A não age em relato destinado à B, nem muda o status do relato da B).
- Membro removido da equipe (associação não ativa) com token ainda válido → 403.
- Membro sem a permissão (`AGENT` tentando criar proposta) → 403; `AGENT` consegue mudar status; `VIEWER` não.
- Usuário em **duas** entidades age na que está no contexto, não na primeira.
- Moderador e admin continuam mudando status (200).
- **Se conseguir subir o Docker e a API**, rode `node docs/security/qa-scripts/01-setup.mjs`, depois `02-orgs.mjs`, `03-reports-contexts.mjs` e `05-plans.mjs` (veja `docs/security/qa-scripts` e a seção 4 do relatório) e informe: os resultados "ENTIDADE: atualizar status do relato", "POLÍTICO: atualizar status do relato" e "criar proposta" devem passar. Depois rode `09-cleanup.mjs`.

## T2 — Menu de navegação no celular (B-3)

`apps/web/src/components/layout/Navbar.tsx` não tem nenhuma `@media` nem menu colapsável. Em 375 px só aparecem "Explorar" e "Entidades": **"+ Relatar", "Entrar" e o menu do usuário ficam fora da tela**.

- Abaixo de `theme.breakpoints.md` (768 px): mostrar a marca, o botão **"+ Relatar"** (ou **"Entrar"** para visitante), o sino de notificações e um botão de menu (hambúrguer) que abre um painel com os links (Explorar, Entidades, Políticos, Mapa, Imprensa, Planos, Admin quando houver) e as opções do usuário (Meu perfil, Trocar perfil, Minhas solicitações, Sair).
- Acessível: o botão do menu com `aria-expanded` e `aria-label`; fecha com `Esc`, ao clicar fora e ao navegar; foco volta ao botão.
- Sem cor hexadecimal nova; use o `theme`.
- Verifique em 375, 768 e 1280 px; a barra desktop **não pode mudar**.

**Aceite:** captura de tela (ou descrição objetiva) nos três tamanhos; nenhum link do menu desktop perdido no celular; sem rolagem horizontal da página em 375 px.

## T3 — Chave de API: o cliente não escolhe o nível (B-2)

`public-api/dto/create-api-key.dto.ts` aceita `tier?: ApiKeyTier`, e `ApiKeysService` usa `dto.tier ?? FREE`. Qualquer usuário criou uma chave `PAID` (10.000 req/h; o grátis tem 1.000).

- Remover `tier` do DTO. O serviço **sempre** cria `FREE`. Com `forbidNonWhitelisted`, enviar `tier` passa a dar 400.
- Como o nível pago será concedido: por enquanto, **só por admin**. Crie `PATCH /admin/api-keys/:id/tier` (`@Roles(UserType.ADMIN)`, DTO com `@IsEnum(ApiKeyTier)` e motivo de 10 a 500 caracteres) que grava a mudança também em `ModerationAction` (adicione `API_KEY_TIER_CHANGED` ao enum, migration).
- Atualizar a documentação Swagger e o front de chaves, se ele enviar `tier`.

**Aceite:** `POST /api-keys` com `tier: "PAID"` → 400; sem `tier` → chave `FREE`; admin muda o nível e fica auditado; moderador → 403; teste na matriz `role-matrix.spec.ts` para a nova rota.

## T4 — Solicitação de cadastro com observação (B-4)

`CreateRegistrationRequestDto` aceita `note` (até 500 caracteres) e os formulários `RequestRegistration.tsx` e `ClaimProfile.tsx` o enviam quando preenchido, mas o modelo `RegistrationRequest` **não tem a coluna**: o `registrationRequest.create` do Prisma falha e a API devolve **500**.

- Adicionar `note String? @db.VarChar(500)` ao modelo (migration aditiva) e passar a gravar `note` sanitizado com DOMPurify no `create`.
- Mostrar a observação para quem revisa: aba "Solicitações" do `Admin.tsx` e `MyRequests.tsx` (do solicitante).
- Incluir `note` na **exportação LGPD** (`lgpd.processor.ts`) e confirmar que a **exclusão de conta** continua passando.

**Aceite:** solicitação **com** `note` → 201 e a observação aparece no painel; **sem** `note` continua funcionando; teste do serviço e do repositório; a exportação LGPD traz o campo.

## T5 — MFA obrigatório para moderador (B-5)

`auth.service.ts` define `MFA_REQUIRED_TYPES = ['ADMIN']`. O moderador bane, remove relatos, aprova cadastros e lê documentos de verificação, e entra só com senha.

- Incluir `'MODERATOR'` na lista. O fluxo existente (`requiresMfaSetup` + `mfa/setup/forced` + `mfa/enable/forced`) já cobre o resto.
- Garantir que o front trata `requiresMfaSetup` para moderador exatamente como para admin.
- Atualizar o comentário acima da constante (que hoje diz "apenas ADMIN").

**Aceite:** login de moderador sem MFA devolve `requiresMfaSetup`; com MFA ativo exige o código; o token de setup **não** abre rotas de moderação (teste, como no 3A); testes atuais do `auth.service.spec.ts` ajustados.

## T6 — Erros do Prisma não podem despejar dados pessoais no log (B-10)

Quando o Prisma falha, a mensagem do erro inclui **todos os argumentos da consulta** (nome, CNPJ, IDs; num erro de cadastro, e-mail, telefone, endereço e o hash da senha). Esse texto vai para o log. Foi visto no teste.

- Em `common/logger/pino-config.ts`, adicionar um serializer de `err` que, para erros do Prisma (`PrismaClientKnownRequestError`, `PrismaClientValidationError`, `PrismaClientUnknownRequestError`, `PrismaClientInitializationError`), registre **só**: `type`, `name`, `code`, `meta.target`/`meta.field_name` e a **primeira linha** da mensagem (corte tudo a partir da primeira quebra de linha) e **omita o `stack`** quando ele repetir a mensagem completa.
- Garanta que a resposta ao cliente **não muda** (continua 500 genérico ou o mapeamento atual).

**Aceite (teste):** forçar um `PrismaClientValidationError` cuja mensagem contenha `SEGREDO_NO_LOG` e `senha-hash-x`; capturar a linha de log; **falhar** se alguma das duas strings aparecer. Os testes do `pino-config.spec.ts` existentes continuam passando.

---

## Verificação final (rodar e reportar)

```bash
npm run db:migrate --workspace=packages/database -- --name e2e_fixes_note_and_api_tier
npm run build --workspace=packages/shared-types
npx tsc --noEmit -p apps/api
npx tsc --noEmit -p apps/web
npm run test --workspace=apps/api
npm run build --workspace=apps/api
npm run build --workspace=apps/web
```
Se a migration falhar por o Docker estar fora do ar, **inicie o Docker primeiro** (veja o topo). Se o Vite mostrar tela branca com "export not found" de `@votz/shared-types`, apague `apps/web/node_modules/.vite` e reinicie.

**No relatório, diga explicitamente:** (1) a lista de pontos com checagem por `user.type` que você encontrou e o que fez em cada um; (2) o resultado do teste de jornada completa da T1 (e, se rodou, dos scripts `qa-scripts`); (3) como testou o menu mobile nos três tamanhos; (4) a prova do teste da T6.

## Fora de escopo (decisões separadas, não implemente)
- **Planos e preços** (limite de membros por plano, quais funcionalidades cada plano libera, o que sai da página): é decisão estratégica do dono do produto, em andamento.
- **Limite de requisições por IP** (B-9): será tratado depois, junto com a análise de tráfego.
- Página 404, marca nova na tela de login, fuso das datas e demais itens de acabamento.
