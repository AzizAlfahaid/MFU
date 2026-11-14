-- If an appointment is moved, its day-before / day-of reminders must be sent again.
create function appointments_reset_reminders() returns trigger language plpgsql as $$
begin
  if new.starts_at is distinct from old.starts_at then
    new.day_before_sent_at := null;
    new.day_of_sent_at := null;
  end if;
  return new;
end $$;
create trigger appointments_reset_reminders before update on appointments
  for each row execute function appointments_reset_reminders();
