-- Clients never need to send household_id: it defaults to the caller's household
-- (row-level security still checks it).
alter table medications alter column household_id set default my_household();
alter table medication_times alter column household_id set default my_household();
alter table readings alter column household_id set default my_household();
alter table ranges alter column household_id set default my_household();
alter table hospitals alter column household_id set default my_household();
alter table appointments alter column household_id set default my_household();
alter table push_subscriptions alter column household_id set default my_household();
