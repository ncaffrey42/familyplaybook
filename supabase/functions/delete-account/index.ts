import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { stripe, supabaseAdmin, requireUser } from '../_shared/stripe.ts';

/**
 * Permanently delete the authenticated user's account and all their data.
 * Required by App Store guideline 5.1.1(v) and Google Play's account-deletion
 * policy — an in-app path to full deletion, not just a data reset.
 *
 * Order matters:
 *  1. Cancel any live Stripe subscription NOW so a deleted user is never
 *     billed again (deleting our row alone wouldn't stop Stripe).
 *  2. Delete rows that do NOT cascade from auth.users (error_logs has a plain
 *     FK with no ON DELETE rule, which would otherwise block the auth delete).
 *  3. auth.admin.deleteUser — cascades guides, packs, pack_guides, billing,
 *     favorites, usage, secrets, subscriptions, shared_links, profiles, etc.
 *     via their ON DELETE CASCADE constraints.
 */
async function handleRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireUser(req);

    // 1. Cancel a live Stripe subscription immediately (irreversible; the user
    //    asked to delete the account). Best-effort — never block deletion on a
    //    Stripe hiccup, but log it.
    const { data: billing } = await supabaseAdmin
      .from('user_billing')
      .select('stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (billing?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(billing.stripe_subscription_id);
      } catch (err) {
        console.error('[delete-account] Stripe cancel failed (continuing):', err.message);
      }
    }

    // 2. Delete non-cascading rows first.
    await supabaseAdmin.from('error_logs').delete().eq('user_id', user.id);

    // 3. Delete the auth user — cascades everything else.
    const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (delError) throw delError;

    console.log(`[delete-account] Deleted user ${user.id}`);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[delete-account]', err);
    return new Response(JSON.stringify({ error: err.message, success: false }), {
      status: err.message === 'Unauthorized' ? 401 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

Deno.serve(handleRequest);
