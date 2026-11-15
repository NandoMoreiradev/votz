# Votz — Brief 3A.1: refresh token sem logout aleatório (concorrência)

> **Para quem vai executar (Gemini):** brief curto e autocontido. **Não faça commit.** Ao terminar, devolva: arquivos alterados, comandos rodados e resultado dos testes. Regras do projeto no `CLAUDE.md` da raiz (teste unitário Jest para todo Service alterado, TanStack Query no front, sem fetch direto em componente quando houver alternativa).
>
> **Execute depois do 3A e antes do 3B** (o 3B T3 faz o callback do Google depender do `POST /auth/refresh`).
>
> **Contexto:** no 3A, `AuthService.refresh` passou a tratar **qualquer** reuso de refresh token como roubo e **revogar a família inteira** (correto contra roubo). Mas, sem tolerância, **duas chamadas simultâneas de refresh com o mesmo cookie deslogam o usuário**.

## O problema (confirmado por leitura de código)

1. `apps/web/src/App.tsx` restaura a sessão chamando `axios.post('/auth/refresh')` **direto**, fora do interceptor.
2. `apps/web/src/lib/api.ts` tem outro refresh no interceptor de 401, com fila própria (`isRefreshing`). As duas rotas **não se enxergam**: se algum componente fizer uma requisição sem token enquanto o `App.tsx` ainda restaura a sessão, os dois refreshes saem **juntos, com o mesmo cookie**.
3. `apps/web/src/main.tsx` usa `React.StrictMode`: em **desenvolvimento** o efeito de restauração de sessão roda **duas vezes**, então são duas chamadas simultâneas a cada carregamento de página.
4. Também ocorre com **duas abas** abrindo ao mesmo tempo.
5. No servidor, uma das chamadas rotaciona o token e a outra encontra o token **já usado** (ou perde a corrida no `updateMany` com `claim.count !== 1`) e **revoga a família**. Resultado: o usuário cai para a tela de login sem ter feito nada.

Os testes do 3A não pegam isso, porque simulam um fluxo sequencial.

## T1 — Servidor: tolerância curta ao reuso (o padrão "reuse interval")

Em `AuthService.refresh`:
- Defina `REFRESH_REUSE_LEEWAY_MS = 10_000` (constante nomeada, com comentário do motivo).
- Se o token **já foi usado** (`usedAt` preenchido) **há menos de 10 s**: **não revogue a família**. Trate como corrida legítima: emita um **novo refresh token na mesma família** (e um novo access token), **sem** marcar de novo o token antigo como usado e **sem** alterar o `usedAt` original.
- Se o token foi usado **há mais de 10 s**: mantenha o comportamento atual (**revoga a família inteira** e responde 401).
- O caminho em que `claim.count !== 1` (perdeu a corrida dentro da transação) deve aplicar a **mesma regra**: reler o token e, se `usedAt` estiver dentro da janela, emitir token na mesma família em vez de revogar.
- Registre no log (nível `warn`, **sem** dados do token) quando a tolerância for usada.

**Aceite (testes em `auth.service.spec.ts`):**
- Dois `refresh` **disparados com `Promise.all`** com o mesmo token: **ambos** retornam sucesso e a família **continua válida** (nenhum `revokedAt`).
- Reuso **depois** da janela (use `jest.useFakeTimers` ou injete o relógio): revoga a família e retorna 401.
- Token inexistente, revogado ou expirado continua 401 sem tolerância.
- Usuário banido continua sem refresh, mesmo dentro da janela.

## T2 — Front: um único refresh em andamento (single-flight)

Em `apps/web/src/lib/api.ts`:
- Exporte uma função `refreshSession(): Promise<string>` que mantém **uma única promessa em andamento** (variável de módulo). Chamadas concorrentes **recebem a mesma promessa**. Ela chama `POST /auth/refresh` (com `withCredentials`), faz `setToken(accessToken)` e retorna o token. Ao terminar (sucesso ou erro), libera a promessa.
- O interceptor de 401 passa a usar `refreshSession()` (remova `isRefreshing`, `queue` e `drainQueue`, que viram desnecessários). Em erro: `setToken(null)` e o evento `votz:logout`, como hoje.
- `App.tsx` passa a usar `refreshSession()` na restauração de sessão, no lugar do `axios.post` direto. O restante do fluxo (buscar `/auth/me`, contexto salvo) não muda.
- Procure outros pontos que chamem `/auth/refresh` diretamente (`grep -rn "auth/refresh" apps/web/src`) e troque também.

**Aceite:**
- Com `React.StrictMode`, abrir a página em desenvolvimento gera **uma única** requisição `POST /auth/refresh` (confira na aba Network ou com um teste que conte as chamadas ao mock do axios).
- Teste unitário de `refreshSession`: duas chamadas simultâneas → **uma** requisição HTTP e ambas resolvem com o mesmo token; depois de concluir, uma nova chamada dispara outra requisição.
- Recarregar a página 10 vezes seguidas **não** desloga o usuário (teste manual).

## T3 — Pequenos ajustes encontrados na revisão do 3A

1. `OrgMembershipsController` (`updateRole`/`deleteRole`) e o `OrgPermissionGuard` recebem `orgType` da URL **sem validar o enum**: um valor inválido pode virar erro 500 do Prisma. Valide com `ParseEnumPipe(OrgType)` nos parâmetros dessas rotas (e nas demais rotas com `:orgType`).
2. `AdminFlagsController.resolveFlag` (`PATCH /admin/flags/:id/resolve`): use `ParseUUIDPipe` no `:id` (`ContentFlag.id` é UUID).

**Aceite:** requisição com `orgType` inválido → 400; `flags/não-é-uuid/resolve` → 400.

## Verificação final (rodar e reportar)

```bash
npx tsc --noEmit -p apps/api
npx tsc --noEmit -p apps/web
npm run test --workspace=apps/api
npm run build --workspace=apps/web
```
Reporte explicitamente: (1) o teste com `Promise.all` e o resultado; (2) quantas requisições `POST /auth/refresh` saem ao abrir a página em modo desenvolvimento.
