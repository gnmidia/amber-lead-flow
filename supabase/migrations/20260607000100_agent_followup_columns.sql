-- Controle do follow-up do agente (a pergunta "entrou no grupo?" tratada como
-- mecanismo separado, baseado em tempo, e NÃO dentro de cada resposta da conversa).
ALTER TABLE public.lead_active_agents
  ADD COLUMN IF NOT EXISTS follow_up_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_follow_up_at timestamptz;
