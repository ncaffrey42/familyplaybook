# Spec: AI Handoff Bundle ("Tonight's Sitter Brief")

**Status:** Draft for approval — not yet implemented
**Effort estimate:** ~1–2 focused days (S–M)
**Feature flag:** reuses `VITE_ENABLE_AI_GENERATION`
**Depends on:** the AI entitlement + `ai_generations` ledger, the bundle
(`packs` / `pack_guides`) model, and the existing bundle share flow — all
already shipped.

## 1. What it is

The user picks an occasion ("Babysitter tonight", "Grandparents this weekend",
"House-sitter next week") and, optionally, a note. AI **curates their existing
guides into a ready-to-share bundle** — the right guides for that occasion,
ordered sensibly, with a fitting name and description — that the user reviews
and shares like any other bundle.

The output is a **real, normal bundle** (a `packs` row + `pack_guides`), not a
new snapshot type. It lives in My Bundles, is editable, and shares through the
exact flow that already exists. AI does the *curation and framing*; the app's
proven bundle + share machinery does everything else.

## 2. Why "assemble a bundle" (not a one-page brief)

- **Reuses everything.** Bundles already render on the public share page,
  already have share links, already print, already respect RLS and family
  access. Net-new surface is basically one edge function.
- **Editable & durable.** The user can tweak the assembled bundle (add/remove a
  guide, rename it) before and after sharing — it's not a frozen artifact.
- **Familiar mental model.** "AI made me a bundle for the babysitter" needs no
  new concept; the user already understands bundles and sharing.
- **Still magic.** The value is the *curation*: from 30 scattered guides, AI
  picks the 6 a sitter actually needs and names it "Saturday with the Kids."

## 3. User flow

1. **Entry:** "Assemble a Handoff" (AI-gated) — from the Home screen and/or the
   My Bundles "+" menu.
2. **Occasion picker:** presets (Babysitter, Family/Grandparents, House-sitter,
   Pet-sitter, Travel/Away) + a free-text "Anything they should know?" box.
3. **Scope (optional):** default = consider all the user's guides; optionally
   restrict to a source bundle or a set of categories.
4. **Assembling:** "Picking the right guides…" (~5–10 s).
5. **Review:** lands on the **normal Bundle detail screen** for the newly
   created bundle, with a one-time banner ("AI assembled this for your
   babysitter — add or remove anything, then share"). Everything from here —
   edit, reorder, share link, print — is the existing bundle UI.
6. **Share:** the existing bundle Share button → existing public share page.

## 4. Edge function: `assemble-handoff-bundle`

- **Auth + gating:** `requireUser`; same `ai_generation` entitlement + quota +
  `ai_generations` ledger (`kind: 'handoff_bundle'`) as Voice-to-Guide.
- **Input:** `{ occasion, note?, source_bundle_id?, categories? }`.
- **Gather candidates:** service-role select the user's guides in scope —
  `id, name, category, description` (NOT full steps; keeps the prompt small and
  cheap). Cap at ~60 candidates.
- **Curate:** one `gpt-4o-mini` call with a strict JSON schema:

  ```json
  {
    "bundle_name":        "string ≤ 50 chars, e.g. 'Saturday with the Kids'",
    "bundle_description": "string, 1-2 sentences for the sitter",
    "guide_ids":          ["<subset of the candidate ids, in priority order>"]
  }
  ```

  System prompt per occasion: pick the guides a person in THIS role actually
  needs (a babysitter → bedtime, allergies, emergency contacts, house rules; a
  pet-sitter → feeding, walks, vet); order emergency/medical/contact guides
  first; ignore irrelevant guides; **only choose from the provided candidate
  ids — never invent guides or content.**
- **Validate:** intersect returned `guide_ids` with the candidate set (drop any
  hallucinated ids); require ≥1 valid guide or return a friendly 422.
- **Create the bundle:** insert a `packs` row (name, description, a default
  color/icon) then `pack_guides` rows for the chosen guides. This is the same
  write `handleSaveBundle` performs — consider extracting a shared server path,
  or just replicate the two inserts.
- **Return:** `{ bundle_id }`. The client navigates to the bundle for review.
- **Cost:** one small completion over guide titles/descriptions — sub-cent;
  covered by the same daily/lifetime caps.

## 5. Client

- `src/components/HandoffAssembleSheet.jsx` — occasion picker + note + optional
  scope + "Assemble" button; mirrors `AiGuideSheet` patterns and gating.
- On success: `navigate('/bundle/:id', { state: { aiAssembled: true } })`.
- `BundleDetail` — show a dismissible "AI assembled this…" banner when
  `location.state.aiAssembled`, then it's the normal bundle screen.
- Entry points gated on `AI_GENERATION_ENABLED` + plan entitlement.
- No new share page, no new render layout — bundles already do all of it.

## 6. Optional polish (not required for v1)

- **Guide ordering in bundles.** `pack_guides` has no order column, so the
  AI's priority order isn't currently persistable. If we want emergency guides
  to render first, add `pack_guides.position int` + sort by it (small, additive
  migration). v1 can ship without it (insertion order is close enough).
- **AI-generated cover guide.** If key info (e.g. a single emergency-contacts
  card) is missing, optionally generate one new guide via the existing
  voice-to-guide structuring path and include it. Defer to v2.

## 7. Product decisions (need owner input)

1. **New bundle every time, or update a per-occasion one?** Recommend a new
   bundle each time (cheap, non-destructive), lightly de-duped by name.
2. **Free tier:** count against the 3-generation lifetime taste, or paid-only?
   Recommend counting against the free taste so people feel the magic once.
3. **Scope default:** "all guides" vs "pick a source bundle first." Recommend
   defaulting to all guides with an optional narrow.
4. **Guide ordering (§6):** ship v1 without persisted order, or include the
   small `position` migration now? Recommend without, add later if it matters.

## 8. Testing plan

- Unit (vitest): candidate-id validation (drop hallucinated ids); occasion →
  prompt selection.
- Function (Deno): schema-valid happy path; empty-candidates guard; over-limit
  403; hallucinated-id filtering; "never invent" — assert every returned id
  exists in the candidate set.
- Live E2E: seed ~8 guides across categories → assemble a babysitter bundle →
  assert it's a real `packs` row with sensible `pack_guides` (kid/safety guides
  chosen, unrelated ones excluded) → open the bundle → share via the existing
  flow → anonymous share link renders it.

## 9. Why this is the right second AI feature

Voice-to-Guide fills the library; the Handoff Bundle makes the library *pay
off* — and because the output is a plain bundle, it reuses the AI
entitlement/ledger, the bundle model, the bundle UI, and the entire share
stack. The only genuinely new thing is one curation edge function and a small
picker sheet. Small–Medium effort, outsized differentiation.
