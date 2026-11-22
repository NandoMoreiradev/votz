# Padrão de fotos e vídeos do Votz: plano (v1, 21/11/2026)

> **O que é:** um padrão único de formato e tamanho para fotos e vídeos das publicações (cidadãos, empresas, políticos e entidades), dos relatos e dos anúncios. Ele vem antes da Etapa 1 do [plano de anúncios](anuncios-plano-implementacao-2026-11-21.md), porque o anúncio usa o mesmo card do feed.
> **Estado:** **aprovado pelo dono do produto em 21/11/2026** (as quatro decisões da seção 6). Implementação em andamento.

## Como retomar (leia primeiro)

Atualizado em **21/11/2026**. Índice de todas as frentes: [EM-ANDAMENTO.md](EM-ANDAMENTO.md).

- **Estado:** passos 1 a 5 da seção 4 estão no código e **provados no site** com Postgres, Redis e MinIO locais (21/11/2026, à tarde). **Sem commit** (o dono faz os commits). Migration `20261121120000_media_assets` **aplicada no banco local** (`prisma migrate deploy`). Detalhes na seção 7, no fim.
- **Verificado:**
  - Testes unitários (API 817/818, a falha é a matriz de rotas do admin, anterior a esta mudança; celular 39/39), `tsc` da API, do site e do celular, lint dos arquivos alterados, build do site.
  - Prova de ponta a ponta pela API, 26 de 26 verificações (script fora do repositório, refeito com facilidade: login com `demo.cidadao1@votz.test`, envio, publicação, conferência dos arquivos no MinIO): foto em retrato com enquadramento respeitado; versões 1080×1350, cheia 4:5 e miniatura 400×500 WebP; sem metadados da câmera; arquivo já usado, formatos misturados e recorte errado recusados com mensagem em português; carrossel quadrado; remover rascunho; vídeo gravado em pé pelo envio direto → "processando" → pronto em 1080×1350 H.264, sem localização, com capa; relato com foto em pé aparece inteiro (moldura retrato, `contain`).
  - Original privado no MinIO (`media-src/`: 403 para quem não é a API) e apagado depois de publicado.
  - No navegador: publicação em retrato, carrossel quadrado com "Próxima/Anterior" e contador, vídeo com capa em 4:5, relato com fundo desfocado, editor (abre sozinho ao escolher a foto, sugere o formato mais próximo, troca de formato, arrastar para na borda, aproximar) e publicação pelo site saindo igual à prévia.
  - Job das antigas: `--dry-run` e execução real no banco local (1 publicação, 2 fotos, moldura 4:5 com fundo desfocado); rodar de novo não faz nada.
- **NÃO verificado:** o **celular** (nenhum aparelho conectado em 21/11): editor com gestos, carrossel novo e envio de vídeo pela tela de nova publicação; GIF de ponta a ponta; muitos arquivos grandes ao mesmo tempo.
- **Próximo passo:**
  1. Celular por USB (`cd apps/mobile && npm run android:usb`, depois `npm run dev`): escolher fotos e um vídeo em "Nova publicação", conferir o editor (um dedo arrasta, dois dedos aproximam), publicar e ver o carrossel no feed e num relato. Não precisa de build nova (só JavaScript).
  2. Enviar um GIF e conferir que aparece inteiro na moldura.
  3. Com o dono: revisar e commitar (montar o commit só com estes arquivos; há trabalho dele sem commit na árvore).
- **Ambiente de teste:** Docker (`votz-postgres`, `votz-redis`, `votz-minio`), API pelo `.claude/launch.json` (`votz-api`, porta 3000), site (`votz-web`, 5173). A API limita 3 publicações a cada 10 s: testes em sequência precisam esperar. Ficaram publicações e um relato de teste da conta `demo.cidadao1` no banco local, e dois rascunhos de envio que a limpeza automática apaga em 24 h.
- **Arquivos principais:** `packages/shared-types/src/media.ts` (contas e constantes; recompilar com `npm run build --workspace=packages/shared-types`), `apps/api/src/media/*` (envio, recorte, fila `media-render`, job das antigas), `apps/api/src/posts/posts.service.ts` (`prepareForPost`/`finalizeForPost`), `apps/api/src/storage/report-media.service.ts` (`itemsFor`), web `components/media/MediaCarousel.tsx` e `MediaCropEditor.tsx`, `components/posts/PostComposer.tsx`, celular `components/media-carousel.tsx`, `components/media-crop-sheet.tsx`, `screens/compose-screen.tsx`, `lib/post-media.ts`.
- **Pendências conhecidas:** avocação ainda usa o envio antigo; no R2 de produção o bucket público expõe `media-src/` a quem souber o nome (seção 7).

---

## 1. Como está hoje (levantado no código em 21/11/2026)

| Onde | O que acontece | Problema |
|---|---|---|
| Servidor: `apps/api/src/storage/image-normalize.ts` | Reduz a foto para no máximo 2048 px no maior lado e cria miniatura de 400 px. **Não corta.** Vale para `reports` e `posts` | Cada foto fica com uma proporção diferente |
| Servidor: `video-normalize.ts` | Vídeo em H.264, lado menor até 1080 px. **Não corta** | Igual |
| Banco | `report_media` guarda largura e altura. **`Post` só guarda a lista de links** (`media String[]`) | O site não sabe o tamanho da foto antes de carregar: a tela "pula" |
| Site: `components/posts/PostCard.tsx` | Foto única em tamanho livre, até 520 px de altura. Várias fotos: grade 4:3 com **corte automático** (`object-fit: cover`) | Corta partes que a pessoa não escolheu |
| Celular: `components/media-carousel.tsx` | Carrossel com a proporção da primeira foto, limitada entre 16:9 e cerca de 3:4, **sem corte** (`contain`) | A mesma publicação aparece **diferente no site e no celular** |
| Capa e foto de perfil | Capa 3:1 (1500×500) e foto 1:1, com recorte no envio | Já são padronizadas; ficam como estão |

---

## 2. O padrão proposto

### 2.1 Publicações e anúncios: três formatos

São os mesmos formatos do Instagram e do Facebook, para que empresas e agências reaproveitem as peças que já fazem.

| Formato | Proporção | Tamanho guardado | Uso típico |
|---|---|---|---|
| **Quadrado** | 1:1 | 1080 × 1080 | Padrão para foto |
| **Retrato** | 4:5 | 1080 × 1350 | Foto ou vídeo em pé (ocupa mais tela no celular) |
| **Paisagem** | 16:9 | 1920 × 1080 | Vídeo deitado, foto panorâmica |

- **A pessoa escolhe o formato e o enquadramento** ao publicar: arrasta e aproxima a foto dentro da moldura, como no Instagram.
- **Carrossel** (várias fotos ou vídeos): todos os itens usam o formato do primeiro.
- **Vídeo gravado em pé no celular (9:16):** aparece em **4:5 no feed**, com o enquadramento escolhido. A tela cheia mostra o vídeo inteiro.
- **Arquivos gerados pelo servidor** a partir da foto recortada:
  - miniatura de 400 px de largura (já existe);
  - versão de feed de 1080 px de largura;
  - versão cheia, com no máximo 2048 px no maior lado.
- **Vídeo:** H.264, lado menor até 1080 px (já existe), agora com o recorte aplicado.

### 2.2 Relatos: sem recorte

**Foto de relato é prova.** Cortar pode esconder justamente o que importa: a placa, o número da casa, a outra ponta do buraco. Por isso:
- O relato **guarda a foto inteira**, só reduzida e sem metadados de GPS, como já acontece.
- **Na tela, o relato usa as mesmas molduras do feed** (1:1, 4:5 ou 16:9, a mais próxima da foto). A foto aparece **inteira dentro da moldura**, com fundo desfocado da própria imagem preenchendo as sobras. A página fica padronizada sem cortar a prova.
- Tocar abre a foto inteira em tela cheia (já existe).

### 2.3 Anúncios: mesmas regras das publicações, mais exigências
- Os mesmos três formatos, com 1:1 e 4:5 recomendados.
- **Resolução mínima de 1080 px de largura** (publicação comum aceita menos e o servidor amplia).
- **Vídeo de anúncio de até 60 segundos** (recomendado de 15 a 30 s), com legenda obrigatória no texto do anúncio.
- **Pré-visualização obrigatória** no card do feed, celular e computador, antes de enviar para revisão.

### 2.4 Comentários
Imagens em comentários continuam sem recorte, em tamanho pequeno, abrindo inteiras ao tocar. Ficam fora deste padrão.

---

## 3. Como implementar

### 3.1 Constantes únicas (`packages/shared-types`)
`MEDIA_FORMATS` com os três formatos (proporção, largura e altura guardadas, nome em português) e `MEDIA_VARIANTS` (miniatura, feed, cheia).
- O site, o celular, a API e o futuro servidor de anúncios leem **dali**. Nenhum número espalhado pelo código.
- Testes garantem que as proporções e os tamanhos batem.

### 3.2 Banco de dados
- **Tabela nova `media_asset`** para publicações e criativos de anúncio, com:
  - dono e tipo de dono (post ou criativo);
  - tipo (foto ou vídeo) e formato;
  - largura e altura originais;
  - recorte escolhido (`crop_x`, `crop_y`, `crop_w`, `crop_h`, em frações de 0 a 1);
  - chaves de cada versão gerada;
  - duração, capa do vídeo e estado do processamento.
- `Post.media` continua existindo por compatibilidade, enquanto os clientes antigos do celular estiverem em uso.
- Relatos continuam em `report_media`, que ganha o campo `display_format` (a moldura mais próxima).
- Migration com campos em snake_case.

### 3.3 Servidor
- **Recorte feito no servidor:** o site e o celular mandam a foto ou o vídeo original **mais o retângulo escolhido**. O servidor corta e gera as versões. Vantagens: um resultado só para site e celular, nada de biblioteca nativa nova no celular e nenhum arquivo cortado de forma diferente em cada aparelho.
- **Foto:** `sharp`, com rotação da câmera, recorte, versões, sem metadados e proteção contra "imagem bomba" (já existe).
- **Vídeo:** filtro de recorte do `ffmpeg` dentro da fila que já existe (`media-processing`). Enquanto o vídeo processa, o site e o celular mostram o original enquadrado na moldura usando o retângulo guardado. A pessoa não vê diferença.
- **Validação:**
  - formato precisa ser um dos três;
  - retângulo dentro da imagem;
  - resolução mínima (mais alta para anúncio);
  - recusa com mensagem simples, por exemplo "Essa foto é pequena demais para anúncio. Use uma com pelo menos 1080 px de largura."
- **Upload direto ao bucket** (já existe para vídeo de relato) estendido a vídeos de publicações e anúncios, porque o Cloud Run recusa pedidos acima de 32 MB.

### 3.4 Exibição (site e celular iguais)
- Um componente de mídia por plataforma (`MediaFrame`) que recebe formato, largura e altura **da API**. A moldura aparece com o tamanho certo antes de a foto carregar: a tela não pula.
- `PostCard.tsx` e `media-carousel.tsx` passam a usar o formato guardado. O `ReportDetail` usa a moldura com fundo desfocado.
- Grade de várias fotos no site vira carrossel, igual ao celular.

### 3.5 Editor de recorte ao publicar
- **Site (`PostComposer.tsx`):** depois de escolher a foto ou o vídeo, abre o editor com os botões Quadrado, Retrato e Paisagem, arrastar e aproximar (mouse, toque e teclado, com rótulos de acessibilidade), e prévia de como fica no feed.
- **Celular (tela de nova publicação):** o mesmo editor com gestos. É só JavaScript, com o que já está instalado no app, e sai por `eas update`. Se precisar de biblioteca nativa nova, aviso antes, porque aí exige build no EAS.
- **Relato:** não tem editor de recorte (seção 2.2).
- **Textos** em português simples, no padrão do Votz.

### 3.6 Publicações antigas
Um job lê as fotos e vídeos já publicados, grava largura, altura e o formato mais próximo, **sem cortar nada**. Na tela, elas aparecem como os relatos: inteiras dentro da moldura, com fundo desfocado.

### 3.7 Testes
- Unitários: cálculo de recorte, escolha do formato mais próximo, validação, argumentos do `ffmpeg`.
- Integração: com MinIO e Postgres reais, como já foi feito no plano de mídia.
- Prova visual no site (navegador) e no celular, comparando a mesma publicação nos dois.

---

## 4. Ordem de trabalho

| Passo | Entrega | Pronto quando |
|---|---|---|
| 1 | Constantes, tabela `media_asset`, migration, API devolvendo formato e tamanho | Testes passam e a API devolve os dados novos sem quebrar clientes antigos |
| 2 | Recorte e versões no servidor (foto e vídeo), validação, upload direto de vídeo | Foto e vídeo recortados saem com o tamanho exato, provado contra o MinIO |
| 3 | `MediaFrame` no site e no celular; relatos com moldura e fundo desfocado | Mesma publicação idêntica no site e no celular; tela não pula |
| 4 | Editor de recorte no site e no celular | Publicar nos três formatos funciona de ponta a ponta |
| 5 | Job das publicações antigas | Todas as publicações têm formato e tamanho gravados |
| 6 | Criativos de anúncio usam o mesmo caminho (Etapa 1 dos anúncios) | Coberto pelo plano de anúncios |

---

## 5. O que não muda
- Capa (3:1) e foto de perfil (1:1).
- Redução, remoção de GPS e miniatura de relatos, que já existem.
- Cota e cifragem da mídia das conversas: o chat não entra neste padrão.

---

## 6. Decisões do dono do produto
1. **Três formatos para publicações e anúncios:** 1:1, 4:5 e 16:9.
2. **Relatos sem recorte,** com moldura padrão e fundo desfocado.
3. **Vídeo em pé (9:16) aparece em 4:5 no feed,** inteiro na tela cheia.
4. **Anúncio:** mínimo de 1080 px de largura e vídeo de até 60 s.

---

## 7. Andamento (21/11/2026)

**Feito (código e testes):**
- Passo 1: `packages/shared-types/src/media.ts` (formatos, contas de recorte, validação, itens antigos), tabela `media_assets` (migration `20261121120000_media_assets`, **ainda não aplicada**: o banco local estava desligado), `mediaItems` nas publicações (`PostDto`) e no detalhe do relato.
- Passo 2: módulo `apps/api/src/media` com envio (`POST /media/uploads`, envio direto de vídeo com `presign`/`complete`, `DELETE`), original privado em `media-src/` sem metadados, versões cheia/feed/miniatura da foto na hora de publicar, vídeo recortado na fila `media-render` (só aparece quando pronto), reserva contra clique duplo, limpeza de rascunhos (24 h), de envios diretos parados (2 h) e de originais de vídeo que falharam (7 dias).
- Passo 3: `MediaCarousel` no site (publicações e relatos; relato sem recorte, com fundo desfocado; PDF e áudio do relato listados à parte) e carrossel do celular usando a moldura da API.
- Passo 4: editor de formato e enquadramento no site (`MediaCropEditor`: arrastar, roda do mouse, controle deslizante, teclado) e no celular (`MediaCropSheet`: um dedo arrasta, dois dedos aproximam, botões + e −). No celular, publicação passa a aceitar vídeo, como no site. Só JavaScript: sai por `eas update`.
- Passo 5: `npm run media:backfill --workspace=apps/api` (aceita `--dry-run` e `--limit=N`) registra tamanho e moldura das publicações antigas, sem recortar.
- Testes: API 817 de 818 passam (a falha é a matriz de rotas do admin, anterior a esta mudança); celular 39 de 39; `tsc` da API, do site e do celular sem erros; build do site ok.

**Falta:**
- Aplicar a migration e provar o fluxo completo com Postgres, Redis e MinIO de verdade (enviar, enquadrar, publicar, vídeo processando → pronto), no navegador e no celular.
- Rodar o job das publicações antigas no banco de teste.
- A avocação (`AdvocateConfirmModal`, `createAdvocacyPost`) continua no envio antigo: as fotos aparecem inteiras na moldura mais próxima. Migrar quando for mexer nela.
- Em produção no Cloudflare R2 o bucket público expõe todas as chaves (não há regra por pasta como no MinIO): os originais em `media-src/` ficam protegidos só por terem nome aleatório e nunca saírem da API. Se isso não bastar, usar um bucket privado separado para `media-src/` (e para `verification/`, que já está na mesma situação).
