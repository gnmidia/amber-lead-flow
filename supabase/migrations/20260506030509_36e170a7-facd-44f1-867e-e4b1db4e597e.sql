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
    url := 'https://project--4cb49bae-afe3-4c97-ab68-38e668ee52f9-dev.lovable.app/api/public/message-dispatcher',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);