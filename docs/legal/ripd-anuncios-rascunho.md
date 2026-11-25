# Relatório de Impacto à Proteção de Dados Pessoais (RIPD): anúncios personalizados (RASCUNHO)

> **Atualização de 24/11/2026 (v0.1):** entrou o tratamento "conversa iniciada pelo anúncio de mensagens" (seção 2) e o risco correspondente (seção 4). **Adendo do WhatsApp (mesmo dia, na seção 2):** o destino WhatsApp existe no código e a empresa passa a ver o telefone de quem chama; precisa da revisão do advogado antes de ligar para alguém.
>
> **Estado:** rascunho técnico de 21/11/2026 para o advogado e o encarregado (DPO) completarem e assinarem. Descreve o tratamento como foi **desenhado**; nada de anúncio está em produção. Fonte: [plano de anúncios](../dev/anuncios-plano-implementacao-2026-11-21.md), seção 3, e `packages/shared-types/src/ads.ts`. A estrutura segue os elementos do art. 38 da LGPD e as orientações da ANPD; o advogado deve ajustar ao modelo que a empresa adotar.

## 1. Identificação

| Item | Preencher |
|---|---|
| Controlador | Votz (razão social, CNPJ) — **a preencher** |
| Encarregado (DPO) | **a preencher** |
| Operadores | Provedor de nuvem (Google Cloud, São Paulo, previsto), Cloudflare (R2 e CDN), Google (Vertex AI e BigQuery, previsto), meio de pagamento (Asaas/Stripe) — **confirmar contratos e cláusulas** |
| Data e versão | 24/11/2026, v0.1 (rascunho; v0 de 21/11/2026) |

## 2. Descrição do tratamento

**Finalidade:** mostrar anúncios de empresas no feed do Votz e escolher, entre os anúncios elegíveis, os com mais chance de interessar a cada pessoa; medir exibições, cliques e conversões; cobrar o anunciante; combater fraude.

**Natureza:** perfilamento com modelos de aprendizado de máquina (vetor de interesses por pessoa, previsão de clique), só com sinais de uma lista fechada; anúncio por contexto para quem não deu permissão.

**Titulares:** usuários cidadãos do Votz com 18 anos ou mais. Anunciantes (pessoa jurídica) e seus representantes.

**Dados tratados (lista fechada, `ADS_FEATURE_ALLOWLIST`):**

| Dado | Origem | Precisa de permissão? |
|---|---|---|
| Cidade, estado e seção da tela; posição no feed; hora e dia; tipo de aparelho | pedido do feed | Não (contexto) |
| Cidade, estado e bairro do cadastro | cadastro | Sim |
| Faixa de idade (calculada da data de nascimento opcional; nunca a data) | cadastro | Sim |
| Gênero (opcional) | cadastro | Sim |
| Interesses escolhidos | preferências de anúncios | Sim |
| Empresas seguidas | perfil | Sim |
| Exibições, cliques e anúncios escondidos | eventos de anúncio | Sim |
| Categorias não sensíveis de conteúdo com que interagiu | classificador de sensibilidade | Sim |

**Dados que NÃO são tratados para anúncios (`ADS_FORBIDDEN_SOURCES`):** políticos e entidades seguidos, relatos e apoios, votos em propostas e enquetes, comentários, debates, conteúdo de posts e comentários, **conteúdo de mensagens** (as conversas entre pessoas são cifradas de ponta a ponta; as conversas com páginas ficam cifradas no servidor e a equipe da página as lê), documentos de verificação, CPF, endereço, CEP e coordenadas.

**Conversa iniciada pelo anúncio de mensagens (acrescentado em 24/11/2026).** Anúncio do objetivo "Receber mensagens" abre o chat da página da empresa no Votz. Quando a pessoa escreve para a página depois de tocar nesse anúncio, o Votz grava **o fato** de que houve uma conversa vinda daquele clique, para o relatório da empresa e para cobrar corretamente o que foi medido. Limites:
- **O que é gravado:** uma linha em `ad_conversions` (`source = VOTZ_MESSAGE`, tipo `CONTACT`, sem valor, sem chave de anunciante) ligada à exibição do anúncio (que já guarda a pessoa, como toda exibição), e uma soma no dia do anúncio (`message_conversations`). **Nunca** o texto, o anexo, o id da conversa ou o horário da mensagem além do instante da contagem.
- **Como chega até aqui:** o chat das páginas entrega ao serviço de anúncios só três valores: quem escreveu, para qual empresa e o identificador do clique. Isso acontece **depois** de a mensagem ser enviada; falhar não impede o envio. O código de anúncios continua sem ler as tabelas de mensagens (o muro `ads-policy.spec.ts` segue valendo, sem exceção nova); um teste (`page-inbox.ad-attribution.spec.ts`) confere que o texto e a legenda não chegam ao serviço de anúncios.
- **Quando conta:** uma por clique, só se a exibição é da própria pessoa que escreveu, a campanha é de mensagens, a página é da empresa que anunciou e o clique foi válido (aceito pelo antifraude) ou o link de reserva foi aberto, até 7 dias depois do clique.
- **Para quem aparece:** o anunciante vê só o número ("Conversas iniciadas" e custo por conversa), dentro da regra de agregados. Ele não sabe quem foi; a equipe da página lê a conversa como em qualquer conversa com a página, mas **não** recebe do anúncio a informação de que a pessoa veio dele.
- **O que NÃO faz:** não entra em vetor de interesses, modelo, público, `user.adEngagement` nem em qualquer sinal por pessoa; não muda quais anúncios a pessoa vê.
- **Transparência:** a tela "Preferências de anúncios" (site e celular) diz, em português simples, o que fica registrado.
- **Retenção:** a linha acompanha a retenção dos eventos de anúncio (proposta: 90 dias); a soma do dia, a dos agregados (25 meses).

**Adendo: WhatsApp como destino do anúncio de mensagens (24/11/2026).** A empresa pode escolher abrir uma conversa no WhatsApp em vez do chat do Votz.
- **O que a empresa passa a ver:** o **número de telefone** de quem chamar (é como o WhatsApp funciona; o Votz não envia nada a ela). O Votz **não** diz à empresa quem tocou no anúncio e não grava o telefone da pessoa.
- **Aviso antes de abrir:** o site e o celular mostram "Abrir o WhatsApp? Você vai conversar com [empresa] no WhatsApp. A empresa vai ver o seu número de telefone." (`AD_WHATSAPP_COPY`). O clique só conta (e só é cobrado) depois de a pessoa escolher "Abrir o WhatsApp"; "Agora não" não registra nada.
- **O que sai do Votz:** o redirecionamento `/c/<id>` leva ao `https://wa.me/<número da empresa>?text=<mensagem inicial>`, **sem** o identificador do clique (a empresa não precisa dele e o WhatsApp/Meta não o recebe). A mensagem inicial é escrita pela empresa (até 200 letras, sem link) e revista pela moderação e pela IA.
- **Número da empresa:** é dado da empresa (pessoa jurídica). Não vai no anúncio do feed (a lista de anúncios só diz "WhatsApp"), nem na biblioteca pública; a moderação e o Estúdio da própria empresa o mostram.
- **Sem medição de conversa:** o Votz só sabe do clique; não sabe se a conversa começou nem o que se disse. Não há integração com a API oficial do WhatsApp (decisão: ela exigiria ler o conteúdo das conversas).
- **Termo do anunciante (a escrever com o advogado):** usar o número de quem chamou só para atender, sem lista de transmissão, revenda ou uso em anúncio fora do Votz sem o aceite da pessoa. Hoje o aviso aparece no Estúdio, ao digitar o número.
- **Operador/controlador à parte:** o WhatsApp (Meta) trata o telefone e a conversa segundo os termos próprios dele.
- **Ainda não feito (Etapa 5, opcional):** colocar o identificador do clique no texto inicial, para a empresa medir venda pela API de conversões. Se for feito, o aviso da confirmação precisa dizer que o código liga a conversa ao toque, e este RIPD ganha uma linha.

**Exceção estreita: conteúdo em volta do espaço de anúncio (regra "nenhum anúncio perto de relato contra o anunciante").** Para cumprir a [política](politica-de-anuncios-rascunho.md), a cada pedido de anúncio o feed informa quais publicações estão em volta do espaço (até 6 ids, sem texto). O servidor consulta quais relatos essas publicações citam e **para qual empresa ou filial cada relato foi endereçado**, e tira da disputa as empresas que são alvo. Limites desta exceção:
- **Só exclui.** O resultado nunca escolhe, ordena ou personaliza anúncio, nunca entra em modelo, vetor de interesses ou relatório, e **não é guardado** (vive só durante o pedido).
- **Só ids de empresas saem da consulta.** Nada de texto, título, autor, voto, localização ou qualquer dado de pessoa. O que a pessoa lê, relata ou apoia **não é tratado** para anúncio: o que se consulta é o conteúdo vizinho, não a pessoa.
- **Fica fora do código de anúncios.** A leitura mora em `apps/api/src/content-adjacency/`; o muro (`apps/api/src/ads/ads-policy.spec.ts`) continua proibindo o código de anúncios de ler relatos, e `apps/api/src/content-adjacency/adjacency-boundary.spec.ts` falha se a porta for alargada (outro consumidor, colunas além das de ligação, texto ou autor na saída).
- **Falha para o lado seguro:** se a consulta falhar, nenhum anúncio é mostrado.
- Vale para quem usa versão do aplicativo ou do site que envia a vizinhança; versões antigas entregam sem a regra.

**Retenção (proposta):** eventos brutos 90 dias; agregados 25 meses; vetor de interesses recalculado diariamente e apagado com a conta ou ao desligar a personalização; dados de cobrança pelo prazo fiscal.

**Compartilhamento:** anunciante recebe só números agregados (mínimo de 100 pessoas por recorte). Nada de lista de pessoas, pixel ou envio de dados ao anunciante. Biblioteca pública de anúncios só com dados do anúncio.

## 3. Necessidade e proporcionalidade

- **Base legal proposta:** consentimento específico (opt-in) para a personalização; anúncio por contexto sem perfil para quem não consentiu. **Validar com o advogado** (ver perguntas na [política](politica-de-anuncios-rascunho.md)).
- **Minimização:** faixa de idade em vez de data; bairro em vez de coordenada; categorias em vez de texto; lista fechada com teste automatizado.
- **Alternativa menos invasiva disponível:** sim, o anúncio por contexto, que é o padrão.
- **Direitos do titular:** acesso e exportação (incluídos na exportação LGPD), correção (perfil), exclusão (conta e preferências), revogação do consentimento a qualquer momento, "Por que estou vendo isto?".

## 4. Riscos e medidas

| Risco | Probabilidade / impacto (preencher) | Medidas desenhadas |
|---|---|---|
| Inferência de opinião política ou de dado sensível a partir do comportamento | | Muro técnico: base separada `ads_signals`, usuário de banco sem acesso às tabelas proibidas, lista fechada com teste que falha (`apps/api/src/ads/ads-policy.spec.ts`), classificador de sensibilidade, taxonomia sem temas sensíveis |
| Perfilamento de menores | | Cadastro exige 18 anos; faixa de idade nula para menores; sem personalização sem data válida de adulto |
| Reidentificação por relatórios do anunciante | | Agregados com mínimo de 100 pessoas; sem lista de clientes nem pixel |
| Relato contra o anunciante aparecer ao lado do anúncio dele (conflito de interesse, imagem de parcialidade) | | Regra de vizinhança: o feed informa os itens em volta do espaço e o servidor tira da disputa as empresas alvo de relato ali; falha da consulta = nenhum anúncio. Exceção estreita descrita na seção 2 (só exclui, só ids de empresa, nada guardado), com teste de fronteira |
| Uso político da plataforma por anunciantes | | Proibição de anúncio político e de governo; revisão automática e humana; biblioteca pública |
| Discriminação por gênero ou idade em anúncios (emprego, crédito, imóveis) | | **A decidir:** bloquear segmentação por gênero e idade nessas categorias (recomendado) |
| Conversa com a empresa revelar que a pessoa se interessou por um anúncio | | Anúncio só grava o fato (sem texto), anunciante só vê número, equipe da página não é avisada de que a conversa veio do anúncio, sem uso em perfil ou público, aviso na tela de preferências. **Advogado confirma** que gravar o fato é compatível com "mensagens não são tratadas para anúncios" |
| Fraude e cobrança indevida | | Antifraude, sem cobrança de tráfego inválido, livro-caixa de dupla entrada |
| Vazamento | | Criptografia em trânsito e em repouso, acesso mínimo, registros de acesso, retenção curta |
| Transferência internacional (operadores fora do Brasil) | | Preferência por região São Paulo; cláusulas contratuais padrão da ANPD (Res. CD/ANPD nº 19/2024) onde houver transferência |

## 5. Pendências antes de ativar

1. Advogado e DPO revisam, completam a tabela de riscos e assinam.
2. Política de Privacidade e Termos ganham a seção de anúncios (nova `PRIVACY_VERSION`).
3. Tela de permissão (opt-in) e "Preferências de anúncios" implementadas e testadas.
4. Decisão sobre segmentação por gênero e idade em categorias de emprego, crédito e imóveis.
5. Contratos com operadores revisados.
6. Advogado confirma que a exceção estreita da seção 2 (consulta de conteúdo vizinho só para excluir anúncio) é compatível com a lista de dados que não são tratados para anúncios.
7. Advogado confirma que gravar **o fato** "iniciou conversa pelo anúncio" (sem texto, só número para o anunciante, sem uso em perfil) é compatível com a lista de dados que não são tratados para anúncios e com o aviso dado à pessoa (texto em `AD_PREFERENCES_COPY.messagesText`).
8. Advogado revisa o **adendo do WhatsApp** da seção 2 (telefone visível à empresa, aviso antes de abrir, cláusula do anunciante) antes de ligar esse destino para qualquer empresa.
