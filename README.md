# Medical Follow-Up / المتابعة الطبية

A private web page (PWA) for one household: medicines with reminders, daily readings, and hospital appointments.
Arabic and English. Works on iPhone and iPad (added to the Home Screen) and on Android.

## Who sees what
| Person | Sees | Can do |
|---|---|---|
| Elder | Today only, very large | Tap **Taken**, add a reading |
| Helper | Everything | The same, plus photos of medicines and meters |
| Family | Everything | Also the **only** ones who edit medicines, appointments, normal ranges, and who get missed-dose alerts |

## Owner setup (once)
1. **Open the link** and sign in with the family login you were given (username `family`). Then go to **Settings → New password** and choose your own password.
2. In **Settings → Household members**, add the elder and the helper (a short username and a password).
3. In **Medicines**, add each medicine: name, dose, times, a photo of the box.
4. In **Settings**, enter the **normal ranges** for sugar, blood pressure and temperature (ask the doctor).
5. **On each phone / tablet** (elder, helper, family):
   1. Open the link in **Safari**. Tap **Share → Add to Home Screen** (iPhone / iPad need iOS / iPadOS 16.4 or newer).
   2. Close Safari and open the app from its **icon**.
   3. Sign in, then tap **Turn on notifications → Allow**.
   4. On the elder's phone, tap **Turn on sound** each time the app is opened.
6. **Telegram alerts for family** (free): create a bot with `@BotFather` in Telegram and send the *bot token* and *bot name* to whoever set this up. Each family member then taps **Settings → Connect Telegram** and presses **Start**.
7. **Reading numbers from a meter photo**: create an API key at the Anthropic Console and give it to whoever set this up. Until then, numbers are typed.

## Privacy and safety
- Everyone signs in. Data and photos are private to the household (database access rules, private file storage, short-lived photo links).
- Claude only reads numbers from a photo. A person always confirms the number before it is saved.
- Claude never changes doses or gives medical advice.

## For the person maintaining it
- Frontend: Vite + React (`npm run dev`, `npm test`, `npm run build`), hosted on Vercel.
- Backend: Supabase (Postgres with row-level security, Auth, private Storage, Edge Functions `tick`, `read-meter`, `create-member`, `telegram-webhook`).
- Database tests: `PGPASSWORD=... supabase/tests/run-local.sh` (needs a local Postgres).
- The `tick` function runs every minute (see `supabase/cron.example.sql`).
- Server secrets are read by the Edge Functions from their environment first, then from the private `app_secrets` table (readable only by the service role): `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` (optional), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`.
- This installation serves **one household**: only the first person can create it; everyone else is added by family in Settings.
- Frontend variables (Vercel): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`, `VITE_TELEGRAM_BOT`.
