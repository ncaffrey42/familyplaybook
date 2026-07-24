# Fastlane — one-command releases

Fastlane automates building + uploading the app to **TestFlight** (iOS) and
**Play internal testing** (Android). It's a free open-source tool — no account,
no cost. It drives your existing Apple/Google accounts using API keys.

Already scaffolded and validated in this repo:
- `fastlane/Appfile` — app id + account references (from env vars)
- `fastlane/Fastfile` — the `ios beta` and `android beta` lanes
- `.env.fastlane.example` — the secrets template (copy to `.env.fastlane`)

## What each lane does
```
fastlane ios beta       # build web → cap sync ios → compile → upload to TestFlight
fastlane android beta   # build web → cap sync android → bundle AAB → Play internal
```
The build number is derived from the git commit count, so it auto-increments —
no manual bumping.

---

## iOS setup (do once, after your Apple Developer account is approved)

1. **Install Fastlane** (already done on this machine):
   ```bash
   brew install fastlane
   ```

2. **Team ID** — Apple Developer → **Membership** → copy the *Team ID*.

3. **App Store Connect API key** (this is what lets Fastlane upload without 2FA
   prompts):
   - App Store Connect → **Users and Access → Integrations → App Store Connect
     API** → **＋** → give it **App Manager** access.
   - Download the `AuthKey_XXXXXXXXXX.p8` (⚠️ you can only download it once) and
     put it at `fastlane/AuthKey_XXXXXXXXXX.p8` (gitignored).
   - Note the **Key ID** and the **Issuer ID** (shown at the top of that page).

4. **Create the app record** in App Store Connect (name *Family Playbook*,
   bundle id `com.familyplaybook.app`).

5. **Signing** — open `ios/App/App.xcworkspace` in Xcode once, set your Team on
   the App target with "Automatically manage signing", and add the **Sign in
   with Apple** capability. Fastlane's `-allowProvisioningUpdates` then lets it
   create/refresh profiles headlessly.

6. **Fill in secrets:**
   ```bash
   cp .env.fastlane.example .env.fastlane
   # edit .env.fastlane with your Team ID, Key ID, Issuer ID, .p8 path
   ```

7. **Ship a build:**
   ```bash
   set -a; source .env.fastlane; set +a
   fastlane ios beta
   ```
   The build lands in TestFlight; add yourself as an internal tester to install
   it on your iPhone.

---

## Android setup (later — needs Google Play Console + JDK 17)

1. Install JDK 17: `brew install --cask temurin@17`.
2. Create the app in **Play Console**, complete the one-time Play App Signing
   enrollment, and create an **upload keystore** (see MOBILE_BUILD.md).
3. **Service account** for uploads: Play Console → **Setup → API access** →
   create/link a Google Cloud service account with *Release manager* access →
   download its JSON key → set `SUPPLY_JSON_KEY` to its path (gitignored).
4. Configure release signing in `android/app/build.gradle` (keystore path +
   passwords via env, not committed).
5. Ship: `fastlane android beta`.

---

## Notes
- Secrets (`.env.fastlane`, `*.p8`, service-account `*.json`, keystores) are
  gitignored — never commit them.
- When you outgrow automatic signing (e.g. building on CI or a second Mac),
  switch iOS certs to **`fastlane match`** (stores signing assets in a private
  git repo) — a small change to the Fastfile.
- These lanes are also the building blocks for a CI release workflow later
  (GitHub Actions can call `fastlane ios beta` with the secrets stored as
  encrypted repo secrets).
