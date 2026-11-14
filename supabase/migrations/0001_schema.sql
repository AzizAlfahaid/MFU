create extension if not exists pgcrypto;

create table households (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  timezone text not null default 'Asia/Riyadh',
  missed_wait_minutes int not null default 30 check (missed_wait_minutes between 5 and 240)
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  household_id uuid not null references households on delete cascade,
  role text not null check (role in ('elder','helper','family')),
  display_name text not null,
  lang text not null default 'ar' check (lang in ('ar','en')),
  telegram_chat_id bigint,
  telegram_link_code text unique not null default encode(gen_random_bytes(12), 'hex')
);
create index on profiles (household_id);

create table medications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references households on delete cascade,
  name text not null,
  dose text not null,
  notes text,
  photo_path text,
  active boolean not null default true
);
create index on medications (household_id);

create table medication_times (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references households on delete cascade,
  medication_id uuid not null references medications on delete cascade,
  time_of_day time not null,
  unique (medication_id, time_of_day)
);

create table doses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references households on delete cascade,
  medication_id uuid not null references medications on delete cascade,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','taken','taken_late','missed')),
  taken_at timestamptz,
  taken_by uuid references profiles on delete set null,
  reminder_sent_at timestamptz,
  missed_alert_sent_at timestamptz,
  late_alert_sent_at timestamptz,
  unique (medication_id, scheduled_at)
);
create index on doses (household_id, scheduled_at);

create table readings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references households on delete cascade,
  type text not null check (type in ('sugar','bp','temp')),
  context text check (context in ('fasting','after_meal','other')),
  value1 numeric not null,
  value2 numeric,
  pulse numeric,
  taken_at timestamptz not null default now(),
  entered_by uuid references profiles on delete set null,
  photo_path text,
  source text not null default 'typed' check (source in ('typed','photo')),
  out_of_range boolean not null default false,
  alert_sent_at timestamptz,
  check ((type = 'sugar') = (context is not null)),
  check (type <> 'bp' or value2 is not null)
);
create index on readings (household_id, type, taken_at);

create table ranges (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references households on delete cascade,
  key text not null check (key in ('sugar_fasting','sugar_after_meal','sugar_other','bp_systolic','bp_diastolic','temp')),
  low numeric not null,
  high numeric not null,
  check (high > low),
  unique (household_id, key)
);

create table hospitals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references households on delete cascade,
  name text not null,
  unique (household_id, name)
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references households on delete cascade,
  starts_at timestamptz not null,
  hospital_id uuid references hospitals on delete set null,
  doctor text,
  purpose text,
  notes text,
  day_before_sent_at timestamptz,
  day_of_sent_at timestamptz
);
create index on appointments (household_id, starts_at);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references households on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null
);
create index on push_subscriptions (user_id);

-- Live updates for the Today screen.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table doses;
  end if;
end $$;
