# Brief 4C — Ferramentas do político (engajamento e trabalho do mandato)

> Para o Gemini. **Depende do 3D, 4A e 4B.** Leia `docs/negocio/planos-e-beneficios-v1.md` (seções 2 e 3b).
> Objetivo: fazer o político **querer usar o Votz todo dia** e **mostrar o trabalho dele ao cidadão**, sem vender visibilidade e sem virar propaganda eleitoral. O gancho é a rotina do gabinete: saber o que chegou, responder rápido, prestar contas e compartilhar resultado.

## Princípios

1. **Responder e atualizar status é grátis.** Estas ferramentas economizam trabalho, não compram posição.
2. **Reputação conquistada, nunca vendida.** Nenhuma ferramenta altera ranking, Votz Score ou destaque.
3. **Nada de propaganda eleitoral** (risco jurídico, razão da retirada do plano Campanha): modelos fixos, só dados factuais do Votz, **sem texto livre promocional, sem número de candidato, sem pedido de voto, sem slogan**. Textos de rodapé fixos explicando a fonte e a data dos dados.
4. **Tudo de dados vem do 4B** (rollups e dicionário); nada de cálculo paralelo.
5. Acesso por `requireActingOrg` + `FeatureKey` do catálogo (4A). Jobs pesados **sempre via BullMQ**.
6. Segurança: textos livres (modelos de resposta, notas) passam por DOMPurify; limites de requisições; auditoria (usar o mecanismo de log de auditoria que já existe no projeto; localizar no T0, não criar um paralelo) para criação e exclusão de itens da organização.

## T0 — Inspeção

Responder com arquivo:linha: como o político hoje vê relatos (listagem, filtros, avocar); como notificações chegam (`NotificacoesModule`, e-mail/SMTP); onde fica o envio de e-mail; se há biblioteca de PDF/imagem no monorepo (não há `pdfkit`, `sharp`, `satori`, `puppeteer` no `package.json` hoje); como funciona o armazenamento privado no R2 (`exports/`, URL assinada, expiração de 7 dias).

## T1 — "Caixa do mandato" (a tela que traz o político todo dia)

- Página inicial do contexto político: lista priorizada de relatos da área (4B, escopo territorial) por **pressão**, idade e categoria; filtros (categoria, célula, status, "sem resposta há mais de X dias"); ações rápidas: **avocar**, **responder com modelo**, mudar status (cada mudança gera `TimelineEvento`).
- Três números do topo: sem resposta, avocados em andamento, resolvidos no mês (com meta mensal opcional editável pelo gabinete).
- Gratuito para o Básico (lista e ações); **Mandato** libera filtros avançados e metas; análise vem do 4B.

## T2 — Resumo semanal por e-mail (engajamento)

- Job BullMQ semanal (segunda, 8h `America/Sao_Paulo`): novos relatos na área, os 3 de maior pressão sem resposta, tempo mediano de resposta contra a semana anterior, resolvidos, e **um botão** para abrir a Caixa do mandato.
- Configurável (ligar/desligar, dia/hora), **link de descadastro** de um clique, sem rastreamento de abertura invasivo, respeitar LGPD (base legal e preferência registrada).
- Disponível a partir do **Mandato**; versão resumida no Básico (apenas contagem e link).

## T3 — Alertas configuráveis (`outbreak_alerts`)

- Modelo `AlertRule` (organização, categorias[], células geohash ou "toda a área", pressão mínima, tipos: novo relato, pressão acima de X, surto, relato parado há N dias; canais: in-app e e-mail; frequência: imediato ou resumo diário).
- Limite de regras por plano (no catálogo: Básico 0, Mandato 5, Mandato Pro 25).
- Avaliação em job (fila `ALERTS_QUEUE` existente) a cada evento relevante e por varredura de 15 min; **deduplicar** (mesmo relato/regra não alerta duas vezes) e **agrupar** para não gerar enxurrada.
- Sem vazar relato fora da área do contexto.

## T4 — Respostas-modelo e etiquetas internas (`reply_templates`)

- `ReplyTemplate` (organização, título, corpo, categoria opcional, variáveis `{{protocolo}}`, `{{bairro}}`, `{{categoria}}`, `{{prazo}}`; contagem de uso). CRUD para membros com permissão; limite por plano (Mandato Pro).
- Sanitizar corpo (DOMPurify), tamanho máximo, validar variáveis conhecidas (rejeitar desconhecidas).
- **Etiquetas e notas internas** por relato (`OrgReportTag`, `OrgReportNote`): visíveis **só** para a equipe da organização, nunca na API pública. Teste provando que não vazam em nenhuma rota pública.

## T5 — Prestação de contas em PDF (`pdf_report`)

- Escolher e justificar a biblioteca de PDF **no servidor** (preferir `pdfkit` ou `@react-pdf/renderer`; evitar navegador headless por custo e superfície de ataque). Fontes: Space Grotesk Bold (títulos), Inter (corpo), JetBrains Mono (dados); conferir licenças e embutir no pacote.
- Conteúdo fixo e factual do período escolhido: identificação (nome, cargo, território), relatos recebidos, respondidos, avocados, resolvidos, tempo mediano de resposta, categorias principais, comparação com o período anterior, lista de relatos resolvidos de maior apoio (título e data, sem dados pessoais), nota de metodologia com **versão do dicionário** e `computedAt`.
- Gerado em job BullMQ, salvo no R2 **privado** (`exports/`), entregue por **URL assinada curta**; expira em 7 dias (regra do ciclo de vida já prevista).
- **Autenticidade:** cada relatório recebe `code` único e um **snapshot imutável** dos números (tabela `AccountabilityReport`); QR e URL pública `/prestacao/:code` mostram os mesmos números e a data (a "Memória" do Votz). Edição posterior não altera o snapshot.
- Limite por plano e por mês (Mandato: 4; Mandato Pro: ilimitado) e limite de requisições.
- Mesmo mecanismo será reutilizado pelo relatório mensal de entidades (4D): construa como serviço genérico `ReportRenderer`.

## T6 — Cartão compartilhável (`share_card`)

- Imagens PNG 1080×1350 (feed) e 1080×1920 (stories), geradas no servidor com modelo fixo (sugestão: `satori` + `@resvg/resvg-js`; justificar). Conteúdo: nome, cargo, período, 3 números do mandato, selo "dados do Votz" e URL pública. **Sem foto de terceiros, sem slogan, sem campo livre.**
- Página pública `/p/:slug/mandato` com **metatags Open Graph** da imagem, para a pré-visualização nas redes.
- Cache da imagem por (político, período, versão dos números); regenerar por job quando os números mudarem.
- Limite de geração por plano.

## T7 — Webhooks para o gabinete (`webhooks`, Mandato Pro; reutilizável por entidades)

- `WebhookEndpoint` (organização, URL https, segredo exibido **uma vez**, eventos assinados, ativo). Eventos: `report.created`, `report.status_changed`, `report.pressure_threshold`, `outbreak.detected`.
- Entrega por BullMQ com **retentativas exponenciais**, `HMAC-SHA256` no cabeçalho (`X-Votz-Signature` + timestamp para evitar replay), idempotência por `eventId`, registro de entregas (sucesso/falha/latência) visível ao cliente, **desativação automática** após falhas seguidas.
- **Proteção contra SSRF:** só `https`, bloquear IPs privados/loopback/link-local/metadata (resolver DNS e validar o IP final; revalidar a cada entrega; sem seguir redirecionamentos), limite de tamanho e de tempo (5 s), sem credenciais na URL.
- Carga útil **sem dados pessoais** de cidadão (mesmas regras de privacidade do 4B).
- Teste dedicado de SSRF (127.0.0.1, 169.254.169.254, `localhost`, DNS rebinding simulado, redirect para IP interno).

## T8 — Onboarding do mandato

Checklist guiado após virar contexto político: confirmar território, convidar assessor, criar 1 modelo de resposta, ligar o resumo semanal, definir meta mensal. Progresso persistido e simples; sem pop-ups agressivos.

## T9 — Front-end

Telas: Caixa do mandato, Alertas, Modelos, Prestação de contas (gerar, lista, baixar, ver página pública), Cartões (pré-visualizar e baixar), Webhooks (criar, ver entregas), Preferências do resumo. TanStack Query, `theme` sem cor hardcoded, estados de plano bloqueado como no 4B, textos diretos e simples.

## T10 — Testes e critérios de pronto

- Unitários dos serviços; fixtures de geração (PDF e imagem não vazios, contendo os números esperados, com o `code`).
- Privacidade: nenhuma saída (PDF, cartão, webhook, e-mail) contém dados pessoais de cidadão ou autor; notas/etiquetas internas jamais em rota pública.
- Segurança: SSRF (acima), HMAC, replay, DOMPurify, limites por plano, escopo territorial.
- Jobs: idempotência do resumo semanal (não envia duas vezes), deduplicação de alertas.
- **Pronto quando:** build e `tsc` limpos, suítes verdes (informar o número), `route-auth-audit` e matriz de papéis verdes, política de retenção de `exports/` confirmada.

## Fora do escopo

Disparo em massa a cidadãos, mensagens a eleitores, impulsionamento, qualquer ferramenta de campanha, integração com redes sociais por API, cobrança (4E).

## Entregável

Relatório no formato dos anteriores, com respostas do T0, decisões de biblioteca justificadas, arquivos alterados, saídas de teste e divergências.
