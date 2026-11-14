# Votz — Auditoria de segurança (14/11/2026)

> **Escopo:** API NestJS (`apps/api`), front React (`apps/web`), `render.yaml`, dependências. Referência de comparação: repositório `maskotCrmEdu` (somente leitura).
> **Como foi feito:** leitura de código, varredura de rotas por script, `npm audit`, e **três testes executados** (marcados com ✅). O que está marcado "por leitura" **não foi explorado contra uma instância rodando**.
> **Limites:** não é um pentest. Não li o `.env` real, não testei a infraestrutura de produção (que ainda não existe) e não revisei todo controller linha a linha. Auditei o fluxo de autenticação, as rotas mais sensíveis (pagamento, organizações, administração, upload) e a superfície pública.

## 1. Resumo e decisão

**Copiar e colar o maskot não é o caminho.** O código de segurança dele é bom, mas está acoplado ao produto (multi-tenant por escola, CLS, redação de log voltada a WhatsApp, sessões que dependem de eventos do `PrismaService`). O que vale levar são **os desenhos**, que resolvem exatamente as falhas mais graves do Votz:

| Desenho do maskot | Problema do Votz que ele resolve |
|---|---|
| Refresh token **opaco e aleatório**, guardado como SHA-256 numa tabela com `familyId`, com detecção de reuso | H3 (rotação ineficaz) |
| Claim `typ: 'access'` verificada em toda requisição; tokens de outros usos recusados | H1 (bypass de MFA) |
| Redação de log no logger e no Sentry, em vez de depender de disciplina | H4 (log vaza token) |
| Validação de segredos no boot, rotação com `_PREVIOUS` | M8 |
| Docs de incidente, rotação de segredos e teste de IDOR como método | Sem equivalente no Votz |

**O Votz tem uma base razoável, mas 4 falhas altas que precisam ser corrigidas antes de ir a produção**, e 3 delas eu confirmei na prática ou por leitura direta de código.

**Resultado:** 4 altas, 8 médias, 11 baixas. Detalhes abaixo.

## 2. O que já está bom

- Senhas com `bcrypt` custo 12; bloqueio de conta após 5 tentativas (15 min).
- CPF criptografado com AES-256-GCM e IV aleatório (`crypto.service.ts`).
- `ValidationPipe` global com `whitelist` + `forbidNonWhitelisted`.
- Helmet com CSP restrita na API; Swagger desligado em produção.
- Webhook do Stripe valida assinatura com o corpo bruto.
- Chaves da API pública guardadas como SHA-256, com limite por hora no Redis.
- Upload valida o tipo **pelo conteúdo do arquivo** (magic bytes), não pelo `mimetype` informado; documentos de verificação ficam privados.
- Todas as rotas que **alteram dados** têm guard, exceto as públicas esperadas (✅ varredura por script: cadastro, login, verificar e-mail, MFA, webhook).
- Perfil público de usuário expõe só campos seguros (sem e-mail nem telefone).
- Nenhum SQL injetável: o literal de vetor é montado de números e as buscas por texto usam parâmetros.
- `.env` não está versionado; MFA obrigatório para perfis privilegiados; exportação e exclusão LGPD existem.
- Relato anônimo não grava o autor (anonimato estrutural).

## 3. Achados

Legenda: ✅ = confirmado executando um teste · 📖 = confirmado por leitura de código.

### 🔴 ALTAS

**H1 — Token "pré-MFA" vale como sessão completa (bypass de MFA)** 📖
- `auth.service.ts` `login()` emite `mfa_pending` (5 min) e `mfa_setup_required` (30 min), assinados com o **mesmo `JWT_SECRET`** do token de acesso, com `sub` do usuário.
- `JwtStrategy.validate()` (`auth/strategies/jwt.strategy.ts`) só busca o usuário por `payload.sub` e **não confere `type`**. `JwtAuthGuard` é o `AuthGuard('jwt')` puro.
- Efeito: quem sabe a **senha** (sem o código de MFA) recebe o `mfaToken` e pode usá-lo como `Authorization: Bearer` em qualquer rota protegida por 5 minutos. O token `mfa_setup_required` serve 30 minutos, **inclusive para administradores que ainda não ativaram o MFA obrigatório**. O mesmo vale nos gateways (`notifications.gateway.ts`, `debates.gateway.ts`: `jwt.verify(token)` sem checar tipo).
- Correção: o token de acesso passa a ter `typ: 'access'` e o `JwtStrategy` o exige; os tokens temporários ficam com `typ` próprio e **segredo ou `aud` diferente**. Fixe também o algoritmo (`algorithms: ['HS256']`). Desenho de referência: `maskotCrmEdu/docs/SESSOES_E_TOKENS.md`.

**H2 — Qualquer usuário logado controla a cobrança de qualquer organização** 📖
- `subscricoes.controller.ts`: `POST /subscricoes/checkout` e `POST /subscricoes/portal` recebem `orgId`/`orgType` no corpo e **não verificam se o usuário pertence à organização**.
- Os IDs aparecem em URLs públicas de perfil. Com `portal`, qualquer conta abre o **portal de cobrança Stripe** de outra organização (cancelar assinatura, trocar cartão, ver faturas). Com `checkout`, o e-mail do atacante é gravado como cliente Stripe da organização que ainda não tem cliente (`getOrCreateCustomer`), e depois ele abre o portal.
- Correção: usar o `OrgPermissionGuard` já existente com uma permissão nova (ex.: `MANAGE_BILLING`) e **ler `orgId`/`orgType` do contexto autenticado**, não do corpo. Criar teste que tente com usuário de outra organização.

**H3 — Rotação do refresh token é ineficaz e há só 1 sessão por usuário** ✅
- `storeRefreshHash()` faz `bcrypt.hash(refreshToken)`. O bcrypt considera **só os primeiros 72 bytes**. Num JWT, isso é o cabeçalho mais o começo do payload (`sub`), igual para todos os tokens do mesmo usuário.
- ✅ Teste executado: dois refresh tokens diferentes do mesmo usuário passam na mesma verificação (`bcrypt.compare(t2, hash(t1)) => true`).
- Efeito: depois de um `refresh`, o token antigo **continua válido** (7 dias), então roubo não é detectado nem revogado pela rotação. Só `logout` zera o hash. Além disso, `User.refreshTokenHash` é um campo único: entrar em outro aparelho derruba o primeiro.
- Correção: token **aleatório opaco** (`randomBytes(64)`), guardado como SHA-256 numa tabela `RefreshToken` com `familyId`, `expiresAt`, `usedAt`; ao detectar **reuso** de um token já usado, revogar a família inteira. Desenho em `maskotCrmEdu` (`auth.service.ts`: `generateRefreshToken`, `familyId`).

**H4 — Os logs de produção gravam o refresh token e o código OAuth** ✅
- `app.module.ts` configura `pinoHttp` customizando **só** o serializer de `req`. O serializer padrão de `res` inclui os cabeçalhos da resposta.
- ✅ Teste executado com a mesma configuração: a linha de log traz `"set-cookie":"votz_refresh_token=eyJ...; HttpOnly; Secure"` e a URL `/auth/google/callback?code=...&state=...` completa.
- Efeito: quem tiver acesso aos logs (Render, qualquer agregador) consegue **sequestrar sessões por 7 dias**, e junto com H3 o token não é invalidado ao ser usado. Também contraria a Política de Privacidade ("não guardamos...").
- Correção: `redact` de `res.headers["set-cookie"]`, `req.headers.authorization` e `req.headers.cookie`; registrar a URL **sem query string**; redigir também no Sentry (`beforeSend`) quando for ligado. Referência: `maskotCrmEdu/backend/src/common/logger/log-redaction.ts` (motor genérico; trocar a lista de chaves).

### 🟠 MÉDIAS

**M1 — Pré-sequestro de conta via login com Google** 📖
`register` cria a conta com senha **sem exigir verificação de e-mail** para entrar. `googleLogin` faz `findFirst({ OR: [googleId, email] })` e, se achar conta sem `googleId`, **vincula e marca `emailVerified: true`**. Um atacante cadastra o e-mail da vítima com uma senha que ele conhece; quando a vítima entra pelo Google, a conta é unificada e **a senha do atacante continua valendo**. Correção: ao vincular uma conta não verificada, anular a senha e revogar sessões; ou recusar o vínculo automático.

**M2 — Edição/exclusão de role de outra organização (BOLA) e DTO sem validação** 📖
`PATCH/DELETE /org-memberships/roles/:id`: o guard confere o `orgType/orgId` que vêm **no corpo**, mas `updateRole`/`deleteRole` operam pelo `:id` da URL e **não conferem se a role pertence àquela organização** (precisa conhecer o UUID da role). O `PATCH` usa `Partial<CreateRoleDto>` (tipo do TypeScript, sem decoradores): o `ValidationPipe` **não valida o corpo**. `CreateRoleDto` ainda aceita `isDefault` do cliente. `updateMemberRole` também não confere que a role é da mesma organização (o `invite` confere).

**M3 — Dependências com vulnerabilidades** ✅ (`npm audit --omit=dev`)
44 no total: **3 críticas, 21 altas**. Destaques: `dompurify` (é o nosso sanitizador de texto), `nodemailer`, `axios`, `multer`/`body-parser` (via `@nestjs/platform-express`), `socket.io-parser`/`engine.io`/`ws`, `zod`, `maplibre-gl` (crítica, no front), `proxy-addr` e `tar` (transitivas). Parte exige atualização de versão maior do Nest. Triagem e plano: brief 3B. Não é possível dizer pelo audit quais são exploráveis no Votz.

**M4 — O site (front) não envia nenhum cabeçalho de segurança** 📖
O `render.yaml` do `votz-web` define só `Cache-Control`. Faltam CSP, `frame-ancestors`/`X-Frame-Options` (clickjacking), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS. O Helmet atual só protege a API.

**M5 — Token de acesso na URL do callback do Google** 📖
`auth.controller.ts` `googleCallback` redireciona para `${APP_URL}/auth/google/callback?token=<access token>`. A URL fica em histórico, logs do host estático e `Referer`. O cookie de refresh já é definido; o front pode chamar `/auth/refresh` e dispensar o `token` na URL.

**M6 — Injeção de HTML no popup do mapa e nos e-mails** 📖
- `MapView.tsx` monta uma string HTML com `props.title` (texto do usuário) e a passa a `setHTML`. Hoje o DOMPurify do backend limita o estrago, mas ele **permite tags como `<a>` e `<form>`** (phishing dentro do app) e depende de a dependência estar saudável (veja M3).
- `mail.service.ts` interpola `name`, `orgName` e `roleName` sem escape. O convite de equipe vai para **terceiros** a partir do nosso remetente: um nome de role com HTML vira vetor de phishing.

**M7 — Autorização é opt-in por rota** 📖
Só o `ThrottlerGuard` é global. Hoje a varredura não achou rota que altera dados sem guard, mas **qualquer rota nova esquecida nasce pública**. O decorator `@Public()` e a checagem `IS_PUBLIC_KEY` já existem no `JwtAuthGuard`: basta tornar o guard global e marcar as rotas públicas.

**M8 — Segredos: sem validação, sem rotação, MFA em texto puro** 📖
- Nenhuma validação de tamanho/entropia do `JWT_SECRET`, `JWT_REFRESH_SECRET` e `CPF_ENCRYPTION_KEY` no boot (chave de 32 bytes só falha no primeiro uso).
- O texto cifrado do CPF não tem versão/prefixo: **trocar a chave é impossível** sem migração manual. Maskot usa o prefixo `v2:` e documenta a rotação (`docs/CRIPTOGRAFIA_DADOS_SENSIVEIS.md`, `docs/ROTACAO_SEGREDOS.md`).
- `User.mfaSecret` está **em texto puro** no banco (CPF está cifrado, o segredo TOTP não).

### 🟡 BAIXAS

| # | Achado | Observação |
|---|---|---|
| L1 | MFA sem contador de tentativas por usuário | Só o limite por IP protege o código de 6 dígitos |
| L2 | Enumeração de contas | Cadastro devolve "Email already registered"; login sai cedo para e-mail inexistente (diferença de tempo). Maskot usa `DUMMY_BCRYPT_HASH` |
| L3 | `ThrottlerModule` em memória | Sem `storage` Redis, os limites não são compartilhados entre instâncias (o `CLAUDE.md` pede Redis) |
| L4 | CSRF nos endpoints de cookie | `/auth/refresh` e `/auth/logout` dependem só do cookie `SameSite=None`. Atacante não lê a resposta, mas força logout/rotação. Com domínio próprio dá para usar `Lax`; enquanto isso, exigir `Origin` igual ao `FRONTEND_URL` |
| L5 | Upload em memória até 100 MB | `report-media` usa buffer em RAM; o limite de tamanho por tipo só é aplicado depois |
| L6 | Sem CI, Dependabot ou CodeQL | Não existe `.github/` no Votz |
| L7 | Webhook do Stripe sem idempotência de evento | `sub.metadata` indefinido gera `TypeError` (500); `console.warn` de cliente |
| L8 | Limite da API pública "fail-open" | Se o Redis cair, a chave deixa de ser limitada |
| L9 | JWT sem algoritmo fixado | Ver H1 |
| L10 | WebSocket não revalida usuário banido | O token é verificado só na conexão |
| L11 | `isDefault` aceito no `CreateRoleDto` | Ver M2 |

## 4. Maskot × Votz: o que portar

| Item do maskot | Aplica ao Votz? | Como |
|---|---|---|
| Sessão = família de refresh tokens opacos + `typ`/`sid` + `sessionsValidAfter` + `logout-all` | **Sim, prioridade 1** | Reimplementar enxuto (tabela `RefreshToken`, claim `typ`). Sem o cache e os eventos do maskot |
| `log-redaction.ts` | **Sim** | Reaproveitar o motor; **trocar** as listas de chaves (WhatsApp/telefone) pelas do Votz |
| `csp.ts` / cabeçalhos | **Adaptar** | Votz já tem Helmet; falta o site estático (M4) |
| `jwt-secrets.ts` (rotação `_PREVIOUS`) | **Parcial** | Levar só a validação de boot; a rotação com `_PREVIOUS` é opcional |
| `field-encryption.ts` (prefixo `v2:`, rotação) | **Adaptar** | Para CPF e `mfaSecret` |
| `TESTE_IDOR.md` + varredura e2e de IDOR | **Sim (método)** | Teste que percorre cada rota com usuário de outra organização; teria pegado H2 e M2 |
| `INCIDENTES_SEGURANCA.md`, `MONITORAMENTO_SEGURANCA.md` | **Sim (como modelo)** | O Votz precisa de um plano de incidente (LGPD art. 48), citado na Política de Privacidade |
| `RETENCAO_USUARIOS_E_SESSOES.md`, `EXCLUSAO_LGPD.md`, `EXPORTACAO_TITULAR.md` | Comparar | Já cobertos nas fases 1 e 2B |
| Isolamento por tenant (RLS) | **Não** | Votz não é multi-tenant; o equivalente é a checagem de pertencimento à organização |
| `safe-http.ts`/`url-safety.ts` (SSRF) | **Ainda não** | O Votz não busca URLs informadas pelo usuário; reavaliar se isso mudar |
| `access-log` com GeoIP | **Não** | O Votz guarda o mínimo de propósito (anonimato e LGPD) |
| Antivírus em upload (`ANTIVIRUS_UPLOADS.md`) | **Depois** | Votz já valida por magic bytes; considerar com o R2 em produção |

## 5. Ordem recomendada

1. **Agora (antes de produção):** H1, H2, H3, H4, M1, M2. → `fase-3a-brief-correcoes-criticas.md`
2. **Em seguida:** M3 a M8 e as baixas mais baratas. → `fase-3b-brief-endurecimento.md`
3. **Processo:** plano de incidente (modelo maskot), CI com `npm audit`, e um teste de IDOR automatizado.

> ⚠️ **Conflito com o Gemini:** os briefs 2B e 2C estão em execução e alteram `auth.service.ts`, `users.service.ts` e `schema.prisma`. **Execute os briefs de segurança só depois que 2B e 2C terminarem**, para não gerar conflito de migration.
