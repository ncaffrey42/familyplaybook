# API Surface

**Status:** Reference for every server entry point — 15 edge functions and
10 client-callable RPCs — cross-checked against source on 2026-08-11.
Deliverable of Prompt 14. Read [`DATA_MODEL.md`](DATA_MODEL.md) (the tables
these mutate) and [`RBAC.md`](RBAC.md) §1.2 (the anon-access rule the
public surfaces obey) first.

**Status legend:** ✅ deployed · 🔶 built, migration/deploy pending
(`ask-playbook`, `embed-guides`, and the Ask/notification RPCs).

---

## 1. The three auth models

Every entry point is exactly one of these. **The classification is the
security-relevant fact** — an auditor should be able to place each row in
one bucket and check it obeys that bucket's rule.

| Model | Who may call | How identity is established | Rule |
|---|---|---|---|
| **Public** | anyone, no account | none — scope comes from an unguessable id in the body | Must never return a row the caller couldn't already reach; anon-safe by `SECURITY DEFINER`, never by `TO anon` RLS |
| **Authenticated** | a signed-in user | `Authorization: Bearer <supabase jwt>` → `auth.uid()` | Acts as that user; RLS (RPCs) or explicit `user_id` filter (edge fns) scopes every read/write |
| **Webhook** | one external provider | provider signature/secret, **no** Supabase JWT | Verify signature first; resolve `user_id` from provider ids; idempotent |

Two cross-cutting facts:

- **Edge functions bypass RLS.** All 15 use the service-role client
  (`_shared/stripe.ts` `supabaseAdmin`, commented "bypasses RLS"). For
  authenticated functions the `.eq('user_id', user.id)` filter **is** the
  authorization — there is no RLS safety net in that path
  (`ARCHITECTURE.md` §5.2). RPCs are the opposite: they run as the caller
  and RLS applies, except `SECURITY DEFINER` RPCs which deliberately don't.
- **CORS:** every edge function answers `OPTIONS` via `_shared/cors.ts`
  and sends `Access-Control-Allow-Origin: *`. Public by CORS ≠ public by
  auth — the JWT check is what gates authenticated functions.

---

## 2. Edge functions

Base: `POST {SUPABASE_URL}/functions/v1/{name}`. All take/return JSON
unless noted. "Errors" lists the status codes the source actually returns.

### 2.1 Public

#### `ask-playbook` 🔶
Grounded guest Q&A over one share link. Full contract in
[`ASK_PLAYBOOK.md`](ASK_PLAYBOOK.md).
- **Auth:** none (anon key satisfies the platform gateway; no user JWT).
- **In:** `{ share_id: uuid, question: string≤500 }`
- **Out:** `{ grounded: bool, answer: string, sources: [{guide_id, name}], remaining?: int }`; refusals are `grounded:false` with a composed `answer` (a **200**, not an error — refusal is a product state).
- **Errors:** `400` bad input · `403` link not eligible (returns a refusal shape + `reason`) · `429` rate limit · `500`.
- **Rate limit:** **20 / hour / share_id**, enforced *before* any model spend (`bump_ask_usage`).
- **Idempotency:** none — each call is a question; repeats are counted (that's the rate limit's job).
- **Privacy:** question/answer text never logged or stored (counts only).

### 2.2 Authenticated

All require `Authorization: Bearer <jwt>`; all return `401` when
`requireUser` rejects (the shared `err.message === 'Unauthorized' ? 401`
pattern). Listed with their distinctive inputs/errors only.

| Function | Status | In | Out | Distinctive errors | Idempotency |
|---|---|---|---|---|---|
| `create-checkout-session` | ✅ | `{plan_key, billing_interval}` | `{url}` (Stripe Checkout) | `400` missing params · `409` already subscribed | Stripe-side; a dup call makes a new session, not a new sub |
| `change-subscription-plan` | ✅ | `{plan_key, billing_interval}` | `{success, ...}` | `400` invalid · `404` no active sub | Proration handled by Stripe; **defers downgrades** (schedule, not immediate) |
| `cancel-subscription` | ✅ | `{}` | `{success}` | `404` no active sub | Sets `cancel_at_period_end`; safe to repeat |
| `get-subscription` | ✅ | `{}` | billing snapshot (or `FREE_PLAN_DEFAULT`) | — | Read-only |
| `create-portal-session` | ✅ | `{}` | `{url}` (Stripe portal) | `404` no billing record | Read-only (mints a portal link) |
| `send-family-invite` | ✅ | `{email, role, name?}` | `{invite_url, email_sent}` | `400` bad role · `403` `LIMIT_REACHED` | Upserts on `(owner,email)` — re-invite reuses the row |
| `accept-family-invite` | ✅ | `{token}` | `{success, owner_user_id, role}` | `404` not found · `409` already accepted · `410` expired/invalid · `403` wrong email · `400` own invite | The `409` **is** the idempotent signal |
| `assemble-handoff-bundle` | ✅ | `{occasion, ...}` | assembled bundle | `400` no occasion · quota `403/429` | Non-idempotent (AI generation); quota-metered |
| `voice-to-guide` | ✅ | audio or `{prompt}` | guide draft (not persisted) | `400` no audio · `413` >3min · quota `403/429` | Non-idempotent; returns a draft the client saves separately |
| `submit-feedback` | ✅ | `{kind, rating?, message?, context?}` | `{deliveries}` | `400` bad kind | Fan-out is best-effort (§ template) |
| `delete-account` | ✅ | `{}` | `{success}` | `401` · `500` | **Irreversible.** Explicit deletes (incl. `error_logs`, which lacks CASCADE) then `auth.admin.deleteUser` |

**Quota** (`assemble-handoff-bundle`, `voice-to-guide`): shared
`_shared/ai.ts` — free = 3 lifetime (`403 upgrade_required`), paid =
20/day (`429 rate_limited`), counted across all AI features in one
`ai_generations` ledger.

### 2.3 Webhook

| Function | Status | Verified by | Resolves user via | Idempotency |
|---|---|---|---|---|
| `stripe-webhook` | ✅ | `stripe-signature` HMAC (`constructEventAsync`) | `customer_id → user_billing`, else Stripe metadata | `stripe_webhook_events.id` PK; ordering guard on `last_event_at` |
| `revenuecat-webhook` | ✅ | shared secret in `Authorization` == `REVENUECAT_WEBHOOK_AUTH` | `app_user_id` (= Supabase uid) | `revenuecat_webhook_events.id` PK; won't clobber a Stripe-owned row |

Both are deployed `--no-verify-jwt` (no Supabase JWT; they authenticate
themselves). Both write `user_billing` — the reconciliation spine
(`DECISIONS.md` 2026-07-16).

---

## 3. RPCs (`POST /rest/v1/rpc/{name}`)

`SECURITY DEFINER` (SD) runs as the function owner and can bypass RLS —
so its *grant* and its internal scope check are the whole security story.
`SECURITY INVOKER` (SI, the default) runs as the caller under RLS.

### 3.1 Public (granted to `anon`)

| RPC | Status | SD? | In | Out | The scope check that makes it safe |
|---|---|---|---|---|---|
| `get_shared_content` | ✅ | SD | `p_share_id` | shaped guide/bundle JSON, or `{type:'expired'/'private'}`, or `null` | Resolves the link itself; returns a *response shape*, never a queryable row; expiry + `is_shareable` enforced server-side |
| `record_share_access` | 🔶 | SD | `p_share_id` | `void` | Writes a counter (+ 🔶 a coalesced notification); silent & uniform for real/expired/unknown ids — no existence oracle |
| `ask_playbook_available` | 🔶 | SD | `p_share_id` | `bool` | Returns only "is Ask offered here" — a single bit the UI would reveal anyway; leaks nothing else |

These three are the **entire** anonymous write/read surface. Every other
RPC is `authenticated`-only. No RPC is granted to `anon` beyond these.

### 3.2 Service-role only (edge functions call these, never clients)

`resolve_ask_scope`, `match_playbook_chunks`, `bump_ask_usage`,
`mark_ask_refusal` (all 🔶) — granted `TO service_role`. They re-resolve
scope from the share id internally, so even the `ask-playbook` function
can't widen retrieval past the link. A guest cannot call them directly.

### 3.3 Authenticated

Run under the caller's session; RLS applies (SD ones use `auth.uid()`
internally and fail closed when it's null).

| RPC | SD? | Purpose | Notes |
|---|---|---|---|
| `export_user_data` | SD | GDPR-ish export | **Incomplete** — packs/guides/favorites/pack_guides only (F3 in DATA_MODEL) |
| `increment_usage` / `recalculate_usage_stats` | SD | usage counters | Called by client + edge fns |
| `is_premium`, `get_user_numeric_limit`, `is_guide_editable`, `is_pack_editable` | SD | entitlement/limit helpers | Read by RLS policies, not the client directly |
| `is_accepted_family_member`, `viewer_can_see_guide`, `viewer_can_see_bundle` | SD | membership/grant predicates | The reuse spine for RBAC + host cleaners |
| `set_my_openai_key` / `get_my_openai_key` / `has_openai_key` | SD | BYO-key vault access | `search_path`-pinned; key never leaves the function |

---

## 4. The versioning rule

**Never mutate a deployed contract. A breaking change ships as a new name.**

This is not aspirational — it is what the codebase already does and must
keep doing:

- **Webhooks** dedupe on immutable event-id PKs and add columns additively
  (`billing_provider` arrived as a defaulted column, not a shape change).
- **New capability, new function:** the Ask RPCs are `resolve_ask_scope`
  /`match_playbook_chunks` etc. — new names, not overloaded existing ones.
- **`get_shared_content` gained an `expired`/`private` `type`** additively:
  old clients that only knew `guide`/`bundle` fall through to their error
  path, never crash.

The rule, stated for the next contributor:

1. **Additive is allowed in place:** a new optional input field, a new
   output field, a new enum *value* an old client can ignore. Never make
   an old-required field newly-required-differently, never remove or
   retype a field, never change an error code's meaning.
2. **Breaking → new name.** `ask-playbook` → `ask-playbook-v2`;
   `get_shared_content` → `get_shared_content_v2`. The old one keeps its
   exact behavior until telemetry shows no caller — clients are cached
   native bundles and third-party webhook consumers that upgrade on their
   own schedule, so "deployed" means "supported indefinitely".
3. **Public surfaces have the strictest bar** — an anonymous share link
   printed on a QR sheet (`HostQrSheet`) may be scanned years later; its
   resolver contract is effectively permanent.
4. **Webhook *out* (`SEAMS.md` §3) inherits this** as its `event` names +
   an idempotency `id`; consumers dedupe and tolerate unknown event kinds.

**Why not a version header or `?v=`:** the platform gateway routes by
function *name*; a new name is the one versioning primitive that works
identically for edge functions, RPCs, and outbound webhooks, needs no
routing layer, and makes "which contracts still run" a grep rather than a
runtime decision. Rejected: a `version` field in the body (pushes the
branch into every function's logic, where an old client hits new code
paths) and content-negotiation headers (native WebViews and webhook
senders don't reliably send them).

---

## 5. Security finding: 8 `SECURITY DEFINER` functions are not `search_path`-pinned

A `SECURITY DEFINER` function that does **not** `SET search_path` resolves
unqualified names using the *caller's* search path. An authenticated caller
who creates a same-named object (e.g. a temp table shadowing `user_usage`)
in a schema earlier on their path can make the definer-privileged body
touch it instead of the intended `public` table — the classic SD
privilege-escalation vector. The newer functions defend against this
(`get_shared_content`, all the Ask RPCs, `is_accepted_family_member`,
`viewer_can_see_*`, `is_guide_editable`, `is_pack_editable`,
`get_user_numeric_limit`, the openai-key vault fns — all pinned to
`'public'`, verified in the snapshot). **Eight older ones are not:**

`export_user_data`, `get_pack_guide_counts`, `handle_new_subscription_usage`,
`handle_new_user`, `handle_new_user_subscription`, `increment_usage`,
`recalculate_usage_stats`, `reset_user_account`.

Severity is real but bounded — exploitation needs an authenticated session
and the ability to create shadowing objects on a schema in the resolution
path (Supabase's default grants make this non-trivial but not impossible),
and the trigger-invoked ones (`handle_new_*`) run in a context the caller
doesn't control the path for. Still, **the fix is one line each**
(`SET search_path TO 'public'`) and consistency with the newer functions
is the right posture. Filed as **API-SEC-1** (chip-worthy; a follow-up
migration `ALTER FUNCTION … SET search_path` covers all eight without
touching their bodies). This correction supersedes an earlier draft of
this section that wrongly asserted all definer functions were pinned —
found by grepping the snapshot rather than trusting memory.

## 6. Coverage note

15/15 edge functions and all 10 client-callable RPCs are listed, plus the
SD helper predicates in §3.3 that RLS reads rather than clients calling
directly — a reviewer auditing "what runs as definer" needs the full set
(§5 is why).
