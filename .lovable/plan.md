## Causa raiz dos envios duplicados (ex.: áudio enviado 5x)

O `message-dispatcher` é chamado em loop pelo cron. O fluxo atual é:

1. `SELECT * FROM scheduled_messages WHERE status='pending' AND send_at <= now()` (até 200 linhas).
2. Agrupa por `lead_id` e processa **serialmente**, com `setTimeout` de até **90 segundos** entre mensagens (para respeitar Delay).
3. Só marca `status='sent'` **depois** do envio bem-sucedido.

O problema: enquanto o dispatcher dorme esperando o gap entre mensagens (ou enquanto envia áudio que demora alguns segundos), o **próximo tick do cron** roda em paralelo. Como a linha continua com `status='pending'`, ela é selecionada de novo e enviada de novo. Quanto mais lento o item (áudio com presença "recording" + 2.5s + upload), mais ticks pegam a mesma linha → envio múltiplo.

Não há nenhum mecanismo de claim/lock. A serialização "por lead" só funciona dentro de uma única invocação — entre invocações, é corrida total.

Adicionalmente, o `executeFlowForLead` (chamado em `flow_resume`) pode reagendar passos de funil. Se o `lead_funnel_states` já estiver `active` mas com mensagens pendentes pertencentes ao mesmo funil, ele pula via `skipped: "already_active"` — ok. Mas se o estado já tiver sido marcado `completed` por `check_completed_funnels` antes do cron rodar de novo, em teoria poderia reagendar. Vou validar essa borda também.

## Correção

### 1. Claim atômico no `message-dispatcher.ts`

Substituir o `select ... where status='pending'` por um **UPDATE retornando**:

```sql
UPDATE scheduled_messages
SET status = 'dispatching', attempts = attempts + 1
WHERE id IN (
  SELECT id FROM scheduled_messages
  WHERE status = 'pending' AND send_at <= now()
  ORDER BY send_at
  LIMIT 200
  FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

Implementado via uma RPC Postgres `claim_scheduled_messages(p_limit int)` (já que o supabase-js não expõe `FOR UPDATE SKIP LOCKED` direto). A função retorna o set de linhas claimadas. Ticks paralelos do cron nunca vão pegar o mesmo id — `SKIP LOCKED` garante isso.

Adicionar status novo `dispatching` (texto livre, não há check constraint, sem migração de schema necessária para isso, mas adicionarei uma migração para criar a função e um índice parcial).

### 2. Remover o `setTimeout` longo entre mensagens

Esperar 90s dentro de um Worker é frágil (timeout do Worker, custo, e exatamente o que cria a janela de corrida). Em vez disso:

- O dispatcher só processa mensagens cujo `send_at <= now()`.
- Mensagens de um mesmo lead com gap (Delay) já estão escalonadas com `send_at` futuro pelo `scheduleFunnelForLead` — então elas naturalmente só vão ser claimadas quando o tempo chegar.
- **Remover** o bloco `if (gapMs > 0) await setTimeout(gapMs)`. Ele é redundante (o cron roda a cada minuto) e é a fonte da janela de corrida.

Resultado: cada mensagem é claimada uma vez, enviada uma vez, marcada `sent` (ou `failed` após 3 tentativas). Delays continuam sendo respeitados via `send_at`.

### 3. Lógica de fallback / retry

- Se `processOne` falhar, atualizar `status = 'pending'` (para retry no próximo tick) ou `'failed'` quando `attempts >= 3` — igual ao comportamento atual.
- Se o Worker for morto no meio do envio, a linha fica em `dispatching` para sempre. Mitigação: criar uma "varredura" no início do dispatcher que devolve para `pending` linhas em `dispatching` há mais de 5 minutos.

### 4. Garantir idempotência por step_id

Como cinto-e-suspensório, adicionar índice único parcial:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_per_step
  ON scheduled_messages(lead_id, step_id)
  WHERE step_id IS NOT NULL AND status IN ('pending','dispatching');
```

Isso impede que `scheduleFunnelForLead` insira duas linhas para o mesmo (lead, step) caso seja chamado em corrida.

## Arquivos afetados

- **Nova migração SQL**: cria função `claim_scheduled_messages`, cria índice parcial único, e o índice em `(status, send_at)` se não existir.
- **`src/routes/api/public/message-dispatcher.ts`**: usar a RPC para claim, remover o `setTimeout` de gap, adicionar varredura de `dispatching` órfãos no início.
- Sem mudanças em `funnel-execution.server.ts` (a serialização por `send_at` já é suficiente após remover o gap inline).
- Sem mudança visual / de UI.

## Validação após o deploy

1. Disparar o funil de teste (com áudio + texto + delay).
2. Verificar que `scheduled_messages` cria N linhas, todas com `send_at` distintos respeitando o Delay.
3. Aguardar o cron rodar; conferir que cada linha vai para `sent` exatamente uma vez (sem `attempts > 1` e sem múltiplas linhas em `messages` para o mesmo step).
4. Conferir no WhatsApp que cada etapa chega 1x.
