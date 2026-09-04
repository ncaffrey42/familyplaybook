# The Alfred Owner Loop — the Host Retention Engine

**Status:** Design + one shipped pure module (`hostFreshness.js`, verified).
The retention loop is the host mirror of the family nudges; it ships in the
host shell (`ROLLOUT.md` M3) and gains teeth once Alfred is live (M2/M3).
Deliverable of Prompt 18 (runs after 7 + 16). Read
[`ASK_PLAYBOOK.md`](ASK_PLAYBOOK.md) §3–4 (the capture — and its hard
privacy limit), [`hostCoverage.js` / HOST_TEAMS §2.2] (the coverage engine
this reuses), and `HomeNudge.jsx` (the nudge rules it inherits) first.

---

## 1. The honest problem statement — and a conflict with our own privacy floor

The prompt asks for *"a digest of unanswered guest questions per property,
from Prompt 7's capture."* Building that literally is **impossible under
the privacy decision we already committed to**, and saying so is the point
of this section.

Prompt 7 decision #4 (`ASK_PLAYBOOK.md` §3): **question and answer text are
never stored — counts only.** A babysitter's *"can Ella have peanuts?"* is
health data about a child; `ask_playbook_usage` deliberately holds only
`question_count` and `refusal_count` per link per hour. So there is **no
stored text to digest.** What we captured is: *how many* questions Alfred
couldn't answer, per property, per period — never *what* they were.

A design that quietly started storing question text to satisfy this prompt
would silently reverse a recorded privacy commitment. It won't. Instead:

## 2. The resolution — infer the topic, don't read the question

**The digest is built from refusal *counts* × coverage *gaps*, not stored
text.** We already know two things without storing a single question:

1. **How stumped Alfred was** — `ask_playbook_usage.refusal_count` summed
   over a property's links this week ("Alfred couldn't answer 9 questions
   at Ivy Cottage").
2. **What's probably missing** — `detectPropertyCoverage()` (shipped,
   Prompt 10) names the uncovered host-taxonomy topics for that property
   ("your playbook has no Parking or Trash guide").

Cross-referenced, these produce an actionable digest **without ever
reading a guest's words**:

> **Ivy Cottage** — Alfred was stumped 9 times this week. Your playbook is
> missing **Parking** and **Trash & recycling** — the two things guests
> most often ask that you haven't written. [**Add Parking**] [**Add Trash**]

The refusal count is the *urgency* signal (a property where Alfred never
refuses needs no nudge, however incomplete); the coverage gap is the
*content* signal (what to write). Neither requires the text.

### 2.1 The opt-in path, offered and defaulted OFF

There *is* a version that shows real questions — and `ASK_PLAYBOOK.md`
§3#4 already flagged it as "needing its own consent design." Recorded here
as a deliberate, gated option, **not** built by default:

- **Layer 2 (opt-in, host-only, default off):** an owner may explicitly
  enable storing *refused* question text, with a short retention window
  (recommend 30 days) and a guest-facing notice that the host may see
  unanswered questions. Then the digest shows the actual questions,
  clustered.
- **Recommendation: ship Layer 1 (inference) first; only build Layer 2 if
  owners find the inference too coarse.** And **never enable it for
  family** — child-health-adjacent questions are exactly what §4's floor
  protects. Host guest questions (wifi, parking, late checkout) are
  lower-sensitivity operational text, which is why the opt-in is
  *offerable* for host at all — but it is still opt-in, consented, and
  retention-bounded.

This is the whole tension resolved in the ledger's favor: the default
respects the floor; the escape hatch is consented and bounded.

## 3. The three surfaces

All three are the **host equivalent of `HomeNudge`** and inherit its rules
verbatim (`NAV.md` §3.2): **at most one nudge, server-side dismissals via
`user_dismissals`, in-app only, opt-out respected, silence is the
default** — a host who never opens the app is never contacted. They live on
the host Home/Properties surface, not as push (there is no push infra, and
`SEAMS.md` reserved the seam anyway).

### 3.1 Unanswered-questions digest (§2)
Per property: refusal count + top missing coverage topics, each a one-tap
**"Add it"** that opens the guide editor prefilled from the topic's starter
template — the *exact* `starterTemplate` + `hostContext` `location.state`
path a Starter-Kit guide or a family gap-card uses
(`HomeNudge.jsx:104` → `CreateGuideScreen.jsx:76`). **Zero new
guide-creation code**; the digest just chooses the starter.

### 3.2 Coverage score per property
`detectPropertyCoverage()` — **already shipped** (Prompt 10). The owner loop
*displays* it: a per-property score (e.g. 7/9) and the missing topics, with
the same "Add it" one-tap. The gap-filler logic on the host taxonomy is
done; this surface is presentation, not new logic.

### 3.3 Freshness loop, season-aware (§4)
`hostFreshness.js` — **shipped with this prompt.** The family freshness
loop points at the property's guides with one added dimension: **season**.

## 4. Season-stale — `hostFreshness.js` (shipped, verified)

The family loop (`freshness.js`) surfaces a guide untouched for 90+ days.
That clock is blind to the calendar: a pool guide edited in January is not
"90 days stale" in June, but it is exactly what a host should re-check
before summer guests. So host freshness adds:

- `guideSeason(guide)` — keyword-classifies content to the season it's
  *used* in (pool/beach/AC → summer; heating/fireplace/snow → winter; etc.),
  same deterministic no-AI approach as `gapDetection`/`hostCoverage`.
- `currentSeason(now, hemisphere)` — meteorological season for a date.
- `pickHostFreshnessCandidate()` — **season-stale beats clock-stale**: a
  seasonal guide whose season *is arriving now* and that was *last touched
  in a different season* is the top nudge ("pool guide, last touched in
  winter"). Falls back to plain 90-day staleness for non-seasonal content,
  so an old check-in guide is still caught. Returns at most one, carrying
  `_reason: 'season' | 'stale'` so the card can word itself ("check your
  pool guide before summer" vs "hasn't changed since March").

**Verified** (vitest can't run — Node 16; assertions executed in-browser
against the real module): the pool-in-July case returns `season/summer`;
a guide touched this season is skipped; off-season fresh content is
skipped; non-seasonal 95-day content falls back to `stale`; season
outranks clock; snoozes and empty input handled; never more than one.

### 4.1 Known limitation, recorded
Hemisphere defaults to `north`; a southern-hemisphere host's "summer" is
our "winter." The property has an `address`, so the real fix is deriving
hemisphere from it — deferred (address parsing is its own task), the
`hemisphere` parameter is the seam, and the family loop is unaffected
(family freshness has no season dimension). A wrong-hemisphere nudge is a
mistimed suggestion, never data loss — acceptable until addressed.

## 5. Why this is the retention engine

Quiet, in-app, opt-out-respected — the same discipline that makes the
family nudges welcome rather than nagging (`NAV.md` §3.2). But for a host
the loop closes on *money*: an incomplete playbook means Alfred refuses,
refusals mean guests message the host at 11pm, and a host who stops getting
11pm messages renews. The three surfaces each shorten that loop —
coverage says what's missing, the digest says what guests actually hit,
freshness says what's quietly rotting — and every one ends in the same
one-tap "Add it" that reuses the guide editor. The engine's cost is three
read-only computations over data the product already has; its payoff is the
host equivalent of the family "your playbook has a gap" card that already
drives family re-engagement.

## 6. Files & status

| File | State |
|---|---|
| `src/lib/hostFreshness.js` | ✅ shipped, season-aware, in-browser verified |
| `src/__tests__/hostFreshness.test.js` | ✅ shipped (runner blocked on Node 16) |
| `src/lib/hostCoverage.js` | ✅ already shipped (Prompt 10) — reused |
| `docs/platform/ALFRED_OWNER_LOOP.md` | ✅ this design |
| Owner-loop UI (digest card, coverage meter, freshness card) | 📐 the host `HomeNudge` — surfaces the three signals; built at M3 |
| Refusal-count digest query (`ask_playbook_usage` sum per property) | 📐 reads existing counters; no new table |
| Layer-2 opt-in question capture | 📐 default-off, consented, bounded — build only if inference proves too coarse (§2.1) |

Nothing here stores a guest question. The retention engine runs on counts,
coverage, and the calendar — which is exactly as much as it needs.
