# Connect Your Listing — Import, with Honest Constraints

**Status:** Design. No build — this is an architecture + constraints
document (Prompt 16, designed to run after Prompt 9). Read
[`PROPERTIES.md`](PROPERTIES.md) (the property/bundle model it fills),
[`CONTENT_ENGINE.md`](CONTENT_ENGINE.md) §5 (the media debt it inherits),
and `voice-to-guide` (the AI review-before-save contract it reuses) first.

---

## 1. The honest constraint, stated first

**Airbnb has no public content API for third-party developers.** The
former API is partner-gated (property-management-system onboarding,
not open signup), and there is no endpoint that returns a listing's
title/photos/house-rules/amenities to an arbitrary app. Any design that
pretends otherwise is fiction. So v1 is built from what genuinely exists:

| Source | What's actually available | Officially supported? |
|---|---|---|
| Listing **content** (title, photos, rules, amenities) | Only via **owner-initiated fetch of their own public listing page** | ⚠️ No API — grey area, §5 |
| **Calendar** (booked/blocked dates) | **iCal export URL** Airbnb gives every host | ✅ Yes, first-party feature |
| **Address** | Never reliably machine-readable (Airbnb hides it pre-booking) | ❌ Owner types/confirms it |

This asymmetry shapes everything: **the calendar is a real integration;
the content is an owner-assisted import.** The design never blurs the two.

## 2. The three parts

### (a) Paste-your-listing-URL import — owner-consented, owner-confirmed

The owner pastes *their own* listing URL. A server-side fetch retrieves
the **public** page and a parser extracts what it can — title, photo URLs,
house-rules text, amenities list. **Nothing is saved from this step
directly.** Every extracted field lands in a review form the owner edits
and confirms; the address in particular is *entered or corrected by the
owner*, never trusted from the page (Airbnb obscures it anyway).

This is the same trust posture as voice-to-guide: **the machine drafts,
the human commits.** An import that auto-saved scraped data would violate
both that rule and the owner's ability to catch a wrong photo or a stale
rule.

### (b) iCal calendar sync — the real integration

The owner pastes their Airbnb **iCal export URL** (Settings → Availability
→ Export Calendar — a first-party, supported feature). A scheduled fetch
parses `VEVENT`s into booked date ranges stored per property. The payoff
ties directly to `SHARING.md`'s arbitrary-expiry work: **a guest link can
auto-scope to a stay** — created for a booking, its `expires_at` set to
the checkout date from the calendar, no manual date entry. "Send the
Friday guest their link" becomes "the link for the Aug 14–18 booking,
already dated."

iCal is read-only and pull-based — we never write to Airbnb's calendar,
only read the export the owner explicitly shares. Refreshed on a cadence
(Airbnb updates its export periodically, not in real time — a recorded
limitation, not a bug: same-day bookings may lag).

### (c) Structured import wizard — amenities/rules text → draft guides

The free-text blobs from (a) — house rules, amenity descriptions — feed
the **existing AI structuring path** (`voice-to-guide`'s OpenAI
`json_schema` structured-output call, `ALLOWED_CATEGORIES` swapped for the
host taxonomy). Output: draft guides, one per coherent topic ("House
rules" → a House-category guide, "Wifi" pulled from amenities → an
Arrival/House guide).

**The draft reaches the owner through the path that already exists:** the
same `location.state` mechanism `CreateGuideScreen` uses for
`starterTemplate` + `hostContext` (`CreateGuideScreen.jsx:46,54,76`). An
imported guide is a pre-filled editor the owner reviews and saves —
byte-identical to how a Starter-Kit guide or a voice draft arrives. **Same
rule as voice-to-guide, enforced by reusing its exact surface: nothing
persists until the owner taps save.**

## 3. The provider interface — the acquisition story

The crux. v1 targets Airbnb, but Airbnb is modeled as *one implementation
of a provider contract*, so VRBO, a direct/manual entry, or a future deep
partnership slot in without touching the wizard, the property model, or
the guide builder. **This interface is the acquisition story**: it says
"we are not an Airbnb tool, we are a listing-agnostic hosting layer, and
adding a channel is implementing three methods."

```ts
interface ListingProvider {
  readonly id: 'airbnb' | 'vrbo' | 'direct';

  // (a) content — best-effort, owner-confirmed. May return partial.
  fetchListing(url: string): Promise<{
    title?: string;
    photos?: string[];          // urls; owner picks/uploads (media debt, §6)
    houseRulesText?: string;    // free text → wizard (c)
    amenitiesText?: string;     // free text → wizard (c)
    // address deliberately absent — always owner-entered
    confidence: 'full' | 'partial' | 'manual';  // 'manual' = provider can't fetch
  }>;

  // (b) calendar — the real integration. null if the provider has no iCal.
  parseCalendar(icalUrl: string): Promise<Array<{ start: string; end: string }>>;

  // capability probe so the UI shows only what a provider actually supports
  capabilities(): { content: boolean; calendar: boolean };
}
```

- **`airbnb`**: `fetchListing` = owner-consented page fetch (`confidence`
  usually `partial`); `parseCalendar` = iCal; `capabilities` = both.
- **`vrbo`**: same shape, its own parser; slots in with zero wizard
  changes — that's the proof the interface earns its keep.
- **`direct`**: `fetchListing` returns `{confidence: 'manual'}` (owner
  types everything); `parseCalendar` may still accept a generic iCal
  (many direct-booking tools export one). Manual entry is a
  *first-class provider*, not a fallback — an owner with no channel still
  uses the identical wizard.

The property row records which provider connected it and its iCal URL
(additive columns on the 🔶 `properties` table — `provider text`,
`ical_url text`, `external_ref text`; all nullable, all owner-supplied).

## 4. The flow, end to end

```
Owner: "Connect a listing"
  → pick provider (Airbnb / VRBO / I'll enter it myself)
  → [airbnb/vrbo] paste listing URL
        → provider.fetchListing()  (server-side, owner-initiated)
        → REVIEW FORM: title, photos, address(owner-entered), rules, amenities
        → owner edits + confirms  ── nothing saved before this
  → property created (packs bundle + properties row, PROPERTIES.md §1)
  → [optional] paste iCal URL → provider.parseCalendar() → stay dates stored
  → WIZARD: rules/amenities text → AI structuring → draft guides
        → each draft opens in the guide editor (starterTemplate path)
        → owner reviews + saves each  ── same rule as voice-to-guide
  → property has a real playbook in minutes; guest links auto-date from iCal
```

Two edge functions, both **authenticated** (owner-only — this is never an
anonymous surface), both reusing existing patterns:
- `import-listing` — calls the provider's `fetchListing`; returns the
  review payload. Never writes.
- `sync-calendar` — calls `parseCalendar`, upserts stay dates. Scheduled +
  on-demand.

The AI structuring reuses `voice-to-guide`'s quota (`_shared/ai.ts`) — an
import that generates 8 draft guides counts against the owner's AI
allowance exactly like 8 voice drafts, so there's no new metering surface
and no free unlimited-AI backdoor.

## 5. Legal / ToS honesty — recorded, not hidden

The content fetch (2a) is the one genuinely grey area, and a diligence
reader deserves it stated plainly:

- **It is owner-initiated and owner-scoped.** The app fetches only a URL
  the owner pasted, for a listing the owner attests is theirs. No crawling,
  no discovery, no bulk fetch, no fetching listings the owner doesn't own.
- **It reads only the public page** — the same bytes any logged-out
  browser sees. No auth bypass, no private-endpoint access.
- **We cache nothing beyond what the owner saves.** The fetched blob is
  transient; only the owner-confirmed fields persist, as *their* content
  in *their* property.
- **The residual risk:** Airbnb's ToS may restrict automated fetching even
  of one's own listing. Mitigation is the owner-consent framing above, and
  the architecture makes retreat cheap — if a provider's content fetch
  must be disabled, that provider degrades to `confidence: 'manual'`
  (owner types it) with **zero** change to the wizard or property model.
  The calendar integration (2b) is unaffected — iCal export is explicitly
  sanctioned by Airbnb.
- **Never store Airbnb credentials.** The owner never gives us their
  Airbnb login; both the URL and the iCal link are public/exported
  artifacts. This is the hard line — the moment a design needs the owner's
  Airbnb password, it has left the honest path.

## 6. Inherited debt & scope

- **Photos ride the existing media debt** (`CONTENT_ENGINE.md` §5):
  imported photo URLs point at Airbnb's CDN. v1 shows them in review; the
  owner choosing to keep one should copy it into the app's own storage
  (the same private-bucket remediation the whole app owes), not hotlink
  Airbnb forever. Recorded, not solved here.
- **Out of scope:** real-time availability, pricing sync, booking
  management, writing to Airbnb, multi-listing bulk import. v1 is
  one-listing, owner-driven, content-in-not-out.

## 7. Migrations & files (design only — nothing written)

| Artifact | State |
|---|---|
| `properties` gains `provider`, `ical_url`, `external_ref` (nullable) | 📐 additive, ships with the build |
| `property_stay_dates` (property_id, start, end) — iCal parse target | 📐 |
| `import-listing`, `sync-calendar` edge functions | 📐 authenticated, reuse `_shared/ai.ts` quota |
| `ListingProvider` interface + `airbnb`/`vrbo`/`direct` impls | 📐 the acquisition-story seam |
| Wizard UI (provider pick → review → structure) | 📐 reuses `CreateGuideScreen` draft path |

Slots into `ROLLOUT.md` at **M3** (host alpha) — an alpha owner connecting
a real listing is exactly the validation M3 wants. Not a blocker for M3;
an accelerant within it.
