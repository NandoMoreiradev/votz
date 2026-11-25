# Anúncios: objetivo "Mensagens" (chat do Votz e WhatsApp)

Data: 24/11/2026. Frente nova dentro de [anuncios-plano-implementacao-2026-11-21.md](anuncios-plano-implementacao-2026-11-21.md). Pedido do dono: o anúncio com objetivo "mensagem" leva a pessoa direto ao chat da página da empresa no módulo de mensagens; e avaliar o objetivo de mensagem no WhatsApp.

## Como retomar

- **Estado (24/11/2026, sem commit): Etapas 1, 2 e 3 feitas no código** (site, API e celular; o celular só compila). Etapa 1: objetivo `MESSAGES` e `AdDestinationKind` (`URL`, `PAGE_MESSAGE`, `WHATSAPP`), preço por clique com piso de R$ 0,80, endereço do chat montado pelo servidor (`destination-rules.ts`), objetivo, destino e botão combinando (`destinationProblem`), regra de ter alguém com `REPLY_MESSAGES` para ligar, conferência de página só para site, Estúdio, moderação e biblioteca; `WHATSAPP` está no enum mas **a API recusa** até a Etapa 4. Etapa 2: a visão do anúncio (`SponsoredAdView`) ganhou `clickId` e `destination` (`kind`, `orgType`, `orgId`); o site abre o chat por dentro do app com `adPageMessagePath` (sem nova aba) e o celular com `router.push('/conversation/page', { …, adClickId })`; as telas do chat guardam o `votz_click_id` (do caminho por dentro do app e do link de reserva) e o mandam em `adClickId` com a primeira mensagem de texto ou mídia (`PageMessageDto` e `PageMediaDto`, 22 letras), apagando-o depois do envio; o `PageInboxController` chama `AdsConversionsService.recordMessageStarted` **depois** de a mensagem ser enviada, entregando só `userId`, `companyId` e `clickId` (nunca texto, conversa ou anexo; só página de empresa; falha nunca atrapalha o envio). A regra (`messageAttributionProblem`): exibição da mesma pessoa que escreveu, campanha `MESSAGES` com destino `PAGE_MESSAGE`, mesma empresa, clique válido (`clickedAt`, que só é carimbado para clique aceito pelo antifraude) ou abertura do link de reserva (`landedAt`), até 7 dias; uma conversão `CONTACT` por clique (`dedupeKey = msg:<exibição>`), com `source = 'VOTZ_MESSAGE'` e `keyId` nulo (migration `20261124110000`, aplicada só no banco local). Decisão 5 cumprida: conta uma por clique, mesmo em conversa antiga.
- **Etapa 3 (feita em 24/11):** `ad_daily_stats` ganhou `message_conversations` (migration `20261124120000`, aplicada só no banco local). A conversa iniciada soma **só** nessa coluna (`AdsConversionsRepository.record`, ramo `source = VOTZ_MESSAGE`); `conversions` e o valor voltam a ser só do anunciante. O relatório diário (`AdDailyStatView.messageConversations`) e o resumo (`messageConversations`, `costPerMessageCents` = gasto ÷ conversas) trazem os dois números; o Relatório do Estúdio ganhou o cartão "Conversas iniciadas" (com "R$ x por conversa"), a série "Conversas iniciadas" no gráfico e a coluna "Conversas" na tabela; a página Conversões explica que o chat da página não precisa de API. A tela "Preferências de anúncios" (site e celular) ganhou o bloco "Se você escrever para uma empresa depois de tocar num anúncio" (`AD_PREFERENCES_COPY.messagesTitle` e `messagesText`). Textos legais: RIPD v0.1 ([ripd-anuncios-rascunho.md](../legal/ripd-anuncios-rascunho.md), seções 2, 4 e 5), política ([politica-de-anuncios-rascunho.md](../legal/politica-de-anuncios-rascunho.md), "Anúncios de mensagens" na seção 8 e perguntas 6 e 7) e item 10 de [pendencias-antes-de-publicar.md](../legal/pendencias-antes-de-publicar.md).
- **Etapa 4 (feita em 24/11): WhatsApp nível 1.** `AdCreative` ganhou `whatsapp_phone` e `whatsapp_text` (migration `20261124130000`, só no banco local); `WHATSAPP` entrou em `AD_DESTINATION_KINDS_OPEN`. Regras em `packages/shared-types/src/ads.ts`: `normalizeBrazilianMobile` (só celular, DDD + 9 + oito dígitos, com ou sem +55), `whatsappTextProblem` (até 200 letras, sem link), `buildWhatsAppUrl`, `AD_WHATSAPP_COPY` (aviso igual no site e no celular). O servidor monta o `wa.me` (`whatsappDestination`): link e endereço do anunciante nunca valem; o objetivo precisa ser Mensagens e o botão "Falar no WhatsApp". **Clique:** o toque abre o aviso "Abrir o WhatsApp? A empresa vai ver o seu número de telefone"; o `CLICK` (cobrado a R$ 0,80) só sai em "Abrir o WhatsApp" (provado: "Agora não" não grava clique); depois abre `/c/<id>`, que responde 302 para o `wa.me` **sem** o `votz_click_id`. **Número fora do feed:** a visão do anúncio traz só `destination: { kind: 'WHATSAPP' }` e `destinationUrl` aponta para o link do Votz (provado na resposta real de `/ads/next`); a biblioteca pública não mostra número nem mensagem; a moderação mostra os dois; a IA lê a mensagem inicial e ela entra na trava de palavras. Ligar campanha de WhatsApp não exige equipe com `REPLY_MESSAGES`. Estúdio: escolha "Chat da minha página no Votz" ou "WhatsApp", campos de número e mensagem (erros em português simples), edição do anúncio com os mesmos campos (refaz o `wa.me` e volta para revisão), resumo e lista mostram o número formatado. Celular: `Alert` com os mesmos textos antes de abrir.
- **Provado em 24/11:** 369 testes das pastas `ads-conversions`, `page-inbox`, `ads-delivery` e o do muro (mais 238 da Etapa 1); `tsc` limpo em API, `ads-server`, site e celular; **ponta a ponta com API, banco e Redis reais** (22 verificações): o feed entrega o anúncio com `destination` e `clickId` (sem vazar alvo nem preço); clique cobrado a R$ 0,80; mensagem da Maria conta uma conversão `CONTACT` do Votz sem chave, sem valor e sem texto; o relatório do dia soma 1 clique e 1 conversão; segunda mensagem não soma; o clique da Maria usado pelo Carlos não conta; identificador malformado dá 400; link de reserva `/c/<id>` redireciona ao chat com `votz_click_id` e a mensagem depois dele conta; mensagem para página de político não conta; **no navegador** (site, como a Maria): card "Enviar mensagem" no feed de Publicações, toque abre `/conversas/pagina/COMPANY/<id>?votz_click_id=…` por dentro do app, mensagem enviada aparece na conversa e a conversão foi gravada. Dados de teste apagados e portas liberadas.
- **Provado na Etapa 3 (24/11):** 84 testes (repositório que separa as contas, resumo do relatório, conversões, muro, preferências) e `tsc` limpo em API, `ads-server`, site e celular; **com API e banco reais** (9 verificações): o relatório da equipe traz `messageConversations` em todo dia; a mensagem da Maria com o clique soma 1 conversa **sem** mexer em conversões nem em valor, o gasto do clique segue R$ 0,80, a segunda mensagem não soma e quem não é da equipe leva 403. Dados de teste apagados e porta liberada.
- **Provado na Etapa 4 (24/11), com API, banco e Redis reais e o site no navegador:** como João (MFA refeito com autorização do dono em 24/11; segredo só no scratchpad), no Estúdio: objetivo "Receber mensagens", escolha de WhatsApp, número fixo recusado, mensagem com link recusada, campanha criada e enviada para revisão (banco: número normalizado, `wa.me` com acentos certos), lista mostrando "abre o WhatsApp (11) 98765-4321", edição do número (novo `wa.me` e volta para revisão) e **o Relatório com "Conversas iniciadas: 2 · R$ 2,00 por conversa" e "Conversões: 1" à parte** (fecha o que faltava na Etapa 3, que só tinha sido conferido pela API); como Maria no feed: o card "Falar no WhatsApp", o aviso, "Agora não" sem clique, "Abrir o WhatsApp" com clique cobrado e `window.open` do link do Votz, `/c/<id>` com 302 para o `wa.me` sem o identificador do clique. Testes: 865 + 30 (campanhas, regras do WhatsApp, clique, entrega, biblioteca, chat) e `tsc` limpo. Dados de teste apagados; saldo da Conta principal intocado.
- **Etapas 1 a 4 NÃO verificadas:** celular em aparelho (só `tsc`; inclui o `Alert` do WhatsApp e se o Android/iPhone entrega o `wa.me` ao app do WhatsApp); **a tela de moderação com o número e a mensagem** (pede MFA do moderador, não autorizado); o WhatsApp real (nunca abri o `wa.me`, só vi o 302); mensagem com foto ou áudio vinda de anúncio de chat (só no teste do controlador); o texto novo das preferências nunca foi lido em tela. Aprovação do anúncio de teste foi feita direto no banco (a fila humana não foi usada nesta rodada).
- **Decidido pelo dono (24/11):** as cinco decisões da seção 2, todas como recomendado. **O RIPD e a política seguem rascunho: o advogado precisa confirmar** o fato "iniciou conversa pelo anúncio" (perguntas 6 e 7 da política; itens 7 e 8 do RIPD) **e o adendo do WhatsApp** (seção 2 do RIPD, "WhatsApp").
- **Próximo passo:** Etapa 5 (opcional, decisão 4: o `votz_click_id` no texto do WhatsApp para a empresa medir venda pela API de conversões, desligado por padrão, com o aviso na confirmação) **ou** parar aqui. **Antes de ligar campanha de mensagens de verdade:** testar o celular em aparelho, ver a moderação com o número (MFA do moderador, com autorização do dono) e o advogado ler o RIPD, a política e o adendo do WhatsApp.
- **Armadilha de teste:** o conjunto de candidatos da entrega fica 15 s em memória; anúncio criado agora só aparece no feed depois disso. Teste ponta a ponta: sessão por JWT local (`typ: 'access'`), `X-Forwarded-For` diferente por chamada, API na 3000 (o proxy do Vite aponta para lá) e, no navegador, `setAuth(user, jwt)` com `ageConfirmedAt` e os dois `...Version` iguais aos de `legal.ts`; apagar a conta de teste do anúncio **depois** da campanha e do criativo (o anúncio protege o criativo). Gravar arquivo no repositório às vezes dá `UNKNOWN` por um instante (bloqueio do Windows): tentar de novo resolve.
- **Ainda não verificado, de antes:** abertura do WhatsApp no Android e no iPhone; o que a API oficial do WhatsApp (Meta) entrega hoje (seção 5 é conhecimento geral).
- **Arquivos principais:** ver seção 7.

## 1. Diagnóstico (o que existe hoje)

| Peça | Estado |
|---|---|
| Objetivos | Só `AWARENESS`, `TRAFFIC`, `CONVERSIONS` (`schema.prisma`, enum `AdObjective`; `packages/shared-types/src/ads.ts`, `AD_OBJECTIVES`). Não existe objetivo de mensagem. |
| Botão do anúncio | Sempre um link externo `https`: no site `<a href={ad.clickUrl} target="_blank">` (`SponsoredCard.tsx`); no celular `Linking.openURL(ad.clickUrl)` (`sponsored-card.tsx`). `clickUrl` é `votz.org.br/c/<id>`, que leva ao site do anunciante com `votz_click_id`. |
| Destino do criativo | `AdCreative.destinationUrl` é obrigatório e só aceita `https` de site público (`staticLinkProblem`). Não existe "destino = página da empresa no Votz". |
| Chat da página | **Existe**: `page-inbox` (`PageConversation`, `PageMessage`). Empresa é um `OrgType`. Web: `/conversas/pagina/COMPANY/<id>` (`PageMessageButton.tsx`). Celular: `/conversation/page` com `orgType` e `orgId`. Equipe lê com `READ_MESSAGES` e responde com `REPLY_MESSAGES`. **Não é ponta a ponta** (decisão do dono, 20/11): texto cifrado no servidor. |
| Regras de envio do cidadão | Só com e-mail confirmado; quem é da equipe não escreve para a própria página; 10 por minuto e 50 por dia por conversa; bloqueado não escreve (`page-inbox.service.ts`, `sendAsCitizen`). |
| Conversões | API do anunciante (`POST /ads/conversions`, chave `vzc_`) e `AdConversion` com `keyId` **já opcional**; `eventName` aceita `CONTACT`; `dedupeKey` único por conta. A janela é de 7 dias contada de `landedAt` (primeira abertura de `/c/<id>`). |
| WhatsApp | Só existe o texto de botão "Falar no WhatsApp" (`AD_CTA_LABELS`). Um `wa.me/...` colado como destino passa em `staticLinkProblem`. Nunca foi testado. |
| Muro de privacidade | `page_messages` e `conversations` estão em `ADS_FORBIDDEN_SOURCES`, e a tela "Preferências de anúncios" promete que as conversas nunca são usadas. |

## 2. Decisões do dono

**24/11/2026: o dono aceitou todas as recomendações abaixo** (1: por clique, piso R$ 0,80; 2: gravar "conversa iniciada" como conversão, com o fato no RIPD; 3: aceitar o WhatsApp com a empresa vendo o número e tela de confirmação; 4: código do clique no texto do WhatsApp opcional e desligado por padrão; 5: uma conversão por clique, mesmo em conversa antiga). O RIPD continua pendente do advogado.

1. **Como cobrar o objetivo "Mensagens".** Recomendação: **por clique** (como o Tráfego), com piso de preço próprio. Cobrar por "conversa iniciada" exige confiar na atribuição para dinheiro e abre espaço a briga de cobrança; fica para depois. Piso do clique: o do Tráfego hoje é R$ 0,40; mensagem costuma valer mais, então definir (sugestão de partida: R$ 0,80).
2. **Gravar "conversa iniciada" como conversão** (só o fato, nunca o texto; sem uso em perfil ou público; só em relatório do anunciante e otimização do anúncio). Recomendação: sim, com o fato descrito no RIPD (o advogado ainda precisa ver). Ver seção 4.
3. **WhatsApp: a empresa passa a ver o número da pessoa que tocou.** Recomendação: aceitar, com tela de confirmação antes de abrir o WhatsApp. Contradiz, por escolha da própria pessoa, o princípio "o Votz nunca diz ao anunciante quem clicou"; por isso é do dono.
4. **O `votz_click_id` pode ir no texto pré-preenchido do WhatsApp?** Dá medição de venda reaproveitando a API de conversões, ao custo de ligar número e clique na mão da empresa. Recomendação: opcional, desligado por padrão, a empresa escolhe e o aviso na tela de confirmação diz isso.
5. **Contar a conversa quando a pessoa já tinha conversa com a empresa.** Recomendação: conta **uma por clique**, na primeira mensagem enviada depois do clique, mesmo em conversa antiga (o anúncio puxou a pessoa de volta). Como a cobrança é por clique, isso só afeta o relatório.

## 3. Desenho: objetivo "Mensagens" dentro do Votz

### 3.1 Dados

- `AdObjective` ganha `MESSAGES`.
- Novo enum `AdDestinationKind { URL, PAGE_MESSAGE, WHATSAPP }`, coluna `destination_kind` em `ad_creatives` (padrão `URL`).
- `AdCreative.destinationUrl` **continua obrigatório**: para `PAGE_MESSAGE` o servidor grava a URL derivada da própria página (`<APP_URL>/conversas/pagina/COMPANY/<id>`), e para `WHATSAPP` a `wa.me` montada. Assim os apps antigos seguem funcionando por `/c/<id>`, e nada de coluna nula.
- `ad_conversions` ganha `source` (`'API'` padrão, `'VOTZ_MESSAGE'`), para o relatório separar o que veio do chat do Votz do que o anunciante mandou pela API.
- Uma migration só.

### 3.2 Regras de negócio

- Objetivo `MESSAGES` só aceita destino `PAGE_MESSAGE` ou `WHATSAPP`; os outros objetivos só `URL`. O servidor confere (nunca confiar na tela).
- `adChargeUnit('MESSAGES')` = `CLICK`; `adFloorCents('MESSAGES')` = piso novo (decisão 1). As funções hoje só conhecem os três objetivos literais (`ads.ts`, `delivery-rules.ts`, `ads-delivery.service.ts`): trocar o tipo de entrada por `AdObjective` e cobrir com teste.
- **Ligar campanha `PAGE_MESSAGE` exige** que a empresa tenha ao menos um membro com `REPLY_MESSAGES` (senão o anunciante paga clique que ninguém responde). A mensagem de erro diz como resolver, em português simples.
- Conferência da página de destino (`ads-landing`) e o job semanal **pulam** destinos `PAGE_MESSAGE` e `WHATSAPP` (não há site para abrir).
- A IA e a moderação continuam revendo texto e mídia; a tela de moderação passa a mostrar o tipo de destino (e o número, no WhatsApp).

### 3.3 O que a pessoa vê e como o clique funciona

- `SponsoredAdView` ganha `destination: { kind, orgType?, orgId? }` e `clickId` (o token da exibição, hoje só dentro de `clickUrl`). `clickUrl` continua preenchido (fallback e apps antigos). O `apps/ads-server` monta a mesma visão e precisa receber a mesma mudança.
- **Site:** para `PAGE_MESSAGE` o botão vira `navigate('/conversas/pagina/COMPANY/<id>?votz_click_id=<clickId>')` (sem nova aba, sem passar por `/c/`). O evento `CLICK` (cobrado) sai no toque, como hoje.
- **Celular:** `router.push('/conversation/page', { orgType, orgId, name, clickId })`. Sem navegador no meio. Mudança só de JavaScript: sai por `eas update`.
- A tela do chat guarda o `clickId` em memória (e `sessionStorage` no site) até o primeiro envio.
- **E-mail não confirmado:** o servidor de anúncios não pode filtrar por isso (a lista fechada de sinais `ADS_FEATURE_ALLOWLIST` não tem esse atributo, e mudar a lista exige aval). Então a tela do chat mostra "Confirme seu e-mail para enviar mensagens" com o caminho para confirmar. Limite conhecido: clique de quem não confirmou é cobrado e não vira conversa.

### 3.4 Atribuição: "conversa iniciada"

- `POST /page-inbox/:orgType/:orgId/messages` (e `/media`) aceita `adClickId` opcional (22 caracteres base64url, mesmo formato de `isValidClickToken`).
- Depois que a mensagem foi gravada, `PageInboxService` chama `AdsConversionsService.recordMessageStarted({ userId, companyId, clickId })`. **Essa chamada leva só esses três valores, nunca o texto, o id da conversa nem anexo.**
- O serviço de anúncios confere, nesta ordem: o token existe; a exibição é **do mesmo usuário** que escreveu; o anúncio é de campanha `MESSAGES` da **mesma empresa** da página; houve clique (`clickedAt`, que no caminho interno substitui `landedAt` como início da janela de 7 dias); `dedupeKey = "msg:<impressionId>"` (uma por clique). Grava `AdConversion` com `eventName: 'CONTACT'`, `source: 'VOTZ_MESSAGE'`, `keyId: null`, `valueCents: 0`.
- **Falha da atribuição nunca impede o envio da mensagem** (try/catch com aviso no log, como já é com `markLanded`).
- Antes de implementar, conferir no código se `clickedAt` só é gravado para clique válido (antifraude); se não for, a conversão precisa do mesmo filtro.

### 3.5 Muro de privacidade (o que fica de pé)

- O código de `apps/api/src/ads` **nunca lê** `page_messages`, `page_conversations` nem `conversations`. Quem escreve a conversão é o `page-inbox`, entregando três valores. O teste do muro continua passando sem exceção nova.
- O fato "iniciou conversa pelo anúncio" **não entra** em `user.adEngagement`, interesses, público ou qualquer modelo. Teste novo: nenhuma função de sinal por pessoa lê `ad_conversions` com `source = 'VOTZ_MESSAGE'`.
- Atualizar o rascunho do RIPD (`docs/legal/`) com este fato e a justificativa; levar ao advogado junto com os outros pontos já abertos.
- O texto do cidadão no chat não muda: o aviso fixo "esta conversa é com a equipe da página" já existe.

### 3.6 Relatório, biblioteca e Estúdio

- Relatório do anunciante: "Conversas iniciadas" e "Custo por conversa" (reaproveita `conversions` e `cpaCents`, filtrando por `source`).
- Biblioteca pública: `adDestinationHost` devolve "Mensagem no Votz" (ou "WhatsApp"); nunca mostra o número.
- Estúdio, passo "Objetivo": nova opção "Receber mensagens" (texto sugerido: "Levar as pessoas a falar com a sua equipe." / "Cobrado por clique"), e no passo do criativo o botão de destino: "Chat da minha página no Votz" ou "WhatsApp". Textos de botão sugeridos: "Enviar mensagem" (novo, entra em `AD_CTA_LABELS`) e "Falar no WhatsApp" (já existe).

## 4. Desenho: WhatsApp

### Nível 1: abrir a conversa (recomendado)

- Destino `WHATSAPP`: o anunciante informa **número** e **mensagem inicial** (até 200 caracteres, sem link). O servidor valida o número (formato brasileiro: `55` + DDD + 8 ou 9 dígitos) e monta `https://wa.me/<número>?text=<mensagem codificada>`. O anunciante não digita URL.
- Cobrança por clique, igual ao objetivo `MESSAGES`. **Medição: só o clique.** O Votz não sabe se a conversa começou.
- Tela de confirmação antes de sair do app: "Você vai abrir o WhatsApp. A empresa vai ver o seu número. [Continuar] [Cancelar]". O evento `CLICK` (cobrado) sai em **Continuar**, não no toque do card, para não cobrar quem cancelou.
- Site e celular abrem `wa.me` pelo navegador ou sistema (o Android e o iPhone entregam ao app do WhatsApp quando instalado; **não testado**). `/c/<id>` ainda é o caminho, para registrar `landedAt`.
- `ads-landing` pula este destino (o `wa.me` redireciona para o WhatsApp, o que geraria `REDIRECT_OFF_SITE` e, se o WhatsApp recusar a leitura automática, pausaria a campanha depois de duas falhas).
- Política de anúncios (rascunho): a empresa não pode usar o número que recebe para revender ou para lista de transmissão sem o aceite da pessoa; texto a revisar com o advogado.

### Nível 1+: medir venda com o que já existe (opcional, decisão 4)

- A empresa liga uma opção "Incluir o código do anúncio na mensagem": o texto inicial leva `ref: <votz_click_id>`.
- Quando a venda fecha, a empresa (ou o sistema dela) manda a conversão por `POST /ads/conversions`. Nada novo no servidor: a API, a chave `vzc_` e a janela de 7 dias já fazem isso. Falta só documentar o formato para o anunciante e exibir o aviso na confirmação ("o código liga esta conversa a este toque").

### Nível 2: integração oficial com o WhatsApp (não recomendado agora)

Do meu conhecimento da plataforma, a conferir antes de qualquer decisão: exige que o anunciante tenha conta empresarial do WhatsApp; o Votz teria de **receber o conteúdo das conversas**, o que fura o muro de privacidade; e os dados de origem do anúncio só chegam de anúncios da própria Meta, não de links `wa.me`. Ficar fora até haver motivo forte e aval do dono e do advogado.

## 5. Etapas

| Etapa | O que entra | Tamanho |
|---|---|---|
| 0 | Dono decide seção 2 (1 e 2 travam a Etapa 1; 3 e 4 travam a Etapa 4). | — |
| 1 | `MESSAGES` e `AdDestinationKind` no banco e nos tipos; preço por clique; validações do DTO e do serviço de campanhas; regra de `REPLY_MESSAGES` para ligar; landing pula destinos sem URL; Estúdio (objetivo e destino). Só site e API. | médio |
| 2 | `destination` e `clickId` na visão do anúncio (API e `ads-server`); clique interno no site e no celular; `adClickId` no `page-inbox`; `recordMessageStarted`; coluna `source`. | médio |
| 3 | Relatório (conversas e custo por conversa); biblioteca; moderação mostra o destino; textos do Estúdio; RIPD e política de anúncios atualizados. | pequeno |
| 4 | WhatsApp nível 1: número e mensagem no Estúdio, `wa.me` montado no servidor, tela de confirmação, `CLICK` na confirmação, política. | médio |
| 5 | (Opcional) código do clique no texto do WhatsApp e página do Estúdio explicando a API de conversões para esse caso. | pequeno |

## 6. Como provar (por etapa)

- **Jest (obrigatório para Services):** preço e piso de `MESSAGES`; regra "destino combina com objetivo"; `recordMessageStarted` (token inválido, de outro usuário, de outra empresa, fora da janela, repetido, sem clique); falha da atribuição não derruba o envio; o texto da mensagem nunca chega ao serviço de anúncios (teste com espião); número do WhatsApp (válidos e inválidos); URL do `wa.me` montada e codificada.
- **Teste do muro** (já existente): continua passando sem exceção; mais o teste novo da seção 3.5.
- **Banco, Redis e API reais** (como nas outras frentes): campanha `MESSAGES` ponta a ponta com a empresa de teste "Padaria Teste (Claude)", cidadão clicando, mensagem enviada, conversão gravada uma vez, relatório batendo com o banco.
- **Navegador:** passo "Objetivo" e "Destino" do Estúdio; card no feed levando ao chat sem nova aba; confirmação do WhatsApp; 375 px.
- **Celular por USB** (como em 22/11): card levando ao chat da empresa dentro do app; confirmação do WhatsApp e abertura do app do WhatsApp.
- Não afirmar "provado" para o que não rodou; atualizar este documento e o `EM-ANDAMENTO.md` a cada etapa, com data.

## 7. Arquivos principais

- Banco: `packages/database/prisma/schema.prisma` (enum `AdObjective`, `AdCreative`, `AdConversion`).
- Tipos: `packages/shared-types/src/ads.ts` (objetivos, rótulos, `AD_CTA_LABELS`, preços, `SponsoredAdView`, `adDestinationHost`).
- Campanhas: `apps/api/src/ads/ads-campaigns/` (DTO, serviço, repositório).
- Entrega e preço: `apps/api/src/ads/ads-delivery/` (`delivery-rules.ts`, `ads-delivery.service.ts`) e `apps/ads-server/src/`.
- Conversões: `apps/api/src/ads/ads-conversions/` (serviço, repositório, `conversion-rules.ts`).
- Conferência de destino: `apps/api/src/ads/ads-landing/`.
- Biblioteca e revisão: `apps/api/src/ads/ads-library/`, `ads-review/`, `ads-ai-review/`.
- Chat da página: `apps/api/src/page-inbox/` (serviço, controlador, DTO).
- Site: `apps/web/src/components/ads/SponsoredCard.tsx`, `apps/web/src/pages/studio/StudioAdsNew.tsx`, `apps/web/src/components/page-inbox/PageMessageButton.tsx`, tela do chat da página (`PageConversationViews.tsx`).
- Celular: `apps/mobile/src/components/sponsored-card.tsx`, `apps/mobile/src/app/conversation/page.tsx`.
- Legal: rascunhos em `docs/legal/` (RIPD e política de anúncios).
