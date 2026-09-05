# Mobile Build & Submit Guide (iOS + Android)

How to turn the Capacitor-wrapped web app into installable builds and submit
them. The **web/Docker deploy is unaffected** — this all runs on top of the same
`dist/` build. Placeholders `<LIKE_THIS>` are things you fill in when you have
them.

> Prerequisites on your build machine:
> - **Node 18+** (the repo's other tooling tolerates older, but Capacitor CLI
>   needs 18+)
> - **iOS:** a Mac with **Xcode** + **CocoaPods** (`sudo gem install cocoapods`),
>   an **Apple Developer account** ($99/yr) → App Store Connect
> - **Android:** **Android Studio** + **JDK 21** (Capacitor 7; Android Studio's bundled JBR works — set `JAVA_HOME` to `/Applications/Android Studio.app/Contents/jbr/Contents/Home`), a **Google Play Console**
>   account ($25 one-time)

---

## 0. Native projects — ALREADY GENERATED ✅

`ios/` and `android/` are committed with the native config applied (Info.plist
usage strings + OAuth scheme; AndroidManifest permissions + deep-link
intent-filter). You do **not** need to run `npm run mobile:add` again. Just:

```bash
npm install
```

> **One-time on your Mac:** point the toolchain at full Xcode (needs your
> password), or `cap sync`/archiving will fail with
> "xcodebuild requires Xcode":
> ```bash
> sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
> ```
> And if you re-run CocoaPods yourself, prefix it with UTF-8 or it crashes:
> `LANG=en_US.UTF-8 pod install`.

### App icons (do before store submission)
The committed `public/icon-*.png` are text, not real PNGs, so the apps
currently use Capacitor's **default launcher icon**. Drop a real **1024×1024**
PNG at `assets/icon.png` (and `assets/splash.png`), then:
```bash
npm run mobile:assets && npx cap sync
```

### If you ever regenerate from scratch
`npm run mobile:add` recreates the folders; then re-apply the snippets in
`native-config/` (they're kept as the source of truth for the manifest/plist
additions).

---

## 1. Every build: sync the latest web bundle

```bash
npm run mobile:sync       # = npm run build && cap sync  (copies dist/ into both)
```

Then open the native IDE:

```bash
npm run mobile:ios        # opens Xcode
npm run mobile:android    # opens Android Studio
```

---

## 2. Supabase configuration (once) — required for login to work in the app

In the Supabase dashboard → **Authentication → URL Configuration**:
- **Additional Redirect URLs:** add `familyplaybook://auth/callback`
  (the native OAuth deep-link; the web URLs stay too).

**Authentication → Providers → Apple:** enable it and fill in:
- Services ID: `<APPLE_SERVICES_ID>` (e.g. com.familyplaybook.signin)
- Team ID: `<APPLE_TEAM_ID>`
- Key ID + private key (.p8): `<APPLE_KEY_ID>` / `<APPLE_P8_KEY>`
  (create these in the Apple Developer portal → Certificates, Identifiers &
  Profiles → Keys → "Sign in with Apple").

> Google/Facebook/Discord already work on web; for native they use the same
> provider config plus the redirect URL above. For Google on iOS you may also
> add an iOS OAuth client — see Supabase's native OAuth docs if the web client
> alone doesn't complete.

---

## 3. iOS — build & TestFlight

1. In Xcode, select the **App** target → **Signing & Capabilities**:
   - Team: `<APPLE_TEAM_ID>`
   - Bundle Identifier: `com.familyplaybook.app`
   - Add capability **Sign in with Apple**.
2. Set the marketing version + build number.
3. **Product → Archive** → **Distribute App → App Store Connect → Upload**.
4. In **App Store Connect** → your app → **TestFlight**: once processed, add
   yourself as an internal tester and install via the TestFlight app on your
   iPhone.

Create the app record first in App Store Connect (name `Family Playbook`,
bundle id `com.familyplaybook.app`, SKU `<SKU>`, primary language English).

---

## 4. Android — build & internal testing

1. In Android Studio, set `applicationId = com.familyplaybook.app` (already set
   by Capacitor) and a version code/name.
2. Create an **upload keystore** (once):
   ```bash
   keytool -genkey -v -keystore familyplaybook-upload.keystore \
     -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```
   Store `<KEYSTORE_PATH>` + `<KEYSTORE_PASSWORD>` safely (never commit it).
3. **Build → Generate Signed Bundle/APK → Android App Bundle (.aab)**, signed
   with the keystore.
4. In **Google Play Console** → create app → **Testing → Internal testing** →
   upload the `.aab`, add your email as a tester, install via the opt-in link.

---

## 5. Before public submission

Work the checklist in [APP_STORE_CHECKLIST.md](APP_STORE_CHECKLIST.md):
privacy policy URL, store listings, screenshots, nutrition labels / Data
Safety, age rating. And note the **billing decision (Prompt B)** — Stripe is
not allowed for in-app digital subscriptions; that's a separate work item
(RevenueCat/native IAP vs. web-only purchase) before you can sell in the app.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `cap add ios` fails on pod install | Install CocoaPods (`sudo gem install cocoapods`), rerun |
| Android Gradle fails | Use JDK 21 (Capacitor 7 / AGP 8.7); the system Java 8 will not work |
| OAuth opens browser but never returns to app | Redirect URL `familyplaybook://auth/callback` missing in Supabase, or the URL scheme/intent-filter not applied from native-config |
| Mic/camera does nothing on iOS | Info.plist usage strings not applied |
| Icons look soft | Replace assets/icon.png with a 1024×1024 master, rerun `npm run mobile:assets` |
