CREATE UNIQUE INDEX IF NOT EXISTS lead_tags_lead_tag_unique
  ON public.lead_tags(lead_id, tag_id);