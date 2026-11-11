ALTER TABLE public.installment_purchases ADD COLUMN manual_installments_paid integer;
COMMENT ON COLUMN public.installment_purchases.manual_installments_paid IS 'Manual paid prefix; installments_paid is the total of manual and invoice-settled installments, including non-contiguous periods.';
CREATE OR REPLACE FUNCTION public.sync_installment_progress() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE manual_count integer; effective_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    manual_count := COALESCE(NEW.manual_installments_paid, NEW.installments_paid, 0);
  ELSIF NEW.manual_installments_paid IS DISTINCT FROM OLD.manual_installments_paid THEN
    manual_count := COALESCE(NEW.manual_installments_paid, 0);
  ELSIF NEW.installments_paid IS DISTINCT FROM OLD.installments_paid THEN
    manual_count := NEW.installments_paid;
  ELSE
    manual_count := COALESCE(OLD.manual_installments_paid, OLD.installments_paid, 0);
  END IF;
  NEW.manual_installments_paid := LEAST(GREATEST(manual_count, 0), GREATEST(NEW.installments_count, 1));
  SELECT count(*) INTO effective_count FROM generate_series(0, GREATEST(NEW.installments_count, 1) - 1) AS n
  WHERE n < NEW.manual_installments_paid OR EXISTS (
    SELECT 1 FROM public.card_invoice_payments ip
    WHERE ip.user_id = NEW.user_id AND ip.card_id = NEW.card_id
      AND ip.invoice_key = to_char(NEW.first_due_date + make_interval(months => n), 'YYYY-MM')
  );
  NEW.installments_paid := effective_count;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_installment_progress() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_installment_progress() TO authenticated, service_role;
CREATE TRIGGER installment_progress_before_write BEFORE INSERT OR UPDATE ON public.installment_purchases FOR EACH ROW EXECUTE FUNCTION public.sync_installment_progress();
CREATE OR REPLACE FUNCTION public.sync_invoice_installments() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE public.installment_purchases SET manual_installments_paid = COALESCE(manual_installments_paid, installments_paid)
    WHERE user_id = OLD.user_id AND card_id = OLD.card_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE public.installment_purchases SET manual_installments_paid = COALESCE(manual_installments_paid, installments_paid)
    WHERE user_id = NEW.user_id AND card_id = NEW.card_id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_invoice_installments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_invoice_installments() TO authenticated, service_role;
CREATE TRIGGER invoice_installments_after_write AFTER INSERT OR UPDATE OR DELETE ON public.card_invoice_payments FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_installments();