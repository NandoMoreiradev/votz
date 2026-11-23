# Módulo de Imprensa — diagnóstico e roadmap (23/11/2026)

## Como retomar

**Estado (23/11/2026, fim do dia, sem commit):** **As quatro fases estão feitas no código e provadas, exceto o Stripe e a abertura automática de conversa.** 242 testes unitários passam nas áreas tocadas; 48 (Fases 0 e 1), 45 (Fase 2), 33 (Fase 3) e 55 (Fase 4) verificações pela API com banco, Redis, fila, workers e **Gemini reais** (scripts de prova só no scratchpad, dados de teste apagados); telas vistas no navegador. Migrations `20261123120000`, `20261123120100`, `20261123130000`, `20261123130100`, `20261123140000`, `20261123150000` e `20261123150100` **aplicadas no banco local** (não no Railway). **O contato (Fase 4) só existe no web, não no celular.** Efeito colateral local: o worker real indexou os 192 relatos do banco do dono (antes, 0 tinham embedding).

**NÃO verificado:** **a qualidade do briefing em escala** (visto com 4 a 7 relatos de teste; a checagem de "nome de pessoa" é só pedido no prompt, não há detector); **a calibragem do corte da busca** (0,70, ajustado com poucos relatos; `PRESS_SEARCH_MIN_SCORE` muda sem deploy); o botão "Briefing com IA (Pro)" desativado no plano gratuito (coberto pela API, que dá 403, mas não visto na tela); **cobrança no Stripe** (checkout, portal e webhook da imprensa só têm teste unitário com Stripe falso; sem `STRIPE_PRESS_PRO_PRICE_ID` o botão de assinar nem aparece, e o plano Pro é liberado pela equipe); envio real dos e-mails (SMTP do `.env` não foi exercitado; os destinos de teste usam domínio reservado) e o texto dos e-mails na caixa de entrada; login real de jornalista e moderador (os testes usaram token gerado localmente, porque a porta 5173 e a 3000 desta máquina servem outro projeto, e o site de teste subiu em 5199 com proxy para a API em 3001); celular (não há tela de imprensa no app); aprovar no Railway; abrir o CSV no Excel em português (ver "Pendências").

**Decisões que só o dono muda:** **privacidade da IA (RIPD, para o advogado):** o texto digitado na busca e o texto dos relatos públicos (com telefone, CPF, e-mail e link mascarados) saem para a API do Google (Gemini); relato anônimo nunca vai para a IA nem aparece na busca; **briefing só no Pro** (escolha minha: o custo da IA é por surto, não por pessoa, e o dono pediu vantagens pagas); quais camadas ficam abertas ou fechadas; se existe acesso antecipado a surtos (conflita com a missão pública); preços e planos; o opt-in do cidadão para "falar com a imprensa"; texto jurídico (RIPD da imprensa e Termos, para o advogado junto com os dos anúncios). **Escolhas minhas nesta rodada, a confirmar:** credencial ligada ao usuário (`PressCredential`) em vez de `OrgType.PRESS`; moderador e admin decidem (como nas solicitações de organização); aprovar exige o e-mail da redação confirmado; espera de 7 dias depois de uma recusa; só conta CITIZEN, NGO, RESEARCHER ou PRESS sem selo pode pedir; limites de uso do pedido (2 por 10 s, 10 por hora, 20 por dia); CSV passa a sair com BOM, aspas em todo texto e `,` como separador.

**Próximo passo:** (0) piloto: dar o plano Pro à mão (aba Imprensa do `/admin`, só admin, com motivo) a 3 ou 5 redações e ver se usam radar e exportação antes de cobrar; (1) rodar `UPDATE users SET verified = true WHERE type = 'PRESS'` no Railway se alguém já foi promovido a PRESS antes da correção (no banco local não havia nenhum), e aplicar as cinco migrations lá; em produção, deixar o job de preenchimento (a cada 10 minutos, 40 relatos por vez) indexar os relatos antigos e conferir que `GOOGLE_AI_API_KEY` existe e tem cota; (2) definir o preço do Pro, criar o produto no Stripe e pôr o id em `STRIPE_PRESS_PRO_PRICE_ID` (e provar o checkout em modo de teste); (3) decidir se o aceite do pedido de contato abre a conversa sozinho (muda o modelo de segurança das Conversas; ver Fase 4) e levar o checkbox e a caixa de pedidos ao celular; (4) validar com 3 a 5 redações o que realmente usam antes de investir mais.

**Arquivos principais:** `apps/api/src/imprensa/*` (`press-credentials.*`, `press-signals.ts`, `csv.ts`, `ttl-cache.ts`, `imprensa.service.ts`, e da Fase 2: `press-access.service.ts`, `press-plan.*`, `press-radar.*`, `press-series.ts`, e da Fase 3: `press-search.*`, `press-briefing.*`, `press-ai.controller.ts`, e da Fase 4: `press-contact.*`, `dto/press-contact.dto.ts`), `apps/api/src/embedding/embedding.service.ts` (modelo, 768 dimensões, tipo de tarefa), `apps/api/src/reports/jobs/*` (preenchimento de embeddings), `apps/api/src/subscricoes/subscricoes.service.ts` (ramo `pressCredentialId`), `apps/api/src/alerts/alerts.service.ts` (chama o radar quando um surto ativa), `apps/api/src/admin/admin.repository.ts` (`setUserType` concede e retira `verified`), `apps/api/src/mail/mail.service.ts` (3 e-mails), `packages/database/prisma/schema.prisma` (`PressCredential`), `packages/shared-types/src/press.ts` (os `.js` e `.d.ts` compilados ficam no git: rebuildar com `npm run build` no pacote), `apps/web/src/components/press/*`, `apps/web/src/hooks/usePressCredential.ts`, `usePressTools.ts`, `usePressAi.ts`, `usePressContacts.ts`, `apps/web/src/pages/Imprensa.tsx`, `PressEmailConfirm.tsx`, `PressContactInbox.tsx` (rota `/pedidos-da-imprensa`), cartão `PressContactCard` em `ReportDetail.tsx`, checkbox em `CreateReport.tsx`, aba "Imprensa" em `Admin.tsx`.

**Armadilhas:** a tabela `reports` guarda `"createdAt"` e `"pressureScore"` em camelCase (só alguns campos têm `@map`): SQL cru precisa dos nomes entre aspas (há teste de trava em `press-search.repository.spec.ts`); teste com mock não pega erro de coluna, só banco real pega; `GET /conversations/chat/devices/status` dá 401 para token gerado só com `sub`, e o app faz logout (não é bug da imprensa; para teste visual, bloquear o evento `votz:logout`); o limitador de uso fica no Redis em `votz:throttle:*` (apagar essas chaves zera os contadores no teste); `role-matrix.spec.ts` já falhava antes (7 rotas de `/admin/*` sem declarar), sem relação com a imprensa; `prisma generate` dá EPERM no motor com a API rodando, mas os tipos saem.

---

## 1. Como era (diagnóstico)

**Cadastro:** não existia. O cidadão se cadastra como cidadão (`RegisterDto` não tem tipo). `PRESS` só nascia quando um ADMIN mudava o papel em `PATCH /admin/users/:id/type` (motivo de 10 a 500 caracteres, auditado). Sem formulário, documento ou aprovação. `RegistrationRequest` só cobre ENTITY, POLITICIAN e COMPANY. Um único tipo `PRESS` para jornalista, TV, jornal ou portal; sem modelo de veículo.

**Bug crítico:** `User.verified` nunca era gravado como `true` por nenhum caminho (só entidade e político tinham "verificar"). O CSV (`type === 'PRESS' && verified`), o e-mail de surto e o painel "Acesso PRESS" do site usam essa condição, então **não funcionavam para ninguém**. Os testes simulavam `verified: true` e não pegaram.

**O que a imprensa recebia:** 5 endpoints públicos sem login (resumo, tendências, relatos em destaque, ranking de entidades, surtos), a API pública com chave FREE (qualquer usuário cria) e, só para PRESS verificado, um CSV de metadados e o e-mail de surto. Sem cobrança: Stripe e `PlanGuard` só tratam organizações (entidade, político, empresa); não há plano de imprensa em `docs/negocio`.

**Outros problemas achados:**

| Gravidade | Problema |
|---|---|
| Média | CSV sem proteção contra injeção de fórmula (`title` é texto livre do cidadão) e campos de texto sem aspas (bairro é texto livre) |
| Média | `responseRate` do resumo: numerador contava relatos arquivados, denominador não |
| Média | Endpoints públicos pesados sem cache (resumo faz 7 consultas, `count` em tabelas inteiras) |
| Média | Ranking de entidades por contagem bruta (cidade grande sempre lidera); "relatos em destaque" são alegações não verificadas, sem página de metodologia |
| Baixa | Cidades agrupadas por texto e não por `cityKey`; filtro de cidade do CSV não ignora acento |
| Baixa | Nome do arquivo do CSV usa a cidade digitada sem limpeza |
| Baixa | Domínio inconsistente (`votz.com.br` na página, `votz.app` nos e-mails); categoria crua (enum) no e-mail de surto |
| Baixa | Sem tela de imprensa no celular |

## 2. Modelo recomendado

Três camadas: **aberta** (resumo, surtos e tendências, com cache e metodologia), **credenciada gratuita** (exige verificação; sem isso, alguém com interesse se passa por jornalista) e **paga** (ferramentas). Imprensa local de cidade pequena precisa de credencial gratuita sem burocracia.

Credenciamento: pedido com tipo e nome do veículo, site, e-mail da redação (domínio do veículo), links de matérias e comprovante; aprovação manual por moderador. Recomendação original: criar `OrgType.PRESS` (reaproveita equipe, Stripe, `PlanGuard`, webhooks e chave de API PAID). **Nesta rodada foi escolhido o caminho mais leve**, um pedido ligado ao usuário (`PressCredential`), por ser menos invasivo (`OrgType` é usado em autenticação, membros, Stripe e webhooks). Quando entrar o plano pago, a migração para organização continua possível.

## 3. O que faria valer a pena pagar

1. **Radar configurável** por cidade, tema ou entidade (e-mail e webhook). A base existe (`alert-rules`, webhooks), mas só para organizações.
2. **Exportação e API ricas** (link do relato, tempo sem resposta, SLA, entidade, série histórica); o tier PAID da API hoje só o admin concede.
3. **Contato com personagem, com consentimento** (o cidadão marca "aceito falar com a imprensa"; jornalista verificado chama pelas Conversas cifradas).
4. **Dossiê por entidade, político ou cidade** e **link de citação permanente** (relato, data e linha do tempo imutável).

Ressalvas: vender acesso antecipado a surtos conflita com a missão pública (decisão do dono); cobrar pode parecer venda de dado de cidadão, então o que se vende é ferramenta e conveniência, não exclusividade, e isso deve ficar claro nos Termos. Opinião sem pesquisa de mercado: tratar a imprensa primeiro como canal de amplificação e receita secundária.

## 4. IA: vale, pontualmente

Já existem Gemini, embeddings de 768 dimensões com pgvector nos relatos e transcrição.

| Uso | Vale? |
|---|---|
| Busca semântica de relatos (embeddings já existem; falta a consulta; sem LLM generativo) | **Sim, prioridade** |
| Briefing de surto (números por SQL, IA só redige; rotular "gerado por IA"; citar relatos-fonte; um resumo por surto, não por consulta) | **Sim** |
| Detecção de tendência anômala | Não precisa de IA (estatística) |
| IA que escreve matéria, julga veracidade ou aponta culpados | **Evitar** (alucinação, difamação) |

Cuidados: não cruzar relatos anônimos, só mandar à API externa dados já públicos, incluir no RIPD. Ordem: primeiro verificação e credenciamento, depois validar com 3 a 5 redações se pagam por radar e exportação, só então IA.

## 5. Fases

- **Fase 0 (correções):** verificação do usuário, CSV, taxa de resposta, cache, domínio, texto falso, teste do fluxo real.
- **Fase 1:** credenciamento, tela de aprovação no admin, selo.
- **Fase 2:** radar, exportação e API ricas, plano no Stripe.
- **Fase 3:** busca semântica e briefing de surto.
- **Fase 4:** contato com personagem.

---

## Andamento

### 23/11/2026 — Fase 0 e Fase 1 (sem commit)

**Fase 0, corrigido:**
- `User.verified` agora é concedido: aprovar o credenciamento e promover a PRESS em `PATCH /admin/users/:id/type` marcam a conta como verificada; sair de PRESS retira (teste na API e no repositório).
- CSV: todo texto entre aspas, células que começam com `=`, `+`, `-`, `@`, tab ou retorno de carro ganham apóstrofo, quebra de linha vira espaço, BOM para o Excel, colunas novas (`link`, `primeira_resposta_em`, `resolvido_em`, `prazo_resposta`), coluna `votos` virou `apoios`, nome do arquivo só com letras, números e hífen. Estado e categoria inválidos dão 400 (antes davam 500). Filtro de cidade sem acento (`cityKey`, com o texto original como reserva).
- Taxa de resposta do resumo: numerador e denominador na mesma base (relatos não arquivados).
- Cidades nas tendências agrupadas sem acento e maiúscula.
- Cache em memória (1 a 10 min) nos 5 endpoints públicos; `limit` limitado entre 1 e 50.
- Página de imprensa: fonte citada com o endereço real do site, bloco "Como ler estes números" (relatos são alegações, ranking é volume, pressão, taxas, anônimos).
- E-mail de surto com a categoria em português.

**Fase 1, feito:**
- Tabela `press_credentials` (pedido, tipo de veículo, site, e-mail da redação, links de matérias, decisão), confirmação do e-mail da redação por link de uso único (48 h, só o hash no banco), aprovar/recusar/cancelar com motivo, auditoria `USER_TYPE_CHANGED`, aviso no sino e por e-mail.
- Sinais para o moderador (nunca decisão automática): e-mail confirmado, domínio do e-mail combina com o do site, provedor aberto, idade da conta.
- Telas: painel "Credencial de imprensa" na página `/imprensa` (visitante, formulário, pedido enviado, recusada/cancelada), página `/imprensa/confirmar-email`, aba "Imprensa" no painel de moderação.
- Rotas novas (`/imprensa/credenciamento*` e `/imprensa/credenciamentos*`) com guard explícito; passam no teste de auditoria de rotas.

**Pendências desta rodada:** abrir o CSV no Excel em português (que usa `;` como separador e pode juntar tudo numa coluna): decidir entre manter `,`, trocar para `;` ou oferecer as duas; pedir a credencial pelo celular não existe; o limite de uso por IP pode atingir uma redação inteira atrás do mesmo IP.

### 23/11/2026 — Fase 2: radar, plano e exportação (sem commit)

**Radar (avisos por e-mail e sino):**
- Três tipos: **surto detectado** (acionado pelo evento de surto ativado, já existente em `checkSurto`), **relato com muita pressão** e **relato sem resposta há N dias**. Filtros por estado, cidade (sem acento) e tema. Só relatos públicos (não anônimos) e ainda em aberto.
- Rodada a cada 15 minutos pela fila `press-radar` (`jobId` por janela, para não rodar dobrado com mais de uma API); resumo por dia (espera ~20 h entre e-mails) ou "na hora" (Pro). Um aviso por relato em cada regra (e um por surto e dia); até 15 itens por e-mail, o resto vira "E mais N".
- **Linha de base:** ao criar ou religar um aviso, o que já existe entra como "visto"; só o novo vira e-mail.
- Quem tem aviso de surto próprio **deixa de receber o e-mail padrão** de todo surto (quem não tem continua recebendo).
- O `AlertRule` das organizações **não foi tocado** (o radar é um módulo próprio, ligado ao usuário).

**Plano (na credencial):** `GRATUITA` e `PRO`, com os limites num lugar só (`PRESS_PLAN_LIMITS` em `shared-types`): gratuita = 2 avisos (só resumo por dia), CSV de até 90 dias e 1.000 relatos; Pro = 20 avisos (na hora ou resumo), 365 dias e 5.000 relatos, colunas `descricao` e `destinatario_tipo`, JSON e série histórica. Depois de uma queda de plano, só as primeiras regras (por data) valem e "na hora" vira resumo. **Troca manual** pela aba Imprensa do `/admin` (só admin, motivo de 10 a 500 caracteres, auditoria `PRESS_PLAN_CHANGED`). **Stripe** (checkout, portal e webhook com ramo `pressCredentialId`, separado das organizações) no código e testado só com Stripe falso.

**Exportação:** `GET /imprensa/export/csv` (limites do plano), `/export/json` e `/export/serie?granularity=week|month` (Pro). A série conta por turma de entrada (cada relato vale no período em que foi criado; resposta e resolução contam mesmo se vierem depois) e inclui relatos anônimos, porque só traz contagem e datas, nunca texto.

**Telas (página `/imprensa`):** botões de JSON e série (desativados com "(Pro)" no gratuito), caixa "Seu plano" (com contato para o piloto ou botão do Stripe), painel "Radar de avisos" (criar, pausar, religar, apagar), aviso do radar no sino. Na aba Imprensa do `/admin`, o admin vê o plano de cada credencial aprovada e troca com motivo.

**Achado:** o nível `PAID` da chave de API pública **não muda nada no código** (só é gravado e exibido), então o plano Pro não mexe nele; vale decidir o que `PAID` deve dar antes de prometer "API" ao jornalista.

**Pendências desta rodada:** provar o Stripe em modo de teste; ver o e-mail do radar na caixa de entrada; a tabela `press_radar_hits` cresce sem limpeza (vale apagar achados enviados com mais de 90 dias); a pressão é a do Votz (sem escala fixa), por isso o formulário só sugere "perto de 50"; sem tela do radar no celular.

### 23/11/2026 — Fase 3: busca por significado e briefing de surto com IA (sem commit)

**Achados que mudam o resto do sistema (corrigidos):**
- O modelo de embedding do projeto, `embedding-001`, **foi desligado pelo Google (erro 404)**. Por isso nenhum relato tinha embedding (0 de 192 no banco local) e a sugestão de "relatos parecidos" ao criar relato **não funcionava**, sem aviso (o erro era engolido). Agora usa `gemini-embedding-001` reduzido a 768 dimensões (o tamanho da coluna), com tipo de tarefa (`document` para o que fica guardado, `query` para o que é digitado) e conferência do tamanho do vetor. Modelo trocável por `EMBEDDING_MODEL`.
- A consulta antiga de similaridade (`findByEmbedding`) usava `created_at` e `pressure_score`, mas as colunas são `"createdAt"` e `"pressureScore"`: **também nunca teria funcionado**. O corte de similaridade dela (0,60) deixaria passar tudo com o modelo novo (texto sem relação fica perto de 0,60); subiu para 0,72.
- **Preenchimento de embeddings:** o job só rodava para relato novo. Agora um trabalho a cada 10 minutos (`backfill-embeddings`, fila `reports`, `jobId` por janela) indexa até 40 relatos sem embedding, os mais novos primeiro, e para ao primeiro limite de uso do Google. Provado com o worker real: os 192 relatos do banco local foram indexados.

**Busca por significado** (`GET /imprensa/busca`, qualquer credencial aprovada): o texto vira vetor (cacheado 10 min por texto) e a busca usa pgvector com filtros de estado, cidade (sem acento), tema e período. Só relatos públicos (não anônimos) e não arquivados. Corte de relevância 0,70 (`PRESS_SEARCH_MIN_SCORE`); nota de 0 a 100 na tela. Gratuita: 10 resultados em 90 dias; Pro: 30 em 365. Mostra quantos relatos públicos ainda não foram indexados. Nada do que a pessoa digita entra no texto do SQL (só como parâmetro). Medido com Gemini real: relevante 74 a 83, sem relação abaixo de 70, texto sem sentido devolve vazio; "pacientes sem medicamentos nas unidades de saúde" acha relatos que falam "sem remédio no posto" sem repetir palavra.

**Briefing de surto** (`GET /imprensa/surtos/:id/briefing`, **só Pro**): os números (relatos, públicos, com resposta, pressão, bairros, entidades, situação) saem do banco; o texto (manchete, resumo, queixas ligadas aos relatos-fonte, perguntas para a entidade, cuidados) vem do Gemini (`gemini-2.5-flash`, `PRESS_BRIEFING_MODEL`). Gerado **uma vez por surto**, guardado (`press_surto_briefings`) e servido a todos por 12 h (30 min se a IA falhou); pedidos simultâneos dividem uma geração. Medidas de segurança:
- Só relatos públicos vão para a IA (até 15, os de maior pressão); telefone, CPF, e-mail e link são trocados por marcas antes.
- Os relatos entram como dados em JSON, com instrução de ignorar ordens dentro deles (provado: uma ordem escondida num relato, com número e link, foi ignorada).
- A resposta da IA só vale se for JSON no formato, **sem nenhum algarismo (fora números que fazem parte do nome da cidade ou do bairro), sem link e sem HTML**, com tamanhos limitados e referências para relatos que existem. Se falhar, pede de novo uma vez; se falhar de novo ou a IA estiver fora do ar, o briefing sai **só com os números**, sem texto de IA, marcado como tal.
- A tela mostra "Escrito por IA" e o aviso de que os relatos não foram confirmados e o texto pode errar.

**Telas (página `/imprensa`):** painel "Busca por significado" e botão "Briefing com IA" em cada surto ativo, com o briefing aberto abaixo (manchete, resumo, queixas com [n] ligando ao relato, perguntas, cuidados, números do banco, fontes e aviso).

**Pendências desta rodada:** provar a qualidade com surtos reais e volume (o corte 0,70 e o prompt foram ajustados com poucos relatos); detector de nome de pessoa na saída da IA (hoje só o pedido no prompt); limpar briefings antigos (a tabela guarda o histórico); custo da IA em produção (cada surto novo gera uma chamada de texto, cada busca nova uma de embedding, cada relato uma de embedding); sem busca nem briefing no celular.

### 23/11/2026 — Fase 4: contato com personagem, com consentimento (sem commit)

**Desenho (e por que não abre conversa sozinho).** Qualquer pessoa já pode chamar outra nas Conversas (convite que o destinatário aceita), respeitando "quem pode me chamar" e bloqueios. Então a Fase 4 não cria canal novo: é uma **camada de consentimento** para o jornalista pedir contato a quem **marcou "aceito falar com a imprensa"** no relato. Ela **não abre conversa, não revela telefone nem e-mail** de ninguém: o cidadão escolhe o que compartilhar ao aceitar. Não liguei o aceite à abertura automática do chat porque (a) o `CLAUDE.md` exige aval do dono para mudar o modelo de segurança das Conversas (abrir exigiria passar por cima de "quem pode me chamar" e do teto diário), (b) neste ambiente as Conversas estão desligadas (`CONVERSATIONS_ENABLED` não está ligado e não há o container do Matrix), então eu não conseguiria provar, e (c) `ConversationsModule` nem exporta o serviço.

**Quem faz o quê:**
- **Autor** (relato público): checkbox "Aceito falar com a imprensa" ao criar o relato (web) e liga/desliga depois em um cartão na lateral da página do relato. Em relato anônimo o aceite é ignorado (fica falso, o servidor força) e nunca aparece.
- **Jornalista Pro** (credencial aprovada): botão "Pedir contato" na página do relato, com mensagem de 20 a 500 caracteres. A marca "✓ aceita falar com a imprensa" aparece também nos resultados da busca. Acompanha tudo no painel "Pedidos de contato" da página `/imprensa`; só vê a resposta do autor se ele aceitou; recusa aparece só como "sem disponibilidade", **sem motivo e sem denúncia**.
- **Cidadão**: aviso no sino e e-mail (com o texto do pedido); página nova `/pedidos-da-imprensa` com o veículo (nome, tipo, site), o jornalista, o relato e a mensagem. **Aceitar** (com recado opcional de até 300 caracteres, só o jornalista lê, e a opção "prefiro as Conversas do Votz"), **Recusar** (agora não / não quero / **abusivo, que denuncia e bloqueia**) e "não receber mais deste jornalista".

**Proteções (todas no servidor, provadas com banco real):** só Pro, **sem teto por dia e sem limite de pedidos pendentes à mesma pessoa** (decisão do dono, 23/11); um pedido por relato (no banco, contra duas abas); 7 dias sem poder pedir de novo a quem recusou; pedido vale 14 dias (depois aparece como "venceu" e não dá para aceitar); jornalista que perde a credencial some da caixa do cidadão e não pode mais ser aceito; **5 recusas "abusivo" suspendem os pedidos do jornalista** até a moderação revisar, e a fila de credenciais mostra "N denúncias de abuso" no cartão dele; bloqueio e recusa recente dão **a mesma mensagem** ("não está recebendo pedidos agora"), sem revelar o que a pessoa fez; cidadão comum que olha o relato nunca descobre se o autor aceitou; o veículo é guardado como cópia no pedido (o cidadão vê quem pediu mesmo que a credencial mude).

**Migrations** `20261123150000` (avisos) e `20261123150100` (coluna `reports.press_contact_ok`, `press_contact_requests`, `press_contact_blocks`), aplicadas só no banco local. Novos avisos: `PRESS_CONTACT_REQUEST`, `PRESS_CONTACT_ACCEPTED`, `PRESS_CONTACT_DECLINED`.

**Provado:** 242 testes unitários nas áreas tocadas; 55 verificações pela API com banco e Redis reais (criar relato com e sem aceite, inclusive anônimo; estado do botão para autor, jornalista Pro, gratuito e curioso; pedido, aceite, recusa abusiva com bloqueio, suspensão por abuso, cancelar, vencer e perder a credencial), **refeitas em parte com as regras novas** (24 verificações: só Pro, validade de 14 dias, vários pendentes à mesma pessoa, 10 pedidos no mesmo dia, espera de 7 dias, 4 denúncias ainda pedem e 5 suspendem); fluxo inteiro visto no navegador (aceite no relato, pedido, caixa da autora com as opções de recusa, aceite com recado e a resposta chegando ao jornalista).

**NÃO verificado:** abrir a conversa a partir do aceite (decisão pendente, ver acima); e-mail do pedido na caixa de entrada; celular (o checkbox ao criar o relato e a caixa de pedidos só existem no web; **o celular não tem nada disto**, então quem usa só o app não consegue marcar o aceite nem responder); o texto do e-mail e dos avisos revisado por alguém de jurídico/produto.

**Decisões que são do dono:** (1) deixar o aceite abrir a conversa sozinho (exige mudar "quem pode me chamar" para esse caso, e o aval do `CLAUDE.md`); (2) ~~aceite por padrão no perfil~~ (decidido: não); (3) **decididos pelo dono em 23/11/2026:** só Pro e sem teto por dia; repetição afrouxada (vários pendentes à mesma pessoa, 7 dias de espera após recusa, validade de 14 dias; continua um pedido por relato); suspensão a partir de 5 denúncias de abuso; o aceite continua relato a relato (sem preferência no perfil); (4) texto jurídico do consentimento e do e-mail, para o advogado junto com o RIPD.

**Armadilhas:** a chave das consultas de contato no web inclui o id de quem está logado (sem isso, trocar de conta no mesmo navegador mostrava o estado da outra pessoa); a página do relato tem outra caixa de texto antes do formulário de pedido, então testes por script devem achar o campo pela dica de preenchimento.

**Alteração de 23/11/2026 (decisões do dono sobre o contato):** o limite do plano deixou de ser `contactRequestsPerDay` e virou `canRequestContact` (só o Pro); o endpoint de pedido mantém só um limite técnico contra robô (120 por hora e 600 por dia por IP, bem acima do uso real); `ABUSE_SUSPEND_AT` = 5, `DECLINE_COOLDOWN_DAYS` = 7, `EXPIRES_DAYS` = 14 (em `PRESS_CONTACT_LIMITS`, `shared-types`). Efeito prático de tirar as travas: um jornalista pode deixar vários pedidos pendentes na mesma pessoa e mandar muitos pedidos por dia; quem protege o cidadão é a recusa, o bloqueio, a espera de 7 dias e a suspensão no quinto abuso.
