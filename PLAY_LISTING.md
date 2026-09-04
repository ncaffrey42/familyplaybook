# Google Play store listing — Family Playbook

Draft copy for the Play Console listing. Every claim here is checked against
what the app actually does today; nothing describes a flag-gated or unshipped
feature. Fill the `<PLACEHOLDER>` fields, which need decisions or account data.

Companion to [`APP_STORE_CHECKLIST.md`](APP_STORE_CHECKLIST.md).

---

## 1. Identity

| Field | Value |
|---|---|
| App name (≤30 chars) | `Family Playbook` (15) |
| Package | `com.familyplaybook.app` |
| Default language | English (United States) |
| App or game | App |
| Free or paid | Free (with in-app subscriptions) |
| Category | Parenting *(alternative: Lifestyle — Parenting is the tighter fit)* |
| Tags | family organizer, checklists, babysitter, house guide |
| Contact email | `<SUPPORT_EMAIL>` |
| Website | https://famplaybook.com |
| Privacy policy | https://famplaybook.com/privacy-policy/ *(verified live, HTTP 200)* |

## 2. Short description (≤80 chars)

```
One link tells a sitter, grandparent or guest exactly how your home runs.
```
(72 characters)

Alternatives:
```
Turn how your family runs into guides you can share with one link.
```
```
The bedtime routine, the alarm code, the dog's dinner — shared in one link.
```

## 3. Full description (≤4000 chars)

```
Every family runs on a hundred small routines that live in one person's head.
The bedtime order. Which door sticks. What the dog actually eats. Family
Playbook gets them out of your head and into something you can hand to
someone else.

WRITE IT ONCE
Create a guide for anything that has steps — bedtime, the morning school run,
feeding the cat, the alarm panel. Add photos or a short video to any step, so
there is no ambiguity about which switch or which bowl.

BUNDLE IT FOR WHOEVER NEEDS IT
Group guides into a bundle for the occasion: everything a Friday-night sitter
needs, everything a grandparent needs for a weekend, everything a house-guest
needs to not text you at 9pm.

SHARE WITH ONE LINK — THEY NEED NOTHING
Send a link. They open it in a browser and see exactly what you chose to share,
with a checklist they can tick as they go. No app to install, no account to
create, nothing to sign up for. You can turn any link off the moment you want
it gone.

KEEP THE FAMILY IN SYNC
Invite a partner or a co-parent so you are not the only person who can update
the playbook, and choose per person what they can see.

WHAT YOU GET FREE
Create guides and bundles, add photos and video, and share one live link at a
time. No trial clock.

FAMILY PLAYBOOK COUPLE — $6.99/month or $69.90/year
Unlimited live share links, the full template library, and AI assistance:
describe a routine out loud and get a structured, editable draft back.

FAMILY PLAYBOOK FAMILY — $13.99/month or $139.90/year
Everything in Couple, for households that need more room.

Subscriptions renew automatically unless cancelled at least 24 hours before
the period ends. Manage or cancel any time in Google Play. You can delete your
account, and everything in it, from inside the app.
```

## 4. Graphics

| Asset | Requirement | Status |
|---|---|---|
| App icon | 512×512 32-bit PNG | Master at `assets/icon.png` is 1024×1024 — export at 512 |
| Feature graphic | 1024×500 PNG/JPEG, no alpha | `<TODO>` — required, listing cannot publish without it |
| Phone screenshots | 2–8, min 320px, 16:9 or 9:16 | `<TODO>` — see §5 |
| Tablet screenshots | optional | skip unless tablet support is claimed |

Note: `assets/icon.png` and `assets/splash.png` are currently byte-identical.
A splash usually wants a different composition (logo centred on the brand
background) than an app icon. Worth revisiting, not a blocker.

## 5. Screenshots to capture

Emulator is 1080×2400 (9:20), which satisfies Play's phone requirement.

1. **Home** — greeting, the share card, a few guides. The product in one frame.
2. **A guide open** — steps with a photo, checklist ticks visible.
3. **Share Center** — live links with expiry, "Assemble a handoff" row.
4. **The recipient's view** — a shared bundle in a plain browser. This is the
   differentiator; show that the other person installed nothing.
5. **Plans** — so pricing is not a surprise after install.

Captured 2026-08-20 from the API-36 emulator build (1080×2400).

## 6. Data safety form

Mirrors the iOS privacy labels. All collection is first-party; there is no
third-party ad or tracking SDK, so "shared with third parties" is No for
advertising purposes.

| Data type | Collected | Purpose | Optional? |
|---|---|---|---|
| Email address | Yes | Account management, sign-in | Required |
| Name | Yes | Personalisation (greeting, family members) | Optional |
| Photos / videos | Yes | App functionality (guide step media) | Optional |
| Other user content | Yes | App functionality (guide and bundle text) | Required |
| User IDs | Yes | Account management | Required |
| App interactions | Yes | Analytics (first-party) | Required |
| Purchase history | Yes | Managing the subscription | Required |

- Encrypted in transit: **Yes** (HTTPS throughout).
- Users can request deletion: **Yes** — in-app Delete Account removes the
  account and its data (`delete-account` edge function), plus
  https://famplaybook.com/privacy-policy/
- Data collected is **not** used for advertising or shared with data brokers.

## 7. Blockers before this listing can go live

1. ~~The Android build hangs on the Home screen~~ — **WITHDRAWN, this was not
   a real defect.** Instrumenting `fetchData` showed every marker firing
   through to `finally { setIsDataLoaded(true) }`, and a clean build with the
   instrumentation removed loads correctly and repeatably. The original hang
   was an artefact of the test procedure: `adb install -r` was run over an
   already-running app on a just-booted emulator, leaving a wedged WebView.
   `adb shell am force-stop` before launching fixes it every time. Nothing in
   the app was changed. **Always force-stop before relaunching after an
   install-over.**
2. **Upload keystore does not exist.** Signing is wired
   (`android/keystore.properties`, gitignored) but the key must be created by
   a human — see `android/keystore.properties.example`.
3. **In-app purchases are not enabled.** `VITE_ENABLE_IAP` is unset, so a
   native build would attempt Stripe. Play **rejects** digital-goods sales
   that bypass Play Billing. RevenueCat is wired; dashboard/product config
   and the flag remain.
4. **Backend schema drift** — migrations 20240128–20240133 are written but not
   applied to the live database.
5. **Feature graphic** (1024×500) does not exist and is mandatory.
