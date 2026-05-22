-- Storage bucket + policies for user profile avatars.
--
-- The app uploads to `avatars/{userId}/{timestamp}.jpg` (see
-- src/components/AvatarUpload.jsx). The bucket is public-read because
-- avatar URLs need to render in shared/preview contexts without minting
-- signed URLs every time.
--
-- Defence in depth:
--   • Client validates MIME (no SVG), size (≤5 MB) before upload.
--   • Bucket-level file-size cap mirrors the client cap.
--   • RLS confines writes/deletes to the owner's folder.

-- 1. Bucket. Idempotent.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. RLS policies on storage.objects scoped to this bucket.
--    Path convention: <user_id>/<filename>. The first path segment
--    (`storage.foldername(name)[1]`) is the owner's UUID — RLS
--    compares it against the calling user's UID for write ops.

-- Anyone (including unauthenticated viewers of shared content) can read
-- avatars. The bucket is public, but storage.objects still enforces RLS,
-- so we need an explicit permissive SELECT policy.
DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
CREATE POLICY avatars_public_read
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- Only the authenticated owner can INSERT/UPDATE/DELETE files in their
-- own folder.
DROP POLICY IF EXISTS avatars_owner_insert ON storage.objects;
CREATE POLICY avatars_owner_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS avatars_owner_update ON storage.objects;
CREATE POLICY avatars_owner_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS avatars_owner_delete ON storage.objects;
CREATE POLICY avatars_owner_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
