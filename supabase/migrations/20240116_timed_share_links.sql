-- ⚠️ SUPERSEDED AND UNAPPLIABLE — READ BEFORE TOUCHING (noted 2026-08-20)
--
-- This migration cannot be applied by `supabase db push`. Its 20240116 slot is
-- already recorded as applied on the remote by 20240116_feedback.sql, which
-- came down a different branch. The two collided.
--
-- Consequences, verified against the live database:
--   * shared_links.recipient_name does NOT exist (probe returns 400)
--   * the set_share_window RPC does NOT exist (probe returns 404 / PGRST202)
--   * therefore ShareScreen's saveWindow() write path fails at runtime
--
-- The name concept is served instead by shared_links.recipient_label from
-- 20240128_share_labels_access_log, which IS applied. expires_at, the other
-- column this file adds, already arrived via 20240117_reengagement.
--
-- To revive this feature, renumber this file above the highest applied
-- migration (20240133) so it can run. To retire it, delete this file and
-- remove ShareScreen's recipient/windowId UI. Do not leave it as-is and
-- assume the feature works.

-- Timed, named share links — "one link for Ana, live until midnight".
--
-- The redesign brief asks for a duration on every link (Tonight / This weekend
-- / Until I switch it off) and a recipient name, so the owner's Home screen can
-- say "Ana is sitting" and the guest's header can say "until midnight".
-- Until now `shared_links` had neither: a link was live from creation until the
-- owner remembered to delete it.
--
-- Two columns, an expiry check inside the existing resolution RPC, and a
-- SECURITY DEFINER setter that cascades a bundle's window down to the guide
-- links that bundle exposes.
--
-- Backfill: every existing link keeps `expires_at = NULL` — "until I switch it
-- off" — so nothing that works today stops working.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.shared_links
  ADD COLUMN IF NOT EXISTS recipient_name TEXT,
  ADD COLUMN IF NOT EXISTS expires_at     TIMESTAMPTZ;

COMMENT ON COLUMN public.shared_links.recipient_name IS
  'Who this link was made for ("Ana"). Display only — the link is not bound to an identity.';
COMMENT ON COLUMN public.shared_links.expires_at IS
  'When the link stops resolving. NULL = live until the owner turns it off.';

-- Home reads "my soonest-expiring live link" on every load; the Share Center
-- reads every link ordered by window. Both are covered by this.
CREATE INDEX IF NOT EXISTS shared_links_user_expiry_idx
  ON public.shared_links (user_id, expires_at);

-- ---------------------------------------------------------------------------
-- 2. Owners may update their own links (they could only insert/select/delete)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS shared_links_owner_update ON public.shared_links;
CREATE POLICY shared_links_owner_update
  ON public.shared_links
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Setting a window
-- ---------------------------------------------------------------------------
-- A bundle share link is the thing the owner actually sends. The guide links
-- listed inside it (created by the bundle share flow) are how the guest walks
-- through the bundle — so a window on the bundle has to reach them, or the
-- child URLs outlive the link that produced them.
--
-- A guide can sit in more than one shared bundle, so a child link's expiry is
-- the *union* of the bundle grants that reach it: NULL (forever) if any live
-- bundle share containing it is forever, otherwise the latest of their
-- expiries. Guides in no shared bundle are left alone — those links are
-- standalone shares the owner set directly.
--
-- Note the deliberate asymmetry: a guide that has BOTH a standalone share and
-- a place in a shared bundle takes the bundle union, which can shorten the
-- standalone window. That errs toward closing links early — recoverable by the
-- owner — rather than leaving a URL live longer than any grant intended.
--
-- Child links are matched on guide_id alone. The bundle share flow stamps its
-- own bundle_id onto the guide links it creates, so filtering on a null
-- bundle_id would miss exactly the links this cascade exists to reach.
--
-- SECURITY DEFINER so the cascade can touch sibling rows in one statement;
-- ownership is checked explicitly against auth.uid() first.

CREATE OR REPLACE FUNCTION public.set_share_window(
  p_share_id       UUID,
  p_recipient_name TEXT,
  p_expires_at     TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link  RECORD;
  v_name  TEXT;
BEGIN
  IF p_share_id IS NULL THEN
    RAISE EXCEPTION 'share id is required';
  END IF;

  SELECT id, user_id, guide_id, bundle_id INTO v_link
    FROM shared_links
   WHERE id = p_share_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'share link not found';
  END IF;

  IF v_link.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not your share link';
  END IF;

  -- Empty string is not a name.
  v_name := NULLIF(BTRIM(COALESCE(p_recipient_name, '')), '');

  UPDATE shared_links
     SET recipient_name = v_name,
         expires_at     = p_expires_at
   WHERE id = p_share_id;

  -- Cascade a bundle's window onto the guide links it exposes.
  IF v_link.bundle_id IS NOT NULL AND v_link.guide_id IS NULL THEN
    UPDATE shared_links child
       SET expires_at = grant_window.effective_expiry
      FROM (
        SELECT pg.guide_id,
               -- bool_or(forever) wins; otherwise the latest expiry
               CASE WHEN bool_or(sl.expires_at IS NULL) THEN NULL
                    ELSE MAX(sl.expires_at) END AS effective_expiry
          FROM pack_guides pg
          JOIN shared_links sl
            ON sl.bundle_id = pg.pack_id
           AND sl.guide_id IS NULL
           AND sl.user_id = v_link.user_id
           AND (sl.expires_at IS NULL OR sl.expires_at > now())
         WHERE pg.guide_id IN (
                 SELECT guide_id FROM pack_guides WHERE pack_id = v_link.bundle_id
               )
         GROUP BY pg.guide_id
      ) AS grant_window
     WHERE child.guide_id = grant_window.guide_id
       AND child.user_id = v_link.user_id;
  END IF;

  RETURN jsonb_build_object(
    'id',             p_share_id,
    'recipient_name', v_name,
    'expires_at',     p_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_share_window(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_share_window(UUID, TEXT, TIMESTAMPTZ) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Resolution honours the window
-- ---------------------------------------------------------------------------
-- Same contract as 20240109 plus:
--   * an expired link returns {"type":"expired"} — distinct from a deleted one
--     ({"type":null}), so the guest gets "this link has closed" rather than
--     "not found"
--   * live payloads carry a `share` object (recipient name + expiry) so helper
--     mode can say who it's for and how long it lasts
--   * guides listed inside a bundle skip any child link that has expired

CREATE OR REPLACE FUNCTION public.get_shared_content(p_share_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link          RECORD;
  v_guide         RECORD;
  v_bundle        RECORD;
  v_bundle_guides JSONB;
  v_share         JSONB;
BEGIN
  IF p_share_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, guide_id, bundle_id, recipient_name, expires_at INTO v_link
    FROM shared_links
   WHERE id = p_share_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- The window closes the door before any content is assembled.
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at <= now() THEN
    RETURN jsonb_build_object('type', 'expired');
  END IF;

  v_share := jsonb_build_object(
    'recipient_name', v_link.recipient_name,
    'expires_at',     v_link.expires_at
  );

  IF v_link.guide_id IS NOT NULL THEN
    SELECT id, name, description, icon, steps, category, is_shareable
      INTO v_guide
      FROM guides
     WHERE id = v_link.guide_id;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    -- The link survives un-sharing, but the content does not.
    IF NOT COALESCE(v_guide.is_shareable, FALSE) THEN
      RETURN jsonb_build_object('type', 'private');
    END IF;

    -- Bundle context for the header: the link's own bundle, else the first
    -- bundle this guide belongs to.
    SELECT p.id, p.name, p.description, p.color, p.image
      INTO v_bundle
      FROM packs p
     WHERE p.id = COALESCE(
             v_link.bundle_id,
             (SELECT pack_id FROM pack_guides WHERE guide_id = v_link.guide_id LIMIT 1)
           );

    RETURN jsonb_build_object(
      'type',   'guide',
      'share',  v_share,
      'guide',  jsonb_build_object(
                  'id', v_guide.id, 'name', v_guide.name,
                  'description', v_guide.description, 'icon', v_guide.icon,
                  'steps', v_guide.steps, 'category', v_guide.category
                ),
      'bundle', CASE WHEN v_bundle.id IS NULL THEN NULL ELSE
                  jsonb_build_object(
                    'id', v_bundle.id, 'name', v_bundle.name,
                    'description', v_bundle.description,
                    'color', v_bundle.color, 'image', v_bundle.image
                  )
                END
    );
  END IF;

  IF v_link.bundle_id IS NOT NULL THEN
    SELECT id, name, description, color, image INTO v_bundle
      FROM packs
     WHERE id = v_link.bundle_id;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    -- Only shareable guides that have their own LIVE share link are listed.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', g.id, 'name', g.name, 'description', g.description,
             'icon', g.icon, 'category', g.category, 'shareId', sl.id
           )), '[]'::jsonb)
      INTO v_bundle_guides
      FROM pack_guides pg
      JOIN guides g
        ON g.id = pg.guide_id
       AND COALESCE(g.is_shareable, FALSE)
      JOIN LATERAL (
        SELECT id FROM shared_links sl2
         WHERE sl2.guide_id = g.id
           AND (sl2.expires_at IS NULL OR sl2.expires_at > now())
         LIMIT 1
      ) sl ON TRUE
     WHERE pg.pack_id = v_link.bundle_id;

    RETURN jsonb_build_object(
      'type',          'bundle',
      'share',         v_share,
      'bundle',        jsonb_build_object(
                         'id', v_bundle.id, 'name', v_bundle.name,
                         'description', v_bundle.description,
                         'color', v_bundle.color, 'image', v_bundle.image
                       ),
      'bundle_guides', v_bundle_guides
    );
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_content(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_content(UUID) TO anon, authenticated;
