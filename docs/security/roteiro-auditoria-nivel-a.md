# Votz — Roteiro de auditoria para chegar ao "nível A"

> **Para que serve:** documentar tudo o que falta para podermos afirmar, com evidência, que a segurança do Votz está em nível A. Foi escrito em 15/11/2026, depois dos briefs 3A, 3A.1 e 3B. Use como pauta de uma ou mais sessões de auditoria.
>
> **Aviso importante:** "nível A" não é uma nota que alguém me dá. É um conjunto de critérios que precisam estar **comprovados** (seção 1). Até hoje, parte do que está marcado como feito foi verificada **só por leitura de código** (veja a coluna "Evidência").
>
> **Documentos relacionados:** `auditoria-seguranca-2026-11.md` (achados e evidências), `checklist-antes-de-ir-ao-ar.md` (configuração de produção), `plano-de-incidentes.md`, `audit-allowlist.md`, e os briefs `fase-3*.md`.

**Legenda:** ✅ feito e verificado · 🟡 parcial ou só verificado por leitura · ⬜ pendente · 🔴 achado aberto
**Quem faz:** `Claude` (auditoria e revisão) · `Gemini` (implementação a partir de brief) · `Você` (decisão ou configuração) · `Externo` (pentest, advogado)

---

## 0. Achados abertos conhecidos (resolver primeiro)

| # | Sev. | Achado | Evidência | Quem |
|---|---|---|---|---|
| A0 | 🔴 **Alta** | **Um moderador pode promover qualquer conta (inclusive a própria) a ADMIN.** `PATCH /admin/users/:id/type` só tem o `@Roles(MODERATOR, ADMIN)` da classe; nem o controller nem o serviço restringem. O `SetTypeDto` aceita qualquer `UserType`, inclusive `ADMIN`. | Leitura de `admin.controller.ts` e `admin.service.ts` (14/11). **Escapou da auditoria anterior**, que varreu *presença* de guard e não a *adequação do papel* | Gemini (brief) |
| A1 | 🟡 Média | Estão abertas as 23 vulnerabilidades de dependência (1 crítica, 9 altas). Dependem de atualizar NestJS 10→11/12 e `bcrypt@5→6` | `npm audit` executado | Gemini |
| A2 | 🟡 Média | **Não existe fluxo "esqueci minha senha"** (nem troca de senha logado). Conta com senha perdida é irrecuperável, e não há como revogar sessões por troca de senha | Busca no código: sem `forgot`/`reset`/`change-password` | Gemini |
| A3 | 🟡 Média | **Confirmado por leitura (15/11):** `CreateCommentDto.mediaKey` é só `@IsString()` e `mediaUrl` só `@IsUrl()`, sem checar prefixo, formato nem coerência entre os dois. O `mediaKey` vai para `transcription.processor.ts`, que gera URL assinada para **qualquer chave do bucket** e envia o conteúdo ao Groq; o texto volta para o comentário público. Impacto prático limitado (o Whisper só transcreve áudio), mas é entrada do cliente controlando acesso ao storage | Leitura de `create-comment.dto.ts` e `transcription.processor.ts`; não explorado | Gemini (brief 3C) |
| A4 | 🟡 Baixa | **Reavaliado (15/11):** todos os campos de URL usam `@IsUrl()`, cujo padrão aceita só `http`, `https` e `ftp`, então `javascript:` já é bloqueado. O que resta: `media` dos relatos, `avatarUrl`, `logoUrl` aceitam **hospedagem externa** (rastreio do IP de quem vê, conteúdo trocado depois) e `ftp:`. **Cuidado de desenho:** não gravar "quem enviou cada arquivo" para provar propriedade, porque ligaria usuário a mídia de **relato anônimo** | Leitura dos DTOs | Gemini (brief 3C) |
| A5 | 🟡 Média | **Bucket único para arquivos públicos e privados.** `StorageService` usa o mesmo bucket e a mesma base pública para `reports`, `avatars`, `comments` e também para `verification`, `exports`. Se o domínio público do bucket for ligado, os privados ficam endereçáveis | Leitura de `storage.service.ts`. Produção ainda não existe | Você (infra) + Gemini |
| A6 | 🟡 Baixa | **Confirmado (15/11):** o fluxo Google não usa `state` (`GoogleStrategy` só define `scope`; `GoogleAuthGuard` não o passa). Permite **login CSRF**: o atacante faz a vítima entrar na conta *dele*, e a vítima passa a publicar nela | Leitura de `google.strategy.ts` e `google-auth.guard.ts` | Gemini (brief 3C) |

> **Brief criado para A0, A3, A4 e A6:** [`fase-3c-brief-escalada-e-entradas.md`](fase-3c-brief-escalada-e-entradas.md).
>
> **Estado em 15/11/2026 (brief 3C revisado):** A0, A3, A4 e A6 estão **corrigidos no código e testados** (57 suítes, 359 testes; a matriz papel × rota foi provada **falhando** sem o `@Roles(ADMIN)`). **Duas condições para fechar de vez:** (1) rodar a migration `security_role_change_audit` (o enum `USER_TYPE_CHANGED` está no schema, mas **não existe migration**, então o `setUserType` daria erro 500 num banco migrado); (2) commitar o estado atual do `auth.controller.ts`. O commit `a7da5f3` ficou com **0** `@Public()` e **0** `OriginCsrfGuard` nesse arquivo, o que **quebra login, cadastro, refresh e Google** sob o guard global e remove a proteção CSRF.
>
> **Lição de processo (incidente):** o `route-auth-audit.spec.ts` já detectava exatamente isso, mas **não foi executado antes do commit**. Rodar `npm run test --workspace=apps/api` antes de cada commit, e ligar o CI em `pull_request`, evita repetir.

---

## 1. Critérios de saída para dizer "nível A"

Só afirmar "A" quando **todos** estes estiverem verdadeiros e documentados:

- [ ] **Nenhum achado alto ou crítico aberto**, de código ou de dependência (exceções só na `audit-allowlist.md`, com justificativa e prazo).
- [ ] **Todas as rotas auditadas**: autenticação, papel adequado, propriedade do recurso, validação de entrada, limite de uso e exposição de dados (método na seção 3).
- [ ] **Matriz de autorização automatizada** passando: para cada papel × rota, o resultado esperado (seção 4).
- [ ] **Pentest externo** concluído, achados altos corrigidos e **re-testados**.
- [ ] **Ambiente de produção** configurado e conferido pelo checklist, **com evidência** (capturas ou saída de comando).
- [ ] **Monitoramento e alerta** ligados e **testados** (disparar um alerta de propósito).
- [ ] **Backup restaurado com sucesso ao menos uma vez** (não basta existir).
- [ ] **Simulação de incidente** feita com o plano (`plano-de-incidentes.md`).
- [ ] **Promessas dos textos legais = comportamento real** (seção 15), revisadas por advogado.
- [ ] **Rotina de re-auditoria** definida (seção 17).

---

## 2. O que já está feito

| Área | O que foi feito | Evidência |
|---|---|---|
| Sessão e tokens | `typ: 'access'` obrigatório, `HS256` fixo, refresh opaco com `familyId` e detecção de reuso (com tolerância de 10 s), `logout-all`, revogação em banimento | ✅ Testes + execução do teste de bcrypt (corrigido) |
| MFA | Token pré-MFA não vale como sessão (HTTP e WebSocket), bloqueio por 5 erros, segredo cifrado `v1:` | ✅ Testes; 🟡 migração de dados não aplicada em produção |
| Logs | Redação de `Set-Cookie`, `Authorization`, `Cookie` e query string | ✅ Teste real de servidor HTTP |
| Cobrança | `MANAGE_BILLING`, checagem de organização, webhook idempotente | ✅ Testes; 🟡 só por leitura contra instância real |
| Organizações | Roles por organização na URL, DTO validado, serviço confere pertencimento | ✅ Testes |
| Conta | Pré-sequestro via Google mitigado, timing equalizado no login | ✅ Testes |
| Rotas | Guard global (`deny-by-default`) + teste de varredura bidirecional | ✅ Teste automatizado |
| Front | CSP e cabeçalhos no `render.yaml`, popup do mapa sem HTML, token fora da URL | 🟡 Verificado em preview pelo Gemini; **não** no app completo |
| E-mail | `escapeHtml` e `sanitizeSubject` | ✅ Testes |
| Infra de código | CSRF por Origin, throttler em Redis com fallback, validação de ambiente no boot | ✅ Testes |
| Processo | CI com `npm audit`, Dependabot, plano de incidentes | 🟡 CI nunca rodou no GitHub |
| LGPD | Exportação, exclusão, retenção, log de acesso mínimo, anonimato estrutural | ✅ Testes |

---

## 3. Auditoria de código pendente, por módulo

### Método (aplicar a **cada rota** de cada módulo)
Para cada `@Get/@Post/@Patch/@Delete`, responder:
1. **Autenticação:** exige login? É `@Public()` por escolha consciente?
2. **Papel:** o papel exigido é o **mínimo necessário**? (Erro típico: papel da classe herdado por rotas que deveriam ser só ADMIN — foi o caso do A0.)
3. **Propriedade:** o usuário só age no que é **dele ou da organização dele**? O `id` da URL é conferido contra o dono?
4. **Entrada:** DTO com decoradores (não `Partial<>` do TS)? Limites de tamanho? UUID/enum validados?
5. **Escrita em massa:** o DTO aceita campos que o cliente não deveria definir (`type`, `verified`, `plan`, `authorId`)?
6. **Limite de uso:** `@Throttle` adequado ao custo e ao abuso possível?
7. **Saída:** devolve só o necessário (sem e-mail, telefone, `authorId` de anônimo, hashes, segredos)?
8. **Efeitos colaterais:** gera notificação, e-mail, job ou cobrança? Isso pode ser abusado?
9. **Log:** não registra segredo nem dado pessoal desnecessário?

### Módulos ainda **não revisados linha a linha** (prioridade de cima para baixo)

| Prioridade | Módulo | O que olhar especificamente |
|---|---|---|
| 🔴 | `admin` | A0 (`setUserType`); moderador x admin em **cada** rota; quem pode verificar entidade/político; `GET /admin/users` expõe quais campos |
| 🔴 | `registration-requests` | Fluxo de reivindicação (`claimTargetId`): dá para reivindicar perfil alheio? `document-urls`: validade e escopo da URL assinada; `payload` livre exibido no painel (XSS no admin?) |
| 🔴 | `comments` | A3 (`mediaKey`/`mediaUrl` do cliente); edição só do dono; áudio: tamanho e tipo |
| 🔴 | `debates` | Quem cria debate (só político dono?); `debate:join` e salas: dá para entrar em sala alheia? Token do LiveKit: quem recebe permissão de **publicar**? Mensagem e pergunta: cooldown aplicado **no servidor** (não só no front)? Enquete: voto duplicado |
| 🟠 | `propostas` | Dono da proposta; `linkExterno` (esquema); voto único por usuário; spam |
| 🟠 | `entities` / `politicians` / `companies` | Edição só por membro com permissão; campos que o cliente não deveria definir (`verified`, `plan`, `votzScore`, `cpf`); `website`/`logoUrl` (A4); importação TSE/Câmara/Senado (entrada externa) |
| 🟠 | `org-memberships` | Convites: token de uso único e com validade; dá para convidar para **outra** organização; remover o último dono; autoconvite |
| 🟠 | `reports` (restante) | `updateRecipient` (só o autor, mas o autor de anônimo é nulo); `follow`; `media` (A4); `similar` (custo da busca: abuso) |
| 🟠 | `public-api` | `POST /api-keys`: limite de chaves por usuário; `author {id,name}` exposto: consistente com a Privacidade? Paginação máxima; chave nunca registrada em log |
| 🟡 | `users` | `PATCH :id` (campos permitidos); upload de avatar; exportação (`lgpd.processor`): link assinado com validade de 24 h e não reutilizável |
| 🟡 | `votes`, `notifications`, `notificacoes`, `alerts`, `map`, `imprensa`, `press` | Contagem manipulável (apoio duplicado, conta falsa); `imprensa`: limite de uso e dados |
| 🟡 | `camara-sync`, `senado-sync`, `tse-sync`, `ibge-sync` | Rotas administrativas protegidas; entrada externa tratada como não confiável; `adm-zip` (zip slip); SSRF se alguma URL vier de dado |
| 🟡 | `health` | Não expõe versão, variáveis nem dependências |

---

## 4. Testes automatizados a criar

- [ ] **Matriz papel × rota** (`CITIZEN`, `ENTITY`, `POLITICIAN`, `COMPANY`, `PRESS`, `MODERATOR`, `ADMIN`, anônimo): para cada rota, o status esperado. Falha quando alguém muda um papel sem querer. Teria pegado o A0.
- [ ] **Escalada de privilégio:** nenhum papel consegue elevar o próprio papel ou o de outro acima do seu.
- [ ] **IDOR de ponta a ponta** (HTTP real, banco real) para cada rota com `:id`: usuário B tenta usar recurso do usuário A. Hoje existe `org-idor-audit.spec.ts` só para org-memberships, subscrições, solicitações, propostas e debates.
- [ ] **Mass assignment:** enviar `type`, `verified`, `plan`, `authorId`, `id` nos corpos de criação/edição e confirmar que são ignorados ou rejeitados.
- [ ] **Anonimato:** teste que percorre **todas** as saídas públicas de um relato anônimo e confirma ausência de autor, e que **nenhuma** tabela liga usuário a relato anônimo.
- [ ] **Vazamento de segredo em log:** busca de padrões (`eyJ`, `votz_refresh_token`, `sk_`, `whsec_`) na saída dos logs durante a suíte e2e.
- [ ] **Fuzz de DTO:** payloads gigantes, tipos errados, `null`, Unicode estranho, e `__proto__` em cada endpoint de escrita (poluição de protótipo).
- [ ] **Limite de uso:** confirma 429 nas rotas sensíveis (login, MFA, registro, upload, sinalização, API).
- [ ] **Regressão de sessão:** refresh concorrente (tolerância), reuso tardio (revoga), logout-all, ban, troca de senha.
- [ ] **Concorrência de dinheiro:** webhook duplicado e fora de ordem; evento falho reprocessado.

---

## 5. Autenticação, sessão e contas

- [ ] **Recuperação e troca de senha** (A2), com token de uso único, hash no banco, expiração curta, resposta idêntica exista ou não o e-mail, e **revogação de todas as sessões** ao trocar.
- [ ] **Política de senha:** máximo de 72 **bytes** (o bcrypt trunca depois disso); considerar checar senhas vazadas (lista pública de senhas comuns); mínimo atual de 8 é fraco.
- [ ] **Verificação de e-mail:** hoje dá para entrar sem verificar. Decidir: bloquear ações públicas (já exige para sinalizar e relatar) ou exigir já no login.
- [ ] **Token de verificação de e-mail e de convite:** guardados em texto puro? Preferir hash, uso único, validade curta.
- [ ] **Google OAuth:** `state` validado (A6); conta nova sem e-mail verificado do Google.
- [ ] **MFA:** obrigatório para os perfis privilegiados ✅; avaliar **opcional incentivado** para cidadão; códigos de backup com hash ✅.
- [ ] **Sessões:** tela "sessões ativas" (aparelhos) e "sair de todos" no perfil (hoje existe só o endpoint).
- [ ] **Enumeração de contas:** `register` devolve 409 (aceito e documentado). Reavaliar.
- [ ] **Bloqueio de conta como arma:** 5 erros travam a conta por 15 min: confirmar que um atacante não consegue travar administradores à vontade (limite por IP também).
- [ ] **Mudança de e-mail** (se vier a existir): reautenticar e confirmar nos dois e-mails.

## 6. Dados, criptografia e privacidade

- [ ] **Rotação de chave** do `CPF_ENCRYPTION_KEY` documentada e **ensaiada** (o prefixo `v1:` já prepara o caminho). Criar `docs/security/rotacao-de-segredos.md` (modelo: `maskot/docs/ROTACAO_SEGREDOS.md`).
- [ ] **Cifra de outros campos sensíveis** (telefone, endereço?) avaliada contra o custo (não dá para buscar por campo cifrado).
- [ ] **Mínimo de dados em log e em exportação** conferidos (seção 15).
- [ ] **Banco:** usuário da aplicação com **privilégio mínimo** (sem `SUPERUSER`/`CREATE EXTENSION` em runtime); migrations rodando com outro usuário; conexão com TLS.
- [ ] **Backups cifrados**, com acesso restrito, e **restauração testada** (RTO/RPO anotados).
- [ ] **Dados de teste e seed** nunca em produção (`seed.ts` não pode rodar lá).

## 7. Uploads e mídia

- [ ] **Buckets separados:** um **público** (`reports`, `avatars`, `comments`) e um **privado** (`verification`, `exports`), este **sem domínio público** (A5), acesso só por URL assinada de curta duração.
- [ ] **Validação por conteúdo** ✅ já existe (magic bytes). Conferir: **SVG não permitido**, nada de HTML, PDF sem script ativo (avaliar remover JavaScript embutido ou só permitir imagem na verificação).
- [ ] **Limites por tipo antes de ler em memória** (hoje `report-media` lê até 100 MB no buffer): usar limite por rota ou armazenamento em disco/stream.
- [ ] **Antivírus** (ClamAV ou serviço) nos uploads de verificação e áudio; modelo: `maskot/docs/ANTIVIRUS_UPLOADS.md`.
- [ ] **Remoção de metadados** (EXIF/GPS) de fotos antes de publicar. **Ponto de privacidade forte:** foto de celular costuma levar coordenadas exatas, e isso pode **identificar autor de relato anônimo**.
- [ ] **Cabeçalhos de resposta do storage:** `Content-Disposition`, `X-Content-Type-Options: nosniff`, e `Content-Type` fixado pelo servidor.
- [ ] **URLs externas aceitas** (A3, A4): exigir que pertençam à nossa base de storage.

## 8. Tempo real (WebSocket e LiveKit)

- [ ] Autenticação e **revalidação** ✅ (5 min e no ban). Conferir **autorização por sala**: quem pode entrar em `debate:*`, quem recebe eventos de `user:*`.
- [ ] **Limite de mensagens por conexão** no servidor (cooldown de chat não pode depender do front).
- [ ] **Tamanho máximo de mensagem e de payload** do socket.
- [ ] **Origem do WebSocket** restrita ✅ (CORS). Confirmar que o handshake sem `Origin` é recusado.
- [ ] **LiveKit:** permissões do token (publicar só debatedor/moderador); expiração curta; sala criada só pelo servidor; segredo da API fora do front; gravação (`recordingUrl`) com acesso controlado.

## 9. Pagamentos

- [ ] **Teste ponta a ponta em modo de teste do Stripe:** checkout, portal, cancelamento, falha de pagamento, reembolso, evento duplicado e fora de ordem.
- [ ] `PagamentoSucesso.tsx` e o `session_id`: confirmar que a página **não** concede plano (quem concede é só o webhook) e não expõe dados de outra sessão.
- [ ] Preços vindos **só do servidor** (`PRICE_IDS`) ✅. Confirmar que `plan` do cliente não escolhe preço arbitrário.
- [ ] Rebaixamento ao cancelar sem apagar dados ✅ no texto; confirmar no código.
- [ ] Chaves do Stripe de **teste e produção separadas**, restritas, com rotação documentada.

## 10. API pública e abuso

- [ ] Limite de chaves por usuário; revogação testada; **chave mostrada uma vez**.
- [ ] **Raspagem em massa:** paginação máxima, ordenação limitada, e limite por IP **além** do limite por chave.
- [ ] **Fail-open do Redis** no limite por chave (L8): decidir entre falhar fechado ou aceitar o risco por escrito.
- [ ] **Manipulação de apoio/pressão:** várias contas, robôs, brigading de sinalizações. Medir e limitar (por IP, por dispositivo, por conta nova).
- [ ] **Spam de relatos e comentários:** limite por conta nova, por hora; detecção de duplicados.
- [ ] **Custo de embeddings** (Gemini) e transcrição (Groq): teto diário e alerta, para ninguém gerar conta alta.

## 11. Front-end

- [ ] CSP **sem `'unsafe-inline'`** em `style-src` (hoje necessário por causa do Styled Components; avaliar `nonce`).
- [ ] Nenhum `dangerouslySetInnerHTML`, `innerHTML` ou `eval` ✅ (conferido em 14/11 e no popup do mapa). Repetir a busca a cada release.
- [ ] **Esquema de URL** em todo `href`/`src` vindo de dado (`javascript:`, `data:`).
- [ ] **`redirect` de login/cadastro:** confirmar que só aceita caminho interno (sem URL absoluta).
- [ ] Token de acesso só em memória ✅; `localStorage` guarda só perfil básico ✅. Conferir que nada sensível entra lá.
- [ ] **Subresource Integrity** em qualquer script/estilo externo (hoje nenhum).
- [ ] Dependências do front auditadas (`react-router` v6→v7 pendente).
- [ ] Teste manual de **clickjacking** (`frame-ancestors 'none'`) e de **mixed content**.

## 12. Infraestrutura e operação

- [ ] Tudo do `checklist-antes-de-ir-ao-ar.md` (CSP com a API real, `FRONTEND_URL`, segredos, Redis, R2, MapTiler).
- [ ] **Domínio próprio** para web e API **no mesmo site** (ex.: `votz.app` e `api.votz.app`): permite cookie `SameSite=Lax/Strict` e elimina a classe CSRF que hoje só o guard de Origin cobre.
- [ ] **Proteção de borda** (Cloudflare ou equivalente): WAF, limite de taxa, proteção contra DDoS, e `trust proxy` configurado de acordo com a cadeia real.
- [ ] **TLS** moderno, HSTS ✅, e verificação de e-mail (SPF, DKIM, DMARC) no domínio do remetente.
- [ ] **Segredos:** gerenciador de segredos (não em arquivo), acesso mínimo, rotação documentada, e **nenhum segredo no histórico do git** (rodar varredura tipo `gitleaks` no repositório inteiro, incluindo histórico).
- [ ] **Ambientes separados** (dev/homologação/produção) com bancos e chaves distintos.
- [ ] **Acesso administrativo** à nuvem com MFA e contas pessoais (nada de conta compartilhada).
- [ ] **Health check** sem vazar versão nem dependências.
- [ ] **Swagger** realmente desligado em produção (`NODE_ENV=production`) ✅ no código; conferir no ambiente.

## 13. Dependências e cadeia de suprimentos

- [ ] A1: `bcrypt@6`, NestJS 11/12, `adm-zip`, `react-router` v7. Meta: `npm audit --omit=dev` **sem alto/crítico**.
- [ ] CI rodando de verdade no GitHub (nunca rodou) e **bloqueando** merge com vulnerabilidade nova.
- [ ] **Dependabot** ativo (está configurado, falta ver funcionando) e rotina semanal de revisão.
- [ ] **Lockfile** versionado ✅ e `npm ci` no deploy ✅.
- [ ] **Scripts de instalação** (`postinstall`) de dependências revistos; fixar versões críticas.
- [ ] **SBOM** (lista de componentes) gerado a cada release (`npm sbom`).
- [ ] **Proteção do repositório:** branch principal protegida, revisão obrigatória, 2FA para todos os colaboradores, e GitHub secret scanning ligado.

## 14. Observabilidade, incidentes e continuidade

- [ ] **Sentry (ou equivalente)** ligado com redação (`beforeSend`), como no maskot; alerta de erro 5xx.
- [ ] **Eventos de segurança registrados e alertados:** muitos logins falhos, MFA bloqueado, reuso de refresh token (roubo), assinatura inválida de webhook, ban/promoção de papel, exclusão em massa.
- [ ] **Trilha de auditoria de ações de administração** (hoje só a moderação grava): mudança de papel, verificação de entidade/político, mudança de plano, aprovação/recusa de cadastro.
- [ ] **Alerta de uso anormal** da API pública e de custo de IA.
- [ ] **Simulação de incidente** (mesa) com o `plano-de-incidentes.md`: quem faz o quê em 1 hora, como revogar todas as sessões, rotacionar o `JWT_SECRET` e avisar a ANPD (LGPD art. 48).
- [ ] **Restauração de backup testada** e tempo medido.
- [ ] **Página de status/comunicação** em caso de indisponibilidade ou vazamento.

## 15. Alinhamento com os textos legais

Cada promessa publicada precisa ter evidência de que o código cumpre:

| Promessa (documento) | Como provar |
|---|---|
| Relato anônimo não guarda o autor (Termos, Privacidade) | Teste de anonimato (seção 4); revisão de **toda** tabela que referencie `User` |
| Logs de acesso só de início de sessão, por 6 meses | Teste do job de retenção + conferir que nenhuma rota de conteúdo grava |
| Documentos de verificação apagados em 30 dias / 12 meses | Teste do job + bucket privado (A5) |
| Conta inativa avisada e anonimizada | Teste com falha de SMTP (já feito) + conferir SMTP real |
| Exportação completa e link de 24 h | Teste que compara a exportação com **todas** as tabelas do usuário |
| Exclusão apaga cadastro, comentários, áudios | Teste de exclusão com dados em todas as tabelas (inclui `RefreshToken`, `ContentFlag`, `ModerationAction`) |
| Só MFA/CPF cifrados | Conferir no banco real que não há segredo em texto puro |
| Aviso de remoção/banimento | Teste com SMTP falhando |
| Fornecedores e países da Política | Conferir contra a infraestrutura **real** de produção |

## 16. Teste externo (pentest)

- [ ] **Escopo sugerido:** autenticação e sessão (inclui MFA e refresh), autorização entre contas e entre organizações, painel administrativo, upload e leitura de arquivos, WebSocket e LiveKit, pagamentos (Stripe de teste), API pública, e a área de comentários/relatos (XSS, injeção).
- [ ] **Tipo:** caixa-cinza (com contas de cada papel), em **homologação** com dados fictícios.
- [ ] **Entregáveis:** relatório com severidade e prova de conceito, reteste dos itens altos, e declaração de escopo.
- [ ] **Antes de contratar:** corrigir A0 a A6 e fechar o checklist de ida ao ar, para o dinheiro do pentest não ir em problema já conhecido.
- [ ] **Programa de divulgação responsável:** página `/.well-known/security.txt` com o contato.

## 17. Cadência depois do nível A

- **A cada release:** `npm audit`, varredura de segredos, `route-auth-audit.spec.ts`, e a busca por `dangerouslySetInnerHTML`/`eval`.
- **Mensal:** revisão dos alertas do Dependabot e dos eventos de segurança.
- **Trimestral:** reauditoria das rotas **novas** pelo método da seção 3, ensaio de restauração de backup, revisão de contas administrativas.
- **Anual (ou a cada mudança grande):** pentest, simulação de incidente, revisão dos textos legais e da rotação de segredos.

---

## 18. Ordem sugerida em rodadas

| Rodada | Conteúdo | Quem |
|---|---|---|
| **1** | **A0** (escalada moderador→admin) + matriz papel×rota (seção 4) + A3 e A4 (URLs e `mediaKey` do cliente) | Claude confirma → Gemini corrige |
| **2** | Revisão linha a linha dos módulos 🔴 da seção 3 (`admin`, `registration-requests`, `comments`, `debates`) | Claude |
| **3** | A2 (recuperação de senha), bucket privado (A5), EXIF, `state` do Google (A6) | Gemini |
| **4** | Módulos 🟠 e 🟡 da seção 3 + testes de abuso e fuzz (seção 4 e 10) | Claude + Gemini |
| **5** | Atualização de dependências (A1) e CI no GitHub | Gemini |
| **6** | Ambiente de produção: checklist, domínio próprio, borda, monitoramento, backup restaurado | Você |
| **7** | Simulação de incidente, revisão do advogado, **pentest externo**, reteste | Você + Externo |
| **8** | Fechar a seção 1 com evidência e só então declarar "nível A" | Todos |
