// Storage cleanup for account deletion.
//
// auth.admin.deleteUser cascades database rows, but Supabase Storage is a
// separate service with no foreign key to auth.users — so nothing about
// deleting the user removes what they uploaded. Both media buckets are read
// back through getPublicUrl, so an uploaded photo stays reachable at a URL that
// has already been handed out, indefinitely, after the account is gone.
//
// Finding a user's objects is awkward because the upload paths are not
// user-scoped directories. The user id is embedded in the *filename*:
//
//   images        guide-media/<guideId|temp-uuid>/<userId>-<ts>-<name>.jpg
//                 properties/<userId>-<ts>.jpg
//   guide-videos  guide-media/<guideId|temp-uuid>/<userId>-<ts>-<name>.mp4
//
// (See src/components/MediaUpload.jsx and src/components/ImageUpload.jsx.)
//
// So there is no prefix to list. We walk each bucket and match on the basename.
// That is O(all objects in the bucket), not O(this user's objects) — fine at
// current scale, but the real fix is to make uploads write under a <userId>/
// prefix, which would turn this into a single prefix listing and also allow a
// per-user RLS policy on storage.objects. Until then, this is what correctly
// matches the layout on disk.
//
// Pure except for the injected storage client, so it is unit-testable with a
// fake (see storage.test.ts).

/** A single entry from a bucket listing. */
export interface StorageEntry {
  name: string;
  /** Supabase marks synthetic folder entries with a null id. */
  id: string | null;
}

/** The slice of the Supabase Storage bucket client this module uses. */
export interface BucketApi {
  list(
    prefix: string,
    options: { limit: number; offset: number },
  ): Promise<{ data: StorageEntry[] | null; error: { message: string } | null }>;
  remove(
    paths: string[],
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface StorageApi {
  from(bucket: string): BucketApi;
}

/** Every bucket the app uploads user media to. */
export const MEDIA_BUCKETS = ['images', 'guide-videos'];

/** Objects per listing page, and paths per remove() call. */
const PAGE_SIZE = 100;
const REMOVE_BATCH = 100;

export interface CleanupResult {
  /** `<bucket>/<path>` for each object actually removed. */
  deleted: string[];
  /** Human-readable description of each step that did not complete. */
  failures: string[];
}

/**
 * Does this object belong to `userId`?
 *
 * Matches on the basename only, so a guide folder that happens to contain the
 * id (or another user whose id merely starts with the same characters) is not
 * swept up. The trailing hyphen matters: both upload sites write
 * `<userId>-<timestamp>...`, and without it a uuid that is a string prefix of
 * another would match.
 */
export function isOwnedBy(path: string, userId: string): boolean {
  const basename = path.slice(path.lastIndexOf('/') + 1);
  return basename.startsWith(`${userId}-`);
}

/**
 * Every object path under `prefix`, recursing into folders and paging through
 * listings that exceed PAGE_SIZE. Throws if the bucket cannot be listed.
 */
export async function listAllPaths(bucket: BucketApi, prefix = ''): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE_SIZE, offset });
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        paths.push(...await listAllPaths(bucket, path));
      } else {
        paths.push(path);
      }
    }

    // A short page is the last page.
    if (data.length < PAGE_SIZE) break;
    offset += data.length;
  }

  return paths;
}

/**
 * Remove every stored object belonging to `userId`.
 *
 * Never throws: a bucket that cannot be listed, or a batch that cannot be
 * removed, is recorded in `failures` and the remaining work still runs. The
 * caller decides what to do about a partial result — account deletion must not
 * be blocked by a Storage hiccup, but an incomplete cleanup has to be visible.
 */
export async function deleteUserObjects(
  storage: StorageApi,
  userId: string,
  buckets: string[] = MEDIA_BUCKETS,
): Promise<CleanupResult> {
  const deleted: string[] = [];
  const failures: string[] = [];

  for (const name of buckets) {
    const bucket = storage.from(name);

    let owned: string[];
    try {
      const all = await listAllPaths(bucket);
      owned = all.filter((path) => isOwnedBy(path, userId));
    } catch (err) {
      failures.push(`${name}: listing failed: ${(err as Error).message}`);
      continue;
    }

    for (let i = 0; i < owned.length; i += REMOVE_BATCH) {
      const batch = owned.slice(i, i + REMOVE_BATCH);
      const { error } = await bucket.remove(batch);
      if (error) {
        failures.push(`${name}: removing ${batch.length} object(s) failed: ${error.message}`);
      } else {
        deleted.push(...batch.map((path) => `${name}/${path}`));
      }
    }
  }

  return { deleted, failures };
}
