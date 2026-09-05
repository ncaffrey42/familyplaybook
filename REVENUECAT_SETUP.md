# RevenueCat / Native IAP Setup

How to configure RevenueCat so the native apps can sell the Couple/Family
subscriptions through Apple/Google, with purchases reconciled into the same
`user_billing` the web (Stripe) flow uses. `<PLACEHOLDERS>` are values you fill
in.

**The code is already built and deployed** (webhook live, client integration
merged). This is the dashboard/config work, then flip `VITE_ENABLE_IAP=true`.

---

## 0. Prerequisites
- Apple Developer + Google Play Console accounts (from the App Store checklist)
- A RevenueCat account (free tier is fine to start) → https://app.revenuecat.com

## 1. Create store products (subscriptions)

Create **four** auto-renewing subscription products in BOTH stores. Name the
product identifiers so each contains its plan and interval — the app matches on
that (and the webhook maps product id → plan_key):

| Plan | Interval | Suggested product id | Price |
|---|---|---|---|
| Couple | Monthly | `fp_couple_monthly` | $6.99 |
| Couple | Yearly | `fp_couple_yearly` | $69.90 |
| Family | Monthly | `fp_family_monthly` | $13.99 |
| Family | Yearly | `fp_family_yearly` | $139.90 |

- **App Store Connect:** one Subscription Group ("Family Playbook"), Couple and
  Family as tiers within it (so up/downgrade is handled by the store).
- **Google Play Console:** subscriptions with base plans for monthly/yearly.

## 2. RevenueCat project config

1. Create a project; add your iOS app (bundle `com.familyplaybook.app`) and
   Android app (`com.famplaybook.app` — Play rejected the iOS id as taken).
2. **Entitlements:** create two — identifiers **`couple`** and **`family`**
   (the app and webhook recognize these directly).
3. **Products:** import the four store products; attach each to its entitlement
   (couple products → `couple`, family products → `family`).
4. **Offering:** create the default (current) offering with four packages, one
   per product. The app reads `offerings.current.availablePackages`.
5. **API keys** (Project → API keys → Public app-specific keys):
   - iOS key (`appl_…`) → `VITE_REVENUECAT_IOS_KEY`
   - Android key (`goog_…`) → `VITE_REVENUECAT_ANDROID_KEY`

## 3. Store credentials in RevenueCat
- **Apple:** upload the App Store Connect **In-App Purchase key** (.p8) so
  RevenueCat can validate receipts + receive server notifications.
- **Google:** connect a **Play service account** with the right permissions.

## 4. Webhook → Supabase (already coded and deployed)

RevenueCat → Project → **Integrations → Webhooks → Add**:
- **URL:** `https://ifdncylgiqhhcwovpdyf.supabase.co/functions/v1/revenuecat-webhook`
- **Authorization header:** set to a strong secret `<RC_WEBHOOK_SECRET>`.

Then set the matching edge-function secrets (server-side):
```bash
supabase secrets set \
  REVENUECAT_WEBHOOK_AUTH=<RC_WEBHOOK_SECRET> \
  RC_PRODUCT_COUPLE_MONTH=fp_couple_monthly \
  RC_PRODUCT_COUPLE_YEAR=fp_couple_yearly \
  RC_PRODUCT_FAMILY_MONTH=fp_family_monthly \
  RC_PRODUCT_FAMILY_YEAR=fp_family_yearly
```
> These were set to test values during development — overwrite them with your
> real product ids and a fresh secret before shipping.

## 5. Turn it on in the native build

> **Play Billing Library 8 (required for new apps since 2026-08-31):** the
> project is on Capacitor 7 with `@revenuecat/purchases-capacitor` 11.x, which
> resolves `com.android.billingclient:billing:8.0.0` (verified via
> `gradlew app:dependencies`). Do not downgrade the plugin below 11.0.0 —
> 9.x/10.x still bundle Billing 7.1.1 and Play rejects them.

In the native app's env (baked at build time):
```
VITE_ENABLE_IAP=true
VITE_REVENUECAT_IOS_KEY=appl_<your-key>
VITE_REVENUECAT_ANDROID_KEY=goog_<your-key>
```
Rebuild + `npx cap sync`. Leave `VITE_ENABLE_IAP=false` for the web/Docker
build — Stripe stays the web billing path.

## 6. Test (sandbox)

- **iOS:** create a Sandbox tester in App Store Connect; sign into it on a real
  device (Settings → App Store → Sandbox Account). Purchases are free in
  sandbox.
- **Android:** add your account as a license tester; use the internal-testing
  track.

Verify the loop:
1. Buy Couple → app shows Couple active (via the webhook → `user_billing`).
2. Upgrade to Family → store proration; app reflects Family.
3. Cancel in the store → access remains until period end (`cancel_at_period_end`).
4. Let it expire (or use RevenueCat's sandbox tools) → drops to Free.
5. Reinstall / re-login → **Restore Purchases** re-activates.

> The webhook logic itself is already verified against the project with
> simulated RevenueCat events (purchase → couple, product change → family,
> cancel → cancel_at_period_end, expire → free, plus auth + idempotency).

## 7. How this coexists with Stripe (web)

- `user_billing.billing_provider` tracks who owns a row (`stripe` | `revenuecat`).
- The RevenueCat webhook won't overwrite a row owned by an **active** Stripe
  subscription (prevents a stray store event clobbering a web subscriber).
- A user should subscribe in ONE place. If you want to hard-prevent
  double-subscribing across web+mobile, add a cross-provider check later; for
  friends-and-family testing the provider guard is sufficient.

## Reviewer notes (App Store)
- Restore Purchases is present on the subscription screen (guideline 3.1.1).
- Management/cancel routes to the store's native subscription screen, not an
  external link.
- No external purchase links or "buy on our website" language in the app.
