# Mobile: One Codebase, Two Products, and the Split Decision

**Status:** Decision document — no build. Deliverable of Prompt 12, written
to be read by an acquirer's diligence team as much as by the next engineer.
Read [`HOST_SHELL.md`](HOST_SHELL.md) (the shell boundary this leans on)
and [`AUTH_FLOWS.md`](AUTH_FLOWS.md) §2 (workspace resolution) first.

---

## 1. Now: one binary ships both products

One Capacitor app (`com.familyplaybook.app`) wraps the same Vite `dist/`
the web deploy serves (`capacitor.config.ts` says exactly this). Both
products already live inside it, separated by the one boundary that
matters:

**The shell is the split line.** `HOST_SHELL.md` §1 established `/host` as
a route namespace with its own chrome — nav, header, accent — over shared
everything (auth, `DataContext`, content engine, share links, billing,
RLS). Nothing about mobile changes that; the binary is a WebView around it.

**The workspace switcher decides the shell.** Composing decisions already
on the ledger, none new:

1. Post-login resolution (`AUTH_FLOWS.md` §2): last-active workspace, else
   personal.
2. If the resolved workspace is `host`-type → land at `/host/properties`;
   else `/home`. One conditional in the resolution landing, not a second
   router.
3. The switcher (Home header `<h1>` + Account header, `NAV.md` §4.2) is
   the cross-shell jump: switching to a workspace of the other type
   navigates to that shell's landing tab. This resolves `NAV.md` §8's open
   question — the switcher mounts in *both* shells (host: the KPI header),
   because it is the door between them.
4. Everything is gated exactly as on web — same flags, same
   `useHostWorkspace()` seam, same blockers (`HOST_SHELL.md` §7). Native
   adds zero gating surface.

**Native plumbing is shared, and stays shared until the split:** one
`familyplaybook://` scheme (used only for OAuth deep-links —
`nativeAuth.js`), one push-less notification posture, one RevenueCat
identity (`app_user_id` = Supabase user id — the spine that lets the
webhook reconcile into `user_billing`).

## 2. Later: the clean split path

Ordered so each step is independently shippable and none forecloses the
next.

### 2.1 Two app targets, one repo — package extraction only if earned

Phase A (the actual split): **two Vite entries + two Capacitor configs**
in this repo. `capacitor.host.config.ts` points at a host-entry build
whose bundle omits the family shell (and vice versa); fastlane lanes take
the config as a parameter (the Fastfile is already env-driven with derived
build numbers — parameterizing it is small). No monorepo surgery, no
package boundary, no import rewrites.

Phase B (only if drift demands it): extract `packages/core`
(contexts, lib, UI primitives) with the two apps as thin consumers. This
is deliberately *not* Phase A because a package boundary is a cost paid
daily, and today there is no second team, and no drift, to justify it. An
acquirer should read this as discipline, not debt: the split line is the
shell, already enforced; the package boundary waits for evidence.

### 2.2 Bundle identity: the family id is about to become immutable

`com.familyplaybook.app` has **no App Store listing yet** (fastlane ships
to TestFlight/Play-internal; `VITE_APPSTORE_ID` is blank "once the listing
exists"). The moment the family app first releases publicly, its bundle id
is permanent — ratings, subscribers, and store identity attach to it and
cannot move. Strategy, locked now while it costs nothing:

| | Family | Host |
|---|---|---|
| Bundle id | `com.familyplaybook.app` — keeps the existing id, listing, ratings, subscriber base forever | `com.familyplaybook.host` — born new at split; no history to lose |
| URL scheme | keeps `familyplaybook://` (OAuth deep-links already point at it in the Supabase dashboard) | its own scheme + **prefer universal links / app links** for guest-facing URLs — a printed QR (`HostQrSheet`) must open in the browser for guests *without* the app, which custom schemes get wrong |
| Store listing | "Family Playbook" positioning untouched | Freed to rank for host/rental keywords — which is trigger (a) in §3 |

### 2.3 RevenueCat: one project, two apps, entitlements per product

RevenueCat supports multiple apps in one project sharing an app-user
namespace. The split keeps **one RC project** with both bundle ids
attached, `app_user_id` = Supabase user id throughout — so the
`revenuecat-webhook` → `user_billing` reconciliation
(`DECISIONS.md` 2026-07-16) does not change *at all* at split time.

Entitlements become per-product: family plans grant `family_premium`, host
tiers (Prompt 17's, when they exist) grant `host_premium`. Each app's
paywall reads only its own entitlement; `user_billing.plan_key` continues
to carry the reconciled truth.

**Pre-existing hazard, found while writing this and worth fixing before
any host product exists:** `useNativePurchases.js:89` treats *any* active
entitlement as premium —
`Object.keys(entitlements.active).length > 0`. Correct today (only family
entitlements exist); wrong the day a host entitlement appears, when a
host-only subscriber would read as family-premium on device. The check
must name its entitlement. Small, but it is exactly the kind of latent
cross-product coupling this document exists to surface early.

### 2.4 What the split costs (why not to do it early)

Two review pipelines and two rejection surfaces; two sets of store
metadata, screenshots, privacy labels; icon/splash duplication; double
TestFlight/Play tracks; user confusion for the (initially few) people on
both products. None of this is hard; all of it is *recurring*. It is paid
only when §3 says so.

## 3. The trigger — decided, not deferred

**Split when the FIRST of these holds; do not split before:**

- **(a) Positioning:** the host product needs store-listing keywords,
  name, or screenshots that "Family Playbook" cannot carry — concretely,
  when host acquisition begins to depend on store search rather than
  owner-to-owner referral and share links. This is expected to be the
  trigger that actually fires, and it is a marketing observation, not an
  engineering one.
- **(b) Scale:** host ≥ 1,000 MAU sustained for 60 days, **or** host MRR ≥
  25% of total — either means the recurring cost in §2.4 is noise relative
  to the product it serves.
- **(c) Policy:** App Store review friction from two products in one
  binary (rejection or formal warning). Multi-mode apps are common and
  this is unlikely, but it converts the decision instantly if it happens.

**Explicit non-triggers:** engineering preference, "cleanliness," a
redesign, or the tenancy migrations landing. The one-binary arrangement is
not technical debt to be retired — it is the correct shape until a trigger
fires, *because* the shell boundary already gives the split its seam.

MAU here = distinct users with ≥1 session in a host workspace over 30
days — measurable from first-party session data consistent with the
no-SDK policy (`DECISIONS.md` 2026-08-11); defining the exact query is
deferred to when a host workspace can exist at all.

## 4. Why an acquirer should read this and relax

The question this document answers is "how entangled are the two
products?" The answer: one seam (`useHostWorkspace()`), one split line
(the shell), one shared identity spine (Supabase uid ≡ RC app_user_id ≡
`user_billing` key), a bundle-id strategy locked before it became
expensive, and a split trigger that is a recorded business condition
rather than a future argument. The split, when it happens, is two build
configs and store paperwork — not a rewrite, because nothing was forked.
