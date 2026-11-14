# Votz — Brief da Fase 1: correções de produto para conformidade legal (LGPD)

> **Para quem vai executar (Gemini):** este documento é autocontido. Ele traz o contexto, a investigação já feita no código e as tarefas da Fase 1 com critérios de aceite. Leia tudo antes de começar. **Não faça commit.** Ao terminar, devolva a lista de arquivos alterados, os comandos que rodou e o resultado dos testes.
>
> **Regras do projeto** (resumo do `CLAUDE.md` da raiz, leia o arquivo completo): NestJS + Prisma (nunca `$queryRaw` com input do usuário), DTOs com `class-validator`, endpoints documentados com Swagger, teste unitário (Jest) para todo Service alterado, arquivos em kebab-case, banco em snake_case, Styled Components usando o `theme` de `apps/web/src/theme` (sem cor hexadecimal nova), TanStack Query para chamadas no front (sem axios/fetch direto em componente). Tom de voz dos textos: direto, justo, firme, sem juridiquês, legível para quem tem ensino médio incompleto.

---

## 1. Contexto

O **Votz** é uma plataforma de accountability cívico: cidadãos publicam *relatos* sobre problemas públicos/privados, que apontam para entidades públicas, políticos e empresas. Há apoios, comentários (texto e **áudio**), debates ao vivo, mapa, API pública e planos pagos (Stripe) para entidades, políticos e empresas.

O produto trata dado pessoal sensível-adjacente (CPF, telefone, endereço completo, geolocalização, voz, documentos de verificação) e expõe pessoas e organizações por nome. Antes de abrir ao público vamos publicar Termos de Uso, Política de Privacidade, Política de Cookies e Diretrizes da Comunidade (**Fase 2, feita por outra pessoa/sessão, não por você**). A **Fase 1** corrige o produto para que esses documentos sejam verdadeiros.

### Dados do controlador (para uso nos textos e nas telas)
- **Razão social / nome:** Votz do Brasil
- **CNPJ:** 55.188.948/0001-04
- **Contato (encarregado/DPO e suporte, provisório):** fernandomoreira.dev@gmail.com
- **Idade mínima:** 18 anos
- **Foro:** Aracaju/SE

### O que NÃO é escopo da Fase 1
- Redigir o conteúdo jurídico dos documentos (Fase 2). Aqui só criamos **páginas provisórias** (ver T6).
- Analytics, banner de cookies, novos rastreadores. **Não adicione nenhum.**
- Mudar regras de planos/pagamentos.
- Tocar em arquivos sem relação com as tarefas abaixo (há outros trabalhos em andamento no repositório).

---

## 2. Resumo da investigação (o que já sabemos)

### 2.1 Dados pessoais tratados (modelo `User` e relacionados)
Arquivo: `packages/database/prisma/schema.prisma` (modelo `User`, ~linha 226).
- Identificação: `name`, `email`, `phone` (E.164), `cpf` (AES-256 em camada de app), `avatarUrl`, `bio`.
- Endereço: CEP, rua, número, complemento, bairro, cidade, UF, `latitude`, `longitude`.
- Segurança: `password` (bcrypt 12), `googleId`, `mfaSecret`, `mfaBackupCodes`, `refreshTokenHash`, `failedLoginAttempts`, `lockedUntil`, `lastLoginAt`.
- Conteúdo: relatos (`Report`, com `media` no Cloudflare R2), comentários (`Comment`, inclusive voz: `mediaUrl`, `mediaKey`, `transcript`), votos/apoios, mensagens/perguntas/votos de enquete em debates, votos em propostas, seguidores de políticos.
- Documentos de verificação de entidades/políticos/empresas: `RegistrationRequest.payload.documents` (chaves `verification/…` no R2).
- Políticos também têm `cpf` (criptografado) em `Politician`.
- **Não existe hoje nenhum campo de consentimento, versão de termos ou confirmação de idade.**

### 2.2 Cookies e armazenamento no navegador
- Único cookie: `votz_refresh_token` (httpOnly, 7 dias, `secure`, `sameSite=none` em produção) — `apps/api/src/auth/auth.controller.ts` (linhas ~27–38). É **funcional/estritamente necessário**.
- Access token em memória; estado do app (Zustand) em `localStorage`.
- **Não há** analytics, pixel, Sentry no código (Sentry só aparece no `.env.example`).
- **Vazamento de IP para o Google:** `apps/web/src/theme/GlobalStyle.ts` linha 5 usa `@import url('https://fonts.googleapis.com/…')`. Isso envia o IP de todo visitante ao Google. (→ T5)

### 2.3 Terceiros que recebem dados (suboperadores)
| Terceiro | Para quê | Onde no código |
|---|---|---|
| Render (região Frankfurt) | Hospedagem da API e do front | `render.yaml` |
| Neon (Postgres) e Redis | Banco e filas | `DATABASE_URL`, `REDIS_URL` |
| Cloudflare R2 | Mídia, áudios, documentos, exportações LGPD | `apps/api/src/storage` |
| Google | Login (OAuth) e **embeddings** do texto dos relatos | `auth` e `apps/api/src/embedding` |
| **Groq (EUA)** | **Transcrição dos áudios** de comentários (Whisper) | `apps/api/src/transcription/transcription.processor.ts` |
| Stripe | Pagamentos de planos | `apps/api/src/subscricoes` |
| SMTP (provável Gmail: o `.env.example` usa `smtp.gmail.com`; **o valor real em produção não foi verificado**) | E-mails transacionais | `apps/api/src/mail/mail.service.ts` |
| **MapTiler** | Tiles do mapa (o navegador do usuário chama a MapTiler; a chave vai no front) | `apps/web/src/pages/MapView.tsx` linha ~284 |
| BrasilAPI | Consulta de CEP (o navegador envia o CEP) | componente `CepInput` |
| LiveKit | Debates ao vivo (áudio/vídeo/gravação) | módulo `debates` |

Há **transferência internacional** de dados (Render/Frankfurt, Groq/EUA, Google, Stripe, MapTiler), tema da LGPD art. 33.

### 2.4 Problemas encontrados no produto (base das tarefas)
1. **Cadastro sem aceite.** `apps/web/src/pages/Register.tsx` não tem checkbox de termos nem confirmação de idade; `RegisterDto` (`apps/api/src/auth/dto/register.dto.ts`) e `AuthService.register` (`auth.service.ts` ~linha 61) não guardam nada disso. O login com Google (`AuthService.googleLogin`, ~linha 445) cria o usuário sem nenhum aceite.
2. **Selo "LGPD Compliant" com links mortos.** `apps/web/src/components/layout/Footer.tsx`: `LgpdBadge` (~linha 112), usado em ~linha 139; links "Termos de uso" e "Política de privacidade" com `href="#"` (~linhas 169–170).
3. **Exclusão de conta provavelmente quebra.** `UsersService.deleteAccount` (`apps/api/src/users/users.service.ts`, ~linhas 75–149) apaga alguns vínculos e depois faz `tx.user.delete`. Mas existem relações **obrigatórias sem `onDelete`** (padrão do Prisma = `Restrict`) que **não são tratadas antes**: `DebateQuestion.author`, `DebateMessage.author`, `DebatePollVote.user`, `PropostaVoto.usuario` e `ApiKey.user`. Usuário com qualquer um desses registros leva erro de chave estrangeira e **não consegue apagar a conta**. (Relações opcionais como `Report.authorId`, `TimelineEvent.authorId`, `PropostaTimeline.autorId` viram `SetNull` pelo padrão do Prisma; `UserPoliticianFollower` já tem `Cascade`.)
4. **Exclusão deixa arquivos órfãos no R2.** Só as chaves `verification/…` são apagadas. Os **áudios dos comentários** (`Comment.mediaKey`, ex.: `comments/….webm`) são removidos do banco mas **permanecem no R2**.
5. **Conta só-Google não consegue se excluir.** `deleteAccount` recusa quem não tem senha (~linha 95) mandando "entrar em contato com o suporte". O direito ao apagamento tem que ser autoatendimento.
6. **Exportação LGPD incompleta.** `apps/api/src/users/lgpd.processor.ts` não inclui: mensagens/perguntas/votos de enquete de debates, votos em propostas, políticos seguidos, chaves de API (metadados), solicitações de cadastro, eventos de timeline do usuário, CPF (se existir) nem campos de consentimento. Além disso aplica limites (`take: 500/1000/200`) que tornam a exportação parcial. O arquivo gerado fica no R2 mesmo depois que o link de 24 h expira.
7. ~~"Relato anônimo" mantém o autor no banco~~ **Correção (feita depois):** isso estava errado. Em relato anônimo o `authorId` é gravado como `null` (`reports.service.ts` ~linha 53 e `reports.repository.ts` ~linha 95), então o Votz **não guarda** o vínculo autor↔relato. Consequências: o autor não recebe notificações e não pode contestar relato anônimo, e a exportação LGPD não tem como incluí-lo. O texto legal da Fase 2 foi ajustado para refletir isso.

---

## 3. Tarefas da Fase 1

Ordem sugerida: **T1 → T2 → T3 → T4 → T5 → T6**. Cada tarefa tem critérios de aceite. Rode `npm run db:generate` e `npm run db:migrate` quando alterar o schema.

### T1 — Aceite versionado de Termos e Privacidade + confirmação de 18 anos

**Objetivo:** registrar *quem aceitou o quê e quando* e impedir uso sem aceite, inclusive para quem entra com Google e para usuários já existentes.

**1) Constantes compartilhadas** — novo arquivo `packages/shared-types/src/legal.ts` e export em `packages/shared-types/src/index.ts`:
```ts
export const TERMS_VERSION = '2026-11-14'   // altere ao publicar nova versão dos Termos
export const PRIVACY_VERSION = '2026-11-14' // idem para a Privacidade
export const MIN_AGE = 18
```
Atenção: o pacote `shared-types` tem `main: src/index.js`, ou seja, os `.js/.d.ts` são **gerados dentro de `src/`**. Não edite `.js`/`.d.ts` à mão: edite os `.ts` e rode `npm run build --workspace=packages/shared-types`. O `index.ts` pode já ter alterações em andamento do usuário; **acrescente** a linha de export sem apagar nada.

**2) Schema Prisma** (`packages/database/prisma/schema.prisma`, modelo `User`): adicionar, todos **opcionais** (migration aditiva, não pode quebrar usuários existentes):
```prisma
termsAcceptedAt    DateTime?
termsVersion       String?
privacyVersion     String?
ageConfirmedAt     DateTime?
```
Criar migration com nome `add_legal_consent_to_users`.

**3) Registro por e-mail (`POST /auth/register`):**
- `RegisterDto` ganha `acceptedTermsVersion: string`, `acceptedPrivacyVersion: string` e `confirmAge18: boolean` (`@Equals(true)`, mensagem clara). Documentar no Swagger.
- `AuthService.register` valida que as versões enviadas são **iguais** às constantes atuais (senão `409` com mensagem "Os Termos foram atualizados. Recarregue a página e aceite novamente.") e grava `termsAcceptedAt = now`, `ageConfirmedAt = now`, `termsVersion`, `privacyVersion`.

**4) Endpoint de aceite para quem já está logado** — `POST /users/me/consent` (guard JWT, em `UsersController`/`UsersService`), body `{ acceptedTermsVersion, acceptedPrivacyVersion, confirmAge18: true }`, mesma validação e mesma gravação. Retorna o usuário atualizado.

**5) Expor os campos no usuário autenticado:** incluir `termsVersion`, `privacyVersion`, `ageConfirmedAt` no select público usado por `/auth/me` e nas respostas de login/registro (procure `USER_PUBLIC_SELECT` em `apps/api/src/auth`), em `packages/shared-types/src/user.ts` e em `apps/web/src/types/api.ts` (`AuthUser`).

**6) Front — cadastro:** em `apps/web/src/pages/Register.tsx`, antes do botão, **um checkbox obrigatório** (não pré-marcado) com o texto:
> "Tenho 18 anos ou mais e li e concordo com os **Termos de Uso** e a **Política de Privacidade**."

com links `/termos` e `/privacidade` (abrem em nova aba). Sem marcar, mostrar erro e não enviar. O `RegisterPayload` (`apps/web/src/hooks/useAuth.ts`) passa a enviar `acceptedTermsVersion`, `acceptedPrivacyVersion` (importados de `@votz/shared-types`) e `confirmAge18: true`.

**7) Front — `ConsentGate` (cobre Google e usuários antigos):** criar um componente (ex.: `apps/web/src/components/legal/ConsentGate.tsx`) montado dentro do layout principal. Quando houver usuário logado e `user.termsVersion !== TERMS_VERSION || user.privacyVersion !== PRIVACY_VERSION || !user.ageConfirmedAt`, exibir **modal bloqueante** com o mesmo texto do checkbox e dois botões: **"Aceitar e continuar"** (chama `POST /users/me/consent` via hook TanStack Query e atualiza o usuário no store) e **"Sair"** (faz logout). As rotas `/termos`, `/privacidade`, `/cookies`, `/diretrizes` **devem continuar acessíveis** sem aceitar (o usuário precisa poder ler antes de aceitar). Isso também resolve futuras mudanças de versão: basta alterar a constante.

**Critérios de aceite T1**
- Registro por e-mail sem o checkbox é rejeitado no front e na API.
- Registro com versão desatualizada retorna 409.
- Usuário criado pelo Google, ao entrar, vê o modal e só usa o app após aceitar; "Sair" desloga.
- Usuário existente (campos nulos) vê o modal no próximo acesso.
- Os 4 campos ficam preenchidos no banco após o aceite.
- Testes de `AuthService` (registro com/sem aceite, versão errada) e de `UsersService.acceptConsent` passando.

### T2 — Idade mínima de 18 anos

Coberta pela T1 (checkbox + `ageConfirmedAt`), **sem coletar data de nascimento** (minimização de dados). Complementos:
- Textos de interface usam a constante `MIN_AGE` (não escreva "18" solto).
- No `RegisterDto`, `confirmAge18` com `@Equals(true)` e mensagem "É preciso ter 18 anos ou mais para criar uma conta."
- Teste cobrindo `confirmAge18 = false` → 400.

### T3 — Corrigir a exclusão de conta

Arquivo: `apps/api/src/users/users.service.ts` (`deleteAccount`) + `users.service.spec.ts`.

1. **Dentro da transação, antes do `tx.user.delete`**, tratar todos os vínculos obrigatórios:
   - `DebatePollVote` do usuário: apagar **e decrementar** `DebatePollOption.totalVotes` correspondente.
   - `DebateQuestion` e `DebateMessage` do usuário: apagar.
   - `PropostaVoto` do usuário: apagar.
   - `ApiKey` do usuário: apagar.
   - Conferir `PropostaTimeline.autorId`, `TimelineEvent.authorId`, `Report.authorId` (opcionais): anonimizar (`null`) explicitamente em vez de confiar no padrão.
   - Confirmar no schema se há **qualquer outra relação para `User`** que bloqueie o delete (rodar `grep "User  *@relation\|user  *User"` no schema) e tratá-la.
2. **Arquivos no R2:** além de `verification/…`, coletar e apagar as `Comment.mediaKey` dos comentários do usuário (áudios) **depois** do commit da transação (como já é feito para os documentos). Verificar também se o avatar (`avatarUrl`) é um objeto do R2 e, se for, apagar.
3. **Conta só-Google (sem senha):** substituir o bloqueio por confirmação alternativa — o usuário precisa **digitar o próprio e-mail** (comparação exata, case-insensitive) para confirmar. Ajustar o DTO, o front em `apps/web/src/pages/MyProfile.tsx` (seção "Privacidade e dados", ~linha 1178; esconder o campo de senha e mostrar o de e-mail para contas Google) e a mensagem de erro.
4. Manter os bloqueios existentes para `ADMIN`/`MODERATOR` e para membros ativos de organização, mas trocar o texto "entre em contato com o suporte" para incluir o e-mail de contato (`fernandomoreira.dev@gmail.com`, provisório).
5. **Preservado de propósito (Memória pública):** relatos continuam existindo, anonimizados (`authorId = null`, `anonymous = true`) e a mídia dos relatos **não** é apagada. Não altere isso.

**Critérios de aceite T3**
- Teste unitário que cria cenário com: relato, comentário de voz, voto, mensagem de debate, pergunta, voto de enquete, voto em proposta e chave de API → `deleteAccount` conclui sem erro de FK, e nada do usuário resta em nenhuma tabela.
- `DebatePollOption.totalVotes` decrementado corretamente.
- `storage.delete` chamado para cada `verification/…` **e** cada `mediaKey` de comentário.
- Conta Google-only consegue encerrar digitando o e-mail; e-mail errado retorna 403.

### T4 — Exportação de dados (portabilidade) completa

Arquivo: `apps/api/src/users/lgpd.processor.ts` (+ spec, se existir).

Incluir, além do que já existe:
- Relatos do usuário **inclusive os marcados como anônimos** (são dele; remover o filtro `anonymous: false`), com data, categoria, status e local.
- `TimelineEvent` criados por ele; `DebateMessage`, `DebateQuestion`, `DebatePollVote`, `PropostaVoto`, `UserPoliticianFollower`.
- Chaves de API: `name`, `prefix`, `tier`, `lastUsedAt`, `revokedAt`, `createdAt` — **nunca** `keyHash`.
- `RegistrationRequest` do usuário: `type`, `status`, `createdAt`, `reviewNote`; **sem** as chaves internas dos documentos.
- Campos de consentimento (`termsAcceptedAt`, `termsVersion`, `privacyVersion`, `ageConfirmedAt`).
- `cpf`, se existir (descriptografar com o `CryptoService` já existente em `apps/api/src/crypto`).
- **Remover os limites** `take: 500/1000/200` (ou paginar internamente até esgotar). A portabilidade tem que ser completa.
- Nunca exportar: `password`, `mfaSecret`, `mfaBackupCodes`, `refreshTokenHash`, tokens.

**Ação manual (infra, não é código):** configurar no painel do Cloudflare R2 uma regra de ciclo de vida que **expire objetos com prefixo `exports/` após 7 dias**. Registre no seu relatório final que isso precisa ser feito por um humano.

**Critérios de aceite T4:** JSON exportado contém todas as seções acima para um usuário de teste com dados em todas as tabelas; nenhum campo secreto aparece; teste unitário do processor cobrindo isso.

### T5 — Hospedar as fontes localmente

- Instalar em `apps/web`: `@fontsource/space-grotesk`, `@fontsource/inter`, `@fontsource/jetbrains-mono` (use as versões estáveis mais recentes).
- Importar apenas os pesos usados: Space Grotesk 400/500/600/700; Inter 400/500/600; JetBrains Mono 400/500 (ex.: `import '@fontsource/inter/400.css'` no `apps/web/src/main.tsx`, ou equivalente que funcione com o Vite).
- **Remover** o `@import url('https://fonts.googleapis.com/…')` de `apps/web/src/theme/GlobalStyle.ts` (linha 5). Os nomes de família no `theme` (`'Space Grotesk'`, `'Inter'`, `'JetBrains Mono'`) não mudam.
- Confirmar que não há `<link>` para `fonts.googleapis.com`/`fonts.gstatic.com` no `apps/web/index.html`.

**Critérios de aceite T5:** `grep -ri "fonts.googleapis\|fonts.gstatic" apps/web/index.html apps/web/src` não retorna nada; no DevTools (aba Network) nenhuma requisição vai ao Google; as três fontes renderizam normalmente; `npm run build --workspace=apps/web` passa.

### T6 — Remover o selo "LGPD Compliant" e ligar os links legais

1. Em `apps/web/src/components/layout/Footer.tsx`: remover o `LgpdBadge` (definição ~linha 112 e uso ~linha 139). **Não** substitua por outro selo de conformidade.
2. Trocar os `href="#"` por links de rota (usar o `Link` do `react-router-dom`, já importado): "Termos de uso" → `/termos`, "Política de privacidade" → `/privacidade`; adicionar "Cookies" → `/cookies` e "Diretrizes da comunidade" → `/diretrizes`.
3. Criar **páginas provisórias** e registrar as rotas (mesmo padrão das demais páginas em `apps/web/src/pages/`, rotas em `apps/web/src/App.tsx`): `Termos.tsx`, `Privacidade.tsx`, `Cookies.tsx`, `Diretrizes.tsx`. Conteúdo provisório (use `theme`, sem cores novas): título + a frase "Este documento está em elaboração e será publicado antes da abertura ao público. Dúvidas: fernandomoreira.dev@gmail.com." + versão atual (`TERMS_VERSION`/`PRIVACY_VERSION`). A Fase 2 substituirá o conteúdo.
4. Atenção: essas rotas **não** podem exigir login nem ser bloqueadas pelo `ConsentGate`.

**Critérios de aceite T6:** nenhum `href="#"` restante nos links legais do Footer; selo removido; as 4 rotas abrem sem login.

---

## 4. Verificação final (rodar e reportar)

```bash
npm run db:generate
npm run db:migrate
npm run build --workspace=packages/shared-types
npx tsc --noEmit -p apps/api
npx tsc --noEmit -p apps/web
npm run test --workspace=apps/api -- users auth
npm run build --workspace=apps/web
```
Teste manual sugerido: (a) cadastrar por e-mail com e sem checkbox; (b) entrar com Google com conta nova e aceitar no modal; (c) criar usuário de teste com dados de debate/proposta/chave de API e excluir a conta; (d) pedir exportação e conferir o JSON; (e) conferir no Network que nada vai ao Google Fonts.

## 5. Ações manuais que você NÃO consegue fazer (listar no relatório)
1. Regra de ciclo de vida do R2: expirar `exports/` em 7 dias.
2. No painel da MapTiler, **restringir a chave por origem (domínio)**, pois ela é exposta no front.
3. Confirmar qual provedor SMTP está em produção (para constar na Política de Privacidade).

---

## 6. Anexo — sugestões que serão usadas na Fase 2 (não implementar agora)

**Prazos de retenção sugeridos**
| Dado | Prazo |
|---|---|
| Conta ativa | Enquanto existir; excluída a pedido do titular |
| Conta inativa | Aviso por e-mail após 24 meses sem login; anonimização 30 dias depois |
| Relatos (Memória pública) | Sem prazo; anonimizados quando a conta é excluída |
| Áudios e comentários | Enquanto a conta existir; apagados com a conta |
| Documentos de verificação | Rejeitados: 30 dias; aprovados: até 12 meses ou encerramento do perfil |
| Arquivos de exportação LGPD | 7 dias |
| Registros de acesso (IP/data, Marco Civil art. 15) | 6 meses (**hoje o sistema não registra; decisão pendente**) |
| Dados fiscais/pagamentos | 5 anos |
| Backups | até 30 dias |

**Regras de planos sugeridas:** assinatura mensal; cancelamento a qualquer momento com efeito no fim do período pago; reembolso integral em até 7 dias da primeira contratação; reajuste com aviso de 30 dias; pagamento falho = 7 dias de tolerância e depois volta ao plano básico **sem apagar dados**; e a regra de ouro: **pagar não altera o registro público, a timeline, o Votz Score nem o Mandatômetro** (plano dá ferramentas de gestão, não influência).
