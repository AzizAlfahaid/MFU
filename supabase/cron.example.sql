-- Runs the reminder job every minute. Replace the two placeholders, then run once in the Supabase SQL editor.
--   <PROJECT_REF>  your Supabase project reference (the part before .supabase.co)
--   The secret is read from the app_secrets table (key CRON_SECRET).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'mfu-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/tick',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where key = 'CRON_SECRET')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
