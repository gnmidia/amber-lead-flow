CREATE OR REPLACE VIEW public.leads_per_day AS
SELECT
  DATE(l.first_contact_at AT TIME ZONE 'America/Sao_Paulo') AS day,
  COUNT(DISTINCT l.id)                                       AS total,
  COUNT(DISTINCT l.id) FILTER (WHERE l.is_new_lead = true)   AS new_leads
FROM public.leads l
WHERE l.first_contact_at IS NOT NULL
GROUP BY DATE(l.first_contact_at AT TIME ZONE 'America/Sao_Paulo');

CREATE OR REPLACE VIEW public.leads_per_day_by_tag AS
SELECT
  DATE(l.first_contact_at AT TIME ZONE 'America/Sao_Paulo') AS day,
  t.id    AS tag_id,
  t.name  AS tag_name,
  t.color AS tag_color,
  COUNT(DISTINCT l.id) AS total
FROM public.leads l
JOIN public.lead_tags lt ON lt.lead_id = l.id
JOIN public.tags t       ON t.id = lt.tag_id
WHERE l.first_contact_at IS NOT NULL
GROUP BY
  DATE(l.first_contact_at AT TIME ZONE 'America/Sao_Paulo'),
  t.id, t.name, t.color;