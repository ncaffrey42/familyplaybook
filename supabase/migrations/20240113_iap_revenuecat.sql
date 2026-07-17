-- RevenueCat / native In-App Purchase support.
--
-- iOS and Android forbid Stripe for in-app digital subscriptions, so the
-- native apps purchase through the stores (Apple IAP / Google Play Billing)
-- brokered by RevenueCat. RevenueCat's webhook reconciles those purchases into
-- the SAME user_billing row the Stripe web flow uses — so plan_key drives
-- entitlements identically no matter where the user subscribed. Nothing in the
-- read path (plans -> plan_entitlements, RLS, EntitlementService) changes.

-- ---------------------------------------------------------------------------
-- 1. Track which system owns a billing row
-- ---------------------------------------------------------------------------
-- 'stripe' (web, default — preserves every existing row) or 'revenuecat'
-- (native IAP). Lets each webhook avoid clobbering the other's state.
ALTER TABLE public.user_billing
  ADD COLUMN IF NOT EXISTS billing_provider TEXT NOT NULL DEFAULT 'stripe';

-- RevenueCat's app_user_id is set to the Supabase user id, so no id-mapping
-- column is needed — the webhook resolves user_id directly.

-- ---------------------------------------------------------------------------
-- 2. Idempotency ledger for RevenueCat webhook events
-- ---------------------------------------------------------------------------
-- Mirrors stripe_webhook_events: RevenueCat may re-deliver, so we record each
-- processed event id and skip duplicates. Service-role only.
CREATE TABLE IF NOT EXISTS public.revenuecat_webhook_events (
  id           TEXT PRIMARY KEY,          -- RevenueCat event.id
  type         TEXT,
  app_user_id  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.revenuecat_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS revenuecat_events_service ON public.revenuecat_webhook_events;
CREATE POLICY revenuecat_events_service
  ON public.revenuecat_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
