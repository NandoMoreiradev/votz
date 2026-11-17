# Revisão social do mobile — 17/11/2026

Revisão das seis observações sobre integração com o web, aparência social, teclado, cabeçalho, referências e perfil. Desenvolvimento validado na development build já instalada no Android físico RMX3840, conectada por USB à API local. Não houve publicação nas lojas nem geração de novo APK nesta rodada.

## Integração com o web

Mobile e web acessam os mesmos endpoints e registros. A autenticação mobile tem transporte próprio de tokens, mas usa a mesma identidade e autorização no servidor. Comparar os IDs pela API e pelo proxy web confirmou a integração local; isso não representa validação de uma API de produção remota.

| Operação | Integração atual |
| --- | --- |
| Feed e criação de publicações | `/posts`, com filtros, paginação e mídia |
| Feed e criação de relatos | `/reports`, com categoria, anonimato e localização opcional |
| Comentários e respostas | `/{posts,reports}/:id/comments`, com `parentId` |
| Curtidas, reposts, apoio e enquetes | Endpoints existentes da API |
| Perfis e seguir/deixar de seguir | Identidades existentes de cidadãos, políticos e entidades |
| Edição do próprio perfil | `PATCH /users/:id`: nome, username e bio |

Os caches dos dois aplicativos são independentes. Após uma ação feita no outro cliente, atualizar o feed/consulta para obter os novos dados. Não foi implementada sincronização em tempo real entre clientes.

## Interface implementada

- Cabeçalho de 52 dp com a logo SVG oficial copiada do web; abas de Publicações e Relatos.
- Publicações em linhas de largura inteira, avatar, autoria, horário relativo e ações; botão flutuante de composição.
- Compositor em tela cheia, texto sem caixa pesada, ação de publicar no topo e ferramentas no rodapé. Fotos, categoria por seleção, localização recolhida e formulário de enquete.
- Conversa com respostas encadeadas, indicação do destinatário e editor fixado acima do teclado, tanto para posts quanto para relatos.
- Perfis com avatar sobre faixa de identidade, bio, dados reais, seguir/editar e abas paginadas. Sem inventar contadores de seguidores que o contrato atual não fornece.
- Ajuste de teclado com `KeyboardAvoidingView` nas duas plataformas e rolagem para revelar o campo em formulários longos.

As decisões de composição e conversa foram inspiradas nos fluxos oficiais de [publicação do X](https://help.x.com/en/using-x/how-to-post) e [conversas do X](https://help.x.com/en/using-x/x-conversations). Também foi consultada a apresentação de [recursos sociais do Instagram pela Meta](https://about.fb.com/news/2025/08/new-instagram-features-help-you-connect/). A implementação mantém a identidade visual do Votz. O tratamento de teclado segue a [documentação do Expo](https://docs.expo.dev/guides/keyboard-handling/) para Android com edge-to-edge.

## Verificações executadas

| Verificação | Resultado |
| --- | --- |
| TypeScript (`typecheck`) | Passou |
| ESLint (`lint`) | Passou |
| Exportação Hermes Android | Passou, aproximadamente 3,1 MB de bundle JS |
| Exportação Hermes iOS | Passou, aproximadamente 3,1 MB de bundle JS |
| Feed e perfil no Android físico | Layout renderizado, navegação e logo oficial conferidos |
| Comentário com teclado aberto | Campo e botão visíveis; envio concluído |
| Resposta encadeada em publicação | Envio concluído; `parentId` e resposta aninhada confirmados pela API |
| Comentário em relato | Envio concluído; mesmo ID retornado pela API e pelo proxy web |
| Bio do perfil com teclado aberto | Campo revelado pela rolagem, sem salvar alterações de teste |
| UF no compositor com teclado aberto | Campo visível acima da barra de ferramentas e do teclado |

Registros de teste, na conta demo:

- Post `9b318a7b-6ae7-44e5-bdcd-e26ad58aca44`: três comentários raiz e uma resposta encadeada após os testes. A resposta final usa o texto `QA social: thread confirmada.`.
- Relato `868a3878-07f0-4e55-8554-692c3d1ec0ec`: comentário `1504291d-be3b-4400-adac-49c82ac883d1`, com texto `QA social: comentario no relato pelo Android.`. O mesmo registro foi obtido em `localhost:3000/api/v1` e `localhost:5173/api/v1`.

## Limites desta rodada

Exportar iOS valida o bundle, não a experiência em um iPhone. A nova edição de perfil e criação de enquetes passaram pelas verificações estáticas, mas não tiveram gravação completa exercitada nesta rodada. Permanecem pendentes recursos como gravação/reprodução de áudio e vídeo, criação de comentários com mídia, troca de contexto institucional, composição de citações e outros tipos especiais, além dos requisitos de conta, privacidade e moderação descritos no README mobile. Não há paridade integral com o web nem aprovação de lançamento.

## Alinhamento posterior do Votz Web

A pedido do usuário, a revisão foi aplicada também ao web local:

- Feed contínuo com divisórias, avatar na lateral e conteúdo alinhado; retirados os cartões arredondados e suas sombras.
- Abas de feed e perfil sublinhadas na cor de ação Votz, usando estilos compartilhados em `components/ui/social.ts`.
- Navbar de 56 px, com logo oficial e offsets correspondentes do submenu e do cabeçalho fixo.
- Compositor com superfície limpa, texto maior e ferramentas compactas. Em telas estreitas, ferramentas com ícones e nomes acessíveis evitam a quebra excessiva de linhas.
- Comentários de posts com formulário mais leve e largura ampliada em relação à coluna do avatar. Formulário dos relatos com superfície suave e botão arredondado na mesma cor de ação.
- Perfil cidadão com faixa de identidade, avatar sobreposto, ações e abas de conteúdo. Cabeçalhos institucionais de políticos e entidades também receberam faixa e avatar sobreposto, mantendo seus indicadores públicos.
- Relatos no feed com autoria real (preservando anonimato), categoria e mídia quando disponível, sem o painel decorativo de categoria em relatos sem foto.

Validação em Chromium automatizado, autenticado na conta demo, nas larguras 1440 px e 390 px:

| Verificação web | Resultado |
| --- | --- |
| Build TypeScript + Vite | Passou |
| `git diff --check` | Passou |
| Feed, detalhe da publicação e perfil cidadão | Conferidos em desktop e tela estreita |
| Feed de relatos em tela estreita | Conferido |
| Perfis de político e entidade | Conferidos em desktop |
| Erros de JavaScript e rolagem horizontal | Nenhum nas oito telas verificadas |
| Resposta encadeada criada no Android | Renderizada no detalhe da publicação no web |
| Compositor/enquete em tela estreita | Rascunho e abertura dos campos conferidos; não publicado |
| Envio de comentário pelo navegador | Resposta HTTP de sucesso, renderização e presença na API compartilhada confirmadas |

O comentário final de verificação usa `QA social web 20261117: envio confirmado.` no post de teste identificado acima. Um primeiro envio com texto `QA social web 20261117: resposta pelo navegador.` também persistiu; a primeira leitura automatizada ocorreu antes do término da mutation. A repetição aguardou explicitamente a resposta HTTP e a renderização do comentário.

O comando de lint do web não executou porque o workspace não disponibiliza o binário ESLint e não tem configuração própria. A validação estática executada foi o TypeScript do build. O Vite também sinaliza o tamanho elevado do chunk principal; otimização de carregamento não fez parte desta revisão visual. As alterações estão locais, sem deploy.

### Navegação ao comentar

O botão de comentário dos posts passou a ser um link para `/publicacoes/:id#responder`. Os comentários ficam na página da publicação; o campo de resposta recebe foco ao chegar pelo link. Na própria página, o mesmo botão volta ao campo sem esconder a conversa nem apagar o rascunho. Verificado no Chromium autenticado, pelo feed e pelo perfil cidadão, em 1440 px e 390 px: destino correto, foco, ausência de expansão na origem e preservação do rascunho. Nenhum comentário foi enviado nesses quatro testes de navegação; nenhum erro de JavaScript foi registrado.

### Correção do painel de notificações

O painel acessava `notification.report.id` e `.title` em todos os itens. Notificações sociais (`POST_LIKE`, `POST_COMMENT`, `POST_REPOST`, `POST_MENTION`) chegam com `report: null` e o identificador da publicação em `metadata.postId`, causando a quebra ao abrir o sino.

O contrato web agora representa o relato anulável e os tipos enviados pela API. A resolução de texto/destino fica em `lib/notification-content.ts`: eventos sociais abrem `/publicacoes/:id`, comentários usam `#responder`, eventos de relatos mantêm `/relatos/:id` e itens sem destino viram botões que permitem marcar como lidos. O emoji foi substituído pelo ícone vetorial Bell do Phosphor, com nome acessível e estado expandido. O painel ganhou estados de carregamento/falha com nova tentativa e fechamento por Escape.

Regressão: `node --test apps/web/tests/notification-content.test.mjs` passou em quatro testes, cobrindo eventos sociais sem relato, tradução de status, ausência/metadados incompletos e composição segura de URL. No Chromium autenticado, o painel com notificações reais abriu sem erros e apresentou três links válidos para publicações. Com respostas de teste interceptadas (sem alterar o banco), foram verificados oito itens mistos nas larguras 1440 e 390 px, incluindo navegação da notificação de comentário para o post, itens sem destino, limites do painel e fechamento por Escape. Nenhum erro de JavaScript foi registrado.

### Organização da página da publicação

O detalhe deixou de reutilizar a apresentação recuada do feed e de conter a conversa dentro do artigo. `PostCard` agora recebe a variante `detail`: autor em fluxo normal, conteúdo de largura completa com tipografia maior, data/hora completa e faixa de ações distribuídas. A página tem coluna de 680 px, cabeçalho fixo com título e retorno, e seção independente de respostas com contador real. O compositor inclui avatar da identidade ativa e ferramentas compactas; respostas encadeadas mantêm sua hierarquia. Os estados de visitante, carregamento, falha e conversa vazia foram organizados na mesma seção.

Validação em Chromium: post com conversa e post com enquete nas larguras 1440, 390 e 320 px (seis casos), sem erro de JavaScript nem rolagem horizontal. Conferidos também rascunho principal preservado ao abrir/cancelar resposta encadeada, convite de login para visitante e cabeçalho fixo abaixo da navbar durante rolagem. A regressão de navegação ao comentar pelo feed/perfil passou nas duas larguras anteriores, incluindo foco e preservação do rascunho. Nenhum conteúdo foi publicado nesses testes.
