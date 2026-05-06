CREATE INDEX IF NOT EXISTS idx_scheduled_dispatch
  ON public.scheduled_messages (send_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_lead_status
  ON public.scheduled_messages (lead_id, status);