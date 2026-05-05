
CREATE TABLE IF NOT EXISTS public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  objective text,
  product text,
  tone text DEFAULT 'Misto',
  exit_condition text,
  prompt text,
  is_active boolean NOT NULL DEFAULT true,
  exit_tags uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all agents" ON public.agents FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER set_agents_updated_at
BEFORE UPDATE ON public.agents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
