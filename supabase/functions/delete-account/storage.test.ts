import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  type BucketApi,
  deleteUserObjects,
  isOwnedBy,
  listAllPaths,
  type StorageApi,
  type StorageEntry,
} from './storage.ts';

const USER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

/**
 * A fake Storage client backed by a flat list of object paths per bucket,
 * reproducing the two behaviours this module depends on: folders come back as
 * entries with a null id, and listings are paginated.
 */
function fakeStorage(
  tree: Record<string, string[]>,
  opts: { listError?: Record<string, string>; removeError?: Record<string, string> } = {},
) {
  const removed: Record<string, string[]> = {};
  const removeBatches: Record<string, number[]> = {};
  const listCalls: Array<{ bucket: string; prefix: string; offset: number }> = [];

  const storage: StorageApi = {
    from(bucketName: string): BucketApi {
      const all = tree[bucketName] ?? [];
      return {
        list(prefix, { limit, offset }) {
          listCalls.push({ bucket: bucketName, prefix, offset });

          const listError = opts.listError?.[bucketName];
          if (listError) return Promise.resolve({ data: null, error: { message: listError } });

          // Immediate children of `prefix`: files as themselves, deeper paths
          // collapsed into a single folder entry.
          const children = new Map<string, StorageEntry>();
          for (const path of all) {
            if (prefix && !path.startsWith(`${prefix}/`)) continue;
            const rest = prefix ? path.slice(prefix.length + 1) : path;
            const slash = rest.indexOf('/');
            if (slash === -1) {
              children.set(rest, { name: rest, id: `id-${path}` });
            } else {
              const folder = rest.slice(0, slash);
              if (!children.has(folder)) children.set(folder, { name: folder, id: null });
            }
          }

          const entries = [...children.values()].sort((a, b) => a.name.localeCompare(b.name));
          return Promise.resolve({ data: entries.slice(offset, offset + limit), error: null });
        },
        remove(paths) {
          const removeError = opts.removeError?.[bucketName];
          if (removeError) return Promise.resolve({ data: null, error: { message: removeError } });
          (removed[bucketName] ??= []).push(...paths);
          (removeBatches[bucketName] ??= []).push(paths.length);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };

  return { storage, removed, removeBatches, listCalls };
}

// ── isOwnedBy ────────────────────────────────────────────────────────────────

Deno.test('isOwnedBy matches the basename, at any depth', () => {
  assertEquals(isOwnedBy(`guide-media/abc/${USER}-123-photo.jpg`, USER), true);
  assertEquals(isOwnedBy(`properties/${USER}-123.jpg`, USER), true);
  assertEquals(isOwnedBy(`${USER}-123.jpg`, USER), true);
});

Deno.test('isOwnedBy ignores another user\'s objects', () => {
  assertEquals(isOwnedBy(`guide-media/abc/${OTHER}-123-photo.jpg`, USER), false);
});

Deno.test('isOwnedBy does not match the id in a folder name', () => {
  // A guide folder named after the user must not drag in other users' files.
  assertEquals(isOwnedBy(`guide-media/${USER}/${OTHER}-123.jpg`, USER), false);
});

Deno.test('isOwnedBy requires the trailing hyphen, so a uuid prefix is not a match', () => {
  const longer = `${USER}extra`;
  assertEquals(isOwnedBy(`properties/${longer}-123.jpg`, USER), false);
});

// ── listAllPaths ─────────────────────────────────────────────────────────────

Deno.test('listAllPaths recurses into nested folders', async () => {
  const paths = [
    'root.jpg',
    'properties/a.jpg',
    'guide-media/g1/one.jpg',
    'guide-media/g1/two.jpg',
    'guide-media/g2/deep/three.jpg',
  ];
  const { storage } = fakeStorage({ images: paths });

  const found = await listAllPaths(storage.from('images'));
  assertEquals(found.sort(), [...paths].sort());
});

Deno.test('listAllPaths pages through listings longer than one page', async () => {
  // 250 files in one folder forces three pages at the module's 100-per-page.
  const many = Array.from({ length: 250 }, (_, i) => `properties/f${String(i).padStart(3, '0')}.jpg`);
  const { storage, listCalls } = fakeStorage({ images: many });

  const found = await listAllPaths(storage.from('images'));
  assertEquals(found.length, 250);

  const offsets = listCalls.filter((c) => c.prefix === 'properties').map((c) => c.offset);
  assertEquals(offsets, [0, 100, 200]);
});

Deno.test('listAllPaths throws when the bucket cannot be listed', async () => {
  const { storage } = fakeStorage({ images: ['a.jpg'] }, { listError: { images: 'boom' } });

  let message = '';
  try {
    await listAllPaths(storage.from('images'));
  } catch (err) {
    message = (err as Error).message;
  }
  assertEquals(message, 'boom');
});

// ── deleteUserObjects ────────────────────────────────────────────────────────

Deno.test('deleteUserObjects removes only the user\'s objects, across both buckets', async () => {
  const { storage, removed } = fakeStorage({
    'images': [
      `guide-media/g1/${USER}-1-a.jpg`,
      `guide-media/g1/${OTHER}-2-b.jpg`,
      `properties/${USER}-3.jpg`,
      `properties/${OTHER}-4.jpg`,
    ],
    'guide-videos': [
      `guide-media/temp-xyz/${USER}-5-c.mp4`,
      `guide-media/g2/${OTHER}-6-d.mp4`,
    ],
  });

  const { deleted, failures } = await deleteUserObjects(storage, USER);

  assertEquals(failures, []);
  assertEquals(deleted.sort(), [
    `guide-videos/guide-media/temp-xyz/${USER}-5-c.mp4`,
    `images/guide-media/g1/${USER}-1-a.jpg`,
    `images/properties/${USER}-3.jpg`,
  ]);
  assertEquals(removed['images'].sort(), [
    `guide-media/g1/${USER}-1-a.jpg`,
    `properties/${USER}-3.jpg`,
  ]);
  assertEquals(removed['guide-videos'], [`guide-media/temp-xyz/${USER}-5-c.mp4`]);
});

Deno.test('deleteUserObjects picks up abandoned temp- uploads never attached to a guide', async () => {
  const { storage } = fakeStorage({
    'images': [`guide-media/temp-9f8e/${USER}-1-a.jpg`],
  });

  const { deleted, failures } = await deleteUserObjects(storage, USER);

  assertEquals(failures, []);
  assertEquals(deleted, [`images/guide-media/temp-9f8e/${USER}-1-a.jpg`]);
});

Deno.test('deleteUserObjects deletes nothing when the user uploaded nothing', async () => {
  const { storage, removed } = fakeStorage({
    'images': [`properties/${OTHER}-1.jpg`],
    'guide-videos': [],
  });

  const { deleted, failures } = await deleteUserObjects(storage, USER);

  assertEquals(deleted, []);
  assertEquals(failures, []);
  assertEquals(removed['images'], undefined);
});

Deno.test('deleteUserObjects batches removals at 100 paths', async () => {
  const mine = Array.from(
    { length: 230 },
    (_, i) => `properties/${USER}-${String(i).padStart(3, '0')}.jpg`,
  );
  const { storage, removed, removeBatches } = fakeStorage({ images: mine, 'guide-videos': [] });

  const { deleted, failures } = await deleteUserObjects(storage, USER);

  assertEquals(failures, []);
  assertEquals(deleted.length, 230);
  assertEquals(removed['images'].length, 230);
  // Three calls, not one call of 230 and not 230 calls of one.
  assertEquals(removeBatches['images'], [100, 100, 30]);
});

Deno.test('a bucket that cannot be listed is reported but does not stop the other bucket', async () => {
  const { storage, removed } = fakeStorage(
    {
      'images': [`properties/${USER}-1.jpg`],
      'guide-videos': [`guide-media/g1/${USER}-2.mp4`],
    },
    { listError: { images: 'service unavailable' } },
  );

  const { deleted, failures } = await deleteUserObjects(storage, USER);

  assertEquals(failures, ['images: listing failed: service unavailable']);
  assertEquals(deleted, [`guide-videos/guide-media/g1/${USER}-2.mp4`]);
  assertEquals(removed['guide-videos'], [`guide-media/g1/${USER}-2.mp4`]);
});

Deno.test('a failed removal is reported and not counted as deleted', async () => {
  const { storage } = fakeStorage(
    { images: [`properties/${USER}-1.jpg`], 'guide-videos': [] },
    { removeError: { images: 'permission denied' } },
  );

  const { deleted, failures } = await deleteUserObjects(storage, USER);

  assertEquals(deleted, []);
  assertEquals(failures, ['images: removing 1 object(s) failed: permission denied']);
});
