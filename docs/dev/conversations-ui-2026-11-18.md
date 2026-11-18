# Conversas: interfaces web e mobile

Continuação da [fundação de metadados](conversations-foundation-2026-11-17.md) e do [plano de produto](../negocio/comunicacao-e-pulso.md).

## Entrega

- Web: entrada por ícone de conversa na barra de navegação, caixa de conversas, solicitações, criação, detalhes, administração e pessoas bloqueadas. Rotas `/conversas`, `/conversas/nova`, `/conversas/:id` e `/conversas/bloqueios`.
- Mobile: aba Conversas, solicitações, formulário de conversa/grupo, detalhes e bloqueios. A aba aparece somente quando a API informa que o piloto está habilitado. As rotas continuam protegidas ao abrir um deep link.
- Busca por nome ou @usuário, com atraso de 300 ms e cancelamento da busca anterior. Até 20 perfis públicos por resposta; não pesquisa e-mail ou telefone. Contas não verificadas, banidas, o próprio usuário e bloqueios em qualquer direção são excluídos.
- Grupos: seleção de pessoas, convite e aceite, promoção/rebaixamento, transferência de propriedade, saída, remoção e encerramento. O backend continua verificando autorização em cada operação; controles visuais não substituem essa verificação.
- Bloqueios: lista privada paginada, com perfil público do bloqueado e ação de desbloquear. Não há mais o limite silencioso de 100 registros da primeira versão da listagem.
- Estados de carregamento, erro, ausência de dados, solicitação pendente, encerramento e identidade pessoal. O formulário preserva dados e chave de idempotência ao falhar; repetir a mesma criação não cria outro grupo.

Nenhum botão de envio, conversa fictícia ou chamada simulada foi acrescentado. A interface informa que o envio ainda está indisponível. A [avaliação de E2EE](chat-e2ee-evaluation-2026-11-18.md) registra os testes do SDK e os critérios que faltam.

## Segurança e sincronização

Queries são separadas por usuário e, no web, pelo contexto ativo. O contexto institucional não acessa conversas pessoais. O mobile limpa o cache ao encerrar sessão; o web cancela e remove queries de conversas na troca/saída de usuário.

Respostas de metadados usam `Cache-Control: private, no-store` e `Vary: Authorization`. Participantes convidados a grupos continuam sem acesso ao detalhe ou à lista de membros. O aceite exige booleano real.

Os clientes invalidam o cache com `conversation:changed` e ao reconectar. A API continua sendo a fonte de verdade; listas/detalhes também atualizam a cada 15 segundos enquanto ativos. No mobile, o socket acompanha o estado do aplicativo e renova o token ao conectar quando necessário. Eventos ainda transportam somente ID da conversa e revisão, sem conteúdo privado.

As telas web de conversas são carregadas sob demanda. O laboratório criptográfico não faz parte dos aplicativos. A única dependência nova do mobile nesta entrega é o cliente JavaScript Socket.IO; o gerador UUID já existe no núcleo do Expo instalado. Não foi necessária uma nova APK para testar estas telas.

## Desenvolvimento com contratos compartilhados

O mobile está fora dos workspaces npm da raiz para manter React 19 separado do React 18 do web. O pacote `@votz/shared-types` é vinculado localmente. O Metro passou a observar explicitamente essa pasta: sem isso, o aplicativo aberto podia conservar exports antigos após rebuild.

No Vite, `@votz/shared-types` aponta para fonte ESM local e foi retirado do pré-bundle de dependências. Isso evita congelar exports durante a sessão de desenvolvimento. A falha foi observada, corrigida e as telas foram testadas novamente após a correção.

## Validação de 18/11/2026

- Build da API e build web aprovados.
- Mobile: TypeScript e lint aprovados; exportação de bundles Android e iOS aprovada. A exportação iOS não substitui teste em iPhone.
- API: 18 testes aprovados nas suítes de conversas, gateway e auditoria de autorização; 66 verificações HTTP aprovadas com PostgreSQL, Redis e socket reais. Incluem a nova busca, privacidade dos bloqueios, paginação e cabeçalhos de cache.
- Dois navegadores autenticados: criar grupo, receber solicitação, aceitar, atualizar participantes, promover administrador, transferir propriedade, sair e encerrar. Testes também verificam acesso anônimo e ausência de overflow em 1440, 390 e 320 px.
- Android físico RMX3840: abertura pelo USB, nova aba, busca, seleção e criação de grupo. Campo de busca permaneceu visível com teclado aberto. Um convite criado no aparelho foi aceito na conta de outro cidadão pelo web; a tela do Android exibiu os dois participantes ativos.
- Criptografia: dois testes isolados com o SDK Matrix oficial aprovados, conforme documento próprio. Ainda não representam E2EE integrado aos clientes.

Evidências locais versionadas: [web desktop](evidence/conversations-2026-11-18/web-desktop.png), [web 320 px](evidence/conversations-2026-11-18/web-320.png), [teclado Android](evidence/conversations-2026-11-18/android-keyboard.png), [grupo no Android](evidence/conversations-2026-11-18/android-group.png).

## Reproduzir

Habilitar `CONVERSATIONS_ENABLED=true` somente no ambiente de piloto. A configuração pública de exemplo continua falsa. Nesta máquina, a flag foi habilitada em `apps/api/.env.local` (ignorado pelo Git), e a API principal usa 3000. A instância temporária de QA em 3001 foi encerrada. Web em 5173 e Metro em 8081 permanecem disponíveis. USB aponta 3000 e 8081 para as portas correspondentes do computador.

Teste HTTP: subir uma API temporária na porta 3001 com a flag habilitada e executar o script da primeira entrega. `CONVERSATIONS_DISABLED_API_URL` é opcional para verificar também uma instância com a flag desativada; não precisa desligar o piloto em uso no celular. A desativação é coberta pela suíte de testes e foi validada por HTTP antes da habilitação local.

Testes de navegador usam Playwright instalado separadamente e contas demo documentadas; não criam dependência de produção:

```powershell
$env:VOTZ_PLAYWRIGHT_MODULE="$env:TEMP/votz-web-qa/node_modules/playwright"
npx.cmd dotenv -e .env -- node apps/web/test/conversations.browser.cjs
```

O teste remove somente o grupo específico que criou. O teste companheiro `conversations-mobile.browser.cjs` aceita um convite criado manualmente no Android e preserva o grupo de revisão; é opcional e exige esse convite pendente. O grupo **QA Mobile 20261118**, com Ana e Bruno demo, foi mantido para revisão no aparelho. Não há mensagens nesse grupo.

Próxima etapa: validar o motor criptográfico nativo com o WASM, armazenamento de chaves e transporte autenticado; depois conectar envio e histórico às telas. Voz, vídeo, mídia e Pulso continuam no plano, sem serem apresentados como concluídos.
