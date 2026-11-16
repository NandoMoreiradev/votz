# Brief 4F — Correções visuais e de usabilidade (achadas no teste em navegador)

> Para o Gemini. Origem: teste visual de 16/11/2026 (API + site locais, entidade com plano Integração, 70 relatos sintéticos em Aracaju). Lista completa em `docs/dados/ressalvas-e-pendencias-fases-3d-a-4b.md`, seção "Teste visual no navegador". **Não altere nada fora destes itens**; qualquer dúvida, reporte em "Divergências".
> Regra deste brief: **cada correção precisa ser vista numa tela real**, não só passar em teste. Veja "Verificação visual obrigatória" no fim.

## F1 — Barra de navegação transborda na horizontal (V-1)

`apps/web/src/components/layout/Navbar.tsx`. Com uma organização ativa, a barra desktop tem ~11 itens + chip da organização + "+ Relatar" e **ultrapassa a largura entre 768 px e ~1300 px** (medido: `scrollWidth` 1284 com `clientWidth` 1265 e 1129). A página ganha rolagem lateral.

**Fazer:**
- Nenhuma largura de viewport entre 320 e 1920 px pode ter `document.documentElement.scrollWidth > clientWidth` em qualquer rota, **com e sem organização ativa**.
- Opções (escolha e justifique): subir o ponto de troca para o menu hambúrguer (ex.: abaixo de 1200 px quando há contexto de organização), e/ou agrupar os links do contexto (Painel, Prazos & Fila, Caixa do mandato) num menu "Minha organização", e/ou truncar o nome do chip com reticências (`max-width`).
- Manter foco, `aria-expanded`, Esc e fechar ao trocar de rota (já existem no menu móvel).
- Só tokens de `theme`.

## F2 — Login com MFA: campo do código aparece preenchido com o e-mail (V-2)

`apps/web/src/pages/Login.tsx`. Na segunda etapa ("Autenticação em dois fatores") o campo "Código do autenticador" **reaproveita o elemento do campo de e-mail** e mostra `qa.entidade@votz.test` dentro dele.

**Fazer:**
- Dar `key` distinta aos dois campos (ou renderizar componentes separados) e **limpar o valor** ao trocar de etapa.
- O campo do código: `autoComplete="one-time-code"`, `inputMode="numeric"`, `maxLength=6`, foco automático, só dígitos.
- Teste de componente: após enviar e-mail e senha, o campo do código está vazio e sem o e-mail.

## F3 — Painel de dados: séries e mapa vazios ou ilegíveis para áreas pequenas (V-3)

`apps/web/src/pages/PainelDados.tsx`, `components/analytics/MetricChart.tsx`, `AnalyticsHeatmap.tsx` e, se preciso, `apps/api/src/analytics/*`.

Problemas: (a) com 73 relatos nos últimos 30 dias o gráfico "Evolução no período" diz "Poucos relatos para mostrar com segurança" porque, **por dia**, nenhum bucket chega a `MIN_CELL_SIZE = 10`; (b) as células geohash-7 (~150 m) são minúsculas no zoom da cidade e parecem pontos soltos.

**Fazer (sem baixar o mínimo de 10 relatos nem expor coordenadas):**
1. **Granularidade automática:** se a granularidade escolhida deixar **todos** os pontos suprimidos, a tela sugere e aplica a próxima (semanal, depois mensal) e avisa ("Agrupamos por semana para proteger a privacidade"). Padrão do seletor: **semanal** para períodos de até 90 dias.
2. **Supressão sem esvaziar o gráfico:** pontos suprimidos aparecem como lacuna tracejada com legenda, não como tela vazia, quando existirem pontos visíveis.
3. **Mapa:** quando a maioria das células de 150 m estiver suprimida, o endpoint de heatmap passa a devolver também a **agregação em geohash-6 (~1,2 km)**, só para células com 10+ relatos, e a tela alterna "Detalhe (150 m)" / "Visão ampla (1,2 km)" (padrão: visão ampla se houver menos de 5 células visíveis). Legenda de intensidade e contagem por célula no popup (montado com `textContent`).
4. Ajustar o enquadramento inicial do mapa (`fitBounds`) às células visíveis.
5. Atualizar `docs/dados/dicionario-de-metricas.md` (versão `v1.1.2`): regra de agregação automática e geohash-6.
6. Testes: série diária toda suprimida → API/tela caem para semanal; mapa nunca devolve célula com menos de 10; nenhuma coordenada individual.

## F4 — Margens do painel mudam entre as abas (V-4)

`PainelDados.tsx` e seus estilos. Na aba "Visão geral" o título fica colado à esquerda (≈4 px) e na aba "Mapa de calor" aparece com margem (≈15 px): a largura do contêiner depende do conteúdo.

**Fazer:** contêiner com `max-width` fixa, `margin: 0 auto` e o **mesmo** preenchimento lateral em todas as abas, igual ao das páginas "Prazos & Fila" e "Planos".

## F5 — Fila de prazos: contagens incoerentes (V-5)

`apps/web/src/pages/EntidadePrazos.tsx` e `apps/api/src/sla/sla.service.ts`. Apareceu "Todos (1)" junto de "Não atribuídos (52)": relatos **sem `slaDueAt`** entram na contagem de umas abas e não de outras.

**Fazer:**
- Todas as abas e os totais saem **da mesma consulta/filtro** e somam de forma consistente ("Todos" = soma das situações; "Não atribuídos" ⊆ "Todos").
- Relato sem prazo calculado aparece na fila com o rótulo "Sem prazo definido" **e conta em "Todos"**; ou, se o desenho for excluí-lo, **nenhuma** aba o conta. Decida, documente e teste.
- Garantir (e testar) que **todo relato novo** destinado a uma entidade recebe `slaDueAt` na criação, e que o backfill (`backfill-sla.ts`) cobre os antigos.

## F6 — PDF da entidade: geohash cru e categorias em inglês (V-6)

`apps/api/src/accountability/report-renderer.service.ts` (modelo "Relatório de atendimento"), seção "Reincidência por área". Hoje imprime `INFRASTRUCTURE · região 7nj9srh: 21 ocorrências em 90d`.

**Fazer:**
- Traduzir a categoria com o **mesmo mapa de rótulos** usado no resto do produto (extrair para um único módulo compartilhado se hoje estiver duplicado; não criar uma terceira tabela).
- Trocar o código geohash por um **rótulo legível**: o bairro mais frequente da célula (`neighborhood_key` mais comum, em forma de título), no formato "Infraestrutura · Bairro Centro (área de ~150 m): 21 ocorrências em 90 dias". Sem bairro informado: "Área sem bairro informado". **Nunca** imprimir coordenadas, nem o código da célula. Só células com 10+ relatos (regra existente).
- Aplicar o mesmo rótulo na aba "Reincidência" do painel (`PainelDados`) e no export CSV/JSON (campo adicional `areaLabel`, mantendo `cell7` apenas no JSON técnico se já existir; confirmar com a regra de privacidade do 4B).
- Teste: o texto do PDF não contém `/^[0-9b-hjkmnp-z]{7}$/` nem `INFRASTRUCTURE`/`SANITATION`.

## F7 — PDF do político: terço inferior vazio (V-7, cosmético)

Mesma classe de renderização. Sem inventar conteúdo: se houver menos de 3 categorias e menos de 3 relatos resolvidos, reduzir a altura útil e **fixar o rodapé** de metodologia/verificação logo após o último bloco **ou** manter o rodapé no pé da página mas aumentar a hierarquia (cartões de KPI maiores). Escolha uma, mantenha as margens e não gere segunda página.

## Verificação visual obrigatória (para cada item)

1. Suba API e site (`.claude/launch.json` tem `votz-api` e `votz-web`; a chave do MapTiler está em `apps/web/.env.local`, variável `VITE_MAPTILER_KEY`; **não leia nem exiba o valor**).
2. Crie dados de teste **sintéticos e marcados** (`QA-VISUAL`), apague tudo ao final e **recalcule os rollups** (`npm run analytics:backfill --workspace=apps/api`). Usar os scripts em `docs/security/qa-scripts/` (01, 02, 03) para contas, com MFA.
3. Confira **F1** em 375, 768, 1024, 1280 e 1440 px, com e sem organização ativa, medindo `document.documentElement.scrollWidth === clientWidth` e olhando a tela.
4. **PDFs**: gere os dois modelos, converta a página em imagem (script de desenvolvimento com `pdfjs-dist`, **sem** adicioná-lo ao `package.json`) e **descreva o que viu**, incluindo F6 e F7.
5. No relatório, um parágrafo por item (F1 a F7): **o que você viu antes e depois**. "Testes passaram" não basta. Se não conseguir abrir uma tela, diga isso explicitamente.

## Pronto quando

`tsc` da API e do web limpos; suítes verdes (informar o número); `npm run build` ok; descrições visuais F1–F7; dicionário `v1.1.2`; banco de teste limpo e rollups recalculados. **Não commitar.**

## Fora do escopo

Mudar o mínimo `MIN_CELL_SIZE`, novos recursos de painel, Asaas (4E), horário comercial no SLA, qualquer alteração de plano ou preço.
