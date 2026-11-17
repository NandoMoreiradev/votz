# Mapa mobile e verificação de repost — 17/11/2026

## Repost

Web e mobile chamam `POST /posts/:id/repost`, que cria/remove `PostRepost` e incrementa/decrementa o contador em transação. O DTO retorna `repostedByMe` para o usuário autenticado. Isso não implementa distribuição completa como o X: o filtro atual de perfil considera autoria, e o feed Seguindo não inclui publicações pela identidade de quem as repostou.

O teste de recarregamento encontrou uma corrida no web: o detalhe/feed podiam consultar a API antes da restauração da sessão, recebendo indicadores de visitante. `usePost` e `usePostsFeed` agora aguardam `sessionReady`, assim como os hooks de notificações.

Verificado no Chromium com a conta demo, no post QA `9b318a7b-6ae7-44e5-bdcd-e26ad58aca44`: repost retornou `true/2`, recarregamento retornou `repostedByMe: true` e contador 2, remoção restaurou `false/1`. No Android físico, toque ativou o ícone e elevou o contador para 2, confirmado pela API; segundo toque restaurou contador 1. Estado final da conta demo: sem repost desse post. Build do web passou.

## Mapa implementado

- Aba Mapa em Expo Router, com renderização nativa usando `@maplibre/maplibre-react-native` 11.5.1 e seu config plugin.
- Mesmo GeoJSON público do web: `GET /map/reports`, filtros de categoria/status e bounding box. Até 500 pontos por consulta.
- Marcadores por categoria, agrupamento nativo com contagem e ampliação ao tocar no grupo.
- Cartão de seleção com título, status, cidade, apoios/comentários e navegação para o relato.
- Busca explícita na área visível, atualização, limpeza de filtros, vazio e falhas com nova tentativa.
- Localização opcional por `expo-location`, solicitada somente pelo controle Minha localização. Sem rastreamento contínuo ou localização em segundo plano.
- Pontos sem coordenadas não são colocados em posição fictícia. Coordenadas inválidas são descartadas no cliente.
- Clientes de desenvolvimento antigos não importam o módulo nativo ausente: mostram instrução de atualização e mantêm as demais abas funcionando.

O fundo padrão é OpenFreeMap Positron, configurável por `EXPO_PUBLIC_MAP_STYLE_URL`. A chave pública MapTiler existente no web respondeu HTTP 403 por restrição de uso fora do domínio; não foi reutilizada nem teve restrições alteradas. O OpenFreeMap documenta uso dos mesmos estilos no MapLibre Native. As atribuições do provedor e dos dados permanecem acessíveis no mapa. Serviço de tiles externo continua sujeito à disponibilidade do provedor; não foi implementado download offline.

## Verificação concluída antes da instalação nativa

| Verificação | Resultado |
| --- | --- |
| TypeScript e lint mobile | Passaram |
| Compatibilidade Expo (`expo install --check`) | Dependências atualizadas |
| Testes `node --test apps/mobile/tests/map-data.test.mjs` | 3 passaram |
| Exportação Hermes Android/iOS | Passou, cerca de 3,2 MB de bundle JS por plataforma |
| Estilo OpenFreeMap e fonte usada nos grupos | HTTP 200 |
| API real de mapa | 187 pontos; filtro Saúde + bounding box retornou 2, ambos dentro dos filtros |
| Aba Mapa no Android com APK antigo | Mensagem de atualização conferida, sem quebra do app |

`npm audit --omit=dev` reportou 36 entradas (33 altas, 3 moderadas), propagadas majoritariamente pela cadeia Expo/React Native já existente. A nova entrada MapLibre propaga o aviso do Expo. As sugestões automáticas incluem versões incompatíveis de SDK/RN; não foi executado `audit fix --force`.

## Build e validação pendente

Build Android de desenvolvimento enviada: [eac42b35-49fd-4491-af38-5e10f31f3897](https://expo.dev/accounts/fernando_moreira.dev/projects/votz-mobile/builds/eac42b35-49fd-4491-af38-5e10f31f3897).

Na última verificação desta etapa, o EAS ainda mostrava `IN_QUEUE`. O APK anterior não contém MapLibre. A validação nativa de renderização, zoom, grupos, filtros, seleção e GPS depende de instalar a nova build; não considerar esses fluxos aprovados apenas pelos bundles. Não houve teste físico em iPhone nem envio às lojas.

Após a build finalizar, baixar o APK, instalar com `adb install -r`, manter os encaminhamentos USB 3000/8081 e abrir a development build no Metro local. Reiniciar Metro se necessário após instalar dependências nativas. A build é do cliente de desenvolvimento; durante os testes, ele carrega o código atualizado servido pelo Metro.

Atualização posterior: a build passou para `FINISHED` e o APK foi baixado em `apps/mobile/.expo/map-development.apk`. A instalação não ocorreu porque o ADB retornou `no devices/emulators found`. Foi solicitada a reconexão do aparelho; a validação física continua pendente. A distribuição de reposts citada como ausente acima foi implementada em uma etapa posterior: [reposts-distribution-2026-11-17.md](./reposts-distribution-2026-11-17.md).

## Validação física após reconexão USB

O usuário reconectou o RMX3840. `adb install -r` retornou `Success`; as portas 3000 e 8081 foram encaminhadas novamente e a nova development build abriu o código do Metro.

| Fluxo no Android real | Resultado |
| --- | --- |
| Renderização do mapa, tiles, nomes e grupos | Passou, 187 relatos carregados |
| Enquadramento inicial | Ajustado para reservar espaço aos controles e ao cartão inferior; conferido após reiniciar |
| Categoria Saúde | 18 relatos, igual à API |
| Saúde + Resolvido | 2 relatos, igual à API |
| Toque em agrupamento | Ampliou e separou os dois marcadores |
| Seleção de marcador | Cartão com categoria/status, título e contadores; anel de seleção visível |
| Ver relato | Abriu `[Demo] Falta de remédio na farmácia do posto - Jardins`, do marcador selecionado |
| Voltar do relato | Retornou ao mapa com filtros preservados |
| Arrastar e Buscar nesta área | Consulta executada; recorte sem pontos mostrou 0 relatos e orientação para mudar de área |
| Limpar filtros | Restaurou os 187 relatos |
| Minha localização | Centralizou e mostrou o indicador azul; coordenadas pessoais não foram registradas neste documento |
| Logs do processo do Votz durante os testes | Sem erro React Native ou falha fatal no trecho inspecionado |
| Lint e TypeScript após os ajustes | Passaram |

O ajuste de enquadramento e a correção de singular/plural dos contadores são mudanças JS, servidas pelo Metro; não exigem outro APK. A instalação e a validação básica do mapa no Android estão concluídas. Permanecem fora desta rodada: teste físico em iPhone, rede offline e medições de desempenho em build release.

Referências: [MapLibre — Expo Setup](https://maplibre.org/maplibre-react-native/docs/setup/expo/), [MapLibre — requisitos](https://maplibre.org/maplibre-react-native/docs/setup/getting-started/), [Expo SDK 58 Location](https://docs.expo.dev/versions/v58.0.0/sdk/location/), [OpenFreeMap — integração mobile](https://openfreemap.org/quick_start/).
