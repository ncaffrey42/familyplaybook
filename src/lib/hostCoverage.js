/**
 * Guide coverage per property — the gap-filler logic pointed at the host
 * taxonomy (docs/platform/HOST_TEAMS.md §3).
 *
 * Same philosophy as gapDetection.js, which this deliberately mirrors:
 * deterministic keyword matching over the property's own guides — no AI, no
 * mystery, no network. A topic is covered when any guide in the property's
 * playbook mentions it by name or description.
 *
 * One intentional difference from detectGaps: an EMPTY playbook reports
 * everything missing (score 0) instead of staying silent. The family rule
 * ("never greet an empty account") exists so a brand-new user isn't nagged;
 * a host who just created a property is in the opposite moment — coverage
 * is the to-do list that walks them to a complete playbook.
 *
 * The nine topics mirror the Host Starter Kit's guides (PROPERTIES.md §4)
 * minus the "Just ask" explainer — that one is meta (it explains the Q&A
 * box) and its absence doesn't leave a guest stranded, so it isn't a
 * coverage essential.
 */

export const HOST_ESSENTIAL_TOPICS = [
  {
    key: 'wifi',
    label: 'Wifi & internet',
    category: 'House',
    match: /wifi|wi-fi|internet|network|router/i,
    starter: {
      name: 'Wifi & internet',
      category: 'House',
      description: 'Network, password, and what to do if it drops.',
      steps: [
        { title: 'Network & password', text: 'The wifi network is ⟨network name⟩ and the password is ⟨password⟩.' },
        { title: 'If it stops working', text: 'The router lives ⟨where⟩ — unplug it for 30 seconds.' },
      ],
    },
  },
  {
    key: 'checkin',
    label: 'Check-in & getting in',
    category: 'Arrival',
    match: /check.?in|arriv|key\b|keys\b|lockbox|lock box|door code|entry|getting in/i,
    starter: {
      name: 'Check-in & getting in',
      category: 'Arrival',
      description: 'Everything between the kerb and the sofa.',
      steps: [
        { title: 'Getting in', text: 'The ⟨lockbox/smart lock⟩ is ⟨where⟩. Code: ⟨code⟩.' },
        { title: 'Check-in from', text: '⟨time⟩. Early arrival? Message us.' },
      ],
    },
  },
  {
    key: 'checkout',
    label: 'Check-out',
    category: 'Departure',
    match: /check.?out|leaving|departure/i,
    starter: {
      name: 'Check-out',
      category: 'Departure',
      description: 'Short and kind — nobody reads a long checkout list.',
      steps: [
        { title: 'Before you go', text: 'By ⟨time⟩: ⟨dishes / towels / windows⟩.' },
        { title: 'Keys', text: 'Leave keys ⟨where⟩.' },
      ],
    },
  },
  {
    key: 'parking',
    label: 'Parking',
    category: 'Arrival',
    match: /parking|park\b|garage|driveway|permit/i,
    starter: {
      name: 'Parking',
      category: 'Arrival',
      description: 'Where the car goes — and where it must not.',
      steps: [{ title: 'Your spot', text: 'Park ⟨where⟩. Avoid ⟨restriction⟩.' }],
    },
  },
  {
    key: 'appliances',
    label: 'Appliances',
    category: 'House',
    match: /appliance|washer|washing machine|dryer|dishwasher|oven|stove|coffee|microwave|heating|thermostat|a\/c|aircon|air.?con/i,
    starter: {
      name: 'Appliances',
      category: 'House',
      description: 'The three machines every guest fights with.',
      steps: [
        { title: 'Coffee', text: '⟨machine type⟩ — ⟨how⟩.' },
        { title: 'Heating / cooling', text: 'The thermostat is ⟨where⟩ — ⟨how⟩.' },
        { title: 'Washer', text: '⟨quick instructions⟩.' },
      ],
    },
  },
  {
    key: 'houserules',
    label: 'House rules',
    category: 'House',
    match: /house rules|rules\b|quiet hours|no smoking|smoking|pets? policy|parties/i,
    starter: {
      name: 'House rules',
      category: 'House',
      description: 'The few things that actually matter here.',
      steps: [{ title: 'The short list', text: '⟨quiet hours⟩ · ⟨smoking⟩ · ⟨pets⟩ · ⟨parties⟩.' }],
    },
  },
  {
    key: 'local',
    label: 'Local picks',
    category: 'Local',
    match: /local|nearby|restaurant|coffee shop|grocer|supermarket|recommend|picks|around here/i,
    starter: {
      name: 'Local picks',
      category: 'Local',
      description: 'Five places, one line each — your list beats any app.',
      steps: [
        { title: 'Food', text: '⟨name⟩ — ⟨why, one line⟩.' },
        { title: 'Essentials', text: 'Nearest grocery: ⟨name, distance⟩.' },
      ],
    },
  },
  {
    key: 'trash',
    label: 'Trash & recycling',
    category: 'Departure',
    match: /trash|garbage|rubbish|recycl|bins?\b|compost|collection day/i,
    starter: {
      name: 'Trash & recycling',
      category: 'Departure',
      description: 'Which bin, where, and when it goes out.',
      steps: [{ title: 'The bins', text: '⟨where⟩. ⟨colour⟩ = ⟨what⟩. Collection: ⟨day⟩.' }],
    },
  },
  {
    key: 'emergencies',
    label: 'Emergencies & contacts',
    category: 'House',
    // Stem 'emergenc' matches both "emergency" and "Emergencies" — the
    // plural was failing the self-coverage invariant (caught by executing
    // it in-browser; the vitest that pins this can't run yet).
    match: /emergenc|urgent|fire|first aid|breaker|fuse|water shut|shut.?off|gas\b|leak/i,
    starter: {
      name: 'Emergencies & important contacts',
      category: 'House',
      description: 'What to do first, and how to reach us fast.',
      steps: [
        { title: 'Reach us', text: '⟨name⟩: ⟨number⟩ — call any time, day or night.' },
        { title: 'Shut-offs', text: 'Water: ⟨where⟩ · Breaker box: ⟨where⟩.' },
        { title: 'Emergency services', text: 'The address here is ⟨full address⟩ — you\'ll need it if you call.' },
      ],
    },
  },
];

/**
 * Coverage report for one property's playbook.
 *
 * @param {Array<{name?: string, description?: string}>} guides — the guides
 *   in the property's bundle (already scoped by the caller; this function
 *   never fetches).
 * @returns {{
 *   covered: typeof HOST_ESSENTIAL_TOPICS,
 *   missing: typeof HOST_ESSENTIAL_TOPICS,
 *   score: number,               // 0..1, covered / total
 *   byCategory: Record<string, {covered: number, total: number}>
 * }}
 */
export function detectPropertyCoverage(guides) {
  const haystacks = (guides || []).map((g) => `${g.name || ''} ${g.description || ''}`);
  const covered = [];
  const missing = [];

  for (const topic of HOST_ESSENTIAL_TOPICS) {
    (haystacks.some((h) => topic.match.test(h)) ? covered : missing).push(topic);
  }

  const byCategory = {};
  for (const topic of HOST_ESSENTIAL_TOPICS) {
    byCategory[topic.category] ??= { covered: 0, total: 0 };
    byCategory[topic.category].total += 1;
  }
  for (const topic of covered) byCategory[topic.category].covered += 1;

  return {
    covered,
    missing,
    score: covered.length / HOST_ESSENTIAL_TOPICS.length,
    byCategory,
  };
}
