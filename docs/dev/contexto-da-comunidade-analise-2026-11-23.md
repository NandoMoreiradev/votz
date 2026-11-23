# Contexto da Comunidade + IA da casa — análise (23/11/2026)

> **Origem:** o dono pediu para analisar algo parecido com as Notas da Comunidade do X (e com o "isso é verdade?" do Grok), valendo para **relatos e publicações do feed**, e com uma **IA que tenha nome de marca do Votz**, não o nome do modelo.
> **Natureza deste documento:** análise e proposta (seções 1 a 10) e, a partir de 23/11/2026 à noite, o registro da **Etapa 1 construída** (seção 11). O dono aprovou o fechamento da seção 10.5 em 23/11/2026 e mandou começar a implementação.

## Como retomar

- **Estado (23/11/2026, noite):** **Etapa 1 construída, atrás da chave `CONTEXT_NOTES_ENABLED` (desligada por padrão), sem commit.** API (módulo `apps/api/src/context-notes/`), banco (2 migrations aplicadas só no banco local), site (cartão, "Pedir contexto", escrever, avaliar, página `/contexto`) e celular (só leitura, pedir contexto e denunciar a nota). Detalhes na seção 11.
- **O que foi verificado:** 76 testes novos (regras e serviço) e 147 nos 12 conjuntos que toquei; **64 verificações por HTTP com banco, Redis e API reais** (fluxo inteiro, inclusive exclusão de conta e restrição do banco); o job de hora em hora disparou pelo cron e pela fila BullMQ; **site visto no navegador** (cartão em publicação e relato, menu, página do colaborador, escrever uma nota pelo formulário, avaliar pela fila). Tipos do site, da API e do celular compilam.
- **O que NÃO foi verificado:** **celular em aparelho** (só compila); envio real do e-mail de nota removida; tela de moderação específica para notas (não existe, só a API e a fila de denúncias); disponibilidade dos nomes (falta INPI); o texto do acórdão do STF; plano do Google sem treino.
- **Próximo passo:** (1) o advogado e o dono revisam os documentos da seção 10.3 (nenhum foi alterado: **Termos, Diretrizes e Privacidade ainda não falam de notas**; o termo do colaborador é um texto provisório na página `/contexto`); (2) levar o colaborar (entrar, avaliar, escrever) ao celular; (3) link para `/contexto` no menu do site (a Navbar está com mudanças suas); (4) aba de notas na moderação; (5) só então ligar `CONTEXT_NOTES_ENABLED`.
- **Arquivos principais:** `packages/database/prisma/schema.prisma` (+ migrations `20261123160000` e `20261123160100`), `apps/api/src/context-notes/*`, `apps/api/src/moderation/*` (novo alvo `CONTEXT_NOTE`), `apps/api/src/mail/mail.service.ts` (aviso `NOTE_REMOVED`), `packages/shared-types/src/context-notes.ts`, `apps/web/src/components/context-notes/*`, `apps/web/src/pages/ContextoDaComunidade.tsx`, `apps/web/src/hooks/useContextNotes.ts`, `apps/mobile/src/components/context-note-card.tsx` e `apps/mobile/src/hooks/use-context-notes.ts`.
- **Decisões que só o dono muda:** nome (seção 5), se a IA pode publicar sozinha (recomendo que não), se nota derruba alcance, se o autor da nota aparece com nome, e o que vale para relato (seção 4). Os números da regra (7 avaliações, 70%, 60%, 15, 30 dias, 5 avaliações para escrever) estão em `context-notes.rules.ts` e são ponto de partida para calibrar com o beta.

## 1. Um esclarecimento rápido

O recurso do X se chama **Notas da Comunidade** (antes, Birdwatch). O **Grok** é a IA do X e as pessoas a usam para perguntar "isso é verdade?". São duas coisas separadas. A boa notícia é que o X já juntou as duas: desde julho de 2025 há uma API em que **IAs escrevem rascunhos de nota**, claramente marcados como feitos por IA, e **só viram nota exibida se pessoas avaliarem como úteis**, pelas mesmas regras das notas humanas ([documentação do X](https://docs.x.com/x-api/community-notes/introduction)). É exatamente o desenho que recomendo para o Votz.

## 2. Como o algoritmo do X funciona (e o que dele serve para nós)

- Qualquer colaborador habilitado escreve uma nota **com fonte**. Outros colaboradores avaliam: "útil", "um pouco útil" ou "não útil", marcando o motivo.
- A nota **só aparece para todo mundo se pessoas que costumam discordar entre si concordarem que ela é útil**. Isso se chama *bridging* (ponte). Tecnicamente, é uma fatoração de matriz: o modelo aprende um "ponto de vista" de cada pessoa a partir de como ela avalia, e separa o quanto a nota é boa do quanto ela agrada a um lado só. Nota que só um lado aprova não passa ([código e documentação abertos](https://raw.githubusercontent.com/twitter/communitynotes/main/documentation/under-the-hood/ranking-notes.md); [artigo do Birdwatch](https://web3.arxiv.org/pdf/2210.15723)).
- O cálculo roda de hora em hora e há uma "inércia" para a nota não ficar entrando e saindo do ar.
- Quem avalia bem (concorda com o resultado final) ganha o direito de escrever notas.

**O que isso significa para o Votz:**

1. **Bridging só funciona com muita gente avaliando.** No início (beta, poucos milhares de pessoas), o modelo de matriz não tem dados. Por isso a proposta tem **duas fases de regra**: uma simples agora, e a de ponte quando houver volume (seção 6).
2. **Detectar "ponto de vista" é inferir opinião política**, que a LGPD trata como dado sensível. Isso pesa mais no Votz do que no X por causa do nosso "muro de privacidade" dos anúncios (seção 7).
3. **Estudos públicos mostram que a maioria das notas nunca chega a ser exibida**; é lento por desenho. Para conteúdo urgente (saúde, violência, golpe), precisamos de uma **via rápida com a moderação** (seção 6, etapa 2).

## 3. O que o Votz já tem e podemos reaproveitar

| Peça existente | Onde | Como serve |
|---|---|---|
| Denúncia com motivo `FALSE_INFO` | `ContentFlag` (`schema.prisma`), `moderation.service.ts`; botão no site (`FlagContentModal`) e no celular (`content-menu.tsx`) | Vira o sinal de **"pedir contexto"**. Hoje o único destino de uma denúncia é remover ou arquivar; falta o meio-termo "acrescentar contexto" |
| Penalidade de alcance por denúncia aberta | `computePostScores` em `feed-ranking.service.ts` (cada denúncia aberta corta 25% do alcance, piso de 25%) | **É um ponto fraco hoje:** qualquer grupo pode combinar denúncias e esconder uma publicação. A nota, que exige fonte e consenso, é uma resposta melhor (etapa 3 troca uma pela outra) |
| Busca por significado | `embedding` (pgvector, 768 dimensões, `gemini-embedding-001`), preenchimento a cada 10 min | Achar **a mesma alegação em outras publicações** e propor a nota que já existe ("claim matching"). Também achar relatos duplicados |
| Cliente do Gemini com tempo-limite e sem chave = sem IA | `press-briefing.analyzer.ts`, `ads-analyzer.ts` | Modelo de como encapsular a IA: o resto do código nunca sabe que é Gemini, então trocar de modelo não aparece para ninguém |
| Regra "IA só anota, não decide sozinha" | revisão de anúncios (`ADS_AI_AUTO_APPROVE` desligado) | Mesma postura aqui |
| Auditoria de moderação | `ModerationAction` | Registrar quando um moderador remove uma nota ou usa a via rápida |
| Fila assíncrona | BullMQ (regra do projeto) | Cálculo de status das notas de hora em hora |
| `User.reputation` | `schema.prisma` | Existe, mas **nenhum código usa**. Não usar para isso: criar um registro próprio de colaborador |
| Vínculo de membro de órgão | `OrgMembership` | Impedir que quem é da entidade, político ou empresa **alvo do relato** escreva ou avalie nota sobre ele |
| Memória (histórico imutável) e `TimelineEvento` | relatos | O histórico de notas de um relato fica registrado e visível |

Não existe hoje: nenhuma tabela de notas, nenhum código com busca na web para IA (o Gemini é chamado só com o texto que a gente manda), nenhuma regra de "confiança" por pessoa.

## 4. Relato e publicação são coisas diferentes

Esta é a decisão de produto mais importante. **Uma publicação do feed faz uma afirmação sobre o mundo** ("a vacina X faz Y", "o político Z disse W"), e isso se checa com fonte. **Um relato é o testemunho de um cidadão sobre um problema na vida dele** ("o posto do meu bairro está sem médico há 3 semanas"), que quase nunca se checa com um link.

Se o mecanismo chamar relato de "falso", três coisas ruins podem acontecer: (a) a entidade ou empresa denunciada usa a nota para desmoralizar o cidadão; (b) o cidadão para de relatar, o que mata o produto; (c) um relato anônimo ganha uma nota, e quem avalia começa a "investigar" quem escreveu.

| | Publicação do feed | Relato |
|---|---|---|
| Nome da nota | "Contexto" (informação que falta ou está errada) | "Contexto" também, mas com **tipos fechados** |
| Tipos permitidos | Correção com fonte, contexto que falta, mídia fora de contexto | **Prova adicional** (foto, link, notícia que confirma), **atualização** ("já foi resolvido", "o local é na rua ao lado"), **duplicado** ("o mesmo problema do relato X") |
| Pode dizer "é falso"? | Sim, com fonte | **Não.** Uma suspeita de relato falso vai pela denúncia (`FALSE_INFO`) para a moderação, que já tem fluxo e é auditada |
| Quem NÃO pode escrever nem avaliar | O próprio autor | O autor, **e quem é membro do órgão alvo do relato** (entidade, político, empresa). Eles já têm a **resposta oficial** |
| Relato anônimo | n/a | A nota **nunca** pode citar o autor, e a tela não mostra quem é o colaborador. Nada novo pode ligar usuário a relato anônimo (regra do Brief 2C continua valendo) |
| Pressão e Apoio | Alcance do feed (etapa 3) | **Nota não mexe na Pressão nem no Apoio** nesta fase (mudaria a conta do `8.3` sem dado para calibrar) |

Recomendo começar pelo feed, que é o caso clássico, e entrar nos relatos com esses tipos fechados logo depois.

## 5. Nome e marca (decisão do dono)

Dois nomes, porque são duas coisas:

- **O recurso (pessoas):** sugiro **"Contexto da Comunidade"** (e o cartão: "Pessoas do Votz acrescentaram contexto"). "Contexto" é menos acusador do que "nota de falso", combina com o tom do Votz (direto, justo) e funciona bem em relato. "Notas da Comunidade" é o nome do X e do Meta, então serve de referência mas não de marca nossa.
- **A IA:** sugiro **"Confere"** ("Confere, a IA do Votz"). É uma palavra que o brasileiro já usa ("confere?"), é curta, é verbo (fica bem como botão: "Pedir pro Confere") e combina com a família de verbos do produto (Avocar, Contestar). Alternativas: **"Vigia"** (vigilância cívica) e **"Clareia"**.
- **Evitar:** nomes já usados por checadores brasileiros e que confundem: *Lupa* (Agência Lupa), *Comprova* (coalizão de jornalismo), *Aos Fatos*, *Fato ou Fake*, *Boatos*.
- **Fora do nome, mas obrigatório:** a tela deve dizer que é **IA** ("Rascunho feito pelo Confere, a IA do Votz"). Marca própria não pode esconder que é máquina, nem o X faz isso. O nome do modelo (Gemini ou outro) não aparece em lugar nenhum da interface.
- **Pendente:** consulta de disponibilidade no INPI e de domínio/perfil antes de decidir. Não foi feita.

## 6. Proposta por etapas

### Etapa 0 — Decisões e jurídico (sem código)
Responder a seção 8 e levar a seção 7 ao advogado (junto da lista de [pendências jurídicas](../legal/pendencias-antes-de-publicar.md)). Atualizar as Diretrizes da Comunidade e os Termos (nota é conteúdo de usuário e vira texto público).

### Etapa 1 — Contexto da Comunidade sem IA e sem matriz (a base)
- **Modelo de dados** (nomes sugeridos, campos em `snake_case` no banco):
  - `ContextNote`: alvo (`POST` ou `REPORT` + id), autor, tipo, texto (até 500 caracteres, passa pelo DOMPurify), **fontes (pelo menos 1 link obrigatório)**, origem (`HUMAN` ou `AI`), status (`PENDING`, `NEEDS_RATINGS`, `SHOWN`, `NOT_SHOWN`, `REMOVED`), datas.
  - `ContextNoteRating`: nota, pessoa, valor (`HELPFUL`, `SOMEWHAT`, `NOT_HELPFUL`), motivos, **único por (nota, pessoa)**.
  - `ContextNoteRequest`: "pedir contexto" (pessoa + alvo, único). **Uma denúncia `FALSE_INFO` também conta como pedido.**
  - `ContextContributor`: quem pode escrever e avaliar, com data de entrada e um indicador de acerto próprio (não usar `User.reputation`).
  - `ContextNoteStatusLog`: histórico imutável de mudanças de status (alimenta a Memória).
- **Quem pode avaliar:** e-mail confirmado, conta com mais de 30 dias, sem banimento, não é o autor, não é do órgão alvo (relato). **Quem pode escrever:** avaliou pelo menos N notas e a maioria das suas avaliações coincidiu com o resultado final. Limite de ritmo com `@nestjs/throttler` + Redis.
- **Regra simples de exibição (fase 1):** a nota aparece quando tem **pelo menos 7 avaliações de pessoas diferentes, 70% ou mais "útil", e sem que a moderação a tenha tirado**. Esses números são ponto de partida para calibrar com dado do beta, não verdade. **Limitação honesta:** regra simples é mais fácil de combinar em grupo do que a de ponte. Por isso a fase 1 vale para um grupo pequeno de colaboradores habilitados, e a moderação continua como rede de segurança.
- **Cálculo por BullMQ de hora em hora**, com inércia (nota só sai do ar depois de duas rodadas ruins seguidas).
- **Telas (site e celular juntos, como manda o projeto):** botão "Pedir contexto" no menu "⋯" (`PostCard` e `content-menu.tsx`), tela de escrever nota, fila "Notas para avaliar" para colaboradores, cartão da nota sob a publicação. **O texto que o cidadão lê em português simples.** Avisar o autor da publicação por notificação (novo tipo em `NotificationType`).
- **Denunciar a própria nota** (ela também é conteúdo e pode ser difamatória). Autor da publicação pode contestar a nota; a contestação cai na moderação.
- **Testes:** Services com Jest (regra do projeto), inclusive: autor não avalia a si mesmo, membro de órgão alvo não avalia, relato anônimo não vaza autor, avaliação duplicada rejeitada, inércia.

### Etapa 2 — Confere, a IA do Votz (rascunho, nunca juiz)
1. **O que o Confere faz:**
   - **Rascunho de nota** para publicações que receberam pedidos de contexto ou denúncia `FALSE_INFO`: identifica a alegação checável, procura fonte na web e escreve o rascunho **com fonte, em português simples**.
   - **Ajuda a quem escreve:** avisa "faltou fonte", "o tom está acusando", "isto é opinião, não fato".
   - **Triagem da fila de denúncias:** ordena `FALSE_INFO` por alcance e urgência, para a moderação ver primeiro o que mais circula.
   - **Em relato:** só apoio de prova e duplicidade (mesma foto reutilizada, endereço que não bate com a localização, relato muito parecido com outro por embedding). **Nunca** julga se o relato é verdadeiro.
2. **O que o Confere NÃO faz (regras duras):** não publica nota sozinho; não aparece como "verificação oficial"; não opina em relato; não decide remoção; não vê nada fora do texto e das mídias públicas da publicação (nada de dado de perfil, localização do autor ou mensagens).
3. **Como entra:** o rascunho entra na mesma fila de avaliação das pessoas, marcado "feito pelo Confere (IA do Votz)", e só é exibido pelas mesmas regras de uma nota humana. O X chegou ao mesmo desenho, e um estudo de campo do MIT em 2026 relata que notas de IA tiveram notas de utilidade maiores que as humanas quando a exposição dos avaliadores foi igualada ([estudo](https://arxiv.org/pdf/2604.02592)). Não validei o estudo a fundo, mas é um bom argumento para o piloto.
4. **Técnica:** classe própria (`ConfereAnalyzer`) no molde do `PressBriefingAnalyzer`, sem chave = sem IA, tempo-limite, cache por alegação, fila BullMQ, e **busca na web com citação de fontes** (o Gemini oferece isso; ainda não usamos). Custo por nota e cota em produção precisam ser medidos antes de ligar (já é pendência da frente de Imprensa).
5. **Via rápida:** para tema crítico (saúde, segurança, golpe) com alto alcance, o moderador pode **publicar um aviso provisório** ("Em checagem") sem esperar o consenso. Registrado em `ModerationAction`, sempre com prazo e sempre trocado pela nota da comunidade ou removido.

### Etapa 3 — Ponte de verdade e efeito no alcance (só com volume)
- Quando houver avaliações suficientes (ordem de **milhares de colaboradores ativos**; definir com dado), trocar a regra simples pelo modelo de matriz do X (o código é aberto) rodando no job de hora em hora, **com o jurídico já tendo aprovado a seção 7**.
- **Alcance:** só aqui, com calibração, decidir se publicação com nota exibida perde impulso no "em alta" e se isso **substitui** a penalidade por denúncia aberta em `computePostScores`. Recomendo **não derrubar alcance na etapa 1**: mostrar a nota já muda o comportamento, e derrubar alcance sem dado vira acusação de censura.
- Mídia: reaproveitar a nota quando a **mesma foto ou vídeo** aparece em outra publicação (hash perceptual; ainda não existe).
- Cartão da nota aparece também em reposts e citações da mesma publicação.

### Resumo de esforço (relativo, sem prometer prazo)
| Etapa | Tamanho | Depende de |
|---|---|---|
| 0 | Pequeno (decisões e jurídico) | O dono |
| 1 | **Grande** (schema, módulo novo, site e celular) | Etapa 0 |
| 2 | Médio (IA, busca na web, custo) | Etapa 1 e cota do Gemini |
| 3 | Médio a grande | Volume de usuários e aval jurídico |

## 7. Pontos para o advogado e o dono do produto (risco, não parecer)

> Isto é um mapa de riscos para levar ao advogado, **não é parecer jurídico**.

1. **Marco Civil, art. 19.** Em 26/06/2025 o STF julgou o art. 19 parcialmente inconstitucional (8 a 3): a plataforma passa a poder ser responsabilizada por conteúdo de terceiros ilícito **sem ordem judicial prévia, depois de notificação**; para crimes contra a honra, continua exigindo ordem judicial; regras do TSE valem em período eleitoral ([notícia do STF](https://noticias.stf.jus.br/?p=98258), [Agência Brasil](https://agenciabrasil.ebc.com.br/justica/noticia/2025-06/stf-decide-que-redes-devem-ser-responsabilizadas-por-conteudos-ilegais), [ConJur sobre o acórdão](https://www.conjur.com.br/?p=871139)). **Consequência prática:** a nota **não substitui** denúncia e remoção; a denúncia continua indo para a moderação com prazo. Li só reportagens, não o acórdão.
2. **A nota é conteúdo de usuário e pode difamar.** Precisa de botão de denunciar, moderação e fonte obrigatória. O Votz continua responsável pelo que mantém no ar depois de notificado.
3. **LGPD e opinião política.** O modelo de ponte aprende "ponto de vista" pelo padrão de avaliação, o que pode equivaler a **inferir opinião política (dado sensível, art. 11)**. Recomendo: (a) na etapa 1, **nenhuma inferência** (regra simples); (b) na etapa 3, levar a inferência ao RIPD, guardar só o necessário e **nunca expor** o ponto de vista de ninguém; (c) **nenhum dado de Contexto entra em anúncio**. O muro dos anúncios usa lista fechada de sinais (`ADS_FEATURE_ALLOWLIST`), então dado novo já nasce de fora, mas vale incluir um teste que garanta isso para as tabelas novas.
4. **Identidade do colaborador.** Recomendo **não mostrar o nome** na nota (o X também não mostra), mas guardar internamente quem escreveu, pelo prazo de retenção, para responder a ordem judicial. Isso precisa constar na política de privacidade.
5. **Relato contra entidade, político ou empresa:** o risco de a nota virar arma de intimidação é real. Por isso a seção 4 proíbe "é falso" em relato e exclui o órgão alvo.
6. **IA:** obrigação de transparência (marcar que é IA), RIPD próprio para o uso do Gemini com texto de usuário (já há pendência igual na Imprensa), e atenção ao projeto de lei brasileiro de IA, que ainda tramita.
7. **Eleições:** em período eleitoral as regras do TSE prevalecem; combinar com o jurídico se a via rápida precisa de regra própria nesses meses.

## 8. Decisões que o dono precisa tomar

1. **Nomes:** "Contexto da Comunidade" para o recurso e "Confere" para a IA servem? Quer outra linha de nome? (Falta checar INPI.)
2. **A IA pode publicar nota sozinha?** Recomendo **não**: só rascunho, avaliado por pessoas.
3. **Nota derruba alcance?** Recomendo que **não na etapa 1**; decidir na etapa 3 com dado.
4. **O colaborador aparece com nome?** Recomendo que **não** (só "Pessoas do Votz").
5. **Quem pode avaliar?** Recomendo e-mail confirmado + 30 dias + sem banimento. Se houver verificação por telefone ou CPF, vale exigir? Mais barreira, menos gente.
6. **Relato recebe Contexto?** Recomendo que **sim, só com os tipos fechados** da seção 4, e depois do feed.
7. **Inferir ponto de vista (etapa 3)** é aceitável para o dono, sujeito ao RIPD? Se **não**, a ponte de verdade fica de fora e ficamos com a regra simples mais moderação.
8. **Via rápida da moderação:** quem na equipe pode usar, e para quais temas?

## 10. Desenho jurídico recomendado (proposta de 23/11/2026, a validar pelo advogado)

> Mapa de como ficar dentro da lei **por construção**. **Não é parecer jurídico.** O advogado confirma cada linha antes do lançamento.

### 10.1 O princípio que organiza tudo

**Contexto acrescenta informação; nunca retira.** Tirar conteúdo do ar continua sendo só da moderação, com motivo escrito, aviso ao autor e canal para contestar (o fluxo do Brief 2C, que já existe). Assim o Votz não vira "censura por algoritmo" e fica no regime conhecido de denúncia e remoção.

### 10.2 Lei por lei: o que fazer

| Lei | O risco | O que o desenho faz |
|---|---|---|
| **Marco Civil, arts. 19 e 21 (tese do STF, 26/06/2025)** | Depois de notificado, o Votz pode responder por conteúdo ilícito de terceiros; para crime contra a honra, só com ordem judicial. Há também "dever de cuidado" para conteúdo ilícito grave em circulação massiva | Nota **não substitui** denúncia. Denúncia continua indo à moderação com **prazo interno definido** (o advogado fixa o número). Botão "Denunciar" também **na nota**. Fila de moderação ordenada por alcance |
| **Marco Civil, art. 20** | Ao tirar conteúdo, avisar o autor com motivo e permitir defesa | Remoção de nota e remoção de publicação já seguem o aviso de moderação (e-mail com motivo e como contestar). Recomendo **avisar também quando uma nota for exibida** sobre a publicação do autor, mesmo sem a lei exigir (não confirmei se exige), com o botão **"Discordo desta nota"**, que cai na moderação |
| **Marco Civil, art. 15 (registros por 6 meses)** | Obrigação de guardar registro de acesso | O módulo `access-log` já existe; garantir que escrever e avaliar nota entram nele. **O log nunca liga usuário a relato anônimo** (regra já escrita nas pendências, item 8) |
| **LGPD, bases legais (art. 7º)** | Tratar dado sem base | Proposta: **legítimo interesse** (segurança e integridade da informação na plataforma), com **teste de balanceamento escrito** (LIA). Não usar consentimento (frágil: dá para retirar a qualquer hora e o recurso para de funcionar) |
| **LGPD, dado sensível (art. 11)** | Inferir opinião política | **Etapa 1 não infere nada** (regra simples, nenhum "ponto de vista"). A etapa 3 só liga se o dono aceitar e o RIPD aprovar (decisão 7) |
| **LGPD, decisão automatizada (art. 20)** | Titular pode pedir **revisão** de decisão tomada só por tratamento automatizado | O status da nota é calculado por regra automática. Então: (a) regra **pública e em português simples**; (b) **sempre** há revisão por pessoa (a moderação) quando o autor ou o colaborador contesta; (c) a IA **nunca** decide sozinha |
| **LGPD, direitos do titular (art. 18) e eliminação** | Pedido de acesso, exportação e exclusão | Contribuições entram na exportação LGPD. **Exclusão de conta:** nota escrita pela pessoa fica com autor anônimo (como na moderação) e as avaliações dela são apagadas ou agregadas. **Toda relação nova com `User` precisa de `onDelete` definido e entrar no teste de exclusão de conta** (aviso do Brief 2C) |
| **LGPD, transferência internacional (art. 33) e RIPD (art. 38)** | Enviar texto de usuário ao Google; ANPD pode pedir RIPD | O texto enviado ao Gemini é **só conteúdo já público** da publicação ou relato (nada de perfil, localização do autor ou mensagens). Confirmar com o Google que o plano usado em produção **não treina com o nosso conteúdo** (pelas regras publicadas, o nível gratuito pode usar; **não verifiquei**). RIPD próprio do Contexto (molde: `docs/legal/ripd-anuncios-rascunho.md`) |
| **ECA Digital (Lei 15.211/2025, em vigor desde 17/03/2026)** | A lei rompe com a maioridade só autodeclarada; a ANPD define os métodos de verificação de idade | Colaborador (quem escreve e avalia) **só maior de 18 anos**; todos podem **ver** as notas. **Atenção:** hoje o Votz guarda só a idade autodeclarada (`ageConfirmedAt`). Isso é uma pendência do **produto inteiro**, não só desta frente, e vai para o advogado e para o acompanhamento da ANPD. Não consegui um cronograma oficial das obrigações |
| **Direito eleitoral (resoluções do TSE)** | Em período eleitoral as regras do TSE prevalecem sobre a tese do STF | O **Confere não escreve rascunho sobre candidato, partido ou eleição** até o jurídico definir regra própria. Esses casos vão só para pessoas e para a moderação. Próxima eleição: municipais de 2028 |
| **Crimes contra a honra** | Nota acusando alguém de crime ou ofendendo | **Diretriz de escrita da nota:** falar do **conteúdo**, não da pessoa; só fato e fonte; **não imputar crime**; sem adjetivo. A moderação remove nota fora disso. O botão de denúncia vale na nota |
| **IA e transparência** | Enganar quem lê | Tela diz "feito pelo Confere (IA do Votz)"; rascunho **sempre** passa por pessoas; guardar, por nota, qual versão e qual instrução geraram o texto (para auditar), com prazo curto de retenção |

### 10.3 Documentos que precisam mudar antes de lançar

1. **Diretrizes da Comunidade:** seção nova "Contexto da Comunidade" (o que é, como escrever, o que é proibido, como contestar).
2. **Termos de Uso:** nota é conteúdo de usuário (licença, moderação, remoção); o Votz pode recusar ou tirar nota.
3. **Política de Privacidade:** nova finalidade, base legal (legítimo interesse), prazos de guarda, IA e Google (entra junto com a pendência já aberta do YouTube).
4. **Termo curto do colaborador**, aceito ao entrar: maior de 18, regras de escrita, aviso de que as avaliações podem ser usadas para medir acerto.
5. **RIPD e teste de balanceamento (LIA)** do Contexto.
6. **Política de uso do Confere** (o que faz, o que não faz, quem revisa).
7. Trocar `TERMS_VERSION` e `PRIVACY_VERSION` em `packages/shared-types/src/legal.ts` e rodar o build do pacote, para o `ConsentGate` pedir novo aceite (regra de manutenção das pendências).

### 10.4 Prazos de guarda (proposta, o advogado ajusta)

| Dado | Proposta |
|---|---|
| Nota exibida e histórico de status | Fica (é a Memória pública do conteúdo) |
| Nota recusada ou removida | Fica registrada na moderação, sem aparecer, pelo prazo de defesa que o advogado definir |
| Avaliação ligada à pessoa | 12 meses ligada ao usuário; depois só agregada |
| Registro de acesso | 6 meses (já é obrigação) |
| Registro do que a IA recebeu e gerou | Prazo curto (sugestão: 90 dias), depois só o texto final da nota |

### 10.5 Fechamento proposto das 8 decisões (com a opção mais segura)

| # | Decisão | Fechar assim | Por quê |
|---|---|---|---|
| 1 | Nomes | **Contexto da Comunidade** e **Confere**, **sujeitos à busca no INPI**. No código, os nomes de tela ficam num arquivo único, então trocar custa pouco | Marca não se resolve por mim; o código nasce neutro (`context-notes`) |
| 2 | IA publica sozinha? | **Não.** Só rascunho, avaliado por pessoas | Art. 20 da LGPD e transparência |
| 3 | Nota derruba alcance? | **Não na etapa 1.** Revisar na etapa 3 com dado | Derrubar alcance é decisão com efeito sobre a pessoa, e precisa de revisão humana |
| 4 | Colaborador aparece com nome? | **Não** ("Pessoas do Votz"), mas o Votz guarda quem escreveu | Reduz retaliação; mantém a obrigação de identificar sob ordem judicial |
| 5 | Quem avalia | E-mail confirmado + 30 dias + sem banimento + **maior de 18** | ECA Digital e antiabuso |
| 6 | Relato recebe Contexto? | **Sim, só nos tipos fechados**, e **depois** do feed | Evita nota virar arma contra o cidadão |
| 7 | Inferir ponto de vista | **Não agora.** Fica para a etapa 3, só com RIPD aprovado | Dado sensível (art. 11) |
| 8 | Via rápida da moderação | Só **moderador e admin**, só para saúde, segurança e golpe, **com prazo e registro** em `ModerationAction` | Responsabilidade clara e auditável |

### 10.6 O que dá para começar já e o que trava o lançamento

**Pode começar agora (atrás de uma chave `CONTEXT_NOTES_ENABLED`, desligada em produção):** schema e migrations, módulo de notas e avaliações, regra simples de exibição, job de hora em hora, telas no site e no celular, testes. Nada disso vai a usuário de verdade.

**Trava o lançamento em produção (chave só liga depois de tudo isto):**
1. Textos novos (10.3) escritos, revisados pelo advogado e publicados com novo aceite.
2. RIPD e LIA assinados.
3. Íntegra do acórdão do STF lida pelo advogado. Uma reportagem de 17/06/2026 fala em **prazo de 60 dias** para as plataformas se adequarem após os embargos; **não confirmei em outra fonte**, então o advogado deve checar a ata.
4. Decisão do advogado sobre a idade autodeclarada (ECA Digital).
5. Processo interno de moderação com prazo (quem atende denúncia de nota, em quanto tempo).

**Etapa 2 (Confere) tem trava própria:** plano do Google sem treino, RIPD da IA, regra eleitoral definida. **Etapa 3:** aprovação do uso de ponto de vista.

## 9. Fontes consultadas

- [Documentação do X: Community Notes e AI Note Writer API](https://docs.x.com/x-api/community-notes/introduction)
- [Código aberto: como as notas são ranqueadas](https://raw.githubusercontent.com/twitter/communitynotes/main/documentation/under-the-hood/ranking-notes.md)
- [Birdwatch: Aggregation and Scoring (Wojcik et al., 2022)](https://web3.arxiv.org/pdf/2210.15723)
- [Estudo sobre LLM como redator de notas no X (arXiv, 2026)](https://arxiv.org/pdf/2604.02592)
- [STF define parâmetros para responsabilização de plataformas (26/06/2025)](https://noticias.stf.jus.br/?p=98258)
- [ConJur: acórdão publicado](https://www.conjur.com.br/?p=871139)
- [Teletime: STF conclui embargos e fixa prazo de adequação (reportagem de 17/06/2026, não confirmada em outra fonte)](https://teletime.com.br/17/06/2026/stf-conteudos-marco-civil-internet/)
- [Senado: ECA Digital entra em vigor (17/03/2026)](https://www12.senado.leg.br/noticias/materias/2026/03/17/eca-digital-para-protecao-on-line-de-criancas-e-adolescentes-entra-em-vigor)

## 11. Etapa 1 construída (23/11/2026, noite) — o que existe e o que ficou de fora

### O que existe
- **Banco (migrations aplicadas só no banco local):** `ContextNote`, `ContextNoteRating`, `ContextNoteRequest`, `ContextContributor`, `ContextNoteStatusLog` (histórico imutável). A nota é de uma publicação **ou** de um relato (constraint no banco recusa os dois). Valores novos de enum: `NotificationType.CONTEXT_NOTE_SHOWN`, `ModerationActionType.CONTEXT_NOTE_REMOVED`, `FlagTargetType.CONTEXT_NOTE`.
- **Exclusão de conta:** a nota fica, sem autor; avaliações, pedidos e vínculo de colaborador são apagados (provado no banco).
- **API (`/context-notes`):** `config`, `shown` (leitura pública em lote, uma nota por conteúdo), `contributor/me`, `contributor` (entrar com aceite do termo), `queue`, criar nota, `requests` (pedir contexto), `:id/rating`. **Moderação (`/admin/context-notes`):** listar, remover com motivo, liberar escrita, suspender e reativar, e rodar a conta na hora (só admin). Denunciar ou discordar de uma nota usa o `POST /moderation/flags` com `CONTEXT_NOTE`; "remover conteúdo" na fila de denúncias remove a nota, grava `ModerationAction` e avisa quem escreveu por e-mail (`NOTE_REMOVED`).
- **Regra (fase 1, sem "ponto de vista"):** a nota aparece com 7 avaliações de pessoas diferentes e 70% de "útil" (ajuda=1, ajuda um pouco=0,5); sai do ar só depois de duas rodadas seguidas abaixo de 60%; vira "não exibida" abaixo de 40% ou ao chegar a 15 avaliações sem passar de 70%, e pode voltar. Conta feita de hora em hora pela fila BullMQ (`context-notes`).
- **Quem colabora:** e-mail confirmado, 18 anos confirmados, conta com 30+ dias, sem banimento, tipo CITIZEN, PRESS, NGO ou RESEARCHER. Para **escrever**: ter avaliado 5 notas e, havendo 5 avaliações já resolvidas, ter coincidido com o resultado em 60% (ou convite da moderação). Autor do conteúdo e membro do órgão alvo (entidade, político ou empresa; filial conta como a empresa) não escrevem nem avaliam. Limites: 1 nota viva por autor e conteúdo, 5 notas por dia, 20 pedidos por dia.
- **Relato:** só aceita prova adicional, novidade e duplicado. "Corrige" e "falta contexto" são recusados com a indicação de usar "Denunciar".
- **Site:** cartão sob a publicação e o relato ("Pessoas do Votz acrescentaram contexto", fonte, "Denunciar ou discordar"), "Pedir contexto" e "Escrever contexto" no menu "⋯", janela de escrever, página `/contexto` (regras, termo do colaborador, andamento, notas para avaliar, pedidos de contexto) e aviso no sino. Leitura em lote: os cartões de um feed viram uma chamada só.
- **Celular:** o mesmo cartão sob publicação e relato, "Pedir contexto" no menu e denúncia da nota.
- **Chave:** `CONTEXT_NOTES_ENABLED` (padrão desligada, documentada em `.env.example`). Desligada, tudo responde "ainda não disponível" e a leitura volta vazia, e o site e o app não mostram nada.

### O que ficou de fora (de propósito ou por limite)
- **Celular em aparelho: não testado.** E o celular **não tem** entrar como colaborador, avaliar nem escrever; isso só existe no site por enquanto.
- **Sem link para `/contexto` na Navbar** (arquivo com mudanças suas); a página abre pela URL, pelo item "Colaborar com contexto" do menu e pelo link "Como funciona" do cartão.
- **Sem aba de notas na moderação**; denúncias de notas aparecem na aba de denúncias existente, com prévia, e a API admin está pronta.
- **Textos legais não mudaram** (Termos, Diretrizes, Privacidade); o termo do colaborador é provisório. É o que trava o lançamento (seção 10.6).
- **Relato anônimo:** como o autor não é gravado, ele **não pode ser excluído** de avaliar ou escrever nota sobre o próprio relato. Limite conhecido; a regra de 7 avaliações dilui o efeito.
- **Sem IA (Confere) e sem "ponte" entre pontos de vista**: são as etapas 2 e 3. Por isso o cartão diz "avaliada como útil por várias pessoas do Votz", e **não** "por pessoas que pensam diferente", que seria falso na fase 1.
- Link da fonte **não é aberto pelo servidor** (só checamos formato: http/https, sem usuário e senha, sem IP, localhost ou rede interna).

### Escolhas minhas que o dono pode mudar
Contas da moderação e de órgãos não colaboram; "Pedir contexto" vale para qualquer pessoa com e-mail confirmado (não só colaborador); os números da regra; o limite de notas e pedidos por dia; o aviso de nota removida reaproveita o fluxo de e-mail de moderação (tipo novo `NOTE_REMOVED` em `mail.service.ts`).

### Como testar de novo
Suba a API com `CONTEXT_NOTES_ENABLED=true` (`API_PORT=3000 CONTEXT_NOTES_ENABLED=true npm run start:dev --workspace=apps/api`). Os testes: `npx jest src/context-notes src/moderation` em `apps/api`. Para ver na tela é preciso criar contas de teste com mais de 30 dias, e-mail confirmado, `ageConfirmedAt` e os aceites de Termos e Privacidade gravados (senão o `ConsentGate` do site bloqueia); a rota `POST /admin/context-notes/recalculate` faz a conta na hora.
