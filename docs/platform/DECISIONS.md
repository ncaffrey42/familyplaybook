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

## 2026-08-11 — Tenancy layer added additively; `workspace_id` is a `text`+`CHECK` discriminator, not per-vertical tables

**Why:** The platform needs an org/workspace/role layer above the
single-user ownership model without breaking the live B2C app mid-flight.
Three design choices make that possible: (1) `organizations` →
`workspaces` (1:many) → `workspace_members` (user × workspace × role) are
new tables, and `guides`/`packs`/`shared_links`/`share_grants` gain a
nullable, backfilled `workspace_id` rather than being restructured — every
existing user's content ends up in exactly one personal `family`
workspace they exclusively own, which is a bijection with today's
`user_id`-based ownership, so every existing RLS policy and edge-function
`.eq('user_id', …)` filter remains correct unmodified. (2)
`workspace_type` is `text` + `CHECK (... IN ('family', 'host'))`, matching
the schema's existing convention for closed vocabularies (`plan_key`,
`billing_provider`, `role`, `status`, `kind` are all `text`+`CHECK`, never
a native `ENUM`) — so a new vertical (real-estate, schools, elder-care) is
one `CHECK` constraint edit, not a schema restructure. (3)
`family_invitations` keeps being the invitation *workflow* (pending
token, decline history); a new `AFTER UPDATE OF status` trigger projects
accepted/declined/removed rows into `workspace_members`, rather than
migrating the invite flow itself — one write path, two read shapes during
the transition.
**Alternatives rejected:** A native Postgres `ENUM` for `workspace_type` —
rejected because adding a value to a Postgres `ENUM` inside a transaction
has historically required care (and pre-12 required avoiding the same
transaction as its use), while a `CHECK` constraint edit is a trivial,
uniformly-safe additive migration — and it breaks consistency with every
other closed-vocabulary column in this schema. A `host_workspaces` /
`family_workspaces` table-per-vertical design — rejected because it turns
"add a vertical" into a schema migration and a full parallel set of
RLS/query code per vertical, defeating the stated goal. Rewriting
`family_invitations` directly into `workspace_members` (dropping the
former) — rejected because `family_invitations` carries invitation-workflow
state (pending token, invited-but-not-yet-a-user email, decline/removed
history) that `workspace_members` (settled membership only) has no shape
for, and the existing `send-family-invite`/`accept-family-invite` edge
functions and UI would need to change in this same migration — a project
this design deliberately keeps schema-only and code-free (see
`ARCHITECTURE.md` §6). Rewriting existing RLS policies and edge-function
`user_id` filters to `workspace_id` in this same migration — rejected as
unnecessary risk for zero behavior change: the bijection in
`ARCHITECTURE.md` §3.1 means the old policies stay correct, so the rewrite
is deferred to Prompt 3 (RBAC unification), which needs to do it anyway
to introduce real capability-based roles.
**Evidence:** `docs/platform/ARCHITECTURE.md` (full design + migration
plan); no schema or application changes shipped with this entry — design
only, per the prompt that produced it.

---
