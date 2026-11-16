# Brief 4C.2 — Correção visual do cartão compartilhável e do PDF

> Para o Gemini. Os testes do 4C passam, mas o resultado **visual** do cartão foi conferido por mim (gerado com dados de exemplo e aberto como imagem) e tem defeitos. Não alterar nada fora destes itens.

## V1 (obrigatório) — O cartão PNG está cortado na lateral direita

`apps/api/src/share-cards/share-card-renderer.service.ts` (`renderPng`). Ao renderizar o formato FEED (1080×1350) com dados normais, **o conteúdo ultrapassa a borda direita**: a data do período aparece cortada ("01/10/2026 - 31/1…") e os três cartões de métrica terminam fora da imagem. O mesmo código serve o formato STORIES.

Provável causa: o `div` raiz tem `width: 1080px` **mais** `padding` de 76 px, e os filhos usam `width: '100%'`; no Satori a largura do raiz não inclui o preenchimento como o esperado. Corrigir de modo que **toda** a composição caiba em 1080 px com margens iguais (76 px) dos dois lados, nos dois formatos (use `boxSizing: 'border-box'` no raiz, ou largura explícita `width - 2*padX` no contêiner interno; escolha o que o Satori respeitar e confirme olhando a imagem).

**Teste obrigatório (regressão visual):** renderizar FEED e STORIES com dados de exemplo (incluindo nome longo, 5 dígitos nas métricas, cargo longo e `suppressed: true`), decodificar o PNG e verificar que **nenhum pixel diferente da cor de fundo** existe nas 40 colunas da direita nem nas 40 da esquerda (exceto a faixa de margem), e que as dimensões são exatamente 1080×1350 e 1080×1920. **Abra as imagens geradas e descreva o que viu** no relatório.

## V2 — Identidade visual do Votz

O cartão usa cores de outra paleta (`#0F172A`, azul `#1D4ED8` e tons de ardósia). A identidade oficial (CLAUDE.md): azul noite `#1A1A2E` (primary), vermelho `#E63946` (ação), verde `#2DC653` (resolvido/positivo), off-white `#F4F4F4` (fundo), texto `#0D0D0D`. Ajustar o cartão para essa paleta (resolvido em verde, destaque em vermelho só onde fizer sentido; selo "VOTZ · TRANSPARÊNCIA" em azul noite), centralizando as cores em **uma constante** reutilizada pelo PDF (`report-renderer.service.ts`) para não divergirem. Fontes já estão corretas (Space Grotesk, Inter, JetBrains Mono).

## V3 — Datas e textos no PDF e no cartão

> **Atenção:** o brief 4D acrescentou ao mesmo `report-renderer.service.ts` o modelo **"Relatório de atendimento — Votz"** (entidades). As correções abaixo valem para **os dois modelos de PDF**: o de prestação de contas do político e o de atendimento da entidade. Conferir os dois.

- O PDF mostra datas em formato ISO ("2026-10-01 a 2026-10-31", "2026-10-12"). Trocar para **dd/mm/aaaa** em todo o PDF (o cartão já faz isso).
- Horas: "18.5h" → "18,5 h" (vírgula decimal). Percentuais: "52.2%" → "52,2%". Dias para tempos acima de 48 h (ex.: "5,9 dias").
- Conferir acentos e quebras de linha em títulos longos de relato (truncar com reticências, sem estourar a margem).

## V4 — PDF: conferência visual

Já conferi **estrutura e posição** do PDF por extração de texto (1 página, nada fora das margens, todos os blocos presentes). Falta olhar o visual (cores, QR, espaçamento). Gerar o PDF de exemplo, **converter a página em imagem** (por exemplo com `pdfjs-dist` + `@napi-rs/canvas` num script de desenvolvimento, **sem adicioná-los ao `package.json` do app**), abrir e descrever: posição e nitidez do QR, hierarquia dos títulos, contraste, espaço vazio entre as seções e o rodapé. Corrigir o que estiver ruim.

## V5 — Descrição visual obrigatória no relatório

"Testes passaram" **não** basta para este brief. No relatório, para **cada** arquivo gerado (cartão FEED, cartão STORIES, PDF do político, PDF da entidade), escreva um parágrafo dizendo **o que você viu ao abrir a imagem**: o que aparece no topo, no meio e no rodapé; se algo encosta ou ultrapassa as bordas; as cores usadas; o tamanho relativo dos títulos e números; e a posição do QR no PDF. Se não conseguir abrir uma imagem, **diga isso explicitamente** em vez de presumir que está correto. Caminhos dos arquivos de exemplo gerados devem constar no relatório.

## Pronto quando

`tsc` da API e do web limpos; suítes verdes (informar o número); `npm run build` ok; relatório com as imagens do cartão (FEED e STORIES) e dos **dois** PDFs **descritas** (V5) e o resultado do teste de regressão visual. **Não commitar.**
