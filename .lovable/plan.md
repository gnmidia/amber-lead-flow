## Objetivo

Diagnosticar por que `/api/groups/fetch-groups` pode estar voltando vazio em produção, sem alterar comportamento de outras rotas.

---

## 1. `src/routes/api/groups/fetch-groups.ts` — logs temporários

Adicionar `console.log` com prefixo `[fetch-groups]` no handler GET para aparecerem nos worker logs:

- Config: `EVOLUTION_BASE_URL`, `EVOLUTION_INSTANCE_NAME`, e `apiKey.slice(0, 4) + "..."` (nunca a chave inteira). Flag booleana para cada um indicando se está definido.
- Após a chamada a `fetchInstances`: `res.status`, `res.ok`, e o corpo bruto (`await res.text()` — depois re-parseado via `JSON.parse` num try/catch para não quebrar o fluxo atual). Também logar o `myNumber` resolvido (ou `"(não resolvido)"`).
- Após `fetchAllGroups`: `res.status`, `res.ok` e os primeiros 500 chars do corpo bruto.
- Após o parse: `list.length` (total bruto vindo da Evolution).
- Após o filtro: `filtered.length` e quantos foram incluídos por serem comunidade vs admin normal.

Os logs são marcados como "temporários" via comentário `// TODO debug` para facilitar remoção depois.

## 2. Ajuste do filtro de admin (mesma rota)

No `.map(...)`, antes de calcular `iAmAdmin`:

- Se `g.isCommunity === true` **ou** `g.isCommunityAnnounce === true` → marcar `iAmAdmin = true` automaticamente (comunidades não expõem admin via `participants` da mesma forma).
- Caso contrário, manter a lógica atual: `myNumber ? admins.some(...) : true`.

Adicionar campo interno `_reason: "community" | "admin" | "fallback"` apenas para o log de contagem (removido antes do retorno, junto com `_iAmAdmin`).

Comportamento para grupos não-comunidade permanece idêntico.

## 3. `src/routes/grupos.tsx` — mostrar erro quando lista vazia

No bloco "Nenhum grupo encontrado" (Card vazio):

- Se `data?.error` (campo opcional já tipado em `GroupsResponse`) ou `error` (do `useQuery`) existir, renderizar abaixo do texto principal um `<p>` em `text-destructive` com a mensagem (`data.error` ou `(error as Error).message`).
- Adicionar também, em texto pequeno `text-muted-foreground`, o `data.total` retornado, para deixar claro se a API respondeu `0` ou se nem respondeu.

Nenhuma mudança no fluxo de busca, refetch ou modal.

---

## Arquivos afetados

- `src/routes/api/groups/fetch-groups.ts` (logs + filtro de comunidade)
- `src/routes/grupos.tsx` (mensagem de erro no estado vazio)

Nenhuma outra rota, tabela ou componente é tocado. O push para o GitHub acontece automaticamente após a aplicação do plano (sync bidirecional do Lovable).

## Próximo passo após aplicar

Você abre `/grupos` em produção, eu puxo os worker logs com `stack_modern--server-function-logs` filtrando por `[fetch-groups]` e respondo o diagnóstico.