## Objetivo

Eliminar o timeout do Worker no envio de áudio usando fire-and-forget, sem alterar texto/imagem/vídeo/documento.

## 1. `src/routes/api/public/message-dispatcher.ts`

Tratar `audio`/`áudio` como caso especial **antes** de chamar `sendToEvolution`:

- Marcar imediatamente `scheduled_messages` como `status='sent'`, `dispatch_started_at=null`.
- Inserir o registro em `messages` (outbound, type='audio', media_url, sem `evolution_message_id` por enquanto) — para que a UI já mostre o áudio.
- Disparar `fetch` para `/chat/sendPresence` e `/message/sendWhatsAppAudio` **sem `await`** (fire-and-forget) com `.catch(() => {})`.
- Retornar `"sent"` sem aguardar resposta da Evolution.

A função `sendToEvolution` continua tratando os outros tipos com `await` normal. O ramo `audio` interno dela vira inalcançável (só chamamos para os demais tipos), mas removerei o branch para evitar código morto.

## 2. `src/routes/api/public/webhook-whatsapp.ts`

Adicionar handler para o evento `send.message` (emitido pela Evolution após enviar):

```ts
if (event === "send.message" && data?.key) {
  const key = data.key;
  const remoteJid: string = key.remoteJid ?? "";
  // só interessa áudio outbound sem evolution_message_id ainda
  const isAudio = !!data.message?.audioMessage;
  if (key.fromMe && isAudio && key.id) {
    // localiza lead pelo remote_jid (ou número normalizado)
    const { data: lead } = await supabaseAdmin
      .from("leads").select("id").eq("remote_jid", remoteJid).maybeSingle();
    if (lead) {
      // atualiza a mensagem outbound de audio mais recente desse lead
      // que ainda não tem evolution_message_id
      const { data: target } = await supabaseAdmin
        .from("messages")
        .select("id")
        .eq("lead_id", lead.id)
        .eq("direction", "outbound")
        .eq("type", "audio")
        .is("evolution_message_id", null)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (target) {
        await supabaseAdmin.from("messages")
          .update({ evolution_message_id: key.id })
          .eq("id", target.id);
      }
    }
  }
}
```

Critério de correlação: lead + tipo `audio` + outbound + `evolution_message_id IS NULL` + mais recente. É suficiente porque processamos uma mensagem por lead por tick.

## 3. Migration — `requeue_stuck_dispatching`

Atualizar a função para que áudio:
- Considere "travado" após **5 minutos** (300s) em vez de 15.
- Seja requeueado (status `pending`) se `attempts < 2`, em vez de cair direto para `failed`.
- Só vire `failed` quando `attempts >= 2` (mesma regra dos outros tipos).

Outras mídias (image/video/document) mantêm o comportamento atual (failed direto após o timeout grande, pois podem ter sido entregues).

```sql
CREATE OR REPLACE FUNCTION public.requeue_stuck_dispatching(p_older_than_seconds integer DEFAULT 900)
RETURNS integer ... AS $$
DECLARE n int;
BEGIN
  WITH stale AS (
    SELECT id, lower(message_type) AS message_type, attempts,
           coalesce(dispatch_started_at, created_at) AS started
    FROM public.scheduled_messages
    WHERE status = 'dispatching'
  ),
  -- áudio: janela curta (300s); retry se attempts<2, senão failed
  audio_retry AS (
    UPDATE public.scheduled_messages sm
    SET status='pending', dispatch_started_at=NULL
    FROM stale
    WHERE sm.id=stale.id
      AND stale.message_type IN ('audio','áudio')
      AND stale.started < now() - interval '300 seconds'
      AND stale.attempts < 2
    RETURNING 1
  ),
  audio_fail AS (
    UPDATE public.scheduled_messages sm
    SET status='failed', dispatch_started_at=NULL,
        error_message=coalesce(nullif(sm.error_message,''),'Áudio travado após 2 tentativas.')
    FROM stale
    WHERE sm.id=stale.id
      AND stale.message_type IN ('audio','áudio')
      AND stale.started < now() - interval '300 seconds'
      AND stale.attempts >= 2
    RETURNING 1
  ),
  -- demais mídias: comportamento antigo (failed após p_older_than_seconds)
  other_media_fail AS (
    UPDATE public.scheduled_messages sm
    SET status='failed', dispatch_started_at=NULL,
        error_message=coalesce(nullif(sm.error_message,''),'Envio interrompido após iniciar.')
    FROM stale
    WHERE sm.id=stale.id
      AND stale.message_type IN ('image','imagem','video','document','documento')
      AND stale.started < now() - (p_older_than_seconds || ' seconds')::interval
    RETURNING 1
  ),
  -- texto e tag/flow_resume: requeue
  safe_retry AS (
    UPDATE public.scheduled_messages sm
    SET status='pending', dispatch_started_at=NULL
    FROM stale
    WHERE sm.id=stale.id
      AND stale.message_type NOT IN ('audio','áudio','image','imagem','video','document','documento')
      AND stale.started < now() - (p_older_than_seconds || ' seconds')::interval
    RETURNING 1
  )
  SELECT count(*) INTO n FROM (
    SELECT 1 FROM audio_retry UNION ALL
    SELECT 1 FROM audio_fail UNION ALL
    SELECT 1 FROM other_media_fail UNION ALL
    SELECT 1 FROM safe_retry
  ) x;
  RETURN n;
END;
$$ LANGUAGE plpgsql SET search_path=public;
```

## 4. Reenvio manual do áudio do teste

Após a aplicação, identificar o `scheduled_messages` `failed` do teste atual (`message_type='audio'`) e via migration:

```sql
UPDATE public.scheduled_messages
SET status='pending', attempts=0, error_message=NULL,
    send_at=now(), dispatch_started_at=NULL
WHERE id = '<id_do_audio_failed>';
```

(Identifico o ID exato após você aprovar.) O próximo tick do dispatcher pega e dispara fire-and-forget.

## Fora do escopo

- Texto, imagem, vídeo, documento: nenhuma alteração no caminho de envio.
- Estrutura de tabelas: nenhuma alteração.
- Lógica de janela de envio, claim de mensagens, agrupamento por lead: inalterada.
