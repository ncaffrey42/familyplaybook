# Host Shell — the second app shell

**Status:** Design + **skeleton routes** behind `VITE_ENABLE_HOST_PRODUCT`
(default off). Deliverable of Prompt 8. Read [`NAV.md`](NAV.md) (the family
nav contract this deliberately does *not* touch), [`TENANCY.md`](TENANCY.md)
and [`ASK_PLAYBOOK.md`](ASK_PLAYBOOK.md) first.

---

## 1. What "second app shell" means here

One codebase, one build, one Supabase project, one design system. The host
product is a **route namespace with its own chrome**, not a second
application:

| | Family | Host |
|---|---|---|
| Route namespace | `/` | `/host` |
| Bottom nav | `BottomNav` (Home / Guides / Share) | `HostBottomNav` (Properties / Guides / Team) |
| Accent | `raspberry` | `apricot` |
| Header | greeting + share card | **KPI header** (§4) |

Everything below the shell is shared: auth, `DataContext`, the content
engine, share links, Ask the Playbook, billing, RLS. Prompt 12 owns the
question of whether these ever become two store binaries; nothing here
forecloses it, because the split line is already the shell.

## 2. Nav: Properties / Guides / Team

Derived from what a short-term-rental owner actually does on a loop:

> guest books → **send them the link** → they arrive → **they ask things** →
> they leave → **cleaner turns it over** → next guest

Three recurring jobs, in frequency order:

1. **"Someone arrives Friday — make sure they can get in and find things."**
   Per-property, highest frequency. → **Properties**
2. **"Keep the information right across N places."** → **Guides**
3. **"My cleaner needs the bin day; my co-host needs everything."**
   → **Team**

### 2.1 Why guest links are *not* a tab (the real difference from family)

The family app makes **Share** a tab because sharing is the recurring
action and there is only one household to share — the link is global.

For a host the recurring action is the same, but a link is **meaningless
without its property**: "send the guest the link" is always *"send the
Ivy Cottage link, dated Fri–Sun"*. Issuing it from a global Share tab would
force the owner to re-select the property every time — re-entering context
the app already had.

So links live **inside a property**, and the KPI header surfaces the
aggregate ("4 live guest links") for the "is everything running?" glance.
Same reasoning the family app used to collapse Favorites into a chip
(`NAV.md` §1): a destination that always needs an argument isn't a
destination.

### 2.2 Why the dashboard is a header, not a fourth tab

`NAV.md`'s constraint — no 4th tab — applies with equal force here. The KPIs
answer "is everything running?", which is a **glance**, not a place you
navigate to. It rides on top of Properties (the landing tab), exactly as
the family Home header carries the greeting and account avatar.

## 3. Gating: three layers, only one of which is real today

| Layer | Mechanism | Status |
|---|---|---|
| 1. Build flag | `VITE_ENABLE_HOST_PRODUCT`, default off | ✅ **real** |
| 2. Workspace type | `workspace_type = 'host'` | ⛔️ **stub** — `workspaces` does not exist |
| 3. Capability | `has_capability(workspace_id, …)` | ⛔️ **stub** — `RBAC.md` unapplied |

**Only layer 1 is enforceable today, and it is sufficient for the
requirement that B2C users never see any of this** — with the flag off the
routes redirect and the shell is never mounted.

Layers 2 and 3 are the honest gap. `useHostWorkspace()`
(`src/hooks/useHostWorkspace.js`) is the **single seam** where they land:
today it returns `{ ready, isHost }` derived from the flag alone, with the
real query written in a comment. When `ARCHITECTURE.md` migration #1 lands,
that hook changes and nothing else does. Writing the gate as a hook now —
rather than sprinkling `if (flag)` through five components — is the whole
point of building the skeleton before the tenancy.

**A host workspace cannot exist yet**, so with the flag *on* every account
is treated as host-eligible. That is fine for a dark, default-off shell and
would be a serious bug the moment the flag ships. §7 records it as the
release blocker it is.

## 4. KPI header — only what existing tables can answer

The constraint was "no new analytics infra". Nothing here adds a table, a
counter, or an event; each KPI is a query against something already
committed.

| KPI | Source | Query | Available today? |
|---|---|---|---|
| **Active properties** | `packs` | count of the owner's bundles | ✅ |
| **Live guest links** | `shared_links` | count where `expires_at IS NULL OR expires_at > now()` | ✅ |
| **Questions answered this week** | `ask_playbook_usage` | `sum(question_count − refusal_count)` over the last 7 days, for links the owner holds | ⛔️ needs migration `20240129` |

**"Active properties" leans on Prompt 9's convention** that a property *is*
a bundle (one bundle per property, on the existing content engine). Until
Prompt 9 ships, this counts bundles — which for a host workspace is the
same number, and for a family workspace would be meaningless, which is
exactly why layer-2 gating matters.

**"Questions answered" is deliberately `question_count − refusal_count`.**
The raw question count would flatter the feature: a link where Alfred
refused twenty times looks identical to one where it answered twenty. The
owner-facing number should only count questions that actually helped —
and this is also the signal Prompt 18's "unanswered questions" digest
inverts. `ask_playbook_usage` is RLS'd so an owner can already read the
counters for their own links (`ask_usage_owner_select`), so no new policy
is needed.

**Each KPI degrades independently to "—" on error**, so a missing migration
shows one dash rather than an empty header or a crash.

## 5. Brand: same system, one swapped accent

No new palette. The host shell swaps the **primary accent** from
`raspberry` (#C25065) to `apricot` (#F4A259) — both already in
`tailwind.config.js`, both already paired with `mulberry` surfaces and
`cream` type in the family app.

Why apricot: it is the warm, hospitality-adjacent token, it already appears
as the accent on `mulberry` headers (the "Shared with you" eyebrow on the
public share page), and — unlike `coral`, the other candidate — it carries
no semantic load. `coral` means *destructive* in this codebase (the
"Remove {name}…" affordance in the Share tab), so promoting it to a
product's primary accent would poison that meaning.

Everything else is unchanged: type scale, radii, `bg-card`/`border-card-border`,
`shadow-card`, `font-display`. A host owner should recognise this as the same
software, differently addressed.

## 6. What shipped

**`HOST_SHELL.md`** (this file) + skeleton routes, all behind the flag:

| File | Role |
|---|---|
| `src/hooks/useHostWorkspace.js` | The gating seam (§3) |
| `src/components/HostBottomNav.jsx` | Properties / Guides / Team, apricot accent |
| `src/pages/host/HostShell.jsx` | Layout: KPI header + `<Outlet/>` + nav |
| `src/pages/host/HostKpiHeader.jsx` | The three KPIs (§4) |
| `src/pages/host/HostProperties.jsx` | Skeleton — Prompt 9 fills it |
| `src/pages/host/HostGuides.jsx` | Skeleton — reuses the content engine |
| `src/pages/host/HostTeam.jsx` | Skeleton — Prompt 10 fills it |
| `src/App.jsx` | `/host/*` routes + nav suppression |

Each skeleton screen states *in the UI* which prompt fills it in, so the
shell is legible when the flag is flipped internally rather than looking
broken.

**`App.jsx` changes are two lines of behavior**: the `/host/*` route block
(a `Navigate` to `/home` when the flag is off), and adding `/host` to the
existing nav-suppression check so the family `BottomNav` never renders
under the host shell. With the flag off, the rendered output for every
existing route is unchanged.

## 7. Not built, and the release blockers

1. **Workspace-type gating is a stub** (§3). With the flag on, *every*
   account is host-eligible. The flag must not ship until
   `ARCHITECTURE.md` migration #1 lands and `useHostWorkspace()` reads
   `workspace_type` for real.
2. **Nothing creates a host workspace.** Prompt 9 (properties) and the
   `/login?vertical=host` entry point (`AUTH_FLOWS.md` §5) are the two
   paths that will.
3. **The KPI header has never rendered against real data** — the third KPI
   needs an unapplied migration, and nothing is deployed.
4. **`HostMode.jsx` still exists** at `/host-mode` behind
   `VITE_ENABLE_HOST_MODE` — the non-functional mockup (`featureFlags.js`
   calls it that). Two host flags is one too many. It is deliberately left
   alone here (deleting a shipped route is not a skeleton's job), but it
   should be retired when `/host` becomes real; its QR-to-a-404 behavior is
   strictly worse than the new shell's honest empty states. Recorded in §8.

## 8. Open questions

- **Retire `HostMode.jsx` / `VITE_ENABLE_HOST_MODE`** when `/host` becomes
  real (§7.4). It is a mockup whose QR points at a route that does not
  exist.
- **Does the workspace switcher mount in the host shell too?** `NAV.md`
  §4.2 puts it on the family Home header's `<h1>`. The host shell's
  equivalent is the KPI header. Both, presumably — settle it when a second
  workspace can exist.
- **Should "Guides" in the host shell be per-property or global?** Skeleton
  assumes global (all guides across properties, filterable), because a
  host's "check-out instructions" guide is often shared across units.
  Prompt 9 should confirm against real host content.
- **Team is empty until Prompt 10.** Whether it reuses
  `family_invitations` verbatim or needs the org-level invites from
  `AUTH_FLOWS.md` §4 depends on whether a host org has >1 workspace, which
  Prompt 9 decides.
