# Architecture Decision Log

Append-only. Never edit or delete a past entry — if a decision is
superseded, add a new entry that says so and link back to it. Every
architecture prompt in [`PLATFORM_PROMPTS.md`](../../PLATFORM_PROMPTS.md)
reads this file first and appends to it before finishing.

Entry format:

```
## YYYY-MM-DD — <decision, one line>

**Why:** the forces that made this the answer.
**Alternatives rejected:** what else was considered and why it lost.
**Evidence:** files/migrations that show the decision in the code.
```

Dates below are first-commit dates for the file that introduced the
pattern (`git log --diff-filter=A`), not calendar guesses.

---

## 2026-03-05 — Supabase Postgres RLS is the security boundary, not app code

**Why:** Every table holding user content (`guides`, `packs`, `shared_links`,
`family_invitations`, `user_billing`, …) is reachable from multiple entry
points — the web client, the Capacitor native shells, and Deno edge
functions — all using the same Supabase anon/service keys. Row Level
Security enforces "who can see/touch this row" once, in the data layer,
so a new client or a new route can't accidentally skip a check that only
existed in application code. All 26 public tables in `supabase/schema.sql`
have `ENABLE ROW LEVEL SECURITY`; policies key off `auth.uid()`.
**Alternatives rejected:** App-layer authorization checks re-implemented in
every route/edge function — rejected because it means every new code path
has to remember to re-verify ownership, and one miss is a data leak.
A standalone authorization service — rejected as premature complexity;
Postgres already has `auth.uid()` and RLS natively, and the team is small
enough that a second service is pure overhead.
**Evidence:** `supabase/schema.sql` (every `CREATE TABLE` is followed by
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`; 53 `CREATE POLICY` statements).

---

## 2026-07-09 — Share links resolve only through a `SECURITY DEFINER` RPC

**Why:** Public share pages (`PublicSharePage.jsx`, "Helper mode") are
intentionally unauthenticated — a parent shares a link, a grandparent opens
it with no login. RLS can't safely grant an anonymous visitor "see exactly
this one guide/bundle, and only if it isn't expired and is still marked
shareable" without opening the underlying `guides`/`packs` tables to the
`anon` role in general. `get_shared_content(p_share_id)` runs as
`SECURITY DEFINER`, does the expiry + `is_shareable` checks server-side,
and returns only the shaped JSON the public page needs — never a row the
client could query directly.
**Alternatives rejected:** `anon`-role `SELECT` RLS policies scoped by
`shared_links` — rejected because it requires granting the `anon` role
direct table access, and a policy bug then exposes the whole table instead
of one response shape. Client-side expiry/visibility checks against the
anon key — rejected because "a closed link is a feature, not an error" (the
RPC's own comment) has to hold even against a modified client; trusting the
browser to enforce expiry defeats the point of expiring links.
**Evidence:** `supabase/schema.sql` `get_shared_content()` (STABLE
SECURITY DEFINER); `supabase/migrations/20240109_share_link_hardening.sql`;
`src/pages/share/PublicSharePage.jsx`.

---

## 2026-07-09 — Feature flags are build-time `VITE_*` env vars, not a runtime flag service

**Why:** Every optional surface — family sharing, AI generation, Host Mode,
feedback, the freshness/gap-nudge re-engagement trio — needs to ship dark
and flip per build/audience without adding a new service. `VITE_*` is
already the existing convention for config (`VITE_SUPABASE_URL`,
`VITE_STRIPE_PUBLISHABLE_KEY`, …), so flags reuse Vite's `import.meta.env`
rather than inventing a second mechanism. This is also what let Host Mode
ship in the bundle as a non-functional mockup, hidden from App Store
review, until it's real (`VITE_ENABLE_HOST_MODE`, default off).
**Alternatives rejected:** A runtime flags table/service (e.g. a
`feature_flags` table read at app boot) — rejected as unneeded at current
team/scale, and build-time flags are sufficient to gate App Store review
risk on a per-release basis. Per-environment code branches — rejected
because the same built bundle must serve family users with a flag off and
internal testers with it on from one artifact.
**Evidence:** `src/lib/featureFlags.js` (`FAMILY_SHARING_ENABLED`,
`AI_GENERATION_ENABLED`, `HOST_MODE_ENABLED`, `FEEDBACK_ENABLED`,
`SHARE_EXPIRY_ENABLED`, `FRESHNESS_ENABLED`, `GAP_NUDGE_ENABLED`).

---

## 2026-07-09 — Migrations are the history; `supabase/schema.sql` is the generated source of truth for current state

**Why:** Numbered migrations (`supabase/migrations/2024*.sql`) are how
schema change is reviewed and applied in order, but replaying dozens of
migrations to answer "what does the schema look like right now" doesn't
scale for review or for bootstrapping a new environment. `schema.sql` is
generated from the live database via the Supabase Management API
(`scripts/generate-schema-snapshot.py` — tables, constraints, indexes,
functions, triggers, RLS policies) and committed as a reviewable, diffable
snapshot. A new environment applies `schema.sql` once, then marks the
migrations it already encodes as applied, instead of replaying history.
**Alternatives rejected:** Migrations-only, no snapshot — rejected because
"what's the schema today" then requires either a live DB connection or
mentally replaying every migration in order, which doesn't scale as the
migration count grows. An ORM-managed schema (e.g. Prisma/Drizzle schema
file as source of truth) — rejected because the app has no ORM layer; it
talks to Postgres through the Supabase client and hand-written SQL
migrations, and introducing an ORM here would be an unrelated, larger
change.
**Evidence:** `supabase/schema.sql` (header: "Regenerate with
scripts/generate-schema-snapshot"); `scripts/generate-schema-snapshot.py`.

---

## 2026-07-16 — One shared `user_billing` row reconciles both payment providers

**Why:** Stripe (web checkout) and RevenueCat (native IAP on iOS/Android)
are two independent billing systems, each with its own webhooks and its
own idea of subscription state. The product needs one authoritative answer
per user to "what plan are they on, are they read-only-over-limit" —
`EntitlementService` and every RLS-enforced limit function
(`get_user_numeric_limit`, `is_guide_editable`, `is_pack_editable`) read
one row in `public.user_billing`, keyed by `user_id`, with a
`billing_provider` column recording which rail last wrote it
(`'stripe'` default, or RevenueCat via the IAP reconciliation path).
Stripe-sourced fields are additionally protected from arbitrary client
writes (`prevent_stripe_updates()` trigger) so only the webhook path can
change them.
**Alternatives rejected:** Separate `stripe_subscriptions` and
`revenuecat_subscriptions` tables with entitlement logic reading both —
rejected because it doubles the surface every entitlement check has to
consider, and makes the read-only-over-limit downgrade logic ambiguous for
a user with rows in both (which one wins?). Trusting each provider's
client SDK for entitlement state directly on-device — rejected because it
breaks the "server is the only writer of billing truth" posture already
established for Stripe (see `prevent_stripe_updates()`), and native IAP
receipts are exactly the kind of client-reported state that needs
server-side verification via webhook, not client trust.
**Evidence:** `supabase/schema.sql` `public.user_billing` (`billing_provider
text DEFAULT 'stripe' NOT NULL`); `supabase/migrations/20240113_iap_revenuecat.sql`;
`supabase/migrations/20240106_scheduled_downgrade_columns.sql`;
`supabase/migrations/20240107_webhook_idempotency.sql`;
`src/services/EntitlementService.js`.

---
