import { createClient } from 'npm:@supabase/supabase-js@2';
import { billingUpdateFromEvent, productMapFromEnv } from './mapping.ts';

/**
 * RevenueCat webhook → reconcile native IAP purchases into user_billing.
 *
 * RevenueCat is configured (dashboard) to send its app_user_id = the Supabase
 * user id and an Authorization header = REVENUECAT_WEBHOOK_AUTH (a shared
 * secret). We verify that header, map the event to plan_key/status, and upsert
 * the SAME user_billing row the Stripe flow uses — so entitlements resolve
 * identically regardless of purchase channel.
 *
 * Deployed with --no-verify-jwt (RevenueCat has no Supabase JWT); the shared
 * secret is the auth.
 */

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function alreadyProcessed(eventId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('revenuecat_webhook_events')
    .select('id')
    .eq('id', eventId)
    .maybeSingle();
  return !!data;
}

async function recordProcessed(id: string, type: string, appUserId: string) {
  const { error } = await supabaseAdmin
    .from('revenuecat_webhook_events')
    .upsert({ id, type, app_user_id: appUserId }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) console.error('[revenuecat-webhook] ledger write failed:', error.message);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Shared-secret auth (set the same value as RevenueCat's Authorization header)
  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  if (!expected || req.headers.get('Authorization') !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: { event?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const event = body.event;
  if (!event || typeof event !== 'object') {
    return new Response('No event', { status: 400 });
  }

  const eventId = event.id as string;
  const appUserId = event.app_user_id as string; // = Supabase user id
  const type = event.type as string;

  if (!eventId || !appUserId) {
    return new Response('Missing event id or app_user_id', { status: 400 });
  }

  try {
    if (await alreadyProcessed(eventId)) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const update = billingUpdateFromEvent(event, productMapFromEnv((k) => Deno.env.get(k)));

    if (update) {
      // Only take over a row that isn't actively owned by Stripe, so a user's
      // web subscription is never clobbered by a stray store event.
      const { data: existing } = await supabaseAdmin
        .from('user_billing')
        .select('billing_provider, subscription_status')
        .eq('user_id', appUserId)
        .maybeSingle();

      const stripeOwned =
        existing?.billing_provider === 'stripe' &&
        ['active', 'trialing', 'past_due'].includes(existing?.subscription_status ?? '');

      if (stripeOwned) {
        console.warn(`[revenuecat-webhook] Skipping ${type} for ${appUserId}: row owned by an active Stripe subscription`);
      } else {
        const { error } = await supabaseAdmin
          .from('user_billing')
          .upsert(
            { user_id: appUserId, ...update, last_event_at: new Date().toISOString() },
            { onConflict: 'user_id' },
          );
        if (error) throw new Error(`user_billing upsert failed: ${error.message}`);
        console.log(`[revenuecat-webhook] ${type} → ${update.plan_key}/${update.subscription_status} for ${appUserId}`);
      }
    }

    await recordProcessed(eventId, type, appUserId);
    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[revenuecat-webhook] handler error:', err);
    return new Response(`Handler error: ${err.message}`, { status: 500 });
  }
});
