# RBAC: One Permission Model, Two Verticals

**Status:** Design only. No migrations applied, no application code
changed. Deliverable of Prompt 3 ([`PLATFORM_PROMPTS.md`](../../PLATFORM_PROMPTS.md)).

**Depends on** [`ARCHITECTURE.md`](ARCHITECTURE.md) — specifically the
`workspace_id` columns (its migration #4) and `workspace_members` (its
migration #1). Neither is applied yet, so nothing here can ship before
that does. Read [`DECISIONS.md`](DECISIONS.md), [`TENANCY.md`](TENANCY.md),
and [`GLOSSARY.md`](GLOSSARY.md) first.

---

## 1. The two facts this design is built on

Before the matrix, two properties of the current schema — both verified,
both load-bearing for everything below.

### 1.1 Postgres RLS: permissive policies OR, restrictive policies AND

For a given command, Postgres evaluates:

```
( permissive₁ OR permissive₂ OR … )  AND  restrictive₁ AND restrictive₂ AND …
```

with two consequences that drive the entire migration plan:

1. **A restrictive policy can never grant access.** With zero permissive
   policies matching, access is denied no matter what the restrictive
   ones say. The three existing `AS RESTRICTIVE` policies
   (`guides_block_readonly_update`, `packs_block_readonly_update`,
   `pack_guides_block_readonly_insert` — the read-only-over-limit
   enforcement) are pure *subtraction*.
2. **Adding a permissive policy can only widen access.** This is the
   sharp edge in "additively, old policies stay until parity is proven":
   keeping the old policies guarantees **nothing breaks** (no access is
   lost), but it provides **no protection against over-granting**. The
   moment a new permissive capability policy is created, effective access
   becomes `old ∪ new`. If the new predicate is broader than the old one
   anywhere, that is a live privilege escalation — and the old policies
   sitting alongside it will not catch it.

   Hence §5's ordering: parity is proven **in shadow, before any new
   policy exists** (M3), not after. This is the single most important
   sequencing decision in this document.

### 1.2 Anonymous users have no RLS surface at all — and must never gain one

`grep "TO anon" supabase/schema.sql` returns **nothing**. There is not one
anon-role policy in the schema. Every anonymous share-link view goes
through `get_shared_content()`, a `SECURITY DEFINER` RPC that takes a
share id and returns shaped JSON — never a queryable row
(`DECISIONS.md`, 2026-07-09).

So "guest must never enumerate" is **already structurally true**, and the
job of this design is to not break it. That produces the hardest rule
here, stated once and enforced throughout:

> **The `guest` role is never a `workspace_members` row, never a value in
> any role column, and never the subject of an RLS policy.** It appears in
> the matrix (§3) purely to document what the RPC surface exposes. No
> policy in this design is ever granted `TO anon`.

`has_capability()` reinforces this for free: it resolves `auth.uid()`,
which is `NULL` for anonymous callers, so it returns `false` for every
capability, for every workspace, always.

> Several existing policies omit a `TO` clause and therefore apply to
> `PUBLIC` (which includes `anon`) — e.g. `"Users can delete their own
> guides."`. They are safe in practice because their predicate is
> `auth.uid() = user_id`, and `NULL = user_id` is `NULL`, never `true`.
> Not a vulnerability; noted because every *new* policy in this design
> specifies `TO authenticated` explicitly rather than relying on that.

---

## 2. What "roles as data, not code forks" means concretely

Three new tables. A new vertical (real-estate, schools, elder-care) is
then **`INSERT` statements**, not a schema migration and not a code
branch — which is the goal `ARCHITECTURE.md` §1 set for `workspace_type`,
now extended to roles and permissions.

```sql
-- Catalog of every capability the platform understands.
-- Exists so a typo in seed data fails loudly at INSERT time rather than
-- silently denying at policy-evaluation time.
capabilities (
  key          text primary key,           -- e.g. 'content.edit'
  resource     text not null,              -- 'content' | 'share' | 'member' | 'workspace' | 'billing'
  description  text not null
)

-- The role-set for each vertical. Adding a vertical starts here.
workspace_roles (
  workspace_type  text not null,           -- 'family' | 'host' | future
  role            text not null,           -- 'owner' | 'editor' | 'viewer' | 'manager' | 'cleaner'
  label           text not null,           -- UI string: 'Owner' | 'Adult' | 'Helper' | …
  is_default      boolean not null default false,
  primary key (workspace_type, role)
)

-- THE MATRIX (§3), as rows.
workspace_role_capabilities (
  workspace_type  text not null,
  role            text not null,
  capability      text not null references capabilities(key),
  primary key (workspace_type, role, capability),
  foreign key (workspace_type, role) references workspace_roles(workspace_type, role) on delete cascade
)
```

**These three tables are security-critical infrastructure.** Anyone who
can write to `workspace_role_capabilities` can grant themselves any
capability in any workspace. Therefore:

- RLS enabled on all three.
- `SELECT` to `authenticated` (the client needs to render "what can I
  do here?"; the matrix is public knowledge — it's printed in §3 of this
  document).
- **No `INSERT`/`UPDATE`/`DELETE` policy exists for any role.** Seeding
  and future edits happen via migrations or `service_role`, which bypasses
  RLS. A table with no write policy is unwritable by `authenticated`,
  which is exactly the intent.

### 2.1 Stored role values vs. product labels

`GLOSSARY.md` calls the family editor an **Adult** and the family viewer a
**Helper**. The stored values stay `editor` and `viewer` — unchanged from
`family_invitations.role` — because `ARCHITECTURE.md` §3.3's sync trigger
copies that column straight into `workspace_members.role`. Renaming the
stored value would mean rewriting that trigger, the invite edge functions,
and `DataContext.jsx:162`'s `access_role` handling for zero user-visible
benefit. `workspace_roles.label` carries the product name instead.

| Vertical | Stored `role` | Product label (`workspace_roles.label`) |
|---|---|---|
| family | `owner` | Owner |
| family | `editor` | Adult |
| family | `viewer` | Helper |
| host | `owner` | Owner |
| host | `manager` | Manager |
| host | `cleaner` | Cleaner |
| host | *(none — see §1.2)* | Guest |

### 2.2 Role validity per vertical

`workspace_members.role` must be legal for its workspace's type — a
`family` workspace must never hold a `cleaner`. `workspace_members` does
not carry `workspace_type` (it's on `workspaces`), so a composite FK
would require denormalizing it. Instead: a `BEFORE INSERT OR UPDATE`
trigger on `workspace_members` checks `(workspace's type, NEW.role)`
exists in `workspace_roles`, raising otherwise. Adversarial test T26.

---

## 3. The capability matrix

Twelve capabilities across five resource types. `✅` = granted.

| Capability | Resource | family:owner | family:editor (**Adult**) | family:viewer (**Helper**) | host:owner | host:manager | host:cleaner | **guest** |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `content.view.all` | content | ✅ | ✅ | — | ✅ | ✅ | — | — |
| `content.view.granted` | content | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `content.create` | content | ✅ | ⛔️ | — | ✅ | ✅ | — | — |
| `content.edit` | content | ✅ | ✅ | — | ✅ | ✅ | — | — |
| `content.delete` | content | ✅ | — | — | ✅ | — | — | — |
| `share.link.create` | share | ✅ | ✅ | — | ✅ | ✅ | — | — |
| `share.link.revoke` | share | ✅ | ✅† | — | ✅ | ✅† | — | — |
| `share.grant.manage` | share | ✅ | — | — | ✅ | ✅ | — | — |
| `member.invite` | member | ✅ | — | — | ✅ | ✅ | — | — |
| `member.remove` | member | ✅ | — | — | ✅ | — | — | — |
| `workspace.settings` | workspace | ✅ | — | — | ✅ | — | — | — |
| `billing.manage` | billing | ✅ | — | — | ✅ | — | — | — |

**⛔️ `content.create` for family:editor is deliberately withheld to
preserve parity, and it is the one cell most likely to be questioned in
review.** Today an editor *cannot* create content in the owner's
collection: `"Users can insert their own guides."` is
`WITH CHECK (auth.uid() = user_id)`, so an editor's insert produces a row
owned by *themselves* — landing in their own workspace after
`ARCHITECTURE.md`'s backfill, not the shared one. Granting
`content.create` here would be a real behavior change on day one of the
migration, violating the byte-identical constraint. It is very likely the
right product decision *later* — and because the matrix is data, granting
it later is a one-row `INSERT`, not a migration and not a code change.
That is the entire point of this design.

**† `share.link.revoke` is capability-gated *and* row-scoped.** Today
`shared_links_owner_delete` restricts deletion to `auth.uid() = user_id`
— you may revoke only links you personally created. The capability alone
can't express "only my own rows", so that policy keeps an ownership
sub-check alongside the capability (§4.3). Owners get the capability
without the row scope; editors/managers get it scoped to their own links.

**Guest column is all `—` by construction, not by policy** (§1.2). A
guest's access is defined entirely by `get_shared_content()`: one share
link → one guide (or one bundle plus its shareable guides), subject to
expiry and `is_shareable`. Nothing else, ever.

### 3.1 The payoff: Helper and Cleaner are the same shape

`family:viewer` (Helper) and `host:cleaner` have **identical capability
rows** — `content.view.granted` only. They differ solely in
`workspace_roles.label` and which vertical they belong to. The family
Helper's per-item `share_grants` model is therefore *literally* the host
Cleaner's mechanism, with no new code.

This is not a coincidence engineered for elegance — it's what Prompt 10
independently asks for: *"cleaners get task-relevant guides only (grants
model reused)."* A design where the two verticals forked would have had
to build that twice.

---

## 4. How `share_grants` and the Helper read-only view slot in unchanged

The prompt's requirement is that the existing per-person grants model and
the read-only Helper view survive untouched. They do, because
**capabilities and grants operate on different axes**:

- A **capability** answers *"what kind of action may this member take
  anywhere in this workspace?"* — coarse, role-derived, workspace-wide.
- A **share grant** answers *"which specific items may this person see?"*
  — fine, per-row, per-person.

Grants **narrow**; they never widen. So the two compose without either
one being rewritten:

```
effective view = capability says you may view
                 AND (if your capability is 'granted'-scoped)
                     the existing viewer_can_see_*() predicate agrees
```

### 4.1 `viewer_can_see_guide()` / `viewer_can_see_bundle()` are reused verbatim

Both functions are called **unmodified** by the new policies. They already
resolve `share_grants → family_invitations → auth.uid()`, and
`ARCHITECTURE.md` §3.3's trigger keeps `workspace_members` in sync with
the same `family_invitations` rows those functions read. No rewrite, no
re-implementation, no second source of truth for "what has this person
been granted."

### 4.2 The Helper read-only *view* (`PublicSharePage.jsx`) is untouched

That surface renders from `get_shared_content()` for anonymous visitors —
no RLS involvement, no capability check, nothing in this design reaches
it. Per `GLOSSARY.md`'s two senses of "Helper": the **role** is covered by
the matrix above; the **surface** (Helper mode) is out of scope entirely.

### 4.3 Representative policies

`guides` — SELECT (the composition, in one predicate):

```sql
CREATE POLICY "guides_cap_select" ON public.guides
  FOR SELECT TO authenticated
  USING (
    has_capability(workspace_id, 'content.view.all')
    OR (
      has_capability(workspace_id, 'content.view.granted')
      AND viewer_can_see_guide(id)          -- reused verbatim
    )
  );
```

`guides` — UPDATE (the RESTRICTIVE read-only policy still ANDs on top,
untouched — §6):

```sql
CREATE POLICY "guides_cap_update" ON public.guides
  FOR UPDATE TO authenticated
  USING      (has_capability(workspace_id, 'content.edit'))
  WITH CHECK (has_capability(workspace_id, 'content.edit'));
```

`guides` — INSERT (`WITH CHECK` reads the **new row's** `workspace_id`,
which is what stops cross-workspace insertion — test T18):

```sql
CREATE POLICY "guides_cap_insert" ON public.guides
  FOR INSERT TO authenticated
  WITH CHECK (has_capability(workspace_id, 'content.create'));
```

`pack_guides` — has no `workspace_id` of its own by
`ARCHITECTURE.md` §3.4's deliberate choice, so it joins through `packs`:

```sql
CREATE POLICY "pack_guides_cap_insert" ON public.pack_guides
  FOR INSERT TO authenticated
  WITH CHECK (
    has_capability(
      (SELECT p.workspace_id FROM public.packs p WHERE p.id = pack_id),
      'content.edit'
    )
  );
```

`shared_links` — DELETE, showing the `†` row-scoping from §3:

```sql
CREATE POLICY "shared_links_cap_delete" ON public.shared_links
  FOR DELETE TO authenticated
  USING (
    has_capability(workspace_id, 'share.link.revoke')
    AND (auth.uid() = user_id OR has_capability(workspace_id, 'workspace.settings'))
  );
```

### 4.4 The helper function

```sql
CREATE OR REPLACE FUNCTION public.has_capability(
  p_workspace_id uuid,
  p_capability   text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM workspace_members wm
      JOIN workspaces w
        ON w.id = wm.workspace_id
      JOIN workspace_role_capabilities rc
        ON rc.workspace_type = w.workspace_type
       AND rc.role           = wm.role
     WHERE wm.workspace_id = p_workspace_id
       AND wm.user_id      = auth.uid()
       AND rc.capability   = p_capability
  );
$$;
```

Matching the conventions every existing helper in this schema already
uses (`is_accepted_family_member`, `viewer_can_see_guide`):

- `STABLE` — same-statement caching; these run once per row scanned.
- `SECURITY DEFINER` + **`SET search_path TO 'public'`** — the
  `search_path` pin is mandatory on a `SECURITY DEFINER` function, or a
  caller can shadow `workspace_members` with a temp table and forge
  capabilities.
- Returns `false`, never `NULL`, for anonymous callers and for
  `p_workspace_id IS NULL` — fail-closed. A `NULL` `workspace_id` on a
  not-yet-backfilled row therefore denies rather than errors.
- A capability string that doesn't exist in the catalog returns `false`
  — fail-closed on typos too, which is why the `capabilities` FK in §2
  matters for catching them at seed time instead.

**Indexes required** (has_capability runs per row scanned, so these are
correctness-of-performance, not nice-to-have):
`workspace_members (user_id, workspace_id)` and the `workspace_role_capabilities`
PK already covers `(workspace_type, role, capability)`.

---

## 5. Migration plan

Continuing `ARCHITECTURE.md` §8's numbering (which ends at `20240121`).
Every phase is independently reviewable and reversible.

| # | File | Contents | Behavior change |
|---|---|---|---|
| **M1** | `20240122_capability_tables.sql` | `capabilities`, `workspace_roles`, `workspace_role_capabilities` + RLS (read-only to `authenticated`, no write policies) + seed the §3 matrix + `has_capability()` | **None.** New tables, nothing reads them. |
| **M2** | `20240123_role_vocabulary.sql` | Widen `workspace_members.role` CHECK to `owner\|editor\|viewer\|manager\|cleaner`; add the §2.2 validity trigger | **None.** No `manager`/`cleaner` row can exist — nothing creates host workspaces yet (Prompt 8). |
| **M3** | *(no migration — a verification run)* | Execute the §5.1 differential harness. **Gate: must return zero rows.** | **None.** Read-only shadow comparison. |
| **M4** | `20240124_capability_policies.sql` | Add the new permissive capability policies **alongside** the old ones | **None — but only because M3 proved it.** Access is now `old ∪ new`, which M3 showed equals `old`. |
| **M5** | `20240125_drop_legacy_policies.sql` | Drop the superseded legacy policies; re-run M3's harness | **None.** Access becomes `new` alone, already proven equal. |
| — | *(later prompts)* | Edge functions adopt `requireWorkspace()`/`has_capability()` (`ARCHITECTURE.md` §5.2); grant family:editor `content.create` if product decides to | Deliberate, reviewed changes |

**Why M3 sits before M4 and not after** — §1.1: once M4 exists, access is
the *union*, so a too-broad new policy is already live. Proving parity
after M4 would be proving it too late. M3 is the gate.

**M5 is the only phase whose rollback isn't a plain `DROP`** — it removes
the legacy policies, so its down-migration must re-`CREATE` them. Their
exact definitions are preserved verbatim in the migration file's header
comment (the same practice `20240104_retire_archive.sql` used when
deferring column drops).

### 5.1 The parity harness (M3)

The predicates depend on `auth.uid()`, so the harness can't just run as
one user. It uses a `SECURITY DEFINER` verification function taking an
explicit `p_user_id` and inlining both predicates with that parameter
substituted for `auth.uid()`:

```sql
-- Sketch. Per table × command. Returns rows ONLY where old and new disagree.
CREATE FUNCTION _parity_guides_select(p_user_id uuid)
RETURNS TABLE (guide_id uuid, old_allows boolean, new_allows boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT g.id,
         -- OLD: guides_owner_select OR guides_member_select
         (g.user_id = p_user_id
          OR _is_accepted_family_member_as(p_user_id, g.user_id, 'editor')
          OR _viewer_can_see_guide_as(p_user_id, g.id))                        AS old_allows,
         -- NEW: guides_cap_select
         (_has_capability_as(p_user_id, g.workspace_id, 'content.view.all')
          OR (_has_capability_as(p_user_id, g.workspace_id, 'content.view.granted')
              AND _viewer_can_see_guide_as(p_user_id, g.id)))                  AS new_allows
    FROM guides g
   WHERE (…old…) IS DISTINCT FROM (…new…);
$$;
```

`_*_as(p_user_id, …)` are parameterized twins of the live helpers —
identical bodies with `auth.uid()` replaced by the parameter. They exist
only for verification and are dropped after M5.

Run across **every** (user × row) pair for each table/command pair below.
The gate is zero rows returned, for all of them:

`guides` SELECT/INSERT/UPDATE/DELETE · `packs` SELECT/INSERT/UPDATE/DELETE ·
`pack_guides` SELECT/INSERT/DELETE · `shared_links` SELECT/INSERT/DELETE ·
`share_grants` SELECT/ALL

**A caveat that changes what M3 can prove — see §7:** production
currently contains **zero `viewer` rows**, so no amount of production
data exercises the Helper/grants path. M3 must run against **synthetic
fixtures** covering viewer-with-grants, viewer-without-grants, and
editor, or it will return zero rows for the most security-sensitive
branch simply because that branch has no data.

---

## 6. What this design deliberately does not touch

- **The three `AS RESTRICTIVE` read-only policies stay exactly as they
  are.** They encode *plan-tier limits* (`is_guide_editable`,
  `is_pack_editable` — rank by `updated_at` against
  `active_guides_max`/`bundles_max`), which is an orthogonal axis to
  *who you are*. Folding tier enforcement into the capability model would
  make a billing-limit bug present as a permissions bug and vice versa,
  and would put `user_billing` in the path of every permission check.
  Keeping them separate means a user with `content.edit` on an over-limit
  guide is still correctly blocked — by the restrictive policy, ANDed on
  top (test T23).
- **`get_shared_content()` and the anonymous share path** — §1.2, §4.2.
- **`family_invitations` and the invite edge functions** — they keep
  writing the same rows; `ARCHITECTURE.md` §3.3's trigger keeps
  `workspace_members` in sync.
- **`user_billing`** — `billing.manage` is declarative in this design.
  Billing is still enforced per-`user_id` in edge functions; Prompt 17
  wires org-level billing to this capability.
- **Client code.** No component reads `has_capability()` in this design.
  `DataContext.jsx`'s `is_read_only: access_role !== 'editor'`
  (`DataContext.jsx:178`) keeps working off the same
  `family_invitations` role it uses today.

---

## 7. Diligence finding: the Helper/viewer path is fully built but unreachable

Worth stating plainly, because it changes what "slot in unchanged" means
and how M3 must be run.

The `viewer` role, `share_grants`, `viewer_can_see_guide()`,
`viewer_can_see_bundle()`, the `share_grants_member_select` policy, and
`ShareCenterScreen.jsx`'s per-item grant-picker UI are all **implemented,
RLS-enforced, and complete**. But **no code path ever creates a viewer
invitation**:

- `ManageFamilyScreen.jsx:114` and `:160` — the *only* two invite call
  sites — both hardcode `role: 'editor'`.
- There is no role selector anywhere in that screen.
- `send-family-invite` validates `role ∈ {viewer, editor}`
  (`index.ts:16-18`) and would accept `viewer`, but nothing sends it.
- `family_invitations.role` defaults to `'editor'`.
- Consequently `ShareCenterScreen`'s grants UI — gated on
  `selectedMember.role === 'editor'` being false (`:215`) — never renders,
  and no `share_grants` row is ever created.

So the grants model is **dormant, not live**. Two consequences:

1. **Migration risk is lower than it looks** — there is no production
   viewer data to break.
2. **Parity testing cannot rely on production data** — M3 would return a
   clean zero-diff on the viewer branch simply because that branch is
   empty. Synthetic fixtures are mandatory (§5.1), or the most
   security-sensitive path in this design ships unverified.

Same category as `family_members` (`ARCHITECTURE.md` §3.3) and
`/check-email` (`AUTH_FLOWS.md` §1.8): recorded, not fixed here. Whether
to surface a viewer/Helper invite option in the UI is a **product**
decision — and a cheap one, since the entire backend for it already
exists and is about to become capability-backed.

---

## 8. Adversarial test list

Every test asserts a **denial** unless stated. Grouped by attack.

### A. A viewer must never write

| # | Attack | Expected |
|---|---|---|
| T1 | Helper `UPDATE` a guide they *have* been granted | Denied — `content.edit` not held |
| T2 | Helper `UPDATE` a guide they have *not* been granted | Denied |
| T3 | Helper `INSERT` a guide into the workspace | Denied — `content.create` not held |
| T4 | Helper `DELETE` a granted guide | Denied |
| T5 | Helper `INSERT`/`DELETE` on `pack_guides` for a granted bundle | Denied |
| T6 | **Helper `INSERT` into `share_grants` to grant themselves more items** | Denied — `share.grant.manage` not held. Self-escalation via the grants table. |
| T7 | Helper `INSERT` into `shared_links` to mint a public link to content they can see | Denied — `share.link.create` not held. Would otherwise let a viewer republish private content anonymously. |
| T8 | Helper `UPDATE` their own `workspace_members` row to `role = 'owner'` | Denied — no write policy on `workspace_members` for members |
| T9 | **Helper `INSERT`/`UPDATE` `workspace_role_capabilities` to add capabilities to `viewer`** | Denied — table has *no* write policy for `authenticated` (§2). The keystone test: passing T1–T8 is meaningless if this fails. |
| T10 | Helper `UPDATE` `workspace_roles` / `capabilities` | Denied — same |

### B. A guest must never enumerate

| # | Attack | Expected |
|---|---|---|
| T11 | `anon` `SELECT * FROM guides` (and `packs`, `pack_guides`) | Zero rows — no anon policy exists |
| T12 | `anon` `SELECT * FROM shared_links` — harvest share ids | Zero rows. Directly defeats link-guessing at scale. |
| T13 | `anon` `SELECT` on `workspace_members`, `workspaces`, `organizations`, `share_grants` | Zero rows |
| T14 | `anon` calls `has_capability(<any workspace>, <any capability>)` | `false` — `auth.uid()` is `NULL` (§4.4) |
| T15 | `anon` calls `get_shared_content(<valid share id>)` | **Allowed, unchanged** — the one sanctioned guest path |
| T16 | `anon` calls `get_shared_content(<random uuid>)` | `NULL` — no distinction leaked between "never existed" and "revoked" |
| T17 | Guest holding a *bundle* link reaches a guide in that bundle that is `is_shareable = false` | Not returned — existing `get_shared_content` filter |
| T18 | Guest holding an *expired* link | `{type: 'expired'}`, no content |

### C. Cross-workspace isolation

| # | Attack | Expected |
|---|---|---|
| T19 | Member of workspace A `SELECT`s content of workspace B | Zero rows |
| T20 | Member of A calls `has_capability(B, 'content.view.all')` | `false` |
| T21 | Member of A `INSERT`s a guide with `workspace_id = B` | Denied — `WITH CHECK` evaluates the *new row's* `workspace_id` (§4.3) |
| T22 | Member of A `UPDATE`s one of their own guides to set `workspace_id = B` (content smuggling) | Denied — `WITH CHECK` on the post-update row |

### D. Role boundaries within a workspace

| # | Attack | Expected |
|---|---|---|
| T23 | family:editor (Adult) `DELETE`s a guide | Denied — parity with today (§3) |
| T24 | family:editor `INSERT`s a guide into the shared workspace | Denied — the deliberate `⛔️` cell (§3) |
| T25 | family:editor removes another member | Denied — `member.remove` not held |
| T26 | host:manager manages billing / removes a member | Denied |
| T27 | host:cleaner behaves exactly as family:viewer (granted-scope view only, no writes) | Identical results — §3.1 |

### E. Tier enforcement survives the capability model

| # | Attack | Expected |
|---|---|---|
| T28 | Owner with `content.edit` updates an **over-limit** (read-only) guide | **Denied** — `guides_block_readonly_update` (RESTRICTIVE) ANDs on top (§6) |
| T29 | Same owner updates an **under-limit** guide | Allowed |
| T30 | Over-limit guide `DELETE` by owner | Allowed — read-only means read-only, never undeletable (existing semantics) |

### F. Data integrity

| # | Attack | Expected |
|---|---|---|
| T31 | `INSERT` `workspace_members` with `role='cleaner'` into a `family` workspace | Denied — §2.2 validity trigger |
| T32 | `has_capability(NULL, 'content.edit')` (a not-yet-backfilled row) | `false` — fail-closed (§4.4) |
| T33 | `SECURITY DEFINER` `search_path` hijack: caller creates a temp `workspace_members` and calls `has_capability` | No effect — `SET search_path TO 'public'` |

### G. Parity (the M3 gate)

| # | Check | Expected |
|---|---|---|
| T34 | §5.1 differential across every table × command, **over synthetic fixtures including viewer-with-grants and viewer-without-grants** (§7) | Zero disagreements |
| T35 | Re-run T34 after M5 drops the legacy policies | Zero disagreements |

---

## 9. Open questions resolved and raised

**Resolved — `ARCHITECTURE.md` §9's first open question** ("should
`workspace_members` eventually absorb `family_invitations` entirely, or do
durable membership and anonymous guest links stay permanently distinct?"):

> **They stay permanently distinct.** A guest is never a
> `workspace_members` row and never an RLS subject — guest access is
> RPC-mediated only (§1.2). `family_invitations` remains the invitation
> *workflow*, projected into `workspace_members` as settled membership.
> Three concepts, three mechanisms, on purpose: making a guest a member
> row would require an anon-role RLS policy, which is precisely the thing
> that makes "guest must never enumerate" hard to guarantee.

**Raised:**

- Should family:editor (Adult) gain `content.create`? Withheld for parity
  (§3); now a one-row product decision.
- Should the viewer/Helper invite path be surfaced in the UI at all
  (§7)? Product decision; backend is complete.
- `billing.manage` is declarative until Prompt 17 wires org-level billing
  to it (§6).
- Whether host:manager should hold `member.remove` — withheld here as
  the conservative default; revisit in Prompt 10 (host teams) with real
  host workflows in hand.
