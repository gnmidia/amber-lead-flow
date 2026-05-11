
-- 1. Tabela operations
CREATE TABLE public.operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  instance_name text,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open all operations" ON public.operations FOR ALL USING (true) WITH CHECK (true);

-- 2. Coluna operation_id nas tabelas raiz (nullable inicialmente)
ALTER TABLE public.leads      ADD COLUMN operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.funnels    ADD COLUMN operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.flows      ADD COLUMN operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.offers     ADD COLUMN operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.tags       ADD COLUMN operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.agents     ADD COLUMN operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.broadcasts ADD COLUMN operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.instances  ADD COLUMN operation_id uuid REFERENCES public.operations(id);

-- 3. Backfill — operação padrão (UUID fixo)
INSERT INTO public.operations (id, name, slug, instance_name)
VALUES ('11111111-1111-1111-1111-111111111111', 'Matrix do Youtube', 'matrix-youtube', 'DashWhats');

UPDATE public.leads      SET operation_id = '11111111-1111-1111-1111-111111111111' WHERE operation_id IS NULL;
UPDATE public.funnels    SET operation_id = '11111111-1111-1111-1111-111111111111' WHERE operation_id IS NULL;
UPDATE public.flows      SET operation_id = '11111111-1111-1111-1111-111111111111' WHERE operation_id IS NULL;
UPDATE public.offers     SET operation_id = '11111111-1111-1111-1111-111111111111' WHERE operation_id IS NULL;
UPDATE public.tags       SET operation_id = '11111111-1111-1111-1111-111111111111' WHERE operation_id IS NULL;
UPDATE public.agents     SET operation_id = '11111111-1111-1111-1111-111111111111' WHERE operation_id IS NULL;
UPDATE public.broadcasts SET operation_id = '11111111-1111-1111-1111-111111111111' WHERE operation_id IS NULL;
UPDATE public.instances  SET operation_id = '11111111-1111-1111-1111-111111111111' WHERE operation_id IS NULL;

-- 4. NOT NULL após backfill
ALTER TABLE public.leads      ALTER COLUMN operation_id SET NOT NULL;
ALTER TABLE public.funnels    ALTER COLUMN operation_id SET NOT NULL;
ALTER TABLE public.flows      ALTER COLUMN operation_id SET NOT NULL;
ALTER TABLE public.offers     ALTER COLUMN operation_id SET NOT NULL;
ALTER TABLE public.tags       ALTER COLUMN operation_id SET NOT NULL;
ALTER TABLE public.agents     ALTER COLUMN operation_id SET NOT NULL;
ALTER TABLE public.broadcasts ALTER COLUMN operation_id SET NOT NULL;
ALTER TABLE public.instances  ALTER COLUMN operation_id SET NOT NULL;

-- 5. Default = operação padrão para novos inserts (evita quebrar código existente até a Etapa 2)
ALTER TABLE public.leads      ALTER COLUMN operation_id SET DEFAULT '11111111-1111-1111-1111-111111111111';
ALTER TABLE public.funnels    ALTER COLUMN operation_id SET DEFAULT '11111111-1111-1111-1111-111111111111';
ALTER TABLE public.flows      ALTER COLUMN operation_id SET DEFAULT '11111111-1111-1111-1111-111111111111';
ALTER TABLE public.offers     ALTER COLUMN operation_id SET DEFAULT '11111111-1111-1111-1111-111111111111';
ALTER TABLE public.tags       ALTER COLUMN operation_id SET DEFAULT '11111111-1111-1111-1111-111111111111';
ALTER TABLE public.agents     ALTER COLUMN operation_id SET DEFAULT '11111111-1111-1111-1111-111111111111';
ALTER TABLE public.broadcasts ALTER COLUMN operation_id SET DEFAULT '11111111-1111-1111-1111-111111111111';
ALTER TABLE public.instances  ALTER COLUMN operation_id SET DEFAULT '11111111-1111-1111-1111-111111111111';

-- 6. Índices de performance
CREATE INDEX idx_leads_operation      ON public.leads(operation_id, last_interaction_at DESC);
CREATE INDEX idx_funnels_operation    ON public.funnels(operation_id);
CREATE INDEX idx_flows_operation      ON public.flows(operation_id);
CREATE INDEX idx_offers_operation     ON public.offers(operation_id);
CREATE INDEX idx_broadcasts_operation ON public.broadcasts(operation_id);
CREATE INDEX idx_tags_operation       ON public.tags(operation_id);
CREATE INDEX idx_agents_operation     ON public.agents(operation_id);
CREATE INDEX idx_instances_operation  ON public.instances(operation_id);

-- 7. Segunda operação (vazia)
INSERT INTO public.operations (name, slug)
VALUES ('Saúde Mental', 'saude-mental');
