import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { supabaseAdmin, requireUser } from '../_shared/stripe.ts';
import { chunkGuide, contentHash, EMBEDDING_MODEL } from '../_shared/askPlaybook.ts';
import type { Chunk, GuideLike } from '../_shared/askPlaybook.ts';

// Owner-facing indexer for "Ask the Playbook" (docs/platform/ASK_PLAYBOOK.md §5).
// Authenticated, and every read/write is pinned to the caller's own guides —
// guide_embeddings has no client write policy at all, so this service-role path
// is the only way rows are ever created.

interface GuideRow extends GuideLike {
  id: string;
  name: string | null;
  description: string | null;
  steps: unknown;
}

interface EmbeddingRowRef {
  guide_id: string;
  content_hash: string;
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

/**
 * One request per guide, all of its chunks batched as an array input. The API
 * returns an `index` per item, which is authoritative for re-ordering.
 */
async function embedTexts(inputs: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
  });
  if (!res.ok) {
    console.error('[embed-guides] embedding error:', res.status, await res.text());
    throw new Error('Embedding failed');
  }
  const data = await res.json();
  const items = (data.data ?? []) as Array<{ index: number; embedding: number[] }>;
  const out: Array<number[] | undefined> = new Array(inputs.length);
  for (const item of items) out[item.index] = item.embedding;
  if (out.some((v) => !Array.isArray(v))) throw new Error('Embedding failed');
  return out as number[][];
}

/** pgvector accepts the JSON array literal form: `[0.1,0.2,...]`. */
function toVectorLiteral(embedding: number[]): string {
  return JSON.stringify(embedding);
}

// ── Indexing ──────────────────────────────────────────────────────────────────

/**
 * Re-embed one guide: replace its chunk rows wholesale rather than upserting,
 * so a guide that lost steps cannot leave orphaned chunks behind that would
 * still be retrievable.
 */
async function reembedGuide(
  guide: GuideRow,
  chunks: Chunk[],
  hash: string,
  userId: string,
  apiKey: string,
): Promise<void> {
  const vectors = await embedTexts(chunks.map((c) => c.content), apiKey);

  const { error: delErr } = await supabaseAdmin
    .from('guide_embeddings')
    .delete()
    .eq('guide_id', guide.id);
  if (delErr) throw delErr;

  const { error: insErr } = await supabaseAdmin.from('guide_embeddings').insert(
    chunks.map((c, i) => ({
      guide_id: guide.id,
      user_id: userId,
      chunk_index: c.chunk_index,
      content: c.content,
      content_hash: hash,
      embedding: toVectorLiteral(vectors[i]),
    })),
  );
  if (insErr) throw insErr;
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

    const body = await req.json().catch(() => ({}));
    const requested = Array.isArray(body?.guide_ids)
      ? (body.guide_ids as unknown[]).filter((id): id is string => typeof id === 'string')
      : null;

    // Always filtered by user_id: a caller can name guide ids, never own them.
    let query = supabaseAdmin
      .from('guides')
      .select('id, name, description, steps')
      .eq('user_id', user.id);
    if (requested) query = query.in('id', requested);

    const { data: rows, error: gErr } = await query;
    if (gErr) throw gErr;

    const guides = (rows ?? []) as GuideRow[];
    if (guides.length === 0) return json({ embedded: 0, skipped: 0 });

    // One read for every guide's current hash, so the common "nothing changed"
    // call costs a single query and zero OpenAI spend.
    const { data: existingRows, error: eErr } = await supabaseAdmin
      .from('guide_embeddings')
      .select('guide_id, content_hash')
      .eq('user_id', user.id)
      .in('guide_id', guides.map((g) => g.id));
    if (eErr) throw eErr;

    const hashByGuide = new Map<string, string>();
    for (const row of (existingRows ?? []) as EmbeddingRowRef[]) {
      hashByGuide.set(row.guide_id, row.content_hash);
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

    let embedded = 0;
    let skipped = 0;

    for (const guide of guides) {
      const hash = contentHash(guide);

      // Idempotency: an existing row already carrying this hash means the guide
      // has not changed since it was indexed.
      if (hashByGuide.get(guide.id) === hash) {
        skipped++;
        continue;
      }

      const chunks = chunkGuide(guide);
      if (chunks.length === 0) {
        // Nothing embeddable left (guide emptied out). Drop any stale rows so
        // deleted content can never be retrieved, but count it as skipped —
        // no embedding was produced.
        const { error: delErr } = await supabaseAdmin
          .from('guide_embeddings')
          .delete()
          .eq('guide_id', guide.id);
        if (delErr) throw delErr;
        skipped++;
        continue;
      }

      await reembedGuide(guide, chunks, hash, user.id, apiKey);
      embedded++;
    }

    return json({ embedded, skipped });
  } catch (err) {
    console.error('[embed-guides]', err);
    const message = err instanceof Error ? err.message : 'Something went wrong';
    return json(
      { error: message === 'Unauthorized' ? 'Unauthorized' : message },
      message === 'Unauthorized' ? 401 : 500,
    );
  }
}

// Unconditional, matching all 13 existing functions in this repo. An
// `import.meta.main` guard would risk the server never starting if the Supabase
// edge runtime doesn't treat this module as main, and buys nothing here — the
// unit tests exercise _shared/askPlaybook.ts, never this file.
Deno.serve(handleRequest);
