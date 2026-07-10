import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { supabaseAdmin, requireUser } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const owner = await requireUser(req);
    const { email, role = 'editor' } = await req.json();

    if (!email || typeof email !== 'string') {
      return json({ error: 'email is required' }, 400);
    }
    if (!['viewer', 'editor'].includes(role)) {
      return json({ error: 'role must be viewer or editor' }, 400);
    }

    const normalizedEmail = email.trim().toLowerCase();
    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:3000';

    // Check entitlement: count current accepted/pending members
    const { count, error: countError } = await supabaseAdmin
      .from('family_invitations')
      .select('*', { count: 'exact', head: true })
      .eq('owner_user_id', owner.id)
      .in('status', ['pending', 'accepted']);

    if (countError) throw countError;

    // Pull plan entitlement for editors_max
    const { data: usageSub } = await supabaseAdmin
      .from('user_subscriptions')
      .select('plan_id')
      .eq('user_id', owner.id)
      .maybeSingle();

    if (usageSub?.plan_id) {
      const { data: entitlement } = await supabaseAdmin
        .from('plan_entitlements')
        .select('feature_value_int, is_unlimited')
        .eq('plan_id', usageSub.plan_id)
        .eq('feature_key', 'editors_max')
        .maybeSingle();

      if (entitlement && !entitlement.is_unlimited) {
        const limit = entitlement.feature_value_int ?? 0;
        if ((count ?? 0) >= limit) {
          return json({ error: 'Member limit reached for your plan.', code: 'LIMIT_REACHED' }, 403);
        }
      }
    }

    // Upsert invitation — reuse existing record if already invited
    const { data: invitation, error: upsertError } = await supabaseAdmin
      .from('family_invitations')
      .upsert(
        {
          owner_user_id: owner.id,
          invited_email: normalizedEmail,
          role,
          status: 'pending',
        },
        {
          onConflict: 'owner_user_id,invited_email',
          ignoreDuplicates: false,
        },
      )
      .select('token, status')
      .single();

    if (upsertError) throw upsertError;

    // If the member had previously been removed, reset them to pending
    if (invitation.status === 'removed') {
      const { data: updated, error: resetError } = await supabaseAdmin
        .from('family_invitations')
        .update({ status: 'pending', invited_user_id: null, accepted_at: null })
        .eq('owner_user_id', owner.id)
        .eq('invited_email', normalizedEmail)
        .select('token')
        .single();

      if (resetError) throw resetError;
      invitation.token = updated.token;
    }

    const inviteUrl = `${appUrl}/invite/accept?token=${invitation.token}`;

    // Send the invitation email via Supabase Auth.
    // NOTE: admin.generateLink only GENERATES a link — it never sends email.
    // inviteUserByEmail actually sends (and creates the user) but fails for
    // existing users; for those we send a magic-link email via the anon
    // client's signInWithOtp, which also delivers a real email.
    let emailSent = false;
    try {
      const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        normalizedEmail,
        { redirectTo: inviteUrl },
      );
      if (!inviteError) {
        emailSent = true;
      } else {
        const supabaseAnon = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_ANON_KEY')!,
        );
        const { error: otpError } = await supabaseAnon.auth.signInWithOtp({
          email: normalizedEmail,
          options: { emailRedirectTo: inviteUrl },
        });
        if (!otpError) emailSent = true;
        else console.warn('[send-family-invite] email delivery failed:', otpError.message);
      }
    } catch (err) {
      // Email delivery is best-effort; the invite link still works
      console.warn('[send-family-invite] email delivery failed:', err.message);
    }

    return json({ invite_url: inviteUrl, email_sent: emailSent });
  } catch (err) {
    console.error('[send-family-invite]', err);
    return json(
      { error: err.message },
      err.message === 'Unauthorized' ? 401 : 500,
    );
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
