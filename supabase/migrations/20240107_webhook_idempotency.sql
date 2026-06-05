-- Webhook idempotency + ordering guard for the stripe-webhook function.
--
-- Stripe delivers events at-least-once and with NO guaranteed ordering. Two
-- hazards follow:
--   1. Duplicate delivery — the same event id arrives more than once (retries,
--      or the same event fanned out to multiple endpoints).
--   2. Reordered delivery — an older event arrives AFTER a newer one and would
--      otherwise overwrite fresher billing state (e.g. a stale
--      customer.subscription.updated landing after the real latest one).
--
-- This migration adds:
--   1. stripe_webhook_events — a ledger of processed Stripe event ids so
--      duplicates can be skipped. A row is written only AFTER a handler succeeds.
--   2. user_billing.last_event_at — the Stripe `event.created` timestamp of the
--      most recent event applied to the row. The webhook drops any event older
--      than this, so reordered deliveries can't regress billing state.

-- ---------------------------------------------------------------------------
-- 1. Processed-event ledger (idempotency)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id           TEXT PRIMARY KEY,        -- Stripe event id (evt_...)
  type         TEXT NOT NULL,           -- e.g. customer.subscription.updated
  created      TIMESTAMPTZ NOT NULL,    -- Stripe event.created
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only edge functions (service role, which bypasses RLS) touch this table.
-- Enable RLS with no policies so anon/authenticated clients can't read or write it.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Ordering guard column
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_billing
  ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ;
