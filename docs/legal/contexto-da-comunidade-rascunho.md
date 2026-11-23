# Contexto da Comunidade: textos e documentos legais (RASCUNHO para revisão do advogado)

> **Estado:** rascunho de 23/11/2026, escrito a partir do [plano](../dev/contexto-da-comunidade-analise-2026-11-23.md) (seções 4, 7 e 10) e do que está **construído** (seção 11 do plano). **Não publicar** antes da revisão jurídica. Nada aqui foi para os arquivos de `apps/web/src/legal/` de propósito: mexer neles obriga todo mundo a aceitar de novo (`TERMS_VERSION` e `PRIVACY_VERSION`), então o texto final entra de uma vez, junto com a troca das versões.
> **Nomes:** "Contexto da Comunidade" e "Confere" dependem da consulta no INPI (não feita). Os nomes de tela estão todos em `packages/shared-types/src/context-notes.ts`.
> **Isto não é parecer jurídico.** É o texto proposto e a lista do que o advogado precisa confirmar.

## 0. O que o texto precisa bater com o código

| O que o texto diz | Onde está no código |
|---|---|
| Nota só aparece depois de 7 avaliações e 70% de "útil"; sai só depois de duas rodadas ruins seguidas | `apps/api/src/context-notes/context-notes.rules.ts` (`RULES`) |
| Quem colabora: 18+, e-mail confirmado, conta com 30+ dias, sem banimento; contas de órgãos, políticos, empresas e da equipe não colaboram | `context-notes.service.ts` (`CONTRIBUTOR_TYPES`, `ineligibleReason`) |
| Para escrever: avaliar 5 notas antes (e coincidir com o resultado em 60%, quando houver avaliações resolvidas), ou convite da moderação | `canWriteNotes` |
| Limites: 1 nota por pessoa e conteúdo, 5 notas por dia | `RULES` |
| Em relato: só prova adicional, novidade ou "repetido" | `CONTEXT_NOTE_KINDS_BY_TARGET` |
| Nome de quem escreve não aparece; o Votz guarda | `ContextNote.authorId` (nunca devolvido pela API pública) |
| Excluir a conta mantém a nota sem autor e apaga as avaliações | `onDelete` no `schema.prisma` |

## 1. Diretrizes da Comunidade: seção nova "Contexto da Comunidade"

> Entra em `apps/web/src/legal/diretrizes-da-comunidade.ts`, depois de "Sinalizar conteúdo". Tom do Votz: direto, justo, firme.

**O que é.** Às vezes uma publicação ou um relato precisa de um complemento: uma informação que falta, uma correção com fonte, uma prova a mais. No Votz, pessoas habilitadas escrevem esse complemento, sempre com link de fonte, e outras pessoas avaliam se ele ajuda. A nota só aparece para todo mundo depois que várias pessoas avaliam como útil.

**O que a nota não é.** Ela não tira nada do ar. Se o conteúdo quebra as regras, use "Denunciar": a moderação analisa, remove quando for o caso, explica o motivo ao autor e dá como contestar.

**Como escrever uma nota.**
- Fale do conteúdo, não da pessoa. Nada de adjetivo nem de ironia.
- Só fato e fonte. Cole pelo menos um link que qualquer pessoa consiga abrir.
- Não acuse ninguém de crime. Se você acha que há crime, use "Denunciar".
- Não exponha dados pessoais de ninguém.
- Sem fonte, não escreva a nota: avalie as que já existem.

**Em relato.** O relato é o testemunho de uma pessoa sobre um problema da vida dela. Por isso a nota em relato só pode trazer prova a mais, novidade sobre o caso (por exemplo, "já foi resolvido") ou aviso de que é o mesmo problema de outro relato. Nunca "isso é falso". Quem acha que um relato é falso usa "Denunciar".

**Quem não escreve nem avalia.** Quem escreveu o conteúdo, e quem faz parte da entidade, do político ou da empresa a quem o relato foi enviado. Contas de órgãos, políticos, empresas e da equipe do Votz também não colaboram.

**Se você discorda de uma nota.** Toque em "Denunciar ou discordar desta nota". A moderação analisa. A nota que acusa alguém de crime, ofende ou não tem fonte que sustente é removida, e quem a escreveu recebe o motivo.

**Quem escreve não aparece.** A nota mostra "Pessoas do Votz", sem nome. O Votz guarda quem escreveu para poder responder a uma ordem da Justiça.

## 2. Termo do colaborador

> Hoje existe uma versão provisória na página `/contexto` (`apps/web/src/pages/ContextoDaComunidade.tsx`, lista antes do botão "Entrar como colaborador"). O texto final fica num arquivo próprio em `apps/web/src/legal/` e a versão é `CONTEXT_CONTRIBUTOR_TERMS_VERSION` em `packages/shared-types/src/context-notes.ts`.

**Termo do colaborador do Contexto da Comunidade**

1. **Quem pode.** Tenho 18 anos ou mais e minha conta tem mais de 30 dias, com e-mail confirmado.
2. **O que posso fazer.** Avaliar notas escritas por outras pessoas e, depois de avaliar algumas, escrever notas com fonte sobre publicações e relatos.
3. **Regras de escrita.** Vou seguir as regras da seção "Contexto da Comunidade" das Diretrizes: falar do conteúdo e não da pessoa, só fato e fonte, não acusar ninguém de crime, não expor dados pessoais.
4. **Conflito de interesse.** Não vou escrever nem avaliar nota sobre conteúdo meu, nem sobre relato enviado à entidade, ao político ou à empresa de que faço parte.
5. **Meu nome.** Minhas notas aparecem como "Pessoas do Votz". O Votz guarda que fui eu quem escreveu, pelo prazo previsto na Política de Privacidade, e pode informar à autoridade quando houver ordem da Justiça.
6. **Minhas avaliações.** O Votz guarda minhas avaliações e pode usá-las para medir se avalio com atenção (por exemplo, se costumo coincidir com o resultado final), e só para isso. Elas não são usadas para anúncios e não revelam o que penso para ninguém.
7. **Moderação.** A moderação pode remover uma nota, recusar uma avaliação, suspender minha participação ou convidar-me a escrever. Sendo removida uma nota minha, recebo o motivo por e-mail e posso contestar.
8. **Sair.** Posso parar de colaborar quando quiser. Se eu excluir minha conta, minhas avaliações são apagadas e minhas notas já publicadas ficam sem meu nome.

## 3. Termos de Uso: trechos novos

> Entram em `apps/web/src/legal/termos-de-uso.ts`.

- **Conteúdo do usuário.** A nota do Contexto da Comunidade é conteúdo de usuário, como um comentário. Quem a escreve é responsável por ela, garante que tem o direito de publicá-la e autoriza o Votz a exibi-la, guardá-la e removê-la.
- **Moderação de notas.** O Votz pode recusar, ocultar ou remover nota que descumpra as Diretrizes, e suspender quem colabora de forma abusiva. A exibição de uma nota não é decisão do Votz sobre o mérito do conteúdo: é o resultado da avaliação de pessoas, por regras públicas.
- **Sem garantia.** A nota ajuda a entender melhor, mas não é verificação oficial e não substitui a decisão de uma autoridade.
- **Regras públicas e revisão por pessoa.** A regra que decide quando uma nota aparece é automática e está descrita na página "Contexto da Comunidade". Quem escreveu a nota, ou o autor do conteúdo, pode pedir revisão por uma pessoa da moderação pelo botão "Denunciar ou discordar".

## 4. Política de Privacidade: trechos novos

> Entram em `apps/web/src/legal/politica-de-privacidade.ts`: tabela de finalidades, "Por quanto tempo guardamos" e direitos do titular.

**Tabela de finalidades**

| Dado | Para quê | Base legal (a confirmar) |
|---|---|---|
| Notas que você escreve (texto, fontes, tipo), quem escreveu e quando | Exibir notas com fonte, moderar e responder a ordem da Justiça | Legítimo interesse (art. 7º, IX): integridade da informação na plataforma |
| Avaliações que você dá (valor e motivos) | Decidir se uma nota aparece e medir se você avalia com atenção | Legítimo interesse (art. 7º, IX) |
| Pedidos de contexto que você faz | Mostrar a quem colabora quais conteúdos pedem contexto | Legítimo interesse (art. 7º, IX) |
| Andamento como colaborador (quantas avaliações deu e quantas coincidiram com o resultado) | Liberar a escrita de notas e evitar abuso | Legítimo interesse (art. 7º, IX) |
| Aceite do termo do colaborador (versão e data) | Provar o aceite | Cumprimento de obrigação legal e exercício regular de direitos (art. 7º, II e VI) |

**O que não fazemos.** Não deduzimos suas opiniões políticas a partir de como você avalia. Nada do que você escreve, avalia ou pede no Contexto da Comunidade é usado para escolher anúncios.

**Por quanto tempo guardamos** (proposta; o advogado ajusta)

| Dado | Prazo |
|---|---|
| Nota exibida e histórico de mudanças de estado | Enquanto o conteúdo existir (é a Memória pública daquele conteúdo) |
| Nota recusada ou removida | Registrada na moderação, sem aparecer, pelo prazo de defesa que o advogado definir |
| Avaliação ligada à sua conta | 12 meses; depois, só em números somados, sem ligar a você |
| Registro de acesso | 6 meses (Marco Civil, art. 15) |

**Seus direitos.** Suas notas, avaliações e pedidos entram no arquivo de exportação dos seus dados. Ao excluir a conta, apagamos suas avaliações, seus pedidos e seu vínculo de colaborador; suas notas já publicadas ficam sem o seu nome.

## 5. Teste de balanceamento (legítimo interesse): rascunho

1. **Finalidade.** Reduzir informação enganosa e dar contexto a relatos e publicações, com fonte, sem tirar conteúdo do ar.
2. **Necessidade.** Para a nota existir, é preciso guardar quem escreveu (responsabilização e ordem judicial) e as avaliações (a regra de exibição depende delas). Sem isso, o recurso não funciona e a moderação vira o único caminho.
3. **Dados mínimos.** Texto, fontes, tipo, autor, avaliações com motivos de uma lista fechada, contagem de acertos. Nada de opinião política inferida, localização ou conteúdo de mensagens.
4. **Expectativa do titular.** A pessoa entra por escolha própria, depois de ler o termo do colaborador.
5. **Riscos para o titular e medidas.**
   - Retaliação contra quem escreve: o nome não aparece nas notas.
   - Nota usada para intimidar quem relata: relato só aceita tipos fechados, nunca "é falso"; o órgão alvo não escreve nem avalia; relato anônimo não grava o autor.
   - Combinação de grupos para exibir ou derrubar nota: a regra exige 7 pessoas diferentes, conta com 30+ dias, limite de notas por dia e inércia para sair do ar.
   - Decisão automatizada (LGPD, art. 20): a regra é pública e há revisão por pessoa da moderação.
6. **Conclusão proposta.** O legítimo interesse prevalece com essas medidas. Revisar se a etapa 3 (ponte entre pontos de vista) for ativada, porque aí pode haver inferência de opinião política.

## 6. RIPD (resumo no molde do RIPD de anúncios)

> Molde completo em [ripd-anuncios-rascunho.md](ripd-anuncios-rascunho.md). Este é só o que muda no Contexto da Comunidade.

- **Controlador e encarregado:** os mesmos da Política de Privacidade (ainda provisórios, ver [pendências](pendencias-antes-de-publicar.md)).
- **Dados tratados:** os da tabela da seção 4. **Operadores:** os mesmos de hoje (banco, fila, e-mail). **Na etapa 1 não há transferência internacional nova** (não há IA).
- **Risco principal:** inferência indireta de opinião política pelo padrão de avaliações. **Medida:** a etapa 1 não calcula nenhum "ponto de vista"; a etapa 3 só liga com este RIPD atualizado e aprovado.
- **Segurança:** só autor do conteúdo e moderação veem quem escreveu; a API pública nunca devolve o autor; a conta de colaborador tem limite de uso e a moderação pode suspender.

## 7. Processo interno de moderação (a definir pelo dono)

| Pergunta | Proposta |
|---|---|
| Quem atende denúncia de nota? | Moderador ou admin, na fila de denúncias (aba existente em `/admin`) |
| Em quanto tempo? | O advogado fixa o prazo para ilícito grave; sugestão de 24 horas úteis para crime, dado pessoal e ofensa, e 5 dias para o resto |
| O que a moderação faz com uma nota? | Remove (com motivo, avisa quem escreveu), ou descarta a denúncia com observação |
| E o colaborador abusivo? | Suspende (`POST /admin/context-notes/contributors/:id/suspend`) |
| Via rápida | Etapa 2: só moderador e admin, só saúde, segurança e golpe, com prazo e registro |

## 8. Pendências para o advogado

1. Confirmar a **base legal** (legítimo interesse) e os **prazos** da seção 4.
2. Ler o **acórdão do STF** sobre o art. 19 do Marco Civil e dizer qual o prazo e o procedimento de retirada que o Votz precisa ter para notificações. Uma reportagem de 17/06/2026 fala em 60 dias de adequação após os embargos; **não confirmei** em outra fonte.
3. **Idade:** hoje o Votz só tem a idade autodeclarada (`ageConfirmedAt`). O ECA Digital (Lei 15.211/2025, em vigor desde 17/03/2026) rompe com a autodeclaração em certos casos. Decidir se vale para o colaborador e para o produto inteiro.
4. **Eleições:** se o Contexto precisa de regra própria em período eleitoral (resoluções do TSE).
5. **Nota que acusa alguém:** se o texto das regras de escrita basta para afastar responsabilidade do Votz por difamação, e se é preciso aviso prévio ao autor do conteúdo antes de a nota aparecer.
6. **Relato anônimo:** o autor não é gravado, então não pode ser impedido de avaliar nota do próprio relato. Confirmar que é aceitável.
7. **Marca:** consulta no INPI de "Contexto da Comunidade" e "Confere" (esta última só vale na etapa 2).

## 9. O que o código ainda precisa fazer para cumprir o que o texto promete

| Promessa do texto | Situação |
|---|---|
| Notas, avaliações, pedidos e andamento como colaborador entram na exportação LGPD | **Feito (23/11/2026)** em `apps/api/src/users/lgpd.processor.ts`, com teste |
| Avaliação ligada à conta por 12 meses, depois só somada | **Não existe job de retenção ainda** |
| Registro de acesso por 6 meses | Já existe (`access-log`); falta conferir que escrever e avaliar nota entram nele |
