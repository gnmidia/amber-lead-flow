
CREATE TABLE IF NOT EXISTS public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  product_name text,
  price numeric(12,2) NOT NULL,
  pix_key text,
  recipient text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offers_price_unique UNIQUE (price)
);

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open all offers" ON public.offers;
CREATE POLICY "open all offers" ON public.offers FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_offers_updated ON public.offers;
CREATE TRIGGER trg_offers_updated BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
