ALTER TABLE public.scheduled_messages
ADD COLUMN IF NOT EXISTS dispatch_started_at timestamp with time zone;

CREATE OR REPLACE FUNCTION public.claim_scheduled_messages(p_limit integer DEFAULT 200)
RETURNS SETOF public.scheduled_messages
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.scheduled_messages
    WHERE status = 'pending' AND send_at <= now()
    ORDER BY send_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.scheduled_messages sm
  SET
    status = 'dispatching',
    attempts = sm.attempts + 1,
    dispatch_started_at = now()
  FROM picked
  WHERE sm.id = picked.id
  RETURNING sm.*;
END;
$function$;

CREATE OR REPLACE FUNCTION public.requeue_stuck_dispatching(p_older_than_seconds integer DEFAULT 900)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  n int;
BEGIN
  WITH stale AS (
    SELECT id, lower(message_type) AS message_type
    FROM public.scheduled_messages
    WHERE status = 'dispatching'
      AND coalesce(dispatch_started_at, created_at) < now() - (p_older_than_seconds || ' seconds')::interval
  ),
  failed_media AS (
    UPDATE public.scheduled_messages sm
    SET
      status = 'failed',
      error_message = coalesce(nullif(sm.error_message, ''), 'Envio interrompido após iniciar. Não reenviado automaticamente para evitar duplicação.'),
      dispatch_started_at = NULL
    FROM stale
    WHERE sm.id = stale.id
      AND stale.message_type IN ('audio', 'áudio', 'image', 'imagem', 'video', 'document', 'documento')
    RETURNING 1
  ),
  retried_safe AS (
    UPDATE public.scheduled_messages sm
    SET
      status = 'pending',
      dispatch_started_at = NULL
    FROM stale
    WHERE sm.id = stale.id
      AND stale.message_type NOT IN ('audio', 'áudio', 'image', 'imagem', 'video', 'document', 'documento')
    RETURNING 1
  )
  SELECT count(*) INTO n
  FROM (
    SELECT 1 FROM failed_media
    UNION ALL
    SELECT 1 FROM retried_safe
  ) x;

  RETURN n;
END;
$function$;