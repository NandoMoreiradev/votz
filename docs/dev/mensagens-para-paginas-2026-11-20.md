# Mensagens para páginas e @usuário das páginas

Data: 20/11/2026. Decisões do dono do produto, na mesma data:

- Cidadão pode escrever para o perfil de um **político, entidade ou empresa**, como numa página do Facebook ou Instagram.
- Quem administra a página lê e responde, conforme as **permissões granulares** da equipe.
- **Sem criptografia de ponta a ponta** nessas conversas (aprovado). O chat entre cidadãos continua cifrado de ponta a ponta e não mudou. Motivos: do outro lado está uma equipe que muda; registro e moderação; LGPD; é a prática das caixas de página do mercado.
- Em troca: texto **cifrado no banco** (AES-256-GCM, mesma chave do CPF, `CPF_ENCRYPTION_KEY`), **registro de quem da equipe leu**, aviso fixo ao cidadão ("Esta conversa é com a equipe da página…"), cidadão pode **apagar** a conversa (some para a equipe).
- Cidadão, político, entidade e empresa dividem **o mesmo espaço de @usuário** (como no Instagram).

## O que existe

- **Banco** (migrations `20261120210000_page_inbox_and_handles` e `20261120210100_page_inbox_default_roles`): `username` único em `entities`, `politicians` e `companies`; `page_conversations` (uma por cidadão e página), `page_messages` (`body_enc` cifrado), `page_conversation_reads` (auditoria); permissões `READ_MESSAGES` e `REPLY_MESSAGES`. A segunda migration dá as duas permissões aos papéis padrão OWNER, MANAGER e AGENT que já existiam (VIEWER não).
- **API**
  - `apps/api/src/handles`: `PATCH /handles/:orgType/:orgId` (exige `MANAGE_PROFILE`), `GET /handles/:username` (público, para link de perfil). `HandlesService.assertAvailable` confere as quatro tabelas; o cidadão passa a usá-lo também ao editar o perfil. Nomes reservados (votz, admin, suporte…) são recusados. Disputa simultânea vira 409 amigável (P2002).
  - `apps/api/src/page-inbox`: cidadão (`/page-inbox/mine`, `/mine/unread`, `/mine/:id`, `DELETE /mine/:id`, `/:orgType/:orgId/thread` que também devolve o resumo da página, `POST /:orgType/:orgId/messages`) e equipe (`/:orgType/:orgId/unread`, `/conversations`, `/conversations/:id`, `POST …/replies`, `PATCH …/conversations/:id` com OPEN, RESOLVED ou BLOCKED). Ler pede `READ_MESSAGES`; responder e mudar estado pedem `REPLY_MESSAGES`. `GET /conversations/unread` soma as não lidas do chat cifrado para o selo único.
  - Regras: só cidadão com e-mail confirmado escreve; quem é da equipe não escreve para a própria página; limite de 10 por minuto e 50 por dia por conversa; texto de até 2000 caracteres, sem HTML; cidadão bloqueado não escreve; mensagem nova reabre conversa resolvida; o cidadão vê "a página" e só a equipe vê o nome de quem respondeu.
  - Perfis públicos de entidade, político e empresa passaram a devolver `username`.
- **Regra de escopo (atualizada em 20/11 — caixa unificada, substitui "tudo acontece dentro da página"):**
  - **Um único módulo de mensagens (`/conversas` no web, aba `Conversas` no celular)**, sem separar cidadãos de páginas.
  - **Separação estrita por acesso:** no perfil pessoal aparecem só as conversas pessoais (com cidadãos, grupos e páginas); acessando como página no web, aparecem só as conversas da página (`READ_MESSAGES` / `REPLY_MESSAGES`), sem misturar com as conversas pessoais de quem administra.
  - **Botão "Mensagem" nos perfis** leva para `/conversas/pagina/:orgType/:orgId` no web (e `/conversation/page` no celular), abrindo a conversa já na caixa unificada.
- **Web**:
  - `Navbar` tem só o ícone de **Conversas** (`/conversas`), com selo único de não lidas (pessoais + páginas no perfil pessoal; não lidas da página no acesso da página). `/mensagens` redireciona para `/conversas`.
  - Em `/conversas`, a lista pessoal mistura conversas cifradas e conversas com páginas por ordem da última mensagem (`mergeInboxLists`), e cada conversa com página abre o `CitizenPagePane`. No acesso como página, abre a caixa da equipe (`StaffInbox`, `StaffPagePane`, `StaffStartPane`). O campo de @usuário (`PageHandlePanel`) segue no perfil da página.
- **Celular (só o lado do cidadão)**: a aba **Conversas** junta conversas entre pessoas, grupos e páginas; o botão **Mensagem** do perfil e a lista "Páginas que você segue" em Nova conversa abrem `/conversation/page`. A caixa da equipe continua só na web até o app ganhar acesso de organização.

## Como verificar

Testes: `npx jest src/page-inbox src/handles` em `apps/api` (18 testes). Roteiro ponta a ponta feito em 20/11 contra o banco local (API de teste na porta 3001): cidadão envia, equipe vê não lidas, abre (fica registrado quem leu), responde, cidadão vê a resposta sem nome da equipe, outra página recebe 403, resolver, @ da página único contra cidadão, equipe não escreve para a própria página, cidadão apaga. Dados de teste apagados depois.

## Ainda não feito / não verificado

- **Reiniciar a API**: a API do dono precisa ser recompilada e reiniciada (`npm run build --workspace=apps/api`) para ter as rotas novas; o `prisma generate` deu EPERM no motor mas os tipos saíram.
- Telas da web e do celular conferidas só por `tsc` (limpo); **não foram abertas no navegador nem no aparelho**.
- **Notificação** ao cidadão e à equipe quando chega mensagem: não existe ainda (há só o selo de não lidas e a atualização a cada 15–30 s).
- Denúncia de mensagem de página e retenção (prazo de guarda): decidir.
- A exportação LGPD do cidadão ainda não inclui as conversas com páginas.
- Dois pedidos simultâneos do mesmo @ em tabelas **diferentes** (cidadão e página) passam pela conferência; só o `@unique` de cada tabela segura. Chance pequena; se importar, criar uma tabela única de nomes.
- Falha antiga, não desta mudança: `role-matrix.spec.ts` reclama de rotas `/admin/*` sem cobertura na matriz.

## Nova conversa: quem eu sigo, seguidores e páginas (decisões do dono, 20/11/2026)

- Qualquer pessoa pode chamar qualquer pessoa, siga ou não. O **aceite continua obrigatório** (nada de aceite automático, nem com seguimento mútuo).
- **Nova conversa (individual)** começa por: **Quem você segue** (pessoas), **Seguidores** (quem me segue e eu não sigo de volta, sem repetir) e **Páginas que você segue** (político, entidade, empresa). Escolher uma página abre a conversa **dentro do perfil dela** (`?mensagens=1` na web; `profile/<tipo>/<id>/messages` no celular). Ao digitar (2 letras ou mais) a lista filtra e a busca continua valendo para todos os usuários. Quem bloqueou, quem foi bloqueado, banidos e sem e-mail confirmado não aparecem. API: `GET /conversations/start-options` (até 100 por seção).
- **Quem pode me enviar solicitações** ganhou a opção **"Só quem eu sigo"** (`FOLLOWING`): recusa quem a pessoa não segue ("Esta pessoa só recebe solicitações de quem ela segue."). Sem migration (a coluna é texto).
- **Limite**: sem limite diário para quem chama quem já o segue. Para quem **não é seguido** pelo destinatário, teto de **20 solicitações novas por dia** (`UNFOLLOWED_REQUESTS_PER_DAY`); quem já segue de volta não conta. Estourou: HTTP 429 com mensagem em português simples. O limite por minuto que já existia continua.
- Testes: 5 novos em `conversations.spec.ts` (política, limite, lista inicial).

Ainda não feito: faixa "De quem você segue" no topo das Solicitações recebidas; a página **iniciar** conversa com um cidadão pelo painel dela (o "vice-versa": hoje a equipe só responde a quem escreveu primeiro) e a caixa da equipe no celular.

## A página começa a conversa com um seguidor (o "vice-versa", 20/11/2026)

- A equipe com `REPLY_MESSAGES` vê **Nova conversa** na caixa de entrada, busca entre os **seguidores da página** e manda a primeira mensagem. Só quem **segue** a página pode ser chamado (sem isso, a página mandaria mensagem a qualquer um).
- A conversa nasce **pendente** (`startedBy = STAFF`, `citizenAccepted = false`). O cidadão vê "[página] quer conversar com você" com **Aceitar** e **Recusar**. Até aceitar, a página **não manda mais mensagens** (HTTP 409). Responder à página também conta como aceitar.
- **Recusar** bloqueia só aquela conversa; o cidadão pode voltar a escrever (isso reabre). Se a **página** bloqueia, o cidadão não reabre sozinho (bloquear vale mais que "recusou").
- Teto: **50 conversas novas por dia por página** (`PAGE_STARTED_PER_DAY`), HTTP 429. Dos cidadãos para a página não mudou.
- API: `GET /page-inbox/:orgType/:orgId/followers?q=`, `POST /page-inbox/:orgType/:orgId/conversations`, `POST /page-inbox/mine/:id/respond`. Migration `20261120220000_page_inbox_started_by` (duas colunas).
- Web: seleção de seguidor e envio no painel da equipe; aviso Aceitar/Recusar no painel do perfil. Celular: Aceitar/Recusar na tela de mensagens do perfil (a **equipe continua só na web**).
- Verificado em 20/11 contra o banco local: seguidores listados, não seguidor recusado (403), página inicia (201), segunda mensagem antes do aceite (409), aceite, resposta, recusa, 409 depois da recusa e cidadão volta a escrever. Testes unitários: 20 em `page-inbox.service.spec.ts`. Não verificado: as telas em navegador e aparelho.
