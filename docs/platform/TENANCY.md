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

## Target model (TBD — introduced by Prompt 1)

Per `PLATFORM_PROMPTS.md` Prompt 1, the target shape is expected to be:

- `organizations` — the billing + identity boundary.
- `workspaces` — the content boundary; one org has many. Carries a
  `workspace_type` discriminator (`family`, `host`, and future verticals)
  so a new vertical is a new type + role-set + app shell, not a schema
  change.
- `workspace_members` — user × workspace × role.
- A migration path that gives every existing user a personal org + one
  `family` workspace, with `guides` / `packs` / `shared_links` /
  `share_grants` gaining a `workspace_id` additively, so the current
  single-user-ownership reality above becomes "workspace of one" without
  changing observable behavior.

This section stays `TBD` — not filled in with invented detail — until
Prompt 1 actually runs and records the real design in `DECISIONS.md`, then
updates this section to match what was decided.

## Role matrix (TBD — introduced by Prompt 3)

Owned by Prompt 3 (RBAC unification). Will express both verticals' roles
as data: family (owner, adult/editor, helper/viewer) and host (owner,
manager, cleaner, guest). Empty until that prompt runs.

## Open questions

- Org-level billing when one org has many workspaces (host case) — see
  Prompt 17.
- Whether/when the two verticals split into two Capacitor app targets —
  see Prompt 12.

---

*Last updated: 2026-08-11 (Prompt 0 — Platform Ledger creation). Next
update owed by Prompt 1.*
