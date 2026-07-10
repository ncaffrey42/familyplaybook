import { v4 as uuidv4 } from 'uuid';

/**
 * Map a voice-to-guide draft (from the edge function) into the exact shape
 * CreateGuideScreen's form state expects. The form's steps carry a single
 * `text` field, so a step's title is folded in as a "Title: text" prefix.
 */
export function mapDraftToForm(draft) {
  if (!draft || typeof draft !== 'object') return null;

  const steps = (Array.isArray(draft.steps) ? draft.steps : [])
    .map((s) => {
      const title = (s?.title || '').trim();
      const text = (s?.text || '').trim();
      const combined = title && text ? `${title}: ${text}` : (text || title);
      return combined
        ? { id: uuidv4(), text: combined, image_url: '', video_url: '' }
        : null;
    })
    .filter(Boolean);

  if (!draft.name || steps.length === 0) return null;

  return {
    guideName: String(draft.name),
    description: String(draft.description || ''),
    category: String(draft.category || 'How To'),
    icon: String(draft.icon || 'FileText'),
    steps,
  };
}
