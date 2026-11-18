# Comunicação e Pulso — plano de produto do Votz

Status: aprovado para desenvolvimento incremental em 17/11/2026. Este documento é a referência de escopo; atualizar o andamento com evidências, sem tratar código ainda não validado como funcionalidade lançada.

## Visão aprovada

Conversas deve ser familiar de usar: mensagens privadas e grupos, voz e vídeo, sincronização entre mobile e web. Pulso terá identidade própria: acontecimentos temporários que podem ganhar contribuições de outras pessoas, conectados à comunidade, aos lugares e aos registros públicos do Votz.

### Conversas

- Mensagens individuais e grupos privados por convite, sem entrada automática por bairro ou por perfil seguido.
- Texto, fotos, áudios gravados e cartões de publicações/relatos; responder, reagir e encaminhar com identificação.
- Estados distintos: pendente no aparelho, aceita pelo servidor, entregue e lida. Leitura e presença precisam de controles de privacidade.
- Histórico sincronizado, recuperação após reconexão e prevenção de duplicatas.
- Solicitações de conversa para desconhecidos; aceite explícito antes de liberar chamadas.
- Grupos com administração, convites, aceite, saída, remoção, transferência de responsabilidade e silenciamento.
- Bloquear e denunciar; limites contra spam. Acesso privado verificado no servidor em toda operação.
- Conversas pessoais separadas do atendimento institucional. Equipes devem ter identificação, permissões e regras explícitas de retenção. Não apresentar uma mensagem pessoal como mensagem de entidade por inferência do contexto ativo.

### Voz e vídeo

- Chamadas individuais primeiro; grupos pequenos depois.
- Aceitar, recusar, cancelar, ocupado, expiração e chamadas perdidas como estados persistidos e idempotentes.
- Silenciar, câmera, seleção de áudio e retorno à conversa.
- Funcionamento com tela bloqueada e segundo plano é critério de entrega, não melhoria opcional para depois do lançamento.
- Reaproveitar LiveKit já integrado aos debates, com autorização e salas específicas para chamadas privadas. Não reutilizar automaticamente as permissões de transmissão pública.
- Avaliar CallKit/PushKit no iOS e a integração de chamadas do Android; testar em aparelhos físicos, interrupção por chamada telefônica, Bluetooth e troca de rede.
- Sem gravação automática de chamadas privadas.

### Pulso (nome provisório)

Um acontecimento pode reunir vários olhares, mantendo autoria e ordem temporal. Exemplo: vídeo de uma praça recebendo melhorias, foto da iluminação à noite e atualização de uma associação sobre uma atividade no local.

- Cartões com prévia; descoberta entre Seguindo e Na sua região.
- Foto, vídeo curto ou texto como início; também cultura, esporte, bastidores e encontros, não apenas problemas urbanos.
- “Adicionar meu olhar”, com contribuições aprovadas pelo criador no primeiro piloto.
- Escolha explícita entre resposta privada e contribuição pública.
- Localização opcional por bairro/lugar; não publicar automaticamente a posição do aparelho.
- Destaque temporário. Guardar, transformar em publicação ou vincular a relato deve ser uma decisão explícita.
- Expirar o destaque não apaga um relato público ou evidência vinculada. Retenção, remoção e autoria são regras diferentes.
- Popularidade e múltiplas contribuições não comprovam veracidade.

## Arquitetura e decisões

| Responsabilidade | Direção |
| --- | --- |
| Conversas, permissões, estados e histórico durável | NestJS + PostgreSQL |
| Eventos instantâneos | Socket.IO; Redis já existente para múltiplas instâncias |
| Recuperação e envio pendente no aparelho | Armazenamento local, IDs estáveis e sincronização |
| Fotos/áudios/anexos | Storage existente, com acesso privado e limites específicos |
| Voz/vídeo | LiveKit, carregado sob demanda |
| App fora de primeiro plano | Push; sinalização nativa de chamadas quando aplicável |

Socket.IO não é o histórico: o banco é a fonte de verdade. Eventos podem ser perdidos ou repetidos; clientes precisam recuperar estado e ignorar versões antigas. Usar outbox transacional para não perder uma alteração confirmada por falha entre commit e publicação do evento.

### Criptografia é uma decisão anterior ao envio de mensagens

Conversas privadas devem ser projetadas para criptografia de ponta a ponta. Selecionar um protocolo/SDK mantido e revisado, verificando licença, compatibilidade React Native/Expo, web, múltiplos aparelhos, verificação de identidade, revogação, recuperação e anexos. Não inventar um protocolo com primitivas isoladas nem chamar Base64 de criptografia.

E2EE de mídia do LiveKit não entrega automaticamente E2EE do histórico do mensageiro. Busca, backups, moderação por denúncia e atendimento institucional precisam de decisões próprias. Servidor não deve receber texto privado em claro como solução temporária para acelerar a primeira interface.

## Entregas e critérios

| Etapa | Resultado esperado | Estado |
| --- | --- | --- |
| 0 — Visão, arquitetura e limites | Este documento e plano técnico | Documentado |
| 1 — Gestão privada de conversas | Solicitações, convites, aceite, membros, administração, bloqueios, outbox e testes com API/banco reais | API e telas web/mobile validadas; piloto local habilitado; padrão público desativado |
| 2 — Mensagens E2EE | Protocolo escolhido, identidade/aparelhos, texto e sincronização confiável no web/mobile | Texto individual integrado a Synapse privado; SDK WASM e API real validados; validação da ponte nativa pendente; piloto de um dispositivo por conta; liberação pública desativada |
| 3 — Mídia e experiência do mensageiro | Áudio, imagens, cartões, respostas, reações, controles de privacidade, push | Planejado |
| 4 — Chamadas individuais | Voz/vídeo completos, inclusive bloqueio de tela e segundo plano | Planejado |
| 5 — Chamadas em grupo | Grupos pequenos, limites e qualidade adaptativa | Planejado |
| 6 — Piloto do Pulso | Publicar, descobrir, responder em privado e aprovar contribuições | Planejado |

Cada etapa precisa de testes negativos de autorização e reexecução, além do caminho feliz. Antes da liberação pública: revisar exclusão/exportação de dados, retenção, bloqueios, recuperação de sessão, migrações, observabilidade sem conteúdo privado, rede instável e uso em múltiplos aparelhos. Ter uma tela ou um bundle válido não equivale a um lançamento aprovado.

## Primeira etapa técnica

Implementar inicialmente apenas metadados privados; sem endpoint de envio de mensagem ou armazenamento de conteúdo em claro. Habilitação por ambiente, desabilitada por padrão. Nenhuma chamada ou Pulso será apresentado como pronto nesta etapa.

Referências: [Socket.IO: garantias de entrega](https://socket.io/docs/v4/delivery-guarantees/), [LiveKit para Expo](https://docs.livekit.io/transport/sdk-platforms/expo/), [integração nativa de chamadas](https://github.com/livekit-examples/react-native-callkit), [criptografia do LiveKit](https://docs.livekit.io/transport/encryption/).

Implementação e acompanhamento: [primeira entrega de Conversas](../dev/conversations-foundation-2026-11-17.md). Atualizar este registro em cada entrega, preservando a distinção entre código validado internamente e recursos liberados aos usuários.

Atualização de 18/11/2026: [interfaces web/mobile e validação no Android](../dev/conversations-ui-2026-11-18.md); [avaliação de E2EE e critérios pendentes](../dev/chat-e2ee-evaluation-2026-11-18.md).

Continuação de 18/11/2026: [implementação de texto cifrado, recibos e requisitos de liberação](../dev/chat-text-2026-11-18.md). O teste Android da etapa anterior validou gestão de conversas; não comprova a nova ponte criptográfica nativa.
