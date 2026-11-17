# Distribuição de reposts — 17/11/2026

O repost agora participa do perfil público da conta que o fez e do feed Seguindo dos seus seguidores, no web e no mobile. A publicação mantém ID, autoria, comentários e ações originais. O cartão acrescenta o link `Nome repostou`, apontando para o perfil de quem republicou.

## Contrato e ordenação

- `GET /posts?profileUserId=:id`: publicações próprias e reposts da conta, em ordem da atividade mais recente. `authorUserId` continua sendo um filtro apenas de autoria, preservando consumidores anteriores.
- `GET /posts?sort=following`: inclui publicações de autores/perfis/pautas seguidos e publicações repostadas por contas seguidas.
- `PostDto.repost`: contexto opcional com ID/data do repost e dados públicos da conta. O detalhe original não recebe contexto de distribuição.
- Uma linha por publicação original, mesmo se o leitor seguir o autor e vários reposters. O repost relevante mais recente define o rótulo. Reposts de contas que o leitor não segue não alteram esse contexto no Seguindo.
- Ordenação por data de atividade e ID, com contagem e paginação feitas no banco. A implementação usa parâmetros Prisma e os índices existentes de `post_reposts`; não houve migração.
- Filtros de localidade, tipo de autoria, pauta, enquete e tipo de publicação continuam sendo aplicados ao conteúdo original.
- Remover o repost o retira do perfil e da distribuição por aquela conta. Se o autor original também for seguido, o post continua aparecendo como publicação original. Se outra conta seguida ainda o repostou, o contexto passa para essa outra conta.

O web passa a invalidar os feeds ao repostar/desfazer e pagina as publicações do perfil. Criar uma publicação também invalida os feeds em vez de inserir o novo conteúdo indiscriminadamente em caches de outros perfis/filtros. O mobile usa o mesmo contrato e mantém sua paginação por TanStack Query.

O registro atual de repost pertence à conta de usuário (`PostRepost.userId`), inclusive quando ela tem acesso a perfis institucionais. Esta entrega não criou repost institucional independente nem alterou o ranking Para você/Em alta.

## Verificações

- API: build TypeScript passou.
- Testes de posts/ranking: 2 suites, 10 testes passaram, incluindo preservação da autoria e propagação do contexto.
- `node apps/api/test/reposts.integration.mjs`: passou com API e PostgreSQL locais reais. Cobriu perfil, seguidores, original mais antigo repostado acima de publicação própria recente, dois reposters, ausência de duplicatas, filtros, paginação, página além do fim, remoção e feed anônimo. O teste respeita throttling; não altera limites da API. Publicações temporárias foram removidas e relações de seguir restauradas. Notificações de QA podem permanecer nas contas demo.
- Chromium autenticado com Bruno/Carla demo: rótulo no perfil e Seguindo, navegação para o perfil do reposter e para o post original, remoção após desfazer; conferido em 1440 e 390 px, sem erros de JavaScript ou overflow.
- Web: build passou.
- Mobile: lint, TypeScript e exportações Android/iOS passaram. A verificação física desta alteração depende da reconexão USB; não declarar o rótulo validado no aparelho apenas pelo teste web.

## Mapa mobile em paralelo

A build Android do mapa terminou e o APK foi baixado (342.812.904 bytes, cliente de desenvolvimento com código nativo). A tentativa de instalar retornou `adb.exe: no devices/emulators found`. O Android deixou de aparecer na USB; foi solicitada a reconexão. Instalação e validação física de mapa, filtros, grupos e GPS continuam pendentes. Ver [mobile-map-2026-11-17.md](./mobile-map-2026-11-17.md).

Atualização após a reconexão: o APK foi instalado e o mapa validado no Android físico, conforme a seção final do documento acima. Também foi conferido o repost no perfil da Ana demo: ativar no detalhe do post QA exibiu `Ana Cidadã (Demo) repostou` no perfil, com contador 2; desfazer no cartão do perfil removeu o rótulo, preservou a publicação original e restaurou o contador 1 na API. O estado do repost foi restaurado. A aba Seguindo foi validada por API e navegador na rodada anterior; não houve troca de conta no Android para repetir esse cenário.
