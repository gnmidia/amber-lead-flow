CREATE TABLE IF NOT EXISTS public.llm_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  name text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('anthropic','google','openai')),
  api_key text NOT NULL,
  model text NOT NULL,
  max_tokens integer NOT NULL DEFAULT 1000,
  temperature numeric(3,2) NOT NULL DEFAULT 0.7,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_connections_operation ON public.llm_connections(operation_id);

ALTER TABLE public.llm_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open all llm_connections" ON public.llm_connections FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS llm_connection_id uuid REFERENCES public.llm_connections(id) ON DELETE SET NULL;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS max_turns integer NOT NULL DEFAULT 20;