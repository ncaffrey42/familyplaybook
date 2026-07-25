# Handoff: Family Playbook — mobile app redesign

## Overview

A full-app mobile redesign for **Family Playbook** (`ncaffrey42/familyplaybook`), covering 11 screens
across two modes. It does two things:

1. **Restructures navigation** — 5 bottom tabs collapse to 3 + a FAB, and sharing is promoted from a
   buried icon to a top-level destination.
2. **Applies the v1 brand kit** (Fraunces + Nunito Sans, Mulberry / Raspberry / Coral / Apricot /
   Blush / Cream) to the whole app, replacing the current soft-blue Tailwind theme.

The redesign is grounded in the existing repo: same data model (`guides`, `packs`, `pack_guides`,
`shared_links`, `user_favorites`), same entitlement service, same plan keys. **No backend changes are
required** to ship it.

---

## About the design files

The files in this bundle are **design references written in HTML** — a streaming prototype that shows
intended look, layout and behaviour. They are **not production code to copy**.

The target codebase is **React 18 + Vite + TailwindCSS 3 + shadcn/ui + Framer Motion + lucide-react +
React Router 6** (see `technical_specification.txt` in the repo). The task is to **recreate these
designs in that environment** using its established patterns: Tailwind utility classes driven by the
CSS variables in `src/index.css`, shadcn primitives from `src/components/ui/`, `framer-motion` for
transitions, `lucide-react` for icons, and `useNavigation()` / React Router for navigation.

Do not port the inline styles from the prototype. Instead:
- put the palette into `src/index.css` as HSL CSS variables and `tailwind.config.js` as named colors,
- then write components with Tailwind classes.

## Fidelity

**High fidelity.** Colors, type, spacing, radii, copy and interaction states are final and should be
matched closely. The one intentional placeholder is the QR code on the share screen (striped box) and
bundle cover imagery, which is a solid colour cap rather than a photo.

---

## Design tokens

### Colour (from `uploads/family-playbook-brand-kit/05-brand-guide/brand-guide.html`)

| Token | Hex | Role |
|---|---|---|
| Mulberry | `#5C2A3E` | Headings, primary text, dark surfaces, helper-mode header |
| Raspberry | `#C25065` | **The one action colour** — primary buttons, FAB, progress fill, active tab, section labels |
| Coral | `#F0705A` | Urgent/emergency only (call button, usage meters near cap) |
| Apricot | `#F4A259` | "The player dot" — logo dot, plan checkmarks, one guide category, notification dot |
| Blush | `#F6DFD3` | Soft surfaces: secondary buttons, segmented-control track, callouts, intro blocks |
| Cream | `#FDF8F3` | The page background |
| Ink | `#3D2530` | Reserved (body copy uses `#5E3D4C`) |

Derived values used throughout (all sampled from the kit, not invented):

| Purpose | Hex |
|---|---|
| Card surface | `#FFFFFF` |
| Card border | `#F0E2D8` |
| Row divider inside cards | `#F6EBE3` |
| Body copy | `#5E3D4C` |
| Secondary / muted copy | `#A9798A` |
| Placeholder + chevron | `#C9A6B2` / `#D8B9C4` |
| Unchecked checkbox ring | `#E3CFC4` |
| Progress / meter track | `#F1E0D6` |
| Blush-on-blush copy | `#8A5A45` |
| Raspberry hover | `#A83E53` |
| Mulberry hover | `#47202F` |
| Coral hover | `#DC5A44` |
| Row hover tint | `#FEFAF7` |
| Emergency card bg / border | `#FDEEE9` / `rgba(240,112,90,.3)` |
| Apricot halo (guide icon) | `#FDEEE0` |
| Raspberry halo (guide icon) | `#F7DEE3` |
| Mulberry halo (guide icon) | `#EEE0E5` |
| Coral halo (guide icon) | `#FBE0DA` |

Suggested `src/index.css` additions (light mode):

```css
:root {
  --background: 27 60% 97%;      /* #FDF8F3 cream */
  --foreground: 333 38% 26%;     /* #5C2A3E mulberry */
  --card: 0 0% 100%;
  --card-foreground: 333 38% 26%;
  --primary: 348 46% 54%;        /* #C25065 raspberry */
  --primary-foreground: 27 60% 97%;
  --secondary: 21 55% 90%;       /* #F6DFD3 blush */
  --secondary-foreground: 22 33% 41%;
  --muted: 21 55% 90%;
  --muted-foreground: 337 18% 57%; /* #A9798A */
  --accent: 30 86% 65%;          /* #F4A259 apricot */
  --accent-foreground: 30 63% 22%;
  --destructive: 9 82% 65%;      /* #F0705A coral */
  --border: 24 45% 90%;          /* #F0E2D8 */
  --input: 24 45% 90%;
  --ring: 348 46% 54%;
  --radius: 1.125rem;            /* 18px */
}
```

### Typography

Two families, both already on Google Fonts, loaded together:

```
https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Nunito+Sans:wght@400;600;700;800&display=swap
```

**Fraunces (serif) — headings only.** `font-weight: 600`. Used for: screen titles, guide names on the
detail screen, plan names, helper-mode guide list titles and step titles, the "done" celebration line.

**Nunito Sans — everything else.** 400 body, 600 sub-labels, 700 buttons/row titles/section labels.

| Role | Family / weight | Size | Line height | Notes |
|---|---|---|---|---|
| Screen title (h1) | Fraunces 600 | 29–30px | 1.15 | Mulberry |
| Screen subtitle | Nunito 400 | 14.5px | 1.4 | `#A9798A` |
| Guide detail title | Fraunces 600 | 25px | 1.2 | |
| Dark card title | Fraunces 600 | 20px | 1.25 | Cream on Mulberry |
| Section label | Nunito 700 | 10.5–11px | 1 | `letter-spacing:.13em`, uppercase, Raspberry |
| List row title | Nunito 700 | 16.5px | — | Mulberry, truncate 1 line |
| List row meta | Nunito 400 | 13.5px | — | `#A9798A` |
| Checklist step | Nunito 700 | 16px | — | Mulberry; `#A9798A` + line-through when done |
| Step body | Nunito 400 | 14px | 1.55 | `#7A5A68` |
| Body copy | Nunito 400 | 14.5px | 1.6 | `#5E3D4C`, `text-wrap: pretty` |
| Primary button | Nunito 700 | 15–15.5px | — | |
| Tab label | Nunito 700 | 10.5px | — | |
| Pill/tag | Nunito 700 | 10px | — | `letter-spacing:.08em`, uppercase |
| Share code | Nunito 700 | 24px | — | `letter-spacing:.14em` |

**Helper mode steps up one scale:** row titles Fraunces 19–20px, step body 16.5px/1.6, intro 17px,
minimum row height 68px.

### Spacing, radius, shadow

- Screen horizontal padding: **22px** (24px in helper mode). Top padding **56–62px** to clear the status bar.
- Vertical rhythm: 10px between list rows, 12px between cards, 26–28px between sections.
- Radius: cards and rows **18px**, larger containers **20–22px**, all buttons and chips **999px (pill)**,
  guide icon **999px (circle)**.
- Shadows — one only: `0 1px 2px rgba(92,42,62,.04)` on cards. FAB gets
  `0 8px 20px -6px rgba(194,80,101,.7)`.
- Hover on rows/cards: `border-color` to `#E0C6B8` + `translateY(-1px)`. On Android use a ripple instead.

---

## Navigation model (the structural change)

**Today:** 5 tabs — Home, Guides, Bundles, Favorites, Account — plus Home has its own
Bundles/Library tab strip, plus a separate `/library` route. Four destinations point at the same
content and a user must understand guides-vs-bundles-vs-library before finding anything.

**New:** 3 tabs + FAB.

| Tab | Route | Contents |
|---|---|---|
| Home | `/home` | Greeting, tonight's handoff card, "Your guides" (pinned), bundles carousel, usage nudge |
| Guides | `/guides` | Segmented control: **Guides / Bundles / Library** — one search field, one filter row |
| Share | `/share` (new) | Your team, what each person sees, duration, generate link |

- **FAB** (raspberry, 60px, bottom-right, 22px inset, sits 110px up to clear the tab bar) → create.
  Shown on Home and Guides only.
- **Favorites is retired as a destination.** It becomes "Pinned" — the Home list — plus a "Pinned"
  filter chip on Guides. Keep the `user_favorites` table and the heart toggle; only the tab goes.
- **Account moves to the avatar** in the Home header (top-right, 38px Mulberry circle).
- `/library`, `/bundles`, `/favorites`, `/packs` should **redirect** into the Guides screen with the
  right segment preselected, so existing links and the legacy pack routes keep working.

Migration notes for `src/components/BottomNav.jsx`: replace the 5-item array with 3; active state is
`/home` | `/`, `/guides`|`/library`|`/bundles`, `/share`. Keep the `framer-motion` `layoutId`
indicator if desired, but the redesign relies on colour alone (`#C25065` active, `#C9A6B2` inactive).
Keep the `.pb-safe` fix — the new bar uses 32px bottom padding on iOS.

---

## Screens

### 1. Home — `/home`

Purpose: answer "what do I need right now" in one screen.

Layout, top to bottom, single column, 22px padding:

1. **Header row** (space-between, 26px bottom margin) — left: "Good morning," (Nunito 400 16px,
   `#A9798A`) over "The Caffreys" (Fraunces 600 30px, Mulberry). Right: 38px Mulberry avatar circle,
   cream initial, → `/account`.
2. **Tonight card** — Mulberry `#5C2A3E`, radius 20px, 20px padding, 28px bottom margin. A decorative
   110px circle of `rgba(253,248,243,.06)` bleeds off the top-right corner (`overflow:hidden`).
   Contents: apricot uppercase label "TONIGHT · 6–11PM", Fraunces 20px cream "Ana is sitting", body
   `rgba(253,248,243,.72)`, then two buttons in a row — primary raspberry pill "One link for Ana"
   (`flex:1`) → Share, and `rgba(253,248,243,.12)` pill "Review" → bundle detail.
   *This card is data-driven and should only render when a scheduled handoff exists — see Open
   questions.*
3. **"YOUR GUIDES"** section label + "All 14" ghost link → Guides.
4. **Guide rows** — 4 of them, 10px gap. White, 18px radius, 1px `#F0E2D8` border, 15/16px padding.
   Row = 42px circular halo containing a 15px solid dot, then title (Nunito 700 16.5px) over meta
   (Nunito 400 13.5px `#A9798A`). No chevron. Whole row tappable.
5. **"BUNDLES"** label + horizontal carousel, 12px gap, bleeding to the screen edges (negative 22px
   margins with matching padding). Cards 158px wide: a 30px solid colour cap, then name + meta.
6. **Usage nudge** (only when past 50% of the plan cap) — blush `#F6DFD3`, 18px radius, "9 of 15
   guides on Free" + "See plans" link, and a 6px coral meter on a `rgba(138,90,69,.18)` track.

### 2. Guides — `/guides`

Purpose: one place for everything the family has written.

- **Sticky header** (`rgba(253,248,243,.95)` + `backdrop-filter: blur(12px)`, 1px `#F0E2D8` bottom
  border): title + subtitle, then the segmented control, then the search field.
- **Segmented control** — blush track, 4px padding, pill; active segment is cream `#FDF8F3` with
  Mulberry text; inactive transparent with `#A9798A`. Three segments: Guides / Bundles / Library.
  Title and subtitle change per segment ("Guides · 14 guides · newest first", "Bundles · Group guides
  for a sitter, a season, a trip.", "Library · Ready-made guides you can copy and edit.").
- **Search** — white pill, 1px border, 15px magnifier stroked `#C9A6B2`, placeholder "Search your
  playbook" / "Search the library". Wire to the existing `searchGuides` / `searchBundles` helpers.
- **Filter chips** (Guides segment only) — All / How to / Find it / Reference / Pinned. Selected =
  Mulberry fill, cream text. Unselected = white, `#F0E2D8` border, `#5E3D4C` text.
- **Guides / Library segments** render the same row component as Home. Library rows additionally show
  a raspberry "Add" affordance on the right (maps to `handleAddGuideFromLibrary`; long-press or a
  detail view offers "Add & edit").
- **Bundles segment** renders full-width cards: 34px colour cap, then name (Nunito 700 17px) + meta,
  followed by an outlined raspberry pill "New bundle".
- 100px bottom padding so the FAB never covers the last row.

### 3. Bundle detail — `/bundle/:id`

- **Raspberry header block** `#C25065`, 58/22/24px padding: a back button ("‹ Bundles",
  `rgba(255,255,255,.85)`), Fraunces 27px white title, then `rgba(255,255,255,.8)` meta
  ("3 guides · bedtime, meals, emergency"). The header colour should come from the bundle's own
  `color` field so each bundle feels distinct; fall back to raspberry.
- **Actions row** — raspberry pill "Share with a helper" (`flex:1`) + blush pill "Edit".
- **"IN ORDER"** label, then numbered guide rows (`01`, `02`… in Nunito 700 13px `#D8B9C4`, 16px
  wide) with the same halo/dot/title/meta structure. Order comes from `pack_guides.position`.

### 4. Guide detail / checklist — `/guide/:id`

The most-used screen. Purpose: work through something without losing your place.

- **Sticky header** — back chevron (11×18, Mulberry, 2.2 stroke), title block (Fraunces 25px + meta
  "5 of 7 done · out the door by 7:40" that recomputes live), and a **pin toggle rendered as the brand
  heart-route mark** (20px, dashed stroke, apricot dot always). Pinned = raspberry stroke +
  `rgba(194,80,101,.12)` fill; unpinned = `#D8B9C4` stroke, no fill. This replaces the lucide heart —
  it is the logo, and it makes "pinned" feel like the product.
- **Progress bar** — 7px, `#F1E0D6` track, raspberry fill, `transition: width .3s ease`.
- **Optional intro** — blush block, 18px radius, `#7A4A38` text. Renders from `guides.description` /
  `content.intro` when present.
- **One white card holds every step** (18px radius, dividers `#F6EBE3`, not one card per step):
  26px circular checkbox (2px `#E3CFC4` ring → filled raspberry with a white tick when done), title,
  optional right-aligned time chip (Nunito 600 12px `#C9A6B2`), and optional body paragraph.
  Done state: `#A9798A` text + line-through, row bg `#FDF8F3`.
- **"Mark all done"** raspberry pill below the card; once complete it becomes a blush "Start over".
- **Completion block** — blush, Fraunces 19px "Out the door." + a line about helpers seeing it.
- Step check state is local UI state today; consider persisting per-day in `localStorage` keyed by
  guide id + date so a morning survives a backgrounded app.

### 5. Editor — `/guide/:id/edit`, `/guide/new`

- Header: ghost "Cancel" / raspberry pill "Save".
- Title input styled as text, Fraunces 26px, 1.5px `#EFDDD2` bottom border, no box.
- "KIND OF GUIDE" label + three pills; selected = raspberry fill/white, unselected = blush/`#A9798A`.
  Maps to `guides.category` (`How To` / `Find It` / `Reference`).
- Steps in one white card, each row a 15px three-line drag handle (`#E5CFC4`) + title. Reorder writes
  step order back into the `steps` JSONB.
- Dashed `#E0C6B8` pill "Add a step".
- **AI helper — one quiet row, not a hero.** White card: 34px `#FDEEE0` circle with a 12px apricot dot,
  "Say it, I'll write the steps" + "Talk it through or type a sentence", and a blush **COUPLE** pill
  when the user's plan lacks `ai_generation`. Tapping expands a transcript block, a Mulberry
  "Turn into N steps" button, and a raspberry mic affordance (wire to `useVoiceRecorder`), with the
  reassurance "You see every step before anything saves." Gate through
  `entitlementService.canPerform`; on denial route to `/plans` rather than showing a toast.

### 6. Share / Your team — `/share`

Replaces the buried share icon. Purpose: give one person exactly what they need, for exactly as long
as they need it.

1. Fraunces 29px "Your team" + "Everyone sees only what you share."
2. **Avatar row**, 18px gap, horizontally scrollable. 56px circles: Mulberry/N, Raspberry/K,
   Apricot/G, plus a 2px dashed raspberry "+ Invite". Selected person gets a double ring:
   `box-shadow: 0 0 0 3px #FDF8F3, 0 0 0 5px #C25065`. Name below in Nunito 600 12.5px.
3. **"<Person> can see"** white card — bulleted list (8px dots cycling raspberry / apricot / mulberry)
   of the guides and bundles that person has, plus a raspberry text link "Change what <Person> sees".
   Contents change with the selected avatar; an editor (Kate) shows "Everything — Kate is an editor".
4. **"FOR HOW LONG"** — three selectable cards: *Tonight* ("Closes itself at midnight"),
   *This weekend* ("Fri 5pm until Sun 8pm"), *Until I switch it off* ("Host Mode · for a regular
   sitter or a live-in") which carries a blush **FAMILY** pill and routes to `/plans` when locked.
   Selected card: `#FDF3F5` bg, raspberry 1.5px border.
5. Raspberry pill "Send <Person> a link" (or "Invite a helper"), then "No app, no account needed on
   their end."

Implementation: writes `shared_links` (already exists) with an expiry; "Until I switch it off" is the
existing Host Mode, gated on the `host_mode` feature of the Family plan.

### 7. Link ready — `/share/:shareId` (owner view)

- Ghost "Done" → Home.
- Centred **brand heart-route mark** (52px, raspberry, apricot dot), Fraunces 25px "Ana's all set",
  meta "Sitter Night In · live 5pm until midnight".
- White card, 22px radius: 148px QR (striped blush placeholder in the prototype — generate a real one),
  the code `7K4-P29` in Nunito 700 24px tracked `.14em`, and the URL in 13px `#A9798A`.
- Raspberry "Text it to Ana" (`navigator.share` / SMS intent) + blush "Copy".
- A row "See what Ana sees / Opens helper mode" → the read-only view.
- Text-only raspberry "Turn this link off now" (destructive but calm — no red alert styling).

### 8. Account — `/account`

- Back to Home, 60px Mulberry avatar + Fraunces 22px name + email.
- **Plan card**: Fraunces 19px "Free plan" + raspberry "Upgrade" pill, then three meters (6px,
  `#F1E0D6` track): Guides 9/15 coral, Bundles 2/3 coral, People with access 1/1 raspberry. Numbers
  must come from `plan_entitlements` via `EntitlementService` — never hard-coded.
- **Rows card** with blush/apricot/neutral tag pills: Your team (3 PEOPLE), Host Mode (FAMILY),
  Live links (1 LIVE), Appearance (AUTO), Export everything (JSON).
- Outlined "Sign out" pill.

### 9. Plans — `/plans`

- Ghost "Not now".
- Fraunces 27px, two lines: "Start free. / Grow when you're ready." Sub-line names the actual reason
  the user arrived ("You're at 9 of 15 guides…").
- Three cards. Header row: Fraunces 20px name, then (badge +) price. **Couple** carries a blush
  `MOST LOVED` pill and a 1.5px raspberry border; the others `#F0E2D8`.
  Features are apricot check marks + 14.5px copy. CTAs: blush disabled "Current plan", raspberry
  "Choose Couple", Mulberry "Choose Family".
- Closing reassurance: "Guides you've already written stay readable forever, even back on Free."
  This is the humane face of the read-only enforcement already in
  `20240103_readonly_tier_enforcement.sql` — the copy must stay true to it.

### 10–11. Helper mode (read-only guest view) — `/share/:shareId` public

A deliberately different surface. No tab bar, no FAB, nothing editable.

**Helper home:**
- **Mulberry header block**: the reverse-cream heart mark (34px), apricot uppercase "SHARED WITH YOU ·
  UNTIL MIDNIGHT", Fraunces 30px cream "Nora & Theo", address in `rgba(253,248,243,.7)`.
- **Emergency card first** — `#FDEEE9` with `rgba(240,112,90,.3)` border: "IF SOMETHING'S WRONG" in
  `#C4472E`, a full-width coral **Call Nick** pill (min-height 56px, name 17px + number 13.5px), and a
  white pediatrician row including the allergy note.
- "TONIGHT, IN ORDER" + large guide rows: 48px halo, 17px dot, Fraunces 19px title, 14.5px meta,
  chevron, min-height 68px.
- Closing blush note: "You can't change anything in here, so tap freely. This link closes itself at
  midnight."

**Helper guide:** sticky "‹ All of tonight" + Fraunces 27px title + 8px progress bar with "3 of 5"
beside it. Intro at 17px/1.6. Steps are **separate cards** (20px radius, 12px gap, min-height 68px)
with 32px checkboxes, Fraunces 20px titles and 16.5px bodies. Completion block in blush, Fraunces 21px.

Helper-mode check state should be ephemeral and never write to the owner's data, except optionally a
single "bedtime done" ping.

---

## Interactions & behaviour

- **Navigation**: tab taps, FAB → create, rows → detail, back buttons. Preserve the existing
  `useNavigation()` indirection and lazy routes; add the `/share` route and the redirects listed above.
- **Transitions**: screens fade in (`opacity 0 → 1`, 250ms ease). Expanding panels and completion
  blocks slide up 8px over 300ms. Progress bars animate `width` 300ms ease. Keep it this restrained —
  the current build's staggered per-row entrance animations make lists feel slow on re-entry and
  should be dropped.
- **Hover** (desktop/PWA only): rows lift 1px and darken their border; buttons darken one step.
- **Press**: `scale(0.97)` is fine via Framer Motion `whileTap`.
- **Checkbox toggle** is optimistic and instant; progress + meta text recompute from the checked set.
- **Loading**: skeleton rows at the real 18px radius and 70px height, blush shimmer — not grey.
- **Empty states**: no sad-face icons. Use the heart-route mark, one Fraunces line, one action.
- **Errors**: coral, inline, sentence case, always with a next step.
- **Locked features** never dead-end: they route to `/plans` with context.
- **Touch targets** ≥ 44px everywhere; helper mode ≥ 56px.

## State

Per screen: `screen`/route, `segment` (guides|bundles|library), `chip` filter, `searchTerm`,
`checkedSteps: number[]`, `isPinned`, `aiPanelOpen`, `selectedPerson`, `selectedBundles: string[]`,
`duration`. Everything else already exists in `DataContext`, `EntitlementContext` and
`UsageTrackingContext` — this redesign adds no new global state.

## Assets

- **Brand kit**: `uploads/family-playbook-brand-kit/` — logos (landscape / stacked / mark / app icons,
  SVG + PNG), plus `05-brand-guide/brand-guide.html` which is the source of truth for colour, type and
  usage rules. Ship the SVGs; they are outlined, so no font install is needed.
- **The heart-route mark is used inline as UI** (pin toggle, share success, helper header). Its path
  is in the brand guide; keep the dash pattern and the apricot dot exactly — the guide forbids
  changing either.
- **Guide icons**: the prototype deliberately uses a coloured dot in a tinted halo instead of a
  lucide glyph, matching the marketing screenshots. Category → colour: How to = raspberry, Find it =
  apricot, Reference = mulberry, Emergency = coral. If you keep `GuideIcon.jsx` and its lucide
  lookup, restyle it to this circular halo and repoint `categoryColors` at the brand palette.
- **Bundle covers**: solid colour caps from `packs.color`. `BundleImage.jsx` still handles uploaded
  covers; its fallback should become the colour cap rather than a tinted icon.
- **QR** on the share screen is a placeholder — generate a real one.
- **Fonts**: Fraunces + Nunito Sans from Google Fonts. Remove the Inter import in `src/index.css`.

## Files in this bundle

| File | What it is |
|---|---|
| `Family Playbook — Mobile.dc.html` | The prototype. Open in a browser. Turn 2 is the on-brand build; turn 1 keeps the navigation rationale. Toggle Parent / Helper mode above the phone and use the screen index to jump. |
| `ios-frame.jsx` | Device bezel used by the prototype. Reference only — not part of the app. |
| `support.js` | Runtime the prototype needs to render. Reference only. |
| `brand-guide.html` | The v1 brand guide, copied from the kit. Source of truth for colour and type. |

## Open questions for the product owner

1. **Plan naming conflict.** The WordPress site promises *up to 5 active guides* on Free and a single
   *Premium* tier. The app enforces *15 guides* across *Free / Couple $6.99 / Family $13.99*
   (`src/lib/plans.js` + `plan_entitlements`). The prototype follows the code. These must be
   reconciled before launch — same promise on both surfaces.
2. **Does the Home "tonight" card need a calendar?** "Ana is sitting tonight" requires either a
   scheduled-handoff record or a calendar integration. Without one, the card should fall back to a
   generic "Share your playbook" prompt rather than inventing a plan.
3. **Should helpers be able to write back?** ("Theo didn't eat much.") Small feature, likely large
   retention effect, currently out of scope.
4. **Is the Library a browse destination or onboarding scaffolding?** The redesign bets on the latter
   by making it a segment rather than a tab. If it is meant to be browsed regularly, it needs its own
   surface again.
