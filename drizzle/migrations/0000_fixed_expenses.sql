CREATE TABLE public.fixed_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  is_estimate boolean NOT NULL DEFAULT false,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  frequency text NOT NULL DEFAULT 'monthly',
  interval_months integer NOT NULL DEFAULT 1,
  due_day integer NOT NULL DEFAULT 10,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text,
  note text,
  active boolean NOT NULL DEFAULT true,
  source_signature text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fixed_expenses_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT fixed_expenses_amount_pos CHECK (amount >= 0 AND amount < 100000000),
  CONSTRAINT fixed_expenses_frequency CHECK (frequency IN ('weekly', 'monthly', 'yearly', 'custom')),
  CONSTRAINT fixed_expenses_interval CHECK (interval_months BETWEEN 1 AND 24),
  CONSTRAINT fixed_expenses_due_day CHECK (due_day BETWEEN 1 AND 31),
  CONSTRAINT fixed_expenses_note_len CHECK (note IS NULL OR char_length(note) <= 500)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_expenses TO authenticated;
GRANT ALL ON public.fixed_expenses TO service_role;
ALTER TABLE public.fixed_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own fixed expenses" ON public.fixed_expenses FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX fixed_expenses_user_idx ON public.fixed_expenses (user_id);
CREATE TRIGGER fixed_expenses_updated_at BEFORE UPDATE ON public.fixed_expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.fixed_expense_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fixed_expense_id uuid NOT NULL REFERENCES public.fixed_expenses(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  due_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_transaction boolean NOT NULL DEFAULT false,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fixed_expense_payments_amount CHECK (amount >= 0),
  CONSTRAINT fixed_expense_payments_period UNIQUE (fixed_expense_id, period_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_expense_payments TO authenticated;
GRANT ALL ON public.fixed_expense_payments TO service_role;
ALTER TABLE public.fixed_expense_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own fixed expense payments" ON public.fixed_expense_payments FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.fixed_expenses f WHERE f.id = fixed_expense_id AND f.user_id = auth.uid())
  );
CREATE INDEX fixed_expense_payments_user_idx ON public.fixed_expense_payments (user_id);
CREATE UNIQUE INDEX fixed_expense_payments_tx_unique ON public.fixed_expense_payments (transaction_id) WHERE transaction_id IS NOT NULL;

CREATE TABLE public.recurrence_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  signature text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurrence_dismissals_unique UNIQUE (user_id, signature)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurrence_dismissals TO authenticated;
GRANT ALL ON public.recurrence_dismissals TO service_role;
ALTER TABLE public.recurrence_dismissals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recurrence dismissals" ON public.recurrence_dismissals FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);