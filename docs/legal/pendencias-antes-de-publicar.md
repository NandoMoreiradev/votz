# Pendências antes de abrir o Votz ao público

Os textos legais (Termos, Privacidade, Cookies, Diretrizes) estão em `apps/web/src/legal/` e são renderizados por `apps/web/src/components/legal/LegalDocument.tsx`. Eles descrevem o que o Votz **deve** fazer. Os itens abaixo ainda **não existem no código** ou dependem de confirmação. Para cada um: ou implementar, ou ajustar o texto.

> Regra de manutenção: ao editar o conteúdo de um documento depois do lançamento, altere `TERMS_VERSION` (Termos/Diretrizes) ou `PRIVACY_VERSION` (Privacidade/Cookies) em `packages/shared-types/src/legal.ts` e rode `npm run build --workspace=packages/shared-types`. Isso faz o `ConsentGate` pedir novo aceite.

> **Briefs prontos para o Gemini:**
> - [`fase-2b-brief-logs-e-retencao.md`](fase-2b-brief-logs-e-retencao.md) cobre os itens 1 a 4 (logs de acesso e retenção automática).
> - [`fase-2c-brief-moderacao.md`](fase-2c-brief-moderacao.md) cobre os itens 6 e 7 (aviso ao autor e botão de sinalizar) e corrige a remoção de relatos.
> - Itens 5 e 9 e a seção 2 dependem de você (painel do Neon, processo interno, SMTP, e-mail institucional).

## 1. O texto promete e o código ainda não faz

| # | Promessa no texto | Onde | Situação hoje | O que fazer |
|---|---|---|---|---|
| 1 | Guardar registros de acesso (data, hora, IP) por **6 meses** | Privacidade §3 e §7 | Não há registro de IP na aplicação | Implementar o log (e a retenção de 6 meses) ou remover as duas linhas. É obrigação do Marco Civil, art. 15, para provedor de aplicação |
| 2 | Documentos de verificação apagados em **30 dias** (recusados) ou **12 meses** (aprovados) | Privacidade §7 | Ficam no R2 sem prazo | Job BullMQ de limpeza |
| 3 | Conta sem acesso por **24 meses** pode ser anonimizada, com aviso por e-mail | Privacidade §7 | Não existe | Job BullMQ (texto diz "podemos", então não é obrigatório, mas convém fazer) |
| 4 | Arquivo de exportação LGPD apagado em até **7 dias** | Privacidade §7 | Só o link expira (24 h) | Regra de ciclo de vida do R2 no prefixo `exports/` |
| 5 | Backups por até **30 dias** | Privacidade §7 | A confirmar | Conferir a retenção do backup no Neon |
| 6 | Avisar o motivo quando remover/banir | Termos §moderação, Diretrizes | `AdminService.banUser` e `deleteReport` não enviam aviso | Enviar e-mail ao autor na remoção/banimento |
| 7 | Denúncia de conteúdo | Diretrizes | Só por e-mail; não há botão | Criar botão "Denunciar" em relato e comentário (módulo de moderação) |
| 8 | ~~Relato anônimo não aparece para entidades e políticos~~ | Termos §anonimato, Privacidade §4 | **Resolvido por construção:** relato anônimo grava `authorId = null`, então não há autor para vazar em nenhuma consulta | Nada. Cuidado com o item 1: o log de acesso **não pode** ligar usuário a criação de relato |
| 9 | Responder pedidos de titulares em **15 dias** | Privacidade §8 | Processo interno | Definir quem atende e onde registrar |

## 2. Confirmar e completar

- **Provedor SMTP em produção:** a tabela de suboperadores diz "a definir". Informe o provedor real (o `.env.example` sugere Gmail).
- **Regiões:** Neon, Redis e LiveKit estão como "Exterior". Se souber a região de cada um, detalhe.
- **E-mail institucional:** o contato do encarregado é o e-mail pessoal provisório (`LEGAL_ENTITY.email` em `apps/web/src/legal/types.ts`). Crie um endereço do domínio (ex.: `privacidade@…`) e troque em um lugar só.
- **Encarregado (DPO):** designar formalmente uma pessoa e divulgar o nome, conforme a ANPD.
- **MapTiler:** restringir a chave por domínio.
- **Documentos que ainda faltam (Fase 3):** Termos de Contratação de Planos e Termos da API Pública. Os Termos de Uso já apontam para eles.

## 3. Pontos para o advogado revisar

1. Cláusula de **foro** (Aracaju/SE com ressalva do domicílio do consumidor).
2. **Limitação de responsabilidade** e a posição do Votz como provedor de aplicação (Marco Civil, arts. 18, 19 e 21).
3. Texto sobre **relato anônimo** e a obrigação de informar dados à autoridade.
4. **Bases legais** da tabela de finalidades, em especial a Memória pública e o tratamento de dados de políticos.
5. Texto da **transferência internacional** (LGPD, art. 33) e a necessidade de cláusulas contratuais com os suboperadores.
6. Risco de **difamação** e as regras sobre acusação de crime nas Diretrizes.
7. **Votz Score** e **Mandatômetro**: o aviso de que não são avaliação oficial.
8. **CPF de políticos** guardado no banco (princípio da minimização).
