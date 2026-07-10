import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { supabaseAdmin, requireUser } from '../_shared/stripe.ts';

// ── Limits (see SPEC_VOICE_TO_GUIDE.md) ───────────────────────────────────────
export const DAILY_CAP_PAID = 20;       // abuse protection, not economics
export const LIFETIME_CAP_FREE = 3;     // free-tier upsell taste
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

// Must match GuideIconPicker's standardIcons — every name is guaranteed to
// render through GuideIcon.
export const ALLOWED_ICONS = [
  'FileText', 'Book', 'BookOpen', 'Heart', 'Star', 'Home', 'Zap', 'Activity',
  'Map', 'Compass', 'Coffee', 'Music', 'Camera', 'Image', 'Video', 'Mic',
  'Smile', 'ThumbsUp', 'Flag', 'Bell', 'Calendar', 'Clock', 'Cloud', 'Sun',
  'Moon', 'Umbrella', 'Key', 'Lock', 'Unlock', 'Shield', 'Award', 'Gift',
];
export const ALLOWED_CATEGORIES = ['How To', 'Find It', 'Reference'];

// ── Pure, testable helpers ────────────────────────────────────────────────────

export interface GuideDraft {
  name: string;
  description: string;
  category: string;
  icon: string;
  steps: Array<{ title: string; text: string }>;
}

/** Clamp/repair a model-produced draft so it can never break the client. */
export function sanitizeDraft(raw: unknown): GuideDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;

  const name = typeof d.name === 'string' ? d.name.trim().slice(0, 60) : '';
  if (!name) return null;

  const rawSteps = Array.isArray(d.steps) ? d.steps : [];
  const steps = rawSteps
    .map((s) => {
      const step = (s ?? {}) as Record<string, unknown>;
      return {
        title: typeof step.title === 'string' ? step.title.trim().slice(0, 50) : '',
        text: typeof step.text === 'string' ? step.text.trim() : '',
      };
    })
    .filter((s) => s.text || s.title)
    .slice(0, 10);
  if (steps.length === 0) return null;

  return {
    name,
    description: typeof d.description === 'string' ? d.description.trim().slice(0, 300) : '',
    category: ALLOWED_CATEGORIES.includes(d.category as string) ? (d.category as string) : 'How To',
    icon: ALLOWED_ICONS.includes(d.icon as string) ? (d.icon as string) : 'FileText',
    steps,
  };
}

// ── Quota ─────────────────────────────────────────────────────────────────────

type QuotaResult =
  | { ok: true; remaining: number | null }
  | { ok: false; status: number; error: string; code: string };

async function checkQuota(userId: string): Promise<QuotaResult> {
  const { data: billing } = await supabaseAdmin
    .from('user_billing')
    .select('plan_key')
    .eq('user_id', userId)
    .maybeSingle();
  const planKey = billing?.plan_key ?? 'free';

  if (planKey === 'free') {
    // Free tier: a lifetime taste of the feature.
    const { count } = await supabaseAdmin
      .from('ai_generations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if ((count ?? 0) >= LIFETIME_CAP_FREE) {
      return {
        ok: false,
        status: 403,
        code: 'upgrade_required',
        error: `You've used your ${LIFETIME_CAP_FREE} free AI generations. Upgrade to keep dictating guides.`,
      };
    }
    return { ok: true, remaining: LIFETIME_CAP_FREE - (count ?? 0) - 1 };
  }

  // Paid tiers: require the ai_generation entitlement, then a daily cap.
  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('id, plan_entitlements(feature_key, feature_value_int)')
    .eq('plan_key', planKey)
    .maybeSingle();
  const ent = (plan?.plan_entitlements ?? []).find(
    (e: { feature_key: string }) => e.feature_key === 'ai_generation',
  );
  if (!ent || (ent.feature_value_int ?? 0) < 1) {
    return {
      ok: false,
      status: 403,
      code: 'upgrade_required',
      error: 'AI generation is not included in your plan.',
    };
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

// ── OpenAI calls ──────────────────────────────────────────────────────────────

/** Whisper infers the container from the FILENAME extension, so it must
 * match the blob's actual type — Chrome/Android record webm, iOS Safari
 * records mp4/aac. */
export function audioFilename(mimeType: string): string {
  const t = (mimeType || '').toLowerCase();
  if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) return 'audio.m4a';
  if (t.includes('mpeg') || t.includes('mp3')) return 'audio.mp3';
  if (t.includes('wav')) return 'audio.wav';
  if (t.includes('ogg')) return 'audio.ogg';
  return 'audio.webm';
}

async function transcribe(audio: Blob, apiKey: string): Promise<string> {
  const form = new FormData();
  form.append('file', audio, audioFilename(audio.type));
  form.append('model', 'whisper-1');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    // Log the upstream detail for operators; never expose it to clients.
    const body = await res.text();
    console.error('[voice-to-guide] whisper error:', res.status, body);
    throw new Error('Transcription failed');
  }
  const data = await res.json();
  return (data.text ?? '').trim();
}

const SYSTEM_PROMPT = `You turn a family member's spoken ramble into a clear household guide for the Family Playbook app. The reader is often a stressed babysitter, grandparent, or house guest on a phone.

Rules:
- Use ONLY information the speaker actually said. NEVER invent phone numbers, doses, addresses, names, times, or amounts. If a detail is missing, leave it out.
- Merge rambling into 2-10 clean, ordered steps. Each step: a short title (≤50 chars) and one or two plain sentences.
- name: ≤60 chars, what the guide is about (e.g. "Cat Feeding", "Wifi & TV Setup").
- description: 1-2 sentences summarizing the guide.
- category: "Find It" when the recording is mostly about where things are; "Reference" for facts, contacts, or lists; otherwise "How To".
- icon: pick the single most fitting name from the allowed list.`;

async function structureGuide(transcript: string, apiKey: string): Promise<unknown> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Transcript of the recording:\n\n${transcript}` },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'guide_draft',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'description', 'category', 'icon', 'steps'],
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              category: { type: 'string', enum: ALLOWED_CATEGORIES },
              icon: { type: 'string', enum: ALLOWED_ICONS },
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['title', 'text'],
                  properties: {
                    title: { type: 'string' },
                    text: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('[voice-to-guide] completion error:', body);
    throw new Error('Guide generation failed');
  }
  const data = await res.json();
  return JSON.parse(data.choices?.[0]?.message?.content ?? 'null');
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await requireUser(req);

    const quota = await checkQuota(user.id);
    if (!quota.ok) return json({ error: quota.error, code: quota.code }, quota.status);

    const formData = await req.formData();
    const audio = formData.get('audio');
    if (!(audio instanceof Blob) || audio.size === 0) {
      return json({ error: 'No audio provided', code: 'bad_request' }, 400);
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return json({ error: 'Recording too large — keep it under 3 minutes.', code: 'too_large' }, 413);
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

    const transcript = await transcribe(audio, apiKey);
    if (transcript.length < 10) {
      return json({
        error: "We couldn't make a guide out of that — try again, a bit slower and closer to the mic.",
        code: 'empty_transcript',
      }, 422);
    }

    const draft = sanitizeDraft(await structureGuide(transcript, apiKey));
    if (!draft) {
      return json({
        error: "We couldn't structure that into a guide — try describing one task at a time.",
        code: 'unusable_transcript',
      }, 422);
    }

    // Record usage only after a successful generation.
    const { error: ledgerError } = await supabaseAdmin
      .from('ai_generations')
      .insert({ user_id: user.id, kind: 'voice_guide' });
    if (ledgerError) console.error('[voice-to-guide] ledger insert failed:', ledgerError.message);

    // The transcript is returned for the review banner only — it is never
    // persisted (see spec: privacy decision).
    return json({ transcript, guide: draft, free_remaining: quota.remaining });
  } catch (err) {
    console.error('[voice-to-guide]', err);
    return json(
      { error: err.message === 'Unauthorized' ? 'Unauthorized' : (err.message || 'Something went wrong') },
      err.message === 'Unauthorized' ? 401 : 500,
    );
  }
}

// Guarded so importing this module in tests doesn't start a server.
if (import.meta.main) {
  Deno.serve(handleRequest);
}
