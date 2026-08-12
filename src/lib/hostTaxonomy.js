/**
 * Client mirror of the HOST rows seeded into content_categories by migration
 * 20240130_properties_host_taxonomy (docs/platform/PROPERTIES.md §2).
 *
 * The table is the source of truth for servers and future prompts; this
 * constant exists so the guide editor's category chips don't cost a query on
 * a hot path. The two are kept honest by the E2E's step 0, which fails if
 * they drift. Delete this file when categories become dynamic client-side.
 */
export const HOST_CATEGORIES = [
  { id: 'Arrival', label: 'Arrival' },
  { id: 'House', label: 'House' },
  { id: 'Local', label: 'Local' },
  { id: 'Departure', label: 'Departure' },
];

export const HOST_DEFAULT_CATEGORY = 'Arrival';
