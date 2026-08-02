# App Store & Google Play Submission Checklist

Track readiness for both stores. Fill in `<PLACEHOLDERS>` as info becomes
available. Grouped by "will block review" → "listing content" → "accounts".

Legend: ☐ todo · ⚠️ needs a decision/info · ✅ done in this branch

---

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
- ☐ **Privacy policy URL** — required by both stores. Publish one at
  https://famplaybook.com/privacy-policy/ (must cover: account data, guides/media stored in
  Supabase, Stripe for payments, OpenAI for AI features, analytics).
- ☐ **Support URL / contact** — https://famplaybook.com/support/ (support email as needed).
- ✅ **Permission usage strings** applied from `native-config/` — mic, camera,
  photo library and photo-add strings are in `ios/App/App/Info.plist`; the
  matching Android permissions are in `android/app/src/main/AndroidManifest.xml`.
- ⚠️ **Plan promise must match the marketing site** — the app is the source of
  truth (Free 15 guides / Couple $6.99 / Family $13.99, per `src/lib/plans.js`
  and `plan_entitlements`). The WordPress copy still promises *5 active guides*
  and a single *Premium* tier and needs updating to match before submission —
  reviewers compare store listing, site and IAP.

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
- ☐ Target API level current enough for the current Play requirement
- ☐ App signing: enroll in Play App Signing; keep `<KEYSTORE_PATH>` safe

## D. Assets & config

- ✅ Capacitor config, icons/splash pipeline (`npm run mobile:assets`)
- ✅ `assets/icon.png` + `assets/splash.png` are **1024×1024** masters
- ✅ App icon has no transparency — the master carries an alpha channel but
  `capacitor-assets` flattens it, and the generated
  `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` is RGB
  with no alpha. Re-verify after any `npm run mobile:assets` run.

## E. Accounts & prerequisites

- ☐ Apple Developer Program membership — `<APPLE_TEAM_ID>`
- ☐ App Store Connect app record created
- ☐ Google Play Console account + app created
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
