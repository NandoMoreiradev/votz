# Brief 4H — Organização ativa ao recarregar (G5 liberado) e ajustes pequenos

> Para o Gemini. Origem: pendências do 4G (`docs/dados/ressalvas-e-pendencias-fases-3d-a-4b.md`, seção "4G"). **O dono do produto liberou o G5.** Não altere nada fora destes itens; dúvida → reporte em "Divergências".
> Para testar na tela: `docs/dev/README-dados-de-teste.md` (contas `demo.*@votz.test`; código MFA com `node docs/dev/mfa.mjs <conta>`). Conta principal: `demo.prefeitura@votz.test` (plano Integração).

## H1 — Lembrar a organização ativa ao recarregar a página (era o G5)

**Problema.** Ao entrar como uma organização (Prefeitura, político), o token institucional e o contexto (`ctx`) vivem **só em memória** (decisão de segurança, **mantida**). Ao recarregar (F5) ou abrir a URL de novo, o site restaura apenas a sessão pessoal (`/auth/refresh` + `/auth/me`) e a pessoa cai no perfil pessoal, tendo de repetir "Trocar perfil" + MFA.

**Regras que NÃO mudam (verifique e cite no relatório):**
- O token institucional **nunca** vai para `localStorage`, `sessionStorage`, cookie ou URL.
- Nenhuma permissão, papel nem token é persistido. Continua exigindo **código MFA** para entrar no perfil institucional (`switch-context` com `mfaCode`).
- O servidor continua revalidando a associação ativa no banco a cada ação (`requireActingOrg`); esta tarefa é **só do front**.

**Fazer:**
1. Ao confirmar a troca para uma organização, gravar em `sessionStorage` **apenas** `{ type, id, returnTo }` (tipo `entity`/`politician`/`company`, id da organização e a rota atual). Chave única, por exemplo `votz.lastOrgContext`. Sempre com `try/catch` (o armazenamento pode falhar).
2. Ao restaurar a sessão pessoal depois de um recarregamento, se existir esse registro **e** o usuário autenticado for o mesmo que o gravou (gravar também o `userId`), abrir automaticamente a janela **"Confirme sua identidade"** já apontando para aquela organização. Ao confirmar o código, restaurar o contexto institucional e **navegar para `returnTo`** (ex.: `/painel-dados`). Validar `returnTo` como **caminho interno** (começa com `/`, sem `//` nem esquema), senão ir para `/`.
3. **Cancelar/fechar a janela** mantém o perfil pessoal e **apaga** o registro (não insistir a cada navegação).
4. **Limpar o registro** ao: sair (logout e "sair de todos"), trocar de conta, voltar manualmente ao perfil pessoal, receber `401` na restauração e quando a organização deixar de existir na lista de perfis do usuário (`/auth/my-profiles`).
5. Se o registro apontar para organização que o usuário **não tem mais** (removido/suspenso), não abrir a janela e limpar.
6. Não abrir a janela em rotas públicas sensíveis (`/entrar`, `/cadastro`, páginas legais) nem enquanto o login estiver em andamento. Só depois de a sessão pessoal estar restaurada.
7. Acessibilidade: a janela com foco no campo do código, `aria-modal`, Esc fecha (cancela).
8. Testes de componente/integração (web): (a) recarregar em `/painel-dados` como organização → janela abre → código correto → volta ao painel com `ctx` da organização; (b) cancelar → perfil pessoal e registro apagado; (c) logout apaga o registro; (d) outro usuário na mesma aba não herda o registro; (e) `returnTo` malicioso (`//evil.com`, `https://x`, `javascript:`) vira `/`; (f) nada de token em `sessionStorage`/`localStorage` (inspecionar o conteúdo).

## H2 — Status em português na fila de prazos (4G-1)

`apps/web/src/pages/EntidadePrazos.tsx` (~linha 709) mostra "Status: OPEN", "IN_PROGRESS". Usar o **mapa de rótulos de status já existente** no produto (o mesmo que o restante do site usa; se hoje estiver duplicado, **extrair para um único módulo** compartilhado, sem criar outra tabela). Revisar também as outras telas novas (Prazos, Painel, Mandato) por enums crus em inglês e corrigir os que aparecerem; listar no relatório o que encontrou.

## H3 — Cartão "1ª resposta" quebrando o "d" (4G-2)

No painel (`PainelDados.tsx`), o valor "1,5 d / 5,4 d" quebra o "d" final para a linha de baixo em 1440 px. Ajustar para **não quebrar dentro do valor** (`white-space: nowrap` no par, ou reduzir o espaço/fonte com `clamp`, ou permitir quebra apenas entre os dois valores). Conferir em 1440, 1280, 1100 e 375 px sem estourar o cartão.

## H4 — Medição de rolagem lateral (4G-3)

No relatório anterior a medição não foi feita. Medir **com JavaScript na página** (`document.documentElement.scrollWidth` e `clientWidth`) nas telas `/painel-dados`, `/entidade/prazos`, `/planos` e `/` em 375, 768, 1024, 1280, 1440 px, com a conta `demo.prefeitura` no perfil da organização. Registrar a tabela (largura, `scrollWidth`, `clientWidth`). Se a ferramenta de navegador pedir permissão e expirar, **diga isso** e faça a medição de outra forma (por exemplo, um script de desenvolvimento com Playwright/Puppeteer **sem adicioná-lo ao `package.json` do projeto**).

## H5 — Ver e descrever a aba de Reincidência

O relatório do 4G descreveu a aba, mas não consegui confirmar. Abra `demo.prefeitura` → Painel de dados → **Reincidência** (período 90 dias) e descreva: linhas, rótulo de área (sem código de célula), intervalo médio e o aviso de células suprimidas. Se a tabela estiver vazia, investigue e corrija a causa.

## Verificação visual obrigatória

Para H1: grave a sequência (entrar → trocar para a Prefeitura → ir para `/painel-dados` → **recarregar** → janela de confirmação → código → volta ao painel) e **descreva o que viu em cada passo**, incluindo o que acontece ao cancelar. Para H2–H5: parágrafo com o que viu antes e depois. "Testes passaram" não basta.

## Pronto quando

`tsc` da API e do web limpos; suítes verdes (informar o número); `npm run build` ok; descrições H1–H5; confirmação de que **nenhum token** foi persistido. **Não commitar.**

## Fora do escopo

Mudanças no servidor ou na autenticação, "lembrar-me" entre sessões do navegador (só `sessionStorage`, que some ao fechar a aba), Asaas (4E), novos recursos de plano.
