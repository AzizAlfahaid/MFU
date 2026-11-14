-- Access-rule tests. Everything runs in one transaction and is rolled back.
\set ON_ERROR_STOP on
begin;

create schema t;
grant usage on schema t to anon, authenticated;
create table t.fx (k text primary key, v text);
grant select on t.fx to authenticated;

create function t.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u)::text, true);
  execute 'set local role authenticated';
end $$;
create function t.as_super() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $$;
create function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;
-- passes when the statement errors OR changes no rows
create function t.blocked(stmt text, msg text) returns void language plpgsql as $$
declare n int;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
  exception when others then
    return;
  end;
  if n > 0 then raise exception 'ASSERT FAILED (statement was allowed): %', msg; end if;
end $$;
grant execute on all functions in schema t to authenticated;

-- ---------- fixtures (as superuser) ----------
insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-0000000000a1','fa@x'), ('00000000-0000-0000-0000-0000000000a2','ha@x'),
 ('00000000-0000-0000-0000-0000000000a3','ea@x'), ('00000000-0000-0000-0000-0000000000b1','fb@x'),
 ('00000000-0000-0000-0000-0000000000c1','new@x');
insert into households(id, name) values
 ('00000000-0000-0000-0000-00000000aaaa','A'), ('00000000-0000-0000-0000-00000000bbbb','B');
insert into profiles(id, household_id, role, display_name) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000aaaa','family','FamA'),
 ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-00000000aaaa','helper','HelperA'),
 ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-00000000aaaa','elder','ElderA'),
 ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000bbbb','family','FamB');
update profiles set telegram_chat_id = 111 where id = '00000000-0000-0000-0000-0000000000a1';

insert into medications(id, household_id, name, dose) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000aaaa','M1','5mg'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000aaaa','M2','5mg'),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000aaaa','M3','5mg'),
 ('10000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000bbbb','MB','5mg');
insert into medication_times(household_id, medication_id, time_of_day) values
 ('00000000-0000-0000-0000-00000000aaaa','10000000-0000-0000-0000-000000000001','08:00');
insert into doses(household_id, medication_id, scheduled_at, status) values
 ('00000000-0000-0000-0000-00000000aaaa','10000000-0000-0000-0000-000000000001', date_trunc('minute', now()) - interval '10 minutes','pending'),
 ('00000000-0000-0000-0000-00000000aaaa','10000000-0000-0000-0000-000000000001', date_trunc('minute', now()) + interval '1 hour','pending'),
 ('00000000-0000-0000-0000-00000000aaaa','10000000-0000-0000-0000-000000000002', date_trunc('minute', now()) - interval '2 hours','missed'),
 ('00000000-0000-0000-0000-00000000aaaa','10000000-0000-0000-0000-000000000003', date_trunc('minute', now()) - interval '3 hours','missed'),
 ('00000000-0000-0000-0000-00000000aaaa','10000000-0000-0000-0000-000000000003', date_trunc('minute', now()) - interval '1 hour','pending'),
 ('00000000-0000-0000-0000-00000000bbbb','10000000-0000-0000-0000-00000000000b', date_trunc('minute', now()) - interval '10 minutes','pending');
insert into t.fx values ('now', date_trunc('minute', now())::text);
insert into appointments(household_id, starts_at, day_before_sent_at, day_of_sent_at) values ('00000000-0000-0000-0000-00000000aaaa', now() + interval '2 days', now(), now());
insert into storage.buckets(id, name) values ('household-files','household-files') on conflict do nothing;

-- ---------- household isolation ----------
select t.as_user('00000000-0000-0000-0000-0000000000b1');
select t.ok((select count(*) from medications where household_id = '00000000-0000-0000-0000-00000000aaaa') = 0, 'B family sees none of A medications');
select t.ok((select count(*) from doses where household_id = '00000000-0000-0000-0000-00000000aaaa') = 0, 'B family sees none of A doses');
select t.ok((select count(*) from appointments where household_id = '00000000-0000-0000-0000-00000000aaaa') = 0, 'B family sees none of A appointments');
select t.ok((select count(*) from medications) = 1, 'B family sees own medicine');
select t.blocked($$update medications set name='x' where household_id='00000000-0000-0000-0000-00000000aaaa'$$, 'B cannot edit A medicine');
select t.blocked($$insert into readings(household_id,type,value1,entered_by,source) values ('00000000-0000-0000-0000-00000000aaaa','temp',37,'00000000-0000-0000-0000-0000000000b1','typed')$$, 'B cannot add reading to A');

-- ---------- family-only writes ----------
select t.as_user('00000000-0000-0000-0000-0000000000a3'); -- elder
select t.blocked($$insert into medications(household_id,name,dose) values ('00000000-0000-0000-0000-00000000aaaa','n','d')$$, 'elder insert medication');
select t.blocked($$update medications set name='z'$$, 'elder update medication');
select t.blocked($$delete from medications$$, 'elder delete medication');
select t.blocked($$insert into medication_times(household_id,medication_id,time_of_day) values ('00000000-0000-0000-0000-00000000aaaa','10000000-0000-0000-0000-000000000001','09:00')$$, 'elder insert time');
select t.blocked($$insert into appointments(household_id,starts_at) values ('00000000-0000-0000-0000-00000000aaaa', now())$$, 'elder insert appointment');
select t.blocked($$insert into ranges(household_id,key,low,high) values ('00000000-0000-0000-0000-00000000aaaa','temp',36,38)$$, 'elder insert range');
select t.blocked($$update households set missed_wait_minutes = 60$$, 'elder update household');

select t.as_user('00000000-0000-0000-0000-0000000000a2'); -- helper
select t.blocked($$insert into medications(household_id,name,dose) values ('00000000-0000-0000-0000-00000000aaaa','n','d')$$, 'helper insert medication');
select t.blocked($$update medications set name='z'$$, 'helper update medication name');
select t.blocked($$update medications set active=false$$, 'helper update medication active');
select t.blocked($$delete from medications$$, 'helper delete medication');
select t.blocked($$insert into appointments(household_id,starts_at) values ('00000000-0000-0000-0000-00000000aaaa', now())$$, 'helper insert appointment');
select t.blocked($$insert into ranges(household_id,key,low,high) values ('00000000-0000-0000-0000-00000000aaaa','temp',36,38)$$, 'helper insert range');
with u as (update medications set photo_path = '00000000-0000-0000-0000-00000000aaaa/medications/x.jpg' where id = '10000000-0000-0000-0000-000000000001' returning 1)
  select t.ok((select count(*) from u) = 1, 'helper can change photo only');

select t.as_user('00000000-0000-0000-0000-0000000000a1'); -- family
with u as (update medications set name = 'M1b' where id = '10000000-0000-0000-0000-000000000001' returning 1)
  select t.ok((select count(*) from u) = 1, 'family can edit medication');
with i as (insert into ranges(household_id,key,low,high) values ('00000000-0000-0000-0000-00000000aaaa','temp',36,38) returning 1)
  select t.ok((select count(*) from i) = 1, 'family can set range');
select t.blocked($$insert into ranges(household_id,key,low,high) values ('00000000-0000-0000-0000-00000000aaaa','bp_systolic',140,90)$$, 'range high must exceed low');
-- household_id defaults to the caller's household
with i as (insert into hospitals(name) values ('Default Hospital') returning household_id)
  select t.ok((select household_id from i) = '00000000-0000-0000-0000-00000000aaaa', 'household_id defaults to my household');

-- ---------- appointment reminders reset when the time changes ----------
select t.as_user('00000000-0000-0000-0000-0000000000a1');
update appointments set doctor = 'Dr X' where household_id = '00000000-0000-0000-0000-00000000aaaa';
select t.as_super();
select t.ok((select day_before_sent_at is not null and day_of_sent_at is not null from appointments where household_id = '00000000-0000-0000-0000-00000000aaaa'), 'reminder flags stay when other fields change');
select t.as_user('00000000-0000-0000-0000-0000000000a1');
update appointments set starts_at = starts_at + interval '1 day' where household_id = '00000000-0000-0000-0000-00000000aaaa';
select t.as_super();
select t.ok((select day_before_sent_at is null and day_of_sent_at is null from appointments where household_id = '00000000-0000-0000-0000-00000000aaaa'), 'reminder flags reset when the time changes');

-- ---------- readings ----------
select t.as_user('00000000-0000-0000-0000-0000000000a3');
with i as (insert into readings(household_id,type,value1,entered_by,source) values ('00000000-0000-0000-0000-00000000aaaa','temp',37.2,'00000000-0000-0000-0000-0000000000a3','typed') returning 1)
  select t.ok((select count(*) from i) = 1, 'elder can add own reading');
select t.blocked($$insert into readings(household_id,type,value1,entered_by,source) values ('00000000-0000-0000-0000-00000000aaaa','temp',37.2,'00000000-0000-0000-0000-0000000000a1','typed')$$, 'elder cannot add reading as someone else');
select t.blocked($$insert into readings(household_id,type,value1,entered_by,source) values ('00000000-0000-0000-0000-00000000aaaa','sugar',100,'00000000-0000-0000-0000-0000000000a3','typed')$$, 'sugar needs context');
select t.blocked($$insert into readings(household_id,type,value1,entered_by,source,alert_sent_at) values ('00000000-0000-0000-0000-00000000aaaa','temp',39,'00000000-0000-0000-0000-0000000000a3','typed', now())$$, 'client cannot set alert_sent_at');
select t.blocked($$update readings set value1 = 1$$, 'no client update of readings');
-- a client-chosen id makes retries safe: the second insert of the same id is refused
with i as (insert into readings(id,type,value1,entered_by,source) values ('20000000-0000-0000-0000-000000000001','temp',37,'00000000-0000-0000-0000-0000000000a3','typed') returning 1)
  select t.ok((select count(*) from i) = 1, 'elder can insert with own id');
select t.blocked($$insert into readings(id,type,value1,entered_by,source) values ('20000000-0000-0000-0000-000000000001','temp',37,'00000000-0000-0000-0000-0000000000a3','typed')$$, 'same id twice is refused');
select t.blocked($$delete from readings$$, 'elder cannot delete readings');
select t.as_user('00000000-0000-0000-0000-0000000000a1');
with d as (delete from readings returning 1) select t.ok((select count(*) from d) = 2, 'family can delete readings');

-- ---------- doses ----------
select t.as_user('00000000-0000-0000-0000-0000000000a3');
select t.blocked($$update doses set status='taken'$$, 'no direct dose update');
select t.blocked($$insert into doses(household_id,medication_id,scheduled_at) values ('00000000-0000-0000-0000-00000000aaaa','10000000-0000-0000-0000-000000000001', now())$$, 'no direct dose insert');
select t.blocked($$delete from doses$$, 'no direct dose delete');
select t.ok(mark_slot_taken((select v::timestamptz from t.fx where k='now') - interval '10 minutes') = 1, 'mark_slot_taken flips pending');
select t.as_super();
select t.ok((select status from doses where medication_id='10000000-0000-0000-0000-000000000001' and scheduled_at < now()) = 'taken', 'dose is taken');
select t.ok((select taken_by from doses where medication_id='10000000-0000-0000-0000-000000000001' and scheduled_at < now()) = '00000000-0000-0000-0000-0000000000a3', 'taken_by recorded');
select t.as_user('00000000-0000-0000-0000-0000000000a3');
select t.ok(mark_slot_taken((select v::timestamptz from t.fx where k='now') - interval '2 hours') = 1, 'missed becomes taken_late');
select t.ok(mark_slot_taken((select v::timestamptz from t.fx where k='now') - interval '3 hours') = 0, 'missed with later due dose stays missed');
select t.blocked($$select mark_slot_taken(now() + interval '1 hour')$$, 'future slot raises not_due');
select t.as_super();
select t.ok((select status from doses where medication_id='10000000-0000-0000-0000-000000000002') = 'taken_late', 'M2 is taken_late');
select t.ok((select status from doses where medication_id='10000000-0000-0000-0000-000000000003' and scheduled_at < now() - interval '2 hours') = 'missed', 'M3 old dose stays missed');
select t.ok((select status from doses where household_id='00000000-0000-0000-0000-00000000bbbb') = 'pending', 'other household untouched');

-- ---------- profiles and secrets ----------
select t.as_user('00000000-0000-0000-0000-0000000000a2');
select t.ok((select count(*) from profiles) = 3, 'helper sees household members');
select t.blocked($$select telegram_link_code from profiles$$, 'helper cannot read telegram_link_code');
select t.blocked($$select telegram_chat_id from profiles$$, 'helper cannot read telegram_chat_id');
select t.blocked($$update profiles set role='family' where id = '00000000-0000-0000-0000-0000000000a2'$$, 'cannot change own role');
select t.blocked($$update profiles set display_name='x' where id = '00000000-0000-0000-0000-0000000000a1'$$, 'cannot edit another profile');
with u as (update profiles set display_name='H2', lang='en' where id = '00000000-0000-0000-0000-0000000000a2' returning 1)
  select t.ok((select count(*) from u) = 1, 'can edit own name and language');
select t.ok((select count(*) from household_members()) = 3, 'household_members lists 3');
select t.ok((select has_telegram from household_members() where id = '00000000-0000-0000-0000-0000000000a1'), 'has_telegram true for family A');
select t.as_user('00000000-0000-0000-0000-0000000000a1');
select t.ok((select telegram_link_code from my_telegram()) is not null, 'family reads own link code');
select t.ok((select telegram_chat_id from my_telegram()) = 111, 'family reads own chat id');

-- ---------- push subscriptions ----------
select t.as_user('00000000-0000-0000-0000-0000000000a3');
with i as (insert into push_subscriptions(household_id,user_id,endpoint,p256dh,auth) values ('00000000-0000-0000-0000-00000000aaaa','00000000-0000-0000-0000-0000000000a3','https://e/1','k','a') returning 1)
  select t.ok((select count(*) from i) = 1, 'user adds own subscription');
select t.blocked($$insert into push_subscriptions(household_id,user_id,endpoint,p256dh,auth) values ('00000000-0000-0000-0000-00000000aaaa','00000000-0000-0000-0000-0000000000a1','https://e/2','k','a')$$, 'cannot add subscription for another user');
select t.as_user('00000000-0000-0000-0000-0000000000a2');
select t.ok((select count(*) from push_subscriptions) = 0, 'helper cannot see elder subscription');

-- ---------- register_push_subscription moves a device to whoever signs in on it ----------
select t.as_user('00000000-0000-0000-0000-0000000000a3');
select register_push_subscription('https://e/shared', 'k1', 'a1');
select t.as_user('00000000-0000-0000-0000-0000000000a2');
select register_push_subscription('https://e/shared', 'k2', 'a2');
select t.ok((select count(*) from push_subscriptions where endpoint = 'https://e/shared') = 1, 'helper now owns the shared device subscription');
select t.as_user('00000000-0000-0000-0000-0000000000a3');
select t.ok((select count(*) from push_subscriptions where endpoint = 'https://e/shared') = 0, 'elder no longer sees it');
select t.as_super();
select t.blocked($$select register_push_subscription('https://e/x','k','a')$$, 'anonymous cannot register');

-- ---------- create_household ----------
select t.as_user('00000000-0000-0000-0000-0000000000c1');
select t.ok(create_household('Mine', 'Me') is not null, 'create_household works');
select t.ok((select role from profiles where id = '00000000-0000-0000-0000-0000000000c1') = 'family', 'creator is family');
select t.blocked($$select create_household('Again','Me')$$, 'second household refused');
select t.as_super();
select t.blocked($$select create_household('x','y')$$, 'anonymous user refused');

-- ---------- storage ----------
select t.as_user('00000000-0000-0000-0000-0000000000a2');
with i as (insert into storage.objects(bucket_id, name) values ('household-files','00000000-0000-0000-0000-00000000aaaa/medications/x.jpg') returning 1)
  select t.ok((select count(*) from i) = 1, 'helper uploads into own household folder');
select t.blocked($$insert into storage.objects(bucket_id, name) values ('household-files','00000000-0000-0000-0000-00000000bbbb/medications/x.jpg')$$, 'helper cannot upload into other household folder');
select t.blocked($$insert into storage.objects(bucket_id, name) values ('household-files','x.jpg')$$, 'no top-level files');
select t.blocked($$delete from storage.objects$$, 'helper cannot delete files');
select t.as_user('00000000-0000-0000-0000-0000000000b1');
select t.ok((select count(*) from storage.objects) = 0, 'other household cannot see files');
select t.as_user('00000000-0000-0000-0000-0000000000a1');
select t.ok((select count(*) from storage.objects) = 1, 'family sees files');
with d as (delete from storage.objects returning 1) select t.ok((select count(*) from d) = 1, 'family can delete files');

-- ---------- server-only secrets ----------
select t.as_super();
insert into app_secrets(key, value) values ('CRON_SECRET', 'x');
select t.as_user('00000000-0000-0000-0000-0000000000a1');
select t.blocked($$select * from app_secrets$$, 'family cannot read server secrets');
select t.blocked($$insert into app_secrets(key,value) values ('k','v')$$, 'family cannot write server secrets');
select t.as_super();

-- ---------- anonymous ----------
set local role anon;
select t.blocked($$select * from medications$$, 'anon cannot read medications');
select t.blocked($$select * from households$$, 'anon cannot read households');

rollback;
\echo all assertions passed
