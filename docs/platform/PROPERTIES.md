# Properties + Guest Guide Builder

**Status:** Design + migrations + flagged UI + a runnable E2E script.
Deliverable of Prompt 9. Read [`HOST_SHELL.md`](HOST_SHELL.md) (the shell
this fills), [`CONTENT_ENGINE.md`](CONTENT_ENGINE.md) §3 (the taxonomy
this migrates), and [`SHARING.md`](SHARING.md) §3 (the dated links this
reuses) first.

---

## 1. A property is a row plus a convention

```sql
properties (
  id            uuid PK,
  user_id       uuid NOT NULL → auth.users,   -- owner; workspace_id joins later
  workspace_id  uuid NULL,                     -- born tenancy-ready (ARCHITECTURE.md §3.4)
  bundle_id     uuid NOT NULL UNIQUE → packs,  -- THE convention: 1 property = 1 bundle
  name          text NOT NULL,
  address       text,
  photo_url     text,                          -- public URL — same media debt as all
                                               -- images (CONTENT_ENGINE.md §5), not new debt
  created_at / updated_at
)
```

The **per-property playbook is not a new content type** — it is the
property's one bundle, on the existing content engine, exactly as
`HOST_SHELL.md` §4 promised when it counted `packs` as "active
properties". `bundle_id UNIQUE` enforces the convention in the schema, not
in prose. Creating a property creates its bundle in the same client flow;
deleting a property keeps the bundle (content outlives the veneer —
`ON DELETE RESTRICT` the other way, so deleting a *bundle* that is some
property's playbook is refused until the property goes first).

RLS: owner-only CRUD (`auth.uid() = user_id`), the exact posture `packs`
has today. Guests never touch `properties` — the guest surface is the
share link + `get_shared_content`/`ask-playbook`, both already built.

**Born tenancy-ready:** unlike `guides`/`packs` (which get `workspace_id`
backfilled by ARCHITECTURE.md migration #4), `properties` is new and
carries the nullable column from day one — one less table for that
migration to touch.

## 2. Host taxonomy — Prompt 4's design, finally migrated

`content_categories` ships here, byte-for-byte as `CONTENT_ENGINE.md` §3.2
designed it (family: How To / Find It / Reference / Emergency; host:
Arrival / House / Local / Departure), because the guest-guide builder is
its first real consumer. Same no-write-policy posture as the RBAC tables.

The builder UI reads its category chips from a flagged constant that
mirrors the seed (`HOST_CATEGORIES` in `src/lib/hostTaxonomy.js`) rather
than querying the table — the table is the source of truth for servers
and future prompts; the client constant avoids a query on a hot editor
path and is one file to delete when categories become dynamic. The two
are kept in sync by the E2E (§5, step 0 asserts the seed matches).

## 3. Guest-guide builder + links: reuse, not rebuild

| Need | Reused surface | Delta |
|---|---|---|
| Guide editor | `CreateGuideScreen` at `/guide/new` | navigation state `{ hostBundleId, hostContext }` → host category chips, pre-linked to the property's bundle |
| AI generation | `voice-to-guide` + `AiGuideSheet` | none — already category-aware via draft mapping |
| Link-ready screen | `ShareScreen` at `/share-manage/:id` | none |
| QR | `qrcode.react`, already on `ShareScreen` | printable sheet = a print-styled route wrapping the same component |
| Dated links | `SHARING.md` §3's `expiryFromDateInput` | check-in/check-out = the arbitrary-expiry date picker, relabelled |
| Guest view | `PublicSharePage` + `get_shared_content` | none |
| Guest Q&A | `ask-playbook` (Prompt 7) | none — a property link **is** a bundle share |

The printable QR sheet (`/host/property/:id/qr-sheet`) is the one new
surface: property name, the QR, the short URL, and a "questions? just ask
Alfred on this page" line — print-styled (`@media print`), no chrome.

## 4. Host starter library

Seeded into the **existing** `library_packs`/`library_guides` tables — the
same infrastructure and the same `handleAddBundleFromLibrary` copy-to-mine
flow families use, zero new code paths. One pack (`pack_host_starter`,
"Host Starter Kit") with 10 guides: wifi, check-in, check-out, parking,
appliances, house rules, local picks, trash & recycling, emergencies, and
"Ask Alfred" (an explainer whose content doubles as the guest-facing
introduction to the Q&A box).

Each guide's `category` uses the **host** taxonomy keys, and steps are
written as fill-in-the-blank templates ("The wifi network is ⟨network
name⟩…") so copy-to-mine yields something an owner edits in minutes rather
than composes from scratch. `template_id` on the copied rows preserves
provenance, as it already does for family library copies.

## 5. The E2E — runnable, not aspirational

`e2e/host-property-flow.mjs` (same dependency-free pattern as
`evals/ask-playbook/run.mjs`). Needs env: `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `E2E_EMAIL`/`E2E_PASSWORD` (a disposable test user).
Notably it does **not** need edge functions deployed — every step below is
REST + RPC:

0. Seed check: `content_categories` host rows match `HOST_CATEGORIES`.
1. Sign in; **create property** (insert bundle → insert property).
2. **Build guide** (insert with host category, link via `pack_guides`).
3. **Generate dated guest link** (insert `shared_links` with
   `expires_at` = end of a checkout date two days out).
4. **Guest view works**: as `anon`, `get_shared_content(link)` returns the
   bundle with the guide.
5. **Expires**: owner sets `expires_at` into the past (this exercises the
   `shared_links_owner_update` policy from migration `20240128` — the
   silent-expiry bugfix), then as `anon`, `get_shared_content` returns
   `{type: 'expired'}`, and `ask_playbook_available` returns `false`.
6. Cleanup (delete property → bundle → user rows it created).

**Blocked on:** migrations `20240128`–`20240131` applied, and a test user.
Nothing else. The script prints exactly which prerequisite is missing
rather than stack-tracing.

## 6. Known limitation, recorded loudly

**Host bundles appear in the family app.** `DataContext` fetches all of a
user's `packs`; a property's playbook is a `pack`; nothing scopes content
by workspace yet (that is Prompt 3/4's deferred RLS work +
`ARCHITECTURE.md` migration #4). So an account using both products sees
property playbooks listed among family bundles in the Guides tab.

Not fixable here without violating the byte-identical constraint on the
family app — filtering `DataContext` would touch the one query every
family screen depends on. Acceptable while the host flag is dark and every
host account is internal; **must be resolved by workspace scoping before
the flag ships.** Recorded in DECISIONS.md as part of this prompt's entry,
alongside HOST_SHELL.md §7's existing blockers (same release gate, same
fix).

## 7. Files

| File | What |
|---|---|
| `supabase/migrations/20240130_properties_host_taxonomy.sql` | `content_categories` + seed, `properties` + RLS |
| `supabase/migrations/20240131_host_starter_library.sql` | `pack_host_starter` + 10 guides |
| `src/lib/hostTaxonomy.js` | `HOST_CATEGORIES` (client mirror of the seed) |
| `src/pages/host/HostProperties.jsx` | real list + create (replaces skeleton) |
| `src/pages/host/HostPropertyDetail.jsx` | playbook, links (dated), starter-kit CTA |
| `src/pages/host/HostQrSheet.jsx` | printable QR sheet |
| `src/pages/guides/CreateGuideScreen.jsx` | host-context category chips (flag + state gated) |
| `src/App.jsx` | 3 new routes inside the existing `/host` block |
| `e2e/host-property-flow.mjs` | §5 |

Everything user-visible stays behind `VITE_ENABLE_HOST_PRODUCT`; the
family app renders byte-identically with the flag off (the
`CreateGuideScreen` change is double-gated on flag *and* navigation state
that only host screens set).
