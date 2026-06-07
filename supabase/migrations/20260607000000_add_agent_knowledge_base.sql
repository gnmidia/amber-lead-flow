-- Base de conhecimento do agente: texto livre onde se cola tudo que o agente
-- precisa saber para responder o lead (detalhes da aula/lançamento, FAQ,
-- objeções, preço, links, datas, etc.). Sem isso o agente não tem o que
-- responder e cai em respostas genéricas ou inventadas.
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS knowledge_base text;
