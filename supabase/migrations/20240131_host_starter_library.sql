-- Host Starter Kit — seed for the host starter library.
--
-- Design: docs/platform/PROPERTIES.md §4. One library pack
-- ('pack_host_starter') + ten guides, seeded into the EXISTING
-- library_packs / library_guides tables so the existing copy-to-mine flow
-- (DataContext.handleAddBundleFromLibrary) works with zero new code paths.
--
-- PUBLIC CONTENT WARNING: library_packs and library_guides are
-- world-readable (existing RLS: "Allow public read access" SELECT USING
-- (true)). Nothing sensitive belongs in this seed — every guide is a
-- fill-in-the-blank template with ⟨angle-bracket⟩ placeholders that owners
-- replace after copying the pack into their own account.
--
-- Step shape: each steps element is { "id": "<uuidv4>", "content": "...",
-- "image_url": "", "video_url": "" }. "content" (not "text") is the key
-- CreateGuideScreen PERSISTS on save and the key GuideDetail /
-- PublicSharePage render; copy-to-mine copies steps verbatim, so the seed
-- must match the persisted shape, not the editor's in-memory one.
--
-- Categories use the HOST taxonomy keys seeded by
-- 20240130_properties_host_taxonomy.sql: Arrival / House / Local /
-- Departure. No other keys are valid here.
--
-- Idempotent: ON CONFLICT DO NOTHING on library_packs (PK id) and on
-- library_guides UNIQUE (library_pack_id, name).

-- ---------------------------------------------------------------------------
-- 1. The pack
-- ---------------------------------------------------------------------------

INSERT INTO public.library_packs (id, name, description, color, image)
VALUES (
  'pack_host_starter',
  'Host Starter Kit',
  'Every answer a guest needs, ready in minutes: fill in the blanks and share one link.',
  '#F4A259',   -- brand apricot; no prior library seed exists to match, so this
               -- follows the app palette (src/index.css --accent)
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. The ten guides
-- ---------------------------------------------------------------------------
-- Written for a guest reading under mild stress at 11pm: short sentences,
-- no marketing voice. ⟨Angle brackets⟩ mark the blanks an owner fills in.

-- 2.1 Wifi & internet — House
INSERT INTO public.library_guides (library_pack_id, name, icon, category, description, steps)
VALUES (
  'pack_host_starter',
  'Wifi & internet',
  'Cloud',
  'House',
  'Network name, password, and what to do if it drops.',
  $j$[
    {"id": "de2a844b-7163-4c49-afe3-0ace3102566f", "content": "The wifi network is ⟨network name⟩ and the password is ⟨password⟩.", "image_url": "", "video_url": ""},
    {"id": "aca0020f-ec28-4101-8044-74f4fba59da5", "content": "The router is ⟨where the router lives, e.g. the hall cupboard, top shelf⟩.", "image_url": "", "video_url": ""},
    {"id": "05c22922-7cfc-4df3-9cf5-e4d2454d9c22", "content": "If the wifi drops: unplug the router, wait 30 seconds, plug it back in. It takes about 2 minutes to come back.", "image_url": "", "video_url": ""},
    {"id": "58fe8657-2746-4412-bbf5-808598112258", "content": "Still down after 10 minutes? Message us at ⟨your phone number⟩.", "image_url": "", "video_url": ""}
  ]$j$::jsonb
)
ON CONFLICT (library_pack_id, name) DO NOTHING;

-- 2.2 Check-in & getting in — Arrival
INSERT INTO public.library_guides (library_pack_id, name, icon, category, description, steps)
VALUES (
  'pack_host_starter',
  'Check-in & getting in',
  'Key',
  'Arrival',
  'From the street to the sofa, in order.',
  $j$[
    {"id": "f70f2128-fb21-429e-a4ce-a6e1888b6584", "content": "Check-in is from ⟨time, e.g. 3pm⟩. The address is ⟨full address⟩.", "image_url": "", "video_url": ""},
    {"id": "b4d10ff7-f827-492d-8ea8-816bc76d4bef", "content": "Finding the entrance: ⟨e.g. use the blue door on the left side of the building⟩.", "image_url": "", "video_url": ""},
    {"id": "aa77c6f7-f153-4a39-95b1-71a28c0dba68", "content": "Getting in: ⟨lockbox location and code, door code, or where to collect the keys⟩.", "image_url": "", "video_url": ""},
    {"id": "e631f8fb-8ad4-4221-9022-aaf51ef58974", "content": "Once inside: the light switches are ⟨where⟩, and the heating or AC is ⟨where, and how to set it⟩.", "image_url": "", "video_url": ""},
    {"id": "4b46dc0d-1ce6-4bf9-a0fb-9163e1137db8", "content": "Any trouble getting in, call or text ⟨your phone number⟩.", "image_url": "", "video_url": ""}
  ]$j$::jsonb
)
ON CONFLICT (library_pack_id, name) DO NOTHING;

-- 2.3 Check-out — Departure
INSERT INTO public.library_guides (library_pack_id, name, icon, category, description, steps)
VALUES (
  'pack_host_starter',
  'Check-out',
  'Clock',
  'Departure',
  'What to do before you leave, in order.',
  $j$[
    {"id": "14b751c4-0fa0-4898-93a8-69318572bdd2", "content": "Check-out is by ⟨time, e.g. 10am⟩.", "image_url": "", "video_url": ""},
    {"id": "d19ee6fe-4815-4567-93fd-2f3e0de5558f", "content": "Leave used towels ⟨where, e.g. in the bathtub⟩. Beds: ⟨what you prefer, or leave them as they are⟩.", "image_url": "", "video_url": ""},
    {"id": "1a5bc3c1-4e73-47f8-aa4a-c3b3a65c77ea", "content": "Food: ⟨what to do with leftovers, e.g. bin anything opened; unopened items can stay⟩.", "image_url": "", "video_url": ""},
    {"id": "23bb6580-d949-4f84-87b1-09e49cccc722", "content": "Take the trash to ⟨which bin, where⟩ — details are in the Trash & recycling guide.", "image_url": "", "video_url": ""},
    {"id": "29538c34-0cb4-4355-9955-13f3fd3851d6", "content": "Turn off the lights, close the windows, and set the heating or AC to ⟨setting⟩.", "image_url": "", "video_url": ""},
    {"id": "d2c27507-7ed0-4d16-a9e9-69fb87ebaaf4", "content": "Lock up: ⟨how to lock the door, and what to do with the key⟩. Safe travels.", "image_url": "", "video_url": ""}
  ]$j$::jsonb
)
ON CONFLICT (library_pack_id, name) DO NOTHING;

-- 2.4 Parking — Arrival
INSERT INTO public.library_guides (library_pack_id, name, icon, category, description, steps)
VALUES (
  'pack_host_starter',
  'Parking',
  'Map',
  'Arrival',
  'Where to put the car, and where not to.',
  $j$[
    {"id": "f2cff959-a301-40cd-934e-61da927eee95", "content": "Park at ⟨your spot, e.g. the driveway, or space 12 in the garage⟩.", "image_url": "", "video_url": ""},
    {"id": "d2bf7699-f3fc-435c-aeab-9f69a2497c31", "content": "Permit or code: ⟨e.g. the permit hangs on the kitchen hook — put it on the mirror⟩.", "image_url": "", "video_url": ""},
    {"id": "3bcfd082-b4da-4d93-a789-899a28e960b5", "content": "Do not park ⟨where, e.g. in front of the neighbouring garage⟩ — cars there get towed.", "image_url": "", "video_url": ""},
    {"id": "e95d3a02-d047-4e64-bcb3-71297301f632", "content": "Street parking: ⟨the rules, e.g. free after 6pm and on weekends, metered otherwise⟩.", "image_url": "", "video_url": ""}
  ]$j$::jsonb
)
ON CONFLICT (library_pack_id, name) DO NOTHING;

-- 2.5 Appliances — House
INSERT INTO public.library_guides (library_pack_id, name, icon, category, description, steps)
VALUES (
  'pack_host_starter',
  'Appliances',
  'Zap',
  'House',
  'The machines, and their quirks.',
  $j$[
    {"id": "ac754463-4936-4b3f-a6ea-f4fb16e152a2", "content": "Washer and dryer: ⟨where they are, and the setting that works, e.g. the Mixed program⟩.", "image_url": "", "video_url": ""},
    {"id": "cea3e5bf-0ea0-48c1-94a8-b6c458d2644f", "content": "Dishwasher: tablets are ⟨where⟩. ⟨Any quirk, e.g. hold the start button for 3 seconds⟩.", "image_url": "", "video_url": ""},
    {"id": "abe3edae-ab7d-4619-9477-11f7ea5b9323", "content": "Coffee: the machine takes ⟨pods or grounds⟩, kept ⟨where⟩.", "image_url": "", "video_url": ""},
    {"id": "78e5da0a-e325-49ef-9288-05214248cc0f", "content": "TV: ⟨how to turn it on and reach the streaming apps, e.g. the small remote, then the Home button⟩.", "image_url": "", "video_url": ""},
    {"id": "b19c4204-a75d-4430-8fad-22efc689969d", "content": "Oven and stove: ⟨anything non-obvious, e.g. the front-left burner runs hot⟩.", "image_url": "", "video_url": ""}
  ]$j$::jsonb
)
ON CONFLICT (library_pack_id, name) DO NOTHING;

-- 2.6 House rules — House
INSERT INTO public.library_guides (library_pack_id, name, icon, category, description, steps)
VALUES (
  'pack_host_starter',
  'House rules',
  'Book',
  'House',
  'The short list that keeps everyone happy.',
  $j$[
    {"id": "3a3732d4-c5ee-4ad6-98ad-a033e4de969c", "content": "Quiet hours are ⟨times, e.g. 10pm to 8am⟩ — the neighbours are close.", "image_url": "", "video_url": ""},
    {"id": "e2b366b4-ca1d-41d6-8b01-e0628305e359", "content": "Smoking: ⟨your policy, e.g. not inside; the balcony ashtray is fine⟩.", "image_url": "", "video_url": ""},
    {"id": "d1ce263f-931b-4012-be47-3591dd0cd31d", "content": "Pets: ⟨your policy⟩.", "image_url": "", "video_url": ""},
    {"id": "9fe88bc7-f3b3-4a7a-b566-33a080e09ddf", "content": "Visitors beyond your booking: ⟨your policy, e.g. day visitors welcome, no extra overnight guests⟩.", "image_url": "", "video_url": ""},
    {"id": "6eab87eb-d6d4-4fe3-b09e-0dd62f4f84d0", "content": "One thing that really matters to us: ⟨e.g. please keep the piano closed⟩.", "image_url": "", "video_url": ""}
  ]$j$::jsonb
)
ON CONFLICT (library_pack_id, name) DO NOTHING;

-- 2.7 Local picks — Local
INSERT INTO public.library_guides (library_pack_id, name, icon, category, description, steps)
VALUES (
  'pack_host_starter',
  'Local picks',
  'Compass',
  'Local',
  'Our short list: food, coffee, and essentials nearby.',
  $j$[
    {"id": "ea8e5300-390a-44ab-ac99-2b389b336472", "content": "Groceries: ⟨nearest store and how far, e.g. Spar, 5 minutes on foot⟩.", "image_url": "", "video_url": ""},
    {"id": "3f0fd36d-5f64-4694-8517-bf4ca0abf098", "content": "Coffee and breakfast: ⟨your favourite spot⟩.", "image_url": "", "video_url": ""},
    {"id": "892cedf8-d04f-42d2-8106-3f19faa171cd", "content": "Dinner we always recommend: ⟨restaurant, and why in a few words⟩.", "image_url": "", "video_url": ""},
    {"id": "4e0c596e-72e8-43ad-a5f3-7801d712fe81", "content": "Pharmacy: ⟨nearest one, and its hours⟩.", "image_url": "", "video_url": ""},
    {"id": "6315e443-0db8-4a42-8b5f-15c693c170f6", "content": "One thing worth doing: ⟨the local thing guests thank you for⟩.", "image_url": "", "video_url": ""}
  ]$j$::jsonb
)
ON CONFLICT (library_pack_id, name) DO NOTHING;

-- 2.8 Trash & recycling — House
-- Category call: House, not Departure. Guests generate trash from day one
-- ("where do the bins go?" is an 11pm day-two question, not a leaving-day
-- one); the Check-out guide carries the departure-day trash step and points
-- here for the details.
INSERT INTO public.library_guides (library_pack_id, name, icon, category, description, steps)
VALUES (
  'pack_host_starter',
  'Trash & recycling',
  'Calendar',
  'House',
  'Which bin, where the bins live, and collection days.',
  $j$[
    {"id": "620eb24f-f17e-4613-a182-5ca907821bdb", "content": "The bins are ⟨where, e.g. in the shed by the side gate⟩.", "image_url": "", "video_url": ""},
    {"id": "c0841759-8b1e-4cb0-821d-71dabc66c147", "content": "General waste goes in the ⟨colour⟩ bin. Recycling goes in the ⟨colour⟩ bin — ⟨what your area recycles, e.g. paper, glass, rinsed plastic⟩.", "image_url": "", "video_url": ""},
    {"id": "6ac97442-ee78-40be-8187-c062a2023949", "content": "Collection day is ⟨day⟩. ⟨What guests should do, if anything, e.g. bins out by 7am if you are up; otherwise we handle it⟩.", "image_url": "", "video_url": ""},
    {"id": "82475ccf-5dcb-4158-ab0f-6c6f86aab849", "content": "If a bin is full: ⟨what to do, e.g. spare bags are under the sink; tie the bag and set it beside the bin⟩.", "image_url": "", "video_url": ""}
  ]$j$::jsonb
)
ON CONFLICT (library_pack_id, name) DO NOTHING;

-- 2.9 Emergencies & important contacts — House
-- The host taxonomy has no Emergency key (Arrival / House / Local /
-- Departure only) and this migration must not invent one — emergency-first
-- ordering is a family-taxonomy feature (content_categories 'family'
-- rows). House is the closest host category: it is where things about
-- this home live.
INSERT INTO public.library_guides (library_pack_id, name, icon, category, description, steps)
VALUES (
  'pack_host_starter',
  'Emergencies & important contacts',
  'Shield',
  'House',
  'Who to call and where things are if something goes wrong.',
  $j$[
    {"id": "3195a769-29b7-4b1c-8bba-d57d480de335", "content": "Emergency services: ⟨the local emergency number, e.g. 112 or 911⟩.", "image_url": "", "video_url": ""},
    {"id": "4805b952-ce18-43cd-98a3-e80298b3388b", "content": "Reach us any time: ⟨your name and phone number⟩. Backup local contact: ⟨name and number, if any⟩.", "image_url": "", "video_url": ""},
    {"id": "22cf5350-4fc7-40f3-87cb-2704f079af3e", "content": "The first-aid kit is ⟨where⟩. The fire extinguisher is ⟨where⟩.", "image_url": "", "video_url": ""},
    {"id": "0c6fb479-a108-480b-8ee0-0a239636ccf7", "content": "Water shut-off: ⟨where⟩. Electrical panel: ⟨where⟩.", "image_url": "", "video_url": ""},
    {"id": "9c0f5cf8-a763-4c47-8ea8-e0f8dcf52cf8", "content": "Nearest urgent care or hospital: ⟨name and address⟩.", "image_url": "", "video_url": ""}
  ]$j$::jsonb
)
ON CONFLICT (library_pack_id, name) DO NOTHING;

-- 2.10 Just ask — Arrival (guests should see it first)
-- The guest-facing intro to the Q&A box. The never-stored claim repeats
-- ASK_PLAYBOOK.md §3 decision #4 exactly: counts only, question and answer
-- text are never persisted. Kept honest — it promises answers from these
-- guides, and says the box declines rather than guesses.
INSERT INTO public.library_guides (library_pack_id, name, icon, category, description, steps)
VALUES (
  'pack_host_starter',
  'Just ask',
  'Smile',
  'Arrival',
  'Type a question about this home and get an answer from these guides.',
  $j$[
    {"id": "c79694c1-9be9-4a68-a5d4-87f3280c3eed", "content": "Stuck on something? On this page you can type a question — like \"what's the wifi password?\" or \"where do the bins go?\" — and get an answer.", "image_url": "", "video_url": ""},
    {"id": "bde539e8-c535-4a78-a13a-10b159032683", "content": "Answers come only from this home's guides. If the answer isn't written down here, it will say so instead of guessing.", "image_url": "", "video_url": ""},
    {"id": "59677214-a378-4865-8419-14113b64c549", "content": "Nothing you ask is stored. Questions and answers are never saved.", "image_url": "", "video_url": ""},
    {"id": "c6e05097-4889-41fb-b947-4c826fb5f28d", "content": "For anything urgent, or anything the guides can't answer, contact us at ⟨your phone number⟩.", "image_url": "", "video_url": ""}
  ]$j$::jsonb
)
ON CONFLICT (library_pack_id, name) DO NOTHING;
