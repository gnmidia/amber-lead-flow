
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending_send_at
  ON public.scheduled_messages(send_at)
  WHERE status IN ('pending','dispatching');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_per_step
  ON public.scheduled_messages(lead_id, step_id)
  WHERE step_id IS NOT NULL AND status IN ('pending','dispatching');

CREATE OR REPLACE FUNCTION public.claim_scheduled_messages(p_limit int DEFAULT 200)
RETURNS SETOF public.scheduled_messages
LANGUAGE plpgsql
SET search_path = public
AS $$
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
  SET status = 'dispatching', attempts = sm.attempts + 1
  FROM picked
  WHERE sm.id = picked.id
  RETURNING sm.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.requeue_stuck_dispatching(p_older_than_seconds int DEFAULT 300)
RETURNS int
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  WITH upd AS (
    UPDATE public.scheduled_messages
    SET status = 'pending'
    WHERE status = 'dispatching'
      AND created_at < now() - (p_older_than_seconds || ' seconds')::interval
    RETURNING 1
  )
  SELECT count(*) INTO n FROM upd;
  RETURN n;
END;
$$;
