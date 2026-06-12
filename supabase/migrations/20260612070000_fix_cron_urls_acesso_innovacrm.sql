-- CORREÇÃO CRÍTICA: os cron jobs apontavam para uma URL antiga/morta do Lovable
-- (project--4cb49bae-...-dev.lovable.app), então o dispatcher de mensagens e o
-- processamento de agentes NUNCA rodavam no servidor de produção. Resultado:
-- fluxos/funis agendavam mensagens em scheduled_messages, mas nada era enviado
-- (mensagens presas em "pending") — parecia que o fluxo "não disparava".
-- Aqui re-apontamos tudo para o deploy atual: https://acesso.innovacrm.online

-- 1. Cron do dispatcher de mensagens (funil/fluxo) — re-agenda com a URL correta.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-funnel-messages') THEN
    PERFORM cron.unschedule('dispatch-funnel-messages');
  END IF;
END $$;

SELECT cron.schedule(
  'dispatch-funnel-messages',
  '30 seconds',
  $$
  SELECT net.http_post(
    url := 'https://acesso.innovacrm.online/api/public/message-dispatcher',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 2. Função de processamento de agentes — recria com a URL correta embutida.
--    (Conserta a URL independentemente de qual cron chame process_pending_agents.)
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
      url := 'https://acesso.innovacrm.online/api/public/process-agent',
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

-- 3. Garante que o processamento de agentes esteja agendado (idempotente).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-pending-agents') THEN
    PERFORM cron.unschedule('process-pending-agents');
  END IF;
END $$;

SELECT cron.schedule(
  'process-pending-agents',
  '30 seconds',
  $$ SELECT public.process_pending_agents(); $$
);
