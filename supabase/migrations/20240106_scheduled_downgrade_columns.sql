-- Track a pending end-of-period downgrade on user_billing.
--
-- Downgrades take effect at the end of the current billing period (the user
-- keeps the tier they paid for until then). Between the request and the
-- period boundary we need somewhere to record "this account is scheduled to
-- move to plan X on date Y" so the UI can show a pending-change banner instead
-- of looking like nothing happened.
--
-- These columns are written by the stripe-webhook (authoritative, derived from
-- the Stripe subscription's cancel_at_period_end / subscription schedule) and
-- optimistically by the change-subscription-plan edge function for snappy UI.
-- They are cleared once the change actually applies (plan_key flips) or the
-- pending downgrade is reverted by a subsequent upgrade.

ALTER TABLE public.user_billing
  ADD COLUMN IF NOT EXISTS scheduled_plan_key  TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_change_at TIMESTAMPTZ;
