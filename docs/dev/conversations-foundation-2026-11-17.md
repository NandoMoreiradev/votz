# Conversas: primeira entrega técnica

Referência de produto: [Comunicação e Pulso](../negocio/comunicacao-e-pulso.md).

Continuação em 18/11/2026: [interfaces e contratos atualizados](conversations-ui-2026-11-18.md). Este documento registra a primeira versão; a listagem de bloqueios foi posteriormente paginada e as telas já foram implementadas para o piloto.

## Escopo entregue

API de metadados de conversas individuais e grupos privados. Inclui solicitações, consentimento explícito, administração, transferência, saída, remoção, encerramento e bloqueios. Não inclui conteúdo de mensagens, anexos, chamadas, Pulso nem telas do mensageiro. Nenhuma criptografia de ponta a ponta foi implementada nesta entrega.

Migração aditiva: `20261117235900_conversation_metadata`. Quatro tabelas: `conversations`, `conversation_members`, `conversation_blocks`, `conversation_outbox`. Nenhuma tabela de conteúdo privado foi criada. Títulos de grupos e relações entre participantes são metadados acessíveis ao servidor, protegidos por autorização; não são E2EE.

O recurso exige `CONVERSATIONS_ENABLED=true`, desativado por padrão. `GET /api/v1/conversations/capabilities` informa a disponibilidade para um usuário autenticado; `messagingEnabled` e `callsEnabled` continuam falsos. As demais rotas retornam 404 com a flag desativada.

## Contrato inicial

Todas as rotas abaixo têm prefixo `/api/v1/conversations` e exigem JWT de acesso válido. Operações de conversas exigem conta com e-mail confirmado, não banida e identidade pessoal. O contexto institucional é recusado até existir um fluxo explícito de atendimento.

| Método e rota | Corpo ou consulta | Resultado |
| --- | --- | --- |
| GET `/capabilities` | — | Disponibilidade real por recurso |
| GET `/` | `folder=active\|requests`, `page`, `limit` (máximo 50) | Lista paginada apenas do solicitante |
| GET `/:id` | — | Metadados para membro ativo |
| POST `/direct` | `targetUserId` | Cria ou recupera a conversa única do par |
| POST `/groups` | `clientRequestId` UUID, `title`, `memberIds` | Grupo com dono ativo e convidados pendentes |
| POST `/:id/respond` | `accept`: booleano JSON | Aceita ou recusa o próprio convite |
| POST `/:id/invitations` | `memberIds` (até 20 por operação) | Novos convites por administrador |
| PATCH `/:id/members/:userId/role` | `role=ADMIN\|MEMBER` | Alteração pelo dono |
| DELETE `/:id/members/:userId` | — | Remoção autorizada |
| POST `/:id/owner/:userId` | — | Transfere para outro membro ativo |
| POST `/:id/leave` | — | Saída de membro do grupo |
| POST `/:id/archive` | — | Dono encerra o grupo e invalida convites |
| GET `/blocks` | — | Até 100 bloqueios feitos pelo solicitante |
| POST `/blocks/:userId` | — | Bloqueia novas interações diretas e convites |
| DELETE `/blocks/:userId` | — | Remove o próprio bloqueio |

Grupos têm até 100 pessoas entre membros ativos e convites pendentes. Títulos têm até 100 caracteres e não aceitam controles. A criação exige `clientRequestId`; repetir os mesmos dados recupera o resultado, inclusive em chamadas concorrentes. Reutilizar a chave com outros dados retorna 409.

### Consentimento e privacidade

- Criar uma conversa individual ativa somente o iniciador; a outra pessoa recebe uma solicitação. Repetir a criação não reenvia nem substitui uma recusa. Quem recusou pode reabrir a conversa individual por iniciativa própria.
- Participantes convidados a grupos não podem abrir o detalhe nem ver a lista de participantes. A caixa de solicitações mostra título, quem convidou e quantidade de membros ativos.
- Um convite só pode ser aceito pelo destinatário. Aceites exigem booleano real, inclusive com a conversão implícita global da API habilitada.
- Convites recusados não podem ser reenviados por administradores neste piloto. Saídas/remoções podem receber novo convite, sempre pendente de aceite.
- Não participantes recebem 404 para detalhe e gestão. DTOs de perfis não expõem e-mail, telefone, CPF ou outros campos internos.
- Bloqueios em qualquer direção impedem novos contatos diretos, novos convites entre esse par e aceite do convite desse remetente. Não expulsam pessoas de grupos compartilhados. Solicitações anteriores permanecem recusáveis.
- Somente o dono altera administradores, transfere a propriedade ou encerra o grupo. Administradores removem membros comuns; não removem o dono nem outros administradores. O dono precisa transferir antes de sair de um grupo aberto.
- A exclusão de um usuário preserva a integridade das relações por `CASCADE`/`SET NULL`. Caso o dono seja excluído, o primeiro administrador ativo, ou o primeiro membro ativo, assume a autorização de dono, por ordenação determinística. Convites sem remetente ativo não são aceitos.
- Encerramento é definitivo nesta API inicial; não equivale à exclusão do histórico. Grupos encerrados ficam disponíveis para consulta dos membros ativos.

## Concorrência e atualização em tempo real

Mudanças de grupo executam autorização e atualização na mesma transação serializável, com bloqueio da linha da conversa. Conflitos de serialização/unicidade têm até três tentativas. O par da conversa direta e as chaves de criação têm índices únicos no banco.

Cada alteração incrementa `revision` e registra seus destinatários na outbox dentro da mesma transação. O worker reclama lotes de até 25 registros com `FOR UPDATE SKIP LOCKED` e reserva de 30 segundos. Falhas de transporte mantêm o registro pendente. Confirmação usa o número da tentativa para não reconhecer uma reserva concorrente.

Evento autenticado na sala pessoal existente de `/ws`:

```json
{ "conversationId": "uuid", "revision": 3 }
```

Nome: `conversation:changed`. Não transporta títulos, participantes ou conteúdo. Não há entrada para o cliente escolher salas de conversas. O cliente futuro deverá descartar revisões antigas e buscar a lista/detalhe na API ao reconectar. Um `emit` aceito não confirma entrega a aparelhos offline: estes eventos são invalidações, não recibos de entrega de mensagens.

Registros enviados da outbox são eliminados após sete dias, em lotes de até 1.000 por execução horária. Pendências não são descartadas por retenção. Antes da liberação pública, acompanhar quantidade e idade das pendências, falhas e volume de convites, com alertas operacionais; não registrar conteúdo privado.

## Verificação reproduzível

Build e testes de regressão, na raiz:

```powershell
npm.cmd run build --workspace=apps/api
npm.cmd test --workspace=apps/api -- --runInBand conversations.spec.ts notifications.gateway.spec.ts route-auth-audit.spec.ts posts.service.spec.ts feed-ranking.service.spec.ts
```

Para o teste integrado, mantenha a API normal em 3000 com o piloto desativado. Abra uma instância temporária em outro terminal, na pasta `apps/api`:

```powershell
npx.cmd dotenv -e ../../.env -v CONVERSATIONS_ENABLED=true -v API_PORT=3001 -- node dist/main
```

Na raiz, com PostgreSQL e Redis locais:

```powershell
npx.cmd dotenv -e .env -- node apps/api/test/conversations.integration.mjs
```

O script recusa banco remoto, cria usuários temporários sem alterar contas demo, passa pela autenticação JWT real e remove apenas seus próprios registros ao terminar. Usa HTTP real, banco real e socket autenticado. Encerre a instância temporária ao final: ela carrega também os agendamentos normais da aplicação.

## Próxima entrega e critérios de liberação

Verificação em 17/11/2026: build da API aprovado; 28 testes aprovados em cinco suítes (Conversas, gateway de notificações, auditoria de autorização de rotas, publicações e ranking); 59 verificações HTTP integradas aprovadas com PostgreSQL e socket autenticado. Schema Prisma válido e 18 migrações aplicadas, sem pendências no banco local. A API principal permaneceu com o piloto desativado; a instância de QA foi encerrada após os testes. Esses resultados não substituem testes de carga, múltiplas instâncias ou dispositivos físicos do futuro mensageiro.

1. Selecionar e registrar a decisão do protocolo/SDK E2EE, licença e suporte efetivo a Expo/web, dispositivos, recuperação e revogação. Não adicionar envio provisório em texto aberto.
2. Definir armazenamento cifrado, anexos privados, sincronização durável e recibos independentes dos eventos de invalidação.
3. Integrar telas web/mobile ao contrato com estados de solicitação, erro, offline e identidade explícitos.
4. Completar exportação dos novos dados, minimização na exclusão, retenção do grafo de conversas, denúncias, limites por destinatário e observabilidade antes de habilitar publicamente. A exclusão atual é compatível com as novas FKs; isso não conclui toda a política de dados do mensageiro.
5. Chamadas precisam ainda de sinalização, push e integração nativa em segundo plano; Pulso segue como entrega própria do plano de produto.

Não habilitar esta etapa isolada como um mensageiro pronto para produção.
