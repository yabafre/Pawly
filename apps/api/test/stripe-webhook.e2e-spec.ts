/**
 * `POST /api/stripe/webhook` — signature verification, idempotency and the
 * subscription-lifecycle handlers that need no Stripe API round trip.
 *
 * Story 3-1 (AC3 raw body, AC4 HMAC verification, AC5 idempotency via the
 * `StripeEvent` model, AC10 event routing) and Story 3-4 (AC4 cancellation,
 * AC5 payment failure, AC7 idempotency on every handler).
 *
 * Payloads are signed locally with `Stripe.webhooks.generateTestHeaderString`
 * and the `STRIPE_WEBHOOK_SECRET` from `.env.e2e`. Nothing here talks to
 * Stripe: the handlers exercised below (`customer.subscription.deleted`,
 * `invoice.paid`, `invoice.payment_failed`) are exactly the ones that resolve
 * entirely against the local database.
 */
import Stripe from 'stripe';
import { createTestHarness, type TestHarness } from './harness';
import { makeClinic, type ClinicFixture } from './helpers';

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

let eventCounter = 0;
const eventId = () =>
  `evt_it_${Date.now()}_${process.pid}_${(eventCounter += 1)}`;
const subscriptionId = () =>
  `sub_it_${Date.now()}_${process.pid}_${(eventCounter += 1)}`;

/** A Stripe-shaped envelope; only the fields the handlers read matter. */
function buildEvent(
  type: string,
  object: Record<string, unknown>,
  id = eventId(),
) {
  return {
    id,
    object: 'event',
    api_version: '2025-01-01',
    created: Math.floor(Date.now() / 1000),
    type,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  };
}

const invoicePayload = (stripeSubscriptionId: string, id: string) => ({
  id,
  object: 'invoice',
  parent: {
    type: 'subscription_details',
    subscription_details: { subscription: stripeSubscriptionId },
  },
});

describe('Stripe webhook (integration)', () => {
  let harness: TestHarness;
  let clinic: ClinicFixture;
  let stripeSubscriptionId: string;

  /** Signs `payload` and posts it exactly as Stripe would. */
  const deliver = (
    payload: unknown,
    options: { signature?: string; timestamp?: number } = {},
  ) => {
    const body = JSON.stringify(payload);
    const signature =
      options.signature ??
      Stripe.webhooks.generateTestHeaderString({
        payload: body,
        secret: WEBHOOK_SECRET,
        ...(options.timestamp ? { timestamp: options.timestamp } : {}),
      });

    return harness
      .http()
      .post('/api/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(body);
  };

  const readStatus = async () =>
    (
      await harness.prisma.subscription.findUniqueOrThrow({
        where: { clinicId: clinic.clinicId },
      })
    ).status;

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    stripeSubscriptionId = subscriptionId();
    clinic = await makeClinic(harness, {
      status: 'active',
      stripeSubscriptionId,
    });
  });

  afterEach(async () => {
    await harness.prisma.stripeEvent.deleteMany({
      where: { stripeEventId: { startsWith: 'evt_it_' } },
    });
    await clinic.cleanup();
  });

  // ── Story 3-1 AC4 — HMAC verification ──────────────────────────────────

  describe('signature verification', () => {
    it('rejects a payload with no stripe-signature header', async () => {
      const payload = buildEvent('customer.subscription.deleted', {});
      const res = await harness
        .http()
        .post('/api/stripe/webhook')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(payload));

      expect(res.status).toBe(400);
      expect(
        await harness.prisma.stripeEvent.findUnique({
          where: { stripeEventId: payload.id },
        }),
      ).toBeNull();
    });

    it('rejects a signature computed with the wrong secret', async () => {
      const payload = buildEvent('customer.subscription.deleted', {
        id: stripeSubscriptionId,
      });
      const forged = Stripe.webhooks.generateTestHeaderString({
        payload: JSON.stringify(payload),
        secret: 'whsec_this_is_not_the_configured_secret',
      });

      const res = await deliver(payload, { signature: forged });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/signature verification failed/i);
      // The event must not be claimed, or Stripe's retry would be swallowed.
      expect(
        await harness.prisma.stripeEvent.findUnique({
          where: { stripeEventId: payload.id },
        }),
      ).toBeNull();
      expect(await readStatus()).toBe('active');
    });

    it('rejects a body that was tampered with after signing', async () => {
      const original = buildEvent('customer.subscription.deleted', {
        id: stripeSubscriptionId,
      });
      const signature = Stripe.webhooks.generateTestHeaderString({
        payload: JSON.stringify(original),
        secret: WEBHOOK_SECRET,
      });

      const tampered = { ...original, type: 'invoice.payment_failed' };
      const res = await harness
        .http()
        .post('/api/stripe/webhook')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature)
        .send(JSON.stringify(tampered));

      expect(res.status).toBe(400);
      expect(await readStatus()).toBe('active');
    });

    it('rejects a signature whose timestamp is outside the tolerance', async () => {
      const payload = buildEvent('customer.subscription.deleted', {
        id: stripeSubscriptionId,
      });
      const anHourAgo = Math.floor(Date.now() / 1000) - 3600;

      const res = await deliver(payload, { timestamp: anHourAgo });

      expect(res.status).toBe(400);
      expect(await readStatus()).toBe('active');
    });

    it('rejects a garbage signature header', async () => {
      const res = await deliver(
        buildEvent('customer.subscription.deleted', {
          id: stripeSubscriptionId,
        }),
        { signature: 't=1,v1=deadbeef' },
      );
      expect(res.status).toBe(400);
    });
  });

  // ── Story 3-4 AC4/AC5 — lifecycle handlers ─────────────────────────────

  describe('subscription lifecycle', () => {
    it('cancels the subscription on customer.subscription.deleted', async () => {
      await harness.prisma.subscription.update({
        where: { clinicId: clinic.clinicId },
        data: { cancelAtPeriodEnd: true },
      });

      const payload = buildEvent('customer.subscription.deleted', {
        id: stripeSubscriptionId,
        object: 'subscription',
      });
      const res = await deliver(payload);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ received: true });

      const subscription = await harness.prisma.subscription.findUniqueOrThrow({
        where: { clinicId: clinic.clinicId },
      });
      expect(subscription.status).toBe('canceled');
      expect(subscription.cancelAtPeriodEnd).toBe(false);
    });

    it('moves the subscription to past_due on invoice.payment_failed, and back on invoice.paid', async () => {
      const failed = buildEvent(
        'invoice.payment_failed',
        invoicePayload(stripeSubscriptionId, 'in_it_failed'),
      );
      expect((await deliver(failed)).status).toBe(201);
      expect(await readStatus()).toBe('past_due');

      const paid = buildEvent(
        'invoice.paid',
        invoicePayload(stripeSubscriptionId, 'in_it_paid'),
      );
      expect((await deliver(paid)).status).toBe(201);
      expect(await readStatus()).toBe('active');
    });

    it('leaves an already-active subscription alone on invoice.paid', async () => {
      await harness.prisma.subscription.update({
        where: { clinicId: clinic.clinicId },
        data: { status: 'trialing' },
      });

      const paid = buildEvent(
        'invoice.paid',
        invoicePayload(stripeSubscriptionId, 'in_it_paid_noop'),
      );
      expect((await deliver(paid)).status).toBe(201);
      // Only a past_due subscription is recovered; trialing must not be
      // silently promoted to active.
      expect(await readStatus()).toBe('trialing');
    });

    it('acknowledges an event for a subscription it does not know', async () => {
      const payload = buildEvent('customer.subscription.deleted', {
        id: 'sub_it_never_seen_before',
        object: 'subscription',
      });

      const res = await deliver(payload);

      // Out-of-order delivery must be acknowledged, not retried forever.
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ received: true });
      expect(await readStatus()).toBe('active');
    });

    it('acknowledges and records an event type it does not route', async () => {
      const payload = buildEvent('customer.created', { id: 'cus_it_unrouted' });

      const res = await deliver(payload);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ received: true });
      const recorded = await harness.prisma.stripeEvent.findUniqueOrThrow({
        where: { stripeEventId: payload.id },
      });
      expect(recorded.type).toBe('customer.created');
      expect(await readStatus()).toBe('active');
    });

    it('rejects an invoice event that carries no subscription reference', async () => {
      const payload = buildEvent('invoice.payment_failed', {
        id: 'in_it_orphan',
        object: 'invoice',
      });

      const res = await deliver(payload);

      expect(res.status).toBe(201);
      expect(await readStatus()).toBe('active');
    });
  });

  // ── Story 3-1 AC5 / Story 3-4 AC7 — idempotency ────────────────────────

  describe('idempotency', () => {
    it('records the event id and type on first delivery', async () => {
      const payload = buildEvent('customer.subscription.deleted', {
        id: stripeSubscriptionId,
        object: 'subscription',
      });
      await deliver(payload);

      const recorded = await harness.prisma.stripeEvent.findUniqueOrThrow({
        where: { stripeEventId: payload.id },
      });
      expect(recorded.type).toBe('customer.subscription.deleted');
      expect(recorded.processedAt).toBeInstanceOf(Date);
    });

    it('acknowledges a replay without running the handler twice', async () => {
      const payload = buildEvent('customer.subscription.deleted', {
        id: stripeSubscriptionId,
        object: 'subscription',
      });

      expect((await deliver(payload)).status).toBe(201);
      expect(await readStatus()).toBe('canceled');

      // Rewind the side effect. If the replay reprocessed, it would cancel
      // again — the status is the witness.
      await harness.prisma.subscription.update({
        where: { clinicId: clinic.clinicId },
        data: { status: 'active' },
      });

      const replay = await deliver(payload);
      expect(replay.status).toBe(201);
      expect(replay.body).toEqual({ received: true });
      expect(await readStatus()).toBe('active');

      expect(
        await harness.prisma.stripeEvent.count({
          where: { stripeEventId: payload.id },
        }),
      ).toBe(1);
    });

    it('dedupes by event id, not by payload — a new id reprocesses', async () => {
      const first = buildEvent('invoice.payment_failed', {
        ...invoicePayload(stripeSubscriptionId, 'in_it_same'),
      });
      await deliver(first);
      expect(await readStatus()).toBe('past_due');

      await harness.prisma.subscription.update({
        where: { clinicId: clinic.clinicId },
        data: { status: 'active' },
      });

      // Identical body, different Stripe event id: a genuinely new delivery.
      const second = buildEvent(
        'invoice.payment_failed',
        { ...invoicePayload(stripeSubscriptionId, 'in_it_same') },
        eventId(),
      );
      await deliver(second);
      expect(await readStatus()).toBe('past_due');
    });

    it('survives two concurrent deliveries of the same event', async () => {
      const payload = buildEvent('customer.subscription.deleted', {
        id: stripeSubscriptionId,
        object: 'subscription',
      });

      const [a, b] = await Promise.all([deliver(payload), deliver(payload)]);

      // The claim is a unique insert, so exactly one wins and the loser is told
      // "duplicate" — neither may fail.
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(
        await harness.prisma.stripeEvent.count({
          where: { stripeEventId: payload.id },
        }),
      ).toBe(1);
      expect(await readStatus()).toBe('canceled');
    });

    /**
     * Not reachable without talking to Stripe: the only handlers that can fail
     * mid-processing (`checkout.session.completed`,
     * `customer.subscription.updated`) call `stripe.subscriptions.retrieve`
     * before touching the database, so forcing the failure would mean issuing a
     * real API request from the test suite. The unclaim-on-failure path is
     * covered by the unit suite
     * (`stripe-webhook.controller.spec.ts`), which mocks the Stripe client.
     */
    it.skip('releases the event claim when the handler throws, so Stripe can retry', () => {
      /* requires a Stripe API call — see comment above */
    });
  });
});
