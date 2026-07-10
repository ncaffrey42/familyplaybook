# Spec: Voice-to-Guide ("brain dump a guide")

**Status:** Draft for approval — not yet implemented
**Effort estimate:** ~1 focused day (S)
**Feature flag:** reuses `VITE_ENABLE_AI_GENERATION`

## 1. What it is

The user taps a mic button, talks naturally for up to 3 minutes ("okay so
for the cat: half a scoop of dry food at 7am in the left bowl, the vet's
number is on the fridge…"), and gets a **complete draft guide** — title,
description, category, icon, and structured steps — prefilled into the
existing Create Guide form for review and saving.

Voice removes the #1 reason guides don't get created (typing out steps),
and it's the most-loved AI pattern in consumer apps right now (AudioPen,
Voicenotes, Nori's voice input).

## 2. User flow

1. **Entry points**
   - Mic button in `CreateGuideScreen` header ("Dictate this guide")
   - "New guide from voice" action on the My Guides screen FAB
2. **Recording** — full-screen sheet: pulsing mic, live timer, 3:00 cap,
   Cancel / Stop-and-generate. (Nice-to-have later: live waveform.)
3. **Generating** — progress state ("Listening… Structuring your guide…"),
   typically 5–15 s.
4. **Review** — `CreateGuideScreen` opens prefilled with the draft (name,
   description, category, icon, steps). A dismissible banner shows the raw
   transcript ("Here's what we heard") so the user can catch mishears.
   Nothing is saved until the user taps Save — the normal save path,
   so plan limits, usage tracking, and RLS all apply unchanged.
5. **Errors** — empty/gibberish transcript → toast "We couldn't make a
   guide out of that — try again a bit slower"; over limit / no
   entitlement → the existing upgrade modal.

## 3. Architecture

One new edge function; the legacy deployed-only functions are retired.

```
Client (MediaRecorder)
  └─ POST multipart audio → /functions/v1/voice-to-guide   (verify_jwt ON)
       1. requireUser + entitlement check (plan has ai_generation)
       2. rate limit (per-user daily cap)
       3. OpenAI Whisper: audio → transcript
       4. Chat completion (JSON-schema response): transcript → guide draft
       5. return { transcript, guide }
Client prefills CreateGuideScreen → user edits → existing save path
```

### 3.1 New edge function: `supabase/functions/voice-to-guide/index.ts`

- **Auth:** deployed with JWT verification (default). `requireUser(req)`.
- **Entitlement:** look up the caller's plan via `user_billing.plan_key` →
  `plans` → `plan_entitlements`; require the AI entitlement. (Add an
  `ai_generation` boolean feature row to `plan_entitlements` for couple &
  family in a small migration — currently AI gating only exists as UI copy
  in `plans.js`, nothing enforceable.)
- **Rate limit:** max **20 generations/user/day** (count rows in a tiny
  `ai_generations` ledger table: user_id, kind, created_at; also gives us
  usage analytics). Return 429 with a friendly message.
- **Input:** multipart `audio` (webm/opus from Chrome/Android, mp4/aac
  from iOS Safari — Whisper accepts both). Hard caps: **10 MB / ~3 min**.
- **Step 1 – transcription:** OpenAI `whisper-1` (server `OPENAI_API_KEY`
  secret, already set). Reject empty/whitespace transcripts early.
- **Step 2 – structuring:** chat completion (`gpt-4o-mini` — cheap, fast,
  reliable JSON) with `response_format: json_schema` so the output is
  validated at the API layer:

  ```json
  {
    "name":        "string, ≤ 60 chars, imperative or noun phrase",
    "description": "string, 1-2 sentences",
    "category":    "enum: How To | Find It | Reference",
    "icon":        "enum: <the allowed lucide names from GuideIconPicker>",
    "steps": [ { "title": "string ≤ 50 chars", "text": "string" } ]
  }
  ```

  System prompt essentials: extract only what the speaker said (never
  invent phone numbers, doses, addresses); merge rambling into clean
  steps; 2–10 steps; write for a stressed babysitter reading on a phone;
  pick `Find It` when the recording is about where things are, `Reference`
  for facts/contacts, else `How To`.
- **Output:** `{ transcript, guide }`. The function never writes to the
  DB — the client owns saving via the normal path.
- **Secrets:** server `OPENAI_API_KEY` only. The legacy per-user
  key flow (`user_secrets`, `get_my_openai_key`, "paste your OpenAI key in
  settings") is retired for this feature — consumer users will never have
  their own API key.

### 3.2 Client

- `src/hooks/useVoiceRecorder.js` — MediaRecorder wrapper: permission
  handling, mimeType negotiation (`audio/webm;codecs=opus` →
  `audio/mp4` fallback for iOS Safari), 3-min auto-stop, returns a Blob.
- `src/components/VoiceCaptureSheet.jsx` — the recording/generating UI
  (Dialog, mirrors DowngradeFlow's patterns).
- `CreateGuideScreen` — accepts a prefill draft via location state
  (`navigate('/guide/new', { state: { aiDraft } })`); maps draft steps
  into its `{id, text, image_url, video_url}` step shape (uuid per step);
  shows the transcript banner when `aiDraft` present.
- Gating: mic entry points render only when `VITE_ENABLE_AI_GENERATION`
  and the user's plan has the AI entitlement (server still re-checks).

### 3.3 Prerequisite cleanup (same PR)

Delete the legacy deployed-only functions that this replaces or that are
dead: `transcribe-audio` (⚠️ currently callable **without auth** on the
server API key — an open proxy anyone can bill us with), `openai`,
`stripe-webhook-handler`, `downgrade-subscription`,
`verify-checkout-session`. (`supabase functions delete <name>`.)

## 4. Cost & limits

- Whisper: $0.006/min → ≤ $0.018 per capture
- gpt-4o-mini structuring: < $0.01 per capture
- Worst case per user per day (20 caps): ~$0.50; typical: pennies.
  Couple plan at $6.99/mo comfortably covers realistic usage.

## 5. Security & privacy

- JWT required; entitlement + rate limit enforced server-side
- Audio is processed in-memory and never stored; only the transcript
  returns to the client and is discarded unless the user saves the guide
- Prompt instructs the model to never fabricate contact info/dosages —
  and the review step keeps a human between AI output and saved content
- Add a line to the privacy policy: voice recordings are sent to OpenAI
  for transcription and not retained

## 6. Testing plan

- Unit (vitest): draft→form-step mapping; entitlement/flag gating of the
  entry points
- Function: schema-validation happy path + empty-transcript + over-limit
  (can be run as Deno tests like change-subscription-plan's)
- Manual e2e: Chrome desktop + **iOS Safari** (codec + permission UX),
  ramble test, silence test, 3-min cap
- Live verification: create a real guide by voice on localhost

## 7. Out of scope (later iterations)

- Live streaming transcription while speaking
- Voice-editing an existing guide ("add a step about the spare key")
- Snap-to-Guide (photo→guide) — separate spec, shares the ledger/gating
- Bundle generation from one long recording

## 8. Open questions for product owner

1. Cap at 20/day OK? (Cheap either way — this is abuse protection.)
2. Free-tier taste: give free users 3 lifetime voice generations as an
   upsell hook, or keep it strictly paid?
3. Should the transcript be saved on the guide (hidden field) for future
   "regenerate" support, or discarded? (Spec assumes discarded.)
