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
- ✅ **Sign in with Apple — entitlement now wired** (2026-08-20).
  `ios/App/App/App.entitlements` declares `com.apple.developer.applesignin`
  and `CODE_SIGN_ENTITLEMENTS` is set on **both** the Debug and Release
  configurations. Verified: the plist lints, `xcodebuild -showBuildSettings`
  reports the setting, the build log shows `ProcessProductPackaging` consuming
  the file with `com.apple.developer.applesignin` in its output, and the app
  builds with **0 errors**.
  **Still needs a human:** enable the capability for the App ID in the Apple
  Developer portal and configure the Apple provider in Supabase
  (MOBILE_BUILD.md §2–3), or provisioning will fail on a device build.
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
- ✅ **Permission usage strings** — verified present in `ios/App/App/Info.plist`
  2026-08-20, all four (`NSCameraUsageDescription`,
  `NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription`,
  `NSPhotoLibraryAddUsageDescription`) and all written as specific,
  feature-explaining sentences rather than boilerplate — which is what Apple
  actually rejects on. The matching Android permissions are in
  `android/app/src/main/AndroidManifest.xml`.
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
- ✅ Encryption compliance — `ITSAppUsesNonExemptEncryption = false` is already
  set in Info.plist (verified 2026-08-20). No per-submission prompt.

## C. Google Play Console (Android) listing

- ☐ App name, short + full description: `<COPY>`
- ☐ Category: `<CATEGORY>` · Content rating questionnaire (IARC)
- ☐ **Data safety form** — mirror the iOS nutrition labels (data collected,
  purpose, encryption in transit, deletion available = yes → link the in-app
  delete + https://famplaybook.com/privacy-policy/)
- ✅ Feature graphic (1024×500) — generated, no alpha
- ✅ Phone screenshots — 4 captured at 1080×2400 from the API-36 emulator
  build (Home, a guide, Share Center, Account)
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
- ✅ **Feature graphic 1024×500** — generated 2026-08-20, alpha stripped (Play
  rejects transparency). **Chosen and final:**
  [`assets/store/feature-graphic.html`](assets/store/feature-graphic.html) —
  one head broadcasting to a sitter, a grandparent and a guest, which is the
  product's own story. Renders 1024×500 with alpha stripped; regeneration
  steps are in the file. Two alternates were considered and rejected; they
  live in git history at `c54039a`.

## D. Assets & config

- ✅ Capacitor config, icons/splash pipeline (`npm run mobile:assets`)
- ✅ `assets/icon.png` + `assets/splash.png` are already **1024×1024**
  (verified 2026-08-20). Note they are byte-identical — a splash usually wants
  a different composition from an app icon. Cosmetic, not a blocker.
- ✅ App icon has no transparency — the master carries an alpha channel but
  `capacitor-assets` flattens it, and the generated
  `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` is RGB
  with no alpha. Re-verify after any `npm run mobile:assets` run.

## D.1 Native build state — verified 2026-08-20

| Item | iOS | Android |
|---|---|---|
| Bundle / package id | `com.familyplaybook.app` ✅ | `com.familyplaybook.app` ✅ |
| Version | `MARKETING_VERSION 1.0` / build `1` ✅ | `versionName 1.0` / `versionCode 1` ✅ |
| Min OS | deployment target **13.0** ✅ | `minSdk 22` ✅ |
| Target API | n/a | **36** ✅ (verified on device) |
| App icons generated | ✅ single-size `AppIcon-512@2x` | ✅ 24 launcher PNGs + adaptive icon |
| Splash generated | ✅ | ✅ (all densities, incl. night) |
| Deep-link scheme | `familyplaybook` ✅ matches `capacitor.config.ts` | ✅ |
| Permission strings | ✅ all four, specific | ✅ 5 perms, all justified |
| Release signing | ⚠️ `DEVELOPMENT_TEAM` unset | ⚠️ config wired, keystore not created |

**Android permissions requested** — `CAMERA`, `INTERNET`, `READ_MEDIA_IMAGES`,
`READ_MEDIA_VIDEO`, `RECORD_AUDIO`. All map to shipped features (step
photo/video, Voice-to-Guide). Notably **absent**: `QUERY_ALL_PACKAGES`,
`MANAGE_EXTERNAL_STORAGE`, location — the permissions that trigger Play policy
declarations. Nothing to justify in the console.

### Two decisions worth making before submitting

- ⚠️ **`android:allowBackup="true"`** with no `dataExtractionRules` or
  `fullBackupContent` — so Android auto-backup copies app data, **including the
  Supabase auth token**, to the user's Google Drive. That is the platform
  default, not a bug, but for an app holding family routines and a session
  token it deserves a deliberate call: either set `allowBackup="false"`, or add
  backup rules that exclude the auth storage.
- ⚠️ **`DEVELOPMENT_TEAM` is unset** in `project.pbxproj` (zero entries).
  Archiving and uploading to App Store Connect will fail until the Apple team
  id is set in Xcode.

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
