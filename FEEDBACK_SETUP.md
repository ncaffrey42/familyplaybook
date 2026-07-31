# In-App Feedback — Setup

The feedback system is live in the app (bubble + two checkpoint prompts). Every
submission is stored in the `feedback` table and fanned out to any destination
you configure below. **Each destination is enabled purely by setting its
secret(s)** — no code changes, and any combination works.

## How it behaves

- **Bubble** — 44px heart in the bottom-left of every signed-in screen. One
  tap → one question, thumbs up/down + optional note.
- **Checkpoints** — fire once per user, ever (enforced by a DB unique index):
  1. `setup` — right after onboarding's "Get Started"
  2. `first_action` — after saving their very first guide
- **Review ask** — after a user's 2nd lifetime thumbs-up, native app only, at
  most every 90 days: "Enjoying Family Playbook? Leave a review" →
  deep-links to the store review page. On iOS it stays hidden until
  `VITE_APPSTORE_ID` is set (get the numeric id from App Store Connect after
  the listing exists). Android uses the package id and works immediately.
- Kill switch: `VITE_ENABLE_FEEDBACK=false` hides everything.

## Destination 1: Google Sheet

1. Create a Sheet with headers in row 1:
   `created_at | email | kind | rating | message | route | platform | version`
2. Extensions → Apps Script, paste:

   ```js
   function doPost(e) {
     const p = JSON.parse(e.postData.contents);
     SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].appendRow([
       p.created_at, p.email, p.kind, p.rating || '', p.message || '',
       p.context.route || '', p.context.platform || '', p.context.version || ''
     ]);
     return ContentService.createTextOutput('ok');
   }
   ```
3. Deploy → New deployment → **Web app** → Execute as *Me*, access
   *Anyone* → copy the web-app URL.
4. `supabase secrets set FEEDBACK_SHEETS_URL=<that URL>`

## Destination 2: Slack

1. Slack → your workspace → Apps → **Incoming Webhooks** → add to the channel
   you want (e.g. `#feedback`) → copy the webhook URL.
2. `supabase secrets set FEEDBACK_SLACK_WEBHOOK=<webhook URL>`

Messages look like: `👍 user@example.com (after setup): "so easy!"` with
route/platform context.

## Destination 3: Email (Resend)

1. Create a free account at https://resend.com → API Keys → create one.
2. `supabase secrets set RESEND_API_KEY=<key> FEEDBACK_EMAIL_TO=you@example.com`
3. Optional: verify your domain in Resend and set
   `FEEDBACK_EMAIL_FROM="Family Playbook <feedback@famplaybook.com>"` —
   otherwise Resend's onboarding sender is used.

## Turning a destination off

Unset its secret: `supabase secrets unset FEEDBACK_SLACK_WEBHOOK` (etc.).
Delivery is best-effort — a failing destination never blocks or fails the
user's submission; per-destination results are returned to the client and
logged.

## Reading the raw data

Everything lands in the `feedback` table (service-role only):
```sql
select created_at, kind, rating, message, context
  from feedback order by created_at desc;
```
