import Stripe from 'npm:stripe@14';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { inferPlanFromPriceId, planFromSubscriptionPrice } from '../_shared/stripe.ts';
import { isEventFresh } from './idempotency.ts';

// Dependencies are injected so the processing logic can be unit-tested with
// fakes. The HTTP bootstrap at the bottom wires in the real clients.
export interface WebhookDeps {
  supabaseAdmin: SupabaseClient;
  stripe: Stripe;
}

// ── Pure data extraction (no external deps) ───────────────────────────────────

function getSubscriptionBillingData(sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const interval = item?.price?.recurring?.interval ?? null;

  // Plan precedence (see planFromSubscriptionPrice): the live price is the source
  // of truth for the plan the customer is actually billed for — correct even for
  // Billing-Portal changes that never write our metadata. Metadata is only a hint
  // used when the price isn't in our env map; 'free' is the last resort.
  const fromPrice = planFromSubscriptionPrice(sub);
  const planKey = fromPrice?.planKey ?? sub.metadata?.plan_key ?? 'free';
  const billingInterval = fromPrice?.interval ?? sub.metadata?.billing_interval ?? interval;

  return {
    subscription_status: sub.status,                          // active | trialing | past_due | canceled | …
    plan_key: planKey,
    price_id: priceId,
    billing_interval: billingInterval,
    stripe_subscription_id: sub.id,
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    cancel_at_period_end: sub.cancel_at_period_end,
  };
}

// ── Processor factory ─────────────────────────────────────────────────────────
// All DB/Stripe-touching logic closes over the injected deps.

export function makeProcessor({ supabaseAdmin, stripe }: WebhookDeps) {
  async function resolveUserId(customerId: string): Promise<string | null> {
    // 1. Check our own user_billing table first (fastest path)
    const { data } = await supabaseAdmin
      .from('user_billing')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    if (data?.user_id) return data.user_id;

    // 2. Fall back to Stripe customer metadata
    //    Handle both 'user_id' (new) and 'supabase_user_id' (legacy) metadata keys
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    const meta = (customer as Stripe.Customer).metadata ?? {};
    return meta.user_id ?? meta.supabase_user_id ?? null;
  }

  // Derive a pending end-of-period downgrade from the subscription's state.
  // Returns nulls when nothing is pending (e.g. an active plan with no scheduled
  // change), which clears any stale scheduled_* values on the billing row.
  async function getScheduledDowngrade(sub: Stripe.Subscription): Promise<{
    scheduled_plan_key: string | null;
    scheduled_change_at: string | null;
  }> {
    // Cancellation at period end = scheduled downgrade to free.
    if (sub.cancel_at_period_end) {
      return {
        scheduled_plan_key: 'free',
        scheduled_change_at: new Date(sub.current_period_end * 1000).toISOString(),
      };
    }

    // A subscription schedule = a deferred paid→paid tier change. The phase that
    // starts at or after the current period end carries the new price.
    if (sub.schedule) {
      try {
        const schedule = await stripe.subscriptionSchedules.retrieve(sub.schedule as string);
        const future = schedule.phases.find(p => p.start_date >= sub.current_period_end);
        const priceId = future?.items?.[0]?.price;
        const inferred = typeof priceId === 'string' ? inferPlanFromPriceId(priceId) : null;
        if (inferred && future) {
          return {
            scheduled_plan_key: inferred.planKey,
            scheduled_change_at: new Date(future.start_date * 1000).toISOString(),
          };
        }
      } catch (err) {
        console.warn('[stripe-webhook] Could not read subscription schedule:', err.message);
      }
    }

    return { scheduled_plan_key: null, scheduled_change_at: null };
  }

  // Ordering guard: returns false when `eventCreatedAt` is older than the most
  // recent event already applied to the user's billing row, so a reordered
  // (stale) event can't overwrite fresher state. New users (no row yet) pass.
  async function isFreshEvent(userId: string, eventCreatedAt: string): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from('user_billing')
      .select('last_event_at')
      .eq('user_id', userId)
      .maybeSingle();

    return isEventFresh(data?.last_event_at ?? null, eventCreatedAt);
  }

  async function upsertBilling(
    userId: string,
    billingData: Record<string, unknown>,
    eventCreatedAt: string,
  ) {
    if (!(await isFreshEvent(userId, eventCreatedAt))) {
      console.log(`[stripe-webhook] Skipping stale event for user ${userId} (older than last applied)`);
      return;
    }

    const { error } = await supabaseAdmin
      .from('user_billing')
      .upsert(
        { user_id: userId, ...billingData, last_event_at: eventCreatedAt },
        { onConflict: 'user_id' },
      );

    if (error) throw new Error(`DB upsert failed: ${error.message}`);
  }

  // ── Idempotency ledger ───────────────────────────────────────────────────────

  async function alreadyProcessed(eventId: string): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from('stripe_webhook_events')
      .select('id')
      .eq('id', eventId)
      .maybeSingle();
    return !!data;
  }

  // Record an event as processed. Called only AFTER its handler succeeds, so a
  // failed handler (which throws → 500) is left unrecorded and Stripe will retry.
  // Best-effort: a failed insert is logged but not thrown — the ordering guard and
  // idempotent upserts keep a re-delivery safe even if the ledger write is lost.
  async function recordProcessed(event: Stripe.Event) {
    const { error } = await supabaseAdmin
      .from('stripe_webhook_events')
      .upsert(
        { id: event.id, type: event.type, created: new Date(event.created * 1000).toISOString() },
        { onConflict: 'id', ignoreDuplicates: true },
      );
    if (error) console.error('[stripe-webhook] Failed to record processed event:', error.message);
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  async function handleSubscriptionUpsert(sub: Stripe.Subscription, eventCreatedAt: string) {
    const userId = await resolveUserId(sub.customer as string);
    if (!userId) {
      console.warn('[stripe-webhook] Could not resolve user_id for customer:', sub.customer);
      return;
    }
    const scheduled = await getScheduledDowngrade(sub);
    await upsertBilling(userId, { ...getSubscriptionBillingData(sub), ...scheduled }, eventCreatedAt);
    console.log(`[stripe-webhook] Billing updated for user ${userId} — status: ${sub.status}`);
  }

  async function handleSubscriptionDeleted(sub: Stripe.Subscription, eventCreatedAt: string) {
    const userId = await resolveUserId(sub.customer as string);
    if (!userId) return;
    await upsertBilling(userId, {
      subscription_status: 'canceled',
      plan_key: 'free',
      stripe_subscription_id: sub.id,
      cancel_at_period_end: false,
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      // The downgrade has now taken effect — clear the pending marker.
      scheduled_plan_key: null,
      scheduled_change_at: null,
    }, eventCreatedAt);
    console.log(`[stripe-webhook] Subscription deleted for user ${userId}`);
  }

  async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice, eventCreatedAt: string) {
    if (!invoice.subscription) return;
    const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
    await handleSubscriptionUpsert(sub, eventCreatedAt);
  }

  async function handleInvoicePaymentFailed(invoice: Stripe.Invoice, eventCreatedAt: string) {
    if (!invoice.subscription) return;
    const userId = await resolveUserId(invoice.customer as string);
    if (!userId) return;
    // Stale event? Don't let an old payment_failed clobber newer state.
    if (!(await isFreshEvent(userId, eventCreatedAt))) {
      console.log(`[stripe-webhook] Skipping stale payment_failed for user ${userId}`);
      return;
    }
    // Mark as past_due; do NOT downgrade plan — give them time to fix payment
    await supabaseAdmin
      .from('user_billing')
      .update({ subscription_status: 'past_due', last_event_at: eventCreatedAt })
      .eq('user_id', userId);
    console.log(`[stripe-webhook] Payment failed for user ${userId}`);
  }

  /**
   * Process a verified Stripe event. Idempotent and order-safe:
   *   - duplicate event ids are skipped (returns { duplicate: true })
   *   - stale (reordered) events are dropped inside the handlers via the
   *     ordering guard
   *   - the event is recorded as processed only after its handler succeeds
   *
   * Throws if a handler fails, so the caller can return 500 and let Stripe retry.
   */
  async function processEvent(event: Stripe.Event): Promise<{ duplicate: boolean }> {
    if (await alreadyProcessed(event.id)) {
      console.log(`[stripe-webhook] Duplicate event ${event.id} — skipping`);
      return { duplicate: true };
    }

    const eventCreatedAt = new Date(event.created * 1000).toISOString();

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpsert(event.data.object as Stripe.Subscription, eventCreatedAt);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, eventCreatedAt);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice, eventCreatedAt);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, eventCreatedAt);
        break;

      default:
        // Acknowledge unhandled events so Stripe doesn't retry them
        break;
    }

    // Record success only after the handler completes.
    await recordProcessed(event);
    return { duplicate: false };
  }

  return { processEvent };
}

// ── HTTP bootstrap ──────────────────────────────────────────────────────────────
// Guarded by import.meta.main so importing this module in tests does not start a
// server or require the Stripe/Supabase env vars to be set.

if (import.meta.main) {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2024-06-20',
  });

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { processEvent } = makeProcessor({ supabaseAdmin, stripe });

  Deno.serve(async (req) => {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const sig = req.headers.get('stripe-signature');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET');

    if (!sig || !webhookSecret) {
      return new Response('Missing signature or secret', { status: 400 });
    }

    // Raw body is required for signature verification — do NOT call req.json() here
    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
    } catch (err) {
      console.error('[stripe-webhook] Signature verification failed:', err.message);
      return new Response(`Webhook signature invalid: ${err.message}`, { status: 400 });
    }

    try {
      const { duplicate } = await processEvent(event);
      return new Response(JSON.stringify({ received: true, duplicate }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('[stripe-webhook] Handler error:', err);
      // Return 500 so Stripe retries — transient failures should not be silently dropped
      return new Response(`Handler error: ${err.message}`, { status: 500 });
    }
  });
}
