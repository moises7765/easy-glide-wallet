CREATE TABLE public.card_invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  invoice_key text NOT NULL,
  due_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  paid_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (card_id, invoice_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_invoice_payments TO authenticated;
GRANT ALL ON public.card_invoice_payments TO service_role;

ALTER TABLE public.card_invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own invoice payments" ON public.card_invoice_payments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER t_card_invoice_payments_upd
  BEFORE UPDATE ON public.card_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS invoice_alerts_enabled boolean NOT NULL DEFAULT true;