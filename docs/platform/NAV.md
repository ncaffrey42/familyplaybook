# Navigation: The 3-Tab Contract

**Status:** Spec, plus **one** flagged UI change (§6 explains why one and
not the permitted two). Deliverable of Prompt 5
([`PLATFORM_PROMPTS.md`](../../PLATFORM_PROMPTS.md)).

Read [`AUTH_FLOWS.md`](AUTH_FLOWS.md) §3 (workspace switcher spec) and
[`TENANCY.md`](TENANCY.md) first. This document **refines** AUTH_FLOWS'
switcher placement — see §4.2.

---

## 1. The nav that ships today, and stays

Three tabs, defined in `BottomNav.jsx:18-22`:

| Tab | Route | Owns |
|---|---|---|
| **Home** | `/home` | Greeting, share card, nudges, recent guides, bundles carousel |
| **Guides** | `/guides` | All guides + bundles + library, via `?segment=` and `?chip=` |
| **Share** | `/share-center` | Family & helpers, per-person visibility, live links |

Two prior consolidations are load-bearing and must not be undone:
Favorites became a **chip** on Guides (`/favorites` → `/guides?chip=pinned`),
and bundles/library became **segments** (`/bundles` → `/guides?segment=bundles`).
Both still exist as redirect routes (`App.jsx:127-131`), so old links and
any cached client bundle keep working.

Account is deliberately **not** a tab — it hangs off the Home header
avatar (`HomeScreen.jsx:92-98`). That is the precedent this document
follows for the workspace switcher (§4): *identity-adjacent chrome lives
in the Home header, not in the tab bar.*

**The constraint for everything below: no 4th tab, ever.** Three tabs is
a shipped, deliberate information architecture; a fourth would be the
easiest possible way to make the family app feel like the platform's
scaffolding leaked into it.

---

## 2. "My Family" in the Share tab — mostly already there

### 2.1 What the Share tab already does

The premise that member management is "buried in Settings → Family &
Friends" is only **half** true, and the half that's already solved should
not be rebuilt. `ShareCenterScreen.jsx` already renders, gated on
`FAMILY_SHARING_ENABLED`:

- A **"Family & helpers" avatar row** (`:171-207`) — every accepted and
  pending member, with initial, name, and role/`invited` status.
- **Per-member visibility management** (`:209-268`) — selecting a member
  opens "X can see", which for a viewer is the full per-item
  `share_grants` checkbox picker (bundles and guides), writing directly
  to `share_grants`.
- An **"+ Invite"** avatar-styled button (`:196-204`).

So *viewing* members and *managing what each can see* are already
first-class in the Share tab. What lives in Settings → Family & Friends
(`/account/family`, `ManageFamilyScreen`) is the **write surface**:
sending an invite, and removing a member.

### 2.2 The actual gap

Both of the Share tab's action affordances **navigate away** to
`/account/family`:

- `:197` — the "+" avatar
- `:262` — "Remove {name}…" inside the selected-member panel

Neither is a visible, unconditional entry point. The "+" reads as *add a
person*, not *manage the family*; and "Remove …" is only reachable after
selecting a member, which itself requires knowing the avatars are
tappable. A user who wants to change or review family membership has no
labelled route to it from the Share tab.

### 2.3 The delta (implemented — §6, Change 1)

Add a **"Manage"** text button in the "Family & helpers" section header,
right-aligned against the `SectionLabel`, navigating to `/account/family`.

This mirrors an existing, proven pattern rather than inventing one —
Home's "Your guides" header carries an identical right-aligned raspberry
text button ("All {n}", `HomeScreen.jsx:137-145`). Same visual grammar,
same interaction, no new component.

**Why not move `ManageFamilyScreen` into the Share tab wholesale:** the
prompt scopes this to *where it surfaces*, and moving a screen means
moving its route, its deep links, its `returnTo` behavior after an invite
accept (`AUTH_FLOWS.md` §1.7), and its Settings entry — a materially
larger change than "make it discoverable", with regression surface across
the invite flow. The screen stays where it is; the Share tab gets a
labelled door to it.

---

## 3. Home card priority — the canonical pattern

Already built. Documented here as the pattern every future card must
follow, per the prompt.

### 3.1 The order, as shipped

Top to bottom in `HomeScreen.jsx`:

```
1. Share card          (:101-132)  — static, ALWAYS renders
2. HomeNudge           (:134)      — AT MOST ONE of:
      2a. gap card          — "Your playbook has a gap"   (completeness)
      2b. freshness card    — "Still accurate?"           (decay)
3. Your guides / bundles carousel
4. Usage nudge         (:198-199)  — only past 50% of the plan cap
```

### 3.2 The rules that make it work

- **Completeness beats decay.** `HomeNudge.jsx:49` — the freshness memo
  returns `null` whenever `gap` is truthy. A missing essential guide is
  worth more than a stale existing one, and the code enforces the
  precedence rather than relying on render order.
- **At most one nudge, ever** (`HomeNudge.jsx:15-18`). Not "one of each".
- **Cadence gates the lower-priority card only.** Freshness additionally
  requires `cadenceAllows()` (max once per 2 weeks) and stamps
  `markPrompted()` at the moment it *actually renders*
  (`HomeNudge.jsx:61-63`) — not when it's computed. A card that loses to
  a gap card doesn't burn the fortnight's budget.
- **Dismissals are server-side** (`user_dismissals`), so no second device
  re-asks. Gap dismissal is permanent (`gap_covered`); freshness is a
  time-boxed snooze (`freshness_snooze`, `SNOOZE_DAYS`).
- **Silence is the default.** Every nudge is individually flagged
  (`GAP_NUDGE_ENABLED`, `FRESHNESS_ENABLED`) and in-app only — no push,
  no email. A cold user is guaranteed silence by construction.

### 3.3 The rule for adding any future card

> A new Home card must either (a) join `HomeNudge`'s exclusive chain with
> an explicit position in the precedence order, or (b) justify why it is
> allowed to co-render with a nudge. Default is (a).

### 3.4 Finding: the "at most one nudge" invariant is narrower than it reads

`HomeNudge`'s doc comment says *"At most ONE quiet nudge on Home, ever"*.
That is true **within** `HomeNudge` — but the **usage nudge**
(`HomeScreen.jsx:198-199`) renders independently, below the guides
section, from a separate condition (`guideCount / guideCap >= 0.5`).

So a user at 50%+ of their cap with an uncovered gap sees **three** cards
on one screen: share card, gap card, usage nudge. Not a bug — the usage
nudge is a plan/billing surface rather than a re-engagement nudge, and it
sits far enough down the page to read as a different thing. But the
invariant is not what the comment claims, and anyone adding a fourth card
on the strength of that comment would be reasoning from a false premise.

Deliberately **not changed here** — the prompt says the priority rules
are already built and asks for them to be documented, and suppressing a
billing-adjacent surface based on a re-engagement card's presence is a
product decision with revenue implications, not a nav cleanup. Recorded
as an open question (§7).

---

## 4. The workspace switcher, without a 4th tab

### 4.1 Why it can't be a tab, and doesn't need to be

A workspace switcher is **not a destination** — it changes the lens on
every existing destination. Tabs are destinations. Precedent already
exists in this codebase for identity-adjacent chrome living in the Home
header rather than the tab bar: Account is reached from the header avatar
(`HomeScreen.jsx:92-98`), not a tab.

### 4.2 Placement: the Home header's workspace name (refines `AUTH_FLOWS.md` §3)

`HomeScreen.jsx:88-90` already renders the workspace's name as the
`<h1>` — today the family name:

```jsx
<h1 className="font-display font-semibold text-[30px] …">{familyName}</h1>
```

For a multi-workspace user, **that heading already is the workspace
label**. So the switcher costs no new chrome: when the user has more than
one workspace, the `<h1>` becomes a disclosure control (name + a small
chevron) that opens the workspace list. When they have one — every
account today, per `ARCHITECTURE.md` §3.1's bijection — it stays exactly
the static heading it is now, byte-identical.

**This refines `AUTH_FLOWS.md` §3**, which placed the switcher in
`AccountLayout.jsx`'s header. Both placements are correct and
complementary, with distinct jobs:

| Surface | Job | Frequency |
|---|---|---|
| **Home header `<h1>`** (primary) | *Switch* — fast, one tap from the app's landing screen | Every session for a multi-workspace user |
| **`AccountLayout` header** (secondary) | *Manage* — see which workspace is active while in settings/billing | Occasional |

`AUTH_FLOWS.md` §3's component contract — visibility rule
(`workspaces.length > 1` → render `null`), a11y (`aria-haspopup="listbox"`,
`aria-expanded`, `role="option"`, `aria-selected`), loading behavior, and
`switchWorkspace(id)` persisting `profiles.last_active_workspace_id` —
applies unchanged to both mount points. One component, two placements.

### 4.3 Why it is not implemented in this prompt

The switcher reads `workspaces` and `workspace_members`. **Neither table
exists** — `ARCHITECTURE.md`'s migrations are designed and unapplied. A
component built now would read from nothing, and by its own visibility
rule would render `null` for 100% of users, forever, until Prompt 8 makes
a second workspace possible.

That is not a flag-gated feature shipping dark; it is dead code with no
data source. It is specified (§4.2, `AUTH_FLOWS.md` §3) and deferred to
the prompt that first creates a second workspace.

---

## 5. What is deliberately unchanged

- **`BottomNav.jsx`** — not touched. No 4th tab, no reordering, no
  relabelling.
- **Route table** — no routes added, removed, or redirected.
- **`ManageFamilyScreen`** stays at `/account/family`, keeps its Settings
  entry (`SettingsScreen.jsx:114`) — §2.3.
- **`HomeNudge` / Home card behavior** — documented (§3), not modified.
- **The Share tab's grants UI** — unchanged. Note it is currently
  unreachable in production for the reason `RBAC.md` §7 documents: no
  code path creates a `viewer` invitation, so the per-item picker at
  `:224-259` never renders. Nothing in this prompt changes that.

---

## 6. UI changes

The prompt permits **at most 2**. One is implemented; the second — the
workspace switcher — is specified but not built, for the reason in §4.3.
Shipping a component that renders `null` for every user against tables
that do not exist would be worse than shipping nothing.

### Change 1 — "Manage" entry point in the Share tab *(implemented)*

| | |
|---|---|
| **File** | `src/pages/share/ShareCenterScreen.jsx` |
| **Flag** | `VITE_ENABLE_SHARE_TAB_MANAGE` → `SHARE_TAB_MANAGE_ENABLED` (`src/lib/featureFlags.js`) |
| **Default** | **Off.** New user-visible surface ships dark, per `PLATFORM_PROMPTS.md` sequencing rule 5. |
| **Change** | A right-aligned "Manage" text button in the "Family & helpers" section header → `/account/family` |
| **Blast radius** | Additive. Flag off ⇒ the rendered output is identical to today, including layout: the header markup only changes shape when the flag is on. |
| **Double-gated** | Sits inside the existing `FAMILY_SHARING_ENABLED` block, so it can never appear when family sharing is off. |

### Change 2 — workspace switcher *(specified, not implemented)*

See §4.2 for placement and §4.3 for why. Its flag question is also already
settled: `AUTH_FLOWS.md` §3 established it needs **no** feature flag,
because `workspaces.length > 1` is a self-gating data condition — a flag
would be redundant with a condition that is already false for everyone.

---

## 7. Verification

Manual, since the change is a single conditional affordance:

| # | Case | Expected |
|---|---|---|
| N1 | `VITE_ENABLE_SHARE_TAB_MANAGE` unset/false | Share tab renders exactly as before — no "Manage", unchanged spacing |
| N2 | Flag true, `VITE_ENABLE_FAMILY_SHARING=true` | "Manage" appears in the Family & helpers header; tapping opens `/account/family` |
| N3 | Flag true, `VITE_ENABLE_FAMILY_SHARING=false` | No "Manage" — the whole section is absent (double-gate holds) |
| N4 | Back-navigation from `/account/family` | Returns to `/share-center` (browser history; no route changes were made) |
| N5 | Home card order, gap present | share card → gap card → guides → (usage nudge if ≥50%) |
| N6 | Home card order, no gap, stale guide, cadence allows | share card → freshness card → guides |
| N7 | Home, gap present *and* stale guide | Gap only; `markPrompted()` **not** called (§3.2) |
| N8 | `BottomNav` | Still exactly 3 tabs |

---

## 8. Open questions

- **Should the usage nudge suppress when a gap/freshness card is
  showing** (§3.4)? Product/revenue call, not a nav call.
- **Should "Remove {name}…" remove inline** rather than navigating to
  `/account/family` where the user must find the person again
  (`ShareCenterScreen.jsx:261-266`)? A papercut; out of scope here.
- **Does the Home-header switcher survive the host shell** (Prompt 8),
  which proposes its own 3-tab nav at `/host`? If a host workspace has a
  different Home, the switcher needs a mount point in both shells — worth
  settling when the host shell is designed, not before.
