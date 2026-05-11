## Correção de leads duplicados (3 frentes)

### Casos confirmados a mesclar

| Manter (principal) | Apagar (duplicado) |
|---|---|
| Agnaldo Geraldo Flores — `553798184946@s.whatsapp.net` | `9904781791403@lid` |
| Eduardo — `556984497325@s.whatsapp.net` | `59704508158053@lid` |

---

### Etapa 1 — Migration: mesclar duplicados + unique index

Uma única migration SQL faz:

1. Para cada par, em transação:
   - `UPDATE messages SET lead_id = <principal> WHERE lead_id = <duplicado>`
   - `UPDATE lead_tags SET lead_id = <principal> WHERE lead_id = <duplicado>` (com `ON CONFLICT DO NOTHING` se houver tag duplicada — usa `DELETE` dos colidentes antes do update)
   - `UPDATE lead_funnel_states SET lead_id = <principal> WHERE lead_id = <duplicado>`
   - `UPDATE scheduled_messages SET lead_id = <principal> WHERE lead_id = <duplicado>`
   - `UPDATE sales SET lead_id = <principal> WHERE lead_id = <duplicado>`
   - `DELETE FROM leads WHERE id = <duplicado>`
   - Conta linhas movidas via CTE `RETURNING` para log
2. Cria o índice de proteção:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_remote_jid_unique
   ON public.leads(operation_id, remote_jid)
   WHERE remote_jid IS NOT NULL;
   ```

A migration usa os IDs reais (resolvidos por `WHERE remote_jid = ...`), então é idempotente em relação à ordem.

---

### Etapa 2 — Reforçar deduplicação no código

Criar um helper único `src/server/lead-dedup.server.ts` com `findOrUpsertLead({ remoteJid, senderPn, instance, operationId, ... })` aplicando a regra:

**Chegou `@s.whatsapp.net`** (telefone real no JID):
1. Match por `remote_jid` exato → atualiza/retorna.
2. Match por `whatsapp_number = number` → atualiza `remote_jid` real e retorna.
3. Match por `remote_jid LIKE '%@lid' AND whatsapp_number = number` (LID antigo cujos dígitos ficaram no campo) → reescreve `remote_jid` e `whatsapp_number` para o real e retorna.
4. Match por `remote_jid LIKE '%@lid'` cujo lead tenha `senderPn` salvo (não temos coluna; cobrimos via 3) → cai no INSERT.
5. INSERT.

**Chegou `@lid` com `senderPn` preenchido** (LID + telefone real conhecido):
1. Match por `remote_jid` exato (`@lid`) → atualiza `whatsapp_number` com `senderPn` e retorna.
2. Match por `remote_jid = ${senderPn}@s.whatsapp.net` → atualiza `remote_jid` para o `@lid` (mais estável dali em diante) e retorna.
3. Match por `whatsapp_number = senderPn` → atualiza `remote_jid` para o `@lid` e retorna.
4. INSERT com `remote_jid=@lid` e `whatsapp_number=senderPn`.

**Chegou `@lid` sem `senderPn`** (cenário que gerou os duplicados):
1. Match por `remote_jid` exato → retorna.
2. INSERT com `whatsapp_number = <dígitos do LID>` (comportamento atual). O backfill futuro converte quando o `senderPn` aparecer (rota 1 acima).

Substituir os blocos atuais de `webhook-whatsapp.ts` (linhas 111–156) e `sync-chats.ts` (linhas 67–91) pelo helper. Tratar o `unique violation` (código `23505`) caindo de volta no `select` por `remote_jid` (corrida entre webhooks).

---

### Etapa 3 — Validação pós-deploy

- Re-executar a query de duplicados por `name` na operação → deve retornar 0.
- Confirmar `pg_indexes` mostra `idx_leads_remote_jid_unique`.
- Forçar dois eventos consecutivos do mesmo contato (um `@lid` sem `senderPn`, outro `@s.whatsapp.net`) e confirmar que vira **um único** lead.

---

### Detalhes técnicos

- O `lead_tags` tem `UNIQUE(lead_id, tag_id)`? **Não tem unique declarado** (só PK em `id`), então `UPDATE` direto não viola. Mantemos sem `ON CONFLICT`.
- O índice é parcial em `remote_jid IS NOT NULL` — não bloqueia leads históricos sem JID.
- O índice inclui `operation_id` para permitir o mesmo contato em operações diferentes (multi-operação).
- Nenhum lead além dos 2 `@lid` confirmados é tocado.
- A migration não toca `auth`, `storage`, `realtime`, `vault`.

### Arquivos previstos

- `supabase/migrations/<timestamp>_dedupe_leads.sql` — merge + unique index
- `src/server/lead-dedup.server.ts` — novo helper
- `src/routes/api/public/webhook-whatsapp.ts` — usa helper
- `src/routes/api/public/sync-chats.ts` — usa helper
