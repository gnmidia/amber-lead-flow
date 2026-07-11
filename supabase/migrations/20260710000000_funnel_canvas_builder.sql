-- ============================================================
-- FUNIL BUILDER 2D (estilo ManyChat) — FASE 1: modelo de dados
-- Novas tabelas: funnel_blocks, funnel_actions, funnel_edges,
-- funnel_ab_outputs. NÃO altera funnels/funnel_steps/scheduled_messages
-- (os funis atuais continuam rodando pelo caminho antigo até a migração).
-- TODAS as tabelas carregam operation_id NOT NULL para isolamento por
-- projeto — toda query da aplicação DEVE filtrar por operation_id.
-- ============================================================

-- ───── Nós do canvas (bloco de ações ou divisor A/B) ─────
CREATE TABLE public.funnel_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL REFERENCES public.operations(id),
  title text,
  node_type text NOT NULL CHECK (node_type IN ('block','ab_split')),
  position_x float8 NOT NULL DEFAULT 0,
  position_y float8 NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ───── Ações dentro de um bloco (só node_type='block') ─────
-- config jsonb por tipo (definido na Fase 4):
--   texto:      { "content": "..." }
--   audio/imagem/video/documento: { "media_url", "file_name", "mimetype", "caption" }
--   tag:        { "tag_id", "tag_operation": "assign"|"remove" }
--   delay:      { "value": 5, "unit": "seconds"|"minutes"|"hours" }
CREATE TABLE public.funnel_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid NOT NULL REFERENCES public.funnel_blocks(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL REFERENCES public.operations(id),
  type text NOT NULL CHECK (type IN ('texto','audio','imagem','video','documento','delay','tag')),
  order_index int NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ───── Ligações do canvas (saída de um nó → entrada de outro) ─────
-- source_handle identifica QUAL saída quando o source é um A/B split
-- (ex: "out-0", "out-1"...). Para bloco comum fica null (saída única).
CREATE TABLE public.funnel_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL REFERENCES public.operations(id),
  source_block_id uuid NOT NULL REFERENCES public.funnel_blocks(id) ON DELETE CASCADE,
  source_handle text,
  target_block_id uuid NOT NULL REFERENCES public.funnel_blocks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ───── Saídas de um nó A/B (2 a 10, peso igual por padrão) ─────
-- weight fica preparado para pesos custom no futuro; o motor normaliza
-- (peso da saída / soma dos pesos), então default 1 = 1/N igual.
CREATE TABLE public.funnel_ab_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid NOT NULL REFERENCES public.funnel_blocks(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL REFERENCES public.operations(id),
  output_index int NOT NULL,
  weight numeric NOT NULL DEFAULT 1 CHECK (weight > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (block_id, output_index)
);

-- ───── Índices para as queries do builder e do motor ─────
CREATE INDEX idx_funnel_blocks_funnel     ON public.funnel_blocks(funnel_id);
CREATE INDEX idx_funnel_blocks_operation  ON public.funnel_blocks(operation_id);
CREATE INDEX idx_funnel_actions_block     ON public.funnel_actions(block_id, order_index);
CREATE INDEX idx_funnel_actions_operation ON public.funnel_actions(operation_id);
CREATE INDEX idx_funnel_edges_funnel      ON public.funnel_edges(funnel_id);
CREATE INDEX idx_funnel_edges_source      ON public.funnel_edges(source_block_id);
CREATE INDEX idx_funnel_edges_operation   ON public.funnel_edges(operation_id);
CREATE INDEX idx_funnel_ab_outputs_block  ON public.funnel_ab_outputs(block_id);

-- ───── RLS: mesmo padrão das demais tabelas do projeto ─────
-- (política aberta como o restante do schema atual; o endurecimento por
-- operação é uma frente separada já mapeada na auditoria)
ALTER TABLE public.funnel_blocks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_actions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_edges      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_ab_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open all funnel_blocks"     ON public.funnel_blocks     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open all funnel_actions"    ON public.funnel_actions    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open all funnel_edges"      ON public.funnel_edges      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open all funnel_ab_outputs" ON public.funnel_ab_outputs FOR ALL USING (true) WITH CHECK (true);
