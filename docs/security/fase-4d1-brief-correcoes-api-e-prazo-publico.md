# Brief 4D.1 — Correções do 4D (API de dados e prazo público)

> Para o Gemini. O 4D foi aprovado, com dois ajustes. Não alterar nada fora destes itens; dúvida → reportar em "Divergências".

## P1 — API de dados da entidade sem checagem de papel

`apps/api/src/public-api/public-api.service.ts` (`resolveApiKeyEntity`) aceita **qualquer** membro `ACTIVE` da entidade dono da chave, até um membro sem permissão de dados, e usa `findFirst` com `orderBy createdAt`, o que escolhe uma entidade arbitrária quando o usuário pertence a mais de uma e `entityId` não vem.

**Fazer:**
1. Carregar a associação **com o papel** (`role.permissions`) e exigir `VIEW_ANALYTICS` para `minha-entidade/agregados` e `EXPORT_DATA` para `minha-entidade/relatos`. Sem permissão → `403`.
2. Se o usuário tiver mais de uma entidade ativa e `entityId` **não** for informado → `400` pedindo o `entityId` (nada de escolher a "primeira").
3. Continuar exigindo plano com `api_access` (Integração) **e** associação ativa **no momento da requisição** (já é assim; manter).
4. Testes: membro sem permissão → 403; membro suspenso → 403; usuário em duas entidades sem `entityId` → 400; entidade de plano Básico/Gestão → 403 `PLAN_REQUIRED`; `entityId` de outra organização → 403.

## P2 — Percentual público de prazo só com prazo próprio

Hoje o perfil público de **toda** entidade exibe "cumpriu X% dos prazos", mesmo quando a entidade nunca configurou `slaHours` e o cálculo usou o **prazo padrão da plataforma**. Isso pode ser injusto e gerar contestação.

**Fazer:**
1. Considerar a entidade "com prazo próprio" quando `Entity.slaHours` tiver **ao menos uma categoria** definida (valor positivo). Guardar o resultado em campo calculado (`hasOwnSla`) no retorno do serviço de analytics público, sem alterar dados históricos.
2. **Com prazo próprio:** mostrar o percentual como hoje (respeitando `MIN_CELL_SIZE`), com o rótulo "Cumprimento dos prazos declarados pela entidade".
3. **Sem prazo próprio:** **não mostrar percentual**. Mostrar a frase "Esta entidade ainda não declarou seus prazos de resposta." e, para quem pode editar, um convite para configurar. Os demais números (volume, resolução, mediana de resposta) continuam públicos.
4. Os rollups continuam calculando com o prazo padrão para uso interno do painel da própria entidade, **com rótulo "prazo padrão"** na tela de prazos (`EntidadePrazos.tsx`) quando não houver política própria.
5. Atualizar o dicionário de métricas (`docs/dados/dicionario-de-metricas.md`) com a regra e subir a versão (`v1.1.1`).
6. Testes: entidade sem `slaHours` → sem percentual público; com uma categoria → percentual aparece; amostra abaixo do mínimo → suprimido; rótulo correto na tela.

## Pronto quando

`tsc` da API e do web limpos; suítes verdes (informar o número); `npm run build` ok; relatório curto com arquivo:linha de cada correção. **Não commitar.**
