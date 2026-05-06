## Problema

O Fluxo "INICIO-ADS" (gatilho keyword="teste") está ativo e tem 1 bloco apontando para um funil, mas quando o lead envia "teste" nada é agendado. Verificação no banco confirma: a mensagem entra em `messages`, mas `lead_funnel_states` e `scheduled_messages` ficam vazios.

A causa é que `webhook-whatsapp.ts` chama o `flow-executor` com `fetch(...).catch(()=>{})` **sem await**. No runtime serverless (Cloudflare Worker) a Promise pendente é cancelada assim que o handler retorna a Response, então o flow-executor nunca recebe a requisição. O mesmo padrão existe dentro do próprio `flow-executor` quando ele chama `funnel-scheduler` (bloco `funnel`) e quando ramifica em uma `condition`.

## Correção

### 1. `src/routes/api/public/webhook-whatsapp.ts`
- Coletar todas as flows que casam com triggers (`new_lead` + `keyword`) num array de promises.
- Fazer `await Promise.all(...)` antes de retornar a Response, com cada promise sendo o `fetch` para `/api/public/flow-executor`.
- Substituir `.catch(() => {})` por um `.catch(e => console.error(...))` para registrar falhas em vez de engolir.

### 2. `src/routes/api/public/flow-executor.ts`
- Trocar o `fetch(.../funnel-scheduler).catch(() => {})` (bloco `funnel`) por `await fetch(...)` com tratamento de erro logado.
- Trocar o `fetch(.../flow-executor)` recursivo (branch `condition` no_match) por `await fetch(...)`.
- Manter a estrutura geral (loop de blocos, wait/condition/agent/tag).

### 3. (Opcional, baixo risco) Pequeno log no webhook
Adicionar `console.log` quando uma flow for disparada (`[webhook] triggering flow X for lead Y`) para facilitar debug futuro nos logs do server function.

## Validação após o deploy

1. Enviar a palavra "teste" pelo WhatsApp como um lead.
2. Verificar que `lead_funnel_states` recebe um registro `active` para o lead com `funnel_id=577d8ac9...`.
3. Verificar que `scheduled_messages` é populado com os passos do funil.
4. Confirmar na tela `/agendamentos` que as mensagens aparecem na fila pendente.

Nenhum schema de banco muda. Nenhum visual muda. Apenas as duas rotas server acima são editadas.