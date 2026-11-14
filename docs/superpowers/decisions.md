# Decisions made while building (rulings) and deferred minor issues

## Rulings
- Task 2: Ruling: policies and functions merged into 0002_functions_and_policies.sql (policies depend on my_household()/my_role()); no 0003 — no cost.
- Task 2: Ruling: profiles telegram_chat_id/telegram_link_code hidden by column grants (clients must never select *); own values via my_telegram(); other members via household_members() FUNCTION (not view) — a security_invoker view cannot read hidden columns; cost: none.
- Task 2: Ruling: readings insert uses column grants excluding alert_sent_at so clients cannot suppress alerts.
- Task 2: Ruling: Postgres+stubs tested locally (supabase/tests/run-local.sh, PGPASSWORD=pg); real Supabase re-check in Task 11.
- Task 3: Ruling: planDoses skips doses more than 1 min in the past — a medicine added mid-day must not create instantly "missed" doses (Review Focus 4) — cost: a dose scheduled during a tick outage longer than 1 min before creation is never created.
- Task 3: Ruling: dayBefore reminder only while now is before the appointment's local day start (so a same-day appointment gets dayOf only); added localTime() to time.ts (used by planDoses).
- Task 4: Ruling: toEmail/isValidUsername/validateMemberInput live in supabase/functions/_shared/login.ts (shared with create-member; Deno can't import src/). Usernames ASCII only (3-30 chars).
- Task 4: Ruling: auth states render by status (no /login,/onboarding URLs); create-member accepts optional lang (default ar) so family can set the elder's language.
- Task 5: Ruling: added migration 0003_household_defaults.sql (household_id defaults to my_household()) so clients never send household_id; RLS test added RED->GREEN.
- Task 5: Ruling: resizeImage returns the original file when canvas/createImageBitmap are unavailable (jsdom, old browsers); not unit-tested — checked in browser during Task 11.
- Task 6: Ruling: reminder sound is public/sounds/reminder.wav (generated beeps; no mp3 encoder available) — owner can swap the file.
- Task 6: Ruling: activeSlot gained optional missedWindowMinutes (default 120): a missed slot's popup stops after 2h so the elder is not stuck on it overnight; DB still allows late Taken until the medicine's next dose. Slot/groupBySlot/classifyDoses made generic (Slot<T>).
- Task 6: Ruling: useTodayDoses lives in src/lib/useDoses.ts (not ElderToday.tsx); after Taken the screen updates optimistically (no immediate refetch), server truth arrives on next 30s refresh/live change.
- Task 7: Ruling: ConfirmReading is its own file (src/screens/elder/ConfirmReading.tsx), re-exported from AddReading.tsx. Flow: number entry -> big confirm (Save/Change) -> saved. Photo flow (Task 8) reuses it and so also gets the confirm screen.
- Task 7: Ruling: migration 0004 grants insert(id) on readings; addReading retries reuse one client id and treat a duplicate-key error (23505) as saved, so a lost response cannot create a double reading (Review Focus 5).
- Task 7: Ruling: /add-reading route exists for elder and inside the family/helper shell. Chart component itself is not unit-tested (jsdom has no layout) — checked visually in Task 11.
- Task 8: Ruling: read-meter uses structured output (output_config.format json_schema, effort low) instead of the plan's forced tool call — claude-opus-5-5 returns 400 on forced tool_choice. Default model claude-opus-5-5, overridable by secret CLAUDE_MODEL. Thinking param omitted (always on).
- Task 8: Ruling: no server-side `fallbacks` on read-meter — a refusal simply returns {readable:false} and the person types the number; cost if wrong: a safety-classifier refusal means no auto-read for that photo.
- Task 8: Ruling: unreadable photo keeps photo_path but source stays 'typed' (the number was typed). Edge function is Deno code, untested locally — verified in Task 11 with a real key.
- Task 9: Ruling: saveAppointment takes starts_at (ISO, built in the form with zonedToUtc and the household time zone) and hospital_name, not date/time; hospital find-or-create via upsert on (household_id,name).
- Task 9: Ruling: clearing day_before/day_of reminder flags when starts_at changes is a DB trigger (migration 0005) not client code — tested in rls.sql RED->GREEN.
- Task 10: Ruling: migration 0006 adds register_push_subscription() RPC (upsert moves a device to whoever signs in) — a client upsert is impossible with column grants; RLS-tested RED->GREEN. Also fixed rls.sql t.as_super() to clear JWT claims (the "anonymous refused" check was previously passing for the wrong reason).
- Task 10: Ruling: notifications are claim-before-send = at-most-once. A failed send is recorded in tick result.errors but not retried (avoids repeat spam / double alerts); cost: a transient Telegram/push outage can lose a single alert.
- Task 11 (partial): Supabase project ccawapevsorhpedvmyqz (eu-central-1, free) created; migrations 0001-0007 applied; server secrets in app_secrets table (Ruling: dashboard-entered function secrets would require the owner to paste values I generate, so CRON/VAPID/webhook secrets live in a service-role-only table read by getSecret(); ANTHROPIC_API_KEY and TELEGRAM_BOT_TOKEN may still come from env). tick deployed v2 (web-push imported lazily: npm:web-push has no default export under Deno boot). pg_cron NOT scheduled yet.
- Final: Ruling: no per-household daily cap on read-meter — only household members can call it after 0008, and they are trusted; cost if wrong: a member could loop it and spend API credit.
- Task 11: Vercel project mfu-medical-followup (prj_PjymaFYRnMMM9u8gHa87kV8jrzw9) linked to GitHub, production branch = claude/zealous-lovelace-8cijpi (auto-deploys on push), env vars set; URL https://mfu-medical-followup.vercel.app. Ruling: Vercel Authentication switched off (otherwise the elder would hit a Vercel login); the app has its own login + RLS. Cost if wrong: the sign-in page is publicly reachable.
- Task 11: Ruling: owner account seeded by SQL (login 'family', temp password to be changed in Settings) because email-confirmation/site-URL for self sign-up cannot be configured from here; household 'Family'.

## Deferred minor issues (not fixed)
- cross-household medication_times row needs composite FK
- medications_guard lets a helper change created_at/id
- out_of_range is client-computed (hand-written insert can suppress the alert)
- Telegram link code never rotated; no disconnect button
- deactivated medicine's already-due dose still prompts/alerts
- "Reading the photo…" has no timeout/"type instead" button
- a 00:30 appointment gets its "today" message the evening before
- Readings times use device time zone; both BP dots red when one value out of range
- SetupGuide Back and notification-error link are small on the elder device
- service worker has no skipWaiting/clientsClaim (updates may not reach an always-open tablet) — check in smoke test
- History query not paged (PostgREST 1000-row default)
- usernames use the made-up domain members.mfu.app
