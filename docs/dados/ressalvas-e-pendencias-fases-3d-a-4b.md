# Ressalvas e pendências abertas (fases 3D, 4A e 4B)

> Anotado em 15/11/2026, depois da auditoria dos relatórios do Gemini. Cada item diz o que é, por que importa e quando tratar.

## 4B — Painel de dados

| # | Ressalva | Por que importa | Quando tratar |
|---|---|---|---|
| 4B-1 | **Mapa de calor pode ficar quase vazio.** Células geohash-7 (~150 m) só aparecem com 10 ou mais relatos (`MIN_CELL_SIZE`). Em cidade pequena a maioria será suprimida. | O benefício principal do plano de entidade ("ver onde dói") parece quebrado. | Antes de vender. Sugestão: cair para células maiores (geohash 6, ~1,2 km) quando a fina estiver suprimida, mantendo o mínimo de 10. |
| 4B-2 | **Político sem cidade cadastrada recebe 403** (mandato municipal). Os ~65 mil políticos importados do TSE podem ter `city` vazio. | O político não vê nada no painel e acha que o produto não funciona. | Antes do lançamento: medir quantos têm `city` nula e preencher (IBGE/TSE) ou pedir no onboarding. |
| 4B-3 | **Qualidade do dado depende do texto digitado.** Cidade e bairro vêm do CEP ou de texto livre; a normalização remove acento e maiúscula, mas "S. Paulo" ≠ "São Paulo". | Relatos "somem" da área da organização e as métricas subestimam. | Melhoria: usar código IBGE do município (a tabela do `IbgeSync` já tem) e escolher o município numa lista no formulário de relato. |
| 4B-4 | **Painel e mapa não foram vistos em navegador real.** Só `tsc` e testes. | Erros de layout, CSP, mapa e estados de plano bloqueado só aparecem na tela. | Antes de ir ao ar (teste visual com os três perfis). |
| 4B-5 | **Benchmark é do Gemini** (500 mil relatos: overview p95 107 ms, mapa p95 20 ms). Não foi refeito por mim. | Confiar sem repetir. | Refazer na configuração de produção. |
| 4B-6 | **Comparativo entre municípios** continua "Em breve": não há população por município no banco. | Item de maior valor para governo. | Quando importar população (IBGE); depois do primeiro ciclo de clientes. |

## 4A — Catálogo de planos

| # | Ressalva | Quando tratar |
|---|---|---|
| 4A-1 | **Preços de empresa foram alterados** fora do escopo (Starter R$ 0, Business R$ 990, Enterprise R$ 2.990, White-label R$ 5.990). Correção pedida no brief 4A.1 (voltar a R$ 300, R$ 1.200, R$ 3.500+, sob consulta). | **Pendente: conferir o resultado do 4A.1.** |
| 4A-2 | **Corrida no limite de membros**: contagem e convite fora de transação; dois convites simultâneos no limite exato podem passar. Risco baixo. | Melhoria futura (travar por organização na transação). |
| 4A-3 | **Stripe sem preço por faixa**: um `price_id` por plano, via variável de ambiente; não cobra o valor por cargo. | Resolvido no 4E (Asaas), ou criar um preço por faixa no Stripe. |
| 4A-4 | **Faixa 1 de vereador** (município até 50 mil hab.) nunca é usada: falta a população do município. Vereador cai na faixa 2. | Junto com 4B-6 (importar população). |
| 4A-5 | **Preço de Integração (entidade) = Gestão**, provisório (`TODO: confirmar`). | Decisão de negócio após entrevistas. |
| 4A-6 | **Página Planos não vista no navegador.** | Teste visual antes de ir ao ar. |

## 3D — Correções do teste ponta a ponta

| # | Ressalva | Quando tratar |
|---|---|---|
| 3D-1 | **Menu mobile não foi visto na tela** (375, 768, 1280 px); o Gemini não conseguiu abrir o navegador. | Teste visual. |
| 3D-2 | **Scripts de QA 02, 03 e 05 falham** porque o moderador agora exige código do MFA (`docs/security/qa-scripts`). Ajuste dos scripts, não do código. | Antes da próxima rodada de testes ponta a ponta. |

## 4C — Ferramentas do político

| # | Ressalva | Quando tratar |
|---|---|---|
| 4C-1 | ~~Cartão PNG cortado na lateral direita~~ **Resolvido no 4C.2** e confirmado por mim (FEED e STORIES regerados e vistos em 15/11/2026). | — |
| 4C-2 | ~~Paleta fora da identidade~~ **Resolvido no 4C.2** (cartão e PDF usam `VOTZ_BRAND_COLORS`). | — |
| 4C-3 | ~~Datas ISO e decimais com ponto~~ **Resolvido no 4C.2** (conferido por texto do PDF do político). Falta ver o **visual** dos dois PDFs (QR, cores, espaçamento) e regerar o PDF da entidade. | Teste visual antes de ir ao ar. |
| 4C-6 | Cartões têm vazio grande entre cabeçalho e números; "18,5 h" com espaço largo (fonte monoespaçada). Estético. | Polimento futuro. |
| 4C-4 | Cota de cartões não é serializada em cache frio (dois pedidos simultâneos podem renderizar duas vezes). Só custo extra. | Melhoria futura. |
| 4C-5 | Falta conferir `npm audit` contra a lista anterior (novas bibliotecas `pdfkit`, `satori`, `@resvg/resvg-js`). | Antes de ir ao ar. |

## 4D — Prazos (SLA) para entidades

| # | Ressalva | Quando tratar |
|---|---|---|
| 4D-1 | **API de dados sem checagem de papel.** `minha-entidade/*` aceita qualquer membro ACTIVE da entidade dono da chave (até VIEWER), sem exigir `VIEW_ANALYTICS`/`EXPORT_DATA`. Os dados são agregados e relatos públicos, mas a regra de permissão fica inconsistente com o resto. | Ajuste pequeno (brief 4D.1). |
| 4D-2 | **Percentual público de cumprimento usa prazo padrão da plataforma** quando a entidade nunca configurou o próprio. Publicar "cumpriu X%" contra um prazo que ela não declarou pode ser injusto e gerar contestação. | Decisão de produto + texto na tela (mostrar "prazo padrão"). |
| 4D-3 | Limite por IP da API usa `req.ip`: atrás de Cloudflare/Render precisa de `trust proxy` correto, senão todos compartilham o mesmo IP. | Na configuração de produção. |
| 4D-4 | Sem horário comercial, feriados e pausa (TODO v2): prazo em horas corridas penaliza o órgão no fim de semana. | v2, depois dos primeiros clientes. |
| 4D-5 | Tela `/entidade/prazos` e o fluxo de atribuição não foram vistos no navegador. | Teste visual antes de ir ao ar. |
| 4D-6 | Fail-open do Redis no limite da API (decisão anterior L8) continua. | Registrar por escrito ou fechar. |

## Teste visual no navegador (16/11/2026)

Feito com API + site locais, contas QA (entidade INTEGRACAO, político MANDATO_PRO), 70 relatos sintéticos em Aracaju (removidos depois) e a chave do MapTiler em `apps/web/.env.local` (variável `VITE_MAPTILER_KEY`).

**Funcionou:** página Planos (faixas por cargo, "Em breve", empresas sem destaque); menu mobile em 375 px (gaveta com todos os links e "Atuando como"); painel de dados com números coerentes; mapa de calor com MapTiler e células suprimidas contadas; fila de prazos (SLA); PDF do político e PDF da entidade (QR nítido, datas e decimais pt-BR, cartões de KPI com faixa verde).

**Defeitos achados:**

| # | Defeito | Gravidade | Onde |
|---|---|---|---|
| V-1 | **Barra de navegação transborda na horizontal** no contexto de organização entre 768 px e ~1300 px (scrollWidth 1284 com tela de 1129 e 1265). Tem ~11 itens + chip da organização + botão. | Média | `Navbar.tsx` |
| V-2 | **Login com MFA: o campo do código aparece preenchido com o e-mail** (o campo é reaproveitado entre as duas etapas e mantém o valor). | Média | `Login.tsx` (falta `key`/reset de valor) |
| V-3 | **Série "Evolução no período" fica vazia** ("Poucos relatos para mostrar com segurança") mesmo com 73 relatos: em granularidade diária cada dia tem menos de 10. O mapa também fica com células pequenas demais para ler no zoom da cidade. | Média (produto) | `PainelDados`, 4B-1 |
| V-4 | **Margens do painel mudam entre as abas** (título colado na esquerda na "Visão geral", com margem no "Mapa de calor"): largura do contêiner depende do conteúdo. | Baixa | `PainelDados.tsx` |
| V-5 | **Fila de prazos: contagens incoerentes** ("Todos (1)" com "Não atribuídos (52)"), por relatos sem prazo calculado (legados/semeados). | Baixa | `EntidadePrazos.tsx` |
| V-6 | **PDF da entidade mostra o código geohash cru** ("região 7nj9srh") e **categorias em inglês** (INFRASTRUCTURE, SANITATION) nas linhas de reincidência. | Média | `report-renderer.service.ts` |
| V-7 | PDF do político tem o terço inferior vazio. | Cosmética | `report-renderer.service.ts` |

**Não testado:** Caixa do mandato e demais telas do político; páginas públicas do cartão e da prestação; resumo semanal; 768 px exato (o painel redimensionou sozinho).

**Scripts de QA:** `02-orgs.mjs` agora loga o moderador com MFA (ajuste feito e rodado com sucesso: 01, 02 e 03). O brief 4D.1 (`fase-4d1-brief-correcoes-api-e-prazo-publico.md`) está escrito.

## Verificação do 4F e do 4D.1 (16/11/2026, com os dados demo)

**Confirmado por mim no navegador/PDF:** V-1 barra sem rolagem lateral em 1280, 1100 e 800 px, com menu "Minha organização" (Painel de dados, Prazos & Fila); V-2 campo do código MFA vazio, `one-time-code`, numérico, 6 dígitos; V-3 série semanal por padrão com pontos visíveis e lacuna tracejada, mapa em "Visão ampla (1,2 km)" legível e alternância de detalhe; V-4 margens iguais; V-6 PDF da entidade com categorias em português e "Infraestrutura · Bairro Centro (área de ~150 m)" (sem geohash). 4D.1: prazo público da Prefeitura (com prazo próprio) = 84,06%; da Saúde (sem prazo próprio) sem percentual.

**Novos defeitos achados:**

| # | Defeito | Gravidade |
|---|---|---|
| N-1 | **"Sem prazo definido (40)" na fila de prazos está errado**: são relatos **já respondidos** (`MET` ou `MET_LATE`) que ainda não foram resolvidos. A conta `totalOpen − (vencidos + em risco + no prazo)` mistura os dois. Além disso um relato respondido aparece como "No prazo · resta -1741.7h" (horas negativas). | Média |
| N-2 | Recarregar a página (F5) com uma organização ativa **volta ao perfil pessoal** (o contexto institucional só vive em memória). Apontado pelo Gemini; fora do escopo dele. | Média (UX) |
| N-3 | Tabela de Reincidência: `avgGapDays` aparece com float sem arredondar (`0.9999997622863248`), relatado pelo Gemini; os dados demo não têm reincidência (células de 150 m com menos de 10 por categoria), então **não consegui ver a tabela**. | Baixa |
| N-4 | Painel usa ponto decimal ("29.79%", "1.6d") e datas ISO no eixo do gráfico, enquanto PDFs e cartões usam vírgula e dd/mm/aaaa. | Baixa |
| N-5 | F7 só reduz o vazio do PDF do político quando há menos de 3 categorias **e** menos de 3 relatos resolvidos; com 4 categorias e 2 relatos o terço inferior continua vazio. | Cosmética |
| N-6 | Dados demo não mostram **reincidência** nem mapa com várias células no modo detalhe. Acrescentar "pontos quentes" ao seed (12+ relatos da mesma categoria na mesma célula). | Dev |

## 4G (16/11/2026): resolvido e pendente

**Resolvido e conferido por mim (API + testes):** N-1 fila de prazos com estados exclusivos (demo: vencidos 22 + em risco 2 + no prazo 7 + respondidos 55 [52 no prazo, 3 fora] + sem prazo 0 = 86 = total; nenhum item com horas negativas); N-4 formatação pt-BR no painel e formatadores compartilhados em `@votz/shared-types`; N-5 rodapé dos PDFs logo abaixo do último bloco; N-6 pontos quentes no seed (179 relatos demo; os dados originais continuam intactos: 9 usuários, 8 relatos, 5.573 entidades, 65.778 políticos). N-3 (`avgGapDays` arredondado) resolvido segundo o relatório; a aba de Reincidência com linhas **não foi vista por mim**.

**Ainda aberto:**

| # | Pendência | Decisão |
|---|---|---|
| N-2 | Recarregar a página volta ao perfil pessoal (G5 do brief 4G, não executado) | Aguarda OK do dono do produto |
| 4G-1 | Na fila de prazos, a linha auxiliar mostra o status cru em inglês ("Status: OPEN", "IN_PROGRESS") | Traduzir com o mapa de rótulos |
| 4G-2 | No card "1ª resposta" o "d" de "1,5 d / 5,4 d" quebra para a linha de baixo em 1440 px | Ajuste de estilo |
| 4G-3 | Medição `scrollWidth === clientWidth` da tela de prazos não foi feita pelo Gemini (só captura) | Conferir quando houver teste visual |

## Estado dos commits

3D, 4A e 4B estão no diretório de trabalho (parte já em stage) e **nada foi commitado**. Os documentos de negócio e os briefs também não.
