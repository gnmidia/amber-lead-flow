CREATE OR REPLACE FUNCTION public.leads_per_day(op_id uuid)
RETURNS TABLE(day date, total bigint, new_leads bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH lead_dates AS (
    SELECT
      l.id,
      l.is_new_lead,
      DATE(MIN(m.sent_at) AT TIME ZONE 'America/Sao_Paulo') AS entry_day
    FROM public.leads l
    INNER JOIN public.messages m
      ON m.lead_id = l.id
     AND m.direction = 'inbound'
    WHERE l.operation_id = op_id
    GROUP BY l.id, l.is_new_lead
  )
  SELECT
    entry_day AS day,
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE is_new_lead = true)::bigint AS new_leads
  FROM lead_dates
  GROUP BY entry_day
  ORDER BY entry_day DESC
  LIMIT 30;
$function$;

CREATE OR REPLACE FUNCTION public.leads_per_day_by_tag(op_id uuid)
RETURNS TABLE(day date, tag_id uuid, tag_name text, tag_color text, total bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH lead_dates AS (
    SELECT
      l.id,
      DATE(MIN(m.sent_at) AT TIME ZONE 'America/Sao_Paulo') AS entry_day
    FROM public.leads l
    INNER JOIN public.messages m
      ON m.lead_id = l.id
     AND m.direction = 'inbound'
    WHERE l.operation_id = op_id
    GROUP BY l.id
  )
  SELECT
    ld.entry_day AS day,
    t.id AS tag_id,
    t.name AS tag_name,
    t.color AS tag_color,
    COUNT(DISTINCT ld.id)::bigint AS total
  FROM lead_dates ld
  JOIN public.lead_tags lt ON lt.lead_id = ld.id
  JOIN public.tags t ON t.id = lt.tag_id
  GROUP BY ld.entry_day, t.id, t.name, t.color
  ORDER BY ld.entry_day DESC
  LIMIT 30;
$function$;