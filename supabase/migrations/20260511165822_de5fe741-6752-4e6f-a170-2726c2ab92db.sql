
-- 1) Backfill: para leads cuja first_contact_at está acima da menor sent_at do lead
--    (sintoma do sync que carimbou now()), corrigir para a menor sent_at de qualquer mensagem.
WITH min_msg AS (
  SELECT lead_id, MIN(sent_at) AS first_at
  FROM public.messages
  WHERE lead_id IS NOT NULL
  GROUP BY lead_id
)
UPDATE public.leads l
SET first_contact_at = m.first_at
FROM min_msg m
WHERE m.lead_id = l.id
  AND l.first_contact_at IS NOT NULL
  AND m.first_at < l.first_contact_at;

-- 2) Atualiza leads_per_day para contar apenas leads com mensagem inbound (lead realmente escreveu).
CREATE OR REPLACE FUNCTION public.leads_per_day(op_id uuid)
 RETURNS TABLE(day date, total bigint, new_leads bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH first_msg AS (
    SELECT m.lead_id, MIN(m.sent_at) AS first_at
    FROM public.messages m
    WHERE m.direction = 'inbound' AND m.lead_id IS NOT NULL
    GROUP BY m.lead_id
  )
  SELECT
    date((fm.first_at AT TIME ZONE 'America/Sao_Paulo')) AS day,
    COUNT(DISTINCT l.id) AS total,
    COUNT(DISTINCT l.id) FILTER (WHERE l.is_new_lead = true) AS new_leads
  FROM public.leads l
  JOIN first_msg fm ON fm.lead_id = l.id
  WHERE l.operation_id = op_id
  GROUP BY 1;
$function$;

-- 3) Mesma correção para leads_per_day_by_tag.
CREATE OR REPLACE FUNCTION public.leads_per_day_by_tag(op_id uuid)
 RETURNS TABLE(day date, tag_id uuid, tag_name text, tag_color text, total bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH first_msg AS (
    SELECT m.lead_id, MIN(m.sent_at) AS first_at
    FROM public.messages m
    WHERE m.direction = 'inbound' AND m.lead_id IS NOT NULL
    GROUP BY m.lead_id
  )
  SELECT
    date((fm.first_at AT TIME ZONE 'America/Sao_Paulo')) AS day,
    t.id AS tag_id,
    t.name AS tag_name,
    t.color AS tag_color,
    COUNT(DISTINCT l.id) AS total
  FROM public.leads l
  JOIN first_msg fm ON fm.lead_id = l.id
  JOIN public.lead_tags lt ON lt.lead_id = l.id
  JOIN public.tags t ON t.id = lt.tag_id
  WHERE l.operation_id = op_id
  GROUP BY 1, t.id, t.name, t.color;
$function$;
