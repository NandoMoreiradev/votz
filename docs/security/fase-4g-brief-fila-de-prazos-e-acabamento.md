# Brief 4G — Fila de prazos correta e acabamento do painel

> Para o Gemini. Origem: verificação do 4F em 16/11/2026 (navegador + PDFs, com os dados de demonstração). Lista em `docs/dados/ressalvas-e-pendencias-fases-3d-a-4b.md`, seção "Verificação do 4F e do 4D.1". **Não altere nada fora destes itens.** Dúvida → reporte em "Divergências".
> Para testar na tela use os dados de demonstração: `docs/dev/README-dados-de-teste.md` (contas `demo.*@votz.test`, código MFA com `node docs/dev/mfa.mjs <conta>`). A conta `demo.prefeitura@votz.test` (plano Integração, com prazos próprios) é a principal.

## G1 (obrigatório) — Fila de prazos: "Sem prazo definido" está errado (N-1)

`apps/api/src/sla/sla.service.ts` (`listQueue`, ~linha 308: `noSla = totalOpenCount - (breached + atRisk + onTime)`) e `apps/web/src/pages/EntidadePrazos.tsx`.

**O que acontece hoje (medido na demo):** a Prefeitura mostra "Sem prazo definido 40" e "Todos (58)". Na verdade 40 relatos **já foram respondidos** (`slaState` = `MET` ou `MET_LATE`) e continuam em aberto (status `UNDER_REVIEW`, `IN_PROGRESS`, `OPEN` ou `DISPUTED`). Eles **têm** prazo; foi cumprido (ou cumprido fora do prazo). Além disso, um relato respondido aparece como "No prazo · resta -1741.7h" (horas negativas).

**Fazer:**
1. Definir estados **mutuamente exclusivos** para a fila de relatos não resolvidos/arquivados e documentar em `docs/dados/dicionario-de-metricas.md`:
   - **Vencidos** (sem 1ª resposta e `BREACHED`);
   - **Em risco** (sem 1ª resposta e `AT_RISK`);
   - **No prazo** (sem 1ª resposta e `ON_TIME`);
   - **Respondidos** (`MET` ou `MET_LATE`, ainda não resolvidos), com subdivisão "no prazo" / "fora do prazo";
   - **Sem prazo definido** (apenas `slaDueAt` nulo).
   "Vence hoje" é um **filtro/destaque** dentro de No prazo/Em risco e **não** entra na soma; o cartão deve dizer isso ("incluídos em No prazo / Em risco").
2. A soma dos estados exclusivos **é igual** a "Todos". `Meus relatos + Não atribuídos = Todos`. Tudo vem da **mesma consulta/escopo** (já existe `scopeWhere`).
3. Texto dos rótulos: relato respondido **nunca** mostra "resta X h". Use "Respondido no prazo" ou "Respondido fora do prazo (+X h)". Para vencidos: "Vencido há X h". Para sem resposta no prazo: "Resta X h". **Nunca** horas negativas.
4. Cartões e filtros da tela com os mesmos nomes e contagens; o cartão "Respondidos" abre a lista correspondente.
5. Testes (API): fixtures com **todos** os estados (inclusive `MET`, `MET_LATE`, `slaDueAt` nulo, status `DISPUTED`); soma dos exclusivos = Todos; nenhum rótulo com horas negativas. Teste de componente para os rótulos.
6. Conferir na demo: Prefeitura deve mostrar algo como Vencidos 8, Em risco 2, No prazo 8, Respondidos 40 (no prazo 35 / fora 5), Sem prazo definido 0, Todos 58 (os números exatos podem variar com o relógio; o que importa é fechar a soma).

## G2 — Formatação pt-BR no painel (N-3, N-4)

`apps/web/src/pages/PainelDados.tsx`, `components/analytics/MetricChart.tsx`, `MetricInfoModal.tsx` e telas de Prazos.

- Extrair para `packages/shared-types` os formatadores pt-BR que hoje existem só na API (`formatPercentPtBr`, `formatDurationPtBr`, `formatDateBr`, `formatCountPtBr`; **mover**, não duplicar) e usar na API e no web.
- Painel: percentuais com vírgula ("29,79%"), durações ("1,6 d", "5,3 d", "17,4 h"), milhares ("1.248"), datas do eixo do gráfico e das tabelas em **dd/mm** ou **dd/mm/aaaa**, nunca ISO. Atualização "Vigência" e "Atualizado" em dd/mm/aaaa.
- Tabela de Reincidência: `avgGapDays` arredondado a 1 casa ("0,9 dia"/"2,5 dias"), sem floats longos. Revisar as outras tabelas do painel e do export CSV quanto a floats longos (CSV mantém ponto decimal e ISO por ser dado técnico; declarar isso no cabeçalho do arquivo).
- Testes unitários dos formatadores (valores limite: 0, 1, 999,95, 1000, `null`).

## G3 — PDF do político sem terço inferior vazio (N-5)

`apps/api/src/accountability/report-renderer.service.ts`. Hoje o rodapé só sobe se houver menos de 3 categorias **e** menos de 3 relatos resolvidos. Com 4 categorias e 2 relatos o espaço vazio continua.

**Fazer:** o rodapé de metodologia/verificação passa a ficar **logo abaixo do último bloco** (`footerY = min(defaultFooterY, ultimoY + 36)`, nunca abaixo do limite inferior nem em segunda página), para **todos** os modelos e quantidades. Gere o PDF do político e o da entidade com (a) dados mínimos, (b) dados médios e (c) dados cheios, converta cada um em imagem e **descreva** (regra de descrição visual do 4C.2/4F).

## G4 — Tabela de Reincidência verificável e dados demo (N-3, N-6)

`docs/dev/seed-demo.mjs` e `docs/dev/README-dados-de-teste.md`.

1. Acrescentar ao seed **3 "pontos quentes"**: ≥12 relatos da **mesma categoria na mesma célula geohash-7** (coordenadas quase idênticas, datas espalhadas nos últimos 80 dias) em bairros diferentes (ex.: Centro/Infraestrutura, Atalaia/Saneamento, Farolândia/Mobilidade), todos destinados à Prefeitura. Isso deve fazer a aba **Reincidência** mostrar linhas e o mapa em "Detalhe (150 m)" mostrar células com intensidade variada.
2. Rodar `node docs/dev/seed-demo.mjs --reset` e o `analytics:backfill`, abrir `demo.prefeitura` → Painel → **Reincidência** e **Mapa de calor (Detalhe)**, e **descrever** o que viu (inclusive o rótulo de área "Bairro Centro", sem código de célula, e o intervalo médio arredondado).
3. Atualizar o README dos dados de teste com o que foi acrescentado.

## G5 (somente se o dono do produto marcar OK ao enviar) — Contexto da organização ao recarregar (N-2)

Hoje F5/recarregar com uma organização ativa **volta ao perfil pessoal**, porque o token institucional só existe em memória (decisão de segurança).

**Proposta (não relaxa a segurança):** guardar em `sessionStorage` **apenas** `{ type, id }` da última organização ativa (nunca token, nunca permissões). Ao recarregar e restaurar a sessão pessoal, abrir automaticamente a janela "Confirme sua identidade" daquela organização (código MFA) e, ao confirmar, voltar à mesma rota. Cancelar mantém o perfil pessoal. Limpar ao sair e ao trocar de conta. Teste: recarregar em `/painel-dados` como organização → pede MFA → volta ao painel. **Não** persistir o token institucional.

## Verificação visual obrigatória

Para cada item: parágrafo com **o que você viu antes e depois** (G1 com a conta `demo.prefeitura`; G2 no painel e no gráfico; G3 com os PDFs convertidos em imagem; G4 como descrito). "Testes passaram" não basta. Se não conseguir abrir uma tela, diga isso. Meça `scrollWidth === clientWidth` em 1280 e 1100 px na tela de prazos.

## Pronto quando

`tsc` da API e do web limpos; suítes verdes (informar o número); `npm run build` ok; dicionário de métricas atualizado (versão `v1.1.3`); seed demo atualizado e testado com `--reset`; descrições visuais G1–G4 (e G5 se executado). **Não commitar.**

## Fora do escopo

Horário comercial no SLA, novos recursos de plano, Asaas (4E), mudança do mínimo de 10 relatos.
