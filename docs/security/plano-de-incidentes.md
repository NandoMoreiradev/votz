# Plano de Resposta a Incidentes de Segurança — Votz (LGPD Art. 48)

Versão: 1.0 · Vigência imediata · Aplicação: API (`apps/api`), Web (`apps/web`), Banco de Dados (`packages/database`), Infraestrutura Render / Cloudflare R2 / LiveKit / Redis.

---

## 1. Contatos e Governança

| Papel | Responsável | Contato |
| --- | --- | --- |
| Encarregado pelo Tratamento de Dados Pessoais (DPO) | Votz do Brasil (CNPJ `55.188.948/0001-04`) | `fernandomoreira.dev@gmail.com` |
| Liderança Técnica / Contenção | Equipe de Engenharia Backend / DevOps | Painel Render (`votz-api` / `votz-web`) |
| Autoridade Nacional | ANPD (Autoridade Nacional de Proteção de Dados) | Portal Super.BR / Peticionamento Eletrônico (Resolução CD/ANPD nº 15/2024) |

---

## 2. Fases de Resposta

### Fase 1 — Detecção e Triagem (0 a 30 minutos)
Fontes de sinal no Votz:
- Logs de acesso e segurança em banco (`AccessLog`: `LOGIN`, `MFA_LOGIN`, `GOOGLE_LOGIN`, bloqueios `lockedUntil` / `mfaLockedUntil`, alterações de contexto organizacional).
- Logs estruturados da API no Render (`ThrottlerGuard`, erros 401/403 anômalos, falhas de assinatura Stripe ou CSP).
- Relatos recebidos no canal do DPO (`fernandomoreira.dev@gmail.com`) ou denúncias administrativas (`ModerationAction`).

Ações iniciais:
1. Registrar horário UTC/Brasília de **ocorrência estimada** e **detecção** (`t0`).
2. Preservar evidências antes de reiniciar contêineres (exportar logs do Render/Postgres sem sobrescrever registros).
3. Classificar escopo preliminar: dados cadastrais (`User.email`, `phone`, `zipCode`), dados sensíveis/cifrados (`User.cpf`, `User.mfaSecret`), credenciais (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `CPF_ENCRYPTION_KEY`, `ApiKey`), ou indisponibilidade/fraude (`StripeEvent`, debates LiveKit).

### Fase 2 — Contenção Imediata (Meta: até 1 hora)
Executar apenas o necessário ao escopo identificado:
1. **Comprometimento de contas específicas**:
   - Banir/suspender via endpoint administrativo (`PATCH /admin/users/:id/ban`), que revoga automaticamente todos os `RefreshToken` ativos e desconecta WebSockets em tempo real via `SocketSessionRegistry.disconnectUser`.
   - Orientar usuário a acionar `POST /auth/logout-all` e refazer configuração MFA.
2. **Comprometimento de chaves de API pública (`ApiKey`)**:
   - Revogar imediatamente na tabela `api_keys` (`revokedAt = NOW()` ou via painel admin).
3. **Vazamento suspeito ou confirmado de `JWT_SECRET` / `JWT_REFRESH_SECRET`**:
   - Gerar novos segredos (`openssl rand -hex 32`) no painel Render (`votz-api`).
   - Revogar todos os refresh tokens ativos no PostgreSQL (`UPDATE refresh_tokens SET revoked_at = NOW() WHERE revoked_at IS NULL;`).
   - Reiniciar `votz-api` (o boot valida comprimento e distinção dos segredos via `validateEnv`).
4. **Vazamento suspeito de `CPF_ENCRYPTION_KEY`**:
   - Rotacionar `CPF_ENCRYPTION_KEY` (`openssl rand -hex 32`) com recifragem controlada de `User.cpf` e `User.mfaSecret` (utilizando formato versionado `v1:` via `CryptoService` e script `npm run security:encrypt-mfa-secrets`).
5. **Tráfego abusivo / exploração de endpoint**:
   - Verificar limites no `RedisThrottlerStorage` e aplicar bloqueio na camada CDN/WAF do Render ou Cloudflare.

### Fase 3 — Avaliação de Risco e Impacto aos Titulares (até 24 horas)
Avaliar se o incidente gera risco ou dano relevante aos titulares (LGPD art. 48 e Resolução CD/ANPD nº 15/2024):
- Quais categorias foram expostas? Dados cadastrais comuns, `CPF` cifrado com chave íntegra vs. chave exposta, credenciais/MFA (`mfaSecret`, backup codes), documentos em `RegistrationRequest` no R2.
- Quantidade aproximada de titulares afetados (`CITIZEN`, `ENTITY`, `POLITICIAN`, `COMPANY`).
- Probabilidade de uso indevido (ex.: se dados estavam cifrados com AES-256-GCM e `CPF_ENCRYPTION_KEY` permaneceu íntegra, documentar mitigação técnica).

### Fase 4 — Comunicação à ANPD e aos Titulares (Prazo legal: até 3 dias úteis)
Conforme **art. 48 da LGPD** e **Resolução CD/ANPD nº 15/2024**:
- **Prazo máximo**: **3 (três) dias úteis** contados do conhecimento do incidente pelo controlador, quando houver risco ou dano relevante aos titulares (e prazo adicional para complementação quando aplicável).
- **Destinatários**:
  1. **ANPD** (via portal oficial).
  2. **Titulares afetados** (por e-mail institucional via `MailService` em linguagem clara e acessível).
- Usar obrigatoriamente o **Modelo de Notificação** na Seção 4 abaixo.

### Fase 5 — Preservação de Logs e Pós-Incidente (Guarda mínima: 5 anos)
- Manter registro completo do incidente, linha do tempo, evidências técnicas, comunicações enviadas à ANPD/titulares e medidas corretivas por no mínimo **5 (cinco) anos**.
- Conduzir revisão pós-incidente em até 7 dias: identificar causa raiz, adicionar teste de regressão automatizado (`apps/api`), atualizar `audit-allowlist.md` ou regras de segurança se aplicável.

---

## 3. Checklist Operacional de Incidente

- [ ] Horário de detecção (`t0`) e responsável pela coordenação registrados
- [ ] Evidências preservadas (`AccessLog`, logs Render, registros `RefreshToken`, payloads anômalos)
- [ ] Contenção aplicada em < 1h (sessões/`RefreshToken` revogados, WebSockets desconectados, segredos ou `ApiKey` rotacionados se necessário)
- [ ] Escopo e número de titulares afetados levantados (dados cifrados vs. em texto claro verificados)
- [ ] Parecer do DPO (`fernandomoreira.dev@gmail.com`) sobre risco ou dano relevante documentado
- [ ] Comunicação enviada à ANPD em até **3 dias úteis** (se aplicável conforme LGPD art. 48)
- [ ] Comunicação enviada aos titulares afetados em até **3 dias úteis** com orientações práticas
- [ ] Correção implantada em produção com teste de regressão no CI
- [ ] Pós-incidente encerrado e arquivado por pelo menos 5 anos

---

## 4. Modelo de Notificação aos Titulares e à ANPD

```text
Assunto: [Votz] Comunicação de Incidente de Segurança envolvendo Dados Pessoais

Data/Hora do conhecimento do incidente: [DD/MM/AAAA HH:MM BRT]
Controlador: Votz do Brasil (CNPJ 55.188.948/0001-04)
Encarregado (DPO): fernandomoreira.dev@gmail.com

1. Descrição da natureza do incidente e dos dados afetados:
   [Descrever o evento de forma clara e objetiva, indicando categorias de dados envolvidas
   e se os dados sensíveis/identificadores encontravam-se cifrados.]

2. Categorias e estimativa de titulares afetados:
   [Ex.: N cidadãos / representantes de organizações.]

3. Medidas técnicas e administrativas de segurança já adotadas:
   - Contenção aplicada em [DD/MM/AAAA HH:MM BRT];
   - Revogação de sessões / rotação de credenciais / correção implantada: [detalhar];
   - Preservação de registros e investigação contínua.

4. Riscos prováveis e recomendações aos titulares:
   - Recomenda-se alterar a senha caso reutilizada em outros serviços e ativar/revisar
     a autenticação em duas etapas (MFA) na conta Votz.
   - Desconfiar de contatos não solicitados que solicitem códigos ou pagamentos.

5. Canal de atendimento do Encarregado (DPO):
   Dúvidas ou solicitações podem ser encaminhadas diretamente para: fernandomoreira.dev@gmail.com.
```
