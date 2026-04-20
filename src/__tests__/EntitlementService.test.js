import { describe, it, expect, beforeEach } from 'vitest';
import { EntitlementService } from '../services/EntitlementService.js';

const MB = 1024 * 1024;
const GB = 1024 * MB;

// Builds an EntitlementService wired to a static in-memory data fixture.
// No Supabase calls are made — the dataFetcher option is the DI seam.
function makeService(entitlements, usage, planName = 'Free') {
  return new EntitlementService({
    dataFetcher: async () => ({
      plan: { name: planName, id: 'plan-uuid' },
      entitlements,
      usage,
    }),
  });
}

// Shared entitlement shapes used across tests
const FREE_GUIDES = { 'active_guides_max': { value: 3, isUnlimited: false, textValue: null } };
const FREE_BUNDLES = { 'bundles_max': { value: 1, isUnlimited: false, textValue: null } };
const FREE_STORAGE = { 'storage_bytes_max': { value: 1 * GB, isUnlimited: false, textValue: null } };

describe('EntitlementService', () => {
  describe('guide limit', () => {
    it('allows creating a guide when under the limit', async () => {
      const service = makeService(FREE_GUIDES, { active_guides: 2 });

      const result = await service.canPerform('user-1', 'GUIDE_CREATE');

      expect(result.allowed).toBe(true);
      expect(result.reason_code).toBeNull();
    });

    it('denies creating a guide when at the limit', async () => {
      const service = makeService(FREE_GUIDES, { active_guides: 3 });

      const result = await service.canPerform('user-1', 'GUIDE_CREATE');

      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe('LIMIT_ACTIVE_GUIDES');
      expect(result.limit).toBe(3);
      expect(result.current).toBe(3);
      expect(result.upgrade_suggestion).toBe('couple');
    });
  });

  describe('bundle limit', () => {
    it('denies creating a bundle when at the limit', async () => {
      const service = makeService(FREE_BUNDLES, { bundles: 1 });

      const result = await service.canPerform('user-1', 'BUNDLE_CREATE');

      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe('LIMIT_BUNDLES');
      expect(result.limit).toBe(1);
      expect(result.current).toBe(1);
    });
  });

  describe('storage limit', () => {
    it('denies an upload that would exceed the storage cap', async () => {
      // 900 MB used, 1 GB cap — uploading 200 MB tips over the limit
      const service = makeService(FREE_STORAGE, { storage_bytes: 900 * MB });

      const result = await service.canPerform('user-1', 'FILE_UPLOAD', {
        file_size_bytes: 200 * MB,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe('LIMIT_STORAGE');
      expect(result.current).toBe(900 * MB);
      expect(result.limit).toBe(1 * GB);
    });
  });

  describe('unarchive over limit', () => {
    it('denies unarchiving when active guides are already at the limit', async () => {
      // User has 3 active guides and tries to unarchive a 4th
      const service = makeService(FREE_GUIDES, { active_guides: 3 });

      const result = await service.canPerform('user-1', 'GUIDE_UNARCHIVE');

      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe('LIMIT_ACTIVE_GUIDES');
    });
  });

  describe('cache invalidation', () => {
    it('re-fetches data after the cache is invalidated', async () => {
      let fetchCount = 0;
      const service = new EntitlementService({
        dataFetcher: async () => {
          fetchCount++;
          return {
            plan: { name: 'Free', id: 'plan-uuid' },
            entitlements: FREE_GUIDES,
            usage: { active_guides: 1 },
          };
        },
      });

      // First call populates the cache
      await service.canPerform('user-1', 'GUIDE_CREATE');
      expect(fetchCount).toBe(1);

      // Second call should use the cache — no additional fetch
      await service.canPerform('user-1', 'GUIDE_CREATE');
      expect(fetchCount).toBe(1);

      // Invalidating the cache forces a fresh fetch on the next call
      service.invalidateCache('user-1');
      await service.canPerform('user-1', 'GUIDE_CREATE');
      expect(fetchCount).toBe(2);
    });
  });
});
