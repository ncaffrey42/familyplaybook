-- Notifications: the ONE seam future channels plug into.
--
-- Design: docs/platform/SEAMS.md §2. The fan-out template is
-- submit-feedback's (each destination isolated, best-effort, never fails the
-- source action); the notifications table is the persistent first
-- destination, and push/email later become additional arms behind the same
-- event sites — never second event sites.
--
-- DEPENDS ON 20240128_share_labels_access_log (redefines record_share_access
-- on top of that version; migration numbering guarantees order).

-- ---------------------------------------------------------------------------
-- 1. notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         text NOT NULL,          -- 'share.opened' | future kinds
  title        text NOT NULL,          -- pre-rendered, content-free (SEAMS.md §2.4)
  body         text,
  ref_type     text,                   -- e.g. 'shared_links'
  ref_id       uuid,
  count        integer NOT NULL DEFAULT 1,
  coalesce_key text,                   -- e.g. 'share.opened:<link-id>:<utc-day>'
  created_at   timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

-- Coalescing: a repeat event lands in the existing UNREAD row (count += 1)
-- rather than appending — one row per link per day, "opened ×7", never seven
-- rows. Once read, the window resets and the next event starts fresh.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_coalesce_uniq
  ON public.notifications (user_id, coalesce_key)
  WHERE read_at IS NULL AND coalesce_key IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Recipient reads and marks read. No INSERT/DELETE for authenticated:
-- producers are SECURITY DEFINER/service only — the same posture as every
-- counter table in this schema (ask_playbook_usage, the shared_links
-- counters). A client that could insert its own notifications could spoof
-- "your link was opened".
DROP POLICY IF EXISTS notifications_owner_select ON public.notifications;
CREATE POLICY notifications_owner_select ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_owner_update ON public.notifications;
CREATE POLICY notifications_owner_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. record_share_access gains the fan-out (first producer)
-- ---------------------------------------------------------------------------
-- Replaces 20240128's definition. Guest-facing behavior is IDENTICAL: same
-- signature, VOLATILE SECURITY DEFINER, returns void, silently uniform for
-- real/expired/nonexistent ids, same 1-minute debounce. The only addition:
-- when the debounced counter actually increments, upsert a coalesced
-- notification for the link's owner.
--
-- The notification write is wrapped in its own exception guard: per the
-- fan-out template, a failing destination must NEVER fail the source action
-- (the guest's page fired this fire-and-forget; the count is the primary
-- record).
CREATE OR REPLACE FUNCTION public.record_share_access(p_share_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
  v_label text;
BEGIN
  IF p_share_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.shared_links
     SET opened_count   = opened_count + 1,
         last_opened_at = now()
   WHERE id = p_share_id
     AND (expires_at IS NULL OR expires_at > now())
     AND (last_opened_at IS NULL OR last_opened_at < now() - INTERVAL '1 minute')
  RETURNING user_id, recipient_label INTO v_owner, v_label;

  -- Debounce didn't pass, or the link is expired/unknown → no count, no
  -- notification. FOUND tracks the UPDATE above.
  IF NOT FOUND OR v_owner IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.notifications
      (user_id, kind, title, body, ref_type, ref_id, coalesce_key)
    VALUES (
      v_owner,
      'share.opened',
      CASE WHEN v_label IS NOT NULL AND length(trim(v_label)) > 0
           THEN 'Your link for ' || v_label || ' was opened'
           ELSE 'Your shared link was opened' END,
      NULL,                                   -- content-free by design (SEAMS.md §2.4)
      'shared_links',
      p_share_id,
      'share.opened:' || p_share_id || ':' || to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD')
    )
    ON CONFLICT (user_id, coalesce_key) WHERE read_at IS NULL AND coalesce_key IS NOT NULL
    DO UPDATE SET count = notifications.count + 1;
  EXCEPTION WHEN OTHERS THEN
    -- Best-effort arm: log-and-continue is not available in SQL, so swallow.
    NULL;
  END;
END;
$$;

-- Grants unchanged from 20240128 (anon + authenticated may execute); restated
-- because CREATE OR REPLACE preserves them but explicitness is cheap.
REVOKE ALL ON FUNCTION public.record_share_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_share_access(uuid) TO anon, authenticated;
