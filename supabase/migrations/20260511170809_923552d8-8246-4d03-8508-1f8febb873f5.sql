CREATE OR REPLACE FUNCTION public.leads_per_day(op_id uuid)
RETURNS TABLE(day date, total bigint, new_leads bigint)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT
    date((l.created_at AT TIME ZONE 'America/Sao_Paulo')) AS day,
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE l.is_new_lead = true)::bigint AS new_leads
  FROM public.leads l
  WHERE l.operation_id = op_id
  GROUP BY 1;
$$;

CREATE OR REPLACE FUNCTION public.leads_per_day_by_tag(op_id uuid)
RETURNS TABLE(day date, tag_id uuid, tag_name text, tag_color text, total bigint)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT
    date((l.created_at AT TIME ZONE 'America/Sao_Paulo')) AS day,
    t.id AS tag_id,
    t.name AS tag_name,
    t.color AS tag_color,
    COUNT(DISTINCT l.id)::bigint AS total
  FROM public.leads l
  JOIN public.lead_tags lt ON lt.lead_id = l.id
  JOIN public.tags t ON t.id = lt.tag_id
  WHERE l.operation_id = op_id
  GROUP BY 1, t.id, t.name, t.color;
$$;