## Diagnóstico

A sincronização "termina com sucesso" mas as mensagens continuam antigas porque **o frontend não envia o `operation_id` para o endpoint `/api/public/sync-chats`**.

### Fluxo atual (bugado)

1. `src/routes/chat-oficial.tsx` (linha 245) faz:
   ```ts
   fetch("/api/public/sync-chats", { method: "POST" })
   ```
   — sem body, sem `operation_id`.

2. `src/routes/api/public/sync-chats.ts` lê `body?.operation_id` → `null`.

3. O endpoint até resolve a instância via fallback `EVOLUTION_INSTANCE_NAME=DashWhats` e busca os chats na Evolution normalmente.

4. **Mas dentro do loop de chats existe esta verificação (linhas 67-70):**
   ```ts
   if (!operationId) {
     console.warn("[sync-chats] missing operation_id; skipping chat");
     continue;
   }
   ```
   → **todos os chats são pulados**, nenhum lead/mensagem é inserido.

5. O loop finaliza com `synced` contando apenas chats processados (também 0, mas o toast mostra "Sincronizados 0 chats" como sucesso, dando a falsa impressão de conclusão).

Isso explica perfeitamente o sintoma: status "concluído" + nenhuma mensagem nova.

### Causa raiz

Na etapa de isolamento multi-operação, o backend passou a exigir `operation_id` no payload, mas o frontend (`chat-oficial.tsx`) não foi atualizado para enviá-lo.

---

## Correção proposta

### 1. Enviar `operation_id` no `handleSync`

Em `src/routes/chat-oficial.tsx`:

- Importar `useOperation` de `@/contexts/OperationContext` (verificar se já está importado em outro ponto do arquivo).
- Pegar `currentOperationId` no componente.
- Atualizar o `fetch`:
  ```ts
  const res = await fetch("/api/public/sync-chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation_id: currentOperationId }),
  });
  ```
- Bloquear o clique (ou exibir toast de erro) se `currentOperationId` estiver vazio, evitando reincidência silenciosa.

### 2. Tornar o endpoint mais defensivo

Em `src/routes/api/public/sync-chats.ts`:

- Se `operation_id` não vier no body, retornar **HTTP 400** com mensagem clara (`"operation_id é obrigatório"`) em vez de retornar 200 com `synced: 0`. Isso previne falsos "sucessos" silenciosos no futuro (ex.: outras telas que venham a chamar o endpoint).

### 3. Auditar outros chamadores

Verificar se há outras chamadas para `/api/public/sync-chats` no projeto (por ex. botões em outras rotas) e garantir que todas enviam `operation_id`. Pelo grep inicial, só `chat-oficial.tsx` chama esse endpoint.

---

## Critérios de validação

- Após a correção, clicar em "Sincronizar conversas" deve:
  - Enviar `operation_id` no body (verificável na aba Network).
  - Retornar `synced > 0` quando houver chats novos/atualizados.
  - Trazer mensagens recentes para a UI.
- Chamar o endpoint sem `operation_id` deve retornar 400, não 200.

## Arquivos a modificar

- `src/routes/chat-oficial.tsx` — incluir `operation_id` no POST.
- `src/routes/api/public/sync-chats.ts` — retornar 400 se faltar `operation_id`.
