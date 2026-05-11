DO $$
DECLARE
  pair record;
  main_id uuid;
  dup_id uuid;
  c_msg int; c_tag int; c_lfs int; c_sm int; c_sales int;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('553798184946@s.whatsapp.net', '9904781791403@lid'),
      ('556984497325@s.whatsapp.net', '59704508158053@lid')
    ) AS t(main_jid, dup_jid)
  LOOP
    SELECT id INTO main_id FROM public.leads WHERE remote_jid = pair.main_jid LIMIT 1;
    SELECT id INTO dup_id  FROM public.leads WHERE remote_jid = pair.dup_jid  LIMIT 1;
    IF main_id IS NULL OR dup_id IS NULL THEN
      RAISE NOTICE 'skip pair main=% dup=% (not found)', pair.main_jid, pair.dup_jid;
      CONTINUE;
    END IF;

    WITH x AS (UPDATE public.messages SET lead_id = main_id WHERE lead_id = dup_id RETURNING 1)
      SELECT count(*) INTO c_msg FROM x;
    WITH x AS (UPDATE public.lead_tags SET lead_id = main_id WHERE lead_id = dup_id RETURNING 1)
      SELECT count(*) INTO c_tag FROM x;
    WITH x AS (UPDATE public.lead_funnel_states SET lead_id = main_id WHERE lead_id = dup_id RETURNING 1)
      SELECT count(*) INTO c_lfs FROM x;
    WITH x AS (UPDATE public.scheduled_messages SET lead_id = main_id WHERE lead_id = dup_id RETURNING 1)
      SELECT count(*) INTO c_sm FROM x;
    WITH x AS (UPDATE public.sales SET lead_id = main_id WHERE lead_id = dup_id RETURNING 1)
      SELECT count(*) INTO c_sales FROM x;

    DELETE FROM public.leads WHERE id = dup_id;

    RAISE NOTICE 'merged % -> % (messages=%, lead_tags=%, lead_funnel_states=%, scheduled_messages=%, sales=%)',
      pair.dup_jid, pair.main_jid, c_msg, c_tag, c_lfs, c_sm, c_sales;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_remote_jid_unique
ON public.leads(operation_id, remote_jid)
WHERE remote_jid IS NOT NULL;