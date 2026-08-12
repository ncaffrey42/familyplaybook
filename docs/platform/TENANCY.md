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
- **Workspace switcher:** renders only when a user has >1
  `workspace_members` row. Self-gating by data — every account has exactly
  1 workspace until a workspace-creating flow ships (earliest: Prompt 8),
  so no feature flag is needed for it. **Two mount points** (refined by
  Prompt 5, `NAV.md` §4.2): the Home header's `<h1>`, which already
  renders the workspace name, for *switching*; and `AccountLayout`'s
  header for *managing*. One component, two placements, no 4th tab.
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

## Ask the Playbook / Alfred (Prompt 7 — built, not deployed, not proven)

Full design in [`ASK_PLAYBOOK.md`](ASK_PLAYBOOK.md). Summary:

- **One function, both verticals.** Alfred is `ask-playbook` reached from a
  host guest link; only the copy differs. A property's guest link is already
  a bundle share, so Prompt 9 inherits the guest VA with no new endpoint.
- **Scope = one share link = one workspace.** `resolve_ask_scope()` re-applies
  `get_shared_content`'s checks (exists / not expired / still shareable) and
  enforces a single-workspace invariant written as
  `COALESCE(workspace_id, user_id)`, so it stays correct across
  `ARCHITECTURE.md` migration #4. Callers never supply a guide list.
  **No `TO anon` RLS policy** — `RBAC.md` §1.2 holds.
- **Two grounding gates:** below-threshold retrieval refuses without an LLM
  call; an answer citing no in-scope guide is downgraded to a refusal.
- **Decisions resolved:** share page now · paid owners' links only ·
  20/hour/link · counts-only (hour-bucketed, never question text).
- ⚠️ **`SIMILARITY_THRESHOLD = 0.35` is uncalibrated and gates release.** The
  eval set is written and has never been run; nothing is deployed.

## Role matrix (designed by Prompt 3 — not yet applied)

Full matrix, RLS pattern, migration plan and adversarial test list in
[`RBAC.md`](RBAC.md). Summary:

- **Permissions are data.** Three new tables — `capabilities` (catalog),
  `workspace_roles` (`workspace_type` → role-set, with the UI label), and
  `workspace_role_capabilities` (the matrix, as rows). Adding a vertical,
  or changing what a role may do, is an `INSERT` — not a migration and
  not a code fork. All three are read-only to `authenticated` with **no
  write policy**, since write access to the matrix means self-granting
  any capability.
- **Stored role values are unchanged** (`owner`/`editor`/`viewer`, plus
  `manager`/`cleaner` for host). The product labels Adult and Helper live
  in `workspace_roles.label`, so `ARCHITECTURE.md` §3.3's
  `family_invitations` sync trigger keeps working untouched.
- **One helper:** `has_capability(workspace_id, capability)`
  (`SECURITY DEFINER`, `STABLE`, `search_path` pinned, fail-closed)
  replaces per-table role checks — additively, with legacy policies kept
  until parity is proven.
- **Capabilities and grants are different axes.** Capabilities are
  workspace-wide and coarse; `share_grants` narrows per-person, per-item.
  A granted-scope role's SELECT policy is
  `has_capability(…, 'content.view.granted') AND viewer_can_see_guide(id)`
  — the existing function reused verbatim. Family **Helper** and host
  **Cleaner** are therefore the same capability row, which is what
  Prompt 10 needs.
- **Guest is not a role in any enforceable sense** — never a
  `workspace_members` row, never an RLS subject, never an anon policy.
  Guest access is exclusively `get_shared_content()`. This is what keeps
  "a guest must never enumerate" structurally true rather than
  policy-dependent.
- **The read-only-over-limit `AS RESTRICTIVE` policies are untouched** —
  plan-tier limits stay an orthogonal axis to identity.
- **Not yet true:** no capability policy exists, nothing calls
  `has_capability()`, no client code reads capabilities.

## Content engine (designed by Prompt 4 — not yet applied)

Full design in [`CONTENT_ENGINE.md`](CONTENT_ENGINE.md). Summary:

- **Content belongs to a workspace**; `guides.user_id` / `packs.user_id`
  stay as **provenance** (who authored the row), not authorization. The
  column is not dropped — tier ranking, usage stats, and GDPR export all
  still read it.
- **Ordering dependency worth knowing about:** `is_guide_editable` /
  `is_pack_editable` rank rows by `user_id` and read *the author's* plan.
  That must move to `workspace_id` **before** `content.create` is granted
  to any non-owner role — otherwise an Adult's guide in a paid owner's
  workspace is governed by the Adult's own free plan, and each member
  effectively gets a separate quota inside a workspace someone else pays
  for. Granting that capability is a one-row `INSERT` (`RBAC.md` §3), so
  the dependency is easy to trip.
- **`category` becomes `content_categories` rows** keyed by
  `workspace_type` (family: How To/Find It/Reference/Emergency; host:
  Arrival/House/Local/Departure), same read-only/no-write-policy posture
  as the RBAC tables. Stored values stay the literal display strings. No
  FK or CHECK on `guides.category` yet — validation report first.
- **"Playbook" = the `workspace_id` equivalence class.** No table; one
  workspace ⟺ one playbook. See `GLOSSARY.md`.
- **Media is recorded debt, not a blocker:** public buckets +
  `getPublicUrl()` mean share-link expiry and un-sharing don't apply to
  media. Phased path to private buckets + signed URLs in
  `CONTENT_ENGINE.md` §5.3; the anonymous branch needs a new edge
  function because signed URLs can't be minted inside Postgres.

## Open questions

- Org-level billing when one org has many workspaces (host case) — see
  Prompt 17.
- Whether/when the two verticals split into two Capacitor app targets —
  see Prompt 12.
- ~~Whether `workspace_members` eventually absorbs `family_invitations`~~
  **Resolved by Prompt 3** (`RBAC.md` §9): the three stay permanently
  distinct. `family_invitations` = invite workflow → projected into
  `workspace_members` = settled membership; guests are neither, and are
  never RLS subjects at all.
- Whether AI/entitlement quotas (`ai_generations`, `user_usage` — per-user
  today, untouched by Prompt 1) pool per workspace or stay per-user — host
  pricing's call, Prompt 17. Same question for **storage quota**, summed
  today from `storage.objects.owner_id` per user (`CONTENT_ENGINE.md` §8).
- What "export my data" / "reset my account" mean once a workspace holds
  content authored by several members — interacts with `delete-account`'s
  cascade (`CONTENT_ENGINE.md` §2.4, `ARCHITECTURE.md` §5.2).
- When the media debt gets scheduled — non-blocking, but the final phase
  gets harder the more public URLs accumulate inside `steps` jsonb
  (`CONTENT_ENGINE.md` §5.3).
- Whether family:editor (Adult) should gain `content.create` — withheld
  in `RBAC.md` §3 to preserve parity with today's INSERT policy; now a
  one-row product decision rather than a migration.
- Whether the viewer/Helper invite path should be surfaced in the UI at
  all — the entire backend exists but is unreachable (`RBAC.md` §7).
  Same shape: whether the `Emergency` category should be surfaced in the
  family picker or removed from `GuideIcon` (`CONTENT_ENGINE.md` §3.1).
- Whether host:manager should hold `member.remove` — withheld as the
  conservative default; revisit in Prompt 10 with real host workflows.
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

## Sharing (Prompt 6 — migration written, not applied)

Full design in [`SHARING.md`](SHARING.md). Summary:

- **Arbitrary expiry** for host stays (`<input type="date">`, closes at the
  end of the chosen local day) alongside the existing presets.
  `presetFromExpiry` gained an **opt-in** `allowCustom` so shipped callers
  keep their exact fuzzy behavior.
- **`recipient_label`** — who a link is for; owner-only, never shown to the
  guest. Named to avoid colliding with the client-derived content `label`.
- **Access log = two counters** (`opened_count`, `last_opened_at`), not an
  events table — privacy by construction, O(1) reads, no retention policy.
  Bumped by `record_share_access()`, a `VOLATILE SECURITY DEFINER` RPC
  granted to `anon`. **No `TO anon` RLS policy is added**, so `RBAC.md`
  §1.2's structural "guest never enumerates" guarantee is intact.
- **Notifications: one seam, no infrastructure.** `record_share_access` is
  the single moment "your link was opened" becomes true; Prompt 11's
  `notifications` table is the intended first channel.
- **Bug fixed by the same migration:** `shared_links` never had an `UPDATE`
  policy, so link expiry has been silently immutable since it shipped —
  "Until I switch it off" produced a link that still died at midnight. Live
  until the migration is applied.

---

*Last updated: 2026-08-11 (Prompt 7 — Ask the Playbook / Alfred). The
tenancy model above is designed and unapplied — see `ARCHITECTURE.md`
(tenancy schema + migration plan), `AUTH_FLOWS.md` (auth/session
integration), `RBAC.md` (permission model), `CONTENT_ENGINE.md` (content
generalization + media debt), `NAV.md` (navigation contract), and
`SHARING.md` (link expiry/labels/access log), and `ASK_PLAYBOOK.md`
(grounded Q&A). Code shipped so far: three flagged, default-off surfaces
(`VITE_ENABLE_SHARE_TAB_MANAGE`, `VITE_ENABLE_SHARE_LABELS`,
`VITE_ENABLE_ASK_PLAYBOOK`) and two **unapplied** migrations
(`20240128_share_labels_access_log`, `20240129_ask_playbook`). Nothing is
deployed. Next update owed by Prompt 8 (host app shell).*
