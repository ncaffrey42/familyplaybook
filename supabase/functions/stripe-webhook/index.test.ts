// Tests for the webhook processor's idempotency + ordering behavior.
//
// index.ts transitively imports ../_shared/stripe.ts, which constructs the
// Stripe and Supabase clients at module load from env vars. Those clients are
// never used here (we inject fakes into makeProcessor), but they must construct,
// so run the tests with dummy values:
//
//   STRIPE_SECRET_KEY=sk_test_dummy \
//   SUPABASE_URL=http://localhost:54321 \
//   SUPABASE_SERVICE_ROLE_KEY=dummy \
//   deno test --no-check --allow-env --allow-net supabase/functions/stripe-webhook/index.test.ts
//
// --no-check runs on JS semantics; it sidesteps a pre-existing strict-mode
// `catch (err) { err.message }` pattern in index.ts that predates these tests.
import { assertEquals } from 'jsr:@std/assert@1';
import { makeProcessor } from './index.ts';

const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();

// ── Minimal in-memory Supabase fake ────────────────────────────────────────────
// Supports just the query shapes the webhook uses: select().eq().maybeSingle(),
// upsert(obj, {onConflict, ignoreDuplicates}), and update(obj).eq().

class FakeBuilder {
  op: string | null = null;
  payload: Record<string, unknown> | null = null;
  opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  filters: [string, unknown][] = [];

  constructor(private table: string, private store: Record<string, Record<string, unknown>[]>) {}

  select() { this.op ??= 'select'; return this; }
  eq(col: string, val: unknown) { this.filters.push([col, val]); return this; }
  upsert(obj: Record<string, unknown>, opts = {}) { this.op = 'upsert'; this.payload = obj; this.opts = opts; return this; }
  update(obj: Record<string, unknown>) { this.op = 'update'; this.payload = obj; return this; }

  private rows() { return (this.store[this.table] ??= []); }
  private matches(row: Record<string, unknown>) { return this.filters.every(([c, v]) => row[c] === v); }

  private exec() {
    const rows = this.rows();
    if (this.op === 'upsert') {
      const key = this.opts.onConflict!;
      const idx = rows.findIndex(r => r[key] === this.payload![key]);
      if (idx >= 0) {
        if (!this.opts.ignoreDuplicates) rows[idx] = { ...rows[idx], ...this.payload };
      } else {
        rows.push({ ...this.payload });
      }
      return { data: null, error: null };
    }
    if (this.op === 'update') {
      rows.forEach((r, i) => { if (this.matches(r)) rows[i] = { ...r, ...this.payload }; });
      return { data: null, error: null };
    }
    return { data: rows.filter(r => this.matches(r)), error: null };
  }

  maybeSingle() {
    const res = this.exec();
    const data = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;
    return Promise.resolve({ data, error: null });
  }

  // Awaiting the builder (upsert/update with no maybeSingle) executes it.
  then(resolve: (v: unknown) => void) { resolve(this.exec()); }
}

class FakeSupabase {
  store: Record<string, Record<string, unknown>[]> = {};
  from(table: string) { return new FakeBuilder(table, this.store); }
}

// Stripe must never be called on the happy path tested here (customer resolves
// from user_billing, no schedule, no cancel). Fail loudly if it is.
const stripeStub = new Proxy({}, {
  get() { throw new Error('Stripe should not be called in this test'); },
}) as never;

function subscriptionUpdatedEvent(opts: {
  id: string;
  created: number;
  customer: string;
  planKey?: string;   // sets metadata.plan_key; omit to simulate a Billing-Portal change
  priceId?: string;   // live price id (default 'price_x' is intentionally unmapped)
}) {
  const metadata: Record<string, string> = { billing_interval: 'month' };
  if (opts.planKey) metadata.plan_key = opts.planKey;
  return {
    id: opts.id,
    type: 'customer.subscription.updated',
    created: opts.created,
    data: {
      object: {
        id: 'sub_1',
        customer: opts.customer,
        status: 'active',
        cancel_at_period_end: false,
        schedule: null,
        current_period_end: 1_700_000_000,
        metadata,
        items: { data: [{ id: 'si_1', price: { id: opts.priceId ?? 'price_x', recurring: { interval: 'month' } } }] },
      },
    },
  } as never;
}

function setup() {
  const db = new FakeSupabase();
  db.store.user_billing = [
    { user_id: 'u1', stripe_customer_id: 'cus_1', plan_key: 'free', last_event_at: null },
  ];
  db.store.stripe_webhook_events = [];
  const { processEvent } = makeProcessor({ supabaseAdmin: db as never, stripe: stripeStub });
  return { db, processEvent };
}

const billingRow = (db: FakeSupabase) => db.store.user_billing[0];

Deno.test('a normal event is applied and recorded', async () => {
  const { db, processEvent } = setup();

  const result = await processEvent(
    subscriptionUpdatedEvent({ id: 'evt_1', created: 2000, customer: 'cus_1', planKey: 'couple' }),
  );

  assertEquals(result.duplicate, false);
  assertEquals(billingRow(db).plan_key, 'couple');
  assertEquals(billingRow(db).last_event_at, iso(2000));
  assertEquals(db.store.stripe_webhook_events.length, 1);
  assertEquals(db.store.stripe_webhook_events[0].id, 'evt_1');
});

Deno.test('a duplicate event id is a no-op', async () => {
  const { db, processEvent } = setup();
  // First delivery applies couple.
  await processEvent(subscriptionUpdatedEvent({ id: 'evt_1', created: 2000, customer: 'cus_1', planKey: 'couple' }));

  // Re-delivery of the SAME id carrying a different plan must not apply.
  const result = await processEvent(
    subscriptionUpdatedEvent({ id: 'evt_1', created: 9000, customer: 'cus_1', planKey: 'family' }),
  );

  assertEquals(result.duplicate, true);
  assertEquals(billingRow(db).plan_key, 'couple');       // unchanged
  assertEquals(billingRow(db).last_event_at, iso(2000));  // unchanged
  assertEquals(db.store.stripe_webhook_events.length, 1); // no second ledger row
});

Deno.test('a Billing-Portal change (no app metadata) reconciles plan_key from the live price', async () => {
  // A plan change made in the Stripe Billing Portal never writes our metadata —
  // the only signal is the live price. The webhook must still resolve the tier.
  Deno.env.set('STRIPE_PRICE_FAMILY_MONTH', 'price_fam_m');
  const { db, processEvent } = setup();

  await processEvent(
    subscriptionUpdatedEvent({ id: 'evt_portal', created: 2000, customer: 'cus_1', priceId: 'price_fam_m' }),
  );

  assertEquals(billingRow(db).plan_key, 'family');
});

Deno.test('an out-of-order (older) event does not overwrite newer state', async () => {
  const { db, processEvent } = setup();
  // Newer event applies family at t=3000.
  await processEvent(subscriptionUpdatedEvent({ id: 'evt_new', created: 3000, customer: 'cus_1', planKey: 'family' }));

  // An older event (t=1000) for couple arrives late — must be dropped.
  const result = await processEvent(
    subscriptionUpdatedEvent({ id: 'evt_old', created: 1000, customer: 'cus_1', planKey: 'couple' }),
  );

  assertEquals(result.duplicate, false);                  // not a duplicate, but stale
  assertEquals(billingRow(db).plan_key, 'family');        // newer state preserved
  assertEquals(billingRow(db).last_event_at, iso(3000));  // not regressed
});
