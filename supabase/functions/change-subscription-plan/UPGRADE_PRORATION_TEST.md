# Upgrade proration — manual test checklist

Covers the upgrade/downgrade proration behavior in
[`index.ts`](./index.ts). Run in **Stripe test mode** after deploying the
edge functions to a test project.

Upgrades use `proration_behavior: 'always_invoice'` + `payment_behavior:
'error_if_incomplete'`: the prorated difference is charged immediately, the
renewal date is preserved (no `billing_cycle_anchor`), and a declined card
blocks the upgrade instead of granting the tier on an unpaid invoice. Interval
switches (same tier) defer the adjustment to the next invoice via
`create_prorations`.

```
Prereq: Stripe test mode; STRIPE_PRICE_* point at test prices; edge functions
deployed to a test project; webhook → stripe-webhook configured.

SETUP — create a mid-cycle subscription
  1. App: upgrade a test user Free → Couple (monthly) via Checkout, card 4242…4242.
  2. Stripe → Customer → Subscriptions, note current_period_end (renewal date)
     and active price = Couple monthly.
  3. (Optional) Advance ~15 days with a Test Clock to make proration visible.

ACTION — upgrade mid-cycle
  4. App: upgrade Couple → Family (monthly). Toast = "Plan Changed!", UI = Family.

EXPECTED — inspect in Stripe Dashboard
  5. Subscription price = Family monthly.
  6. RENEWAL DATE UNCHANGED: current_period_end == step 2. (If it moved → FAIL.)
  7. ONE invoice created + PAID immediately, dated today, containing exactly the
     prorated adjustment:
         • NEGATIVE line: "Unused time on Couple"
         • POSITIVE line: "Remaining time on Family"
       Net charged today = the prorated price DIFFERENCE only — NOT a full Family
       period. (A full period charge today → billing_cycle_anchor leaked → FAIL.)
  8. Upcoming invoice does NOT also carry these proration lines (they were
     invoiced now, not deferred).

DECLINED-CARD GATE (error_if_incomplete)
  9. Put a card that declines on charge on the customer
     (test card 4000 0000 0000 0341 — attaches ok, fails on payment), then
     attempt an upgrade.
 10. EXPECTED: the app shows an error toast; the subscription stays on Couple
     (NOT upgraded); no unpaid Family invoice is left "open" granting the tier.

ANNUAL SPOT-CHECK
 11. Repeat 1–8 with annual prices (Couple year → Family year): immediate charge =
     prorated difference only, renewal date (~11 months out) unchanged.

REGRESSION — must NOT change
 12. Downgrade Family → Couple: still scheduled for period end. UNCHANGED.
 13. Downgrade → Free: still cancel_at_period_end = true. UNCHANGED.
 14. Interval switch Couple monthly → Couple annual: applies; proration is on the
     UPCOMING invoice (deferred), not charged today.

PASS CRITERIA
  • Upgrade charges the prorated DIFFERENCE immediately, on one paid invoice.
  • Renewal date preserved on every upgrade.
  • Declined card blocks the upgrade with a clear error; no tier granted.
  • Downgrade / cancel / interval-switch paths behave as before.
```

## Known caveats

- **3-D Secure / SCA:** `error_if_incomplete` errors for a card that *requires*
  authentication rather than prompting the challenge. Fine for typical card
  upgrades; SCA-on-upgrade handling is a separate follow-up.
- **Error status code:** a card decline currently returns HTTP 500 with the
  decline message (the catch block only special-cases `Unauthorized` → 401). The
  toast shows the right message; a cleaner 402 for declines is a small follow-up.
