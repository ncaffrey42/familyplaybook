# Spec: AI Handoff Sheet ("Tonight's Sitter Brief")

**Status:** Draft for approval — not yet implemented
**Effort estimate:** ~2–3 focused days (M)
**Feature flag:** reuses `VITE_ENABLE_AI_GENERATION`
**Depends on:** the share-link RPC (`get_shared_content`), the AI entitlement +
`ai_generations` ledger, and the guide/bundle data model — all already shipped.

## 1. What it is

The user picks an occasion ("Babysitter tonight", "Grandparents this weekend",
"House-sitter next week") and, optionally, which guides or bundles matter.
AI assembles their scattered guides into **one prioritized, at-a-glance brief**
— emergency info first, then routines, then the "good to know" quirks — and
publishes it as a **share link and printable page**.

This is the product's core promise made real: it turns a *library of guides*
into a *moment of magic* for the person actually holding the fort. It's
inherently viral — every sitter who opens it sees "Made with Family Playbook",
and no competitor does this today.

## 2. Why it's different from bundle-sharing

Sharing a bundle today just lists guides. A handoff sheet:
- **Reorders by urgency for a caregiver**, not by how the owner filed things
- **Synthesizes across guides** — pulls the vet number, the wifi password, the
  allergy note into a single "Emergency & Essentials" block even though they
  live in three different guides
- **Adapts tone to the occasion** — a babysitter brief leads with bedtime and
  allergies; a house-sitter brief leads with the alarm code and the plants
- Is **a snapshot** — generated for a date, not a live-editable guide, so the
  sitter can't accidentally change anything

## 3. User flow

1. **Entry:** "Create Handoff Sheet" — from the Home screen and/or a bundle's
   overflow menu. (AI-gated, same as Voice-to-Guide.)
2. **Occasion picker:** a few presets (Babysitter, Family/Grandparents,
   House-sitter, Pet-sitter, Travel/Away) + a free-text "Anything they should
   know?" box (e.g. "kids have a dentist appt at 4, don't forget").
3. **Source selection:** default = "everything shareable"; optionally narrow to
   a bundle or hand-pick guides. Show which guides will be included.
4. **Generating:** "Assembling the brief…" (~5–15 s).
5. **Review:** the generated sheet renders in-app (editable title + a light
   review — the user can remove a section or regenerate). Prominent **Share
   link** + **Print** + **Copy** actions.
6. **Live sheet:** the share link opens the existing public share page,
   rendered in a new "handoff" layout — clean, print-friendly, phone-first.

## 4. Data model

Two changes, both additive (no breaking migration).

### 4.1 New table `handoff_sheets`

```sql
CREATE TABLE public.handoff_sheets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        text NOT NULL,          -- "Weekend with the Grandparents"
  occasion     text NOT NULL,          -- preset key: babysitter | family | housesitter | petsitter | travel
  intro        text,                   -- 1-2 sentence warm opener
  sections     jsonb NOT NULL,         -- ordered [{ heading, priority, items:[{label, detail}] }]
  source_guide_ids uuid[] DEFAULT '{}',-- provenance (for "regenerate" + analytics)
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz            -- optional auto-expiry (see §7)
);
ALTER TABLE public.handoff_sheets ENABLE ROW LEVEL SECURITY;
-- owner full access; anon reads ONLY via the share RPC (never direct select)
CREATE POLICY handoff_owner_all ON public.handoff_sheets
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

`sections` is a rendered snapshot, so the sheet stays stable even if the
underlying guides change later. Example:

```json
[
  { "heading": "🚨 Emergency & Essentials", "priority": 1, "items": [
      { "label": "Our cells", "detail": "Mom 555-0100 · Dad 555-0142" },
      { "label": "Poison Control", "detail": "1-800-222-1222" },
      { "label": "Peanut allergy", "detail": "Ella — EpiPen in the hall closet" } ] },
  { "heading": "🌙 Bedtime", "priority": 2, "items": [ ... ] },
  { "heading": "📶 Good to know", "priority": 3, "items": [
      { "label": "Wifi", "detail": "Network: Nest · Pass: familyplay22" } ] }
]
```

### 4.2 Extend `shared_links`

```sql
ALTER TABLE public.shared_links
  ADD COLUMN handoff_id uuid REFERENCES public.handoff_sheets(id) ON DELETE CASCADE;
```

A share link now points at a guide, a bundle, **or** a handoff sheet — the same
unguessable-id sharing model, so no new public surface.

### 4.3 Extend `get_shared_content` RPC

Add a branch: when `shared_links.handoff_id` is set, return
`{ type: 'handoff', handoff: { title, intro, sections, occasion } }`. Anonymous
visitors still reach it only through the exact link id — consistent with the
security model we already shipped.

## 5. Edge function: `generate-handoff`

- **Auth + gating:** `requireUser`; same `ai_generation` entitlement + quota +
  `ai_generations` ledger (`kind: 'handoff'`) as Voice-to-Guide.
- **Input:** `{ occasion, note?, guide_ids?, bundle_id? }`.
- **Gather:** service-role select the chosen guides (or all shareable guides,
  or a bundle's guides) for the user — name, category, description, steps.
  Cap at ~40 guides to bound the prompt.
- **Synthesize:** one `gpt-4o-mini` call with a strict JSON schema
  (`{ title, intro, sections[] }`), system prompt tuned per occasion:
  - Lead with an **Emergency & Essentials** section: contacts, medical/allergy
    info, addresses, alarm/lock codes — pulled from ANY guide.
  - Then occasion-appropriate routines, then "good to know".
  - **Never invent** contacts, doses, codes, or names — extract only what the
    guides contain (same guardrail as Voice-to-Guide).
  - Keep it to one screen/page: merge, don't dump; prefer 3–6 sections.
- **Persist:** insert `handoff_sheets` row + a `shared_links` row with
  `handoff_id`; return `{ share_id, handoff }`.
- **Cost:** one completion over guide text — a few cents; covered by the same
  daily/lifetime caps.

## 6. Client

- `src/components/HandoffWizard.jsx` — occasion picker → source selection →
  generate → review, mirroring the AiGuideSheet patterns.
- `src/pages/handoff/HandoffReview.jsx` (or a screen) — post-generation review
  with Share/Print/Copy and a "Regenerate" button.
- `PublicSharePage` — add a `type === 'handoff'` layout: print-optimized
  (`@media print` styles, `window.print()` button), sections rendered as
  priority-ordered cards, the "Made with Family Playbook" footer CTA.
- Entry points gated on `AI_GENERATION_ENABLED` + plan entitlement.
- Reuse `mapDraftToForm`-style sanitization for the sections payload.

## 7. Product decisions (need owner input)

1. **Expiry:** should a sitter link auto-expire (e.g. 7 days after the
   occasion) so old briefs with the alarm code don't linger? Recommend an
   optional expiry with a sensible default per occasion; owner can revoke
   anytime (needs the share-link revocation UI — small, worth adding here).
2. **Regeneration vs snapshot:** keep the snapshot immutable and offer
   "Regenerate" (new version), or make it re-pull live guides each open?
   Recommend snapshot (predictable for the sitter, and privacy-safer).
3. **Free tier:** counts against the 3-generation lifetime taste, or handoff
   sheets are paid-only (stronger upsell)? Recommend counting against the free
   taste so people feel the magic once.
4. **Sensitive data surface:** these briefs concentrate alarm codes, allergies,
   addresses. Confirm we want a visible "anyone with the link can view — share
   carefully" notice, optional expiry, and easy revoke.

## 8. Testing plan

- Unit (vitest): section-payload sanitization; occasion → prompt selection.
- Function (Deno): schema-valid happy path; empty-guides guard; over-limit 403;
  "never invent" — feed guides with no phone number, assert none appears.
- Live E2E: seed 3 guides (feeding, bedtime, wifi) → generate babysitter sheet
  → assert Emergency section leads and pulls across guides → open share link
  anonymously → print layout renders.

## 9. Out of scope (later)

- Multiple saved handoff templates per household
- Scheduling ("text this link to the sitter at 5pm") — pairs with the existing
  scheduled-tasks capability
- QR code on the printed sheet (the app already depends on `qrcode.react`)
- Voice input for the occasion note (reuse `useVoiceRecorder`)

## 10. Why this is the right second AI feature

Voice-to-Guide fills the library; the Handoff Sheet is what makes the library
*pay off*. It reuses everything already built — the AI entitlement/ledger, the
share-link RPC, the public share page — so the net-new surface is one table
column, one table, one edge function, and one render layout. Medium effort,
outsized differentiation.
