## Diagnóstico (resumo)

- ✅ Broadcast `282c16d1...` foi criado com `status=running`, 2 leads.
- ✅ Targets foram criados em `broadcast_targets` (status=`pending`, `scheduled_at` corretos).
- ✅ Cron `broadcast-dispatcher-every-minute` está ativo (`* * * * *`).
- ❌ O cron chama `https://project--<id>.lovable.app/...` (URL **publicada**) e o app **não foi publicado**, então retorna **HTTP 404 "Project not found"** a cada minuto. Por isso os 2 targets nunca saem de `pending`.
- ⚠ Não existem Edge Functions (`broadcast-start` / `broadcast-dispatcher`) — a implementação atual usa server routes do TanStack.

Conclusão: a criação do disparo funcionou. O que falhou é o consumo pelo cron, porque o cron aponta para um domínio inexistente.

## Plano — migrar para Supabase Edge Functions reais

### 1. Criar `supabase/functions/broadcast-start/index.ts`
Porta do `src/routes/api/public/broadcast-create.ts` para Deno:
- Body: `{ name, flow_id, tag_id, min_interval_seconds, max_interval_seconds }`
- Busca leads pela tag, filtra `status='active'`, insere `broadcasts` + `broadcast_targets` com `scheduled_at` rolante (rand entre min/max).
- Usa `SUPABASE_SERVICE_ROLE_KEY` via `Deno.env`.
- CORS aberto.

### 2. Criar `supabase/functions/broadcast-dispatcher/index.ts`
Porta do `src/routes/api/public/broadcast-dispatcher.ts`:
- Chama `claim_broadcast_targets` (já existe no banco).
- Para cada target: respeita `cancelled` / `paused`, valida lead ativo, reagenda se há funil ativo, senão executa o fluxo.
- **Execução do fluxo**: porta inline do `executeFlowForLead` (lê `flow_blocks` em ordem; para blocos `funnel` chama `scheduleFunnelForLead` portado; trata `agent`, `tag_assign`, `tag_remove`, `wait`, `condition`).
- Marca target como `sent` ou `failed`. Roda `checkCompleted` no final.

### 3. Configurar `supabase/config.toml`
Adicionar blocos para as duas funções com `verify_jwt = false` (são chamadas pelo cron com service-role e pela UI com anon).

### 4. Atualizar UI para chamar a Edge Function
- Em `src/routes/disparos.tsx`, trocar `fetch("/api/public/broadcast-create", ...)` por `supabase.functions.invoke("broadcast-start", { body: {...} })`.

### 5. Migrar o cron
SQL a rodar (insert tool, não migration — contém URL/chave):
```sql
SELECT cron.unschedule('broadcast-dispatcher-every-minute');

SELECT cron.schedule(
  'broadcast-dispatcher-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://uzuxxgvpgsqmkolmmqcv.supabase.co/functions/v1/broadcast-dispatcher',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <anon>"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
```

### 6. Remover server routes obsoletos
Apagar `src/routes/api/public/broadcast-create.ts` e `src/routes/api/public/broadcast-dispatcher.ts` (substituídos pelas Edge Functions).

### 7. Verificação
- `SELECT jobname, schedule, active FROM cron.job;` → confirmar que o job aparece e segue ativo.
- Invocar `broadcast-dispatcher` manualmente uma vez (via curl ou tool de teste) e confirmar resposta JSON sem 404.
- Conferir `cron.job_run_details` e `net._http_response` mostrando `200` e `{"dispatched":N}`.
- Os 2 targets `pending` do disparo `282c16d1...` devem sair de pending na próxima execução.

## Observações

- A lógica de `executeFlowForLead` é grande; será portada com fidelidade para Deno mas é o ponto de maior risco — testaremos invocando manualmente após o deploy.
- Após migrar, o sistema deixa de depender da publicação do projeto para os disparos funcionarem.
