CREATE TABLE IF NOT EXISTS public.group_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id text NOT NULL,
  group_name text,
  participant_jid text NOT NULL,
  phone_number text,
  action text NOT NULL CHECK (action IN ('add', 'remove', 'promote', 'demote')),
  instance_name text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS group_events_group_id_idx ON public.group_events(group_id);
CREATE INDEX IF NOT EXISTS group_events_occurred_at_idx ON public.group_events(occurred_at);
CREATE INDEX IF NOT EXISTS group_events_action_idx ON public.group_events(action);

ALTER TABLE public.group_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open all group_events" ON public.group_events FOR ALL USING (true) WITH CHECK (true);