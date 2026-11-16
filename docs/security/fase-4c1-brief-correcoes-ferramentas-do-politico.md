# Brief 4C.1 — Correções do 4C

> Para o Gemini. O 4C foi aprovado, com **uma correção obrigatória** e três ajustes. Não alterar nada fora destes itens; qualquer dúvida, reportar em "Divergências".

## C1 (obrigatório) — Resolução de político por "slug" pode mostrar a pessoa errada

Em `apps/api/src/share-cards/share-cards.service.ts` (`resolvePoliticianBySlugOrId`, ~linha 99), quando o parâmetro não é UUID, o código carrega `findMany({ take: 250 })` **sem filtro nem ordenação** e escolhe o primeiro nome que bate. Problemas:

1. A tabela tem ~65 mil políticos: o alvo quase nunca está nos 250 primeiros (404 falso) e, com homônimos, **mostra o cartão de outra pessoa** (risco reputacional e jurídico).
2. Consulta aberta, sem autenticação, executada a cada requisição pública.

**Fazer:**
- **Remover** o fallback por nome. A rota pública passa a aceitar **só UUID** (ou slug estável gravado no banco).
- Se quiser URL amigável: adicionar `Politician.slug String? @unique` (gerado de nome + UF + cargo, com sufixo numérico em colisão, imutável depois de criado, backfill em lotes), resolvendo por consulta **exata e indexada**. Se não houver slug, usar UUID na URL `/p/:id/mandato`.
- Teste: dois políticos homônimos nunca se confundem; slug inexistente → 404; nenhuma consulta sem `where` indexado nas rotas públicas.

## C2 — Cartão e rotas públicas só para quem tem o recurso

Conferir e documentar: a imagem/meta pública `public/:id/{meta,image,og}` só responde para político **cujo plano inclui `share_card`** e com **status ATIVO**; caso contrário 404 (sem revelar existência). Teste por plano.

## C3 — SSRF: cobrir mais faixas IPv6

Em `apps/api/src/webhooks/ssrf-guard.ts`, `isPrivateOrReservedIp` não cobre:
- `64:ff9b::/96` (NAT64: embute IPv4; tratar extraindo o IPv4 e reaplicando a regra);
- `2002::/16` (6to4: idem, IPv4 nos bits 16–48);
- `::/96` (IPv4-compatível, obsoleto) e `2001::/32` (Teredo).

Adicionar casos de teste (inclusive `[64:ff9b::7f00:1]`, `[2002:7f00:1::]`, `[::127.0.0.1]`).

## C4 — Descadastro por GET

`GET /mandate/digest/unsubscribe?token=` altera dados; leitores de e-mail e antivírus podem abrir o link e descadastrar sem querer. Trocar por **GET que mostra uma página de confirmação** (ou `POST` acionado por botão), mantendo "1 clique" para o usuário. Token com `randomBytes` (já ok) e idempotente.

## C5 — Relatar o que faltou

No relatório, responder: (a) os PDFs, cartões, e-mails e webhooks foram testados com um relato anônimo e confirmam ausência de autor e de nota interna? (b) qual a cota mensal de PDF/cartão por plano e onde é aplicada (contagem atômica)? (c) a purga de `exports/accountability/` apaga também o registro do snapshot? (deve **manter** o snapshot imutável e apagar só o arquivo.)

## Pronto quando

`tsc` da API e do web limpos; suítes verdes (informar o número); `npm run build` ok; relatório curto com arquivo:linha de cada correção. **Não commitar.**
