# Avaliação de criptografia do mensageiro

Data: 18/11/2026. Este documento conserva a avaliação inicial e seus resultados de laboratório. A implementação posterior de texto individual está registrada em [mensagens privadas cifradas](chat-text-2026-11-18.md); as descrições abaixo sobre ausência de endpoints e dependências referem-se ao momento da avaliação, não ao estado atual do código. A liberação pública continua pendente.

## Direção técnica

Avaliar o motor `matrix-sdk-crypto`, com seus bindings oficiais WASM para o navegador e uma integração nativa para React Native. O protocolo e as operações criptográficas devem permanecer nos SDKs; a aplicação não deve criar seu próprio protocolo de chaves, assinaturas ou criptografia de grupos.

O laboratório [packages/chat-crypto-lab](../../packages/chat-crypto-lab) fixa `@matrix-org/matrix-sdk-crypto-wasm` em **19.0.1**, licença Apache-2.0. É uma dependência de desenvolvimento isolada, sem importação pelo web ou mobile. Não adiciona WASM nem código criptográfico aos bundles do Votz nesta etapa.

A documentação oficial descreve `OlmMachine` como uma máquina de estados sem rede; publicar chaves, consultar dispositivos, enviar envelopes e sincronizar são responsabilidades de uma integração completa. Referência: [repositório oficial dos bindings WASM](https://github.com/matrix-org/matrix-rust-sdk-crypto-wasm).

Para o mobile, a ponte [react-native-matrix-crypto, mantida pela Linagora](https://github.com/linagora/react-native-matrix-crypto) é candidata, não uma dependência aprovada para produção. Seu README informa licença Apache-2.0 e requisitos de nova arquitetura, mas afirma explicitamente que a integração Expo não é exercitada no CI do projeto. Isso exige um teste próprio com nosso Expo 58, React Native 0.88, Android e iOS antes da adoção. Não confundir a maturidade do motor Rust com a validação da ponte em nosso aplicativo.

## Provas implementadas e executadas

Comando na raiz:

```powershell
npm.cmd test --workspace=packages/chat-crypto-lab
```

Dois testes usam o SDK oficial real. O relay de teste mantém apenas chaves públicas, chaves públicas de uso único e eventos cifrados. Ele simula respostas de transporte em memória; não é um homeserver, servidor de produção ou protocolo novo.

1. Duas máquinas publicam suas chaves, consultam dispositivos e estabelecem sessões pelo SDK. A chave de sala percorre um evento cifrado entre dispositivos. O destinatário decifra a mensagem; um terceiro dispositivo não consegue. O texto não aparece no transcript do relay. Alterar o ciphertext ou transportar o evento para outra sala é recusado.
2. Uma sala começa com três participantes. Depois de remover um destinatário, invalidar a sessão anterior e distribuir a nova chave somente aos participantes restantes, o removido não decifra mensagens futuras. Seu acesso a mensagens anteriores permanece: remover alguém não apaga aquilo que a pessoa já conhecia.

Resultado: **2 testes aprovados**. Executados em Node com os bindings WASM, não em navegadores nem aparelhos. Os testes permitem dispositivos ainda não verificados para isolar o fluxo de transporte. Essa configuração não define a política de confiança do produto.

## Decisões necessárias antes de habilitar mensagens

- Validar interoperabilidade entre o motor nativo e o WASM: duas contas, grupo, dispositivos distintos e remoção, com uma development build real. Verificar licença e procedência dos artefatos distribuídos da ponte.
- Preferir uma integração com o transporte Matrix padronizado e servidor controlado pelo projeto. Não adaptar o mock de teste para produção nem reimplementar partes do protocolo por conveniência.
- Definir o vínculo entre identidade Votz e identidade de mensagens, credenciais limitadas e revogação. Nenhuma credencial administrativa do servidor pode ser entregue ao cliente. O servidor não deve guardar chaves privadas dos aparelhos.
- Manter a participação Votz como regra de autorização. Convites pendentes não recebem chaves; remoção, bloqueio e encerramento devem impedir novos envios antes da confirmação da operação. A sincronização entre metadados e o transporte não pode permitir envio com participação desatualizada.
- Guardar o estado criptográfico persistente com proteção local e separação por usuário/aparelho. No mobile, a chave da base deve permanecer no armazenamento seguro do dispositivo. A estratégia de armazenamento web precisa considerar ameaças do próprio navegador e do código carregado.
- Implementar verificação entre dispositivos, avisos de mudanças de identidade, recuperação/backup e revogação. Não marcar novos dispositivos como confiáveis automaticamente para facilitar o caminho feliz.
- Tratar a rotação de chaves e o histórico compartilhado com participantes novos explicitamente. Para conversas individuais e grupos, registrar as propriedades e limitações do protocolo escolhido no modelo de ameaças.
- Só então habilitar envio cifrado, reconexão durável, recibos e anexos privados. Chamadas e E2EE do histórico são decisões distintas.

Não existe endpoint de mensagens nem armazenamento temporário de texto privado em claro no Votz. `messagingEnabled` e `callsEnabled` continuam falsos. Este documento registra uma direção e evidências; não declara o mensageiro protegido por E2EE como entregue.
