# Conversas: diagnóstico e roteiro até o nível A

Data: 18/11/2026. Complementa o [plano de produto](../negocio/comunicacao-e-pulso.md) e os registros técnicos anteriores: [fundação](conversations-foundation-2026-11-17.md), [interfaces](conversations-ui-2026-11-18.md), [E2EE](chat-e2ee-evaluation-2026-11-18.md) e [texto cifrado](chat-text-2026-11-18.md).

Meta aprovada: um mensageiro robusto, nível A, no estilo WhatsApp: texto, imagem, vídeo, áudio, arquivo, chamada de voz e de vídeo, mensagens individuais e grupos. **Regra de desenvolvimento: web e mobile evoluem juntos.** Uma etapa só é concluída quando funciona nas duas plataformas, com teste de interoperabilidade entre elas e documento atualizado.

## Como retomar (leia primeiro)

Estado atualizado em **19/11/2026** (commit base `8d164fe`; alterações locais de hoje ainda a commitar: correções de redefinição, sessão cifrada durável no web, view-model compartilhado e **Etapa 1 — Texto em grupo**).

1. **Concluído e validado no servidor, no navegador e no Android físico (`RMX3840`) em 19/11/2026:** última leva da Etapa 0 (ativação invisível, textos sem jargão, redefinição sem aparelhos), sessão cifrada durável no web, view-model compartilhado (`chatView`) em `packages/chat-core` (web + mobile) e **Etapa 1 — Texto em grupo** (API + `chat-core` + web + mobile). Validado em E2E real no Chromium (4 contas) e em interoperabilidade real **Android físico (`RMX3840`) ↔ Chromium (Bruno e Carol)**: abertura invisível sem botão, envio/decifração nos dois sentidos com nome do remetente e recibos em grupo (`Lida por 1 de 2` → `Lida`).
2. **Ainda pendente de validação em aparelho físico:** iOS (e, no Android, cenários específicos de aviso de chave trocada, verificação opcional no celular e celular como segundo aparelho pedindo aprovação).
3. **Próximo bloco do roteiro:** **Etapa 2 — Mídia e notificações** (imagem, vídeo, áudio e arquivo cifrados no cliente + push discreto com aplicativo fechado). Transferência de histórico entre aparelhos e backup cifrado opcional na nuvem foram adiados por decisão de produto para a **Etapa 6 (Configurações)**.
4. **Decisões do dono do produto:**
   - **Aprovadas (19/11/2026):** transferência de histórico entre aparelhos e backup cifrado opcional na nuvem ficam para a **Etapa 6 (Configurações)**; retenção de anexos cifrados na nuvem definida em **90 dias** (Etapa 2).
   - **Ainda em aberto:** prévia sempre visível (exige guardar texto cifrado em disco no aparelho) e senha opcional do navegador em Configurações.
5. **Regras de trabalho acordadas:** web e mobile sempre juntos; nenhum jargão técnico para o cidadão (um teste automático garante); mudanças no modelo de segurança só com aval; declarar o que foi e o que não foi verificado; atualizar este documento a cada entrega.

## Estado em 18/11/2026

Base sólida, mas a entrega funcional é só **texto em conversa individual**.

| Função | API | Web | Mobile |
| --- | --- | --- | --- |
| Conversa individual, convite e aceite | Pronto | Pronto | Pronto |
| Criar e administrar grupo | Pronto | Pronto | Pronto |
| Bloquear e desbloquear | Pronto | Pronto | Pronto |
| Texto individual cifrado de ponta a ponta | Pronto | Pronto | Código pronto; sem teste em aparelho |
| Enviada, entregue, lida (leitura opcional) | Pronto | Pronto | Pronto |
| Fila offline durável, reenvio sem duplicar | Pronto | Pronto | Pronto |
| Texto em grupo | Pronto | Pronto | Pronto (validado no Android físico) |
| Imagem, vídeo, áudio, arquivo | Ausente | Ausente | Ausente |
| Chamada de voz e de vídeo | Ausente | Ausente | Ausente |
| Responder, reagir, encaminhar | Ausente | Ausente | Ausente |
| Prévia e não lidas na lista | Ausente | Ausente | Ausente |
| Push com aplicativo fechado | Ausente | n/a | Ausente |
| Digitando, visto por último, silenciar, buscar, denunciar | Ausente | Ausente | Ausente |
| Configurações de conversas | Parcial (só confirmação de leitura) | Parcial | Parcial |

Bibliotecas: o mobile só tem `expo-image-picker` (sem áudio, câmera, documentos, notificações ou LiveKit). O web tem `livekit-client`; a API tem `livekit-server-sdk`, ambos usados só nos debates.

Verificado em 18/11/2026: `packages/chat-core` 8 testes aprovados; `conversations.spec` 12 testes aprovados. Integração, TypeScript/lint do mobile e aparelhos não foram reexecutados neste diagnóstico.

## Problemas e riscos identificados

1. **Um dispositivo cifrado por conta.** Impede usar web e celular com a mesma conta. Contradiz a sincronização entre plataformas.
2. **Verificação SAS obrigatória antes de enviar.** Fricção incompatível com o público do Votz. Substituir por confiança no primeiro contato com alerta de mudança de chave (decisão aprovada em 18/11/2026).
3. **Chat só funciona com a tela aberta.** O mobile encerra a sessão ao sair da tela ou ir para segundo plano; não há push. Histórico é redecifrado a cada abertura.
4. **Cliente por conversa.** `ChatClient` sincroniza uma sala; a lista não tem última mensagem nem não lidas.
5. **`ChatService` sem teste unitário** (710 linhas), contra a regra do projeto. Hoje só há scripts de integração.
6. **Lógica de tela duplicada** entre `ChatPane` web e mobile.
7. **Resíduos de depuração** em `chat-crypto.ts` do mobile; estilo sem uso; checagem duplicada do limite de pendências em `send()`.
8. **Sem validação nativa** em aparelho Android/iOS; ponte `react-native-matrix-crypto` com override de peer dependency (RN 0.87 contra 0.88).

## Decisões aprovadas

- **Multi-dispositivo** é pré-requisito da Etapa 0.
- **Confiança no primeiro contato (TOFU) com alerta de mudança de chave** substitui a verificação obrigatória. A verificação por código passa a ser opcional.
- O visual das conversas deve ser refinado ao final, muito próximo de um aplicativo de mensagens (WhatsApp), preservando a identidade do Votz nas demais telas.
- Deve existir uma área de **configurações de conversas**, nos moldes do WhatsApp.

## Etapa 0: desenho do multi-dispositivo e do modelo de confiança

### Dinâmica de vários aparelhos

- Cada aparelho (celular, navegador) tem chaves próprias e sessão própria no transporte. Mensagens são cifradas para **todos os aparelhos ativos** de quem recebe e também para os **outros aparelhos de quem envia**, para que o histórico apareça em todos.
- Limite de **5 aparelhos ativos** por conta e **3 pedidos pendentes** por vez.
- O primeiro aparelho ativa direto. Qualquer aparelho adicional faz um **pedido de vínculo**: mostra um código de 6 dígitos e fica aguardando. Um aparelho já ativo vê o pedido (plataforma, nome, horário, código) e aprova ou recusa. O pedido expira em 10 minutos. Sem aprovação, o aparelho novo não recebe credenciais nem chaves, mesmo que o login da conta tenha funcionado. Uma senha ou sessão vazada não basta para ler conversas.
- Em **Configurações de conversas > Aparelhos conectados**: lista, nome, aprovar pedidos e **desconectar**. Desconectar revoga o aparelho no banco (autoridade), remove-o do transporte e o exclui de consultas e envio de chaves.
- Um aparelho novo lê **mensagens a partir do vínculo**. Histórico anterior exige backup de chaves ou compartilhamento de histórico entre aparelhos; a ponte nativa tem essas funções (`shareHistoryBundle`, backup), e isso fica como item próprio desta etapa.
- **Pendente:** quando a conta perde todos os aparelhos não há como aprovar um novo. Precisa de redefinição com reautenticação forte (revoga tudo e recomeça; histórico anterior não é recuperado sem backup).

### Confiança no primeiro contato (TOFU)

O que muda: a pessoa não compara mais códigos para conversar. O primeiro aparelho que o Votz apresenta para um contato passa a ser confiável. Se o conjunto de aparelhos do contato mudar (aparelho novo, removido ou trocado), a conversa mostra um aviso "O código de segurança de fulano mudou" e a pessoa pode verificar por código se quiser.

Comparação com o WhatsApp: **o modelo de confiança é o mesmo** (confiança no primeiro contato, aviso de mudança, verificação opcional). **O protocolo não é idêntico:** o WhatsApp usa o protocolo Signal; o Votz usa Olm/Megolm do Matrix, também revisado e de ponta a ponta, mas com propriedades diferentes (por exemplo, a cifra de grupos do Matrix compartilha uma chave de sessão por remetente). Em ambos, quem controla o diretório de chaves (o servidor) poderia tentar apresentar um aparelho falso; o aviso de mudança e a verificação opcional são a defesa. Para igualar o WhatsApp no ponto fraco, **o aparelho novo só entra com aprovação de um aparelho ativo**, como o QR do WhatsApp. Para ir além, existe a assinatura cruzada de aparelhos (cross-signing), que a ponte já oferece e fica como reforço futuro. Afirmar "nível WhatsApp" para o público exige a revisão externa de segurança já prevista nos requisitos de liberação.

### Andamento (18/11/2026)

- **Servidor, concluído e verificado em 18/11/2026:** migração `20261118220000_chat_multi_device` aplicada no banco local (remove o índice de um aparelho por conta; adiciona `chat_device_links`); pedido, aprovação, listagem e revogação de aparelhos; envio de eventos para vários aparelhos (nunca curinga, aparelho revogado ou o próprio remetente); consultas e reivindicações de chaves filtradas por aparelhos ativos; `transport` devolve `peer.devices` e `selfDevices` (mantém `peer.deviceId` por compatibilidade). Verificação: build da API aprovado; 29 testes aprovados, 17 deles novos em `chat.service.spec.ts` (primeiro teste unitário do `ChatService`); auditoria de rotas e gateway aprovados; teste de integração com PostgreSQL, Redis e Synapse reais aprovado, **108 operações HTTP**, incluindo o ciclo de pedido, código, aprovação, ativação, listagem, revogação, perda de acesso e isolamento entre contas.
- **Clientes (web e mobile), concluídos e verificados em 18/11/2026, exceto o aparelho físico:**
  - `packages/chat-core`: confiança no primeiro contato (impressão das chaves por aparelho, fixada no primeiro contato); aparelho novo aceito com aviso; chave trocada num aparelho conhecido **bloqueia** o envio e a leitura até a pessoa decidir, e aceitar gira a sessão de sala; mensagens e chaves também para os outros aparelhos da própria conta; o aparelho remetente é identificado pelo conteúdo cifrado e a chave é conferida; a lista de aparelhos é relida em **todo envio** e invalidada quando o servidor avisa mudança; ativação com pedido de vínculo (`enrollDevice`); pedidos pendentes da conta expostos para aprovação.
  - Adaptadores web (WASM) e nativo: a política de confiança é aplicada **por aparelho** no envio entre aparelhos (verificação por código passa a ser opcional).
  - Telas web e mobile: código de vínculo para aprovar em outro aparelho; aprovar ou recusar pedidos; avisos de segurança; envio liberado sem comparar códigos; verificação por código opcional ("Verificar").
  - Verificação: chat-core 20 testes; adaptador nativo 5 testes; TypeScript e lint do mobile e TypeScript do web aprovados; integração real (PostgreSQL, Redis, Synapse) **3 execuções seguidas aprovadas, 182 a 183 operações HTTP**, incluindo envio sem verificar, verificação opcional e um segundo aparelho lendo e escrevendo na mesma conversa até a revogação; navegador real (Chromium) aprovado em todas as etapas.
  - **Defeito encontrado e corrigido durante o teste:** com a lista de aparelhos "fresca por 1 segundo", um aparelho aprovado instantes antes ficava fora da distribuição e a chave era descartada. Hoje a lista é relida em todo envio.
- **Teste no Android físico (RMX3840), 18/11/2026, com o JavaScript novo via Metro:** o motor nativo abriu sem erros; a conversa Ana (celular) e Bruno (navegador) funcionou **nos dois sentidos, sem comparar código**; a mensagem do celular apareceu como **Entregue** e a resposta do navegador foi decifrada no aparelho; o navegador confirmou o recebimento e o campo de mensagem liberado sem verificação. A mensagem antiga do aparelho revogado do Bruno **não foi decifrada** e ficou marcada como de aparelho não confiável (comportamento correto).
- **Defeito da ponte nativa encontrado pelo teste no aparelho e corrigido:** `getDeviceIdentityKeys` só aceita a identidade **da própria máquina** (`malformed_identifier: identifiers do not match the active machine`); `getDeviceStatuses` traz só ID e confiança. Sem as chaves de aparelhos de terceiros, o celular nunca fixava a confiança no contato e o campo ficava bloqueado. Correção: o adaptador nativo guarda as chaves públicas do mesmo JSON de consulta de chaves entregue ao motor e só as usa se o motor aceitou o aparelho. Nenhum teste simulado teria pegado isso: o aparelho físico foi indispensável. Coberto por teste do adaptador.
- **Defeitos de interface observados no aparelho, ainda a corrigir:** (1) enquanto as chaves do contato carregam, o campo diz "Confira o aviso de segurança para conversar" sem haver aviso algum (deveria dizer que a conversa está sendo preparada); (2) a mensagem de um aparelho que foi **desconectado** diz "segurança alterada, confira o aviso acima", mas não há aviso (deveria dizer que veio de um aparelho que não está mais conectado); (3) revogar um aparelho direto no banco não o remove do Synapse (a revogação pela API faz as duas coisas).
- **Defeitos de interface corrigidos e tela Aparelhos conectados (web e mobile), 18/11/2026:** textos e estados passaram a vir de um só lugar, no chat-core (`peerStatus`, `composerPlaceholder`, `messagePlaceholder`), usados pelas duas telas: enquanto as chaves carregam o campo diz "Preparando a conversa segura…", e uma mensagem de aparelho desconectado diz isso, em vez de "segurança alterada". A tela lista os aparelhos (nome, "Este aparelho", data), mostra pedidos de vínculo com o código para **aprovar ou recusar**, e **desconecta** (com confirmação; "Sair" no próprio aparelho). Não precisa da senha das conversas nem do motor criptográfico: usa só as credenciais do aparelho (`chatDevicesApi`). Verificação: chat-core 24 testes; **teste de navegador novo** (`chat-devices.browser.cjs`, Chromium real) aprovado: um segundo navegador pede para entrar com código, o primeiro vê o mesmo código na tela, aprova, ambos aparecem na lista, o outro é desconectado, sem rolagem horizontal em 1440/390/320 px; regressões (integração real com 174 operações e teste de navegador do chat) aprovadas. Mobile: TypeScript e lint aprovados.
- **Tela Aparelhos conectados validada no Android físico (RMX3840), 18/11/2026:** a lista mostrou "Android · Este aparelho · Sair"; um navegador (conta da Ana) pediu para entrar e **o pedido apareceu sozinho no celular, com o mesmo código da tela do navegador**; ao aprovar pelo celular, o navegador ativou em segundos e **os dois aparelhos apareceram na lista**; ao desconectar o navegador pelo celular (com a confirmação nativa), ele saiu da lista e o navegador deixou de se ver na própria lista. Esse é o vínculo de segundo aparelho **aprovado pelo celular**, ponta a ponta. Observação de processo: o app em modo de desenvolvimento só recarregou o JavaScript novo depois de um recarregamento manual (duplo "R"); o Metro não reempacotou sozinho as alterações feitas fora da sessão aberta no aparelho.
- **Defeito de vínculo encontrado ao escrever o teste e corrigido:** o aparelho que espera aprovação repetia o pedido a cada 2,5 s e o limite de ativações era 10 por minuto, então quem demorasse ~25 s para pegar o outro aparelho receberia `429` e o vínculo falharia. Agora: repetição a cada 4 s, limite de 30 por minuto (o serviço já limita a 3 pedidos pendentes e 5 aparelhos), e um `429` durante a espera é aguardado em vez de tratado como recusa.
- **Prévia e não lidas na lista de conversas (web e mobile), 18/11/2026.** Como as mensagens são cifradas de ponta a ponta, o servidor **só conhece metadados**: horário e autoria da última mensagem (`conversations.last_event_*`) e o contador de não lidas por pessoa (`conversation_members.unread_count`), atualizados no envio, na mesma transação, sem contar duas vezes uma retransmissão. O texto da prévia **só existe no aparelho**: o `ChatClient` guarda o texto da última mensagem aberta numa memória do aplicativo (`chatPreviews`, nunca em disco nem no servidor), que é apagada quando o aplicativo vai para segundo plano e ao sair da conta ou trocar de usuário (web). Regras: a prévia só aparece se a última mensagem da lista é a que este aparelho abriu; se a última não foi aberta, a lista mostra **"Mensagem protegida"** e nunca um texto antigo no lugar. Também mostra "Você:" para as próprias, o horário (hora, "Ontem" ou data) e o selo de não lidas (nome e horário em destaque, "99+"). Quando a pessoa vê mensagens recebidas, o cliente avisa `POST /conversations/:id/chat/seen` (com intervalo mínimo), que zera só o contador de quem abriu e atualiza as listas dos outros aparelhos dela; o envio e o "visto" avisam as listas abertas por `conversation:changed` (só id e revisão). Verificação: servidor 36 testes (`chat.service.spec.ts` com envio, deduplicação, falhas e "visto"); chat-core 28; integração real com **189 operações**, incluindo que a lista não contém o texto das mensagens e que abrir zera só o contador de quem abriu; 66 verificações HTTP de conversas inalteradas; teste de navegador novo (`chat-list.browser.cjs`): prévia e horário das abertas, "Você:", selo "1 mensagem não lida" com "Mensagem protegida" numa conversa fechada, contador zerando ao abrir, prévia sumindo ao recarregar (só em memória), sem rolagem horizontal em 1440/390/320 px; regressões do navegador e do adaptador nativo aprovadas. Mobile: TypeScript e lint limpos.
- **Lista validada no Android físico (RMX3840), 18/11/2026:** o Bruno (navegador) mandou uma mensagem; na lista do celular a conversa subiu ao topo com o **horário em destaque, "Mensagem protegida" em negrito e o selo vermelho "1"**, sem nenhum conteúdo; ao abrir, a mensagem chegou **decifrada**, o aparelho novo do Bruno gerou o aviso "começou a usar um aparelho novo" (esperado: o aparelho anterior dele tinha sido revogado), a mensagem do aparelho desconectado passou a dizer "veio de um aparelho que não está mais conectado e não pode ser aberta" (correção validada no aparelho) e o campo de mensagem ficou liberado sem comparar código; ao voltar à lista, o **selo sumiu, o horário voltou ao cinza e a prévia mostrou o texto aberto**. O navegador do Bruno confirmou "Entregue". Observação de processo: depois de reconectar o cabo, o aplicativo de desenvolvimento voltou ao seletor de servidor e foi preciso apontar para `http://127.0.0.1:8081` e tocar em Connect.
- **Decisão que fica para você (privacidade):** a prévia em texto só aparece enquanto o aplicativo está em primeiro plano na mesma sessão. Depois de reiniciar o aplicativo ou voltar do segundo plano, a lista mostra "Mensagem protegida" até a conversa ser aberta de novo. Mostrar a prévia sempre, como o WhatsApp, exige guardar o texto em disco cifrado no aparelho (armazenamento local cifrado, que a etapa de notificações e sincronização em segundo plano também pede). Isso muda a propriedade hoje documentada de que o texto aberto fica só na memória, então não foi feito sem sua decisão.
- **Defeitos encontrados no caminho, ainda a corrigir:** (1) no **web**, sair da conversa fecha a sessão cifrada, então voltar à lista e reabrir uma conversa pede a **senha das conversas outra vez**, todas as vezes; para a meta estilo WhatsApp a sessão cifrada deveria durar enquanto a pessoa estiver em `/conversas`; (2) a faixa da tela de detalhes ainda diz que "o envio de mensagens será liberado em breve", embora o envio individual já funcione.
- **Conversa sem jargão e ativação invisível (web e mobile), 18/11/2026. Implementado; verificação de integração, navegador e aparelho pendente de reabrir o Docker.** Pedido do produto: o cidadão não deve ver "ativar", "chaves" ou "dispositivo", e o app deve vir protegido por padrão, como o WhatsApp. O que mudou: (1) **ativação automática:** a conversa abre sozinha, sem botão nem tela de ativação; no celular as chaves ficam no cofre do aparelho (sem senha); no **navegador, sem senha por padrão**: um segredo gerado no próprio navegador protege as chaves guardadas (navegadores antigos que já tinham senha própria continuam pedindo; a opção "Proteger com senha" em Configurações fica para a etapa de Configurações); (2) **todos os textos num só lugar** (`chatView`, `deviceRequestText`, `ENROLL_WAITING`, `RESET_WARNING` no chat-core), em português simples: faixa "As mensagens são protegidas com criptografia de ponta a ponta."; avisos viram uma linha discreta ("Bruno trocou de aparelho ou entrou em outro." com "Ok"); só a troca real de chave de um contato conhecido bloqueia, com "Continuar"; a confirmação de identidade fica opcional atrás da faixa; "Permita no seu outro aparelho", "Permitir/Negar", "Mensagem protegida" etc.; **um teste automático examina todos os textos e falha se aparecer chave, dispositivo, ativar, Matrix etc.** (esse teste passou "no vazio" na primeira versão por causa de um erro de escape; foi corrigido e confirmado que ele falha com os textos antigos); (3) **recuperação sozinha:** aparelho desconectado (423) ou autorização perdida (401) apagam as credenciais locais e recomeçam; (4) **redefinição de quem perdeu todos os aparelhos** (`POST /conversations/chat/devices/reset`): confirma a senha da conta, desconecta todos e o próximo vira o primeiro; limite de 10 por hora; contas só com Google ou com verificação em duas etapas recebem uma explicação (limitação conhecida); (5) limpeza do código de diagnóstico do mobile e do texto desatualizado da faixa de detalhes. Verificação feita: chat-core 33 testes; API 47 testes (incluindo redefinição, senha errada, conta sem senha, MFA e 423); TypeScript do web e do mobile, lint do mobile e testes do adaptador nativo (6) limpos.
- **Validação real da ativação invisível, textos sem jargão e redefinição de conta (19/11/2026):** com Docker (`votz-postgres`, `votz-redis`, `votz-minio`, `votz-matrix`), APIs 3000/3001 e web 5173 ativos: integração real `apps/api/test/chat-text.integration.cjs` aprovada (**199 operações HTTP reais**, incluindo redefinição sem aparelhos, senha incorreta e 423); os três testes de navegador real (`chat-text.browser.cjs` 5/5, `chat-devices.browser.cjs` 6/6, `chat-list.browser.cjs` 5/5) aprovados. **Defeitos encontrados e corrigidos durante a verificação:** (1) em `apps/web/src/components/conversations/ChatPane.tsx`, `reset()` e `startOver()` chamavam `forgetWebChat()` enquanto `open()` ainda segurava o IndexedDB aberto e o `navigator.locks` (causando `onblocked` no `deleteDatabase`) e `begin()` mantinha `busy=true` durante a espera de aprovação (`enrollDevice`), o que travaria o botão `Redefinir` fora do StrictMode — corrigido com `stopActive()` antes de apagar o armazenamento e liberação de `busy` em `onPending`; (2) em `apps/web/test/chat-devices.browser.cjs`, o segundo navegador desconectado permanecia aberto fazendo polling de reativação e disputava a vaga de primeiro aparelho após `POST /reset` — corrigido fechando os contextos de `first` e `second` antes de simular a perda de acesso aos outros aparelhos. **Ainda não verificado em 19/11/2026:** Android físico (sem aparelho conectado no ADB) e iOS.
- **Sessão cifrada durável no web e view-model compartilhado (19/11/2026):**
  - **Sessão durável no web (`apps/web/src/lib/chat-session.ts`, `App.tsx`, `Conversations.tsx`, `ChatPane.tsx`):** rota unificada `/conversas/*` mantém `Conversations` montado ao navegar entre lista, conversa e aparelhos; o motor WASM, IndexedDB e `navigator.locks` permanecem abertos enquanto a pessoa está em `/conversas/*`, encerrando tudo ao sair de `/conversas`, trocar de conta/contexto ou sair do aparelho. Ao trocar de conversa, apenas o `ChatClient` da conversa anterior é parado (limpando o texto aberto da memória) e a nova conversa reutiliza a sessão ativa sem reativar nem pedir senha. Corrigida também corrida de StrictMode em `ChatPane.tsx` (trocando `cancelled` ref compartilhado por `AbortController` local por efeito). Coberto por asserção nova em `apps/web/test/chat-list.browser.cjs` (`0` chamadas extras a `POST /conversations/chat/devices` ao reabrir conversa dentro de `/conversas`).
  - **View-model compartilhado (`packages/chat-core/src/index.ts`, web `ChatPane.tsx` e mobile `chat-pane.tsx`):** `chatView()` agora centraliza verificação opcional (`canVerify`, `verification`), pedidos de aparelho (`deviceRequests`), mensagens formatadas com status/reenvio (`messages`), estado vazio (`emptyText`), recibos de leitura (`readReceipts`) e paginação (`canLoadOlder`/`olderLabel`). Web e mobile passaram a apenas desenhar a view (removendo ~100 linhas duplicadas e alinhando a guarda `state.ready` na verificação do mobile). O teste anti-jargão foi expandido para todos os novos campos e pegou a palavra `"ativar"` no texto de ajuda de recibos (trocada por `"ligar"`).
  - **Verificação:** `chat-core` 33/33; adaptador nativo 6/6; `tsc --noEmit` web e mobile limpos; os 3 testes E2E no Chromium (`chat-text` 5/5, `chat-devices` 6/6, `chat-list` 5/5) aprovados em sequência. **Ainda não verificado em aparelho físico:** Android e iOS.
- **Decisão aprovada (19/11/2026):** transferência de histórico entre aparelhos e backup cifrado opcional na nuvem ficam para a **Etapa 6 (Configurações)**; avançar direto para a **Etapa 1 — Texto em grupo**.
- **Ainda pendente da Etapa 0:** apenas validação em aparelho físico Android (última leva + cenários pendentes) e iOS.

## Roteiro e checklist

Cada item vale para **web e mobile**, salvo indicação.

### Etapa 0 — Fundação

- [x] Múltiplos dispositivos por conta: limite, vínculo com aprovação, lista, revogação e redefinição sem aparelhos (API + web validados em integração/navegador; mobile validado em vínculo/lista/desconexão no Android, falta validar redefinição e ativação invisível no celular)
- [x] Confiança no primeiro contato; alerta de mudança de chave; verificação opcional
- [x] Prévia da última mensagem e contador de não lidas na lista (validado no navegador e no Android físico; prévia só em memória, ver decisão acima)
- [x] Sessão cifrada do web durar enquanto a pessoa está em Conversas (validado em navegador real com 0 reativações ao trocar/reabrir conversa)
- [x] View-model compartilhado em `packages/chat-core` (lógica de tela escrita uma vez e consumida por web e mobile)
- [x] Testes unitários de `ChatService`
- [x] Limpeza dos resíduos de depuração
- [ ] Execução em aparelho Android físico (última leva + cenários pendentes) e simulador iOS

- **Etapa 1 — Texto em grupo concluída no código e validada no servidor e navegador (19/11/2026):**
  - **API (`chat-matrix.service.ts`, `conversations.service.ts`, `chat.service.ts`):** gateway liberado para `GROUP`; `join()` idempotente (ignora 403 quando já está na sala, com cache limpo no `kick()`) e `kick()` na sala Matrix ao aceitar/sair/remover; `unreadCount` incrementado para todos os outros membros ativos; `authorizePeer` libera membros que compartilham grupo ativo (mesmo havendo bloqueio individual); `keys` ampliado para até 100 alvos; `receipts` em grupo agrega `deliveredCount`, `readCount` e `totalRecipients` por mensagem; `acknowledge` bloqueia autoconfirmação.
  - **`packages/chat-core`:** `ChatRoom.kind` + `peers[]`; TOFU multi-peer com `userId` por aviso; **rotação automática da sessão Megolm (`crypto.rotate`) ao detectar saída/remoção de participante**; `senderName` em mensagens recebidas de grupo; recibos agregados (`"Entregue a 1 de 2"`, `"Lida por 1 de 2"`, `"Entregue"`, `"Lida"`); `chatView` adaptado (banner de grupo, verificação SAS 1-para-1 oculta em grupos).
  - **Web e Mobile (`Conversations.tsx`, `ChatPane.tsx`, `conversation/[id].tsx`, `chat-pane.tsx`):** grupos ativos abrem diretamente no `ChatPane` com `conversationTitle` no topo e nome do remetente acima do texto nas bolhas recebidas.
  - **Verificação:** API 45/45 testes unitários + build; `chat-core` 34/34 testes unitários (incluindo rotação de chave em remoção de membro); `tsc --noEmit` web e mobile limpos; novo teste E2E real `apps/web/test/chat-group.browser.cjs` (4 contas em Chromium real + PostgreSQL + Redis + Synapse): 6/6 passos aprovados (troca entre 3 membros com nomes, recibos `Entregue -> Lida por 1 de 2 -> Lida`, remoção de membro com corte de acesso e rotação de chave, novo membro lendo só mensagens após entrar, responsivo 1440/390/320 px); regressão real `chat-text.integration.cjs` (199 operações HTTP) aprovada; **validação real no Android físico (`RMX3840`, Ana Demo) ↔ Chromium (Bruno e Carol) aprovada**: abertura automática do grupo sem botão de ativação, banner E2EE de grupo, decifração nos dois sentidos com nome do remetente visível nas bolhas e progressão de recibos em grupo (`Lida por 1 de 2` → `Lida`). **Ainda não verificado:** iOS.

### Etapa 1 — Texto em grupo

- [x] Gateway aceita grupos; envio e histórico (API + web + Android físico validados; iOS pendente)
- [x] Rotação de chaves ao remover ou sair; política de histórico para quem entra (`history_visibility: 'joined'`, validado em E2E real)
- [x] Recibos em grupo (agregação `Entregue` / `Lida por X de Y` / `Lida`, validado em navegador e no Android físico)

### Etapa 2 — Mídia e notificações

- [ ] Imagem, vídeo, áudio (nota de voz) e arquivo, cifrados no cliente antes do envio (formato padronizado do Matrix, sem esquema próprio)
- [ ] Progresso, cancelamento, retomada e limites de tamanho
- [ ] Download automático configurável
- [ ] Push discreto com aplicativo fechado

### Etapa 3 — Experiência do mensageiro

- [ ] Responder, reagir, encaminhar com identificação
- [ ] Digitando, silenciar, buscar, denunciar
- [ ] Cartões de publicações e relatos

### Etapa 4 — Chamadas individuais

- [ ] LiveKit com salas privadas e autorização própria (sem reaproveitar permissões dos debates)
- [ ] Estados persistidos: tocando, aceita, recusada, ocupado, expirada, perdida
- [ ] CallKit (iOS) e ConnectionService (Android); tela bloqueada e segundo plano
- [ ] Testes em aparelhos: chamada telefônica, Bluetooth, troca de rede

### Etapa 5 — Chamadas em grupo pequeno

- [ ] Limites e qualidade adaptativa

### Etapa 6 — Configurações de conversas

Tela própria, no web e no mobile, com:

- [ ] Confirmação de leitura ("azulzinho"), já existente, movida para esta área
- [ ] Visto por último e online: todos, meus contatos ou ninguém (reciprocidade, como no WhatsApp)
- [ ] Quem pode me adicionar a grupos e me enviar solicitações
- [ ] Notificações: prévia do texto, som, vibração
- [ ] Silenciar conversas e grupos
- [ ] Pessoas bloqueadas (já existente)
- [ ] Dispositivos conectados: listar e desconectar
- [ ] Segurança: código de verificação, alertas de mudança de chave, senha e backup de chaves
- [ ] Download automático de mídia
- [ ] Papel de parede, tamanho da fonte, tema

### Etapa 7 — Refino visual (final)

- [ ] Layout de conversa muito próximo do WhatsApp: balões com cauda, agrupamento por dia, divisores, status por ícone (relógio, um check, dois checks, dois checks azuis), barra de entrada com anexo, câmera e microfone, cabeçalho com avatar e status
- [ ] Lista de conversas: avatar, prévia, horário, não lidas, fixar, silenciar
- [ ] Responsivo no web (lista e conversa lado a lado em telas grandes) e acessível
- [ ] Mantém tokens e fontes do tema do Votz; nunca cores fixas no código

## Critérios de pronto por etapa

Testes negativos de autorização e reexecução, interoperabilidade web e mobile, teste em aparelho físico quando houver recurso nativo, documento atualizado com evidências, flags desativadas por padrão. Antes da liberação pública: os requisitos listados em [texto cifrado](chat-text-2026-11-18.md#requisitos-antes-da-liberação-pública).
