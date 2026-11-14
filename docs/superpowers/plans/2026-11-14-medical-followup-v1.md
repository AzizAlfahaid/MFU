# Medical Follow-Up V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private, bilingual (Arabic/English) PWA for one household to track medicines, readings and appointments, with dose reminders and missed-dose alerts to family.

**Architecture:** A React single-page PWA on Vercel talks directly to Supabase (Postgres with row-level security, Auth, private Storage). All time-based work (creating doses, reminders, missed alerts, appointment reminders) is done by one Supabase Edge Function, `tick`, called every minute by `pg_cron`. Pure decision logic lives in `supabase/functions/_shared/` with no Deno-only imports, so Vitest tests it and the frontend imports it too.

**Tech Stack:** Vite + React 18 + TypeScript, react-router, i18next, Recharts, vite-plugin-pwa (`injectManifest`), @supabase/supabase-js v2, Vitest + @testing-library/react. Supabase Edge Functions (Deno), `npm:web-push`, `npm:@anthropic-ai/sdk`, Telegram Bot HTTP API.

**Spec:** `docs/superpowers/specs/2026-11-14-medical-followup-design.md`

## Global Constraints

- Arabic is the default language; `<html dir>` and `lang` switch with the language. Every user-visible string goes through i18next with both `ar` and `en` keys; no hard-coded text.
- Elder screens: body text ≥ 28px, buttons ≥ 80px tall, high contrast, one main action per screen, no small menus.
- Roles `elder | helper | family` are enforced by row-level security, not only in the UI. Only `family` writes medications (except the photo), medication times, appointments, hospitals, ranges and household settings.
- Photos live in the private bucket `household-files` under `<household_id>/...` and are shown only through signed URLs (60 minutes). No public URLs.
- `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, VAPID private key and the service-role key exist only as Edge Function secrets. Never in `VITE_*` variables or the repo.
- A value read from a photo is never saved without the user tapping Confirm.
- Claude is asked only to read numbers. No advice, no dose changes, no diagnosis.
- Units are fixed: blood sugar mg/dL, blood pressure mmHg, temperature °C.
- All scheduling uses `household.timezone` (default `Asia/Riyadh`). Missed-dose wait default: 30 minutes.
- The app must work when the Anthropic key or Telegram bot is not yet set up: meter photo falls back to typing; Telegram sends are skipped.
- Before writing any Claude API code, load the `claude-api` skill.

## Review Focus

1. **iOS blocks sound until the user has tapped the page.** The reminder popup must still appear silently, and the Today screen shows a one-tap "Turn on sound" button until audio is unlocked. (Task 6)
2. **The tick job runs twice, overlaps, or skips minutes.** No reminder or alert is ever sent twice; a late run still sends the reminders and marks the misses it skipped; a dose at 23:50 with a 30-minute wait is handled across midnight. (Tasks 3, 10)
3. **Numbers typed with Arabic-Indic digits (٠-٩), Arabic decimal mark (٫) or a comma.** `١٢٠` saves as 120 and `٣٧٫٥` / `37,5` as 37.5; nonsense is rejected with a clear message. (Tasks 3, 7)
4. **Family edits or deactivates a medicine mid-day.** Future pending doses for removed times disappear; taken/missed history stays. (Tasks 3, 10)
5. **No connection, or the server refuses, when tapping "Taken" or saving a reading; Claude can't read the photo.** The screen shows a large clear error with a Retry button and never shows success; an unreadable photo goes to typing. (Tasks 6, 7, 8)

---

## File Structure

```
index.html, vite.config.ts, vercel.json, .env.example
public/icons/*, public/sounds/reminder.mp3
src/
  main.tsx, App.tsx (routes + role guard), sw.ts (service worker)
  styles/base.css (tokens, elder scale, RTL)
  i18n/index.ts, i18n/ar.json, i18n/en.json
  lib/supabase.ts, lib/types.ts, lib/auth.tsx (AuthProvider/useAuth),
  lib/files.ts (resize/upload/signed URL), lib/push.ts, lib/sound.ts, lib/api.ts (all table queries)
  screens/Login.tsx, Onboarding.tsx
  screens/elder/ElderToday.tsx, ReminderPopup.tsx, AddReading.tsx
  screens/app/AppShell.tsx (tabs), Today.tsx, Medicines.tsx, MedicineForm.tsx,
    Readings.tsx, Appointments.tsx, AppointmentForm.tsx, History.tsx, Settings.tsx, SetupGuide.tsx
  components/BigButton.tsx, SlotCard.tsx, ReadingChart.tsx, PhotoInput.tsx, ErrorRetry.tsx, LanguageSwitch.tsx
supabase/
  migrations/0001_schema.sql, 0002_policies.sql, 0003_functions.sql
  tests/rls.sql
  functions/_shared/time.ts, schedule.ts, ranges.ts, numbers.ts, messages.ts, types.ts
  functions/tick/index.ts, tick/run.ts, tick/store.ts, tick/notifier.ts
  functions/read-meter/index.ts, read-meter/parse.ts
  functions/telegram-webhook/index.ts
  functions/create-member/index.ts
tests/ (Vitest; mirrors the paths above)
```

Vite alias: `@shared` → `supabase/functions/_shared`. Files in `_shared/` and `tick/run.ts`, `read-meter/parse.ts` use only standard JS (no `Deno.*`, no URL imports).

---

### Task 1: App shell, languages and elder design scale

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `vercel.json`, `.env.example`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `src/styles/base.css`, `src/i18n/index.ts`, `src/i18n/ar.json`, `src/i18n/en.json`, `src/components/LanguageSwitch.tsx`, `src/components/BigButton.tsx`, `public/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`
- Test: `tests/i18n.test.tsx`

**Interfaces:**
- Produces: `setLanguage(lang: 'ar' | 'en'): void` in `src/i18n/index.ts` (changes i18next language, sets `document.documentElement.lang` and `dir`, stores `mfu.lang` in localStorage; initial language = localStorage value or `'ar'`). `<LanguageSwitch />`. `<BigButton onClick label variant="primary|secondary" />` (min-height 80px, font-size 28px). CSS class `.elder` on a container sets `font-size: 28px`.
- `.env.example` lists `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`, `VITE_TELEGRAM_BOT`.
- PWA manifest (via vite-plugin-pwa, `strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.ts'`): `name: "المتابعة الطبية"`, `short_name: "متابعة"`, `display: "standalone"`, `start_url: "/"`, `lang: "ar"`, `dir: "rtl"`. `src/sw.ts` in this task only precaches (`precacheAndRoute(self.__WB_MANIFEST)`).
- `vercel.json`: rewrite all paths to `/index.html`.

- [ ] **Step 1: Scaffold** with `npm create vite@latest . -- --template react-ts`, then install: `react-router-dom i18next react-i18next @supabase/supabase-js recharts` and dev: `vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom vite-plugin-pwa workbox-precaching`. Add `"test": "vitest run"` script; Vitest environment `jsdom`.

- [ ] **Step 2: Write the failing test** `tests/i18n.test.tsx`

```tsx
it('defaults to Arabic RTL', () => {
  render(<App />)
  expect(document.documentElement.dir).toBe('rtl')
  expect(document.documentElement.lang).toBe('ar')
})
it('switches to English LTR and remembers it', async () => {
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: 'English' }))
  expect(document.documentElement.dir).toBe('ltr')
  expect(localStorage.getItem('mfu.lang')).toBe('en')
})
it('ar.json and en.json have identical key sets', () => {
  expect(flatKeys(ar)).toEqual(flatKeys(en))
})
```

- [ ] **Step 3: Run** `npm test` — expect FAIL.
- [ ] **Step 4: Implement** the files above. `LanguageSwitch` shows a button labelled `English` when Arabic is active and `العربية` when English is active.
- [ ] **Step 5: Run** `npm test` and `npm run build` — both pass.
- [ ] **Step 6: Commit** `feat: app shell with Arabic/English and PWA manifest`

---

### Task 2: Database schema, access rules and server-side SQL functions

**Files:**
- Create: `supabase/migrations/0001_schema.sql`, `0002_policies.sql`, `0003_functions.sql`, `supabase/tests/rls.sql`, `src/lib/types.ts`

**Interfaces — Produces (exact names used by every later task):**

Tables (all have `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`; all except `households` have `household_id uuid not null references households on delete cascade`):

| Table | Columns |
|-------|---------|
| `households` | `name text`, `timezone text default 'Asia/Riyadh'`, `missed_wait_minutes int default 30 check (between 5 and 240)` |
| `profiles` | `id uuid primary key references auth.users on delete cascade` (no generated id), `role text check in ('elder','helper','family')`, `display_name text`, `lang text default 'ar' check in ('ar','en')`, `telegram_chat_id bigint`, `telegram_link_code text unique default encode(gen_random_bytes(12),'hex')` |
| `medications` | `name text not null`, `dose text not null`, `notes text`, `photo_path text`, `active boolean default true` |
| `medication_times` | `medication_id uuid references medications on delete cascade`, `time_of_day time not null`, unique `(medication_id, time_of_day)` |
| `doses` | `medication_id uuid references medications on delete cascade`, `scheduled_at timestamptz not null`, `status text default 'pending' check in ('pending','taken','taken_late','missed')`, `taken_at timestamptz`, `taken_by uuid references profiles`, `reminder_sent_at`, `missed_alert_sent_at`, `late_alert_sent_at timestamptz`, unique `(medication_id, scheduled_at)` |
| `readings` | `type text check in ('sugar','bp','temp')`, `context text check in ('fasting','after_meal','other')` (required when type = sugar, null otherwise), `value1 numeric not null`, `value2 numeric` (diastolic), `pulse numeric`, `taken_at timestamptz default now()`, `entered_by uuid references profiles`, `photo_path text`, `source text check in ('typed','photo')`, `out_of_range boolean default false`, `alert_sent_at timestamptz` |
| `ranges` | `key text check in ('sugar_fasting','sugar_after_meal','sugar_other','bp_systolic','bp_diastolic','temp')`, `low numeric not null`, `high numeric not null check (high > low)`, unique `(household_id, key)` |
| `hospitals` | `name text not null`, unique `(household_id, name)` |
| `appointments` | `starts_at timestamptz not null`, `hospital_id uuid references hospitals`, `doctor text`, `purpose text`, `notes text`, `day_before_sent_at`, `day_of_sent_at timestamptz` |
| `push_subscriptions` | `user_id uuid references profiles on delete cascade`, `endpoint text unique not null`, `p256dh text not null`, `auth text not null` |

SQL functions (`security definer`, `set search_path = public`):
- `my_household() returns uuid`, `my_role() returns text` — read from `profiles` for `auth.uid()`.
- `create_household(p_name text, p_display_name text) returns uuid` — fails if the caller already has a profile; creates the household and a `family` profile for the caller.
- `mark_slot_taken(p_slot timestamptz) returns int` — for doses in `my_household()` with `scheduled_at = p_slot`: `pending` → `taken`; `missed` → `taken_late` only when no dose of the same medication exists with `scheduled_at > p_slot and scheduled_at <= now()`. Sets `taken_at = now()`, `taken_by = auth.uid()`. Returns the number of rows changed. Raises `'not_due'` if `p_slot > now()`.

Policies (RLS enabled on every table):
- `select`: household members only (`household_id = my_household()`; `households.id = my_household()`; `profiles` same household).
- `medications`: insert/delete family only; update family — plus a helper may update when only `photo_path` changes (enforce with a `before update` trigger that raises unless `my_role() = 'family'` or all columns except `photo_path` are unchanged and `my_role() = 'helper'`).
- `medication_times`, `appointments`, `hospitals`, `ranges`: all writes family only. `households`: update family only.
- `readings`: insert by any member with `entered_by = auth.uid()`; delete family only; no client update.
- `doses`: no client insert/update/delete (only `mark_slot_taken` and the service role).
- `profiles`: a user may update only their own `display_name` and `lang` (column-level grant). `telegram_link_code` and `telegram_chat_id` selectable only for the own row — expose other members through a view `household_members(id, role, display_name, lang, has_telegram boolean)`.
- `push_subscriptions`: a user manages only their own rows.
- Storage bucket `household-files` (private): select/insert for members where `(storage.foldername(name))[1] = my_household()::text`; delete family only.

`src/lib/types.ts`: TypeScript row types with these exact table/column names: `Household`, `Profile`, `Role`, `Medication`, `MedicationTime`, `Dose`, `DoseStatus`, `Reading`, `ReadingType`, `SugarContext`, `Range`, `RangeKey`, `Hospital`, `Appointment`.

- [ ] **Step 1: Write `supabase/tests/rls.sql`** — a script that runs inside `begin; ... rollback;`, creates household A (family, helper, elder users) and household B (family), then for each check does `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>"}'` and uses `do $$ ... raise exception` assertions for:
  - B's family sees 0 rows of A's `medications`, `readings`, `doses`, `appointments`.
  - A's elder and helper cannot insert/update/delete `medications`, `medication_times`, `appointments`, `ranges`.
  - A's helper can update `medications.photo_path` but not `name`.
  - A's elder can insert a reading with `entered_by` = self, not as someone else.
  - No role can `update doses` directly; `mark_slot_taken` flips `pending` → `taken`; a `missed` dose becomes `taken_late`; a `missed` dose with a later already-due dose of the same medicine stays `missed`; a future slot raises `not_due`.
  - A's helper cannot read A's family member's `telegram_link_code`.
- [ ] **Step 2: Write the three migrations and `types.ts`.**
- [ ] **Step 3: Verify syntax locally** if `psql`/Postgres is available in the environment (`createdb mfu_test`, create stub `auth.users`, `auth.uid()` reading `request.jwt.claims`, and `storage` stubs, apply migrations, run `rls.sql`, expect no exception). If no local Postgres, this script is run for real in Task 11 Step 3 — say so in the commit message.
- [ ] **Step 4: Commit** `feat: database schema, access rules and dose RPC`

---

### Task 3: Shared pure logic (time, schedule, ranges, numbers, messages)

**Files:**
- Create: `supabase/functions/_shared/types.ts`, `time.ts`, `schedule.ts`, `ranges.ts`, `numbers.ts`, `messages.ts`
- Test: `tests/shared/time.test.ts`, `schedule.test.ts`, `ranges.test.ts`, `numbers.test.ts`, `messages.test.ts`

**Interfaces — Produces:**

```ts
// types.ts
type Lang = 'ar' | 'en'
type DoseStatus = 'pending' | 'taken' | 'taken_late' | 'missed'
interface MedTime { medication_id: string; name: string; time_of_day: string /* 'HH:MM:SS' */ }
interface DoseRow { id: string; medication_id: string; name: string; scheduled_at: string /* ISO */;
  status: DoseStatus; reminder_sent_at: string | null; missed_alert_sent_at: string | null; late_alert_sent_at: string | null }
interface Slot { scheduled_at: string; doses: DoseRow[] }
interface ApptRow { id: string; starts_at: string; hospital: string | null; doctor: string | null;
  purpose: string | null; day_before_sent_at: string | null; day_of_sent_at: string | null }

// time.ts
localDate(now: Date, tz: string): string                       // 'YYYY-MM-DD' in tz
zonedToUtc(date: string, time: string, tz: string): Date       // wall time in tz -> instant
addDays(date: string, n: number): string
formatTime(iso: string, tz: string, lang: Lang): string        // '8:00 AM' / '٨:٠٠ ص'

// schedule.ts
planDoses(medTimes: MedTime[], dates: string[], tz: string, existing: DoseRow[], now: Date):
  { toInsert: { medication_id: string; scheduled_at: string }[]; toDeleteIds: string[] }
classifyDoses(doses: DoseRow[], now: Date, waitMinutes: number):
  { toRemind: Slot[]; toMiss: Slot[]; lateTaken: DoseRow[] }
groupBySlot(doses: DoseRow[]): Slot[]                          // sorted by scheduled_at
activeSlot(doses: DoseRow[], now: Date): Slot | null           // for the in-page popup
dueAppointmentReminders(appts: ApptRow[], now: Date, tz: string):
  { dayBefore: ApptRow[]; dayOf: ApptRow[] }

// ranges.ts
rangeKeysFor(type: 'sugar'|'bp'|'temp', context: 'fasting'|'after_meal'|'other'|null): RangeKey[]
isOutOfRange(reading: { type; context; value1: number; value2?: number | null },
  ranges: { key: RangeKey; low: number; high: number }[]): boolean
validateReading(type, value1: number, value2?: number | null): 'ok' | 'implausible'

// numbers.ts
parseNumber(input: string): number | null

// messages.ts
doseReminderText(lang, time: string, medNames: string[]): { title: string; body: string }
missedDoseText(lang, time: string, medNames: string[]): string
lateTakenText(lang, time: string, medNames: string[]): string
readingAlertText(lang, reading: {type; context; value1; value2?}): string
appointmentText(lang, when: 'day_before' | 'day_of', time: string, hospital: string | null, doctor: string | null): string
```

Rules the tests pin:
- `planDoses`: one dose per (medication, date, time) not already in `existing`; `toDeleteIds` = existing doses that are `pending`, `scheduled_at > now`, and have no matching entry in `medTimes`. Never deletes non-pending or past doses. `dates` is `[today, tomorrow]` so slots after midnight exist early.
- `classifyDoses`: `toRemind` = slots with pending doses where `scheduled_at <= now < scheduled_at + wait` and `reminder_sent_at` is null. `toMiss` = slots with pending doses where `now >= scheduled_at + wait` (regardless of whether a reminder was sent). `lateTaken` = doses with status `taken_late` and `late_alert_sent_at` null.
- `activeSlot`: the earliest slot with a `pending` dose and `scheduled_at <= now`; if none, the most recent slot with a `missed` dose whose medicines have no later due dose; else null.
- `dueAppointmentReminders`: `dayBefore` when `now >= 18:00` local on the day before, `now < starts_at`, not sent. `dayOf` when `now >= 08:00` local on the appointment day (or `now >=` 2 hours before `starts_at` if the appointment is before 10:00), `now < starts_at`, not sent.
- `rangeKeysFor('sugar','fasting')` → `['sugar_fasting']`; `('bp', null)` → `['bp_systolic','bp_diastolic']`; `('temp', null)` → `['temp']`. `isOutOfRange` is false when no range is set for the key.
- `validateReading` plausible bounds: sugar 20–600, systolic 50–260, diastolic 30–160 and less than systolic, temp 30–45.

- [ ] **Step 1: Write the failing tests.** Required cases (use tz `'Asia/Riyadh'`, UTC+3):

```ts
// time
expect(zonedToUtc('2026-11-14', '08:00:00', 'Asia/Riyadh').toISOString()).toBe('2026-11-14T05:00:00.000Z')
expect(localDate(new Date('2026-11-14T22:30:00Z'), 'Asia/Riyadh')).toBe('2026-11-15')
expect(zonedToUtc('2026-03-29', '09:00:00', 'Europe/London').toISOString()).toBe('2026-03-29T08:00:00.000Z') // DST day

// schedule: planDoses
// two meds at 08:00, one already exists -> inserts 1
// med time removed: future pending dose is in toDeleteIds; a taken dose and a past pending dose are not
// schedule: classifyDoses, wait = 30
// 08:00 slot at 08:10, not reminded -> toRemind has 1 slot with both medicines, toMiss empty
// same at 08:10, reminder_sent_at set -> toRemind empty
// 08:00 slot at 08:30 exactly -> toMiss
// tick skipped: 08:00 slot never reminded, now 09:15 -> toMiss (not toRemind)
// 23:50 slot (local) at 00:05 next local day -> toRemind; at 00:20 -> toMiss
// taken doses never appear in either list
// schedule: activeSlot returns pending due slot; returns null when the only slot is in the future
// dueAppointmentReminders: appt tomorrow 10:00; now today 17:59 -> none; 18:00 -> dayBefore;
//   created same day at 09:00 for 15:00 -> dayOf only; after starts_at -> none; already sent -> none

// ranges
expect(isOutOfRange({type:'sugar',context:'fasting',value1:140}, [{key:'sugar_fasting',low:80,high:130}])).toBe(true)
expect(isOutOfRange({type:'sugar',context:'after_meal',value1:140}, [{key:'sugar_fasting',low:80,high:130}])).toBe(false)
expect(isOutOfRange({type:'bp',context:null,value1:120,value2:95}, [{key:'bp_systolic',low:90,high:140},{key:'bp_diastolic',low:60,high:90}])).toBe(true)
expect(validateReading('temp', 375)).toBe('implausible')
expect(validateReading('bp', 80, 120)).toBe('implausible')

// numbers
expect(parseNumber('١٢٠')).toBe(120)
expect(parseNumber('٣٧٫٥')).toBe(37.5)
expect(parseNumber('37,5')).toBe(37.5)
expect(parseNumber(' 98.6 ')).toBe(98.6)
expect(parseNumber('abc')).toBeNull(); expect(parseNumber('')).toBeNull(); expect(parseNumber('-5')).toBeNull()

// messages: Arabic text contains every medicine name and the time; English likewise;
// readingAlertText never contains advice words — it states the value and "outside the set range" only
```

- [ ] **Step 2: Run** `npm test -- tests/shared` — FAIL.
- [ ] **Step 3: Implement.** `zonedToUtc`: compute the zone offset with `Intl.DateTimeFormat(..., { timeZone, hourCycle: 'h23', ...parts })` on a UTC guess and correct once. No date libraries.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: shared scheduling, range and number logic`

---

### Task 4: Login, household setup, members and role routing

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/auth.tsx`, `src/lib/api.ts`, `src/screens/Login.tsx`, `src/screens/Onboarding.tsx`, `src/screens/app/AppShell.tsx`, `src/screens/app/Settings.tsx` (members section only), `src/screens/elder/ElderToday.tsx` (placeholder heading), `src/components/ErrorRetry.tsx`, `supabase/functions/create-member/index.ts`
- Modify: `src/App.tsx`
- Test: `tests/auth.test.tsx`, `tests/login.test.ts`

**Interfaces:**
- Consumes: Task 2 tables and `create_household`; Task 1 i18n.
- Produces:
  - `supabase` client (`persistSession: true`, `autoRefreshToken: true`).
  - `useAuth(): { status: 'loading' | 'signedOut' | 'noHousehold' | 'ready'; profile: Profile | null; household: Household | null; signIn(login: string, password: string): Promise<void>; signUp(email, password): Promise<void>; signOut(): Promise<void>; refresh(): Promise<void> }`
  - `toEmail(login: string): string` — returns `login` if it contains `@`, else `` `${login.trim().toLowerCase()}@members.mfu.app` `` (so the elder and helper can sign in with a short username).
  - `create-member` Edge Function: `POST { display_name, role: 'elder'|'helper'|'family', username, password }` with the caller's JWT → checks the caller's profile role is `family`, creates the auth user (`email: toEmail(username)`, `email_confirm: true`) and a profile in the caller's household. Responses: `200 { id }`, `403`, `409 { error: 'username_taken' }`, `400 { error: 'weak_password' }` (min 8 chars).
  - Routes: `/login`, `/onboarding`, `/` (elder → `ElderToday`; helper/family → `AppShell` with tabs `today | medicines | readings | appointments | history | settings`). Helper sees no add/edit controls for medicines and appointments. `<ErrorRetry message onRetry />`.
  - `api.ts` grows in later tasks; here: `listMembers()`, `createMember(input)`, `updateMyLang(lang)`.

- [ ] **Step 1: Write the failing tests**

```ts
expect(toEmail('Mama')).toBe('mama@members.mfu.app')
expect(toEmail('a@b.com')).toBe('a@b.com')
```
```tsx
// with useAuth mocked:
// status 'signedOut' -> Login screen shown
// status 'noHousehold' -> Onboarding shown
// ready + role 'elder' -> ElderToday shown, no tab bar in the document
// ready + role 'helper' -> tab bar shown, Medicines tab has no "Add medicine" button
// ready + role 'family' -> Settings shows the "Add member" form
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Onboarding = two fields (household name, your name) → `rpc('create_household')` → `refresh()`. On sign-in, apply `profile.lang` via `setLanguage`; `LanguageSwitch` also calls `updateMyLang` when signed in.
- [ ] **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Commit** `feat: login, household setup, members and role routing`

---

### Task 5: Medicines (family manages; photo of the box)

**Files:**
- Create: `src/lib/files.ts`, `src/components/PhotoInput.tsx`, `src/screens/app/Medicines.tsx`, `src/screens/app/MedicineForm.tsx`
- Modify: `src/lib/api.ts`
- Test: `tests/files.test.ts`, `tests/medicines.test.tsx`

**Interfaces:**
- Produces:
  - `resizeImage(file: File, maxSide = 1600, quality = 0.8): Promise<Blob>` (JPEG via canvas; this also converts iPhone HEIC as decoded by Safari).
  - `uploadPhoto(householdId: string, folder: 'medications' | 'readings', file: File): Promise<string>` → path `` `${householdId}/${folder}/${crypto.randomUUID()}.jpg` ``.
  - `signedUrl(path: string): Promise<string>` (3600 s; cache in memory per path until 5 minutes before expiry).
  - `<PhotoInput label onPick(file: File) />` — `<input type="file" accept="image/*" capture="environment">` behind a large button.
  - `api`: `listMedications(): Promise<(Medication & { times: string[] })[]>`, `saveMedication(input: { id?: string; name; dose; notes; photo_path; active; times: string[] })`, `setMedicationPhoto(id, path)`, `deleteMedication(id)`.
- `saveMedication` replaces the medicine's `medication_times` with `times` (delete removed, insert new). Doses are created/removed by the tick job (Task 10), not here.

- [ ] **Step 1: Write the failing tests**

```tsx
// MedicineForm: saving with empty name or zero times shows a validation message and does not call saveMedication
// MedicineForm: duplicate time '08:00' entered twice is saved once
// MedicineForm (family): submits { name:'Metformin', dose:'500 mg', notes:'with food', times:['08:00','20:00'] }
// Medicines list (helper): shows medicines and a "Change photo" button only; no edit/delete
// uploadPhoto path matches /^<hid>\/medications\/[0-9a-f-]{36}\.jpg$/
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: medicines with photo and times`

---

### Task 6: Today screen, reminder popup, "Taken", history

**Files:**
- Create: `src/lib/sound.ts`, `src/components/SlotCard.tsx`, `src/screens/elder/ReminderPopup.tsx`, `src/screens/app/Today.tsx`, `src/screens/app/History.tsx`, `public/sounds/reminder.mp3`
- Modify: `src/screens/elder/ElderToday.tsx`, `src/lib/api.ts`
- Test: `tests/today.test.tsx`, `tests/sound.test.ts`

**Interfaces:**
- Consumes: `activeSlot`, `groupBySlot`, `formatTime`, `localDate`, `zonedToUtc` (Task 3); `mark_slot_taken` (Task 2); `signedUrl` (Task 5).
- Produces:
  - `api.listDoses(fromIso: string, toIso: string): Promise<DoseRow & { dose: string; notes: string | null; photo_path: string | null }[]>` (joins medication fields), `api.markSlotTaken(slotIso: string): Promise<number>`.
  - `sound.ts`: `isUnlocked(): boolean`, `unlock(): Promise<void>` (must be called from a tap; plays and pauses the audio element), `startAlarm(): void` (loops; no-op and no throw if locked), `stopAlarm(): void`.
  - `useTodayDoses()` hook in `ElderToday.tsx` exporting `{ slots: Slot[]; active: Slot | null; reload(): void }` — loads today (household-local day, plus any still-pending slot from yesterday), refetches every 30 s, on window focus, and on Supabase realtime changes to `doses`.
  - `<ReminderPopup slot onTaken />` — full-screen: each medicine's photo, name, dose, notes; one button "Taken" (`تم أخذ الدواء`).
- Behaviour:
  - Elder Today: when `active` is non-null the popup covers the screen and the alarm loops; otherwise the screen shows the next upcoming slot time, a big "Add reading" button, and today's appointment (wired in Task 9).
  - Tapping "Taken" calls `markSlotTaken`; on success stop the alarm and show a big ✓ for 2 seconds; on error keep the popup, stop nothing, show `<ErrorRetry>`.
  - If `!isUnlocked()`, Elder Today shows one big button "Turn on sound" that calls `unlock()`.
  - Alarm stops automatically when the slot is no longer active.
  - Helper/family `Today`: list of today's slots with status badges and a "Taken" button on pending/missed-and-still-allowed slots. `History`: per-day list (last 30 days) with taken / taken late / missed counts and details.

- [ ] **Step 1: Write the failing tests**

```tsx
// ElderToday with a pending slot due now containing 2 medicines -> popup shows both names, exactly one "Taken" button
// tap Taken -> markSlotTaken called once with the slot ISO; popup closes after resolve
// markSlotTaken rejects -> popup still visible, ErrorRetry visible, no ✓ shown; Retry calls it again
// no active slot -> "Add reading" button visible, popup absent
// sound locked -> "Turn on sound" button visible and popup still renders for a due slot
// startAlarm() when locked does not throw
// History: a day with statuses [taken, taken_late, missed] renders the three labels
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: today screen, reminder popup and dose history`

---

### Task 7: Readings — typed entry, ranges, charts, flag

**Files:**
- Create: `src/screens/elder/AddReading.tsx`, `src/screens/app/Readings.tsx`, `src/components/ReadingChart.tsx`
- Modify: `src/screens/app/Settings.tsx` (ranges + missed-wait section, family only), `src/lib/api.ts`, `src/App.tsx` (route `/add-reading`)
- Test: `tests/add-reading.test.tsx`, `tests/readings.test.tsx`

**Interfaces:**
- Consumes: `parseNumber`, `validateReading`, `isOutOfRange`, `rangeKeysFor` (Task 3).
- Produces:
  - `api.listReadings(type, sinceIso)`, `api.addReading(input: { type; context; value1; value2?; pulse?; photo_path?; source })` (computes `out_of_range` with current ranges before insert, sets `entered_by`), `api.listRanges()`, `api.saveRange(key, low, high)`, `api.updateHousehold({ missed_wait_minutes?, timezone? })`.
  - `<AddReading />` wizard, one step per screen in elder scale: (1) choose type — three big buttons; (2) sugar only: fasting / after meal / other; (3) "Type the number" or "Take a photo of the meter" (photo wired in Task 8; until then only typing); (4) number entry (`inputMode="decimal"`; BP has two boxes + optional pulse); (5) confirm screen showing the value large with "Save" and "Change"; (6) saved ✓, and if out of range a calm notice: "Outside the range set by the family. The family has been told." No advice text.
  - Exported `<ConfirmReading type context initial: { value1?: number; value2?: number; pulse?: number } source onSaved />` — steps 4–6, reused by Task 8.
  - `<ReadingChart type readings ranges />` — Recharts line chart, last 30 days, range band shaded, out-of-range points red; BP draws two lines.
- `Readings` screen (helper/family): tabs per type, chart, list with flag icon; family can delete a reading.
- Settings (family): six range rows (low/high) with a note "Ask the doctor for these numbers"; missed-dose wait minutes (5–240).

- [ ] **Step 1: Write the failing tests**

```tsx
// typing '١٢٠' for sugar/fasting -> confirm shows 120 -> Save calls addReading({type:'sugar',context:'fasting',value1:120,source:'typed'})
// typing 'abc' -> validation message, cannot continue
// temp '375' -> "Please check the number" message (implausible), cannot save
// BP 120/95 with range diastolic 60–90 -> after save, out-of-range notice shown
// addReading rejects -> ErrorRetry shown, no ✓
// Readings (helper): no range editor; Settings (family): saving low >= high shows an error
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: readings entry, ranges and charts`

---

### Task 8: Read the meter from a photo (Claude), confirm before saving

**Files:**
- Create: `supabase/functions/read-meter/index.ts`, `supabase/functions/read-meter/parse.ts`
- Modify: `src/screens/elder/AddReading.tsx`, `src/lib/api.ts`
- Test: `tests/read-meter-parse.test.ts`, `tests/add-reading-photo.test.tsx`

**Interfaces:**
- Consumes: `uploadPhoto` (Task 5), `<ConfirmReading>` (Task 7), `validateReading` (Task 3).
- Produces:
  - Edge Function `read-meter`: `POST { photo_path: string, type: 'sugar'|'bp'|'temp' }` with the caller's JWT. Verifies `photo_path` starts with the caller's `household_id + '/'`; downloads the image with the service role; calls Claude (model from secret `CLAUDE_MODEL`, default `claude-opus-5-5`) with the image and one forced tool `report_reading` whose input schema is `{ readable: boolean, value1?: number, value2?: number, pulse?: number, confident: boolean }`. System prompt: read only the digits displayed on the device; do not interpret, advise or comment; if the display is unclear set `readable: false`. Responses: `200 MeterResult`, `403`, `503 { error: 'not_configured' }` when `ANTHROPIC_API_KEY` is missing, `502 { error: 'read_failed' }` on API error.
  - `parse.ts`: `toMeterResult(type, toolInput: unknown): MeterResult` where `type MeterResult = { readable: false } | { readable: true; value1: number; value2?: number; pulse?: number; confident: boolean }`. Returns `{ readable: false }` if the input is malformed, required values are missing (`bp` needs `value2`), or `validateReading` says `implausible`.
  - `api.readMeter(photoPath, type): Promise<MeterResult>` — any non-200 resolves to `{ readable: false }`.
- UI: step 3 "Take a photo" → `PhotoInput` → upload → "Reading the photo…" → if readable, `<ConfirmReading initial={...} source="photo">` with the photo shown above the editable number and the line "Check the number matches the meter" (extra emphasis when `confident` is false); if not readable, message "Could not read the photo. Please type the number." → typing step, keeping `photo_path`.

- [ ] **Step 1: Write the failing tests**

```ts
expect(toMeterResult('sugar', { readable: true, value1: 126, confident: true })).toEqual({ readable: true, value1: 126, confident: true })
expect(toMeterResult('bp', { readable: true, value1: 120, confident: true })).toEqual({ readable: false })       // missing diastolic
expect(toMeterResult('temp', { readable: true, value1: 986, confident: true })).toEqual({ readable: false })     // implausible
expect(toMeterResult('sugar', 'garbage')).toEqual({ readable: false })
```
```tsx
// readMeter resolves {readable:true,value1:126,confident:true} -> confirm screen shows 126, addReading NOT yet called
// user edits to 128 and taps Save -> addReading called with value1:128, source:'photo', photo_path set
// readMeter resolves {readable:false} -> "please type the number" and typing step shown
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Load the `claude-api` skill, then implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: read meter photo with Claude, confirm before save`

---

### Task 9: Appointments and hospitals

**Files:**
- Create: `src/screens/app/Appointments.tsx`, `src/screens/app/AppointmentForm.tsx`
- Modify: `src/lib/api.ts`, `src/screens/elder/ElderToday.tsx`, `src/screens/app/Today.tsx`
- Test: `tests/appointments.test.tsx`

**Interfaces:**
- Produces: `api.listAppointments(fromIso?)` (joined with hospital name, ordered by `starts_at`), `api.saveAppointment(input: { id?; date: string; time: string; hospital_name: string; doctor; purpose; notes })` — converts `date`+`time` with `zonedToUtc(…, household.timezone)`, finds or creates the hospital by name, and when `starts_at` changes on an existing appointment clears `day_before_sent_at` and `day_of_sent_at`; `api.deleteAppointment(id)`, `api.listHospitals()`.
- `AppointmentForm` (family only): date, time, hospital (pick from list or type a new one), doctor, purpose, notes. `Appointments`: upcoming list, and a collapsed "Past" list. Elder Today and helper/family Today show a card for an appointment today (time, hospital, doctor, purpose) and "Tomorrow" for one tomorrow.

- [ ] **Step 1: Write the failing tests**

```tsx
// family saves date 2026-11-20, time 10:30, hospital "King Fahd" in Asia/Riyadh -> saveAppointment builds starts_at 2026-11-20T07:30:00.000Z
// missing date or time -> validation message, no save
// helper sees the list but no Add/Edit/Delete
// ElderToday with an appointment today shows hospital and time in elder scale
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: appointments across hospitals`

---

### Task 10: Notifications — push, Telegram, and the every-minute job

**Files:**
- Create: `supabase/functions/tick/index.ts`, `tick/run.ts`, `tick/store.ts`, `tick/notifier.ts`, `supabase/functions/telegram-webhook/index.ts`, `src/lib/push.ts`, `src/screens/app/SetupGuide.tsx`
- Modify: `src/sw.ts`, `src/screens/app/Settings.tsx`, `src/screens/elder/ElderToday.tsx`, `src/lib/api.ts`
- Test: `tests/tick-run.test.ts`, `tests/push.test.ts`

**Interfaces:**
- Consumes: everything in Task 3.
- Produces:

```ts
// tick/run.ts  (pure orchestration; no Deno imports)
interface Recipient { user_id: string; role: Role; lang: Lang; telegram_chat_id: number | null;
  push: { id: string; endpoint: string; p256dh: string; auth: string }[] }
interface TickStore {
  households(): Promise<{ id: string; timezone: string; missed_wait_minutes: number }[]>
  activeMedTimes(hid: string): Promise<MedTime[]>                 // active medicines only
  doses(hid: string, fromIso: string, toIso: string): Promise<DoseRow[]>
  insertDoses(hid: string, rows: { medication_id: string; scheduled_at: string }[]): Promise<void>  // on conflict do nothing
  deleteDoses(ids: string[]): Promise<void>
  claimReminded(ids: string[]): Promise<string[]>     // sets reminder_sent_at where null; returns ids actually claimed
  claimMissed(ids: string[]): Promise<string[]>       // pending -> missed + missed_alert_sent_at; returns claimed ids
  claimLateAlerted(ids: string[]): Promise<string[]>
  readingsToAlert(hid: string): Promise<{ id: string; type; context; value1: number; value2: number | null }[]>
  claimReadingAlerted(ids: string[]): Promise<string[]>
  appointments(hid: string, fromIso: string, toIso: string): Promise<ApptRow[]>
  claimAppointment(id: string, which: 'day_before' | 'day_of'): Promise<boolean>
  recipients(hid: string): Promise<Recipient[]>
  removePushSubscription(id: string): Promise<void>
}
interface Notifier {
  push(sub: Recipient['push'][number], payload: { title: string; body: string; tag: string }): Promise<'ok' | 'gone'>
  telegram(chatId: number, text: string): Promise<void>
}
runTick(store: TickStore, notifier: Notifier, now: Date): Promise<{ households: number; errors: string[] }>
```

- `runTick` per household, in order: (1) `planDoses` for today+tomorrow → insert/delete; (2) reload doses from `now − 36h` to `now + 1 min` → `classifyDoses`; (3) reminders → **push to elder and helper**; (4) misses → **Telegram + push to family**, one message per slot; (5) late-taken → Telegram + push to family; (6) out-of-range readings → Telegram + push to family; (7) appointment reminders → push to everyone, Telegram to those who linked it.
- **Claim before send:** every notification is sent only for ids returned by the matching `claim*` call (each is a single conditional `update ... returning id`), so two overlapping runs cannot both send. A send failure is recorded in `errors` and never throws; one household's failure does not stop the others. `'gone'` from push → `removePushSubscription`.
- `tick/index.ts`: requires header `x-cron-secret` equal to secret `CRON_SECRET` (else 401); builds the service-role store and notifier; returns the `runTick` result as JSON.
- `tick/notifier.ts`: `push` via `npm:web-push` with `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, returning `'gone'` on HTTP 404/410; `telegram` via `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage`; both are no-ops when their secrets are missing.
- `telegram-webhook`: verifies header `X-Telegram-Bot-Api-Secret-Token` equals `TELEGRAM_WEBHOOK_SECRET`; on message text `/start <code>` sets `telegram_chat_id` on the profile with that `telegram_link_code` and replies in that profile's language ("Connected. You will get alerts here." / Arabic equivalent); unknown code → polite "link not recognised" reply; always returns 200.
- `src/lib/push.ts`: `pushSupported(): boolean`, `isStandalone(): boolean`, `enablePush(): Promise<'enabled' | 'denied' | 'unsupported' | 'needs_home_screen'>` (requests permission, subscribes with `VITE_VAPID_PUBLIC_KEY`, upserts into `push_subscriptions` on `endpoint`). `'needs_home_screen'` when on iOS and not standalone.
- `src/sw.ts`: `push` event → `showNotification(title, { body, tag, renotify: true, icon })`; `notificationclick` → focus an open window or open `/`.
- Settings: "Turn on notifications" button (every role; on Elder Today it is one big button shown until enabled); family: Telegram row showing "Connected" or a "Connect Telegram" link `https://t.me/${VITE_TELEGRAM_BOT}?start=${telegram_link_code}` (hidden with a note if `VITE_TELEGRAM_BOT` is empty).
- `SetupGuide` (both languages, numbered, large): add to Home Screen (Safari → Share → Add to Home Screen; requires iOS/iPadOS 16.4+), open from the Home Screen icon, tap "Turn on notifications" → Allow, tap "Turn on sound"; family: connect Telegram.

- [ ] **Step 1: Write the failing tests** (`tests/tick-run.test.ts`, with an in-memory fake `TickStore` and a recording `Notifier`; household tz Asia/Riyadh, wait 30)

```ts
// creates today's and tomorrow's doses for an active 08:00 medicine; running again inserts nothing new
// at 08:05: elder and helper each get 1 push naming both 08:00 medicines; family gets nothing
// running runTick twice at 08:05 sends the reminder once
// two runTick calls started concurrently (Promise.all) at 08:35 send exactly one missed alert per family member
// at 08:35: doses become 'missed'; each family member with telegram_chat_id gets 1 Telegram message listing both medicines, and a push; elder gets no missed alert
// tick skipped from 07:59 to 09:15: doses go straight to 'missed' with one family alert, and no reminder is sent
// a taken_late dose -> one family follow-up, not repeated on the next run
// out-of-range reading -> one family alert, not repeated
// medicine time removed at 12:00 -> the pending 20:00 dose is deleted; the morning 'taken' dose remains
// appointment tomorrow 10:00, now 18:00 -> everyone gets the day-before reminder once
// push returns 'gone' -> removePushSubscription called with that id
// notifier.telegram throws for one family member -> the other still receives; error listed in result.errors
// family member without telegram_chat_id and without push subscriptions -> no throw
```
```ts
// push.test: enablePush() returns 'needs_home_screen' on iOS user agent when not standalone; 'unsupported' when PushManager is missing
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` and `npm run build` — PASS.
- [ ] **Step 5: Commit** `feat: reminders, missed-dose alerts, push and Telegram`

---

### Task 11: Put it online and check it end to end

**Files:**
- Create: `README.md` (owner setup steps in plain language, Arabic and English), `supabase/cron.example.sql`
- Modify: none expected

**Interfaces:**
- Consumes: Supabase and Vercel MCP tools (already connected); migrations and functions from earlier tasks.

- [ ] **Step 1: Create the Supabase project** `mfu` (free tier; confirm cost with the owner through the tool's own prompt) and apply `0001`–`0003`. Create the private bucket if the migration did not.
- [ ] **Step 2: Run the security advisors** (`get_advisors`, type security) and fix every finding about missing RLS or exposed functions.
- [ ] **Step 3: Run `supabase/tests/rls.sql`** against the project (it rolls back). Expected: completes with no exception.
- [ ] **Step 4: Generate VAPID keys** (`npx web-push generate-vapid-keys`), a random `CRON_SECRET` and `TELEGRAM_WEBHOOK_SECRET`; set the function secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `CLAUDE_MODEL`. Do not print or commit secret values.
- [ ] **Step 5: Deploy the four Edge Functions.** `tick` and `telegram-webhook` with JWT verification off (they check their own secret headers); `read-meter` and `create-member` with it on.
- [ ] **Step 6: Schedule the job.** Enable `pg_cron` and `pg_net`, then `cron.schedule('mfu-tick', '* * * * *', ...)` calling `net.http_post` on the `tick` URL with the `x-cron-secret` header. `supabase/cron.example.sql` holds the same statement with placeholders. Verify: after 2 minutes `cron.job_run_details` shows successes and the function logs show HTTP 200.
- [ ] **Step 7: Deploy the frontend to Vercel** with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` (and `VITE_TELEGRAM_BOT` once known). In Supabase Auth settings set the site URL to the Vercel URL.
- [ ] **Step 8: Smoke test in a browser** (Playwright, iPhone viewport) on the live URL: sign up → create household → add elder and helper → add a medicine due 2 minutes from now → sign in as the elder → popup appears → tap Taken → family History shows "taken". Add a second medicine, leave it, with wait set to 5 minutes → it shows "missed". Add a typed reading with Arabic digits → appears on the chart. Switch language → layout flips. Delete the test data afterwards.
- [ ] **Step 9: Write `README.md`** — the owner's steps, each a short numbered list: (a) open the link and create the family account; (b) add the elder and helper; (c) on each phone/tablet: Add to Home Screen, open, turn on notifications and sound; (d) create the Telegram bot with @BotFather and send the token and bot name; (e) get an Anthropic API key and send it; (f) enter the doctor's normal ranges. Note which features wait on (d) and (e).
- [ ] **Step 10: When the owner supplies them,** set `TELEGRAM_BOT_TOKEN` and `ANTHROPIC_API_KEY` as function secrets, call Telegram `setWebhook` with the `telegram-webhook` URL and `secret_token`, set `VITE_TELEGRAM_BOT` on Vercel and redeploy. Verify: "Connect Telegram" links a chat and a forced missed dose sends a Telegram message; a meter photo returns a number to confirm.
- [ ] **Step 11: Commit and push** `docs: owner setup guide and cron example`
