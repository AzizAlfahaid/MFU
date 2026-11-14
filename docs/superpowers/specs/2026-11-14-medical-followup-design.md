# Medical Follow-Up — Design (Version 1)

Date: 2026-11-14

## Intent and why

A private web app for one household that helps an elderly person, a live-in
helper and remote family keep track of medicines, daily health readings and
hospital appointments. The goal is that doses are not missed, the family
knows quickly if one is, and the family can see the elder's health trend
without phoning. It's used on iPhone or tablet, added to the Home Screen
(PWA), and doesn't go through the App Store.

## Goals (Version 1)

1. **Medications.** Each medicine has a name, dose, one or more daily times,
   notes, and a photo of the box/pills. At each time, the elder's screen shows
   a full-screen popup with the photo and a big "Taken" button, plus sound.
   If it isn't marked Taken within a set time, the family is alerted. There's
   a daily history of taken/missed doses.
2. **Daily readings.** Blood sugar, blood pressure (systolic/diastolic, pulse
   optional) and temperature. Entered by typing, or by photographing the meter:
   Claude reads the number, and the user confirms or corrects it before it's
   saved. Simple charts per reading type, and a flag when a value is outside
   the range the family set.
3. **Appointments.** Date, time, hospital, doctor, purpose and notes, across
   several hospitals. Reminders the day before and on the day.
4. **Arabic (RTL) and English**, with a switch. Arabic is the default.

## Version 2 (not built now; keep the design open for it)

- Reports: upload photos/PDFs; Claude writes plain "Dos & Don'ts" with the
  fixed notice "Information only. Confirm with the doctor."
- Meals: photos with date/time; Claude compares them with readings and
  reports, labelled as estimates.

The data model should leave room for `reports` and `meals` tables and a
private storage bucket for them.

## Non-goals

TV browser, App Store app, hospital system integration, doctor logins,
payments, several elders per household, WhatsApp (possible later).

## Anti-goals (failure even if it "works")

- The elder screen is confusing: small text, menus, more than one main action.
- A missed dose goes unnoticed by family.
- Health data or photos are reachable by anyone outside the household
  (public links, missing access rules).
- A number read from a photo is saved without a person confirming it.
- Claude suggests changing a dose or gives a diagnosis.

## Users and roles

One household and one elder. Each person has their own login and a role:

| Role | Sees | Can do |
|------|------|--------|
| Elder | Today only | Tap "Taken"; add a reading |
| Helper | Today and history | Everything the elder can, plus photos of meals, readings and medicines |
| Family (one or more people) | Everything | Everything, plus is the **only** role that adds, edits or deletes medications and appointments; sets normal ranges and the missed-dose wait time; gets alerts |

Roles are enforced in the database (row-level security), not only in the UI.

## Elder screen design rules

- One action per screen, very large text (minimum ~28px body, buttons at
  least ~80px tall), high contrast, no small menus.
- The "Today" screen shows the next dose (photo, name, dose, big "Taken"),
  then a large "Add reading" button, and today's appointment if there is one.
- Reminder popup: full screen, medicine photo, name and dose in large text,
  one huge "Taken" button, with sound repeating until tapped or the window ends.
- Helper/family screens can be denser: tabs for Today, Medicines, Readings,
  Appointments, History, Settings.

## Reminders and alerts — how they actually work on iPhone/iPad

- **Page open:** in-page full-screen popup plus sound at dose time.
- **Page closed or phone locked:** a Web Push notification (normal system
  sound). Tapping it opens the popup. This requires the app to be added to the
  Home Screen, on iOS/iPadOS 16.4 or newer. Android tablets work too.
- **Missed dose:** if a dose isn't marked Taken within the wait time (default
  30 minutes, adjustable by family), the family gets an alert via
  **Telegram** (primary) and push (backup).
- **Appointments:** push and Telegram to everyone the day before (evening) and
  on the morning of the day.
- A scheduled job on the server runs every minute: it creates today's dose
  entries, sends due reminders, and marks/alerts missed doses. Reminders must
  not depend on any phone having the page open.
- All times use the household's time zone (setting; default Asia/Riyadh).

### Telegram setup

One Telegram bot for the household. Each family member taps a link in
Settings that opens the bot; pressing "Start" links their Telegram chat to
their account. Free, no approval needed.

## Approaches considered

**Missed-dose alert channel**
1. Push + email: free, quick. Family may not notice email.
2. WhatsApp via Meta (or Twilio): what people check most, but needs a business
   account, a small cost per message, and days of approval.
3. **Telegram + push backup (chosen by the owner):** free, works from day one,
   no approval. Downside: family must install Telegram. WhatsApp can be added
   later behind the same "alert sender" step.

**Overall build (builder's call, accepted):** a single PWA on Vercel, with
Supabase for the database, logins, private file storage, scheduled jobs and
server functions, and the Claude API called only from server functions so the
key never reaches the phone. The other options (a native app, a no-code
builder) are ruled out by "no App Store" and the privacy/role needs.

## Data (outline)

- `household` (name, time zone, missed-dose wait minutes, language default)
- `profiles` (user, household, role, display name, preferred language,
  telegram chat id)
- `medications` (name, dose, notes, photo path, active)
- `medication_times` (medication, time of day)
- `doses` (medication, scheduled at, status: pending/taken/missed, taken at,
  taken by, alert sent)
- `readings` (type: sugar/bp/temp, values, unit, taken at, entered by, photo
  path, source: typed/photo, out-of-range flag)
- `ranges` (reading type, low, high; set by family)
- `appointments` (date/time, hospital, doctor, purpose, notes)
- `hospitals` (name) to pick from
- `push_subscriptions` (user, device subscription)
- Private storage bucket `household-files`; photos are shown only through
  short-lived signed links.

## Claude (reading meter photos)

- A server function sends the photo to Claude with a strict instruction: return
  only the number(s) shown on the meter, plus a confidence level; no advice.
- The app shows the read value in big editable boxes; nothing is saved until
  the user taps "Confirm". If Claude can't read it, the user types it instead.
- Use the latest Claude model with vision support.

## Privacy and safety

- Login required for everything. Sessions stay signed in on the elder's device
  so they never need to type a password; family sets up that device once.
  (Builder's call.)
- Row-level security on every table: only members of the household can read
  their data; only family can change medications, appointments and ranges.
- No public file links. The Claude API key and Telegram bot token are kept on
  the server only.
- Any Claude output (now and in V2) never changes doses and never diagnoses.

## Constraints

- Mobile-first, works on iPhone and iPad Safari; Android tablet as a bonus.
- Arabic RTL layout must be first-class, not an afterthought.
- Owner is not a developer: setup steps (Home Screen, notifications, Telegram)
  must be short, simple, and shown inside the app in both languages.

## Detailed rules (builder's calls unless marked)

- **Late dose:** after a dose is marked missed, "Taken" can still be tapped
  until that medicine's next scheduled time. It is saved as "taken late" and
  family gets a short follow-up message. The missed alert is sent once.
- **Who is reminded at dose time:** the elder's and the helper's devices.
  Family is only told about misses.
- **Out-of-range reading:** flagged in the app and also sent to family by
  Telegram/push.
- **Blood sugar** readings are tagged fasting / after meal / other, each with
  its own range. Blood pressure and temperature have one range each.
- **Medicine photo:** the helper may add or replace the photo only; all other
  medication fields are family-only.
- **Accounts:** Supabase and Vercel are already connected and the builder
  creates the projects. The owner must supply an Anthropic API key and create
  the Telegram bot; the app's setup guide gives simple steps for both. Free
  tiers are assumed.

## Left to the builder

- Frontend framework and libraries, chart library, styling.
- Exact screens and copy for the helper/family views.
- Reminder sound choice; how many times it repeats.
- How the owner first creates the household and invites the other logins.

## Open items the owner can fill later (as in-app settings, not blockers)

- Normal ranges for sugar and blood pressure (from the doctor).
- Hospital list and medicines: entered by family in the app.
