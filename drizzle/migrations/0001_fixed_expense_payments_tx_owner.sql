DROP POLICY "own fixed expense payments" ON public.fixed_expense_payments;
CREATE POLICY "own fixed expense payments" ON public.fixed_expense_payments FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.fixed_expenses f WHERE f.id = fixed_expense_id AND f.user_id = auth.uid())
    AND (transaction_id IS NULL OR EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND t.user_id = auth.uid()))
  );