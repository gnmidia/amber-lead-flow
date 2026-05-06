UPDATE public.lead_funnel_states lfs
SET status = 'completed', completed_at = now()
WHERE lfs.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.scheduled_messages sm
    WHERE sm.lead_id = lfs.lead_id
      AND sm.funnel_id = lfs.funnel_id
      AND sm.status IN ('pending','dispatching')
  );