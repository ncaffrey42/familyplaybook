# App Store & Google Play Submission Checklist

Track readiness for both stores. Fill in `<PLACEHOLDERS>` as info becomes
available. Grouped by "will block review" → "listing content" → "accounts".

Legend: ☐ todo · ⚠️ needs a decision/info · ✅ done in this branch

---

## 0. Launch blockers, newest first

- ✅ ~~Android build hangs on Home~~ — **withdrawn 2026-08-20, not a real
  defect.** Instrumentation showed `fetchData` running to completion; a clean
  uninstrumented build loads repeatably. The hang was a test-procedure
  artefact: `adb install -r` over a running app on a freshly booted emulator
  leaves a wedged WebView. Always `adb shell am force-stop` before relaunching.
  No app code was changed.
- 🛑 **IAP disabled** — `VITE_ENABLE_IAP` unset, so a native build would use
  Stripe. Play rejects digital goods sold outside Play Billing.
- 🛑 **No upload keystore** — signing is wired, the key is not created.
- ⚠️ **Backend schema drift** — migrations 20240128–20240133 written, not
  applied to the live database.
- ⚠️ **PR #23 unmerged** — 36 commits ahead of `main`.

## A. Compliance blockers (rejection risks)

- ✅ **Account deletion** — in-app "Delete Account" fully removes account + data
  (delete-account edge function; verified live).
- ✅ **Sign in with Apple** — offered alongside Google/Facebook/Discord
  (guideline 4.8). Requires Apple provider config in Supabase +
  "Sign in with Apple" capability in Xcode (see MOBILE_BUILD.md §2–3).
- ✅ **No placeholder/dead features shown** — Host Mode hidden behind a flag;
  its misleading plan-card bullet replaced.
- ✅ **In-App Purchase (guideline 3.1.1 / Play Billing)** — native apps use
  RevenueCat store billing (not Stripe); purchases reconcile into user_billing
  via the revenuecat-webhook (verified live). Restore Purchases + store-native
  management present. **Remaining: dashboard/product config** — follow
  REVENUECAT_SETUP.md, then set `VITE_ENABLE_IAP=true` in the native build.
- ✅ **Privacy policy URL** — https://famplaybook.com/privacy-policy/ is **live**
  (verified 2026-08-20, HTTP 200). Confirm it covers: account data, guides/media
  in Supabase, Stripe/Play Billing for payments, OpenAI for AI, analytics.
- ☐ **Support URL / contact** — https://famplaybook.com/support/ (support email as needed).
- ☐ **Permission usage strings** applied from `native-config/` (mic, camera,
  photos) — Apple auto-rejects missing ones.

## B. App Store Connect (iOS) listing

- ☐ App name: **Family Playbook** · Subtitle: `<SUBTITLE ≤30 chars>`
- ☐ Bundle ID: `com.familyplaybook.app` · SKU: `<SKU>`
- ☐ Primary category: `<CATEGORY, e.g. Productivity / Lifestyle>`
- ☐ Age rating questionnaire → likely 4+ (confirm no UGC concerns from shared
  guides; shared links are creator-controlled)
- ☐ Promotional text / description / keywords: `<COPY>`
- ☐ **Screenshots** (required sizes): 6.7" iPhone (1290×2796) and 6.5"; iPad if
  you support it. Capture: home, a guide, Voice-to-Guide, a shared bundle,
  subscription screen.
- ☐ App privacy ("nutrition labels") — declare: Contact Info (email), User
  Content (guides/photos), Identifiers (user id), Usage Data (first-party
  analytics). **Not** tracking across apps (no third-party SDK) → ATT not
  required.
- ☐ Encryption compliance: uses standard HTTPS only → typically "exempt"
  (`ITSAppUsesNonExemptEncryption = false` in Info.plist).

## C. Google Play Console (Android) listing

- ☐ App name, short + full description: `<COPY>`
- ☐ Category: `<CATEGORY>` · Content rating questionnaire (IARC)
- ☐ **Data safety form** — mirror the iOS nutrition labels (data collected,
  purpose, encryption in transit, deletion available = yes → link the in-app
  delete + https://famplaybook.com/privacy-policy/)
- ☐ Feature graphic (1024×500) + phone screenshots (min 2)
- ✅ **Target API level** — bumped to **36** (compileSdk + targetSdk) 2026-08-20
  and verified: release AAB and debug APK both build, and the installed app
  reports `targetSdk=36` on device. Confirm 36 still meets Play's floor at
  submission time — the requirement moves annually.
- ⚠️ **App signing** — the Gradle `signingConfig` is wired and reads
  `android/keystore.properties` (gitignored; see `keystore.properties.example`).
  **The keystore itself does not exist and must be created by a human** — its
  password is a credential. Enroll in Play App Signing at upload; that is the
  only recovery path if the upload key is ever lost.
- ☐ Store listing copy, graphics and Data safety answers — drafted in
  [`PLAY_LISTING.md`](PLAY_LISTING.md)
- ☐ **Feature graphic 1024×500** — mandatory, does not exist yet

## D. Assets & config

- ✅ Capacitor config, icons/splash pipeline (`npm run mobile:assets`)
- ✅ `assets/icon.png` + `assets/splash.png` are already **1024×1024**
  (verified 2026-08-20). Note they are byte-identical — a splash usually wants
  a different composition from an app icon. Cosmetic, not a blocker.
- ☐ App icon has no transparency (iOS requirement) and no rounded corners
  (the OS rounds them)

## E. Accounts & prerequisites

- ☐ Apple Developer Program membership — `<APPLE_TEAM_ID>`
- ☐ App Store Connect app record created
- ✅ Google Play Developer account — $25 fee paid (2026-08-20)
- ☐ Play Console app record created
- ☐ Apple "Sign in with Apple" Key/Services ID — `<APPLE_SERVICES_ID>`,
  `<APPLE_KEY_ID>`
- ☐ Demo/review account for reviewers (email + password) so they can log in:
  `<REVIEW_LOGIN_EMAIL>` / `<REVIEW_LOGIN_PASSWORD>`

## F. Pre-submit smoke test (on a real device via TestFlight / internal track)

- ☐ Sign up, log in (email + each social + Apple), log out
- ☐ Create a guide (typed) and via Voice-to-Guide (mic permission prompt)
- ☐ Add a photo to a step (camera + photo-library prompts)
- ☐ Share a bundle; open the link; icons render; safe-area + no-zoom-lock OK
- ☐ Delete account → confirm you're signed out and can't log back in
- ☐ No console/native crashes; deep-link OAuth returns to the app

---

### Notes
- The web app and Docker deploy are unchanged by any of this — the stores get
  the same `dist/` wrapped natively.
- Billing (Prompt B) is the one remaining architectural decision before you can
  charge inside the apps; everything else here gets you to a reviewable,
  installable build.
