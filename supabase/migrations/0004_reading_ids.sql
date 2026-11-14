-- Let the app choose a reading's id so a retried save cannot create a duplicate.
grant insert (id) on readings to authenticated;
