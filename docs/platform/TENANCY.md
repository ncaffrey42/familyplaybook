# Tenancy Model

This file is the evolving org / workspace / role model for the platform.
It starts as a scaffold — today's baseline is real and filled in below;
everything under **Target model** is `TBD` until the prompt that owns it
runs. Update this file in place as the model changes; unlike
[`DECISIONS.md`](DECISIONS.md) this is a snapshot of current understanding,
not a log — when the model changes, edit the section, and note the change
in `DECISIONS.md` with a pointer back here.

---

## Current model (today, pre-tenancy)

There is no tenancy layer above the individual user. This is the baseline
every future model must remain compatible with — see
[`PLATFORM_PROMPTS.md`](../../PLATFORM_PROMPTS.md)'s non-negotiable
constraint: the B2C family product keeps working unchanged.

- **Owner = `auth.users` row.** All content (`guides`, `packs`) is owned
  directly by one `user_id`. There is no intermediate account/org/workspace
  entity.
- **Sharing is two mechanisms layered on top of single-user ownership, not
  a multi-tenant model:**
  - **Family sharing** (`family_invitations`) — an owner invites people by
    email to a `viewer` or `editor` role over *all* of their content. An
    accepted invitation is what the product calls a **Helper** (viewer) or
    an editor. See [`GLOSSARY.md`](GLOSSARY.md).
  - **Per-item share grants** (`share_grants`) — an owner grants one
    specific guide or bundle to one accepted family invitation, rather than
    everything.
  - **Public share links** (`shared_links`) — an unguessable link to one
    guide or bundle, resolved for anonymous visitors through the
    `get_shared_content` `SECURITY DEFINER` RPC, optionally with an
    expiry. No account required to view.
- **Billing is per-user.** One `user_billing` row per `user_id` (see
  `DECISIONS.md`), reconciling Stripe (web) and RevenueCat (native IAP).
  There is no concept of one billing entity covering multiple people.
- **Roles today are `viewer` / `editor`** (`family_invitations.role`),
  enforced by RLS via `is_accepted_family_member()`. That's the entire role
  vocabulary — no admin/owner/manager distinction beyond "the row's
  `user_id`" vs "an accepted family member."
- **"Host" exists only as a placeholder.** `HostMode.jsx` and
  `VITE_ENABLE_HOST_MODE` exist in the code but are explicitly a
  non-functional mockup (see `src/lib/featureFlags.js`) — no host-specific
  data model exists yet.

## Target model (designed by Prompt 1 — not yet applied)

Full design lives in [`ARCHITECTURE.md`](ARCHITECTURE.md); this section is
the summary kept current as the model evolves. **Status: designed, zero
migrations applied.** Nothing below is live yet.

- `organizations` — the billing + identity boundary. One per personal
  account today (`is_personal = true`), created 1:1 alongside each user's
  backfilled `family` workspace. Does not yet carry a billing relationship
  — `user_billing` stays user-keyed until Prompt 17.
- `workspaces` — the content boundary; one org has many. Carries
  `workspace_type` (`text` + `CHECK`, values `family`/`host` today) so a
  new vertical is a new allowed value + a role-set defined as data (Prompt
  3) + a new app shell (Prompt 8-style), never a schema change.
- `workspace_members` — user × workspace × role (`owner`/`editor`/`viewer`
  for now — a value-preserving copy of `family_invitations.role`'s
  vocabulary, not the final RBAC matrix). Represents **settled
  membership** only; the invite *workflow* stays in `family_invitations`,
  projected into `workspace_members` by a sync trigger.
- Backfill: every existing user gets one personal `organizations` row +
  one `family` `workspaces` row + one `owner` `workspace_members` row.
  `guides`/`packs`/`shared_links`/`share_grants` gain a nullable,
  backfilled `workspace_id` (NOT NULL deferred to a later, verified
  migration — same pattern as the archive-retirement migration). Because
  every backfilled workspace has exactly one member who is exactly that
  content's existing owner, this is a bijection with today's `user_id`
  ownership — existing RLS policies and edge-function `user_id` filters
  stay correct unmodified. See `ARCHITECTURE.md` §3.1, §7 for the full
  byte-identical argument.
- **Not yet true:** no RLS policy has been rewritten to check workspace
  membership, no edge function resolves a `workspace_id`, no UI reads or
  writes a workspace. That's Prompts 2–3.

## Role matrix (TBD — introduced by Prompt 3)

Owned by Prompt 3 (RBAC unification). Will express both verticals' roles
as data: family (owner, adult/editor, helper/viewer) and host (owner,
manager, cleaner, guest). Empty until that prompt runs.

## Open questions

- Org-level billing when one org has many workspaces (host case) — see
  Prompt 17.
- Whether/when the two verticals split into two Capacitor app targets —
  see Prompt 12.
- Whether `workspace_members` eventually absorbs `family_invitations`
  entirely, or the two stay permanently distinct (durable membership vs.
  invite workflow vs. a future anonymous guest-link concept) — Prompt 3's
  call. See `ARCHITECTURE.md` §9.
- Whether AI/entitlement quotas (`ai_generations`, `user_usage` — per-user
  today, untouched by Prompt 1) pool per workspace or stay per-user — host
  pricing's call, Prompt 17.
- `family_members` (a second, orphaned invite-shaped table nothing in the
  app queries — see `ARCHITECTURE.md` §3.3) needs a cleanup decision;
  not migrated into the tenancy model.

---

*Last updated: 2026-08-11 (Prompt 1 — tenancy design). Target model above
is designed, not yet applied — see `ARCHITECTURE.md` for the full design
and migration plan. Next update owed by Prompt 2 (auth flows & workspace
switcher).*
