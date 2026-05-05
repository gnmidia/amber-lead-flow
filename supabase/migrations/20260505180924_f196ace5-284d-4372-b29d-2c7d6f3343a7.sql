ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ia_paused boolean NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW public.leads_with_last_message AS
SELECT
  l.*,
  m.content AS last_message_content,
  m.type AS last_message_type,
  m.sent_at AS last_message_at,
  m.direction AS last_message_direction
FROM public.leads l
LEFT JOIN LATERAL (
  SELECT content, type, sent_at, direction
  FROM public.messages
  WHERE lead_id = l.id
  ORDER BY sent_at DESC
  LIMIT 1
) m ON true;

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;