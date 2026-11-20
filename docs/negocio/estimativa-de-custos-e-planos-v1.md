# Votz — Custo de operação e estratégia de planos (v1, 15/11/2026)

> **O que é este documento:** uma estimativa de **quanto custa manter o Votz no ar**, **quanto sobra por cliente pagante** e uma **proposta de planos para discutirmos**. Os preços dos serviços foram pesquisados em 15/11/2026, mas **a maioria vem de sites de terceiros**, e os preços mudam; **confirme nos sites oficiais antes de decidir** (links na seção 9). Os números dos cenários são **estimativas de planejamento**, não orçamento. Os impostos são **hipóteses para o seu contador confirmar**.
>
> **Câmbio usado:** US$ 1 = R$ 5,56 (fechamento de 11/11/2026).

## 0. Decisões já tomadas (15/11/2026)

| Decisão | Origem |
|---|---|
| **Plano "Campanha" está fora do radar**, sem data para voltar. Motivo: evitar risco jurídico e eleitoral (venda de visibilidade a candidatos). **A implementação precisa ser removida**: `PoliticianPlan.CAMPANHA` no schema, `PRICE_IDS` em `subscricoes.service.ts`, a página `Planos.tsx` e o código de expiração de mandato | Dono do produto |
| **Primeiros clientes esperados: políticos e entidades** | Dono do produto |
| **Badge de responsividade e destaque saem dos planos pagos** | Dono do produto |
| **Governo paga por boleto ou Pix via Asaas** (a modalidade jurídica ainda precisa de advogado) | Dono do produto |
| **Sem meta de receita nos primeiros 12 meses.** A meta é **adoção**: cidadãos relatando e políticos usando | Dono do produto |
| **Preço por porte e ferramentas de trabalho, não visibilidade** | Concordado na conversa |

## 1. Conclusões em cinco linhas

1. **A infraestrutura é barata perto da receita de um cliente.** No lançamento ela custa **~R$ 830/mês**; com tração (30 mil cidadãos ativos), **~R$ 2,8 mil**; em escala (300 mil), **~R$ 18 mil**.
2. **Poucos clientes pagantes cobrem a infraestrutura:** **2 políticos ou 2 entidades** cobrem o custo fixo do lançamento. O desafio do Votz **não é custo, é conseguir clientes** e confiança.
3. **Quem gera custo (cidadão) não paga; quem paga (políticos, entidades) gera pouco custo.** É assim por desenho, e é saudável, mas obriga a cobrar de forma que a receita acompanhe o crescimento (seção 4).
4. **Receber por Pix/boleto via Asaas custa ~R$ 2 por cobrança; cartão custa ~3%.** Para planos de R$ 800 a R$ 3.200, isso é ~R$ 25 a R$ 100 de diferença por mês por cliente, e **o governo não paga por cartão**. Recomendo o **Asaas** como meio principal de recebimento e emissão de nota.
5. **O preço deve ser definido pelo valor para o cliente, não pelo custo.** Como o custo por cliente é baixíssimo (~R$ 15/mês), qualquer plano acima de R$ 150 tem margem de contribuição acima de 90%. O que falta descobrir é **quanto cada tipo de cliente aceita pagar**, e para isso precisamos conversar com eles antes de construir (seção 8).

## 2. Como ler os números

- **Infraestrutura:** o que o código do Votz usa hoje: API, banco, Redis, armazenamento, mapa, e-mail, monitoramento, debates ao vivo, transcrição de áudio e IA de similaridade.
- **Custo fixo** = infraestrutura + outros custos fixos (contador e domínio, **R$ 440/mês** por premissa). **Não inclui pessoas** (seu tempo, suporte, vendas), marketing, advogado nem cartório (seção 5).
- **Custo variável por cliente** = imposto + tarifa de cobrança + nota fiscal + **R$ 15/mês** por organização ativa (armazenamento, e-mails, transcrição, parte da verificação). Esse R$ 15 é **premissa** a medir.

## 3. Preços dos serviços (pesquisados em 15/11/2026)

| Serviço | Para quê | Preço usado | Confiança |
|---|---|---|---|
| **Render** (API) | Servidor da API | Standard **US$ 25/mês** (2 GB); Starter US$ 7 (512 MB) é pequeno demais para Nest + filas. Mais caros: Pro US$ 85, Pro Plus US$ 175 | Média. A Render mudou planos em ago/2026; confirmar |
| **Render** (site estático) | Front | **US$ 0** | Média |
| **Render Key Value** (Redis) | Filas e limites de uso | 1 GB **US$ 20**, 3 GB US$ 60, 5 GB US$ 100. **O plano grátis (25 MB, sem persistência) não serve** para filas e sessões | Média (preços mudaram em 1º/out/2026) |
| **Neon** (Postgres) | Banco de dados | Computação **US$ 0,106 por CU-hora** (Launch) ou US$ 0,222 (Scale); armazenamento ~**US$ 0,35/GB** | Média (fontes divergem) |
| **Cloudflare R2** | Fotos, vídeos, áudios, documentos | **US$ 0,015/GB-mês**; leitura **sem cobrança de saída**; 10 GB grátis | Alta (preço publicado e estável) |
| **MapTiler** | Mapa | **O plano grátis é só para uso não comercial.** Flex **US$ 25 a 30/mês** (25 mil sessões); Unlimited US$ 295 | Média |
| **Resend** (e-mail) | E-mails do sistema | Pro **US$ 20/mês** (50 mil e-mails). Amazon SES: ~US$ 0,10 a 0,16 por mil | Média |
| **Sentry** | Erros e monitoramento | Team **US$ 26 a 29/mês** | Média |
| **LiveKit Cloud** | Debates ao vivo | Build grátis; Ship **US$ 50/mês** (150 mil min-participante); Scale US$ 500. **Custo de gravação/transmissão (HLS) não confirmado** | Média/baixa |
| **Groq** (Whisper) | Transcrição de áudio | **US$ 0,111 por hora de áudio** | Alta (página oficial) |
| **Gemini** (embeddings) | Relatos parecidos | ~**US$ 0,15 por milhão de tokens** (desprezível) | Média |
| **Asaas** | Cobrança | Pix e boleto **R$ 1,99** por cobrança recebida (promoção R$ 0,99 nos 3 primeiros meses); cartão à vista **2,99% + R$ 0,49** | Média (tabela padrão; o contrato pode variar) |
| **Asaas** (NFS-e) | Nota fiscal | **R$ 0,49 por nota emitida** (só conta PJ) | Média |
| **Stripe Brasil** | Cartão | **~2,9% + R$ 0,30** (fonte de terceiros); Pix via parceria com a EBANX, taxa não confirmada | Baixa |
| **Focus NFe** (alternativa de NFS-e) | Nota fiscal | Relatado de ~R$ 90 a R$ 550/mês (fonte concorrente) | Baixa |

## 4. Cenários de custo da infraestrutura

### S1 · Lançamento (~5 mil cidadãos ativos/mês, poucas organizações)
| Item | US$ | R$ |
|---|---|---|
| API no Render (1× Standard) | 25 | 139 |
| Redis (Key Value 1 GB) | 20 | 111 |
| Banco (Neon, 0,25 CU ligado + 3 GB) | 20 | 113 |
| Arquivos (R2, ~50 GB) | 2 | 11 |
| Mapa (MapTiler Flex) | 27 | 150 |
| E-mail (Resend Pro) | 20 | 111 |
| Monitoramento (Sentry Team) | 29 | 161 |
| Debates ao vivo (LiveKit grátis) | 0 | 0 |
| Transcrição (Groq, ~50 h) | 6 | 31 |
| IA de similaridade (Gemini) | 1 | 3 |
| **Total** | **149** | **R$ 831** |

### S2 · Tração (~30 mil cidadãos ativos/mês)
Render 2× Standard R$ 278 · Redis 3 GB R$ 334 · Banco (1 CU + 20 GB) R$ 469 · R2 R$ 70 · MapTiler com excedente R$ 334 · E-mail R$ 222 · Sentry R$ 161 · LiveKit Ship + gravação R$ 556 · Groq R$ 309 · Gemini R$ 28.
**Total ≈ US$ 496 · R$ 2.760/mês.**

### S3 · Escala (~300 mil cidadãos ativos/mês)
Render (2× Pro Plus + worker) R$ 2.419 · Redis 5 GB R$ 556 · Banco Neon Scale (4 CU + 200 GB) R$ 3.993 · R2 R$ 639 · MapTiler Unlimited R$ 1.640 · E-mail (SES) R$ 890 · Sentry Business R$ 495 · LiveKit Scale + excedente R$ 3.892 · Groq R$ 3.086 · Gemini R$ 278 · Cloudflare Pro R$ 139.
**Total ≈ US$ 3.242 · R$ 18.027/mês.**

**Custo de infraestrutura por cidadão ativo:** S1 ≈ R$ 0,17 · S2 ≈ R$ 0,09 · S3 ≈ R$ 0,06. Quanto mais cidadãos, **menos custa cada um**.

**O que mais pesa quando cresce:** banco de dados, **debates ao vivo** (LiveKit) e **transcrição de áudio**. Os dois últimos são **recursos premium naturais** (debates de políticos e entidades), e podem ser limitados ou cobrados por uso.

> **Atenção ao MapTiler:** o plano grátis é só para uso não comercial. Em produção, o Votz precisa do Flex (~R$ 150/mês). O excedente de sessões é caro (US$ 2 por mil), então vale ler as regras de uso e considerar alternativas de mapa se o tráfego do mapa crescer muito.

## 5. O que NÃO está nos números (e costuma ser o maior custo)

| Item | Por que importa |
|---|---|
| **Seu tempo e de quem ajudar** | Suporte, verificação manual de cadastro (documentos), moderação, vendas |
| **Vendas e marketing** | Políticos e prefeituras não compram sozinhos: é venda ativa, reuniões, demonstração |
| **Advogado** | LGPD, contratos com governo (Lei 14.133), **parecer eleitoral** para vender a candidatos, termos de uso |
| **Contador** | Enquadramento no Simples (Anexo III ou V), emissão de nota, retenções de imposto quando o cliente é governo |
| **Imprevistos** | Pico de uso, ataque, câmbio (parte é em dólar) |
| **Backup e recuperação** | Teste de restauração, retenção |

## 6. Receber, nota fiscal e impostos

**Recomendação: usar o Asaas como meio principal.**
- Aceita **Pix, boleto e cartão** (o governo e muitas empresas pagam por boleto/Pix, **não por cartão**), emite a **NFS-e** e cobra recorrência.
- Custo de cobrança por mês: **R$ 2,48** (Pix/boleto + nota) contra **~R$ 25 a R$ 37** (cartão) num plano de R$ 800 a R$ 1.200.
- O código já integra o **Stripe**. Trocar exige trabalho (assinaturas, webhooks, conciliação). Sugestão: manter o Stripe só se quiser cartão internacional; **construir a integração com o Asaas para o mercado brasileiro**.

**Impostos (hipóteses, confirmar com contador):**
- Software e SaaS pagam **ISS** (não ICMS). No **Simples Nacional**, a alíquota inicial é de **6% (Anexo III)** ou **15,5% (Anexo V)**; o **Fator R** (folha ÷ receita, 28% ou mais) decide o anexo, e as faixas seguintes sobem. Usei **11%** como valor de planejamento.
- Fontes dizem que a **NFS-e pelo padrão nacional** passou a ser obrigatória para ME/EPP do Simples a partir de setembro de 2026 (confirmar).
- **Cliente governo** costuma **reter** impostos na fonte; isso reduz o valor que cai na conta. Perguntar ao contador.

## 7. Economia por cliente e ponto de equilíbrio

**Quanto sobra de cada cliente por mês** (Pix/boleto, após imposto, tarifa, nota e R$ 15 de custo variável):

| Plano atual do site | Preço | Líquido (imposto 6%) | **Líquido (11%)** | Líquido (15,5%) | Cartão (11%) |
|---|---|---|---|---|---|
| Político Mandatômetro Pro | R$ 800 | R$ 735 | **R$ 695** | R$ 659 | R$ 672 |
| Entidade Gestão | R$ 1.200 | R$ 1.111 | **R$ 1.051** | R$ 997 | R$ 1.016 |
| Entidade Pro | R$ 3.200 | R$ 2.991 | **R$ 2.831** | R$ 2.687 | R$ 2.736 |
| Empresa Starter | R$ 300 | R$ 265 | **R$ 250** | R$ 236 | R$ 242 |
| Empresa Business | R$ 1.200 | R$ 1.111 | **R$ 1.051** | R$ 997 | R$ 1.016 |
| Empresa Enterprise | R$ 3.500 | R$ 3.273 | **R$ 3.098** | R$ 2.940 | R$ 2.994 |

**Clientes pagantes para cobrir o custo fixo** (infra + R$ 440):

| Cenário | Custo fixo/mês | Políticos (R$ 800) | Entidades (R$ 1.200) | Empresas (R$ 300) |
|---|---|---|---|---|
| S1 Lançamento | R$ 1.271 | **2** | **2** | 6 |
| S2 Tração | R$ 3.200 | 5 | 4 | 13 |
| S3 Escala | R$ 18.467 | 27 | 18 | 75 |

**Clientes necessários para sobrar uma renda líquida mensal** (no S1, vendendo só um plano):

| Meta líquida/mês | Políticos (R$ 800) | Entidades (R$ 1.200) | Empresas (R$ 300) |
|---|---|---|---|
| R$ 3.000 | 7 | 5 | 18 |
| R$ 8.000 | 14 | 9 | 38 |
| R$ 20.000 | 31 | 21 | 86 |

**Leitura:** com ~10 organizações pagantes o Votz **se paga** e já sobra algum dinheiro; com ~30 há uma operação saudável. **O custo de infraestrutura não é o limite. O limite é a velocidade com que conseguimos clientes.**

## 8. Proposta de planos v1 (para discutirmos; nada aqui está validado)

### Princípios (acordados na conversa)
1. **Responder relatos e atualizar o status é grátis para todos.** É o coração do produto e não pode ter paywall.
2. **Reputação (Votz Score, selos, posição) é conquistada por desempenho e nunca vendida.** Por isso **badge de responsividade e destaque saem dos planos pagos**.
3. **Cobramos ferramentas de trabalho e inteligência**: equipe, análise, alertas, relatórios, integrações. **Não cobramos visibilidade nem ranking.**
4. **O que é público é igual para todos.** O plano pago melhora o **trabalho do cliente**, não a posição dele diante do cidadão.
5. **Preço por porte** (tamanho do mandato, do município, da empresa), não um valor único.

### Político: "o que vender de mais sucinto"
A ideia é vender **ferramentas que o político usa no dia a dia e que o ajudam a se comunicar com os eleitores**, sem comprar influência:

| Ferramenta (hipótese) | Por que um político pagaria |
|---|---|
| **Prestação de contas pronta** (PDF e página pública): demandas atendidas por bairro e por mês | Material de comunicação com a imprensa e o eleitor, sem trabalho |
| **Cartões para redes sociais gerados automaticamente** ("12 demandas resolvidas em outubro") | Conteúdo pronto para Instagram, WhatsApp e stories |
| **Mapa de calor de demandas por bairro** e alertas de surtos na área | Saber onde atuar |
| **Equipe do gabinete** com permissões (assessores respondem, o político aprova) | Escala o atendimento |
| **Modelos de resposta** e fila de demandas com prazo (SLA) | Produtividade |
| **Widget do mandatômetro** para o site/blog do político | Transparência embutida onde ele já tem público |
| **Exportação e API** para o sistema do gabinete | Integração |

**Campanha (R$ 5.000 único):** recomendo **retirar até haver parecer de advogado eleitoral**. "Destaque na home no período eleitoral" pode ser tratado como **propaganda eleitoral paga** e fere o princípio de apartidarismo. Os "compromissos públicos" (prometer e acompanhar) podem ser **grátis para todos** como instrumento de transparência.

**Preço por porte (hipótese):** vereador de município pequeno **R$ 190 a R$ 290/mês**; prefeito e deputado estadual **R$ 490**; deputado federal, senador e governador **R$ 990**. O preço atual (R$ 800 para todos) é caro para a maioria dos vereadores e barato para cargos majores.

### Entidades (prefeituras, secretarias, hospitais, concessionárias)
| Plano | O que inclui (hipótese) |
|---|---|
| **Básico (grátis)** | Perfil, responder e atualizar status, 2 membros |
| **Gestão** | Fila e atribuição por setor/departamento, **SLA configurável**, painel e relatórios, **exportação para transparência (LAI)**, equipe de 5 a 15 |
| **Integração** | API e webhooks, integração com sistemas de ouvidoria, várias secretarias, suporte prioritário |

**Venda para o governo (formato):** **contrato anual**, faturado por **boleto/Pix via Asaas** depois do empenho, com **nota fiscal**. Preço por **faixa de população** (hipótese): até 20 mil habitantes ~**R$ 590/mês**, 20 a 100 mil ~**R$ 1.490**, acima de 100 mil ~**R$ 3.200**; secretaria ou hospital isolado ~**R$ 790**. **Confirmar com advogado e contador:** modalidade de contratação (dispensa/inexigibilidade, Lei 14.133/2021), retenções de imposto, certidões exigidas, e se o valor anual cabe nos limites de contratação direta.

### Empresas (segunda fase)
O foco inicial são políticos e entidades. Empresas ficam para depois; quando vierem, o modelo do **Reclame Aqui** é uma referência: responder é grátis, e se paga por análise, fluxo e integração.

### O que sai da página de planos hoje
- Badge de responsividade, destaque na listagem, destaque na home, "Candidato Comprometido" como produto pago.
- Itens **sem implementação no servidor** (SLA configurável, webhooks, templates, filiais, alertas, analytics) **só voltam à página quando existirem**.
- Hoje só 3 pontos são realmente aplicados por plano: **exportação de entidade**, **exportação de político** e **criar proposta**. O limite de membros não é aplicado.

## 9. Como validar antes de construir

1. **Entrevistas (2 semanas):** 5 vereadores/assessores, 5 secretarias ou prefeituras, 3 empresas. Perguntar: **qual dor, quanto pagam hoje por algo parecido, quem decide, como pagam**. Hoje não temos nenhum dado de disposição a pagar.
2. **Clientes fundadores:** 5 políticos e 3 entidades com **desconto de 50% por 12 meses** em troca de feedback, em vez de abrir os planos para todos.
3. **Não construir toda a lista de benefícios.** Construir **2 ou 3 ferramentas** que as entrevistas mostrarem mais valiosas.
4. **Gatilho para ligar a cobrança** (sugestão, ajustável): cidadãos reportando de forma regular, por exemplo **1.000 relatos/mês** e **pelo menos 30 organizações respondendo toda semana**. Antes disso, a prioridade é **adoção**, que é o objetivo declarado do projeto.

## 10. Decisões e perguntas em aberto

| # | Pergunta | Quem responde |
|---|---|---|
| 1 | Qual é o **regime tributário** do Votz do Brasil (MEI, Simples? Anexo III ou V?) e a alíquota efetiva esperada | Contador |
| 2 | **Contratação pelo governo:** qual modalidade, limites e retenções | Advogado e contador |
| 3 | **Vender a candidatos** é permitido? Em que condições? | Advogado eleitoral |
| 4 | Adotar o **Asaas** como meio principal? Manter o Stripe? | Você |
| 5 | Aceita **preço por porte** (cargo e população)? | Você |
| 6 | Quanto tempo você pode dedicar a **vendas e suporte**? | Você |
| 7 | **Meta dos primeiros 12 meses**: sugestão de partida é "cobrir o custo fixo e 10 organizações pagantes" | Você |
| 8 | Qual é o **custo real** do LiveKit (gravação e transmissão) em 1 debate típico? | Teste prático. **Em 20/11/2026 a pergunta deixou de valer para os debates novos:** eles passam por uma live do YouTube incorporada, então o Votz **não paga gravação, transmissão (HLS) nem banda por espectador**. O LiveKit continua só nos debates antigos e nas chamadas de Conversas. O custo novo é a cota da YouTube Data API (gratuita no uso previsto: cada link colado ou canal verificado gasta 1 unidade, de 10.000 por dia) |

### Pergunta registrada em 18/11/2026: quanto custam chamadas de voz e vídeo nas Conversas?

Resposta curta: **hoje, nada** (as chamadas só entram na Etapa 4 do [plano de Conversas](comunicacao-e-pulso.md)); **depois, o custo é por minuto de participante no LiveKit Cloud, que o Votz já usa nos debates**, e as chamadas dividem a mesma cota com eles.

- **Como se conta:** minutos-participante. Uma chamada de 1 para 1 com 10 minutos gasta **20 minutos-participante** (2 pessoas × 10 min). O plano Ship (US$ 50/mês) inclui 150 mil minutos-participante, ou seja, algo como **7.500 chamadas de 10 minutos por mês** dentro do que já se paga. Exemplos (conta feita com os números deste documento, não com medição): 1.000 chamadas de 5 min = 10 mil min-participante (cerca de 7% da cota); 10.000 chamadas de 8 min = 160 mil min-participante (já passa um pouco da cota).
- **Voz custa menos que vídeo:** vídeo consome mais banda, e a banda é cobrada à parte. **Preços confirmados em 18/11/2026 na [página oficial](https://livekit.com/pricing.md):** Ship (US$ 50/mês) inclui 150 mil minutos e 250 GB de saída, e cobra excedente de US$ 0,0005 por minuto e US$ 0,12 por GB, com **limite de 1.000 conexões simultâneas**. Scale (US$ 500/mês) inclui 1,5 milhão de minutos e 3 TB, cobra US$ 0,0004 por minuto e US$ 0,10 por GB, com limite de 5.000 conexões simultâneas. Acima disso, Enterprise sob consulta. (Uma resposta anterior deste documento dizia que o excedente e a banda não estavam confirmados; agora estão, e **a banda pesa tanto quanto os minutos**.)
- **Não gera custo extra de gravação:** o plano de produto veda gravar chamadas privadas, então não há custo de armazenamento nem de processamento de gravação (esse custo continua só nos debates).
- **Provavelmente sem custo novo:** aviso de chamada (push) usa os serviços gratuitos do Android e do iPhone; a conta de desenvolvedor da Apple já é necessária para o aplicativo.
- **O que pode aumentar a conta:** chamadas longas, vídeo em grupo, muitas chamadas simultâneas num dia de pico e **debates ao vivo no mesmo período** (disputam a mesma cota). O plano de produto já começa por chamadas individuais e deixa grupos para depois, o que mantém o custo previsível.
- **Controles que o produto deve ter desde o início:** só entre pessoas que já aceitaram a conversa; voz como padrão e vídeo opcional; duração máxima por chamada; limite de chamadas simultâneas e por pessoa por dia; alerta quando a cota mensal passar de um percentual definido.
- **Alternativa para reduzir custo no futuro:** operar o LiveKit em servidor próprio (troca a conta por minuto por custo de servidor e de tráfego, e traz trabalho de operação). Só vale a pena com volume alto e equipe para operar.
- **Falta medir:** o custo real de uma chamada típica (a pergunta 8 da lista abaixo, hoje só para debates) deve incluir uma chamada de voz e uma de vídeo de 10 minutos em aparelhos reais, quando a Etapa 4 for testada.

### Pergunta registrada em 18/11/2026: e se hospedarmos o LiveKit em servidor próprio? Onde, e quanto custa em escala?

**Onde NÃO dá: no Render.** O Render só expõe tráfego público por HTTP(S), em uma porta ([documentação de WebSocket](https://render.com/docs/websocket); respostas da equipe e pedido de recurso aberto na [comunidade](https://community.render.com/t/opening-up-a-udp-port-for-incoming-traffic/821); confirmar com o suporte do Render, porque as fontes são antigas). O LiveKit precisa de **UDP** público (faixa 50000–60000/UDP, ou uma porta única, e TURN em 3478/UDP), TCP 7881, domínio com certificado válido e, no Kubernetes, rede direta no nó (clusters "serverless" não são suportados), segundo o [guia oficial de implantação](https://docs.livekit.io/transport/self-hosting/deployment/). Por isso o Render **continua hospedando a API** e o LiveKit vai para **máquinas virtuais com IP público**, de preferência em São Paulo (latência de chamada). Cada sala precisa caber em um único servidor. Para vários servidores, é preciso Redis. Gravação e transmissão dos debates exigem o serviço de egress do LiveKit, que consome bastante CPU e entra na conta de servidores (não dimensionado aqui). **A migração é só configuração**: a API lê `LIVEKIT_URL`, `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET`, então dá para começar na nuvem do LiveKit e trocar depois sem reescrever código.

**O que decide o custo é a banda, não o servidor.** Capacidade de referência do [benchmark oficial](https://docs.livekit.io/transport/self-hosting/benchmark/) (16 núcleos): reunião de vídeo com 150 pessoas a 85% de CPU, cerca de 93 MB/s de saída; transmissão com 1 apresentador e 3.000 espectadores a 92% de CPU, cerca de 531 MB/s. Um servidor de 16 vCPU custa algo como US$ 480/mês (Vultr em São Paulo, estimativa de terceiros) a US$ 765/mês (AWS São Paulo, c6i.4xlarge a US$ 1,048/h, de terceiros), mas a **saída de dados** tem preços muito diferentes:

| Provedor | Saída de dados | Observação |
| --- | --- | --- |
| LiveKit Cloud (Scale) | US$ 0,10/GB | sem operar nada |
| AWS São Paulo | cerca de US$ 0,15/GB nos primeiros 10 TB, menos em volume | número de 2020; confirmar |
| Vultr | US$ 0,01/GB acima da cota | uma tabela de terceiros cita US$ 0,08/GB para São Paulo; **confirmar antes de decidir** |
| Oracle Cloud (Vinhedo) | 10 TB grátis e cerca de US$ 0,0085/GB depois | valor de outras regiões; Brasil e a gratuidade **não confirmados** |

**Estimativas** (suposições a medir: voz ≈ 50 kbps por pessoa; vídeo ≈ 1 Mbps por pessoa; espectador de debate ≈ 1,5 Mbps, ou 0,7 GB por hora; câmbio R$ 5,56; sem desconto de volume e sem contar a cota incluída nos planos):

| Item na nuvem do LiveKit (taxa Scale) | Custo aproximado |
| --- | --- |
| Chamada de voz de 8 min (1 para 1) | US$ 0,007 (R$ 0,04) |
| Chamada de vídeo de 8 min (1 para 1) | US$ 0,018 (R$ 0,10) |
| 1 hora de um espectador de debate | US$ 0,09 (R$ 0,52) |
| Debate com 500 espectadores por 1h30 | cerca de US$ 70 (R$ 390) |

| Cenário por mês | Nuvem do LiveKit | Servidor próprio |
| --- | --- | --- |
| **Bem usado:** 100 mil chamadas (70% voz, 30% vídeo, 8 min) e 100 debates de 300 espectadores por 1h | cerca de US$ 3,5 mil (R$ 19 mil), uns 25 TB | cerca de US$ 1 a 1,5 mil de infraestrutura, **mas** com plantão e manutenção; a economia some se isso consumir parte do tempo de uma pessoa |
| **Brasil inteiro:** 1 milhão de chamadas e 1.000 debates de 500 espectadores por 1h30 | cerca de US$ 80 mil (R$ 445 mil), uns 565 TB; em volume assim dá para negociar desconto Enterprise | **com banda barata** (US$ 0,01/GB): cerca de US$ 10 mil (R$ 55 mil), com 5 a 6 servidores de 16 vCPU. **Em AWS/Google/Azure em São Paulo** (banda a US$ 0,12 a 0,15/GB): cerca de US$ 70 mil, **sem economia** |

**Conclusões:** (1) os **debates ao vivo dominam a conta**, muito mais que as chamadas (nos dois exemplos, de 84% a 93% da banda); (2) hospedar por conta própria **só compensa com provedor de banda barata** e com gente para operar 24 horas por dia (plantão, atualização, monitoramento, TURN, certificados), que é o custo mais fácil de esquecer; (3) em nuvem pública grande, a banda em São Paulo custa o mesmo ou mais que a do próprio LiveKit; (4) para volumes muito altos, o caminho mais barato costuma ser servidor dedicado com tráfego contratado por Mbps, o que exige cotação (não verificado aqui); (5) **regra prática:** manter a nuvem do LiveKit até a fatura passar de uns US$ 8 a 10 mil por mês e existir equipe de infraestrutura; antes disso, o tempo de engenharia custa mais que a economia.

**Limites do Ship e do Scale que importam mesmo sem hospedar:** 1.000 e 5.000 conexões simultâneas. Debates grandes mais chamadas no mesmo horário passam do Ship rápido.

## 11. Fontes (consultadas em 15/11/2026; confirmar nos sites oficiais)

- Render: [render.com/pricing](https://render.com/pricing.md) · [planos de computação](https://render.com/docs/compute-plans) · [Key Value](https://render.com/blog/lower-prices-for-key-value-services)
- Neon: [neon.com/pricing](https://neon.com/pricing)
- Cloudflare R2: [developers.cloudflare.com/r2/pricing](https://developers.cloudflare.com/r2/platform/pricing/)
- LiveKit: [livekit.com/pricing](https://www.livekit.com/pricing) · [cotas e limites](https://docs.livekit.io/deploy/admin/quotas-and-limits/)
- Groq (Whisper): [console.groq.com/docs/model/whisper-large-v3](https://console.groq.com/docs/model/whisper-large-v3)
- Gemini (embeddings): [comparativo de custos](https://www.getmaxim.ai/bifrost/llm-cost-calculator/provider/gemini/model/gemini-embedding-001)
- MapTiler: [maptiler.com/cloud/pricing](https://www.maptiler.com/cloud/pricing/)
- Resend: [resend.com/pricing](https://resend.com/pricing.md) · Amazon SES: [costbench.com](https://costbench.com/software/email-api/amazon-ses/)
- Sentry: [sentry.io/pricing](https://sentry.io/pricing/)
- Asaas: [asaas.com/precos-e-taxas](https://www.asaas.com:443/precos-e-taxas) · [nota fiscal](https://asaas.com/nota-fiscal)
- Stripe Brasil: [comparativos de terceiros](https://ecomcalctools.com/pt-br/blog/stripe-vs-paypal-brasil/)
- Simples Nacional para software: [Agilize](https://agilize.com.br/artigos/?p=4180) · [guia de TI 2026](https://agilize.com.br/artigos/?p=4061)
- Câmbio: [Brasil 61, 11/11/2026](https://brasil61.com/n/dolar-fecha-cotado-a-r-5-56-com-mercado-atento-a-inflacao-dos-estados-unidos-bras2617456.amp)
