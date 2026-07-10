import { describe, it, expect } from 'vitest';
import { mapDraftToForm } from '@/lib/aiDraft';

describe('mapDraftToForm', () => {
  const validDraft = {
    name: 'Cat Feeding',
    description: 'Portion sizes and timing.',
    category: 'How To',
    icon: 'Heart',
    steps: [
      { title: 'Morning Feed', text: 'One scoop of dry food at 7 AM.' },
      { title: '', text: 'Fresh water daily.' },
      { title: 'Treats', text: '' },
    ],
  };

  it('maps a full draft to the form shape', () => {
    const form = mapDraftToForm(validDraft);
    expect(form.guideName).toBe('Cat Feeding');
    expect(form.description).toBe('Portion sizes and timing.');
    expect(form.category).toBe('How To');
    expect(form.icon).toBe('Heart');
    expect(form.steps).toHaveLength(3);
  });

  it('folds step titles into the text field', () => {
    const form = mapDraftToForm(validDraft);
    expect(form.steps[0].text).toBe('Morning Feed: One scoop of dry food at 7 AM.');
    expect(form.steps[1].text).toBe('Fresh water daily.'); // no title → text alone
    expect(form.steps[2].text).toBe('Treats');             // no text → title alone
  });

  it('gives every step a unique id and empty media fields', () => {
    const form = mapDraftToForm(validDraft);
    const ids = form.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    form.steps.forEach((s) => {
      expect(s.id).toBeTruthy();
      expect(s.image_url).toBe('');
      expect(s.video_url).toBe('');
    });
  });

  it('drops empty steps entirely', () => {
    const form = mapDraftToForm({
      ...validDraft,
      steps: [{ title: '', text: '' }, { title: 'Real', text: 'step' }],
    });
    expect(form.steps).toHaveLength(1);
  });

  it('returns null for unusable drafts', () => {
    expect(mapDraftToForm(null)).toBeNull();
    expect(mapDraftToForm('nope')).toBeNull();
    expect(mapDraftToForm({ name: '', steps: [{ title: 'a', text: 'b' }] })).toBeNull();
    expect(mapDraftToForm({ name: 'No steps', steps: [] })).toBeNull();
  });

  it('defaults category and icon when missing', () => {
    const form = mapDraftToForm({ name: 'X', steps: [{ title: 'a', text: 'b' }] });
    expect(form.category).toBe('How To');
    expect(form.icon).toBe('FileText');
  });
});
