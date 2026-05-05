
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  color text NOT NULL DEFAULT '#6B7280',
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  assigned_by text NOT NULL DEFAULT 'manual',
  assigned_at timestamptz DEFAULT now(),
  UNIQUE(lead_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_lead_tags_lead ON public.lead_tags(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_tag  ON public.lead_tags(tag_id);

ALTER TABLE public.tags      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open all tags" ON public.tags FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open all lead_tags" ON public.lead_tags FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.tags (name, color, description) VALUES
  ('PAGO_V1',    '#22C55E', 'Lead que realizou o pagamento do produto principal'),
  ('LEAD',       '#3B82F6', 'Lead novo que entrou em contato'),
  ('FOLLOW_UP',  '#F97316', 'Lead que precisa de acompanhamento'),
  ('RECUPERAR',  '#EF4444', 'Lead frio que precisa ser reativado')
ON CONFLICT (name) DO NOTHING;

-- Recriar view leads_with_last_message incluindo tags_data
DROP VIEW IF EXISTS public.leads_with_last_message;
CREATE VIEW public.leads_with_last_message AS
SELECT
  l.id, l.whatsapp_number, l.remote_jid, l.name, l.push_name,
  l.instance_name, l.status, l.is_new_lead, l.tags,
  l.first_contact_at, l.last_interaction_at, l.created_at, l.updated_at, l.ia_paused,
  m.content AS last_message_content,
  m.type AS last_message_type,
  m.sent_at AS last_message_at,
  m.direction AS last_message_direction,
  COALESCE(
    (SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY lt.assigned_at)
     FROM public.lead_tags lt JOIN public.tags t ON t.id = lt.tag_id
     WHERE lt.lead_id = l.id),
    '[]'::json
  ) AS tags_data
FROM public.leads l
LEFT JOIN LATERAL (
  SELECT messages.content, messages.type, messages.sent_at, messages.direction
  FROM public.messages
  WHERE messages.lead_id = l.id
  ORDER BY messages.sent_at DESC
  LIMIT 1
) m ON true;

ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_tags;
