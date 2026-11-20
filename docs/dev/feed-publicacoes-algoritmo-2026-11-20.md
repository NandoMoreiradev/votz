# Feed de Publicações: como o algoritmo funciona

Atualizado em 20/11/2026. Vale para web e mobile: **toda a decisão acontece no servidor**; os apps só desenham o que a API devolve.

Relato e Publicação são feeds separados. Este documento trata só de **Publicações** (`GET /posts`).

## 1. Onde fica o código

| O quê | Arquivo |
|---|---|
| Nota de cada post (`hotScore`) e reordenação personalizada | `apps/api/src/posts/feed-ranking.service.ts` |
| Mistura equilibrada do "Para você" (pesos em `FOR_YOU_MIX`) | `apps/api/src/posts/feed-mix.ts` |
| Escolha dos candidatos e consultas ao banco | `apps/api/src/posts/posts.repository.ts` |
| Montagem da resposta | `apps/api/src/posts/posts.service.ts` (`listFeed`) |
| "Seguindo" (cronológico, SQL) | `apps/api/src/posts/feed-timeline.ts` |
| Testes | `feed-mix.spec.ts`, `feed-ranking.service.spec.ts` |

## 2. As quatro abas

Parâmetro `sort` da API. Os nomes na tela são iguais no web e no mobile.

| Aba | `sort` | Como ordena |
|---|---|---|
| Para você (padrão) | `for_you` | Mistura equilibrada (seção 4). Só para quem entrou; visitante recebe o ranking sem mistura. |
| Em alta | `trending` | Global, pelo `hotScore`. Aceita filtro de cidade e estado. |
| Seguindo | `following` | Cronológico, **sem algoritmo**: posts de quem a pessoa segue (pessoas, políticos, entidades, pautas) e republicações de quem ela segue. A aba só aparece para quem entrou. |
| Recentes | `recent` | Mais novo primeiro. |

## 3. Nota do post (`hotScore`)

Calculada em `computePostScores` e salva no post. É recalculada na hora quando o post muda (curtida, comentário, repost) e em lote **a cada 10 minutos** (BullMQ, fila `feed-ranking`), para a janela dos últimos 30 dias.

```
engajamento = log(1+comentaristas únicos)*4,0 + log(1+reposts)*3,2 + log(1+votos de enquete)*1,8
            + log(1+curtidas)*1,2 + log(1+comentários)*0,4
bônus cívico = Avocação oficial +3,5 | cita relato +2,0 | cita debate +2,2 | cita proposta +1,5 | tem mídia +1,0
confiança   = conta verificada 1,15 | e-mail confirmado 1,0 | nenhum dos dois 0,72
denúncia    = máx(0,25, 1 - 0,25 * denúncias abertas)
hotScore    = (engajamento + bônus + 0,5) * confiança * denúncia / (idade em horas + 2) ^ 1,65
```

Quem comenta diferente pesa mais que muita curtida; o tempo derruba a nota rápido (gravidade 1,65).

## 4. "Para você": a mistura

### 4.1 Candidatos
O repositório junta, sem repetir:
1. as 150 de maior `hotScore`;
2. as 60 mais novas de **quem a pessoa segue** (pessoas, políticos, entidades);
3. as 60 mais novas **da cidade dela** (ou do estado, se não tiver cidade).

Sem os itens 2 e 3, um post bom de gente próxima mas pouco curtido nunca entraria.

### 4.2 Os três grupos
- **Círculo:** autor seguido (pessoa, político ou entidade), post da própria pessoa, ou post de uma pauta seguida. Ordem: reordenação personalizada (`rerankCandidatesForViewer`: afinidade social, cidade/estado, pautas e atenuação do mesmo autor).
- **Local:** fora do círculo, mas da mesma cidade ou do mesmo estado. Mesma ordem do círculo.
- **Descoberta:** fora do círculo, de **conteúdo confiável**, em ordem de `hotScore`.

Um post pode estar nos grupos local e descoberta; quando é usado em um, sai do outro.

### 4.3 Proporção a cada 10 itens

| Situação | Círculo | Local | Descoberta |
|---|---|---|---|
| Segue 5 contas ou mais | 5 | 3 | 2 |
| Segue **menos de 5** contas | 2 | 4 | 4 |

"Contas" = pessoas + políticos + entidades seguidos (pautas não contam).
A descoberta é espalhada pelo bloco e **nunca ocupa duas vagas coladas** (inclusive na virada de um bloco para o próximo). Os pesos ficam em `FOR_YOU_MIX` (`NORMAL`, `FEW_FOLLOWS`, `FEW_FOLLOWS_BELOW`).

### 4.4 Descoberta só de conteúdo confiável
Só entra como descoberta se o autor tem **conta verificada ou e-mail confirmado** e o post **não tem denúncia aberta**. Post sem confiança, fora do círculo e fora da cidade/estado da pessoa, **não aparece no "Para você"** (continua em Recentes e Em alta).

### 4.5 Rótulo do motivo
Todo item de descoberta traz `feedReason`, escrito pelo servidor (igual no web e no mobile):
- `Em alta na sua cidade`: o post é da cidade da pessoa;
- `Sugerido para você`: o resto.

Itens de círculo e local não levam rótulo (`feedReason` ausente).

### 4.6 Anti-monopólio
O mesmo autor aparece **no máximo 2 vezes a cada 10 itens** (`MAX_PER_AUTHOR_IN_WINDOW`). Se a regra impede todo mundo, ela só é relaxada para a lista não encolher.

### 4.7 Quando falta conteúdo
Se um grupo esgota, as vagas são preenchidas pelos outros (círculo → local → descoberta, e assim por diante). Só quando **círculo e local acabaram** a descoberta pode aparecer em sequência; sem isso, quem é novo e não tem cidade veria o feed vazio.

### 4.8 Cartão "Quem seguir na sua cidade"
Para quem segue menos de 5 contas, a **página 1** traz `suggestions` (título e até 3 políticos + 3 entidades que a pessoa ainda não segue, da cidade; se a cidade não tem nenhum, do estado), e `suggestionsAfter: 3`: o cartão entra depois do 3º item. Tem botão Seguir. Título vem do servidor ("Quem seguir na sua cidade" ou "no seu estado").

### 4.9 Paginação
A mistura é montada inteira a cada pedido e depois fatiada (`page`, `limit`). O `total` da resposta ainda é a contagem simples do banco, então pode ser maior que a lista misturada.

## 5. Formato da resposta (`GET /posts`)

```jsonc
{
  "data": [ { /* PostDto */ "feedReason": "Em alta na sua cidade" } ],
  "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 1 },
  "suggestions": { "title": "Quem seguir na sua cidade", "profiles": [ { "kind": "politicians", "id": "...", "name": "...", "username": null, "avatarUrl": null, "verified": true, "subtitle": "Vereador · PARTIDO" } ] },
  "suggestionsAfter": 3
}
```
`suggestions` é `null` quando não se aplica. Tipos em `packages/shared-types/src/post.ts` (`PostDto.feedReason`, `FeedSuggestions`, `FeedSuggestedProfile`).

## 6. Como ajustar
- Proporções, limite por autor, limite de "poucos seguidos", textos dos rótulos e posição do cartão: `FOR_YOU_MIX` em `feed-mix.ts`.
- Peso de engajamento, bônus cívico, confiança e gravidade do tempo: `computePostScores` em `feed-ranking.service.ts`.
- Rode `npx jest src/posts` em `apps/api` depois de qualquer mudança. Os testes cobrem a proporção, a descoberta nunca colada, o filtro de confiança, o anti-monopólio e o preenchimento quando falta conteúdo.

## 7. Ainda não verificado
- Conferência visual no celular Android e com a API real e um usuário logado (a mistura foi validada por testes unitários e as consultas novas rodaram no banco de desenvolvimento).
- Os pesos são ponto de partida: ajustar com dados reais de uso.
