# Votz mobile

App React Native + Expo com navegação nativa, TypeScript, TanStack Query, Zustand e identidade Votz. Android e iOS compartilham o produto; testes iniciais em Android físico por USB.

## Desenvolvimento no Android

O mobile tem instalação independente para isolar React 19 do React 18 do web. Os tipos comuns vêm de uma dependência local sem React. Após instalar as dependências da raiz, execute `npm install --prefix apps/mobile --workspaces=false`.

Execute os comandos abaixo na raiz do monorepo, usando `npm.cmd` no PowerShell se a política de execução bloquear `npm.ps1`.

### Caminho preferido: sem Android Studio, build na nuvem

O EAS CLI já está instalado neste computador. A mesma conta Expo pode conter Maskot Edu e Votz, com projetos, IDs e credenciais próprios. Não reutilize o projectId do Maskot Edu.

```powershell
cd apps/mobile
npx eas-cli@latest whoami
# Se não estiver autenticado, faça login no seu próprio terminal:
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile development
```

A primeira configuração associa este app a um projeto novo, `votz-mobile`, e gera o APK de desenvolvimento na nuvem. Instale o APK disponibilizado pelo EAS no Android. Este caminho dispensa Java e SDK locais. Use o plano/cota disponíveis na sua conta; não é necessário contratar um plano para preparar o projeto.

Projeto já vinculado: [@fernando_moreira.dev/votz-mobile](https://expo.dev/accounts/fernando_moreira.dev/projects/votz-mobile), ID `bad8e5fc-6bbd-45ac-bbc7-5bcd2ac52ad9`.

Após instalar o APK, volte à raiz do repositório e execute:

```powershell
npm --prefix apps/mobile run android:usb
npm --prefix apps/mobile run dev
```

Abra a development build do Votz no aparelho. Pela conexão USB, o servidor pode ser acessado em `http://127.0.0.1:8081`. A API local fica em `http://127.0.0.1:3000/api/v1`. Inicie também a API, PostgreSQL e Redis conforme o fluxo existente.

### Alternativa: compilação nativa local

Android Studio é opcional: também é possível instalar apenas Android SDK Command-line Tools, platform/build tools e JDK compatíveis. Abaixo estão os passos para quem já tem o SDK local.

1. Instale o Android Studio com o SDK/Build Tools exigidos pelo Expo SDK 58 e configure `ANDROID_HOME` e o JDK compatível. ADB sozinho não compila o aplicativo.
2. Copie `apps/mobile/.env.example` para `apps/mobile/.env.local`. Não coloque segredos em variáveis `EXPO_PUBLIC_*`: elas entram no aplicativo.
3. Inicie PostgreSQL/Redis e a API conforme o fluxo existente do repositório. O comando da API é `npm run start:dev --workspace=apps/api`.
4. Ative Opções do desenvolvedor e Depuração USB no Android. Conecte com um cabo de dados e aceite a chave RSA do computador.
5. Execute:

```powershell
npm --prefix apps/mobile run android:doctor
npm --prefix apps/mobile run android:usb
npm --prefix apps/mobile run android
```

Após instalar a development build, para o uso diário:

```powershell
npm --prefix apps/mobile run android:usb
npm --prefix apps/mobile run dev
```

As portas 3000 (API) e 8081 (Metro) são encaminhadas por USB. `127.0.0.1` passa a alcançar o computador. Refaça o encaminhamento ao reconectar o cabo. O Fast Refresh aplica mudanças JS/TS sem reinstalar. Alterações em módulos nativos, plugins ou permissões exigem uma nova build.

Como alternativa, uma development build pode ser gerada com EAS e instalada no aparelho, usando uma conta Expo. A primeira build nativa não é produzida apenas pelo servidor Metro.

## Configuração e ambientes

- `APP_VARIANT=development`: permite HTTP no Android para a API local.
- Preview/produção: use `EXPO_PUBLIC_API_URL` com HTTPS, apontando para uma API com os endpoints `/auth/mobile/*` publicados. HTTP é desabilitado no Android nesses perfis.
- `eas.json` define development, preview e production. Configure a URL da API no ambiente correspondente do EAS antes de gerar binários. A URL de exemplo não é uma API de produção.
- Identificadores iniciais: `br.com.votz.app`. Confirmar a propriedade/disponibilidade antes das lojas.
- No Windows, o build local iOS exige outro computador com macOS/Xcode; EAS permite compilar na nuvem. Ainda é necessário testar em iPhone e configurar assinatura/conta Apple.
- Não há updates OTA nem envio automático às lojas configurados nesta etapa.

## Implementado nesta primeira entrega

- Feed de publicações (recentes, para você, seguindo) e feed de relatos; paginação, atualização ao puxar e tratamento de falhas.
- Detalhes de publicações e relatos, memória pública, curtidas, reposts, comentários de texto com respostas encadeadas, apoio e votação em enquetes existentes.
- Login e MFA, incluindo configuração obrigatória do autenticador e códigos de recuperação.
- Criação de publicações, enquetes e relatos com fotos, câmera e localização opcional; cidade/UF e anonimato de relatos.
- Explorar políticos/entidades, abrir perfis de cidadãos/políticos/entidades e seguir/deixar de seguir.
- Perfis com abas paginadas de publicações/relatos e edição de nome, nome de usuário e bio da própria conta.
- Cabeçalho compacto com logo oficial, composição em tela cheia, visualização de fotos e tratamento do teclado em comentários/formulários.
- Aba Mapa com MapLibre Native, agrupamento de marcadores, filtros por categoria/status, busca na área visível e abertura do relato. Localização do aparelho opcional, somente ao tocar no controle.

O mapa usa `/map/reports`, o mesmo GeoJSON público do web, com até 500 pontos por consulta. Relatos sem coordenadas não ganham posição aproximada inventada. O fundo padrão usa OpenFreeMap Positron, com atribuições acessíveis no mapa. Para outro provedor, configure `EXPO_PUBLIC_MAP_STYLE_URL` com um estilo MapLibre servido por HTTPS e credenciais públicas adequadas ao app. A chave MapTiler do web possui restrição de uso e não é reutilizada no mobile.

MapLibre contém código nativo. APKs anteriores à inclusão desse módulo mostram uma mensagem de atualização na aba Mapa e continuam permitindo o uso das outras abas. É necessário instalar a nova development build; Fast Refresh sozinho não adiciona o módulo. O plugin `@maplibre/maplibre-react-native` configura Android/iOS pelo fluxo de geração nativa do Expo, sem manter pastas `android/` ou `ios/` no repositório.

Não considerar esta base um lançamento pronto. Cadastro nativo, troca de contexto institucional, notificações push, denúncias/bloqueio, exclusão de conta, consentimento atualizado, vídeo/áudio, rascunhos persistentes, edição de publicações, envio em segundo plano e paridade das publicações especiais ainda precisam ser concluídos. Feeds principais e abas dos perfis têm paginação. Web e mobile usam os mesmos registros na API; alterações feitas em outro cliente exigem atualizar a consulta, sem sincronização em tempo real garantida.

Revisão visual e testes no aparelho: [mobile-social-review-2026-11-17.md](../../docs/dev/mobile-social-review-2026-11-17.md).

Mapa nativo, build e verificação de repost: [mobile-map-2026-11-17.md](../../docs/dev/mobile-map-2026-11-17.md).

Distribuição de reposts no perfil e no feed Seguindo: [reposts-distribution-2026-11-17.md](../../docs/dev/reposts-distribution-2026-11-17.md).

## Sessão e segurança

O app mantém access token em memória e refresh token no SecureStore. O transporte `/auth/mobile` ignora cookies, devolve tokens explicitamente e reutiliza validação de senha, MFA, rotação, detecção de reutilização e revogação do AuthService. Os endpoints web continuam com suas proteções de cookie/CSRF.

Falhas de rede na renovação não apagam o refresh token. Logout pede revogação ao servidor antes de remover a sessão local. Mutations não são repetidas automaticamente. Cache é limpo ao trocar de usuário e ao encerrar a sessão. Dados privados não são persistidos em armazenamento comum.

## Verificações

```powershell
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run lint
npm --prefix apps/mobile run check
npm --prefix apps/mobile run export:android
npm --prefix apps/mobile run export:ios
node --test apps/mobile/tests/map-data.test.mjs
npm test --workspace=apps/api -- --runInBand --runTestsByPath src/auth/mobile-auth.controller.spec.ts
```

Exportação valida resolução e bundle JS; não substitui compilação/instalação nativa, testes de integração com API real nem medições em release. Para exportar, configure uma URL HTTPS válida, inclusive durante validação local.

Na validação inicial, os bundles Hermes de Android e iOS ficaram em aproximadamente 3 MB cada, com apenas três arquivos de fonte importados. Isso não representa o tamanho do APK/IPA ou o uso de memória. Os endpoints locais de health, publicações e relatos responderam HTTP 200. Os 72 testes de autenticação e auditoria de autorização passaram.

`npm audit --omit=dev` também identificou dois avisos subjacentes na cadeia de ferramentas (`minimatch` e `picomatch`), propagados em 35 entradas. As correções sugeridas pelo npm incluem trocas incompatíveis de SDK; não foi executado `audit fix --force`. Revisar atualizações compatíveis antes do lançamento.

Ícones e splash foram derivados do símbolo oficial existente no web. Antes de publicar: validar as duas plataformas, revisar permissões e dependências, configurar monitoramento de falhas, concluir privacidade/moderação/conta e testar acessibilidade, rede ruim, sessão expirada e desempenho em aparelhos reais.

Referências: [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/), [monorepos](https://docs.expo.dev/guides/monorepos/).
