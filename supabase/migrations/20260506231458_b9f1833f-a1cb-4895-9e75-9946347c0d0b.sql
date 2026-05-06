CREATE OR REPLACE VIEW public.leads_per_day AS
WITH first_msg AS (
  SELECT lead_id, MIN(sent_at) AS first_at
  FROM public.messages
  WHERE direction = 'inbound' AND lead_id IS NOT NULL
  GROUP BY lead_id
)
SELECT
  DATE(COALESCE(fm.first_at, l.first_contact_at) AT TIME ZONE 'America/Sao_Paulo') AS day,
  COUNT(DISTINCT l.id) AS total,
  COUNT(DISTINCT l.id) FILTER (WHERE l.is_new_lead = true) AS new_leads
FROM public.leads l
LEFT JOIN first_msg fm ON fm.lead_id = l.id
WHERE COALESCE(fm.first_at, l.first_contact_at) IS NOT NULL
GROUP BY DATE(COALESCE(fm.first_at, l.first_contact_at) AT TIME ZONE 'America/Sao_Paulo');

CREATE OR REPLACE VIEW public.leads_per_day_by_tag AS
WITH first_msg AS (
  SELECT lead_id, MIN(sent_at) AS first_at
  FROM public.messages
  WHERE direction = 'inbound' AND lead_id IS NOT NULL
  GROUP BY lead_id
)
SELECT
  DATE(COALESCE(fm.first_at, l.first_contact_at) AT TIME ZONE 'America/Sao_Paulo') AS day,
  t.id    AS tag_id,
  t.name  AS tag_name,
  t.color AS tag_color,
  COUNT(DISTINCT l.id) AS total
FROM public.leads l
LEFT JOIN first_msg fm ON fm.lead_id = l.id
JOIN public.lead_tags lt ON lt.lead_id = l.id
JOIN public.tags t       ON t.id = lt.tag_id
WHERE COALESCE(fm.first_at, l.first_contact_at) IS NOT NULL
GROUP BY
  DATE(COALESCE(fm.first_at, l.first_contact_at) AT TIME ZONE 'America/Sao_Paulo'),
  t.id, t.name, t.color;

ALTER VIEW public.leads_per_day SET (security_invoker = true);
ALTER VIEW public.leads_per_day_by_tag SET (security_invoker = true);