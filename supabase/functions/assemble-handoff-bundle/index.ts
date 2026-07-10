import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { supabaseAdmin, requireUser } from '../_shared/stripe.ts';
import { checkAiQuota, recordAiGeneration } from '../_shared/ai.ts';

// Occasion presets → the caregiver role the brief is written for.
export const OCCASIONS: Record<string, string> = {
  babysitter: 'a babysitter watching the kids',
  family: 'grandparents or family staying with the household',
  housesitter: 'a house-sitter looking after the home',
  petsitter: 'a pet-sitter caring for the animals',
  travel: 'someone covering while the family is away',
};

const MAX_CANDIDATES = 60;

interface Candidate { id: string; name: string; category: string | null; description: string | null; }

// ── Pure, testable helpers ────────────────────────────────────────────────────

export function isValidOccasion(o: unknown): o is string {
  return typeof o === 'string' && Object.prototype.hasOwnProperty.call(OCCASIONS, o);
}

/**
 * Keep only guide_ids the model was actually given (drop hallucinations),
 * preserve the model's order, and de-dupe. Returns [] if nothing valid.
 */
export function validateGuideIds(returned: unknown, candidateIds: Set<string>): string[] {
  if (!Array.isArray(returned)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of returned) {
    if (typeof id === 'string' && candidateIds.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

// ── OpenAI ──────────────────────────────────────────────────────────────────

function systemPrompt(occasion: string): string {
  return `You are assembling a bundle of existing household guides for ${OCCASIONS[occasion]}.

From the candidate guides provided (each has an id, name, category, description), CHOOSE the subset that this specific person actually needs, and ORDER them by priority.

Rules:
- Put emergency, medical/allergy, and contact/where-things-are guides FIRST.
- Then the routines and tasks relevant to this role; skip guides that don't apply.
- Choose ONLY from the provided candidate ids. NEVER invent an id, guide, or content.
- Prefer a focused set (roughly 3-10 guides) over dumping everything.
- bundle_name: ≤50 chars, warm and specific (e.g. "Saturday with the Kids", "While We're in Denver").
- bundle_description: 1-2 sentences addressed to the caregiver.`;
}

async function curate(
  occasion: string,
  note: string,
  candidates: Candidate[],
  apiKey: string,
): Promise<{ bundle_name: string; bundle_description: string; guide_ids: string[] } | null> {
  const list = candidates
    .map((c) => `- id:${c.id} | ${c.name} | ${c.category ?? 'Uncategorized'} | ${c.description ?? ''}`)
    .join('\n');
  const userContent =
    `Candidate guides:\n${list}\n\n` +
    (note ? `Extra context from the family: ${note}\n\n` : '') +
    `Assemble the bundle now.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt(occasion) },
        { role: 'user', content: userContent },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'handoff_bundle',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['bundle_name', 'bundle_description', 'guide_ids'],
            properties: {
              bundle_name: { type: 'string' },
              bundle_description: { type: 'string' },
              guide_ids: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    }),
  });
  if (!res.ok) {
    console.error('[assemble-handoff-bundle] completion error:', res.status, await res.text());
    throw new Error('Assembly failed');
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

    const quota = await checkAiQuota(user.id);
    if (!quota.ok) return json({ error: quota.error, code: quota.code }, quota.status);

    const body = await req.json().catch(() => ({}));
    const { occasion, note, source_bundle_id } = body;
    if (!isValidOccasion(occasion)) {
      return json({ error: 'Pick an occasion for the handoff.', code: 'bad_request' }, 400);
    }
    const noteText = typeof note === 'string' ? note.trim().slice(0, 500) : '';

    // Gather candidate guides (default: all the user's guides; optionally a
    // single source bundle). Titles/descriptions only — keeps the prompt cheap.
    let query = supabaseAdmin
      .from('guides')
      .select('id, name, category, description, pack_guides!inner(pack_id)')
      .eq('user_id', user.id);
    if (typeof source_bundle_id === 'string') {
      query = supabaseAdmin
        .from('guides')
        .select('id, name, category, description, pack_guides!inner(pack_id)')
        .eq('user_id', user.id)
        .eq('pack_guides.pack_id', source_bundle_id);
    } else {
      query = supabaseAdmin
        .from('guides')
        .select('id, name, category, description')
        .eq('user_id', user.id);
    }
    const { data: rows, error: gErr } = await query.limit(MAX_CANDIDATES);
    if (gErr) throw gErr;

    const candidates: Candidate[] = (rows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string, name: r.name as string,
      category: (r.category as string) ?? null, description: (r.description as string) ?? null,
    }));
    if (candidates.length === 0) {
      return json({
        error: 'You have no guides yet — create a few, then assemble a handoff.',
        code: 'no_guides',
      }, 422);
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

    const result = await curate(occasion, noteText, candidates, apiKey);
    const candidateIds = new Set(candidates.map((c) => c.id));
    const chosen = validateGuideIds(result?.guide_ids, candidateIds);
    if (!result || chosen.length === 0) {
      return json({
        error: "We couldn't find guides that fit — add a few relevant guides and try again.",
        code: 'no_match',
      }, 422);
    }

    const name = (result.bundle_name || 'Handoff Bundle').trim().slice(0, 50);
    const description = (result.bundle_description || '').trim().slice(0, 300);

    // Create a real, normal bundle (packs + pack_guides). Positions carry the
    // AI's priority order so emergency guides render first.
    const { data: pack, error: pErr } = await supabaseAdmin
      .from('packs')
      .insert({ user_id: user.id, name, description, color: '#7C3AED' })
      .select('id')
      .single();
    if (pErr) throw pErr;

    const links = chosen.map((guide_id, i) => ({ pack_id: pack.id, guide_id, position: i }));
    const { error: pgErr } = await supabaseAdmin.from('pack_guides').insert(links);
    if (pgErr) throw pgErr;

    await recordAiGeneration(user.id, 'handoff_bundle');

    return json({ bundle_id: pack.id, guide_count: chosen.length, free_remaining: quota.remaining });
  } catch (err) {
    console.error('[assemble-handoff-bundle]', err);
    return json(
      { error: err.message === 'Unauthorized' ? 'Unauthorized' : (err.message || 'Something went wrong') },
      err.message === 'Unauthorized' ? 401 : 500,
    );
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
