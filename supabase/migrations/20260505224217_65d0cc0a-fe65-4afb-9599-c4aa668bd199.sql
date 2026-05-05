ALTER TABLE public.funnel_steps
  ADD COLUMN IF NOT EXISTS tag_id uuid REFERENCES public.tags(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tag_operation text;