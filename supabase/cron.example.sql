-- Runs the reminder job every minute. Replace the two placeholders, then run once in the Supabase SQL editor.
--   <PROJECT_REF>  your Supabase project reference (the part before .supabase.co)
--   <CRON_SECRET>  the same random value stored as the CRON_SECRET function secret
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'mfu-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/tick',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
