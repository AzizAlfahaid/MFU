-- This installation serves one household. Anyone else who signs up gets no household, so no data,
-- no files and no access to the paid meter-reading function.
create or replace function create_household(p_name text, p_display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then raise exception 'already_has_household'; end if;
  if exists (select 1 from households) then raise exception 'household_exists'; end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_display_name), '') = '' then raise exception 'name_required'; end if;
  insert into households(name) values (trim(p_name)) returning id into hid;
  insert into profiles(id, household_id, role, display_name) values (auth.uid(), hid, 'family', trim(p_display_name));
  return hid;
end $$;

-- Photos only, and not huge.
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
 where id = 'household-files';
