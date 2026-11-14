-- A device belongs to whoever is signed in on it: registering the same endpoint again moves it.
create function register_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or my_household() is null then raise exception 'no_household'; end if;
  insert into push_subscriptions(household_id, user_id, endpoint, p256dh, auth)
  values (my_household(), auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set household_id = excluded.household_id, user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;
revoke all on function register_push_subscription(text, text, text) from public, anon;
grant execute on function register_push_subscription(text, text, text) to authenticated, service_role;
