
CREATE TABLE IF NOT EXISTS public.flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL DEFAULT 'new_lead',
  trigger_value text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.flow_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  order_index integer NOT NULL,
  block_type text NOT NULL,
  reference_id uuid,
  condition_type text,
  condition_value text,
  branch_yes_block_id uuid,
  branch_no_block_id  uuid,
  wait_minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flow_blocks_flow ON public.flow_blocks(flow_id, order_index);

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS current_agent_id uuid;

ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open all flows" ON public.flows;
CREATE POLICY "open all flows" ON public.flows FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open all flow_blocks" ON public.flow_blocks;
CREATE POLICY "open all flow_blocks" ON public.flow_blocks FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_flows_updated ON public.flows;
CREATE TRIGGER trg_flows_updated BEFORE UPDATE ON public.flows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
