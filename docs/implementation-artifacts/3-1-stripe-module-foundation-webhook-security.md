# Story 3.1: Stripe Module Foundation & Webhook Security

Status: done

## Story

As a developer,
I need to set up the NestJS Stripe module with secure webhook handling and subscription data models,
so that the application can safely process Stripe events and track subscription state.

## Acceptance Criteria

1. **AC1 - Stripe Module Structure:** `stripe.module.ts` and `stripe.service.ts` are created in `apps/api/src/modules/stripe/` following the established NestJS module pattern (MailModule reference).

2. **AC2 - Webhook Controller:** `stripe-webhook.controller.ts` receives POST requests on `/api/stripe/webhook` with proper Swagger decorators (exception: webhook route itself per architecture spec).

3. **AC3 - Raw Body Parser:** Raw body parser is applied ONLY to the webhook route (not global JSON parser). Uses NestJS built-in `rawBody: true` option with `RawBodyRequest<Request>` interface.

4. **AC4 - HMAC Signature Verification:** All incoming webhooks are verified via `stripe.webhooks.constructEvent()` using the raw body Buffer, `stripe-signature` header, and `STRIPE_WEBHOOK_SECRET` (NFR19).

5. **AC5 - Idempotency:** `StripeEvent` model (from Story 1.4) stores `event.id` (Stripe string format like `evt_1234...`, NOT UUID) in `stripeEventId` for idempotency — duplicate events are rejected before processing. Check-before-process, save-after-success pattern.

6. **AC6 - No Card Data:** No card data is stored or transmitted by Pawly servers (NFR18). All payment processing delegated to Stripe Checkout and Billing Portal.

7. **AC7 - Environment Configuration:** `STRIPE_SECRET_KEY` (as `z.string().startsWith('sk_')`) and `STRIPE_WEBHOOK_SECRET` (as `z.string().startsWith('whsec_')`) are added to `apps/api/src/config/env.config.ts` Zod schema for runtime validation. Both are required strings.

8. **AC8 - Database Migration:** Subscription and StripeEvent tables exist in the database via `pnpm db:push` (schemas already defined in Story 1.4).

9. **AC9 - Stripe SDK Installation:** `stripe` npm package (v19.x+) is installed in `apps/api` as a dependency.

10. **AC10 - Event Routing Skeleton:** Webhook handler includes a switch/case skeleton for subscription lifecycle events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Each case logs the event but delegates actual business logic to Story 3.2+.

## Tasks / Subtasks

- [x] **Task 1: Install Stripe SDK & Configure Environment** (AC: #7, #9)
  - [x] 1.1 Install `stripe` package in `apps/api`: `pnpm add stripe --filter=api`
  - [x] 1.2 Add to `apps/api/src/config/env.config.ts` Zod schema: `STRIPE_SECRET_KEY: z.string().startsWith('sk_')` and `STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_')`
  - [x] 1.3 Add `STRIPE_WEBHOOK_SECRET` value to `.env` (use Stripe CLI or Dashboard)
  - [x] 1.4 Add both variables to `.env.example` as placeholders

- [x] **Task 2: Enable Raw Body Parsing** (AC: #3)
  - [x] 2.1 Update `apps/api/src/main.ts` to pass `rawBody: true` option to `NestFactory.create<NestExpressApplication>()`
  - [x] 2.2 Import `NestExpressApplication` from `@nestjs/platform-express`
  - [x] 2.3 Verify existing JSON body parsing still works for all other routes

- [x] **Task 3: Create Stripe Module** (AC: #1)
  - [x] 3.1 Create directory `apps/api/src/modules/stripe/`
  - [x] 3.2 Create `stripe.module.ts` with `@Module` decorator, imports `PrismaModule`, exports `StripeService`
  - [x] 3.3 Create `stripe.service.ts` with `@Injectable` — inject `ConfigService` to initialize `new Stripe(secretKey)` in constructor (follow MailService pattern)
  - [x] 3.4 Add methods: `constructWebhookEvent(rawBody, signature)`, `isEventProcessed(eventId)`, `markEventProcessed(eventId, type)`
  - [x] 3.5 Register `StripeModule` in `apps/api/src/app.module.ts` imports

- [x] **Task 4: Create Webhook Controller** (AC: #2, #4, #5, #10)
  - [x] 4.1 Create `stripe-webhook.controller.ts` in `apps/api/src/modules/stripe/`
  - [x] 4.2 Define `@Controller('api/stripe')` with `@Post('webhook')` endpoint
  - [x] 4.3 Mark webhook route as `@Public()` (bypass JWT auth guard — webhooks come from Stripe, not authenticated users). Import from `import { Public } from '@/common/decorators/public.decorator';`
  - [x] 4.4 Extract raw body via `@Req() req: RawBodyRequest<Request>` and `req.rawBody`
  - [x] 4.5 Extract signature via `@Headers('stripe-signature')`
  - [x] 4.6 Call `stripe.webhooks.constructEvent()` for HMAC verification
  - [x] 4.7 Implement idempotency check: query `StripeEvent` by `stripeEventId`, reject if exists
  - [x] 4.8 Implement event routing switch/case skeleton for lifecycle events
  - [x] 4.9 Save processed event to `StripeEvent` table after successful handling
  - [x] 4.10 Return `{ received: true }` with 200 status on success, 400 on signature failure

- [x] **Task 5: Database Schema Push** (AC: #8)
  - [x] 5.1 Run `pnpm db:push` to create Subscription and StripeEvent tables in Neon
  - [x] 5.2 Run `pnpm db:generate` to regenerate Prisma Client
  - [x] 5.3 Verify seed still works: `pnpm db:seed`

- [x] **Task 6: Shared Validators** (AC: #1)
  - [x] 6.1 Create `packages/validators/src/stripe/` directory
  - [x] 6.2 Create `webhook.schema.ts` with Zod schemas for webhook event validation. IMPORTANT: `stripeEventId` is `z.string()` (Stripe format `evt_*`), NOT `z.string().uuid()`. Same for `stripeCustomerId` (`cus_*`) and `stripeSubscriptionId` (`sub_*`).
  - [x] 6.3 Export from `packages/validators/src/index.ts`

- [x] **Task 7: Testing** (AC: all)
  - [x] 7.1 Write `stripe.service.spec.ts` — test constructWebhookEvent, idempotency methods (mock Stripe SDK + Prisma)
  - [x] 7.2 Write `stripe-webhook.controller.spec.ts` — test webhook endpoint (mock StripeService, test signature verification flow)
  - [x] 7.3 Test error scenarios: invalid signature returns 400, duplicate event returns 200 (idempotent), missing raw body returns 400
  - [x] 7.4 Test that webhook route bypasses JWT auth guard
  - [x] 7.5 Run `pnpm test` — all tests pass, zero regressions
  - [x] 7.6 Run `pnpm build` — build green

## Dev Notes

### Architecture Compliance

- **Module Location:** `apps/api/src/modules/stripe/` — follows established NestJS module pattern (auth, mail)
- **Service Pattern:** Follow `MailService` DI pattern — inject `ConfigService<EnvConfig, true>`, initialize Stripe client in constructor
- **No Frontend Changes:** This is a pure backend story. No `apps/web` modifications needed.
- **Webhook Route:** The Stripe webhook controller is the ONLY REST endpoint exception to Swagger decorators (per architecture spec). However, add `@ApiTags('Stripe')` and `@ApiExcludeEndpoint()` to keep it discoverable but not documented.

### Raw Body Configuration (CRITICAL)

NestJS 10+ supports `rawBody: true` natively in `NestFactory.create()` options:

```typescript
// main.ts
const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  rawBody: true,  // Enables req.rawBody as Buffer
});
```

Access in controller:
```typescript
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';

@Post('webhook')
async handleWebhook(
  @Req() req: RawBodyRequest<Request>,
  @Headers('stripe-signature') signature: string,
) {
  const event = this.stripeService.constructWebhookEvent(
    req.rawBody,   // Buffer
    signature,
  );
}
```

This approach is the official NestJS pattern (from docs.nestjs.com). It does NOT affect other routes — JSON parsing continues to work globally. The `rawBody` is available on ALL routes as an additional property but is only needed for the webhook route.

### Stripe SDK Version & API

- **Package:** `stripe` v20.x (latest stable with Context7 docs)
- **API Version:** Will use the SDK default API version
- **Key Pattern:** `constructEvent(rawBody, signature, webhookSecret, tolerance?)` — tolerance defaults to 300 seconds
- **Checkout:** Use `stripe.checkout.sessions.create()` with `mode: 'subscription'` (Story 3.2)
- **Billing Portal:** Use `stripe.billingPortal.sessions.create()` (Story 3.4)
- **No `@stripe/stripe-js` needed** — Stripe Checkout is hosted, no client-side Stripe.js

### Webhook Security (NFR19)

```typescript
// HMAC signature verification flow
try {
  const event = stripe.webhooks.constructEvent(
    req.rawBody,           // Must be raw Buffer — NOT parsed JSON
    req.headers['stripe-signature'],
    webhookSecret,
  );
} catch (err) {
  // Return 400 — Stripe will retry
  throw new BadRequestException(`Webhook signature verification failed: ${err.message}`);
}
```

- Signatures valid for 300 seconds (replay protection)
- `constructEvent` throws `Stripe.errors.StripeSignatureVerificationError` on failure
- NEVER log or expose the webhook secret

### Idempotency Pattern

```typescript
// Check-before-process, save-after-success
async handleWebhook(event: Stripe.Event) {
  // 1. Check if already processed
  const existing = await prisma.stripeEvent.findUnique({
    where: { stripeEventId: event.id }
  });
  if (existing) return { received: true }; // Acknowledge silently

  // 2. Process event (switch/case)
  await this.processEvent(event);

  // 3. Mark as processed AFTER success
  await prisma.stripeEvent.create({
    data: { stripeEventId: event.id, type: event.type }
  });
}
```

- If processing fails, event ID is NOT saved → Stripe retries (up to 3 days, exponential backoff)
- `stripeEventId` has `@unique` constraint — prevents race conditions on concurrent deliveries
- Use `upsert` patterns in event handlers for safe replayability

### Auth Guard Bypass

The webhook endpoint must bypass the global `JwtAuthGuard` because webhooks come from Stripe servers, not authenticated users. Use the `@Public()` decorator already established in the auth module:

```typescript
@Public()  // Bypasses JwtAuthGuard
@Post('webhook')
async handleWebhook(...) { }
```

### Event Types to Handle (Skeleton)

| Event | Purpose | Story |
|-------|---------|-------|
| `checkout.session.completed` | Create Clinic + Admin + Subscription + Magic Link | 3.2 |
| `customer.subscription.updated` | Update subscription status, planKey, currentPeriodEnd | 3.4 |
| `customer.subscription.deleted` | Set status to canceled, revoke access | 3.4 |
| `invoice.payment_failed` | Set status to past_due, notify admin | 3.4 |

In this story (3.1), each case simply logs the event type and data. Actual business logic is implemented in subsequent stories.

### Multi-Tenant Considerations

- Webhook handler does NOT filter by `clinicId` — it processes ALL incoming Stripe events globally
- The `checkout.session.completed` handler (Story 3.2) will CREATE the clinic, so no clinicId exists yet
- Subscription lookup webhooks (updated/deleted) will use `stripeSubscriptionId` to find the correct Subscription record
- This is the ONE place where we don't need clinicId-based isolation — Stripe events are already scoped by their own customer/subscription IDs

### Project Structure Notes

```
apps/api/src/modules/stripe/
  ├── stripe.module.ts           # NestJS module definition
  ├── stripe.service.ts          # Stripe SDK wrapper + idempotency
  └── stripe-webhook.controller.ts  # POST /api/stripe/webhook
```

Alignment with architecture doc:
- `apps/api/src/stripe/` referenced in architecture → using `apps/api/src/modules/stripe/` for consistency with existing module structure (auth, mail are in `modules/`)
- No conflict detected

### References

- [Source: docs/planning-artifacts/architecture.md#Server-Side Libraries (Required)] — `stripe` (v19.x): Stripe Node SDK for Checkout Sessions, Billing Portal, Coupons, and webhook handling. Server-only (NestJS).
- [Source: docs/planning-artifacts/architecture.md#Authentication & Security] — Stripe Webhook Security: HMAC signature verification via `stripe.webhooks.constructEvent()`. Raw body parser applied ONLY to `/api/stripe/webhook` route.
- [Source: docs/planning-artifacts/architecture.md#Data Architecture] — Stripe Event Deduplication (`StripeEvent.prisma`): Store `event.id` to ensure webhook idempotency.
- [Source: docs/planning-artifacts/epics.md#Story 3.1] — Acceptance Criteria and dependency on Story 1.4.
- [Source: docs/planning-artifacts/prd.md#NFR18] — No card data stored or transmitted.
- [Source: docs/planning-artifacts/prd.md#NFR19] — HMAC signature verification before processing.
- [Source: Context7 /stripe/stripe-node] — `constructEvent()` API, Checkout Sessions create, webhook patterns.
- [Source: Context7 /nestjs/docs.nestjs.com] — Raw body parsing with `rawBody: true`, `RawBodyRequest<Request>` interface.
- [Source: Stripe Plugin] — Best practices: Prioritize CheckoutSessions API, Stripe-hosted checkout, Billing APIs for subscriptions.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Build failed with TS1272 on `RawBodyRequest` import — fixed by splitting into `import type { RawBodyRequest }` (isolatedModules + emitDecoratorMetadata compatibility)

### Completion Notes List

- Installed `stripe` v20.x in `apps/api` workspace
- Added `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to Zod env schema with prefix validation (`sk_`, `whsec_`)
- Enabled `rawBody: true` in `NestFactory.create()` for webhook signature verification
- Created `StripeModule` with `StripeService` (Stripe SDK wrapper, idempotency via `StripeEvent` table) and `StripeWebhookController`
- Webhook controller: `@Public()` decorator bypasses JWT, HMAC verification via `constructEvent()`, check-before-process/save-after-success idempotency, switch/case skeleton for 4 lifecycle events
- Created shared Stripe validators (`stripeEventIdSchema`, `stripeCustomerIdSchema`, `stripeSubscriptionIdSchema`) using `z.string().startsWith()` — NOT UUID
- Database already in sync (schemas from Story 1.4)
- Installed Stripe CLI via Homebrew for local webhook testing
- 17 tests total: 6 for StripeService, 11 for StripeWebhookController
- All 60 API tests pass, 125 web tests pass, build green (5/5 packages)

### File List

**New files:**
- `apps/api/src/modules/stripe/stripe.module.ts`
- `apps/api/src/modules/stripe/stripe.service.ts`
- `apps/api/src/modules/stripe/stripe-webhook.controller.ts`
- `apps/api/src/modules/stripe/stripe.service.spec.ts`
- `apps/api/src/modules/stripe/stripe-webhook.controller.spec.ts`
- `packages/validators/src/stripe/webhook.schema.ts`
- `packages/validators/src/stripe/index.ts`

**Modified files:**
- `apps/api/src/config/env.config.ts` — added STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- `apps/api/src/main.ts` — added rawBody: true
- `apps/api/src/app.module.ts` — registered StripeModule
- `packages/validators/src/index.ts` — added stripe export
- `.env.example` — added Stripe env placeholders
- `apps/api/package.json` — added stripe dependency
- `docs/implementation-artifacts/sprint-status.yaml` — story 3.1 status updated

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 — Adversarial Code Review
**Date:** 2026-02-06

### Issues Found & Fixed

| # | Severity | Issue | Fix Applied |
|---|----------|-------|-------------|
| 1 | HIGH | `@SkipThrottle()` missing on webhook controller — ThrottlerGuard would rate-limit Stripe webhooks at 10 req/60s | Added `@SkipThrottle()` class decorator |
| 2 | MEDIUM | No validation for absent `stripe-signature` header — undefined passed to SDK | Added explicit null check with `BadRequestException` |
| 3 | MEDIUM | No test for missing `stripe-signature` header scenario | Added dedicated test case |
| 4 | MEDIUM | `sprint-status.yaml` modified but not in File List | Added to File List |
| 5 | LOW | Race condition in idempotency: concurrent P2002 unique violation unhandled | Added try-catch for P2002 with graceful `{ received: true }` response |
| 6 | LOW | Story claims "stripe v19.x" but v20.3.1 installed; test count 14 vs actual 17 | Corrected version and test counts in docs |

**Shared validators note:** `packages/validators/src/stripe/webhook.schema.ts` schemas (`stripeEventIdSchema`, `stripeCustomerIdSchema`, `stripeSubscriptionIdSchema`) are intentionally created for reuse in Stories 3.2+ (checkout session creation, subscription management). Not used in the webhook controller itself since the Stripe SDK already validates events via HMAC.

### Verdict: APPROVED after fixes

All 7 issues fixed. 60 API tests pass, build green (5/5 packages).

## Change Log

- 2026-02-06: Story 3.1 implemented — Stripe module foundation with webhook security. NestJS StripeModule, HMAC webhook verification, StripeEvent idempotency, event routing skeleton. 17 tests, 60 API + 125 web tests pass, build green.
- 2026-02-06: Code review fixes — Added @SkipThrottle() for webhook reliability, stripe-signature header validation, P2002 race condition handling, corrected docs.
