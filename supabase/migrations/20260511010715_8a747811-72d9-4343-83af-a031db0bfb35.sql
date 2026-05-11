-- Drop old global views
DROP VIEW IF EXISTS public.leads_per_day CASCADE;
DROP VIEW IF EXISTS public.leads_per_day_by_tag CASCADE;

-- Recreate as RPC functions parameterized by operation_id, preserving original column shape
CREATE OR REPLACE FUNCTION public.leads_per_day(op_id uuid)
RETURNS TABLE(day date, total bigint, new_leads bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH first_msg AS (
    SELECT m.lead_id, MIN(m.sent_at) AS first_at
    FROM public.messages m
    WHERE m.direction = 'inbound' AND m.lead_id IS NOT NULL
    GROUP BY m.lead_id
  )
  SELECT
    date((COALESCE(fm.first_at, l.first_contact_at) AT TIME ZONE 'America/Sao_Paulo')) AS day,
    COUNT(DISTINCT l.id) AS total,
    COUNT(DISTINCT l.id) FILTER (WHERE l.is_new_lead = true) AS new_leads
  FROM public.leads l
  LEFT JOIN first_msg fm ON fm.lead_id = l.id
  WHERE COALESCE(fm.first_at, l.first_contact_at) IS NOT NULL
    AND l.operation_id = op_id
  GROUP BY 1;
$$;

CREATE OR REPLACE FUNCTION public.leads_per_day_by_tag(op_id uuid)
RETURNS TABLE(day date, tag_id uuid, tag_name text, tag_color text, total bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH first_msg AS (
    SELECT m.lead_id, MIN(m.sent_at) AS first_at
    FROM public.messages m
    WHERE m.direction = 'inbound' AND m.lead_id IS NOT NULL
    GROUP BY m.lead_id
  )
  SELECT
    date((COALESCE(fm.first_at, l.first_contact_at) AT TIME ZONE 'America/Sao_Paulo')) AS day,
    t.id AS tag_id,
    t.name AS tag_name,
    t.color AS tag_color,
    COUNT(DISTINCT l.id) AS total
  FROM public.leads l
  LEFT JOIN first_msg fm ON fm.lead_id = l.id
  JOIN public.lead_tags lt ON lt.lead_id = l.id
  JOIN public.tags t ON t.id = lt.tag_id
  WHERE COALESCE(fm.first_at, l.first_contact_at) IS NOT NULL
    AND l.operation_id = op_id
  GROUP BY 1, t.id, t.name, t.color;
$$;