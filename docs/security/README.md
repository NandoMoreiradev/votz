# Segurança do Votz — ponto de entrada e retomada

> **Para que serve:** quando chegar a hora de fazer a auditoria completa rumo ao "nível A", comece **por este arquivo**. Ele diz onde paramos, como preparar o ambiente e por onde começar. O trabalho de verdade está nos outros documentos desta pasta.

## 1. Onde paramos (15/11/2026)

- **Último commit de segurança no GitHub:** `71ddf55` (`master`, repositório `NandoMoreiradev/votz`).
- **Verificação nesse ponto:** 57 suítes e 359 testes passando; tipagem da API e do front limpa; migrations aplicadas no banco local.
- **Ainda não foi feito:** teste manual no navegador do app completo, execução do CI no GitHub, configuração de produção, pentest e revisão do advogado.
- **Veredito honesto:** o código está bem mais seguro do que no começo, mas **não dá para declarar "nível A"**. Os critérios para isso estão na seção 1 do roteiro.

### Já corrigido (resumo)
Bypass de MFA, refresh token ineficaz (agora opaco, com família e detecção de reuso), vazamento de token nos logs, cobrança Stripe aberta a qualquer usuário, pré-sequestro de conta via Google, edição de roles entre organizações, escalada de moderador para ADMIN, `mediaKey`/URLs vindos do cliente, login CSRF no Google, guard global "negado por padrão", cabeçalhos do site, escape de HTML, segredos validados no boot, MFA cifrado.

## 2. Ordem de leitura

| # | Documento | Para quê |
|---|---|---|
| 1 | **`roteiro-auditoria-nivel-a.md`** | **A pauta da auditoria.** Critérios de saída, achados abertos (A0 a A6), método por rota, módulos ainda não revisados, testes a criar e as 8 rodadas |
| 2 | `checklist-antes-de-ir-ao-ar.md` | Configuração de produção que o código não faz sozinho (CSP com a API real, segredos, Redis, MapTiler...) |
| 3 | `auditoria-seguranca-2026-11.md` | A primeira auditoria: achados, evidências e a comparação com o maskot |
| 3b | **`relatorio-teste-ponta-a-ponta-2026-11-15.md`** | **Teste com a API e o front rodando (236 verificações) e achados B-1 a B-10.** Scripts em `qa-scripts/` |
| 4 | `plano-de-incidentes.md` | O que fazer em caso de vazamento (LGPD art. 48) |
| 5 | `audit-allowlist.md` | Vulnerabilidades de dependência aceitas, com justificativa |
| 6 | `fase-3a`, `3a1`, `3b`, `3c` | Os briefs já executados (histórico e modelo para os próximos) |

Os documentos legais ficam em `docs/legal/` (principalmente `pendencias-antes-de-publicar.md`). O material de marketing foi para `C:\Users\pc\WebstormProjects\VotzMarketing`.

## 3. Preparar o ambiente antes de começar

O ambiente local precisa de Docker. Na máquina de desenvolvimento, o Docker Desktop está em **`E:\Dev\Docker`** e **não inicia sozinho**.

```powershell
# 1. Iniciar o Docker Desktop
Start-Process "E:\Dev\Docker\Docker Desktop.exe"
# 2. Colocar o docker no PATH da sessão e subir Postgres, Redis e MinIO
$env:Path = "E:\Dev\Docker\resources\bin;" + $env:Path
cd C:\Users\pc\WebstormProjects\Votz
docker compose up -d
```

```bash
# 3. Dependências e banco
npm install
npm run db:generate
npm run db:migrate --workspace=packages/database   # aplica migrations pendentes

# 4. Linha de base: tudo isto precisa passar ANTES de qualquer mudança
npm run build --workspace=packages/shared-types
npx tsc --noEmit -p apps/api
npx tsc --noEmit -p apps/web
npm run test --workspace=apps/api
npm audit --omit=dev      # esperado hoje: 23 vulnerabilidades (1 crítica, 9 altas)
```

Se o Vite abrir com tela branca e erro de `export not found` de `@votz/shared-types`, apague `apps/web/node_modules/.vite` e reinicie.

## 5. Primeira sessão: por onde começar

1. Rodar a **linha de base** da seção 3 e anotar qualquer diferença do estado acima.
2. **Rodada 1** do roteiro (seção 18): matriz papel × rota para todos os controllers, mais conferir se A3 e A4 continuam corrigidos.
3. **Rodada 2:** revisão linha a linha de `admin`, `registration-requests`, `comments` e `debates`, aplicando as 9 perguntas do "Método" (seção 3 do roteiro) a **cada rota**.
4. Para cada achado: **provar por teste ou execução** sempre que possível; marcar no roteiro como "confirmado por leitura" ou "confirmado por execução".
5. Achados viram **briefs** (modelo: `fase-3c-brief-escalada-e-entradas.md`), enviados ao Gemini **um de cada vez**.
6. Cada relatório do Gemini é **revisado de forma independente** (ler o código e rodar a verificação), sem confiar só no relato.

### Texto pronto para colar quando retomarmos
```text
Vamos retomar a auditoria de segurança do Votz rumo ao nível A.
Leia docs/security/README.md e docs/security/roteiro-auditoria-nivel-a.md.
Comece pela linha de base (seção 3 do README) e depois pela rodada 1 do roteiro.
O Docker Desktop está em E:\Dev\Docker e precisa ser iniciado.
```

## 6. Lições do processo (para não repetir)

- **Rodar `npm run test --workspace=apps/api` antes de cada commit.** O commit `a7da5f3` removeu os `@Public()` e o `OriginCsrfGuard` do `AuthController` e quebraria login, cadastro, refresh e Google; o `route-auth-audit.spec.ts` já detectava isso, mas não foi executado. Isso também vale para commits gerados com ajuda de IA.
- **Auditar a adequação do papel, não só a presença do guard.** A escalada de moderador para admin (A0) escapou porque a primeira auditoria só checou se havia guard. A matriz papel × rota existe para pegar esse tipo de erro.
- **Não confiar em relato sem verificar.** Já aconteceu de eu afirmar que relato anônimo guardava o autor sem ler o código; era o contrário. Sempre ler o código e, quando possível, executar um teste.
- **Não criar vínculo usuário ↔ upload nem usuário ↔ relato anônimo.** Isso quebraria o anonimato estrutural. Vale para logs, tabelas de propriedade e auditoria.
- **Um brief por vez ao Gemini**, na ordem, porque vários alteram `auth.service.ts` e `schema.prisma`; em paralelo geram conflito de migration.
- **O Gemini nem sempre consegue subir o Docker** em sessão não interativa. Se a migration falhar por isso, é preciso criá-la com o Docker no ar.

## 7. Pendências que dependem de você (não são código)

- Decidir e configurar a **infraestrutura de produção** (hoje ela não existe): banco, R2 (com bucket público e privado separados), Redis, SMTP, domínio próprio para web e API.
- **Revisão do advogado** nos textos legais.
- **Contratar o pentest externo**, só depois de fechar os achados A0 a A6 e o checklist de ida ao ar.
- Definir o **e-mail institucional** do encarregado (hoje é o seu, provisório), em `apps/web/src/legal/types.ts`.
