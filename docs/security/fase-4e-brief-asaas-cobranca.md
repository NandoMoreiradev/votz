# Brief 4E — Cobrança com Asaas (Pix, boleto, cartão e nota fiscal)

> Para o Gemini. **Depende do 4A** (catálogo e `PLAN_PRICES`). Contexto: `docs/negocio/estimativa-de-custos-e-planos-v1.md` (seção 0). O governo e a maioria dos políticos pagam por **Pix ou boleto**; o Stripe cobre só cartão. O Asaas passa a ser o meio **principal**; o Stripe pode permanecer como alternativa para cartão, via uma interface comum.
> **Pendência jurídica (não bloqueia o código):** a modalidade pela qual o governo contrata (dispensa, inexigibilidade, licitação) será definida com advogado. Por isso o código deve permitir **faturamento por contrato** (cobrança criada manualmente pelo admin), além da assinatura recorrente.

## Princípios de segurança (inegociáveis)

1. **O Votz nunca toca em dado de cartão.** Usar sempre a fatura/checkout hospedado do Asaas (`invoiceUrl`). Fora do escopo PCI.
2. **Quem concede plano é só o webhook validado**, nunca a página de retorno nem parâmetro do cliente (mesma regra do Stripe).
3. **Nunca confiar no corpo do webhook**: após autenticar, **reconsultar a cobrança na API do Asaas** pelo id e decidir pelo estado retornado e pelo valor esperado do catálogo.
4. Preço vem **só do servidor** (`PLAN_PRICES`, 4A). O cliente escolhe plano e periodicidade; nunca valor.
5. CPF/CNPJ de cobrança: CPF criptografado AES-256 (regra do projeto); CNPJ pode ficar em texto. **Nunca** em log nem em URL.
6. Chaves do Asaas só em variáveis de ambiente, **sandbox e produção separadas**, sem valor padrão no código; a API recusa iniciar em produção sem elas quando o Asaas estiver habilitado por flag.

## T0 — Inspeção

Responder com arquivo:linha: como `SubscricoesService` e o webhook do Stripe funcionam hoje, onde ficam `stripeCustomerId`/`stripeSubscriptionId` em `Entity`/`Politician`/`Company`, o `StripeEvent` de deduplicação, como o plano é concedido e rebaixado, e o que `PagamentoSucesso.tsx` faz. Ler a documentação oficial atual do Asaas (clientes, cobranças, assinaturas, webhooks, notas fiscais de serviço) e **citar a versão consultada**; não confiar em memória para nomes de campos e cabeçalhos.

## T1 — Interface de cobrança e modelo de dados

- Criar `BillingProvider` (interface) com implementações `AsaasProvider` e `StripeProvider` (adaptar o código existente sem quebrar testes). O restante do sistema usa só a interface.
- Modelo genérico, em vez de colunas por provedor nas organizações (migração com mapeamento do Stripe existente):
  - `BillingAccount` (organização, provedor, `externalCustomerId`, documento de cobrança, e-mail e nome de cobrança, `purchaseOrderRef` para **número de empenho/contrato** de órgão público);
  - `Subscription` (organização, provedor, `externalSubscriptionId`, plano, periodicidade mensal/anual, `status`, `currentPeriodEnd`, `graceUntil`, `cancelAtPeriodEnd`);
  - `BillingInvoice` (assinatura, `externalPaymentId`, valor, `dueDate`, forma de pagamento, `status`, `invoiceUrl`, `nfseUrl`, datas);
  - `BillingEvent` (id do evento, provedor, tipo, `processedAt`) para **idempotência** (substitui o padrão do `StripeEvent`, mantendo-o compatível).
- Estados padronizados da assinatura: `PENDING`, `ACTIVE`, `PAST_DUE`, `CANCELED`, `EXPIRED`.

## T2 — Fluxo de contratação

1. Usuário com permissão `MANAGE_BILLING` (ou equivalente; criar se não existir) escolhe plano e periodicidade, informa dados de cobrança (nome, CPF/CNPJ, e-mail, endereço quando exigido para nota fiscal).
2. Servidor valida o plano contra o catálogo **e a faixa** (cargo do político, população da entidade), cria cliente e assinatura no Asaas (`billingType: UNDEFINED` para o pagador escolher Pix, boleto ou cartão na página do Asaas) e devolve o link.
3. Ativação **só** pelo webhook de pagamento confirmado/recebido; antes disso o plano continua o atual.
- **Anual:** 10 mensalidades (2 meses grátis), cobrança única anual ou parcelada conforme o provedor; documentar.
- **Cliente fundador:** campo `discountPercent` e `discountUntil` na assinatura, **definidos só pelo admin** (nunca pelo cliente), aplicado no valor criado no Asaas; registrar motivo e quem concedeu.
- **Upgrade:** vale imediatamente, com cobrança proporcional (definir regra simples e documentar); **downgrade:** só no fim do ciclo.

## T3 — Webhook do Asaas

- Rota pública dedicada `POST /billing/asaas/webhook` (decorada `@Public()` e fora do CSRF, **protegida por token**): comparar o cabeçalho de autenticação configurado no Asaas com o segredo em variável de ambiente por **comparação em tempo constante**; sem token válido → `401` sem detalhes. Limite de requisições adequado e, opcionalmente, lista de IPs do Asaas por configuração.
- Idempotência por id de evento (`BillingEvent`) **antes** de processar; processar em transação; evento fora de ordem não pode regredir estado (comparar timestamps/estado atual); falha → resposta de erro para o Asaas reenviar, sem marcar como processado.
- Eventos tratados (conferir nomes na documentação): cobrança criada, confirmada, recebida, vencida, estornada/reembolsada, removida; assinatura inativada. Cada um atualiza `BillingInvoice` e `Subscription`.
- Todo evento gera registro de auditoria; **nunca** logar corpo completo nem token.

## T4 — Inadimplência, carência e cancelamento

- Cobrança vencida → `PAST_DUE` com **carência de 7 dias** (constante configurável) durante a qual o plano continua; avisos por e-mail (D0, D3, D6) via fila.
- Após a carência: **rebaixa para `BASICO` sem apagar dados** (membros além do limite ficam preservados mas sem novas adições; recursos pagos ficam bloqueados; exportação dos próprios dados continua possível por 30 dias). Evento na auditoria.
- Cancelamento pelo cliente: vale até o fim do período pago (`cancelAtPeriodEnd`). Estorno só por admin.
- Pagamento tardio após rebaixamento reativa o plano.

## T5 — Faturamento por contrato (governo)

- Endpoint **só admin** para criar cobrança avulsa/recorrente manual para uma organização (valor do catálogo ou valor contratual com justificativa obrigatória), com `purchaseOrderRef` (empenho/contrato), vencimento e opção de apenas **registrar** pagamento recebido por fora (conciliação manual, com anexo opcional em bucket privado).
- Concessão de plano por prazo (`planExpiresAt`) para contratos pagos fora da plataforma, com **expiração automática por job** e aviso antes do vencimento.
- Tudo registrado na auditoria com o autor.

## T6 — Nota fiscal (NFS-e)

Integrar a emissão pelo recurso fiscal do Asaas **se a conta estiver configurada para isso**; caso contrário, apenas o gancho (`nfseUrl` vazio e aviso na tela). Dados fiscais do emitente (CNPJ da VOTZ DO BRASIL, município, serviço, alíquota) ficam **em configuração**, nunca fixos no código; deixar claro no relatório que **o enquadramento tributário ainda depende do contador**. Disponibilizar o link/PDF da nota em "Minhas cobranças".

## T7 — Front-end

- **Planos/Checkout:** escolha de plano e periodicidade, preço por faixa vindo do catálogo, formulário de dados de cobrança com máscara e validação de CPF/CNPJ, redirecionamento ao `invoiceUrl`. Remover a afirmação "só cartão Stripe" do FAQ e informar **Pix, boleto e cartão**.
- **Minhas cobranças** (na organização): plano atual, próxima cobrança, histórico, status, segunda via de boleto/Pix, nota fiscal, cancelar, mudar plano; aviso de carência.
- **Admin:** painel de assinaturas, inadimplentes, cobrança por contrato, desconto de fundador.
- `theme` sem cor hardcoded, TanStack Query, texto simples.

## T8 — Testes e critérios de pronto

- Cliente HTTP do Asaas **mockado** (sem rede nos testes); contrato validado contra exemplos da documentação.
- Webhook: token inválido, ausente, comparação em tempo constante, evento duplicado, fora de ordem, valor divergente do catálogo (rejeitar e alertar), pagamento de assinatura inexistente, falha no meio (reprocessável).
- Concessão: nenhuma rota concede plano sem evento validado; `plan` ou `value` vindo do cliente é ignorado (mass assignment).
- Inadimplência: carência, rebaixamento sem perda de dados, reativação.
- IDOR: ver cobrança/assinatura de outra organização; `MANAGE_BILLING` exigido.
- Stripe: testes existentes continuam verdes após a interface comum.
- Roteiro manual de **sandbox** documentado (`docs/negocio/roteiro-teste-asaas-sandbox.md`): contratar, pagar por Pix e boleto simulados, vencer, estornar, cancelar.
- **Pronto quando:** build e `tsc` limpos, suítes verdes (informar o número), `route-auth-audit` ajustado (a única rota pública nova é o webhook, com justificativa), nenhuma chave no repositório, `.env.example` atualizado.

## Fora do escopo

Divisão de pagamento (split), carteira digital, emissão fiscal sem configuração da conta, integração com empenho/sistemas contábeis públicos, remoção do Stripe, atualização dos textos legais (será feita por mim depois: fornecedores de pagamento e retenção de dados fiscais).

## Entregável

Relatório no formato dos anteriores, com respostas do T0 (versão da documentação do Asaas consultada), decisões, arquivos alterados, saídas de teste e divergências.
