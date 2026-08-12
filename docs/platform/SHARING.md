# Sharing v2: Arbitrary Expiry, Labels, Access Log

**Status:** Spec + **one migration** (`20240128_share_labels_access_log.sql`,
written, **not applied** — the Supabase project is unreachable) + flagged
UI (default off). Deliverable of Prompt 6
([`PLATFORM_PROMPTS.md`](../../PLATFORM_PROMPTS.md)).

Read [`RBAC.md`](RBAC.md) §1.2 (the anonymous-access rule this design must
not break) and [`NAV.md`](NAV.md) first.

---

## 1. What's already built

| Capability | Where |
|---|---|
| Expiry presets — Tonight / This weekend / Until I switch it off | `src/lib/shareExpiry.js`, picker in `ShareScreen.jsx` |
| QR code per link | `ShareScreen.jsx` (`qrcode.react`) |
| Per-person grants (Helper sees only ticked items) | `share_grants` + `ShareCenterScreen.jsx:209-268` |
| Helper read-only view | `PublicSharePage.jsx`, via `get_shared_content()` |
| Live-links list with humanised expiry + revoke | `ShareCenterScreen.jsx:282-330` |

The delta below adds four things and fixes one bug found on the way in.

---

## 2. Bug found: link expiry can never be changed

**`shared_links` has no `UPDATE` policy.** Since
`20240109_share_link_hardening.sql` it has had exactly three: `INSERT`,
`SELECT`, `DELETE`. That migration's own comment shows the omission was
not deliberate — *"Owners could create links but never revoke them; allow
delete for future unshare/revocation flows"* — `UPDATE` simply wasn't part
of that fix.

Two shipped client paths issue `UPDATE`s against the table anyway:

| Call site | What it tries to change |
|---|---|
| `ShareScreen.jsx:172` | `expires_at` — the entire "For how long" picker |
| `GuideDetail.jsx:160` | `expires_at` — refreshing expiry when re-sharing |

With RLS enabled and no permissive `UPDATE` policy, Postgres matches zero
rows. PostgREST answers `204 No Content`; supabase-js reports
`error: null`. The picker sets its optimistic state, shows no error, and
silently reverts on reload.

**User-visible consequence.** `expires_at` is set correctly at `INSERT`
(always `computeExpiry('tonight')` — `GuideDetail.jsx:167`,
`BundleDetail.jsx:186`) and is then immutable. So:

- Choosing **"Until I switch it off"** appears to work, and the link still
  dies at midnight. This is the damaging direction — the user believes
  they've made a permanent link.
- Choosing **"This weekend"** gives a link that dies at midnight.
- `SHARE_EXPIRY_ENABLED` defaults **on** (`!== 'false'`), so this is live.

**Fix:** the `UPDATE` policy, in this prompt's migration. It was needed for
labels regardless — a label you cannot save is not a feature — so the fix
is the same one line, not scope creep.

> **This is the only part of this prompt that fixes existing behavior, and
> it only takes effect once the migration is applied.** Until then the
> picker stays broken, flag or no flag.

---

## 3. Arbitrary expiry for host stays

Presets encode family rhythms ("tonight", "the weekend"). A guest checks
out on **a date**. Rather than add a fourth preset, `shareExpiry.js` gains
a date path:

```js
expiryFromDateInput('2026-08-20')   // → ISO for 2026-08-20T23:59:59.999 LOCAL
dateInputFromExpiry(iso)            // → '2026-08-20', for <input type="date">
```

**End of the chosen day, not the start.** A guest checking out on the 20th
needs the wifi code *on* the 20th. Local time, matching the existing
presets' rule that "the babysitter's tonight is the family's tonight"
(`shareExpiry.js:1-9`).

### 3.1 `presetFromExpiry` had to become opt-in

The existing selection-highlight helper is:

```js
const diffH = (new Date(expiresAt) - now) / 36e5;
return diffH <= 26 ? 'tonight' : 'weekend';
```

Fuzzy, and correct while only three presets exist — every link *was* one
of the three. With arbitrary dates that breaks: a custom date would render
as "This weekend" selected, so re-opening the screen would appear to
change the owner's choice.

Exact matching against `computeExpiry(preset, now)` is the only way to
separate "picked Tonight" from "picked a date that happens to be tonight"
— the durations overlap. But switching to exact matching unconditionally
would change behavior for **existing** links under the existing UI: a
stale link that used to highlight "This weekend" would highlight nothing.

So the new behavior is **opt-in and off by default**:

```js
presetFromExpiry(expiresAt, now)                        // unchanged, fuzzy
presetFromExpiry(expiresAt, now, { allowCustom: true }) // exact, adds 'custom'
```

Verified both branches (§7): with `allowCustom` omitted, a custom date
still returns `'weekend'` exactly as before.

---

## 4. Recipient labels

`shared_links.recipient_label text` — nullable, `≤ 60` chars. The owner's
own note about who a link is for ("Sitter — Friday"), shown in the Share
tab's live-links list and nowhere else. **The guest never sees it.**

**Named `recipient_label`, not `label`.** `ShareCenterScreen` already
derives a client-side `label` for the *content* name:

```js
links.map((l) => ({ ...l, label: l.packs?.name || l.guides?.name || 'Shared item' }))
```

A column called `label` would be spread in and then immediately
overwritten by that derived field — silently discarded, with no error.
Two different meanings ("what is shared" vs "who it's for") deserve two
names anyway.

Nullable with no backfill: every existing link predates the feature, and
an unlabelled link is a permanent, normal state.

---

## 5. Per-link access log

Two columns — `opened_count integer NOT NULL DEFAULT 0` and
`last_opened_at timestamptz` — plus one RPC.

### 5.1 Why counters on the row, not an events table

| | Counters (chosen) | `share_access_events` table |
|---|---|---|
| Read cost | O(1), already in the links query | aggregate per link, per render |
| Growth | none | unbounded; needs retention |
| RLS surface | none new | a new table to police |
| Privacy | counts only | per-open timestamps let an owner reconstruct *when a specific guest was reading* |
| History | none | full |

Losing history is the real cost, and it's accepted: the prompt asks for
"opened count / last opened — the retention signal owners actually want",
which is exactly two scalars. An events table can be added later
*alongside* these counters without changing them.

**No IP, no user-agent, no visitor id is recorded anywhere.** That is a
deliberate constraint, not an oversight — Prompt 10 commits to "no
third-party analytics SDK — App Store privacy posture stays clean", and a
share link opened by a houseguest is exactly the kind of data that
posture is about.

### 5.2 Why a separate RPC, and why it doesn't break the guest rule

`get_shared_content()` is `STABLE`, and **a `STABLE` function cannot
write**. The counter bump therefore cannot live inside it; it needs a
second, `VOLATILE` function.

The critical constraint is `RBAC.md` §1.2: *the schema has zero `TO anon`
RLS policies, and that is what makes "a guest must never enumerate"
structural rather than policy-dependent.* An anonymous visitor must
increment a counter without gaining any policy-level access to
`shared_links`.

`record_share_access(p_share_id)` mirrors `get_shared_content`'s posture
exactly — `SECURITY DEFINER`, `search_path` pinned, `REVOKE FROM PUBLIC`
then `GRANT EXECUTE TO anon, authenticated`. **No RLS policy is added for
`anon`.** It returns `void` and behaves identically — silently — for a
real id, an expired id, and a nonexistent one, so it cannot be used to
probe which share ids exist.

### 5.3 The counts are approximate, on purpose

```sql
WHERE id = p_share_id
  AND (expires_at IS NULL OR expires_at > now())
  AND (last_opened_at IS NULL OR last_opened_at < now() - INTERVAL '1 minute')
```

- **Expired links don't count.** `get_shared_content` shows them nothing,
  so counting the hit would inflate "opened" with views of an error state.
- **One-minute debounce.** Collapses refreshes and React re-mounts into one
  open, and bounds how fast a bot can dirty the row (each `UPDATE` writes a
  dead tuple). The trade: two different people opening within the same
  minute count once. Acceptable for a retention signal; unacceptable for an
  audit log, which this is explicitly not.
- **Client-invoked, therefore skippable.** A modified client can decline to
  call it. Fine for a signal; it must never become a billing or
  security input.

The client calls it only after content actually resolves
(`PublicSharePage.jsx`), fire-and-forget — a guest's page must never wait
on, or fail because of, an analytics write.

---

## 6. Share-event notifications: integration points only

No push, no email, no infrastructure in this prompt. What the design fixes
is **where** such a thing would attach, so the next prompt doesn't invent a
second pattern.

**The one seam is `record_share_access`.** It is already the single
server-side moment where "someone opened your link" becomes true — the
only such moment in the system. Any future channel hangs off it.

Channel plan, recorded so it isn't re-litigated:

| Channel | Status | Note |
|---|---|---|
| **In-app inbox** | The intended first channel | Prompt 11 owns a `notifications` table as "the ONE seam future channels plug into". Share-open events become rows there. |
| **Web push** | Deferred | `push_subscriptions` already exists (unused by any code today) — the table is there, the delivery isn't. |
| **Email** | Deferred | Existing precedent is `send-family-invite`'s Supabase-Auth path; a digest, not per-open. |
| **Native push** | Not planned yet | Capacitor push would need APNs/FCM setup, out of scope for both this and Prompt 11. |

Two rules the eventual implementation inherits from the existing
re-engagement work (`HomeNudge`, `NAV.md` §3.2) rather than re-deciding:
**in-app only until proven wanted**, and **silence is the default** — a
cold user must stay silent by construction. A "your link was opened"
notification is the most tempting thing in this product to over-send.

**Deliberately not built:** no trigger on `shared_links`, no `pg_net` call,
no queue. A trigger firing per open with nowhere to deliver would be
infrastructure with no consumer.

---

## 7. What shipped, and what's verified

### Migration — `supabase/migrations/20240128_share_labels_access_log.sql`

1. `shared_links_owner_update` policy (§2 — prerequisite *and* bug fix)
2. `recipient_label` + length `CHECK`
3. `opened_count`, `last_opened_at`
4. `record_share_access()` + grants

Additive; every column nullable-or-defaulted. Rollback is `DROP COLUMN` /
`DROP POLICY` / `DROP FUNCTION`.

### UI — all behind `VITE_ENABLE_SHARE_LABELS` (`SHARE_LABELS_ENABLED`), default off

| File | Change |
|---|---|
| `shareExpiry.js` | `expiryFromDateInput`, `dateInputFromExpiry`, opt-in `allowCustom` (§3.1) |
| `ShareScreen.jsx` | Date picker under the presets; "Who is it for" label input (saves on blur) |
| `ShareCenterScreen.jsx` | Shows `recipient_label` and `opened N×` on live links; **column list is flag-conditional** |
| `PublicSharePage.jsx` | Fire-and-forget `record_share_access` after content resolves |

**The flag must stay off until the migration is applied.** It reads and
writes columns and an RPC that don't exist before then. The
`ShareCenterScreen` query is flag-conditional precisely so that selecting
`recipient_label`/`opened_count` — which would 400 pre-migration — never
happens with the flag off. `ShareScreen` uses `select('*')`, so it picks
the columns up automatically and reads `undefined` harmlessly beforehand.

### Verified

- `eslint` clean across all five changed files.
- All three share screens compile against the new flag (checked via the
  dev server's module graph after a reload).
- `SHARE_LABELS_ENABLED` resolves `false` by default.
- `shareExpiry.js` behavior, executed in-browser:
  - legacy `presetFromExpiry(x, now)` — `tonight`→`tonight`,
    `weekend`→`weekend`, a custom date→`weekend`, `null`→`until_off`
    (**identical to before**)
  - opt-in `{ allowCustom: true }` — same three, plus custom date→`custom`
  - `expiryFromDateInput('2026-08-20')` → local `23:59`; round-trips back
    through `dateInputFromExpiry`; invalid input → `null`

### Not verified — be aware

- **The migration has not been applied or executed anywhere.** The Supabase
  project is unreachable (`ERR_CONNECTION_REFUSED` from the running dev
  server), so `record_share_access`, the new policy, and the columns are
  reviewed SQL, not tested SQL.
- **The flag-on UI has never rendered.** It requires both the migration and
  an authenticated session; neither is available.
- **The unit suite could not run** — `vitest` fails identically on a clean
  tree (Node v16.17 vs. rolldown needing `node:util`'s `styleText`, Node
  ≥20.12). `shareExpiry.js` is pure and is the natural place for the tests
  this change deserves, once the runner starts. §3.1's opt-in default is
  the specific thing worth locking down with a test.

---

## 8. Open questions

- **Should `.select()` be added to the existing preset-picker update**
  (`ShareScreen.jsx:172`) so a future RLS gap fails loudly instead of
  silently? One line, strictly better, but it touches an unflagged shipped
  path and this change set can't run the test suite — deliberately left
  alone. The new code paths added here all use `.select('id')`.
- **Should the `1 minute` debounce be tunable?** Hard-coded in SQL today.
- **Does `opened_count` want a per-workspace rollup** for the host KPI
  header (Prompt 8 wants "live guest links" and week-scoped counts)?
  Counters give a lifetime total, not a weekly one — Prompt 8 may need the
  events table §5.1 rejected, and should decide with its KPIs in hand.
- **Should an owner be able to reset a link's counter?** Probably yes when
  re-purposing a link for a new guest; not designed here.
