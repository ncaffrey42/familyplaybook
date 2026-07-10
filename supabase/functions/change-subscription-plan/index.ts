import { corsHeaders, handleCors } from '../_shared/cors.ts';
import {
  stripe,
  supabaseAdmin,
  requireUser,
  getPriceId,
  planFromSubscriptionPrice,
} from '../_shared/stripe.ts';

// Tier ordering for upgrade/downgrade comparison.
const PLAN_LEVEL: Record<string, number> = { free: 0, couple: 1, family: 2 };
const VALID_INTERVALS = new Set(['month', 'year']);

function isoFromUnix(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

// ── Pure, testable request + routing helpers ──────────────────────────────────

export function isValidPlanKey(key: unknown): key is string {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(PLAN_LEVEL, key);
}

/** Validate the incoming request body. Returns the normalized values or an error. */
export function validateChangeRequest(
  body: { plan_key?: unknown; billing_interval?: unknown },
): { ok: true; planKey: string; interval: string } | { ok: false; error: string } {
  if (!body.plan_key || !body.billing_interval) {
    return { ok: false, error: 'plan_key and billing_interval are required' };
  }
  if (!isValidPlanKey(body.plan_key)) {
    return { ok: false, error: `Invalid plan_key: ${String(body.plan_key)}` };
  }
  if (typeof body.billing_interval !== 'string' || !VALID_INTERVALS.has(body.billing_interval)) {
    return { ok: false, error: `Invalid billing_interval: ${String(body.billing_interval)}` };
  }
  return { ok: true, planKey: body.plan_key, interval: body.billing_interval };
}

export type PlanChange = 'upgrade' | 'downgrade' | 'lateral';

/**
 * Classify a plan change by tier. `currentPlanKey` MUST be derived from the live
 * Stripe price (see planFromSubscriptionPrice), never from metadata — metadata
 * can be stale and is absent for Billing-Portal changes. 'lateral' = same tier
 * (e.g. a monthly↔annual interval switch).
 */
export function classifyPlanChange(currentPlanKey: string, targetPlanKey: string): PlanChange {
  const current = PLAN_LEVEL[currentPlanKey] ?? 0;
  const target = PLAN_LEVEL[targetPlanKey] ?? 0;
  if (target < current) return 'downgrade';
  if (target > current) return 'upgrade';
  return 'lateral';
}

async function handleRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireUser(req);
    const body = await req.json();

    const validation = validateChangeRequest(body);
    if (!validation.ok) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { planKey: plan_key, interval: billing_interval } = validation;

    const { data: billing } = await supabaseAdmin
      .from('user_billing')
      .select('stripe_customer_id, stripe_subscription_id, plan_key')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!billing?.stripe_subscription_id) {
      return new Response(JSON.stringify({ error: 'No active subscription found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const subscription = await stripe.subscriptions.retrieve(billing.stripe_subscription_id);
    const currentItemId = subscription.items.data[0].id;
    const currentPriceId = subscription.items.data[0].price.id;
    const periodEnd = isoFromUnix(subscription.current_period_end);

    // Current plan: derive from the LIVE Stripe price (authoritative, and correct
    // even for changes made in the Billing Portal). Fall back to our stored
    // billing row, then 'free'. We deliberately do NOT read subscription.metadata
    // here — it reflects the last intended change, not necessarily the live tier.
    const currentPlan = planFromSubscriptionPrice(subscription)?.planKey ?? billing.plan_key ?? 'free';
    const change = classifyPlanChange(currentPlan, plan_key);
    const isDowngrade = change === 'downgrade';

    // ── DOWNGRADE: apply at the end of the current billing period ──────────────
    // The user keeps the tier they paid for until the period ends, then drops.
    if (isDowngrade) {
      if (plan_key === 'free') {
        // Downgrade to Free = cancel the paid subscription at period end. There
        // is no 'free' Stripe price, so we never call getPriceId('free').
        //
        // A pending paid→paid downgrade leaves a subscription schedule attached,
        // and Stripe refuses cancel_at_period_end while a schedule manages the
        // subscription — release it first (the cancellation supersedes it).
        if (subscription.schedule) {
          await stripe.subscriptionSchedules.release(subscription.schedule as string);
        }
        await stripe.subscriptions.update(billing.stripe_subscription_id, {
          cancel_at_period_end: true,
          metadata: { ...subscription.metadata, user_id: user.id },
        });
      } else {
        // Paid → lower paid tier (e.g. Family → Couple). Stripe can't defer a
        // price swap on the subscription itself, so we attach a subscription
        // schedule: phase 1 keeps the current price until period end, phase 2
        // switches to the new (lower) price with no proration.
        const newPriceId = getPriceId(plan_key, billing_interval);

        const scheduleId = subscription.schedule
          ? (subscription.schedule as string)
          : (await stripe.subscriptionSchedules.create({
              from_subscription: billing.stripe_subscription_id,
            })).id;

        const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
        const currentPhase = schedule.phases[0];

        await stripe.subscriptionSchedules.update(scheduleId, {
          end_behavior: 'release',
          phases: [
            {
              items: [{ price: currentPriceId, quantity: 1 }],
              start_date: currentPhase.start_date,
              end_date: currentPhase.end_date,
            },
            {
              items: [{ price: newPriceId, quantity: 1 }],
              proration_behavior: 'none',
              metadata: { user_id: user.id, plan_key, billing_interval },
            },
          ],
        });
      }

      // Optimistically record the pending change so the UI can show a banner
      // immediately. The webhook is authoritative and will reconcile this.
      await supabaseAdmin
        .from('user_billing')
        .update({ scheduled_plan_key: plan_key, scheduled_change_at: periodEnd })
        .eq('user_id', user.id);

      return new Response(
        JSON.stringify({ success: true, effective: 'period_end', effective_date: periodEnd }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── UPGRADE / interval switch: swap the price in place, keep the cycle ─────
    // If a pending downgrade schedule exists, release it first so the upgrade
    // takes over cleanly.
    if (subscription.schedule) {
      await stripe.subscriptionSchedules.release(subscription.schedule as string);
    }

    const newPriceId = getPriceId(plan_key, billing_interval);
    const isUpgrade = change === 'upgrade';

    // Proration semantics: the plan change takes effect immediately and the
    // subscription keeps its existing renewal date. We deliberately never pass
    // `billing_cycle_anchor: 'now'` — that would reset the cycle, invoice a full
    // fresh period, and silently move the renewal date.
    //
    // UPGRADE: bill the prorated difference right away with `always_invoice`,
    // gated by `error_if_incomplete` so the higher tier is granted only once the
    // charge is actually collected. A declined card makes the update throw, so we
    // surface the failure instead of upgrading the user onto an unpaid invoice.
    // (Caveat: a card that requires 3-D Secure authentication will also error
    // here rather than prompting for auth.)
    //
    // INTERVAL SWITCH (same tier, e.g. monthly → annual): use `create_prorations`,
    // which defers the single prorated adjustment to the next invoice.
    await stripe.subscriptions.update(billing.stripe_subscription_id, {
      items: [{ id: currentItemId, price: newPriceId }],
      proration_behavior: isUpgrade ? 'always_invoice' : 'create_prorations',
      payment_behavior: isUpgrade ? 'error_if_incomplete' : undefined,
      cancel_at_period_end: false,
      metadata: { user_id: user.id, plan_key, billing_interval },
    });

    // Clear any previously scheduled downgrade — it no longer applies.
    await supabaseAdmin
      .from('user_billing')
      .update({ scheduled_plan_key: null, scheduled_change_at: null })
      .eq('user_id', user.id);

    return new Response(
      JSON.stringify({ success: true, effective: 'immediate' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[change-subscription-plan]', err);
    return new Response(JSON.stringify({ error: err.message, success: false }), {
      status: err.message === 'Unauthorized' ? 401 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// Guarded so importing this module in tests doesn't start a server.
if (import.meta.main) {
  Deno.serve(handleRequest);
}
