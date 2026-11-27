# Ciclo de vida do relato nível A (avocar, andamento, resolver, contestar)

## Como retomar

**Estado em 27/11/2026:** implementado na branch `claude/project-thread-ghu9pi` (API, site e app), com pull request aberto para o dono revisar. Nada foi para produção.

**O que foi verificado**
- API: `tsc` limpo; Jest completo passando depois de juntar com o `master` de 27/11 (2028 testes), menos 3 de vídeo que dependem do ffmpeg da máquina. 57 testes novos do ciclo (`report-lifecycle/*.spec.ts`): transições, permissões, prova ao resolver, motivo ao arquivar, 409 em tela velha, avocação de terceiro sem mexer em status, território, desistência, contestação (autor, "Eu também", 30 dias, uma por resolução, anônimo sem nome), decisão da moderação, confirmação do autor, fila de contestações, Mandatômetro e aviso de prazo vencido.
- Migração aplicada num Postgres 16 local com dados de teste: o backfill das avocações a partir da linha do tempo deu o resultado esperado.
- Site: `tsc` limpo e `vite build` ok.
- App: `tsc --noEmit` e `expo lint` limpos nos arquivos mexidos.

**O que NÃO foi verificado**
- Nenhuma tela foi aberta no navegador ou no celular (sem API e banco rodando com dados reais nesta sessão).
- A migração não rodou no banco de produção (Neon). Ela tem backfill: rodar `prisma migrate deploy` antes de subir a API nova.
- Avisos (push e sino) dos tipos novos não foram vistos chegando.

**Próximo passo:** revisar o PR, aplicar a migração num banco de teste com cópia dos dados reais, abrir a página de um relato como cidadão, como destinatário (com 2FA) e como político de fora, e testar a aba "Contestações" no `/admin`. App: só JavaScript, sai com `eas update`.

**Decisões que só o dono muda** (tomadas pela recomendação da auditoria, aprovadas em 27/11)
- Deputado e senador avocam no estado; vereador e prefeito só na cidade; entidade no estado dela.
- Avocação de terceiro não muda status, não conta como primeira resposta e não alivia a pressão sobre quem recebeu.
- Arquivar exige motivo de uma lista fechada e pode ser contestado.
- Contestação: autor ou quem marcou "Eu também", até 30 dias depois de resolver ou arquivar, uma vez por resolução.
- Resolver exige prova (foto ou documento) ou marcar "sem foto ou documento" com explicação de 30 letras; a confirmação do cidadão é opcional e pesa no Mandatômetro.
- Na Memória pública aparece a instituição, nunca a pessoa da equipe.
- Exclusão de relato pelo admin ficou como estava (pode ser obrigação legal).
- Empresas ficaram de fora.

**Arquivos principais**
- `apps/api/src/report-lifecycle/` (serviço único, efeitos, Mandatômetro, prazo de avocação)
- `packages/shared-types/src/report-lifecycle.ts` (regras usadas pelas três pontas)
- `packages/database/prisma/migrations/20261127200000_report_lifecycle_level_a/`
- Site: `apps/web/src/components/report-lifecycle/`, `pages/ReportDetail.tsx`, `pages/MandatoPortal.tsx`
- App: `apps/mobile/src/components/report-lifecycle.tsx`, `components/report-timeline.tsx`

## Como funciona agora

Toda ação sobre um relato passa por `ReportLifecycleService`, venha da página do relato, do Portal do Mandato ou do app. Cada ação grava o relato e o evento da Memória na mesma transação, com o status atual como condição: quem age sobre uma tela velha recebe 409 ("O relato mudou enquanto você respondia"). Avisos, webhooks, pressão, prazo de resposta e Mandatômetro rodam depois, sem desfazer a ação se falharem; o Mandatômetro é recalculado por fila (BullMQ).

| De | Para (só quem recebeu o relato) |
|---|---|
| Aberto | Em análise, Em andamento, Resolvido, Arquivado |
| Em análise | Em andamento, Resolvido, Arquivado |
| Em andamento | Resolvido, Arquivado |
| Resolvido ou Arquivado | nada (só volta a andar por contestação) |
| Contestado | nada (a moderação decide: reabrir ou manter) |

- **Avocar** grava um registro em `report_advocacies` (um por relato e instituição), com prazo prometido opcional (7 a 90 dias) e passa a acompanhar o relato. Quem recebeu e avoca um relato aberto o coloca em andamento. Desistir é público, com motivo.
- **Publicar atualização**: quem recebeu (vira "resposta oficial") ou quem tem avocação ativa.
- **Contestar** muda para Contestado e avisa a moderação; a aba "Contestações" do `/admin` mostra resolução, contestação e respostas lado a lado.
- **Mandatômetro** separa o que o político recebeu do que ele assumiu (cumpridos, em acompanhamento, prazo vencido, desistências e abandonados no fim do mandato) e conta contestações aceitas pela moderação (acima de 25% tira o selo de confiança).
- **Pressão** zera em relato encerrado; "dias sem resposta" só param quando quem recebeu responde.
- **Avisos novos**: relato avocado, resolvido/arquivado (confirme ou conteste), contestação para a moderação, decisão da contestação e prazo de avocação vencido (verificado de hora em hora).

Relatório da auditoria que originou o trabalho: Claude Doc "Auditoria do ciclo de vida do relato" (https://claude.ai/artifact/Y4WV3tpQCNhV26ZzS37Ctz).
