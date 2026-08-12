# Ask the Playbook / Alfred — grounded Q&A over one workspace's shared content

**Supersedes** `SPEC_ASK_PLAYBOOK.md` (commit `f1e7ff3`, branch
`claude/spec-ask-playbook`, 2026-07-10), which was written pre-tenancy and
left four decisions open. Those decisions are **resolved** here (§3). The
original's core design — grounding threshold, mandatory citations, refusal
discipline, pgvector, per-link rate limits — is carried over intact; what
changes is the scoping model and the host framing.

Deliverable of Prompt 7. Read [`RBAC.md`](RBAC.md) §1.2 and
[`SHARING.md`](SHARING.md) first — this feature is an anonymous surface and
inherits both documents' constraints.

---

## 1. One surface, two products

> A babysitter at 9pm: *"can Ella have peanuts?"*
> A guest at 11pm: *"what's the wifi?"*

These are the same question shape against the same machinery. **Alfred is
not a second system** — it is this function, reached from a host workspace's
guest link, with vertical-specific copy. The retrieval path, the scope
resolution, the grounding guard, the citation rule and the rate limiter are
byte-identical.

| | Family vertical | Host vertical |
|---|---|---|
| Product name | "Ask the Playbook" | **Alfred** |
| Who asks | Babysitter, grandparent, house-sitter | Short-stay guest |
| Reached from | A shared bundle link | A property's guest guide link (*also* a shared bundle link) |
| Scope | That bundle's shared guides | That property's shared guides |

The only vertical-dependent thing is the label, which comes from workspace
data, exactly like `content_categories` (`CONTENT_ENGINE.md` §3) and
`workspace_roles.label` (`RBAC.md` §2.1). **No code forks per vertical.**

This is also why Prompt 9 gets the guest VA for free: a property's guest
link is already a bundle share, so `ask-playbook` serves it with no new
endpoint.

## 2. Scope: exactly one workspace's shared content

The security crux, and the main revision to the original spec.

**Rule:** a question is answered from the guides reachable through **one
share link**, which belong to **one workspace**. Retrieval never spans
workspaces, and never reaches content the share doesn't already expose.

The caller supplies a `share_id` and **never a guide list**. Scope is
resolved server-side, inside `SECURITY DEFINER`, by the same rules
`get_shared_content()` already applies:

1. The link exists.
2. It has not expired (`expires_at`). **An expired link must answer
   nothing** — otherwise Alfred becomes a bypass for the expiry feature the
   product sells.
3. Its target guides are still `is_shareable`.
4. For a bundle share: the bundle's guides. For a guide share: that guide.
5. Every resolved guide must share **one** `workspace_id`. If they don't,
   the request is refused rather than silently narrowed.

Point 5 is inert today and load-bearing tomorrow. Until
`ARCHITECTURE.md`'s migration #4 lands, `guides.workspace_id` is `NULL` and
the single-owner bijection (`ARCHITECTURE.md` §3.1) makes "one owner" and
"one workspace" the same set. The check is written now, in terms of
`COALESCE(workspace_id, user_id)`, so it keeps holding through the
migration instead of needing to be retrofitted afterwards.

**No `TO anon` RLS policy is added.** `guide_embeddings` is owner-read-only;
guests reach it exclusively through `SECURITY DEFINER`. This is
`RBAC.md` §1.2's rule, and this feature is the sharpest test of it — a
retrieval system is an enumeration primitive if you scope it wrong.

## 3. The four open decisions, resolved

| # | Original question | **Resolved** | Consequence |
|---|---|---|---|
| 1 | v1 surface: share page, or build real Host Mode first? | **Share page now.** Host Mode stays the non-functional mockup it is (`featureFlags.js` comment); Prompt 8 replaces it properly. | The one working anonymous surface. Zero dependency on unbuilt tenancy. |
| 2 | Free for all, or paid owners only? | **Paid owners' links only.** Resolved from the link owner's `user_billing.plan_key`. | A guest on a free owner's link sees no Ask affordance at all — not a disabled one. |
| 3 | Guest rate limit | **20 questions / hour / share link.** | Per-link, not per-IP: the link is the unit of sharing and the unit an owner can revoke. |
| 4 | Store guest questions? | **Counts only.** Question and answer text are never persisted. | Matches `SHARING.md` §5.1's access-log posture and Prompt 10's "no third-party analytics" commitment. |

**On #2** — the original recommended this for the same reason and I agree,
but the growth cost is real and worth stating: the guest experience is the
viral surface, and gating it means most guests never see it. The mitigation
is that a paid owner's guests *do* see it, and "my sitter asked it and it
just answered" is the referral. Revisit with data; it's a plan-entitlement
row, not a code change.

**On #4** — counts-only is a privacy floor, not a default to relax casually.
A babysitter's questions ("can Ella have peanuts") are health data about a
child. Owner opt-in to see question text is deliberately **not** built here;
if it ever is, it needs its own consent design, and Prompt 18's
"unanswered questions" digest must work from *refusal counts per link*, not
stored text.

## 4. Data model

```sql
CREATE EXTENSION IF NOT EXISTS vector;   -- pgvector, available in-project

guide_embeddings (
  id, guide_id → guides ON DELETE CASCADE, user_id → auth.users,
  chunk_index int, content text, content_hash text,
  embedding vector(1536),                 -- text-embedding-3-small
  updated_at timestamptz
)
  UNIQUE (guide_id, chunk_index)          -- re-embed is an upsert, not a duplicate
  hnsw (embedding vector_cosine_ops)      -- ANN index
  RLS: owner SELECT only. No anon policy, ever.

ask_playbook_usage (
  share_id → shared_links ON DELETE CASCADE,
  hour_bucket timestamptz,                -- date_trunc('hour', now())
  question_count int, refusal_count int,
  PRIMARY KEY (share_id, hour_bucket)
)
  RLS: owner SELECT via the link; writes only through SECURITY DEFINER.
```

`ask_playbook_usage` is bucketed, not per-event: bounded growth, O(1) rate
checks, and it carries the counts-only analytics from decision #4 (including
the refusal counter Prompt 18 needs) without storing a single question.

## 5. The pipeline

```
Owner saves a guide
  └─ embed-guides (authenticated)
       chunk 0 = name + description; chunk N = step N
       skip when content_hash matches → idempotent, cheap
       → guide_embeddings (upsert on (guide_id, chunk_index))

Guest asks
  └─ POST /functions/v1/ask-playbook { share_id, question }
       1. resolve_ask_scope(share_id)  ── SECURITY DEFINER, §2
          → { guide_ids, owner_id, workspace_key, is_paid, allowed }
       2. rate limit: 20/hour/share_id           → 429
       3. lazily embed any in-scope guide whose hash is stale
       4. embed the question
       5. match_playbook_chunks(share_id, embedding, k=5)  ── SECURITY DEFINER
       6. best similarity < THRESHOLD → refuse, NO LLM call
       7. gpt-4o-mini, excerpts only, fenced as data not instructions
       8. answer must cite ≥1 in-scope guide, else downgrade to refusal
       → { answer, grounded, sources[], remaining }
```

Steps 6 and 8 are the two independent grounding gates: **retrieval-side**
(nothing similar enough was found) and **generation-side** (the model
answered without citing). Either one alone is insufficient — 6 can't catch
a model that ignores good context, 8 can't catch a model that confabulates
from a weak-but-passing chunk.

## 6. Refusal discipline

The refusal is a **first-class product state**, not an error:

> "I don't see that in this playbook — try asking the family directly."
> *(host: "…try messaging your host.")*

Rules, all enforced server-side:

- Below threshold → refuse **without calling the LLM** (cost + drift).
- Grounded answers **must** carry ≥1 citation resolving to an in-scope
  guide. A citation to anything else is treated as a hallucinated source
  and downgrades the whole answer to a refusal.
- The system prompt fences retrieved content explicitly as *data, not
  instructions* — guide text is owner-authored and therefore untrusted for
  injection purposes.
- Never invent phone numbers, doses, codes, addresses, names or times.

## 7. Tuning constants — provisional, and honestly so

| Constant | Value | Basis |
|---|---|---|
| `SIMILARITY_THRESHOLD` | **0.35** cosine distance | **Not calibrated.** A starting point, to be set by the eval set in §9. |
| `MATCH_COUNT` | 5 chunks | From the original spec; guides are small. |
| `RATE_LIMIT_PER_HOUR` | 20 / share / hour | Decision #3. |
| Embedding model | `text-embedding-3-small` (1536d) | Original spec. |
| Answer model | `gpt-4o-mini` | Original spec. |

The threshold is the single most consequential number in this feature and
**it has not been tuned against real data** — see §10. It is defined once,
in `_shared/askPlaybook.ts`, so calibrating it is a one-line change.

## 8. Client

`src/components/AskPlaybook.jsx` on `/share/:shareId`, gated on
`VITE_ENABLE_ASK_PLAYBOOK` **and** on the server reporting the link is
eligible (paid owner, bundle-or-guide share). Single-turn (no conversational
memory — out of scope, as in the original). Refusals render as a normal,
composed state with a nudge to browse the guides, never as an error.

## 9. Eval-driven plan

The spec's own framing: *"Budget the time for the eval loop — that's where a
trustworthy answer (vs. a plausible wrong one) is won."*

- **`evals/ask-playbook/cases.json`** — 30 cases over a seed household:
  in-scope questions with a known correct source guide, and adversarial
  out-of-scope questions expecting refusal, including prompt-injection
  attempts planted in guide text.
- **`evals/ask-playbook/run.mjs`** — runs cases against a deployed
  `ask-playbook`, asserting: correct source cited · zero invented specifics
  · out-of-scope ⇒ refusal · injected instructions ignored. Reports
  precision/recall on the refusal boundary, which is what the threshold
  should be tuned against.
- **Unit (vitest)** — the pure logic extracted into `_shared/askPlaybook.ts`:
  chunking, hashing, citation validation, threshold branch.

## 10. Status — what is built, what is proven

**Built:** migration, both edge functions, shared pure logic, client
component, eval set + runner, unit tests.

**Not proven — read this before trusting the feature:**

1. **The eval loop has never been run.** It needs the migration applied, the
   functions deployed, and an OpenAI key. Everything in §9 is written and
   unexecuted.
2. **`SIMILARITY_THRESHOLD = 0.35` is a guess.** It is the number that
   decides whether a stressed babysitter gets an answer or a refusal, and
   picking it without data is exactly what §7 of the original spec warns
   against. **Do not enable this flag in production before running the
   eval set and setting this from the data.**
3. **The unit tests have never executed** — `vitest` cannot start in this
   environment (Node v16.17 vs. rolldown requiring `node:util`'s
   `styleText`, Node ≥20.12). This is pre-existing and unrelated to this
   change, but it means the pure-logic tests are unverified too.
4. **Nothing is deployed and no migration is applied.**

The honest summary: this is a complete, reviewable implementation of an
eval-driven design, with the evals written and the loop **not closed**. The
code is ready for the loop to run; the feature is not ready for users until
it has.

## 11. Out of scope

Conversational memory · voice questions · a real Host Mode (Prompt 8) ·
owner-facing question analytics beyond counts (Prompt 18, and see §3 #4) ·
cross-workspace search (never — §2).
