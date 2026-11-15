# Votz — Relatório do teste ponta a ponta (15/11/2026)

> **O que foi feito:** a API e o front rodaram de verdade (NestJS na 3000, Vite na 5173) contra o banco local do Docker (PostgreSQL, Redis, MinIO). Foram criadas **contas de teste `qa.*@votz.test`** por papel e por plano, exercitadas por **scripts HTTP** (segurança e funcionalidade) e por **navegação visual** no navegador embutido. No fim, **todos os dados de teste foram removidos** e o banco voltou ao estado original (9 usuários, 8 relatos, 5.573 entidades, 65.778 políticos, 0 empresas, 16 roles).
>
> **Resultado:** **236 verificações, 226 passam, 10 falham.** Dos 10, **8 são achados reais do produto** e 2 são artefato da repetição do meu script (convidar quem já é membro devolve 409).
>
> **Scripts reutilizáveis:** `docs/security/qa-scripts/` (rodam com a API no ar e o Docker ligado; `09-cleanup.mjs` remove os dados de teste).

## 1. Limites do teste (o que NÃO foi coberto)

| Não testado | Motivo |
|---|---|
| **Mapa e popup de relato** | Falta `VITE_MAPTILER_KEY` no ambiente: a tela mostra "Chave do Maptiler não configurada". A reescrita do popup (3B) continua sem verificação visual |
| **Compra no Stripe** | Os IDs de preço não estão configurados (`Plano GESTAO não disponível para ENTITY`). Só dá para validar os guards, não o pagamento |
| **Login com Google** | OAuth externo; não é para testar com credenciais reais |
| **Debates ao vivo (LiveKit) e e-mails** | LiveKit e SMTP não configurados |
| **Anonimato frente a quem opera a infraestrutura** | Só se testou o que o código grava; logs de infraestrutura de produção não existem |
| **Carga e desempenho sob muitos usuários** | Fora do escopo |

Também **não é um pentest**: foi um teste dirigido, com contas de cada papel, dos fluxos principais e das defesas implementadas nas fases 3A a 3C.

## 2. O que funcionou (verificado ao vivo)

**Autenticação e sessão (todas as 17 verificações passaram)**
- Token pré-MFA (`mfa_pending`) **não vale como sessão** (401), nem para abrir o painel de admin. JWT com `alg=none` e com assinatura falsa são recusados.
- Refresh rotaciona o cookie; dois refresh simultâneos funcionam (tolerância de 10 s); reuso **depois** da janela revoga a **família inteira**; `logout-all` derruba as outras sessões.
- CSRF por Origin: `refresh`/`logout` com Origin de outro site ou sem Origin → 403.
- Força bruta: 5 senhas erradas bloqueiam a conta (mesmo a senha certa dá 429); 5 códigos MFA errados bloqueiam. O login tem **tempo igual** para e-mail existente e inexistente (648 ms × 646 ms) e a mesma mensagem.
- Cadastro rejeita `type: ADMIN`, senha fraca, idade não confirmada, versão antiga dos Termos, `__proto__` e corpo de 2 MB.

**Autorização (23 de 23)**
- Matriz papel × rota ao vivo; **A0 corrigido**: moderador não muda papel nem se promove, admin muda com motivo e a mudança fica auditada; ninguém altera o próprio papel; tipos organizacionais recusados.
- Moderador não bane admin nem altera plano; cidadão não aprova cadastro, não dispara sincronização e não lista sinalizações.
- Banimento: o token já emitido, o refresh e o login são recusados; desbanir restaura.
- Mass assignment (`type`, `verified`) rejeitado; perfil de outro usuário → 403; perfil público não expõe e-mail, telefone, CPF nem endereço.
- **Stripe (H2):** membro sem `MANAGE_BILLING`, e dono de outra entidade, recebem 403 em `checkout` e `portal`; webhook com assinatura falsa → 400.

**Conteúdo e uploads (27 de 27)**
- IDOR em comentários (editar/apagar de outro → 403), sinalizações (duplicada 409, própria 403) e moderação removendo o conteúdo de fato.
- XSS: `<script>` e `onerror` removidos na gravação. Injeção SQL em `search`, `similar` e `:id`: sem erro 500 e sem atraso; a tabela `users` seguiu intacta.
- A3/A4: `mediaKey` de pasta privada e mídia hospedada fora do Votz → 400.
- Upload: PNG válido aceito e entregue com `Content-Type` correto; HTML disfarçado de PNG, SVG com script, executável (`MZ`) e `.txt` recusados.

**Logs:** durante toda a bateria, **nenhum** cookie de refresh, JWT ou senha apareceu nos logs da API.

**Cabeçalhos/CORS:** CSP, HSTS, `nosniff` e referrer; sem `X-Powered-By`; a API **nunca ecoa** a origem do atacante; cookie de refresh `HttpOnly` + `SameSite`.

**Anonimato e LGPD:** relato anônimo grava `authorId = NULL`, a saída pública não traz autor e nenhum evento da linha do tempo aponta para o autor; o log de acesso só tem eventos de **início de sessão**. A exclusão de conta apagou usuário, comentários, apoios e sessões, **manteve o relato sem autor e anônimo**, e **preservou o log de acesso** (obrigação legal).

**Funcionalidade:** listagem, filtros, detalhe, "relatos parecidos", políticos (busca entre 65 mil em 128 ms), entidades, partidos, imprensa, debates, propostas, apoio (alterna ao repetir), contestar (só o autor; anônimo não contesta, por desenho), notificações, perfil, exportação LGPD, API pública com chave (revogada deixa de funcionar), planos de **exportação** de entidade e político (Básico 403, Gestão/Pro 200), fluxo de cadastro de organização com aprovação do moderador, MFA na troca de contexto, e **os fluxos visuais** (login, MFA, painel de moderação, menu multi-perfil, detalhe do relato, planos).

## 3. Achados do produto

### 🔴 Alta

**B-1 — Entidades e políticos aprovados pelo fluxo novo não conseguem agir sobre relatos nem propostas** *(confirmado por experimento controlado)*
- A aprovação cria o perfil e a associação (`OrgMembership`), mas o `User.type` continua `CITIZEN`. O código de status e de propostas decide pelo tipo legado: `reports.service.ts` (`updateStatus`, ~linhas 158 a 170), `propostas.service.ts` (~linhas 14 e 75).
- **Prova:** a mesma conta, com o mesmo token de contexto correto, recebe **403 "Não autorizado"** com `type = CITIZEN` e **200** com `type = ENTITY`. O político, mesmo nos planos Mandatômetro Pro e Campanha, recebe **"Apenas políticos podem criar propostas"**.
- **Impacto:** o coração do produto (responder, marcar "em andamento" e "resolvido") e a criação de propostas (funcionalidade paga) **só funcionam para contas antigas de seed**. Comentários e "avocar" funcionam.
- **Correção sugerida:** autorizar pelo **contexto ativo do token** (`ctx.type` e `ctx.id`) e pela permissão da associação (`RESPOND_REPORTS`), não por `user.type`. Corrigir também as demais checagens legadas listadas em `reports.service.ts` (~309 a 348). Cobrir com teste de integração (entidade e político aprovados pelo fluxo real).

**B-2 — Chave de API do nível PAGO por autoatribuição**
- `POST /api-keys` aceita `tier` do cliente. Um usuário comum enviou `{"tier":"PAID"}` e recebeu **10.000 req/h** (o grátis dá 1.000).
- **Correção:** ignorar `tier` do cliente (o servidor decide; PAID só por admin/cobrança); remover o campo do DTO.

**B-3 — Sem navegação no celular**
- O `Navbar.tsx` não tem nenhuma `@media` nem menu hambúrguer. Em 375 px aparecem só "Explorar" e "Entidades"; **"+ Relatar", login e menu do usuário ficam inalcançáveis**. Outros 27 arquivos têm media queries, então o problema é a barra de navegação.
- **Correção:** menu colapsável em telas pequenas, com "+ Relatar" e "Entrar" sempre visíveis.

### 🟠 Média

| # | Achado | Evidência | Sugestão |
|---|---|---|---|
| B-4 | **Solicitação de cadastro com o campo "observação" dá erro 500** | O DTO aceita `note`, o repositório o passa ao Prisma, mas o modelo `RegistrationRequest` **não tem a coluna**. Os formulários de cadastro e de reivindicação enviam `note` quando o usuário preenche | Adicionar `note String?` (migration) ou remover do DTO e do formulário |
| B-5 | **Moderador entra sem MFA** | `MFA_REQUIRED_TYPES = ['ADMIN']`. O moderador consegue banir, remover relatos, aprovar cadastros e ler documentos de verificação. A Política de Privacidade diz "administração" | Incluir `MODERATOR` na lista |
| B-6 | **Agir como instituição sem passar pelo contexto com MFA** | O MFA é exigido na **troca de contexto**, mas `advocate` autoriza só por associação do usuário, sem olhar o `ctx`. A avocação passou com o token de cidadão, antes de trocar de contexto | Exigir `ctx` ativo nos endpoints institucionais |
| B-7 | **Limite de membros por plano não existe** | Plano Básico promete "até 2 membros": ficaram **4 membros ativos** (dono + 3 convites aceitos) | Aplicar o limite no convite e no aceite, por plano |
| B-8 | **Funcionalidades dos planos sem aplicação no servidor** | O servidor só protege por plano as **exportações** (entidade e político) e a criação de proposta. A rota de exportação da empresa (prometida a partir do Business) devolve 404. Dashboard, SLA configurável, webhooks, alertas por e-mail, templates e filiais **não foram verificados** no servidor | Mapear "promessa × código" por plano; remover da página o que não existe |
| B-9 | **Limite de uso por IP pode bloquear usuários reais** | O limitador é por IP (10/s, 50/10 s, 200/min). Uma visita à home faz ~8 chamadas (o `alerts` repete 3 a 4 vezes) e o Brasil tem muito **CGNAT** (milhares de usuários por IP). Foram vistos 429 no navegador durante o teste | Limitar por usuário quando autenticado; limites maiores para leitura; deduplicar as chamadas do front |
| B-10 | **Erros do Prisma despejam os dados de entrada no log** | Um erro de validação imprimiu o payload completo (nome, CNPJ, IDs). Num erro de cadastro, o log poderia ter e-mail, telefone, endereço e o hash da senha | Registrar só o código e a mensagem curta do erro do Prisma |

### 🟡 Baixa e experiência

- **Sem página 404:** rota inexistente mostra só o rodapé, numa tela vazia.
- **Login e cadastro ainda usam o "◆ VOTZ" antigo** (texto), não a marca nova.
- **Data do mandato com fuso errado:** um mandato iniciado em 01/01/2025 aparece como **"dez. de 2024"** (`toLocaleDateString` sem `timeZone: 'UTC'`).
- **Rótulo "Político Inativo"** aparece num político com status `ATIVO` (não verificado). Não achei esse texto no código-fonte; precisa investigar a origem.
- **Indicadores do painel enganam:** "5.573 entidades pendentes" e "65.778 políticos pendentes" são os dados públicos importados, não pedidos de verificação.
- **Dois controllers de notificações no mesmo caminho** (`NotificacoesController` e `NotificationsController`, ambos em `/notifications`): um sombreia o outro.
- **Ruído no console:** todo visitante anônimo gera um `401` do `refresh` (esperado, mas aparece em vermelho).
- **Mensagem de erro do `switch-context`** lista os valores permitidos vazios ("must be one of the following values: ").
- **CSP da API ainda libera `fonts.googleapis.com`** (resíduo do `main.ts`; a API não serve páginas).
- **Reinício constante em desenvolvimento:** o `nest start --watch` recompilou repetidamente e a API ficou fora do ar por alguns segundos. O `tsconfig.tsbuildinfo` é versionado e muda a cada compilação; **provável causa**, não confirmada. Sugestão: tirar do controle de versão.

## 4. Como repetir

```powershell
Start-Process "E:\Dev\Docker\Docker Desktop.exe"   # e depois: docker compose up -d
npm run start:dev --workspace=apps/api             # API na 3000
npm run dev --workspace=apps/web                   # front na 5173
```
```bash
cd docs/security/qa-scripts
node 01-setup.mjs && node 02-orgs.mjs && node 03-reports-contexts.mjs
node 05-plans.mjs && node 06-security.mjs && node 07-functional.mjs
node 09-cleanup.mjs      # remove todos os dados de teste
```
Os scripts usam o Redis para limpar os limites de uso entre as etapas e o `docker exec` no Postgres para verificar e-mails e consultar o banco.

## 5. Prioridade sugerida

1. **B-1** (instituições não conseguem agir) e **B-3** (celular sem navegação): bloqueiam o uso do produto.
2. **B-2** (API paga de graça) e **B-4** (500 no cadastro com observação): correções pequenas e certeiras.
3. **B-5, B-6, B-7**: coerência de MFA e de planos com o que o produto promete.
4. **B-8 a B-10** e os itens de experiência.
