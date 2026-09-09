select cron.schedule(
  'invoice-alerts-daily-8am-brt',
  '0 11 * * *',
  $$
  select net.http_post(
    url := 'https://project--fcec170c-02fc-4a96-9829-b74eced227f5.lovable.app/api/public/hooks/invoice-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer 0142e26c7f21248124fe825ef28ceea371cc5a3708a14fd7'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);