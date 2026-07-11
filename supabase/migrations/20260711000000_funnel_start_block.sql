-- Nó "Início" explícito do builder 2D.
-- start_block_id aponta o PRIMEIRO bloco do funil (a edge que sai do nó
-- verde "Início" no canvas). O motor usa esta coluna; a dedução por
-- "bloco sem entrada" vira apenas fallback para funis antigos do canvas.
-- ON DELETE SET NULL: excluir o bloco inicial desconecta o início (o
-- builder mostra o nó Início solto de novo, sem quebrar nada).
ALTER TABLE public.funnels
  ADD COLUMN IF NOT EXISTS start_block_id uuid REFERENCES public.funnel_blocks(id) ON DELETE SET NULL;

-- Posição do nó Início no canvas (por funil).
ALTER TABLE public.funnels
  ADD COLUMN IF NOT EXISTS start_node_x float8 NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS start_node_y float8 NOT NULL DEFAULT 160;
