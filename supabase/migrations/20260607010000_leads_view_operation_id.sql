-- Adiciona operation_id à view leads_with_last_message para que o Chat Oficial
-- possa filtrar os leads por operação (antes era impossível, e a lista ficava
-- limitada a 200 leads misturando operações — leads sumiam durante o lançamento).
-- CREATE OR REPLACE exige manter as MESMAS colunas na mesma ordem e só adicionar
-- novas no final, por isso operation_id entra por último.
CREATE OR REPLACE VIEW public.leads_with_last_message AS
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
  ) AS tags_data,
  l.operation_id
FROM public.leads l
LEFT JOIN LATERAL (
  SELECT messages.content, messages.type, messages.sent_at, messages.direction
  FROM public.messages
  WHERE messages.lead_id = l.id
  ORDER BY messages.sent_at DESC
  LIMIT 1
) m ON true;

ALTER VIEW public.leads_with_last_message SET (security_invoker = true);
