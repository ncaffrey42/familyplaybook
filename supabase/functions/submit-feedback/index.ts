import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { supabaseAdmin, requireUser } from '../_shared/stripe.ts';

/**
 * In-app feedback: validate, persist, and fan out to any configured
 * destinations. Each destination is independently enabled by the presence of
 * its secret(s) — no code changes to toggle:
 *
 *   Google Sheet : FEEDBACK_SHEETS_URL      (Apps Script web-app URL)
 *   Slack        : FEEDBACK_SLACK_WEBHOOK   (incoming-webhook URL)
 *   Email        : RESEND_API_KEY + FEEDBACK_EMAIL_TO [+ FEEDBACK_EMAIL_FROM]
 *
 * Fan-out is best-effort: a failing destination is reported in the response
 * but never fails the submission itself.
 */

const KINDS = new Set(['bubble', 'setup', 'first_action']);
const RATINGS = new Set(['up', 'down']);
const MAX_MESSAGE = 2000;

interface Delivery {
  destination: string;
  ok: boolean;
}

function summaryLine(email: string, kind: string, rating: string | null, message: string | null): string {
  const emoji = rating === 'up' ? '👍' : rating === 'down' ? '👎' : '💬';
  const kindLabel = kind === 'setup' ? 'after setup' : kind === 'first_action' ? 'after first guide' : 'feedback bubble';
  return `${emoji} ${email} (${kindLabel})${message ? `: “${message}”` : ''}`;
}

async function fanOut(payload: {
  email: string;
  kind: string;
  rating: string | null;
  message: string | null;
  context: Record<string, unknown>;
  created_at: string;
}): Promise<Delivery[]> {
  const deliveries: Delivery[] = [];
  const line = summaryLine(payload.email, payload.kind, payload.rating, payload.message);

  const sheetsUrl = Deno.env.get('FEEDBACK_SHEETS_URL');
  if (sheetsUrl) {
    try {
      const res = await fetch(sheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      deliveries.push({ destination: 'sheets', ok: res.ok });
    } catch (_) {
      deliveries.push({ destination: 'sheets', ok: false });
    }
  }

  const slackWebhook = Deno.env.get('FEEDBACK_SLACK_WEBHOOK');
  if (slackWebhook) {
    try {
      const res = await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: line,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: line } },
            {
              type: 'context',
              elements: [{
                type: 'mrkdwn',
                text: `${payload.context.platform ?? 'web'} · ${payload.context.route ?? '?'} · ${payload.created_at}`,
              }],
            },
          ],
        }),
      });
      deliveries.push({ destination: 'slack', ok: res.ok });
    } catch (_) {
      deliveries.push({ destination: 'slack', ok: false });
    }
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const emailTo = Deno.env.get('FEEDBACK_EMAIL_TO');
  if (resendKey && emailTo) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: Deno.env.get('FEEDBACK_EMAIL_FROM') ?? 'Family Playbook <onboarding@resend.dev>',
          to: [emailTo],
          subject: `App feedback: ${payload.rating ?? 'note'} (${payload.kind})`,
          text: `${line}\n\nRoute: ${payload.context.route ?? '?'}\nPlatform: ${payload.context.platform ?? 'web'}\nVersion: ${payload.context.version ?? '?'}\nAt: ${payload.created_at}`,
        }),
      });
      deliveries.push({ destination: 'email', ok: res.ok });
    } catch (_) {
      deliveries.push({ destination: 'email', ok: false });
    }
  }

  return deliveries;
}

async function handleRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireUser(req);
    const body = await req.json();

    const kind = KINDS.has(body.kind) ? body.kind : 'bubble';
    const rating = RATINGS.has(body.rating) ? body.rating : null;
    const message = typeof body.message === 'string' && body.message.trim()
      ? body.message.trim().slice(0, MAX_MESSAGE)
      : null;

    if (!rating && !message) {
      return new Response(JSON.stringify({ error: 'Say something — a thumb or a note.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const context = {
      route: typeof body.route === 'string' ? body.route.slice(0, 200) : null,
      platform: typeof body.platform === 'string' ? body.platform.slice(0, 20) : 'web',
      version: typeof body.version === 'string' ? body.version.slice(0, 40) : null,
    };

    // Checkpoints are once-ever (unique index): keep the first submission,
    // treat a duplicate as success so a second device never errors.
    const { data: row, error } = await supabaseAdmin
      .from('feedback')
      .insert({ user_id: user.id, kind, rating, message, context })
      .select('id, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return new Response(JSON.stringify({ success: true, duplicate: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw error;
    }

    const deliveries = await fanOut({
      email: user.email ?? user.id,
      kind,
      rating,
      message,
      context,
      created_at: row.created_at,
    });

    return new Response(JSON.stringify({ success: true, deliveries }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[submit-feedback]', err);
    return new Response(JSON.stringify({ error: err.message, success: false }), {
      status: err.message === 'Unauthorized' ? 401 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

Deno.serve(handleRequest);
