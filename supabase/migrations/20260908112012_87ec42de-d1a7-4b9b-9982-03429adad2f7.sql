CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own push subscriptions" ON public.push_subscriptions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_push_subscriptions_upd BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions(user_id);

CREATE TABLE public.invoice_alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  invoice_key text NOT NULL,
  alert_offset integer NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, invoice_key, alert_offset)
);
GRANT SELECT ON public.invoice_alert_log TO authenticated;
GRANT ALL ON public.invoice_alert_log TO service_role;
ALTER TABLE public.invoice_alert_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own alert log" ON public.invoice_alert_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);