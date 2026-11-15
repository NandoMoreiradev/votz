# Votz — Checklist de segurança antes de ir ao ar

Estado em 15/11/2026, depois dos briefs 3A, 3A.1 e 3B. O código está corrigido e testado (54 suítes, 297 testes). Os itens abaixo **dependem de configuração de produção** ou de decisão sua, e não estão no código.

## 1. Obrigatórios (o app quebra ou fica inseguro sem isto)

- [ ] **CSP do site aponta para a API real.** Em `render.yaml`, o `Content-Security-Policy` do `votz-web` traz `https://votz-api.onrender.com` e `wss://votz-api.onrender.com` como **valores de exemplo**. Se o domínio real da API for outro, o navegador bloqueia todas as chamadas e **o app abre sem dados**. Troque pelos domínios reais e confirme também o endereço do LiveKit (`*.livekit.cloud` é um palpite).
- [ ] **`FRONTEND_URL` idêntico à origem do site** (esquema + domínio + porta, sem caminho). O `OriginCsrfGuard` recusa `refresh`, `logout` e `logout-all` se a origem do navegador for diferente. Aceita vários separados por vírgula.
- [ ] **Segredos fortes e válidos.** `JWT_SECRET` com 32+ caracteres; `CPF_ENCRYPTION_KEY` com exatamente 64 caracteres hexadecimais. Em `NODE_ENV=production` a API **se recusa a iniciar** se estiverem fracos. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- [ ] **Remova `JWT_REFRESH_SECRET` do ambiente** (obsoleto desde o 3A; o refresh agora é um token aleatório no banco). Se mantiver, precisa ser diferente do `JWT_SECRET`.
- [ ] **Cifrar os segredos de MFA já existentes**, uma vez, no banco de produção, **depois do deploy**:
  ```bash
  npm run security:encrypt-mfa-secrets            # simula e mostra quantos ainda estão em texto puro
  npm run security:encrypt-mfa-secrets -- --apply # aplica
  ```
  Sem isso, os segredos antigos continuam em texto puro (o login com MFA funciona nos dois formatos).
- [ ] **Redis em produção.** O limite de requisições passa a ser compartilhado via `REDIS_URL`. Sem Redis ele cai para memória por instância (não derruba a API).
- [ ] **Chave da MapTiler restrita por domínio** no painel da MapTiler (a chave vai no front).

## 1b. Decisões de hospedagem ao configurar a produção

Detalhes e gatilhos em `docs/negocio/hospedagem-e-escala.md`.

- [ ] **Região do Render: Virginia, não Frankfurt** (o `render.yaml` atual é só rascunho). A região geralmente **não muda depois de criado o serviço**. API, Redis e banco na **mesma região**.
- [ ] **Cloudflare na frente** do site e da API (CDN, cache das listas públicas, WAF).
- [ ] **`Dockerfile` da API** (hoje não existe), para facilitar uma migração futura.
- [ ] Depois de definir região e fornecedores, **atualizar a Política de Privacidade** (hoje cita "Render, servidor em Frankfurt") e a `PRIVACY_VERSION`.

## 2. Infraestrutura (já listadas nas pendências legais)

- [ ] Regra de ciclo de vida do R2: expirar `exports/` em 7 dias.
- [ ] Retenção de backup do banco: 30 dias.
- [ ] Conferir o provedor SMTP real e a tabela de fornecedores da Política de Privacidade.

## 3. Dívida técnica de dependências (decisão separada)

`npm audit --omit=dev`: **23 vulnerabilidades (1 crítica, 9 altas, 13 moderadas)**, de 44. O que sobrou depende de saltos de versão maior:

| Pacote | Por que ainda está | Plano |
|---|---|---|
| `tar` (crítica), `@mapbox/node-pre-gyp` | Vêm do `bcrypt@5` (só no **install**, não em execução) | Atualizar para `bcrypt@6`, que não usa `node-pre-gyp`. Mudança pequena, mesmo uso |
| `@nestjs/*` v10 (`platform-express`, `swagger`, `config`...), `multer`, `body-parser`, `js-yaml`, `lodash` | Exigem NestJS 11 ou 12 | Projeto de atualização do NestJS, separado e com testes |
| `adm-zip` | Salto de versão maior | Usado só para ler zips do TSE (fonte oficial). Risco baixo, mas atualizar quando possível |
| `react-router` / `react-router-dom` | Salto para a v7 | Planejar junto com o front |

A política de exceções está em `docs/security/audit-allowlist.md` e o CI (`.github/workflows/ci.yml`) falha se aparecer vulnerabilidade alta ou crítica **nova**.

## 4. Verificar no navegador (ninguém testou na tela com o app completo)

- [ ] Mapa: abrir `/mapa`, clicar num pino (o popup agora é montado com `textContent`) e conferir que não há erro de CSP no console.
- [ ] Login com Google do começo ao fim (agora sem token na URL).
- [ ] Debate ao vivo (LiveKit) e comentário em áudio (microfone).
- [ ] Cadastro, login, recarregar a página 10 vezes seguidas sem ser deslogado, e abrir duas abas ao mesmo tempo.
- [ ] Fluxo de contratar um plano (com permissão e sem permissão na organização).
- [ ] Sinalizar um comentário e removê-lo pelo painel de moderação.

## 5. Processo

- [ ] Ler `docs/security/plano-de-incidentes.md` e confirmar o contato do encarregado.
- [ ] Rodar o CI uma vez (`Actions → CI → Run workflow`) para validar o pipeline no GitHub.
- [ ] Revisão por advogado dos textos legais (`docs/legal/pendencias-antes-de-publicar.md`).
