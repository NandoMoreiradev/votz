# Política de Anúncios do Votz (RASCUNHO para revisão do advogado)

> **Estado:** rascunho de 21/11/2026, escrito a partir do [plano de anúncios](../dev/anuncios-plano-implementacao-2026-11-21.md) aprovado pelo dono do produto. **Não publicar** antes da revisão jurídica. As listas oficiais (categorias proibidas e restritas, temas sensíveis, sinais usados) ficam no código em `packages/shared-types/src/ads.ts` e este texto precisa bater com elas.

## 1. Para quem é

Empresas com perfil verificado no Votz podem anunciar pelo Estúdio. Partidos, candidatos, mandatos, órgãos públicos e quem age em nome deles **não podem anunciar**.

## 2. Princípios

1. **Anunciar não compra influência.** Pagar anúncio não muda nota, posição, Votz Score, Mandatômetro nem a ordem dos relatos.
2. **Nada de política.** O Votz é apartidário. Anúncio político ou eleitoral é proibido em qualquer época.
3. **Seus dados sensíveis não viram anúncio.** O Votz nunca usa sua atividade cívica (relatos, apoios, votos, políticos que você segue, debates, mensagens) nem temas sensíveis para escolher anúncios.
4. **Transparência.** Todo anúncio é marcado como "Patrocinado", explica por que você está vendo e aparece na biblioteca pública de anúncios.

## 3. O que é proibido anunciar

- Política, eleições, candidatos e partidos.
- Órgãos públicos e publicidade de governo.
- Apostas e jogos de azar.
- Armas, munição e explosivos.
- Cigarro, vape e produtos de tabaco.
- Conteúdo adulto.
- Crédito com juros abusivos ou promessa de dinheiro fácil.
- Saúde com promessa de cura ou resultado garantido.
- Anúncio que fala do tema sensível da pessoa ("Você tem diabetes?", "Para quem é evangélico...").

## 4. O que é aceito só com revisão humana

Saúde (clínicas, farmácias, planos), educação (cursos, faculdades), serviços financeiros, imóveis e bebida alcoólica. Nesses casos o anúncio só roda depois da aprovação de uma pessoa da equipe e precisa cumprir as regras do setor (por exemplo, CONAR e as normas do conselho profissional).

## 5. Onde o anúncio aparece

- Só no feed, num cartão marcado "Patrocinado", no máximo **1 a cada 8 itens**.
- **Nunca** dentro de relatos, perfis de políticos, entidades ou empresas, conversas, debates ou páginas de transparência.
- **Nunca** perto de relatos contra o próprio anunciante.
- Uma parte das pessoas (5%) não vê anúncio nenhum. Isso serve para medir se os anúncios atrapalham o uso cívico.

## 6. Como escolhemos quem vê

**Sem a sua permissão:** só pelo contexto da tela (cidade e seção que você está vendo), aparelho e horário.

**Com a sua permissão** (você liga em "Preferências de anúncios" e pode desligar quando quiser):
- sua cidade, estado e bairro do cadastro;
- sua faixa de idade (nunca a data) e gênero, se você informou;
- interesses que você escolheu;
- empresas que você segue;
- anúncios que você viu, tocou ou escondeu;
- categorias não sensíveis de conteúdo com que você interagiu.

**Nunca:** atividade política ou cívica, temas sensíveis da LGPD (saúde, religião, origem racial ou étnica, vida e orientação sexual, filiação sindical ou política, dados genéticos ou biométricos), conteúdo de relatos, posts ou comentários, mensagens, CPF, documentos ou localização exata. Pessoas com menos de 18 anos nunca recebem anúncio personalizado.

## 7. Controles da pessoa

- Ligar ou desligar a personalização.
- Ver e apagar os interesses escolhidos e os deduzidos.
- "Por que estou vendo isto?" em cada anúncio.
- Esconder um anúncio ou todos de uma empresa.
- Os dados de anúncio entram na exportação e na exclusão de dados da LGPD.

## 8. Para o anunciante

- Relatórios só com números agregados, nunca com menos de 100 pessoas por recorte. O anunciante nunca sabe quem viu.
- Sem pixel nem rastreador. Conversões só pelo identificador do clique, sem dado pessoal.
- O anúncio passa por revisão automática e, quando preciso, humana, antes de rodar. Recusas podem ser contestadas.
- Pagamento pré-pago, com nota fiscal em cada recarga.
- O Votz pode suspender anúncios e contas que violem esta política, sem reembolso do que já foi entregue, e devolve o saldo não usado.

## 9. Perguntas para o advogado

1. A base legal para personalização é consentimento (art. 7º, I e art. 11, I da LGPD, quando houver risco de inferência sensível) ou legítimo interesse para os sinais não sensíveis? O plano adota consentimento (opt-in) para tudo que é personalizado.
2. A regra de "nunca perto de relatos contra o anunciante" e a de "anunciar não muda nota" bastam para afastar alegação de conflito de interesse ou propaganda enganosa?
3. Precisamos de cláusulas específicas de CDC e CONAR nos termos do anunciante? Quais setores restritos exigem documentação (ex.: saúde)?
4. A proibição total de anúncio político é compatível com a Res. TSE 23.610 e nos dispensa do repositório de impulsionamento político?
5. Tratamento de menores: a verificação por data de nascimento opcional é suficiente, dado que o cadastro já exige 18 anos (ECA Digital, Lei 15.211/2025)?
