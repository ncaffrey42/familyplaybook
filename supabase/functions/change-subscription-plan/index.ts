import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { stripe, supabaseAdmin, requireUser, getPriceId } from '../_shared/stripe.ts';

// Tier ordering for upgrade/downgrade comparison.
const PLAN_LEVEL: Record<string, number> = { free: 0, couple: 1, family: 2 };

function isoFromUnix(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireUser(req);
    const { plan_key, billing_interval } = await req.json();

    if (!plan_key || !billing_interval) {
      return new Response(JSON.stringify({ error: 'plan_key and billing_interval are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    const currentPlan = subscription.metadata?.plan_key ?? billing.plan_key ?? 'free';
    const currentLevel = PLAN_LEVEL[currentPlan] ?? 0;
    const targetLevel = PLAN_LEVEL[plan_key] ?? 0;
    const isDowngrade = targetLevel < currentLevel;

    // ── DOWNGRADE: apply at the end of the current billing period ──────────────
    // The user keeps the tier they paid for until the period ends, then drops.
    if (isDowngrade) {
      if (plan_key === 'free') {
        // Downgrade to Free = cancel the paid subscription at period end. There
        // is no 'free' Stripe price, so we never call getPriceId('free').
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

    // ── UPGRADE / interval switch: apply immediately with proration ────────────
    // If a pending downgrade schedule exists, release it first so the upgrade
    // takes over cleanly.
    if (subscription.schedule) {
      await stripe.subscriptionSchedules.release(subscription.schedule as string);
    }

    const newPriceId = getPriceId(plan_key, billing_interval);
    const isUpgrade = targetLevel > currentLevel;

    await stripe.subscriptions.update(billing.stripe_subscription_id, {
      items: [{ id: currentItemId, price: newPriceId }],
      proration_behavior: 'create_prorations',
      billing_cycle_anchor: isUpgrade ? 'now' : undefined,
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
});
