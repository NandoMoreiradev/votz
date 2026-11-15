# Brief 4A.1 — Correção: planos de empresa fora do escopo do 4A

> Para o Gemini. O 4A foi aprovado, com uma divergência que não constava no seu relatório.

## Problema

O brief 4A dizia: planos de **empresa** ficam **sem alteração e sem destaque** (fase 2 do negócio). Em `packages/shared-types/src/plans.ts`, `PLAN_PRICES.COMPANY` foi alterado:

| Plano | Valor original (HEAD, `Planos.tsx`) | Valor no 4A |
|---|---|---|
| Starter | R$ 300/mês | R$ 0 |
| Business | R$ 1.200/mês | R$ 990 |
| Enterprise | R$ 3.500+/mês | R$ 2.990 |
| White-label | sob consulta | R$ 5.990 |

Esses valores não foram decididos pelo negócio.

## O que fazer

1. Restaurar em `PLAN_PRICES.COMPANY` os **valores originais**: Starter 30000, Business 120000, Enterprise 350000 (centavos; documentar no comentário que "3.500+" é piso), White-label **sem valor numérico** (sob consulta: usar `null`, ajustando o tipo).
2. Marcar o bloco com o comentário `// Fase 2 do negócio: valores históricos, NÃO validados. Não alterar sem decisão do dono do produto.`
3. Conferir a página `Planos.tsx`: a seção de empresas deve continuar **sem destaque** e exibir os valores acima (ou "sob consulta"); nada de "Em breve" enganoso nem preço novo.
4. Conferir se algum teste, `getPlanConfig`, `/plans/me` ou o Stripe (`getStripePriceId`) dependem dos valores trocados; ajustar.
5. Rodar `grep` por `990`, `2990`, `5990`, `99000`, `299000`, `599000` em `apps/` e `packages/` e explicar qualquer resto.

## Regra para os próximos briefs

Qualquer valor, texto de preço ou plano **fora do escopo escrito** deve ser mantido como estava. Se achar que precisa mudar, **pare e reporte** em "Divergências", sem alterar.

## Critérios de pronto

`tsc` da API e do web limpos; todas as suítes verdes (informar o número); `npm run build` ok; relatório curto com o diff dos valores e o resultado do `grep`. **Não commitar.**
