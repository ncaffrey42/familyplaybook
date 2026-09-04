# Search, Notifications, Messaging — the Seams

**Status:** One migration (notifications table + first producer, dark) +
design. Deliverable of Prompt 11 (run after Prompt 12 — the Ledger footer
tracks the order). Read [`SHARING.md`](SHARING.md) §6 (which reserved the
notification seam this prompt now builds) and [`NAV.md`](NAV.md) §3.2
(the silence-is-default rules every channel inherits) first.

---

## 1. Search: three tiers and a recorded trigger

### 1.1 Today's tier is correct, and one index is dead

Client search (`searchUtils.js`) is case-insensitive substring over
name/description/category/steps of **already-loaded** data —
`SearchScreen` filters `allGuides` from `DataContext`, which loads every
guide the user can see. While everything loads anyway, client search is
*optimal*: zero latency, zero round-trips, works offline. Extending to
server-side search today would add a network hop to make results worse.

**Diligence finding:** `idx_guides_name_gin` — a GIN FTS index on
`to_tsvector('english', name)` (`schema.sql:372`) — is **queried by
nothing**. No client or edge-function code uses `textSearch` or any FTS
operator. Harmless (small write cost per guide save), but it is an index
that answers a question nobody asks; the server tier below replaces it
with one that matches real queries.

### 1.2 The trigger, recorded

Move search server-side when the **first** of these holds — and not
before:

- **(a)** `DataContext` stops loading all content up front (pagination —
  which workspace-scale content will eventually force). Client search
  breaks *structurally* at that moment: you cannot substring-match rows
  you never fetched.
- **(b)** A workspace exceeds ~500 guides (family accounts today are
  nowhere near; a multi-property host could be).
- **(c)** Measured search jank on real devices (the re-engagement rule:
  observed, not speculative).

**(a) is the real trigger; (b)/(c) are early-warning proxies.** Non-
trigger: the existence of the dead index, or FTS being "more correct" —
substring over loaded data is what users of a 50-guide playbook expect.

### 1.3 The server tier, when it comes (design, not built)

One RPC, workspace-scoped, `TO authenticated` (RLS/capability does the
scoping — never `SECURITY DEFINER` for an owner-facing search):

```sql
search_workspace_content(p_workspace_id uuid, p_query text)
  → (kind text, id uuid, name text, snippet text, rank real)
```

- **FTS** (`websearch_to_tsquery('english', …)`) over a generated
  `tsvector` of name ‖ description ‖ steps text — matching *what the
  client tier already searches*, not just names.
- **pg_trgm** `similarity()` on `name` for typo tolerance ("wif i"), used
  as a fallback rank when FTS misses.
- Indexes: one GIN on the combined tsvector (replacing the dead name-only
  index), one GIN trgm on `name`. Ships in the same migration as the RPC,
  *at trigger time* — indexes without a query would repeat the mistake in
  §1.1.

## 2. Notifications: the table + the ONE seam

### 2.1 The fan-out template, named

`submit-feedback` is the pattern (its header comment is the spec): each
destination is **enabled by the presence of its secret, isolated in its
own try/catch, best-effort, and can never fail the source action**.
Notifications generalize it: the **`notifications` table is the
persistent first destination**, and every future channel (push, email) is
one more fan-out arm behind the same event — never a second event site.

### 2.2 The table (migration `20240132_notifications.sql` — shipped, dark)

```
notifications (
  id, user_id → auth.users,        -- recipient (workspace-scoped later)
  kind text,                       -- 'share.opened' | future kinds
  title text, body text,           -- pre-rendered, content-free (§2.4)
  ref_type text, ref_id uuid,      -- what it points at (e.g. shared_links)
  count int DEFAULT 1,             -- coalescing counter
  coalesce_key text,               -- e.g. 'share.opened:<link>:<utc-day>'
  created_at, read_at
)
UNIQUE (user_id, coalesce_key) WHERE read_at IS NULL AND coalesce_key IS NOT NULL
RLS: owner SELECT + owner UPDATE (mark read). No INSERT/DELETE for
authenticated — producers are SECURITY DEFINER/service only, same
posture as every counter table in this schema.
```

**Coalescing is the anti-noise mechanism**: a repeat event upserts into
the existing *unread* row (`count += 1`) instead of appending. A popular
guest link produces one row per day — "Your Ivy Cottage link was opened
×7" — not seven rows. Once read, the partial-unique window resets and the
next open starts a fresh row. Bounded by construction, like
`ask_playbook_usage`'s hour buckets.

### 2.3 The first producer

`record_share_access()` — which `SHARING.md` §6 designated as "the single
server-side moment where 'someone opened your link' becomes true" — gains
the fan-out: when (and only when) the debounced counter actually
increments, it upserts a coalesced `share.opened` notification for the
link's owner. Same migration, `CREATE OR REPLACE` on top of `20240128`'s
definition (ordering guaranteed by migration numbering). The guest-facing
behavior is unchanged: still `VOLATILE SECURITY DEFINER`, still returns
nothing, still identical for real/expired/nonexistent ids.

### 2.4 Privacy inheritance

Notification `title`/`body` are pre-rendered and **content-free**: link
label and count, never visitor identity (none exists — `SHARING.md`
§5.1), never question text (`ASK_PLAYBOOK.md` §3 #4). A future
`ask.refused` digest kind carries counts only, which is exactly what the
refusal counter was built to feed (Prompt 18).

### 2.5 The inbox (specified, not built — and why)

Placement per the `NAV.md` contract (no 4th tab): an unread dot on the
Home-header avatar; the list lives in Account. Rows: title, count badge,
relative time; tap marks read and follows `ref_type`/`ref_id` (a
`share.opened` opens `/share-manage/:id`). Empty state is composed, not
apologetic. Flag `VITE_ENABLE_NOTIFICATIONS` when built.

Not built now for the same recorded reason as the workspace switcher
(`NAV.md` §4.3): its only producer sits at the end of an **unapplied**
migration chain (`20240128` → `20240132`), so the inbox would render an
empty state for 100% of users indefinitely — a component with no data
source, not a feature shipping dark. It becomes buildable the day the
migrations apply.

## 3. Messaging: integration points only

No chat build — the seam is **webhook-out**, defined now so a future
integration (or an acquirer's) doesn't invent its own shape.

**Event catalog (v1):** `share.opened`, `ask.answered`, `ask.refused`,
`member.joined`, `guide.updated` — all already observable server-side;
the first three are counts-bearing and content-free by the same rules as
§2.4.

**Envelope:**

```json
{
  "id": "evt_<uuid>",            // idempotency key — at-least-once delivery
  "event": "share.opened",
  "occurred_at": "<iso>",
  "workspace_id": "<uuid|null>", // null until tenancy applies
  "refs": { "share_id": "…" },
  "data": { "count": 3 }         // counts and labels only, never content text
}
```

**Delivery contract:** POST, at-least-once, consumer dedupes on `id`;
`X-Playbook-Signature: sha256=<HMAC(body, endpoint_secret)>` — the
inverse of the Stripe-webhook verification this codebase already
implements, so both directions share one mental model. Retry with backoff,
disable an endpoint after sustained failure, log delivery attempts not
payloads.

**Storage sketch (not migrated):** `webhook_endpoints (id, owner/workspace,
url, secret, event_kinds text[], is_active, failure_count)` — ships with
the first real consumer, not before. The fan-out arm slots into §2.1's
template exactly like a channel: enabled by row-presence instead of
secret-presence, isolated, best-effort.

## 4. Files

| File | What |
|---|---|
| `supabase/migrations/20240132_notifications.sql` | table + RLS + coalescing + `record_share_access` fan-out |
| `docs/platform/SEAMS.md` | this design |
| *(deferred)* | inbox UI (§2.5), server search RPC + indexes (§1.3), `webhook_endpoints` (§3) |
