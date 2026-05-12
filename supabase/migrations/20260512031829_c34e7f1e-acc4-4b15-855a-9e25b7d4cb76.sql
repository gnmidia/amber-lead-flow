CREATE TABLE IF NOT EXISTS public.lead_active_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  flow_id uuid REFERENCES public.flows(id) ON DELETE SET NULL,
  flow_block_id uuid REFERENCES public.flow_blocks(id) ON DELETE SET NULL,
  resume_block_index integer,
  turn_count integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lead_id)
);
CREATE INDEX IF NOT EXISTS idx_lead_active_agents_lead ON public.lead_active_agents(lead_id);

ALTER TABLE public.lead_active_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open all lead_active_agents"
ON public.lead_active_agents FOR ALL
USING (true) WITH CHECK (true);