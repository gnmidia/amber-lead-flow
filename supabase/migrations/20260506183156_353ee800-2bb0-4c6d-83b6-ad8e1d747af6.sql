-- Tabelas para a feature de Disparos em massa
CREATE TABLE public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Disparo',
  flow_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  min_interval_seconds integer NOT NULL DEFAULT 30,
  max_interval_seconds integer NOT NULL DEFAULT 90,
  total_leads integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending', -- pending | running | completed | cancelled
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all broadcasts" ON public.broadcasts FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.broadcast_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | dispatching | sent | failed | skipped
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.broadcast_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all broadcast_targets" ON public.broadcast_targets FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_broadcast_targets_pending ON public.broadcast_targets (scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_broadcast_targets_broadcast ON public.broadcast_targets (broadcast_id);

-- Função para reivindicar lotes de targets prontos (evita corrida entre crons)
CREATE OR REPLACE FUNCTION public.claim_broadcast_targets(p_limit integer DEFAULT 50)
RETURNS SETOF public.broadcast_targets
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.broadcast_targets
    WHERE status = 'pending' AND scheduled_at <= now()
    ORDER BY scheduled_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.broadcast_targets bt
  SET status = 'dispatching'
  FROM picked
  WHERE bt.id = picked.id
  RETURNING bt.*;
END;
$$;