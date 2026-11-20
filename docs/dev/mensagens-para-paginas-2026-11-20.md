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
  - `apps/api/src/page-inbox`: cidadão (`/page-inbox/mine`, `/mine/:id`, `DELETE /mine/:id`, `/:orgType/:orgId/thread`, `POST /:orgType/:orgId/messages`) e equipe (`/:orgType/:orgId/unread`, `/conversations`, `/conversations/:id`, `POST …/replies`, `PATCH …/conversations/:id` com OPEN, RESOLVED ou BLOCKED). Ler pede `READ_MESSAGES`; responder e mudar estado pedem `REPLY_MESSAGES`.
  - Regras: só cidadão com e-mail confirmado escreve; quem é da equipe não escreve para a própria página; limite de 10 por minuto e 50 por dia por conversa; texto de até 2000 caracteres, sem HTML; cidadão bloqueado não escreve; mensagem nova reabre conversa resolvida; o cidadão vê "a página" e só a equipe vê o nome de quem respondeu.
  - Perfis públicos de entidade, político e empresa passaram a devolver `username`.
- **Regra de escopo (dono, 20/11): tudo acontece dentro da página.** O botão **Mensagem** não leva a uma tela global: ele abre a conversa dentro do próprio perfil.
- **Web**: o botão **Mensagem** nos três perfis abre o painel de conversa (`PageChatPanel`) no topo da coluna do perfil, pelo endereço `?mensagens=1` (vale link direto e voltar do navegador). Sem conversa, o painel mostra o aviso e o campo; a primeira mensagem cria a conversa. `/mensagens` é só um **índice** das conversas do cidadão, e cada linha abre o perfil da página com a conversa já aberta. A equipe vê a caixa de entrada (`PageInboxPanel`) e o campo de @usuário (`PageHandlePanel`) no próprio perfil da página.
- **Celular (só o lado do cidadão)**: o botão **Mensagem** abre `/profile/<tipo>/<id>/messages`, uma rota **dentro do perfil** (o voltar leva ao perfil). `page-messages` é o índice, no menu do próprio perfil. A caixa da equipe **não existe no celular**: o app ainda não tem noção de organização, isso é só web.

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
