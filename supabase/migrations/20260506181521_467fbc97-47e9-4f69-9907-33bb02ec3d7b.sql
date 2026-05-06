CREATE OR REPLACE FUNCTION public.requeue_stuck_dispatching(p_older_than_seconds integer DEFAULT 900)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  n int;
BEGIN
  WITH stale AS (
    SELECT id, lower(message_type) AS message_type, attempts,
           coalesce(dispatch_started_at, created_at) AS started
    FROM public.scheduled_messages
    WHERE status = 'dispatching'
  ),
  audio_retry AS (
    UPDATE public.scheduled_messages sm
    SET status = 'pending', dispatch_started_at = NULL
    FROM stale
    WHERE sm.id = stale.id
      AND stale.message_type IN ('audio','áudio')
      AND stale.started < now() - interval '300 seconds'
      AND stale.attempts < 2
    RETURNING 1
  ),
  audio_fail AS (
    UPDATE public.scheduled_messages sm
    SET status = 'failed', dispatch_started_at = NULL,
        error_message = coalesce(nullif(sm.error_message,''),'Áudio travado após 2 tentativas.')
    FROM stale
    WHERE sm.id = stale.id
      AND stale.message_type IN ('audio','áudio')
      AND stale.started < now() - interval '300 seconds'
      AND stale.attempts >= 2
    RETURNING 1
  ),
  other_media_fail AS (
    UPDATE public.scheduled_messages sm
    SET status = 'failed', dispatch_started_at = NULL,
        error_message = coalesce(nullif(sm.error_message,''),'Envio interrompido após iniciar. Não reenviado automaticamente para evitar duplicação.')
    FROM stale
    WHERE sm.id = stale.id
      AND stale.message_type IN ('image','imagem','video','document','documento')
      AND stale.started < now() - (p_older_than_seconds || ' seconds')::interval
    RETURNING 1
  ),
  safe_retry AS (
    UPDATE public.scheduled_messages sm
    SET status = 'pending', dispatch_started_at = NULL
    FROM stale
    WHERE sm.id = stale.id
      AND stale.message_type NOT IN ('audio','áudio','image','imagem','video','document','documento')
      AND stale.started < now() - (p_older_than_seconds || ' seconds')::interval
    RETURNING 1
  )
  SELECT count(*) INTO n FROM (
    SELECT 1 FROM audio_retry
    UNION ALL SELECT 1 FROM audio_fail
    UNION ALL SELECT 1 FROM other_media_fail
    UNION ALL SELECT 1 FROM safe_retry
  ) x;
  RETURN n;
END;
$function$;