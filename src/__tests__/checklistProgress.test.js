import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  dayKey,
  loadProgress,
  saveProgress,
  pruneProgress,
} from '@/lib/checklistProgress';

const TODAY = new Date(2026, 7, 5, 9, 0, 0);

describe('checklistProgress', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips today\'s checked steps', () => {
    saveProgress('guide:abc', [1, 3], TODAY);
    expect(loadProgress('guide:abc', TODAY)).toEqual([1, 3]);
  });

  it('keeps each guide\'s progress separate', () => {
    saveProgress('guide:abc', [1], TODAY);
    saveProgress('guide:def', [2, 4], TODAY);
    expect(loadProgress('guide:abc', TODAY)).toEqual([1]);
    expect(loadProgress('guide:def', TODAY)).toEqual([2, 4]);
  });

  it('starts tomorrow fresh — a checklist is a thing you do today', () => {
    saveProgress('guide:abc', [1, 2], TODAY);
    const tomorrow = new Date(2026, 7, 6, 9, 0, 0);
    expect(loadProgress('guide:abc', tomorrow)).toEqual([]);
  });

  it('clears the entry when everything is unchecked', () => {
    saveProgress('guide:abc', [1], TODAY);
    saveProgress('guide:abc', [], TODAY);
    expect(window.localStorage.getItem(`fp:checklist:guide:abc:${dayKey(TODAY)}`)).toBeNull();
    expect(loadProgress('guide:abc', TODAY)).toEqual([]);
  });

  it('returns an empty list for a missing scope', () => {
    expect(loadProgress(null, TODAY)).toEqual([]);
    expect(loadProgress('guide:never-saved', TODAY)).toEqual([]);
  });

  it('survives malformed stored data instead of throwing', () => {
    window.localStorage.setItem(`fp:checklist:guide:abc:${dayKey(TODAY)}`, '{not json');
    expect(loadProgress('guide:abc', TODAY)).toEqual([]);
    window.localStorage.setItem(`fp:checklist:guide:abc:${dayKey(TODAY)}`, '{"a":1}');
    expect(loadProgress('guide:abc', TODAY)).toEqual([]);
  });

  it('degrades quietly when storage is unavailable', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadProgress('guide:abc', TODAY)).toEqual([]);
    spy.mockRestore();
  });

  it('prunes entries older than a week and leaves recent ones alone', () => {
    const old = new Date(2026, 6, 20, 9, 0, 0); // ~2 weeks earlier
    const yesterday = new Date(2026, 7, 4, 9, 0, 0);
    saveProgress('guide:old', [1], old);
    saveProgress('guide:recent', [2], yesterday);
    saveProgress('guide:today', [3], TODAY);

    pruneProgress(TODAY);

    expect(loadProgress('guide:old', old)).toEqual([]);
    expect(loadProgress('guide:recent', yesterday)).toEqual([2]);
    expect(loadProgress('guide:today', TODAY)).toEqual([3]);
  });

  it('leaves unrelated localStorage keys untouched', () => {
    window.localStorage.setItem('theme', 'dark');
    saveProgress('guide:abc', [1], new Date(2026, 6, 1));
    pruneProgress(TODAY);
    expect(window.localStorage.getItem('theme')).toBe('dark');
  });
});
