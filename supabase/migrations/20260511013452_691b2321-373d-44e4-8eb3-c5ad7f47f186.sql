CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.operations(id),
  lead_id uuid NOT NULL REFERENCES public.leads(id),
  offer_id uuid NOT NULL REFERENCES public.offers(id),
  amount numeric(10,2) NOT NULL,
  sale_date date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_operation ON public.sales(operation_id, sale_date DESC);
CREATE INDEX idx_sales_lead ON public.sales(lead_id);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open all sales" ON public.sales FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.sales_summary(op_id uuid, date_from date, date_to date)
RETURNS json
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT json_build_object(
    'total_sales', COUNT(*),
    'total_revenue', COALESCE(SUM(amount), 0),
    'avg_ticket', COALESCE(AVG(amount), 0),
    'sales_per_day', (
      SELECT json_agg(row_to_json(d)) FROM (
        SELECT sale_date AS day, COUNT(*) AS sales, SUM(amount) AS revenue
        FROM public.sales
        WHERE operation_id = op_id AND sale_date BETWEEN date_from AND date_to
        GROUP BY sale_date ORDER BY sale_date
      ) d
    )
  )
  FROM public.sales
  WHERE operation_id = op_id AND sale_date BETWEEN date_from AND date_to;
$$;