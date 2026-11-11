-- Synthetic fixtures only. Run against a disposable local PostgreSQL database.
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE public.installment_purchases (
 id text PRIMARY KEY, user_id text, card_id text, installments_count integer,
 installments_paid integer, first_due_date date
);
CREATE TABLE public.card_invoice_payments (
 id text PRIMARY KEY, user_id text, card_id text, invoice_key text,
 UNIQUE(card_id, invoice_key)
);
CREATE TABLE public.transactions (
 id text PRIMARY KEY, invoice_payment_id text UNIQUE REFERENCES public.card_invoice_payments(id) ON DELETE CASCADE
);
INSERT INTO public.installment_purchases VALUES ('scooter', 'a', 'card-a', 10, 1, '2026-10-10'), ('other-user', 'b', 'card-b', 10, 1, '2026-10-10');
\ir ../../drizzle/migrations/0003_invoice_installment_progress.sql
DO $$
BEGIN
 INSERT INTO public.card_invoice_payments VALUES ('pay', 'a', 'card-a', '2026-11');
 INSERT INTO public.transactions VALUES ('cash', 'pay');
 IF (SELECT installments_paid FROM public.installment_purchases WHERE id='scooter') <> 2 THEN RAISE EXCEPTION 'Expected 2 paid installments'; END IF;
 IF (SELECT installments_paid FROM public.installment_purchases WHERE id='other-user') <> 1 THEN RAISE EXCEPTION 'Cross-user update'; END IF;
 INSERT INTO public.card_invoice_payments VALUES ('repeat', 'a', 'card-a', '2026-11') ON CONFLICT (card_id,invoice_key) DO NOTHING;
 IF (SELECT count(*) FROM public.card_invoice_payments) <> 1 THEN RAISE EXCEPTION 'Duplicate payment'; END IF;
 INSERT INTO public.card_invoice_payments VALUES ('later', 'a', 'card-a', '2027-01');
 IF (SELECT installments_paid FROM public.installment_purchases WHERE id='scooter') <> 3 THEN RAISE EXCEPTION 'Out-of-order total incorrect'; END IF;
 UPDATE public.installment_purchases SET first_due_date=first_due_date WHERE id='scooter';
 IF (SELECT manual_installments_paid FROM public.installment_purchases WHERE id='scooter') <> 1 THEN RAISE EXCEPTION 'Effective progress became manual prefix'; END IF;
 DELETE FROM public.card_invoice_payments WHERE id='pay';
 IF (SELECT installments_paid FROM public.installment_purchases WHERE id='scooter') <> 2 THEN RAISE EXCEPTION 'Undo incorrect'; END IF;
 IF EXISTS(SELECT 1 FROM public.transactions WHERE id='cash') THEN RAISE EXCEPTION 'Cash transaction not removed by cascade'; END IF;
 DELETE FROM public.card_invoice_payments WHERE id='later';
 IF (SELECT installments_paid FROM public.installment_purchases WHERE id='scooter') <> 1 THEN RAISE EXCEPTION 'Manual progress erased'; END IF;
 UPDATE public.installment_purchases SET manual_installments_paid=2 WHERE id='scooter';
 INSERT INTO public.card_invoice_payments VALUES ('overlap', 'a', 'card-a', '2026-11');
 IF (SELECT installments_paid FROM public.installment_purchases WHERE id='scooter') <> 2 THEN RAISE EXCEPTION 'Overlap counted twice'; END IF;
END $$;