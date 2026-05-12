ALTER TABLE public.lead_active_agents 
ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
ADD COLUMN IF NOT EXISTS pending_messages text DEFAULT '';

CREATE OR REPLACE FUNCTION public.process_pending_agents()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT lead_id, agent_id, flow_id, resume_block_index, pending_messages
    FROM public.lead_active_agents
    WHERE
      last_message_at IS NOT NULL
      AND pending_messages IS NOT NULL
      AND pending_messages <> ''
      AND last_message_at <= now() - interval '30 seconds'
  LOOP
    UPDATE public.lead_active_agents
    SET pending_messages = '', last_message_at = NULL
    WHERE lead_id = r.lead_id;

    PERFORM net.http_post(
      url := 'https://project--4cb49bae-afe3-4c97-ab68-38e668ee52f9-dev.lovable.app/api/public/process-agent',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := json_build_object(
        'lead_id', r.lead_id,
        'agent_id', r.agent_id,
        'accumulated_message', r.pending_messages
      )::jsonb
    );
  END LOOP;
END;
$$;