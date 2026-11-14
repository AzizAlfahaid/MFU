-- ============ helper functions ============
create function my_household() returns uuid language sql stable security definer set search_path = public as $$
  select household_id from profiles where id = auth.uid() $$;
create function my_role() returns text language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() $$;

create function create_household(p_name text, p_display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then raise exception 'already_has_household'; end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_display_name), '') = '' then raise exception 'name_required'; end if;
  insert into households(name) values (trim(p_name)) returning id into hid;
  insert into profiles(id, household_id, role, display_name) values (auth.uid(), hid, 'family', trim(p_display_name));
  return hid;
end $$;

create function mark_slot_taken(p_slot timestamptz) returns int
language plpgsql security definer set search_path = public as $$
declare hid uuid := my_household(); n int; m int;
begin
  if hid is null then raise exception 'no_household'; end if;
  if p_slot > now() then raise exception 'not_due'; end if;
  update doses set status = 'taken', taken_at = now(), taken_by = auth.uid()
   where household_id = hid and scheduled_at = p_slot and status = 'pending';
  get diagnostics n = row_count;
  update doses d set status = 'taken_late', taken_at = now(), taken_by = auth.uid()
   where d.household_id = hid and d.scheduled_at = p_slot and d.status = 'missed'
     and not exists (select 1 from doses d2 where d2.medication_id = d.medication_id
                       and d2.scheduled_at > p_slot and d2.scheduled_at <= now());
  get diagnostics m = row_count;
  return n + m;
end $$;

create function household_members() returns table (id uuid, role text, display_name text, lang text, has_telegram boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.role, p.display_name, p.lang, p.telegram_chat_id is not null
    from profiles p where p.household_id = my_household() $$;

create function my_telegram() returns table (telegram_chat_id bigint, telegram_link_code text)
language sql stable security definer set search_path = public as $$
  select p.telegram_chat_id, p.telegram_link_code from profiles p where p.id = auth.uid() $$;

-- Helpers may change only a medicine's photo.
create function medications_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or my_role() = 'family' then return new; end if;
  if my_role() = 'helper'
     and (new.household_id, new.name, new.dose, new.notes, new.active)
         is not distinct from (old.household_id, old.name, old.dose, old.notes, old.active) then
    return new;
  end if;
  raise exception 'only_family_can_edit_medicines';
end $$;
create trigger medications_guard before update on medications for each row execute function medications_guard();

-- ============ grants (explicit; nothing relies on defaults) ============
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function my_household(), my_role(), create_household(text, text), mark_slot_taken(timestamptz),
  household_members(), my_telegram() to authenticated;

grant select on households, medications, medication_times, doses, ranges, hospitals, appointments, readings, push_subscriptions to authenticated;
grant select (id, created_at, household_id, role, display_name, lang) on profiles to authenticated;
grant update (display_name, lang) on profiles to authenticated;
grant insert, update, delete on medications, medication_times, ranges, hospitals, appointments to authenticated;
grant update (name, timezone, missed_wait_minutes) on households to authenticated;
grant insert (household_id, type, context, value1, value2, pulse, taken_at, entered_by, photo_path, source, out_of_range) on readings to authenticated;
grant delete on readings to authenticated;
grant insert, delete on push_subscriptions to authenticated;
grant update (p256dh, auth) on push_subscriptions to authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- ============ row-level security ============
alter table households enable row level security;
alter table profiles enable row level security;
alter table medications enable row level security;
alter table medication_times enable row level security;
alter table doses enable row level security;
alter table readings enable row level security;
alter table ranges enable row level security;
alter table hospitals enable row level security;
alter table appointments enable row level security;
alter table push_subscriptions enable row level security;

create policy households_select on households for select to authenticated using (id = my_household());
create policy households_update on households for update to authenticated
  using (id = my_household() and my_role() = 'family') with check (id = my_household());

create policy profiles_select on profiles for select to authenticated using (household_id = my_household());
create policy profiles_update_self on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- family-managed tables
do $$
declare tbl text;
begin
  foreach tbl in array array['medication_times','ranges','hospitals','appointments'] loop
    execute format('create policy %1$s_select on %1$s for select to authenticated using (household_id = my_household())', tbl);
    execute format('create policy %1$s_write on %1$s for all to authenticated using (household_id = my_household() and my_role() = ''family'') with check (household_id = my_household() and my_role() = ''family'')', tbl);
  end loop;
end $$;

create policy medications_select on medications for select to authenticated using (household_id = my_household());
create policy medications_insert on medications for insert to authenticated with check (household_id = my_household() and my_role() = 'family');
create policy medications_delete on medications for delete to authenticated using (household_id = my_household() and my_role() = 'family');
create policy medications_update on medications for update to authenticated
  using (household_id = my_household() and my_role() in ('family','helper'))
  with check (household_id = my_household());

create policy doses_select on doses for select to authenticated using (household_id = my_household());

create policy readings_select on readings for select to authenticated using (household_id = my_household());
create policy readings_insert on readings for insert to authenticated with check (household_id = my_household() and entered_by = auth.uid());
create policy readings_delete on readings for delete to authenticated using (household_id = my_household() and my_role() = 'family');

create policy push_select on push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_insert on push_subscriptions for insert to authenticated with check (user_id = auth.uid() and household_id = my_household());
create policy push_update on push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_delete on push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- ============ private file storage ============
insert into storage.buckets (id, name, public) values ('household-files', 'household-files', false) on conflict (id) do nothing;

create policy household_files_select on storage.objects for select to authenticated
  using (bucket_id = 'household-files' and (storage.foldername(name))[1] = my_household()::text);
create policy household_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'household-files' and (storage.foldername(name))[1] = my_household()::text);
create policy household_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'household-files' and (storage.foldername(name))[1] = my_household()::text and my_role() = 'family');
