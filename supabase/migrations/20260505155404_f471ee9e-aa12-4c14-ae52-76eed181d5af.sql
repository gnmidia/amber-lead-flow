
-- Funnels and steps for CLand Dash (single-user MVP, auth deferred)
CREATE TABLE public.funnels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  internal_id TEXT NOT NULL UNIQUE,
  consecutive BOOLEAN NOT NULL DEFAULT true,
  start_min INTEGER NOT NULL DEFAULT 60,
  start_max INTEGER NOT NULL DEFAULT 120,
  window_start TEXT NOT NULL DEFAULT '00:00',
  window_end TEXT NOT NULL DEFAULT '23:59',
  channels TEXT[] NOT NULL DEFAULT ARRAY['WABA']::TEXT[],
  envios INTEGER NOT NULL DEFAULT 0,
  respostas INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.funnel_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funnel_id UUID NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'Texto',
  content TEXT NOT NULL DEFAULT '',
  caption TEXT,
  delay_mode TEXT NOT NULL DEFAULT 'oscilante',
  delay_fixed INTEGER,
  delay_min INTEGER,
  delay_max INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_funnel_steps_funnel ON public.funnel_steps(funnel_id, ordem);

ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_steps ENABLE ROW LEVEL SECURITY;

-- Single-user white-label MVP: open access until auth is wired
CREATE POLICY "open all funnels" ON public.funnels FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open all funnel_steps" ON public.funnel_steps FOR ALL USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_funnels_updated BEFORE UPDATE ON public.funnels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_funnel_steps_updated BEFORE UPDATE ON public.funnel_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
