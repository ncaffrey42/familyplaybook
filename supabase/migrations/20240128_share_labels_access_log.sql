-- Share links: recipient labels + per-link access log.
--
-- Three things, in dependency order:
--   1. An UPDATE policy on shared_links. This is a PREREQUISITE for labels
--      (you can't set one without it) and it also fixes a live bug — see
--      the note below.
--   2. `recipient_label` — who the link is for ("Sitter — Friday").
--   3. `opened_count` / `last_opened_at` + a SECURITY DEFINER RPC that
--      anonymous share-page visitors call to bump them.
--
-- See docs/platform/SHARING.md for the design and the rejected alternatives.

-- ---------------------------------------------------------------------------
-- 1. UPDATE policy (prerequisite — and a bug fix)
-- ---------------------------------------------------------------------------
-- shared_links has had INSERT, SELECT and DELETE policies since
-- 20240109_share_link_hardening, but never an UPDATE policy. Two shipped
-- client call sites issue UPDATEs against it anyway:
--
--   src/pages/share/ShareScreen.jsx  — the "For how long" expiry picker
--   src/pages/guides/GuideDetail.jsx — re-sharing refreshes expires_at
--
-- With RLS enabled and no permissive UPDATE policy, Postgres matches zero
-- rows. PostgREST answers 204 with no error, so supabase-js reports
-- `error: null` and the optimistic UI keeps the new value until reload.
-- Net effect today: expiry is correct at INSERT ('tonight') and can never
-- be changed afterwards — a user picking "Until I switch it off" still
-- silently loses the link at midnight.
--
-- Adding the policy is required for labels regardless; fixing the expiry
-- picker is the same one-line change.

DROP POLICY IF EXISTS shared_links_owner_update ON public.shared_links;
CREATE POLICY shared_links_owner_update
  ON public.shared_links
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. Recipient label
-- ---------------------------------------------------------------------------
-- Named `recipient_label`, not `label`: ShareCenterScreen already derives a
-- client-side `label` field for the CONTENT name (the guide/bundle title).
-- A column called `label` would collide with it and be silently discarded
-- by the object spread that builds `liveLinks`.
--
-- Nullable — every existing link predates the feature, and an unlabelled
-- link is a normal, permanent state, not a migration gap to backfill.

ALTER TABLE public.shared_links
  ADD COLUMN IF NOT EXISTS recipient_label text;

ALTER TABLE public.shared_links
  DROP CONSTRAINT IF EXISTS shared_links_recipient_label_len;
ALTER TABLE public.shared_links
  ADD CONSTRAINT shared_links_recipient_label_len
  CHECK (recipient_label IS NULL OR char_length(recipient_label) <= 60);

-- ---------------------------------------------------------------------------
-- 3. Access log — denormalised counters, not an event table
-- ---------------------------------------------------------------------------
-- Two scalars on the row rather than a share_access_events table:
--   * O(1) to read — the Share tab lists every link and would otherwise
--     need an aggregate per row.
--   * No unbounded growth, no retention policy, no extra RLS surface.
--   * Privacy by construction: per-open rows would let an owner
--     reconstruct when a specific guest was reading, which is more than
--     the retention signal needs. Counts and a last-seen timestamp are not
--     re-identifying. No IP, no user-agent, no visitor id is recorded
--     anywhere in this migration — deliberately.
-- The cost is no history (no "opens per day" chart). Accepted; if that is
-- ever needed, an events table can be added alongside these counters
-- without changing them.

ALTER TABLE public.shared_links
  ADD COLUMN IF NOT EXISTS opened_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.shared_links
  ADD COLUMN IF NOT EXISTS last_opened_at timestamp with time zone;

-- ---------------------------------------------------------------------------
-- 4. record_share_access — the only way an anonymous visitor writes
-- ---------------------------------------------------------------------------
-- Mirrors get_shared_content's posture exactly: SECURITY DEFINER, granted
-- to anon, search_path pinned. NO anon RLS policy is added — anonymous
-- callers still have zero policy-level access to shared_links, so the
-- "a guest must never enumerate" guarantee in docs/platform/RBAC.md is
-- untouched. This function writes and returns nothing; it cannot be used
-- to probe for which share ids exist, because it behaves identically
-- (silently) for a real id, an expired id, and a nonexistent one.
--
-- VOLATILE, unlike get_shared_content: a STABLE function cannot write, so
-- the counter bump could not have lived inside the existing RPC.
--
-- The 1-minute debounce collapses refreshes and page re-mounts into one
-- open, and caps how fast the row can be dirtied by a bot. It also means
-- two different people opening the same link within a minute count once —
-- accepted: this is a retention signal, not an audit log, and the
-- alternative (a row per hit) is the privacy posture rejected above.
--
-- Expired links do not count. get_shared_content returns no content for
-- them, so counting the hit would inflate "opened" with views that showed
-- the recipient nothing.

CREATE OR REPLACE FUNCTION public.record_share_access(p_share_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_share_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.shared_links
     SET opened_count   = opened_count + 1,
         last_opened_at = now()
   WHERE id = p_share_id
     AND (expires_at IS NULL OR expires_at > now())
     AND (last_opened_at IS NULL OR last_opened_at < now() - INTERVAL '1 minute');
END;
$$;

REVOKE ALL ON FUNCTION public.record_share_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_share_access(uuid) TO anon, authenticated;
