/**
 * Gap-filler: notice what a handoff manual is missing, kindly.
 *
 * Deterministic keyword matching over the user's own guides — no AI, no
 * mystery. A topic is "covered" when any guide's name/description mentions
 * it. Surfaced one at a time, only when the user already has ≥1 guide
 * (never greets an empty account), and each topic is permanently
 * dismissible ("We're covered") via user_dismissals.
 */

export const ESSENTIAL_TOPICS = [
  {
    key: 'emergency',
    label: 'Emergency contacts',
    prompt: 'nothing about emergency contacts yet',
    match: /emergency|911|poison|urgent|ICE\b|in case of/i,
    starter: {
      name: 'Emergency contacts',
      category: 'Reference',
      description: 'Who to call, in order, when something goes wrong.',
      steps: [
        { title: 'Us first', text: 'Mom: ___ · Dad: ___' },
        { title: 'Backup adult nearby', text: 'Name, number, and where they live.' },
        { title: 'Doctor & poison control', text: 'Pediatrician: ___ · Poison Control: 1-800-222-1222' },
      ],
    },
  },
  {
    key: 'allergies',
    label: 'Allergies & medical',
    prompt: 'nothing about allergies or medical needs yet',
    match: /allerg|epipen|asthma|medical|condition|diagnos/i,
    starter: {
      name: 'Allergies & medical notes',
      category: 'Reference',
      description: 'What a caregiver must know before snacks and bedtime.',
      steps: [
        { title: 'Allergies', text: 'Who is allergic to what, and how serious it is.' },
        { title: 'What a reaction looks like', text: 'And exactly what to do first.' },
        { title: 'Where supplies live', text: 'EpiPen / inhaler / antihistamine locations.' },
      ],
    },
  },
  {
    key: 'medications',
    label: 'Medications',
    prompt: 'nothing about medications or doses yet',
    match: /medicat|medicine|dose|dosage|pill|prescri|tylenol|ibuprofen/i,
    starter: {
      name: 'Medications & doses',
      category: 'Reference',
      description: 'Exact doses and timing — no guessing.',
      steps: [
        { title: 'Daily medications', text: 'Who takes what, when, and how much.' },
        { title: 'As-needed', text: 'Fever/pain rules: what, at what age/weight, how often.' },
        { title: 'Never give', text: 'Anything that is off-limits in this house.' },
      ],
    },
  },
  {
    key: 'home_basics',
    label: 'Home basics',
    prompt: 'nothing about wifi, locks, or house basics yet',
    match: /wifi|wi-fi|password|alarm|lock|key|thermostat|breaker|garage/i,
    starter: {
      name: 'House basics',
      category: 'Find It',
      description: 'The things every guest asks about in the first hour.',
      steps: [
        { title: 'Wifi', text: 'Network name and password.' },
        { title: 'Doors & locks', text: 'Which door to use, how the lock works, spare key.' },
        { title: 'Lights & thermostat', text: 'Anything non-obvious.' },
      ],
    },
  },
];

/** Topics not covered by any of the user's own guides, in priority order. */
export function detectGaps(guides, dismissedKeys = new Set()) {
  const own = (guides || []).filter((g) => !g.is_shared_with_me);
  if (own.length === 0) return []; // never greet an empty account
  const haystacks = own.map((g) => `${g.name} ${g.description || ''}`);
  return ESSENTIAL_TOPICS.filter(
    (t) => !dismissedKeys.has(t.key) && !haystacks.some((h) => t.match.test(h))
  );
}
