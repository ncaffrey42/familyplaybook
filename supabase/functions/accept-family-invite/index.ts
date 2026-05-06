import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { supabaseAdmin, requireUser } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const acceptingUser = await requireUser(req);
    const { token } = await req.json();

    if (!token) {
      return json({ error: 'token is required' }, 400);
    }

    // Look up the invitation by token
    const { data: invitation, error: fetchError } = await supabaseAdmin
      .from('family_invitations')
      .select('id, owner_user_id, invited_email, status, role')
      .eq('token', token)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (!invitation) {
      return json({ error: 'Invitation not found.' }, 404);
    }

    if (invitation.status === 'accepted') {
      return json({ error: 'This invitation has already been accepted.' }, 409);
    }

    if (invitation.status !== 'pending') {
      return json({ error: 'This invitation is no longer valid.' }, 410);
    }

    // Prevent the owner from accepting their own invite
    if (invitation.owner_user_id === acceptingUser.id) {
      return json({ error: 'You cannot accept your own invitation.' }, 400);
    }

    // Mark accepted and link the accepting user
    const { error: updateError } = await supabaseAdmin
      .from('family_invitations')
      .update({
        status: 'accepted',
        invited_user_id: acceptingUser.id,
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invitation.id);

    if (updateError) throw updateError;

    // Increment editors usage for the owner
    await supabaseAdmin.rpc('increment_usage', {
      target_user_id: invitation.owner_user_id,
      key_name: 'editors',
      delta: 1,
    }).then(({ error }) => {
      if (error) console.warn('[accept-family-invite] usage increment failed:', error);
    });

    return json({
      success: true,
      owner_user_id: invitation.owner_user_id,
      role: invitation.role,
    });
  } catch (err) {
    console.error('[accept-family-invite]', err);
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
