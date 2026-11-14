-- Server-only settings (cron secret, VAPID keys, webhook secret). RLS is on with no policies and no
-- grants for signed-in users or anonymous visitors: only the service role (Edge Functions) can read it.
create table app_secrets (
  key text primary key,
  value text not null
);
alter table app_secrets enable row level security;
revoke all on app_secrets from anon, authenticated;
grant all on app_secrets to service_role;

alter function appointments_reset_reminders() set search_path = public;
