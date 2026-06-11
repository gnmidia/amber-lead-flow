-- Multi-conexão: registra a instância Evolution "NovoCrm" e a vincula à
-- operação "Lançamento", removendo a dependência das variáveis de ambiente
-- da VPS (EVOLUTION_API_KEY / EVOLUTION_INSTANCE_NAME). A partir daqui as
-- credenciais vêm do banco (tabela instances), resolvidas por operação:
--   lead.operation_id -> operations.instance_name -> instances.{api_key, base_url}

-- 1. Upsert da instância NovoCrm com suas próprias credenciais,
--    vinculada à operação "Lançamento" (já existente no banco).
INSERT INTO public.instances (instance_name, api_key, base_url, operation_id, status)
SELECT 'NovoCrm',
       '33FE818546F3-4A16-9144-82B7958034C5',
       'https://evolution.innovacrm.online',
       o.id,
       'disconnected'
FROM public.operations o
WHERE o.name ILIKE 'lan%amento' OR o.slug ILIKE 'lan%amento'
ORDER BY o.created_at
LIMIT 1
ON CONFLICT (instance_name) DO UPDATE
  SET api_key      = EXCLUDED.api_key,
      base_url     = EXCLUDED.base_url,
      operation_id = EXCLUDED.operation_id;

-- 2. Aponta a operação Lançamento para a instância NovoCrm.
UPDATE public.operations
SET instance_name = 'NovoCrm'
WHERE name ILIKE 'lan%amento' OR slug ILIKE 'lan%amento';
