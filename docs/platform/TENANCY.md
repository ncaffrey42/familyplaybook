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
  membership, no edge function resolves a `workspace_id`, no query that
  loads content is workspace-scoped. That's Prompt 3/4.

## Auth/session integration (designed by Prompt 2 — not yet applied)

Full design in [`AUTH_FLOWS.md`](AUTH_FLOWS.md). Summary:

- **Post-login workspace resolution:** last-active (`profiles
  .last_active_workspace_id`, a new nullable column) if the user is still
  a member of it, else their personal workspace. Computes/persists which
  workspace is active; does **not** yet change what content loads (still
  `DataContext`'s `ownerIds` pattern until Prompt 3/4).
- **Workspace switcher:** lives in `AccountLayout.jsx`'s header; renders
  only when a user has >1 `workspace_members` row. Self-gating by data —
  every account has exactly 1 workspace until a workspace-creating flow
  ships (earliest: Prompt 8), so no feature flag is needed for it.
- **Registration starting vertical:** `/login?vertical=host` entry point.
  Password/magic-link signup threads intent through `raw_user_meta_data`
  (existing precedent: OTP already passes custom `options.data`). OAuth
  has no equivalent hook, so intent is captured client-side and applied
  post-callback only for a confirmed fresh signup — never on a returning
  user's OAuth login, to prevent silently reassigning an existing
  account's workspace type.
- **Org-level invites** (spec'd, not built): a new, separate
  `organization_invitations` concept for organizations with >1 workspace
  (host, once Prompt 9 ships) — "invite once, access every property."
  `family_invitations` stays the workspace-level mechanism and remains
  the *only* relevant one for single-workspace orgs (i.e., every family
  account, and every host account until they have a second property).

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
- Whether org-level membership auto-extends to a workspace added to the
  org *after* the invite was accepted (a sync-trigger question, same
  shape as `family_invitations`'s) — deferred with org-level invites
  themselves. See `AUTH_FLOWS.md` §4.
- `/check-email` (`CheckEmailScreen.jsx`) is a dead, unreachable route —
  flagged in `AUTH_FLOWS.md` §1.8, not fixed.

---

*Last updated: 2026-08-11 (Prompt 2 — auth flows & workspace resolution
design). Target model above is designed, not yet applied — see
`ARCHITECTURE.md` for the tenancy design/migration plan and
`AUTH_FLOWS.md` for the auth/session integration design. Next update owed
by Prompt 3 (RBAC unification).*
