-- Rename columns in funnel_steps to align with spec
ALTER TABLE public.funnel_steps RENAME COLUMN ordem TO order_index;
ALTER TABLE public.funnel_steps RENAME COLUMN delay_mode TO delay_type;
ALTER TABLE public.funnel_steps ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.funnel_steps ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE public.funnel_steps ADD COLUMN IF NOT EXISTS mimetype text;

-- Leads
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number text UNIQUE NOT NULL,
  remote_jid text,
  name text,
  push_name text,
  instance_name text,
  status text NOT NULL DEFAULT 'active',
  is_new_lead boolean NOT NULL DEFAULT true,
  tags text[] NOT NULL DEFAULT '{}',
  first_contact_at timestamptz DEFAULT now(),
  last_interaction_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all leads" ON public.leads FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER set_updated_at_leads BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Messages
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  evolution_message_id text,
  direction text NOT NULL,
  type text NOT NULL,
  content text,
  media_url text,
  file_name text,
  is_ai boolean NOT NULL DEFAULT false,
  sent_by text NOT NULL DEFAULT 'system',
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_messages_lead ON public.messages(lead_id, sent_at DESC);

-- Instances
CREATE TABLE IF NOT EXISTS public.instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name text UNIQUE NOT NULL,
  instance_id text,
  api_key text NOT NULL,
  base_url text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  qr_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all instances" ON public.instances FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER set_updated_at_instances BEFORE UPDATE ON public.instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Scheduled messages queue
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  funnel_id uuid REFERENCES public.funnels(id) ON DELETE CASCADE,
  step_id uuid REFERENCES public.funnel_steps(id) ON DELETE CASCADE,
  instance_name text NOT NULL,
  whatsapp_number text NOT NULL,
  message_type text NOT NULL,
  content text,
  media_url text,
  file_name text,
  mimetype text,
  caption text,
  send_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  evolution_message_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all scheduled_messages" ON public.scheduled_messages FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_dispatch
  ON public.scheduled_messages(send_at, status) WHERE status = 'pending';

-- Lead-funnel state
CREATE TABLE IF NOT EXISTS public.lead_funnel_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  funnel_id uuid REFERENCES public.funnels(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(lead_id, funnel_id)
);
ALTER TABLE public.lead_funnel_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all lead_funnel_states" ON public.lead_funnel_states FOR ALL USING (true) WITH CHECK (true);

-- Function: mark completed funnels
CREATE OR REPLACE FUNCTION public.check_completed_funnels()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.lead_funnel_states lfs
  SET status = 'completed', completed_at = now()
  WHERE lfs.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.scheduled_messages sm
      WHERE sm.lead_id = lfs.lead_id
        AND sm.funnel_id = lfs.funnel_id
        AND sm.status = 'pending'
    );
END;
$$;

-- Storage bucket for funnel media
INSERT INTO storage.buckets (id, name, public)
VALUES ('funnel-media', 'funnel-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read funnel-media" ON storage.objects
  FOR SELECT USING (bucket_id = 'funnel-media');
CREATE POLICY "Anyone can upload funnel-media" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'funnel-media');
CREATE POLICY "Anyone can update funnel-media" ON storage.objects
  FOR UPDATE USING (bucket_id = 'funnel-media');
CREATE POLICY "Anyone can delete funnel-media" ON storage.objects
  FOR DELETE USING (bucket_id = 'funnel-media');