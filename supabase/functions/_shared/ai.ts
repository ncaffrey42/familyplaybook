import { supabaseAdmin } from './stripe.ts';

// Shared AI generation limits (see SPEC_VOICE_TO_GUIDE.md / SPEC_HANDOFF_SHEET.md).
export const DAILY_CAP_PAID = 20;      // abuse protection, not economics
export const LIFETIME_CAP_FREE = 3;    // free-tier upsell taste

export type QuotaResult =
  | { ok: true; remaining: number | null }
  | { ok: false; status: number; error: string; code: string };

/**
 * Enforce AI-generation entitlement + quota for a user, shared by every AI
 * edge function so the free taste and paid daily cap are counted across ALL
 * AI features (voice guides, handoff bundles, …) from one ledger.
 *
 *   free  → 3 generations lifetime, then upgrade_required (403)
 *   paid  → requires the ai_generation entitlement, then 20/day (429)
 */
export async function checkAiQuota(userId: string): Promise<QuotaResult> {
  const { data: billing } = await supabaseAdmin
    .from('user_billing')
    .select('plan_key')
    .eq('user_id', userId)
    .maybeSingle();
  const planKey = billing?.plan_key ?? 'free';

  if (planKey === 'free') {
    const { count } = await supabaseAdmin
      .from('ai_generations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if ((count ?? 0) >= LIFETIME_CAP_FREE) {
      return {
        ok: false,
        status: 403,
        code: 'upgrade_required',
        error: `You've used your ${LIFETIME_CAP_FREE} free AI generations. Upgrade to keep using AI.`,
      };
    }
    return { ok: true, remaining: LIFETIME_CAP_FREE - (count ?? 0) - 1 };
  }

  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('id, plan_entitlements(feature_key, feature_value_int)')
    .eq('plan_key', planKey)
    .maybeSingle();
  const ent = (plan?.plan_entitlements ?? []).find(
    (e: { feature_key: string }) => e.feature_key === 'ai_generation',
  );
  if (!ent || (ent.feature_value_int ?? 0) < 1) {
    return { ok: false, status: 403, code: 'upgrade_required', error: 'AI generation is not included in your plan.' };
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabaseAdmin
    .from('ai_generations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', todayStart.toISOString());
  if ((count ?? 0) >= DAILY_CAP_PAID) {
    return {
      ok: false,
      status: 429,
      code: 'rate_limited',
      error: `Daily limit of ${DAILY_CAP_PAID} AI generations reached — try again tomorrow.`,
    };
  }
  return { ok: true, remaining: null };
}

/** Record one successful AI generation. Best-effort — a failed ledger write
 * is logged, not thrown (the generation already succeeded). */
export async function recordAiGeneration(userId: string, kind: string): Promise<void> {
  const { error } = await supabaseAdmin.from('ai_generations').insert({ user_id: userId, kind });
  if (error) console.error(`[ai] ledger insert failed (${kind}):`, error.message);
}
