# Content Engine v2: The Generalization Delta

**Status:** Design only. No migrations applied, no application code
changed, **no UI changes** (per the prompt). Deliverable of Prompt 4
([`PLATFORM_PROMPTS.md`](../../PLATFORM_PROMPTS.md)).

**Depends on** [`ARCHITECTURE.md`](ARCHITECTURE.md) (the `workspace_id`
columns) and [`RBAC.md`](RBAC.md) (capability policies). Neither is
applied, so nothing here can ship first. Read [`DECISIONS.md`](DECISIONS.md),
[`TENANCY.md`](TENANCY.md), and [`GLOSSARY.md`](GLOSSARY.md) first.

---

## 1. The engine is already mostly vertical-agnostic

Worth establishing before listing deltas, because it bounds the work:
guides (`name`, `description`, `icon`, `steps jsonb`), bundles
(`packs` + ordered `pack_guides.position`), attachments, and the AI paths
contain **almost nothing family-specific**. A host guide is a guide. An
arrival bundle is a bundle.

Two concrete demonstrations:

- **`assemble-handoff-bundle` is already generic.** It reads
  `category` as opaque text and hands it to the model as one field among
  several (`index.ts:64` — `${c.category ?? 'Uncategorized'}`). It never
  compares against a known category list. It needs **zero changes** to
  serve hosts.
- **`GuideIcon` already fails safe on unknown categories** —
  `CATEGORY_STYLES[category] || DEFAULT_STYLE` (`GuideIcon.jsx:26`). A
  guide categorized `Arrival` renders the default dot rather than
  crashing.

So this document is genuinely a *delta*, not a rebuild. Four changes:
ownership (§2), taxonomy (§3), the playbook definition (§4), and media
(§5) — of which only §3 requires new schema, and only §5 is a
pre-existing debt rather than a generalization.

---

## 2. Content belongs to a workspace, not a user

### 2.1 What `ARCHITECTURE.md` already covers

`guides`, `packs`, `shared_links`, `share_grants` gain a nullable,
backfilled `workspace_id` (its migration #4), and `RBAC.md`'s capability
policies key authorization on that column. That is the mechanical part,
already designed.

### 2.2 What this prompt adds: `user_id` is reframed as provenance

After the capability policies land, `guides.user_id` / `packs.user_id`
stop being the authorization key. They should be understood — and
documented — as **provenance**: *who authored this row*, not *who may
touch it*.

The column stays. It is not deprecated and must not be dropped, because
four things still legitimately depend on it:

| Consumer | Uses `user_id` for | Still correct? |
|---|---|---|
| `is_guide_editable` / `is_pack_editable` | Ranking rows against the plan limit | **No — see §2.3** |
| `recalculate_usage_stats` | Per-user usage counters | Needs workspace scoping (Prompt 17) |
| `export_user_data` / `reset_user_account` | GDPR export / account reset | Yes, but semantics shift (§2.4) |
| `DataContext.jsx:104-105` | The `.in('user_id', ownerIds)` fetch | Yes, until Prompt 3/4 rewrites it |

### 2.3 Finding: tier enforcement ranks by author, and that breaks the moment a non-owner can create

`is_guide_editable(p_guide_id)` (`schema.sql:742-784`) does three things
in sequence:

1. `SELECT user_id INTO v_user_id FROM guides WHERE id = p_guide_id`
2. `get_user_numeric_limit(v_user_id, 'active_guides_max')` — reads
   **that author's** plan from `user_billing`
3. Ranks `WHERE user_id = v_user_id` by `updated_at DESC` and compares
   the row's rank to the limit

Every step keys on the **author**. Today that is correct, because
`ARCHITECTURE.md` §3.1's bijection means author ≡ workspace ≡ plan
holder, and because `RBAC.md` §3 deliberately withholds `content.create`
from family:editor so no non-owner can author a row in someone else's
workspace.

The moment `content.create` is granted to Adults or host Managers — a
one-row change to `workspace_role_capabilities`, by design the *easiest*
change in the whole model — that stops holding:

- An Adult's guide in the shared workspace would be governed by the
  **Adult's own plan**, which is very likely `free`, not the owner's paid
  plan. The workspace owner pays for capacity their family members'
  content doesn't draw from.
- Worse in the other direction: that guide is ranked only against *the
  Adult's own* guides, so a workspace could hold unlimited content by
  spreading authorship across members — each member gets their own
  free-tier allowance inside a workspace someone else pays for.

**Therefore: `is_guide_editable`/`is_pack_editable` must move from
`user_id` to `workspace_id` before `content.create` is granted to any
non-owner role.** This is a hard ordering dependency between two designs
that otherwise look independent, which is exactly why it is recorded here
rather than discovered later.

The reworked shape (design only — Prompt 17 owns the plan-resolution half):

```sql
-- 1. rank within the WORKSPACE, not the author's own rows
-- 2. resolve the limit from the workspace's PLAN HOLDER, not the author
v_workspace_id := (SELECT workspace_id FROM guides WHERE id = p_guide_id);
v_limit := get_workspace_numeric_limit(v_workspace_id, 'active_guides_max');
SELECT rnk FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY updated_at DESC NULLS LAST, id DESC) AS rnk
    FROM guides WHERE workspace_id = v_workspace_id
) ranked WHERE id = p_guide_id;
```

`get_workspace_numeric_limit()` doesn't exist yet — defining "which user's
plan governs a workspace" is org-level billing, which is Prompt 17's
subject. Until then the interim answer is "the workspace's `owner`
member", which is unambiguous while every workspace has exactly one owner.

### 2.4 Deletion and export semantics shift

`export_user_data()` and `reset_user_account()` (`schema.sql:400`, `:932`)
filter `WHERE user_id = auth.uid()`. Once a workspace can hold content
authored by several members, "export my data" and "reset my account"
become ambiguous: my *authored* rows, or my *workspace's* rows?

Not resolved here — it interacts with `delete-account`'s cascade, already
flagged as the riskiest edge function to adapt (`ARCHITECTURE.md` §5.2:
deleting one member's `auth.users` row must never cascade-delete a shared
workspace's guides). Recorded as an open question (§8) so the prompt that
touches account deletion inherits the problem statement instead of
rediscovering it.

---

## 3. `category` becomes per-vertical taxonomy data

### 3.1 Today: hardcoded in five places, and already drifting

`guides.category` is **unconstrained, nullable `text`** (`schema.sql:86`)
— no `CHECK`, no FK. The taxonomy exists only as repeated literals:

| Location | Knows about |
|---|---|
| `voice-to-guide/index.ts:15` — `ALLOWED_CATEGORIES` | How To, Find It, Reference |
| `voice-to-guide/index.ts:99` — the prose line in `SYSTEM_PROMPT` | How To, Find It, Reference |
| `voice-to-guide/index.ts:124` — `json_schema` `enum`, `strict: true` | How To, Find It, Reference |
| `CreateGuideScreen.jsx:265-267` — the picker | How To, Find It, Reference |
| `GuidesLibrary.jsx:19` — `CHIPS` filter | How To, Find It, Reference |
| `GuideIcon.jsx:17-22` — `CATEGORY_STYLES` | How To, Find It, Reference, **Emergency** |

**That last row is the drift, already present.** `GuideIcon` styles a
fourth category, `Emergency`, that no picker offers, no filter chip
surfaces, and the AI enum forbids. Whether it's vestigial or aspirational,
it is proof that a taxonomy duplicated across six literals does not stay
consistent — before a second vertical has even been introduced.

The one piece of good news: **because the column has no constraint,
introducing host categories requires no change to `guides` at all.**
Existing rows cannot violate a constraint that doesn't exist.

### 3.2 The table

Mirrors `RBAC.md` §2's pattern exactly — a new vertical is an `INSERT`:

```sql
content_categories (
  workspace_type  text    not null,   -- 'family' | 'host' | future
  key             text    not null,   -- the value stored in guides.category
  label           text    not null,   -- UI string
  prompt_hint     text,               -- one clause for the AI system prompt (§3.4)
  color_token     text,               -- 'raspberry' | 'apricot' | 'mulberry' | 'coral'
  sort_order      int     not null,
  is_default      boolean not null default false,
  primary key (workspace_type, key)
)
```

RLS: `SELECT` to `authenticated`, **no write policy** — same posture and
same reasoning as the RBAC tables (`RBAC.md` §2). Seeding is migration-
or `service_role`-only.

Seed:

| workspace_type | key | label | color_token | default |
|---|---|---|---|:--:|
| family | `How To` | How To | raspberry | ✅ |
| family | `Find It` | Find It | apricot | |
| family | `Reference` | Reference | mulberry | |
| family | `Emergency` | Emergency | coral | |
| host | `Arrival` | Arrival | raspberry | ✅ |
| host | `House` | House | apricot | |
| host | `Local` | Local | mulberry | |
| host | `Departure` | Departure | coral | |

Seeding `Emergency` for family **codifies what `GuideIcon` already
renders** rather than silently dropping a category the UI knows about.
Whether to surface it in the picker is a UI decision, out of scope here.

### 3.3 `key` is the literal stored string, not a slug

`key` is `'How To'`, not `'how_to'`. Every existing `guides.category`
value is the display string, and `get_shared_content()` returns it
verbatim to the public share page (`schema.sql:541`). Introducing slugs
would mean rewriting every row, the AI enum, the chips, and the share
payload — churn with no user-visible benefit, and a live-data rewrite
where today's design needs none.

This is the same call `RBAC.md` §2.1 made for role values (`editor` stays
`editor`, "Adult" is a label). Same reasoning, applied consistently:
**stored values stay; labels are data.**

### 3.4 Making the AI path vertical-aware

`voice-to-guide` is the only content-engine component that genuinely
needs rework, because it constrains the model's output to the family
taxonomy in three coupled ways (§3.1). All three become derived from
`content_categories` rows for the calling workspace's `workspace_type`:

| Today | Becomes |
|---|---|
| `ALLOWED_CATEGORIES` module constant | `SELECT key FROM content_categories WHERE workspace_type = $1 ORDER BY sort_order` |
| `json_schema.properties.category.enum` | the same list, injected per request |
| The hand-written prose line at `:99` | assembled from each row's `prompt_hint` |
| Fallback `'How To'` (`:51`, and `aiDraft.js:27`) | the row where `is_default` |

`prompt_hint` is what turns the prompt's category sentence into data. The
existing family hints, lifted verbatim from the current prompt so behavior
is unchanged for family workspaces:

- `Find It` → "when the recording is mostly about where things are"
- `Reference` → "for facts, contacts, or lists"
- `How To` → "otherwise" *(the default)*

And for host: `Arrival` → "check-in, keys, parking, getting in";
`House` → "appliances, wifi, rules, how things work"; `Local` →
"recommendations, restaurants, getting around"; `Departure` → "checkout
time, keys, trash, what to leave".

The function resolves `workspace_type` from the workspace it's called for
— which requires the `requireWorkspace()` helper that `ARCHITECTURE.md`
§5.2 defers. So this change lands **after** edge functions become
workspace-aware, not before. Until then `voice-to-guide` keeps its
constant and keeps serving family workspaces correctly.

### 3.5 No constraint on `guides.category` — deliberately

No FK from `guides.category` → `content_categories.key`, and no `CHECK`,
in this migration. Three reasons:

1. **Unknown legacy values.** The set of distinct `category` values in live
   data has not been enumerated, so a FK added blind could fail the
   migration or, worse, block writes on rows nobody knew existed.
   `library_guides.category` (`schema.sql:107`) is equally unconstrained
   and equally unverified. *(Correction, 2026-08-11: an earlier revision of
   this file said the production database was unreachable. It is not — the
   backend is live and reachable. Enumerating the values is a
   `select distinct` away and should be done before M2's report is
   treated as complete.)*
2. **A composite FK can't express the real rule anyway.** The correct
   constraint is "this guide's category must be valid *for its
   workspace's vertical*", and `guides` doesn't carry `workspace_type` —
   the same shape as `RBAC.md` §2.2's role-validity problem, which needed
   a trigger.
3. **Low value, real risk.** `category` drives a colored dot and a filter
   chip. `GuideIcon` already fails safe. An invalid category is a cosmetic
   defect, not a security or integrity one — not worth a constraint that
   can hard-fail writes.

Instead: migration M3 (§6) ships a **validation report** — a query
listing distinct `(workspace_type, category)` pairs not present in
`content_categories`. Constrain later, once real data is observable.
Same verify-then-constrain discipline as `20240104_retire_archive.sql`'s
deferred column drops and `ARCHITECTURE.md`'s deferred `NOT NULL`.

---

## 4. "Playbook" formalized: the workspace's content root

**A playbook is not a new table. `workspace_id` *is* the playbook
pointer.**

`GLOSSARY.md` currently defines Playbook as "the sum of a user's `guides`
+ `packs`" — an aggregate with no identity. Formalizing it needs no new
entity, only a precise definition:

> **Playbook** — the complete content of exactly one workspace: every
> `guides` and `packs` row sharing that `workspace_id`, plus the
> `pack_guides` edges between them. One workspace has exactly one
> playbook; a playbook belongs to exactly one workspace. The two are the
> same set viewed from different sides, which is why no `playbooks` table
> exists or should.

This resolves cleanly for both verticals:

- **Family**: one household, one workspace, one playbook — identical to
  today's "everything I've documented".
- **Host**: one host workspace, one playbook, containing many
  property-scoped bundles. Prompt 9's "per-property playbook = a
  bundle-per-property convention" is then precisely a *sub-tree* of the
  workspace's playbook, not a competing root — which is why properties
  don't need their own content tables (`GLOSSARY.md`'s Property row
  already anticipates this).

The term therefore stays a **product** word backed by a **precise
technical referent**, which is exactly what a diligence reader needs: ask
"where is the playbook in the schema?" and the answer is "it's the
`workspace_id` equivalence class", not "it's a marketing term".

---

## 5. Media and attachments: the public-URL debt

Recorded as debt with a migration path, **explicitly not blocking this
prompt or the host build** — per the prompt's instruction.

### 5.1 What exists today

| Aspect | Reality |
|---|---|
| Buckets | `images` (photos, bundle covers) and `guide-videos` (`MediaUpload.jsx:125`) |
| Access | `getPublicUrl()` (`MediaUpload.jsx:140`, `ImageUpload.jsx:68`) — the returned URL only resolves if the bucket is **public** |
| Path | `guide-media/{guideId or temp-uuid}/{user.id}-{timestamp}-{name}.{ext}` |
| Stored where | The public URL string, inline in `guides.steps[].image_url` / `.video_url`, and `packs.image` |
| Accounting | `storage.objects.owner_id = user_id`, summed by `recalculate_usage_stats` (`schema.sql:903-907`) |

### 5.2 Why it's debt: it silently undercuts two shipped features

Not an abstract "public is bad" concern — it defeats specific behavior
the product already promises:

1. **Share-link expiry.** `get_shared_content()` correctly returns
   `{type: 'expired'}` after `expires_at`, and the comment in
   `20240109_share_link_hardening.sql` calls a closed link "a feature, not
   an error". But every media URL that link ever rendered **still
   resolves, forever**. The guide text closes; the photos of the
   house/keys/alarm panel do not.
2. **Un-sharing.** `is_shareable = false` produces `{type: 'private'}` —
   and the same permanence applies to media already handed out. The RPC
   comment says "the link survives un-sharing, but the content does not";
   for media, the content survives too.

Two lesser issues: the object path embeds `user.id`, leaking user
identifiers into URLs that get pasted into texts and emails; and
`temp-{uuid}` paths from abandoned uploads are never garbage-collected.

**A diligence gap worth recording alongside it:** `supabase/schema.sql` is
generated from `pg_tables WHERE schemaname='public'`
(`generate-schema-snapshot.py:29-30`), so it captures **no `storage`
schema policies at all**. Whatever RLS does or doesn't protect
`storage.objects` is invisible to the repo's own source-of-truth snapshot.
Extending the snapshot to cover the `storage` schema is a small, high-
value change for exactly the audience the snapshot exists to serve.

### 5.3 Remediation path (phased, non-blocking)

The hard part is anonymous access, so it's stated first: **signed-URL
generation is not available inside Postgres.** A `SECURITY DEFINER` RPC
like `get_shared_content()` cannot mint a signed storage URL — signing
happens in the Storage API. So the anonymous path necessarily grows an
**edge function** (`resolve-share-media`) that validates the share id,
expiry, and `is_shareable` — reusing exactly the checks
`get_shared_content` already performs — and then issues short-TTL signed
URLs. That is the real cost of this remediation, and the reason it is
correctly deferred rather than attempted opportunistically.

| Phase | Change | Breaking? |
|---|---|---|
| **P0** *(now)* | Record the debt; extend the schema snapshot to include `storage` policies | No |
| **P1** | New buckets `media-private`; new uploads write there and store a **path**, not a URL. Readers treat a value starting with `http` as a legacy public URL and anything else as a private path — a dual-read window with no cutover | No |
| **P2** | `resolve-share-media` edge function (anonymous, share-validated) + a signed-URL path for authenticated readers gated on `has_capability(workspace_id, 'content.view.*')` (`RBAC.md` §3) | No |
| **P3** | Backfill: copy legacy objects into the private bucket, rewrite the `steps` jsonb and `packs.image` values to paths | No |
| **P4** | Flip `images`/`guide-videos` to private. **Legacy URLs stop resolving** | **Yes** — needs the P3 backfill verified complete first, and is the only phase requiring care |
| **P5** | GC job for orphaned `temp-*` prefixes | No |

Dependency worth noting: P2's authenticated branch wants
`has_capability()`, so this sequence trails `RBAC.md`'s M4. P1 and P3
don't, and can proceed independently whenever the debt is scheduled.

---

## 6. Migration plan

Continuing from `RBAC.md` §5 (which ends at `20240125`).

| # | File | Contents | Behavior change |
|---|---|---|---|
| **M1** | `20240126_content_categories.sql` | `content_categories` table + RLS (read-only to `authenticated`, no write policy) + seed all 8 rows (§3.2) | **None.** Nothing reads it. |
| **M2** | *(no migration)* | Validation report: distinct `(workspace_type, category)` pairs in `guides` and `library_guides` absent from `content_categories` | **None.** Read-only. |
| **M3** | `20240127_workspace_tier_ranking.sql` | Rewrite `is_guide_editable`/`is_pack_editable` to rank by `workspace_id` and resolve the limit from the workspace's owner (§2.3) | **None while every workspace has one member** — the bijection makes old and new identical. Verified by the same differential-harness technique as `RBAC.md` §5.1. |
| — | *(later)* | `voice-to-guide` derives its enum/prompt from `content_categories` (§3.4) — after `requireWorkspace()` exists; media phases P1–P5 (§5.3); category constraint if M2 comes back clean | Deliberate, reviewed |

**M3 is the ordering-critical one** (§2.3): it must land before
`content.create` is granted to any non-owner role, and that grant is a
single `INSERT` into `workspace_role_capabilities` — trivially easy to do
without realizing it depends on a function rewrite. Worth a comment in
the seed data itself, not just in this document.

### 6.1 Verification

- **M1**: every `guides.category` value produced by today's UI
  (`How To`, `Find It`, `Reference`) and by `GuideIcon` (`Emergency`)
  resolves to a `content_categories` row for `family`.
- **M3**: differential harness over every guide/pack — old rank/limit vs.
  new — must return zero disagreements. Must run against **synthetic
  multi-member fixtures** (a workspace with an owner plus an editor who
  authored rows), because production has no such data today, exactly as
  `RBAC.md` §7 requires for the viewer path.
- **M3 negative test**: construct the §2.3 scenario — a free-plan editor
  authoring a guide inside a paid owner's workspace — and assert the
  guide is governed by the **owner's** limit. This test fails on today's
  function and passes on the rewritten one, which is the point.
- **Regression**: `get_shared_content()` returns `category` unchanged;
  `assemble-handoff-bundle` output is unaffected (§1).

---

## 7. Explicitly out of scope

- **All UI.** No picker, chip, icon-map, or screen changes — the prompt
  says so, and §3.2's data model is inert until a UI reads it.
- **`assemble-handoff-bundle`** — already generic (§1).
- **Dropping or renaming `user_id`** — §2.2; it stays as provenance.
- **Slugging category values** — §3.3.
- **Any constraint on `guides.category`** — §3.5.
- **Media phases P1–P5** — §5.3; recorded, scheduled separately.
- **Org-level plan resolution** (`get_workspace_numeric_limit`) —
  Prompt 17.

---

## 8. Open questions

- **What does "export my data" mean in a shared workspace?** My authored
  rows or my workspace's rows? Interacts with `delete-account`'s cascade
  (§2.4, `ARCHITECTURE.md` §5.2).
- **Should storage quota follow the workspace or the author?**
  `recalculate_usage_stats` sums `storage.objects.owner_id` per user;
  a shared workspace makes that ambiguous the same way §2.3 makes guide
  counts ambiguous. Prompt 17.
- **Should `Emergency` be surfaced in the family picker**, or removed
  from `GuideIcon`? It is currently styled but unreachable (§3.1) — the
  same "built but unreachable" category as `RBAC.md` §7's viewer path and
  `AUTH_FLOWS.md` §1.8's `/check-email`.
- **Should cross-vertical categories be enforced** (a host workspace
  holding a `How To` guide)? Deferred with the constraint decision (§3.5).
- **When is the media debt scheduled?** Non-blocking by instruction, but
  P4 gets harder the more public URLs accumulate in `steps` jsonb.
