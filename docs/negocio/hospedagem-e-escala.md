# Votz — Hospedagem e escala: o Render serve para chegar a milhões?

> **Pergunta (15/11/2026):** manter o Votz no Render é viável se o sistema alcançar milhões de usuários no Brasil?
> **Resposta curta:** o Render **serve para lançar e crescer bastante**, mas **não é o destino final** para milhões de brasileiros. **A produção ainda não está configurada no Render**, então a região é uma **decisão a tomar na configuração inicial**, e não um defeito atual.

## 1. A decisão da região (para tomar ao configurar a produção)

- O Render tem só 5 regiões: **Oregon, Ohio, Virginia, Frankfurt e Singapura**. **Não há São Paulo.**
- O `render.yaml` do repositório está com **`region: frankfurt`** (API e Redis), mas é só um rascunho de configuração. **Trocar para `virginia` antes do primeiro deploy.** Em geral a região de um serviço **não pode ser alterada depois de criado** (ele precisa ser recriado), então vale escolher certo na primeira vez. Confirme na documentação do Render.
- Banco, Redis e API devem ficar **na mesma região** (ou o banco será chamado de longe a cada consulta).
- Latência de ida e volta a partir de São Paulo (medições de terceiros, só ordem de grandeza):

| Onde fica o servidor | Latência aproximada |
|---|---|
| **São Paulo** | **5 a 40 ms** |
| **Virginia (EUA)** | **115 a 175 ms** |
| **Frankfurt (Alemanha)** | **~180 ms** |

- Uma tela do Votz faz várias chamadas à API. Com ~180 ms em cada uma, o celular em 4G fica **visivelmente lento**. Isso pesa mais que o custo.
- **Ação barata, a fazer na configuração:** usar **Virginia** (e o banco na mesma região, perto da API). Ganha-se ~50 a 60 ms por chamada em relação a Frankfurt.

## 2. O que "milhões de usuários" significa em tráfego

Milhões de **cadastrados** não são milhões de **ativos**. Uma conta de planejamento (premissas minhas, a medir depois):

| Cenário | Ativos por dia | Chamadas por dia | Média | Pico (×5) |
|---|---|---|---|---|
| 1 milhão de contas | ~150 mil | ~4,5 milhões | ~50 por segundo | ~260 por segundo |
| 5 milhões de contas | ~750 mil | ~22 milhões | ~260 por segundo | ~1.300 por segundo |

Isso **cabe em poucas instâncias** de uma API NestJS bem feita, **desde que** o banco aguente e as páginas públicas usem cache. O limite real não é a API, e sim:
1. **O banco de dados** (conexões, consultas de lista, busca de relatos parecidos).
2. **Conexões WebSocket** (notificações e chat de debate).
3. **Debates ao vivo e transcrição**, que são os itens mais caros por usuário.
4. **Picos de eleição** e de notícia: o tráfego não é uniforme.

## 3. O que o Votz já tem a favor

- **Mídia no Cloudflare R2**, que **não cobra saída de dados**. O vídeo e a foto não pesam na conta de banda do Render.
- **Socket.IO com adaptador Redis** (`RedisIoAdapter`): permite várias instâncias da API.
- **Tarefas pesadas em fila (BullMQ)**: fora do caminho do usuário.
- **Autenticação sem estado de memória** (JWT + refresh em banco): qualquer instância atende qualquer usuário.
- **Limitador de uso em Redis** (3B): vale entre instâncias.

## 4. Onde o Render pode apertar

| Ponto | Por quê |
|---|---|
| **Sem região no Brasil** | Latência alta e, para clientes do governo, **dados fora do país** |
| **Exigência do governo** | Contratos públicos podem exigir **dados hospedados no Brasil** (nuvem nacional ou região BR). Isso é **decisão de contrato, não técnica**; perguntar ao advogado antes de vender |
| **Banda excedente** | Fontes citam cobrança de banda além da franquia (cerca de US$ 0,15/GB) e mudança de planos em ago/2026. **Confirmar**; o caminho é servir páginas públicas por CDN |
| **Autoescala e rede** | Recursos de autoescala, redes privadas e segurança (WAF) são mais limitados que numa nuvem grande |
| **Banco** | O Postgres gerenciado em escala alta é onde mais se paga; nuvem grande oferece mais opções de ajuste |

## 5. Estratégia sugerida em três fases, com gatilhos

### Fase A · Lançamento (até ~50 mil usuários ativos por dia)
**Começa no Render.** Ao configurar a produção, faça só isto:
1. **Criar tudo em Virginia, e não em Frankfurt** (API, Redis e banco juntos).
2. **Cloudflare na frente do site e da API** (plano grátis ou Pro): CDN, **cache das listas públicas** (relatos, políticos, entidades; pode reduzir a carga em 70 a 90%), proteção contra ataque e WAF. Isso também melhora a latência de leitura, porque o Cloudflare tem presença no Brasil.
3. **Adicionar um `Dockerfile`** à API. Hoje o repositório **não tem**; o Render compila direto do código. Com Dockerfile, migrar vira trocar de endereço, não reescrever.
4. **Medir:** latência p95 por rota, consultas lentas, conexões do banco. Sem medida, qualquer decisão é palpite.
5. **Teste de carga** (ex.: k6) antes de lançamento de campanha e de qualquer pico previsível.

### Fase B · Gatilhos para sair do Render
Avaliar a migração **quando acontecer qualquer um** destes:
- **p95 de latência** das telas principais acima de ~800 ms de forma recorrente.
- **Mais de ~50 a 100 mil usuários ativos por dia.**
- **Cliente do governo exige dados no Brasil.**
- **Custo mensal** de infraestrutura acima de ~**R$ 10 mil**.
- Necessidade de **autoescala**, WAF avançado ou redes privadas.

### Fase C · Destino provável
**Nuvem com região em São Paulo**, por exemplo AWS (sa-east-1) ou Google Cloud (southamerica-east1), com banco gerenciado, cache e contêineres. Alternativas intermediárias a avaliar: **Fly.io** (tem região em São Paulo) ou **provedores nacionais**. A escolha depende de custo, equipe e das exigências dos clientes. **Não precisa ser decidida agora.**

**Atenção:** nuvem grande custa mais **tempo de operação**. O Render é produtivo para uma equipe pequena. A regra é **não otimizar cedo demais, mas não fechar a porta**: por isso o `Dockerfile` e a medição entram já.

## 6. Efeitos legais e nos textos

- A **Política de Privacidade** lista "Render (servidor em Frankfurt)" e fala em transferência internacional. **Trocar a região exige atualizar o texto** e a versão do documento (`PRIVACY_VERSION`).
- Hospedar no Brasil **não é obrigatório pela LGPD**, mas **simplifica** a transferência internacional e agrada clientes públicos.

## 7. Próximos passos

| # | Ação | Quem |
|---|---|---|
| 1 | **Ao configurar a produção:** ajustar o `render.yaml` para Virginia e criar o banco na região equivalente | Gemini (brief) + você |
| 2 | Colocar Cloudflare na frente e definir regras de cache das rotas públicas | Você + Gemini |
| 3 | Criar o `Dockerfile` da API | Gemini (brief) |
| 4 | Medir latência e fazer teste de carga | Gemini + você |
| 5 | Perguntar ao advogado se contratos públicos exigem dados no Brasil | Você |
| 6 | Atualizar a Política de Privacidade após qualquer troca de região | Claude |

## Fontes

- [Regiões do Render](https://render.com/docs/regions) · [lista de regiões (getdeploying)](https://getdeploying.com/render)
- Latência: [Frankfurt → São Paulo (hatsnet)](https://hatsnet.io/docs/network/latency/pairs/fra-gru-rtt) · [AWS sa-east-1 × eu-central-1](https://www.economize.cloud/resources/aws/latency/sa-east-1-vs-eu-central-1/) · [relato de latência no GCP São Paulo](https://groups.google.com/g/gce-discussion/c/hlKY_9cHD38)
