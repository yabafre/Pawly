# Story 3.4: Subscription Management (Billing Portal)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to manage my subscription (upgrade, downgrade, cancel) via a self-service portal,
So that I can control my billing without contacting support.

## Acceptance Criteria

1. **Given** the admin dashboard with a completed onboarding, **When** the admin navigates to `/admin/billing`, **Then** they see a billing overview page displaying their current subscription plan, status, renewal date, and a "Manage Subscription" button.
2. **Given** the billing page, **When** the admin clicks "Manage Subscription", **Then** the API creates a Stripe Billing Portal session via a tRPC procedure and the admin is redirected to Stripe's hosted Billing Portal.
3. **Given** the Stripe Billing Portal, **When** the admin changes their subscription plan (upgrade/downgrade), **Then** the `customer.subscription.updated` webhook updates the local `Subscription` record with the new `status`, `planKey`, `entitlementTier`, and `currentPeriodEnd`.
4. **Given** the Stripe Billing Portal, **When** the admin cancels their subscription, **Then** the `customer.subscription.updated` webhook sets `cancelAtPeriodEnd = true` and **When** the period ends, the `customer.subscription.deleted` webhook sets `status` to `canceled`.
5. **Given** the Stripe Billing Portal, **When** a payment fails on renewal, **Then** the `invoice.payment_failed` webhook sets the subscription `status` to `past_due`.
6. **Given** the billing page, **Then** the admin sees their recent invoice history (last 10 invoices) with amount, status, date, and a link to download the PDF or view the hosted invoice.
7. **Given** the billing page, **Then** all webhook handlers check `StripeEvent` idempotency before processing (existing pattern from Story 3.1).
8. **Given** the admin navigation, **Then** a "Billing" link with a CreditCard icon is visible in the admin sidebar/navbar, navigating to `/admin/billing`.
9. **Given** the billing page, **Then** all user-facing strings have FR/EN translation keys and the page follows the "Clinique Zen" aesthetic.
10. **Given** the data flow architecture, **Then** the billing page follows the mandatory pattern: Component → Hook → Zsa → Server Action → tRPC → NestJS API.

## Tasks / Subtasks

- [x] Task 1: Extend StripeService with Billing Portal methods (AC: #2, #6)
  - [x] 1.1 Add `createBillingPortalSession(stripeCustomerId: string, returnUrl: string, locale?: string)` to `apps/api/src/modules/stripe/stripe.service.ts` — calls `stripe.billingPortal.sessions.create()` with `customer`, `return_url`, `locale`
  - [x] 1.2 Add `getSubscriptionWithDetails(stripeSubscriptionId: string)` — calls `stripe.subscriptions.retrieve()` with `expand: ['latest_invoice', 'default_payment_method', 'items.data.price.product']`
  - [x] 1.3 Add `listInvoices(stripeCustomerId: string, limit?: number)` — calls `stripe.invoices.list({ customer, limit: limit || 10 })`, returns mapped invoice data (id, amountPaid, status, invoicePdf, hostedInvoiceUrl, periodStart, periodEnd, currency, created)

- [x] Task 2: Create Zod validators for billing input/output (AC: #2, #6, #10)
  - [x] 2.1 Create `packages/validators/src/stripe/billing.schema.ts` with schemas:
    - `createBillingPortalSessionSchema` — z.object({ returnUrl: z.string().url(), locale: z.enum(['fr', 'en']).optional() })
    - `subscriptionDetailsSchema` — z.object for typed subscription response (status, planKey, entitlementTier, currentPeriodEnd, cancelAtPeriodEnd, trialEnd)
    - `invoiceSchema` — z.object for typed invoice response (id, amountPaid, currency, status, invoicePdf, hostedInvoiceUrl, periodStart, periodEnd, created)
    - `billingOverviewSchema` — z.object combining subscription + invoices
  - [x] 2.2 Export from `packages/validators/src/stripe/index.ts`

- [x] Task 3: Extend tRPC stripe router with billing procedures (AC: #1, #2, #6, #10)
  - [x] 3.1 Add `getBillingOverview` — `protectedProcedure` (no input). Uses `ctx.user.clinicId` to find Subscription → fetches Stripe subscription details + last 10 invoices. Returns typed `BillingOverview` object
  - [x] 3.2 Add `createBillingPortalSession` — `protectedProcedure` with `createBillingPortalSessionSchema` input. Looks up `stripeCustomerId` from Subscription via `clinicId`, creates portal session, returns `{ url: string }`
  - [x] 3.3 Verify all new procedures use `protectedProcedure` and `ctx.user.clinicId` — NEVER accept clinicId as input

- [x] Task 4: Update webhook controller for subscription management events (AC: #3, #4, #5, #7)
  - [x] 4.1 Enhance `handleSubscriptionUpdated` in `stripe-webhook.controller.ts` to also sync `cancelAtPeriodEnd` field and update `entitlementTier` when plan changes
  - [x] 4.2 Verify `handleSubscriptionDeleted` sets status to `canceled` and clears `cancelAtPeriodEnd`
  - [x] 4.3 Verify `handleInvoicePaymentFailed` correctly sets status to `past_due`
  - [x] 4.4 Add handling for `invoice.paid` event → set subscription status back to `active` if it was `past_due` (recovery after failed payment)

- [x] Task 5: Create Zsa server actions for billing (AC: #10)
  - [x] 5.1 Create `apps/web/src/app/[locale]/admin/billing/_actions/billing-actions.ts` with:
    - `getBillingOverviewAction` — Zsa server action calling `trpc.stripe.getBillingOverview`
    - `createBillingPortalSessionAction` — Zsa server action calling `trpc.stripe.createBillingPortalSession`

- [x] Task 6: Create billing page UI (AC: #1, #6, #8, #9)
  - [x] 6.1 Create `apps/web/src/app/[locale]/admin/billing/page.tsx` — server component fetching initial billing data via tRPC, passing to client component
  - [x] 6.2 Create `apps/web/src/app/[locale]/admin/billing/_components/BillingOverview.tsx` — client component displaying:
    - **Subscription card**: plan name, status badge (active/trialing/past_due/canceled), renewal date, cancel pending indicator
    - **"Manage Subscription" button**: calls `createBillingPortalSessionAction`, redirects to `session.url`
    - **Invoice history table**: last 10 invoices with date, amount, status badge, PDF download link, hosted invoice link
  - [x] 6.3 Follow "Clinique Zen" aesthetic: `rounded-2xl` cards, teal-tinted shadows, Vet Teal for active status, Vital Orange for past_due, Surgical White backgrounds

- [x] Task 7: Add billing link to admin navigation (AC: #8)
  - [x] 7.1 Update `apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx` — add `{ label: t('nav.billing'), href: '/{locale}/admin/billing', icon: CreditCard }` to `navItems` array
  - [x] 7.2 Import `CreditCard` from `lucide-react`

- [x] Task 8: Add i18n translation keys (AC: #9)
  - [x] 8.1 Add `billing` namespace keys to `apps/web/src/i18n/langs/fr.json`:
    - `billing.title`, `billing.subtitle`, `billing.plan.*`, `billing.status.*`, `billing.invoices.*`, `billing.actions.*`, `billing.labels.*`, `nav.billing`
  - [x] 8.2 Add corresponding keys to `apps/web/src/i18n/langs/en.json`

- [x] Task 9: Add billing namespace to QueryKeyFactory (AC: #10)
  - [x] 9.1 Add `billing` namespace to `QueryKeyFactory` in `apps/web/src/lib/hooks/server-action-hooks.ts`

- [x] Task 10: Write tests (all ACs)
  - [x] 10.1 Unit tests for new StripeService methods (`createBillingPortalSession`, `getSubscriptionWithDetails`, `listInvoices`) in `stripe.service.spec.ts`
  - [x] 10.2 Unit tests for new webhook handler (`invoice.paid` recovery) in `stripe-webhook.controller.spec.ts`
  - [x] 10.3 Unit tests for new tRPC procedures (`getBillingOverview`, `createBillingPortalSession`) — auth required, clinicId from JWT, invalid input rejection
  - [x] 10.4 Unit tests for Zod billing validators in `packages/validators/src/stripe/billing.schema.test.ts`
  - [x] 10.5 Run `pnpm test` from root — all existing tests must pass, no regressions

## Dev Notes

### Critical Rules (NON-NEGOTIABLE)

1. **Data flow**: Component → Hook → Zsa → Server Action → tRPC → NestJS. NO shortcuts. NO direct Prisma calls from Next.js.
2. **Multi-tenant isolation**: All billing queries MUST resolve `clinicId` from the authenticated user's JWT (`ctx.user.clinicId`). NEVER accept clinicId as client input. Look up `Subscription` via clinicId FK, then use `stripeCustomerId` / `stripeSubscriptionId` for Stripe API calls.
3. **Stripe is source of truth**: The local `Subscription` record is a **cache** of Stripe state, synced via webhooks. The billing overview page reads from the local DB for display, but the "Manage Subscription" action redirects to Stripe's hosted portal for all modifications. Do NOT build custom plan-change or cancellation UI.
4. **Hosted Billing Portal only**: Use `stripe.billingPortal.sessions.create()` to redirect admins to Stripe's hosted portal. Do NOT build custom payment method forms, plan switchers, or cancellation flows. This reduces PCI scope and maintenance burden.
5. **Webhook idempotency**: All webhook handlers MUST check `StripeEvent` idempotency before processing (existing claim-then-process pattern from Story 3.1). Do NOT duplicate this logic — reuse the existing pattern.
6. **No card data on our servers**: Pawly NEVER stores, transmits, or processes card data (NFR18). All payment interactions happen on Stripe's hosted pages.
7. **i18n**: All user-facing strings MUST have FR/EN translation keys. Use `useTranslations('billing')` in client components.
8. **No new NestJS controllers**: Billing data flows through the existing tRPC stripe router. No REST endpoints for billing.
9. **Return URL locale-awareness**: The `return_url` passed to `billingPortal.sessions.create()` MUST include the user's current locale (e.g., `/{locale}/admin/billing`). Derive locale from the Zsa action context or pass it explicitly.
10. **Error handling for missing subscription**: If no Subscription record exists for a clinic (edge case: webhook not yet processed), throw a clear `NotFoundException` — do NOT show a broken billing page.

### Architecture Compliance

**Backend module**: Extend existing `apps/api/src/modules/stripe/stripe.service.ts` — do NOT create a separate BillingModule. Billing is part of the Stripe domain.
**tRPC router**: Extend existing `apps/api/src/trpc/routers/stripe.router.ts` — add new procedures alongside `createCheckoutSession`.
**Frontend location**: `apps/web/src/app/[locale]/admin/billing/` (NEW route, architecture-specified)
**Validators location**: `packages/validators/src/stripe/billing.schema.ts` (extend existing stripe validators package)
**Existing file modifications**: `stripe.router.ts`, `stripe.service.ts`, `stripe-webhook.controller.ts`, `AdminLayoutClient.tsx`, `server-action-hooks.ts`, `fr.json`, `en.json`

**tRPC procedure types:**
- `getBillingOverview` → `protectedProcedure` (requires auth). Uses `ctx.user.clinicId` from JWT → finds `Subscription` in DB → calls Stripe API with `stripeSubscriptionId` and `stripeCustomerId` → returns typed overview.
- `createBillingPortalSession` → `protectedProcedure`. Uses `ctx.user.clinicId` → finds `Subscription.stripeCustomerId` → creates portal session → returns `{ url }`.

**Data flow for "Manage Subscription" click:**
```
BillingOverview (client component)
  → useServerActionMutation(createBillingPortalSessionAction)
    → createBillingPortalSessionAction (Zsa server action)
      → trpc.stripe.createBillingPortalSession.mutate({ returnUrl, locale })
        → StripeService.createBillingPortalSession(stripeCustomerId, returnUrl, locale)
          → stripe.billingPortal.sessions.create({ customer, return_url, locale })
  → window.location.href = session.url (redirect to Stripe)
```

**Data flow for billing overview display:**
```
billing/page.tsx (server component)
  → trpc.stripe.getBillingOverview.query() (server-side fetch)
    → StripeService.getSubscriptionWithDetails(stripeSubscriptionId)
    → StripeService.listInvoices(stripeCustomerId, 10)
  → Pass serialized data to BillingOverview (client component)
```

**Webhook data flow (existing, enhanced):**
```
Stripe → POST /api/stripe/webhook
  → stripe.webhooks.constructEvent() (HMAC verification)
  → StripeEvent idempotency check (claim-then-process)
  → customer.subscription.updated → update Subscription record (status, planKey, entitlementTier, currentPeriodEnd, cancelAtPeriodEnd)
  → customer.subscription.deleted → set status=canceled, cancelAtPeriodEnd=false
  → invoice.payment_failed → set status=past_due
  → invoice.paid (NEW) → if status was past_due, set status=active (payment recovery)
```

### Library & Framework Requirements

| Library | Version | Usage | Already Installed |
|---------|---------|-------|-------------------|
| `stripe` | ^20.3.1 | Stripe Node SDK — `billingPortal.sessions.create()`, `subscriptions.retrieve()`, `invoices.list()` | Yes (apps/api) |
| `zsa` | ^0.6.0 | Server action wrapper with typed I/O | Yes |
| `@trpc/server` | ^11.9.0 | tRPC router procedures | Yes |
| `@pawly/validators` | workspace | Zod schemas for billing input/output | Yes (extend) |
| `next-intl` | latest | i18n translations `useTranslations('billing')` | Yes |
| `sonner` | latest | Toast notifications for portal redirect / error feedback | Yes |
| `lucide-react` | latest | Icons (CreditCard, ExternalLink, Download, FileText, AlertCircle, CheckCircle, Clock) | Yes |
| `shadcn/ui` | — | Card, Button, Badge, Table components | Yes |

**NO new dependencies needed** — all libraries already installed.

**shadcn components to verify/add** (run from `apps/web` if missing):
- `table` — for invoice history display. Check if already installed: `npx shadcn@latest add table`
- `badge` — for subscription status display. Check if already installed: `npx shadcn@latest add badge`

**Stripe Billing Portal API pattern (v20.x):**
```typescript
// Create portal session — server-side only
const session = await this.stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,   // Required: Stripe customer ID from Subscription record
  return_url: returnUrl,         // URL to redirect back after portal exit
  locale: locale || 'fr',        // Locale for portal UI (fr/en)
});
// session.url → short-lived URL, redirect customer immediately

// Retrieve subscription with expanded data
const subscription = await this.stripe.subscriptions.retrieve(stripeSubscriptionId, {
  expand: ['latest_invoice', 'default_payment_method', 'items.data.price.product'],
});
// subscription.items.data[0].price.product.name → plan name
// subscription.items.data[0].price.unit_amount → price in cents
// subscription.items.data[0].price.recurring.interval → 'month' | 'year'

// List invoices
const invoices = await this.stripe.invoices.list({
  customer: stripeCustomerId,
  limit: 10,
});
// invoices.data[].invoice_pdf → PDF download URL
// invoices.data[].hosted_invoice_url → hosted invoice page
// invoices.data[].amount_paid → amount in cents
// invoices.data[].status → 'paid' | 'open' | 'void' | 'uncollectible'
```

**DO NOT use `@stripe/stripe-js`** — Billing Portal is hosted by Stripe, no client-side Stripe.js needed. Redirect via `window.location.href`.

### File Structure Requirements

```
apps/
├── api/
│   └── src/
│       ├── modules/
│       │   └── stripe/
│       │       ├── stripe.service.ts          # MODIFY — add 3 new methods
│       │       ├── stripe.service.spec.ts     # MODIFY — add tests for new methods
│       │       ├── stripe-webhook.controller.ts     # MODIFY — enhance subscription.updated, add invoice.paid
│       │       └── stripe-webhook.controller.spec.ts # MODIFY — add tests for invoice.paid
│       └── trpc/
│           └── routers/
│               └── stripe.router.ts           # MODIFY — add 2 new procedures
├── web/
│   └── src/
│       ├── app/[locale]/admin/
│       │   ├── _components/
│       │   │   └── AdminLayoutClient.tsx      # MODIFY — add billing nav item
│       │   └── billing/                       # NEW ROUTE
│       │       ├── page.tsx                   # NEW — server component
│       │       ├── _actions/
│       │       │   └── billing-actions.ts     # NEW — 2 Zsa server actions
│       │       └── _components/
│       │           └── BillingOverview.tsx     # NEW — client component
│       ├── i18n/langs/
│       │   ├── fr.json                        # MODIFY — add billing keys
│       │   └── en.json                        # MODIFY — add billing keys
│       └── lib/hooks/
│           └── server-action-hooks.ts         # MODIFY — add billing namespace
packages/
└── validators/src/
    └── stripe/
        ├── billing.schema.ts                  # NEW — billing Zod schemas
        ├── billing.schema.test.ts             # NEW — validator tests
        └── index.ts                           # MODIFY — export billing schemas
```

**New files: 5** | **Modified files: 10**

### Testing Requirements

**StripeService tests** (extend `apps/api/src/modules/stripe/stripe.service.spec.ts`):
- `createBillingPortalSession`: creates session with correct customer, return_url, locale; throws if Stripe API fails
- `getSubscriptionWithDetails`: retrieves with correct expand params; maps status, planKey, entitlementTier; handles subscription not found
- `listInvoices`: lists with correct customer and limit; maps invoice fields (amountPaid, status, invoicePdf, etc.); handles empty invoice list

**Webhook controller tests** (extend `apps/api/src/modules/stripe/stripe-webhook.controller.spec.ts`):
- `invoice.paid`: sets status to `active` when subscription was `past_due` (payment recovery); no-op when subscription is already `active`; respects StripeEvent idempotency
- `customer.subscription.updated` (enhanced): syncs `cancelAtPeriodEnd` field; updates `entitlementTier` on plan change; handles missing subscription gracefully (P2025)

**tRPC router tests:**
- `getBillingOverview`: requires authentication (reject unauthenticated); uses `ctx.user.clinicId` (never client input); throws NotFoundException if no Subscription found; returns typed BillingOverview
- `createBillingPortalSession`: requires authentication; validates input with Zod (reject invalid returnUrl); returns portal session URL

**Zod validator tests** (`packages/validators/src/stripe/billing.schema.test.ts`):
- `createBillingPortalSessionSchema`: reject missing returnUrl; reject invalid URL format; accept valid URL with optional locale; reject invalid locale
- `subscriptionDetailsSchema`: reject missing required fields; accept valid subscription data with all status enum values
- `invoiceSchema`: reject missing fields; accept valid invoice with nullable invoicePdf/hostedInvoiceUrl
- `billingOverviewSchema`: reject if subscription missing; accept valid combination of subscription + invoices array

**Regression safety:**
- Run `pnpm test` from root — all existing 266+ tests must pass
- Run `pnpm build` from root — TypeScript compilation must succeed

### Previous Story Intelligence (Story 3.3)

**Patterns established in Story 3.3 that MUST be followed:**

- **tRPC router pattern**: See `apps/api/src/trpc/routers/clinic.router.ts` — `protectedProcedure` with `ctx.user.clinicId`. Story 3.4 adds to the stripe router instead but follows the same pattern.
- **TRPCServices injection**: StripeService is already injected — no new injection needed for Story 3.4.
- **Zsa server action pattern**: See `apps/web/src/app/[locale]/admin/onboarding/_actions/onboarding-actions.ts` — `createServerAction().input(schema).handler(async ({ input }) => { ... })`.
- **Admin layout guard**: Already checks auth + onboarding. Billing page is behind admin layout so auth is already enforced.
- **QueryKeyFactory pattern**: See `server-action-hooks.ts` — add `billing` namespace alongside existing `clinic` namespace.
- **Server component → client component pattern**: See `onboarding/page.tsx` — RSC fetches data, passes serialized plain objects to client component.

**Fixes from Story 3.3 code review to learn from:**
- Empty catch blocks are NOT acceptable — always handle errors explicitly (admin layout fix)
- Missing validation refinements must be caught — apply `.refine()` where business rules require cross-field validation
- P2002 errors must be caught with user-friendly messages
- Always log errors before re-throwing when a Logger instance is available

**Key files to reference for patterns:**
- `apps/api/src/modules/stripe/stripe.service.ts` — existing Stripe service pattern (createCheckoutSession)
- `apps/api/src/modules/stripe/stripe-webhook.controller.ts` — webhook handler pattern (claim-then-process idempotency)
- `apps/api/src/trpc/routers/stripe.router.ts` — existing stripe router (publicProcedure for checkout, protectedProcedure for billing)
- `apps/web/src/app/[locale]/admin/onboarding/_components/OnboardingWizard.tsx` — client component pattern with Zsa hooks
- `apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx` — nav items array pattern

### Git Intelligence

**Recent commit patterns (last 10 commits):**
- Commit style: `feat(story-X-Y): description` for features, `fix(story-X-Y): description` for fixes
- Feature branch pattern: `feature/story-X-Y-slug-name`
- Code review fixes: separate commit `fix(story-X-Y): address code review findings`
- All PRs target `develop` branch

**Current branch**: `feature/story-3-4-subscription-management-billing-portal` (created from `develop`)

**Dependencies from previous stories already in place:**
- StripeModule with service, webhook controller (Story 3.1)
- `createCheckoutSession` tRPC procedure (Story 3.2)
- Subscription model with all fields needed (Story 1.4)
- StripeEvent idempotency model (Story 1.4)
- Webhook handlers for 4 events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed (Stories 3.1, 3.2)
- Admin layout with auth + onboarding guards (Story 3.3)
- i18n routing and translation infrastructure (Stories 2.1, 2.2)

### Latest Technical Information

**Stripe SDK v20.3.1 (current in project):**
- `stripe.billingPortal.sessions.create()` — creates short-lived session URL for hosted portal
- `stripe.subscriptions.retrieve(id, { expand })` — retrieves subscription with expanded relations
- `stripe.invoices.list({ customer, limit })` — lists invoices for a customer
- Portal supports: payment method update, subscription cancel (at period end or immediately), plan switching, invoice history
- Portal configuration: can be done in Stripe Dashboard (no-code) or via API. Default configuration works out of the box.
- Portal `locale` parameter accepts IETF language tags: `'fr'`, `'en'`

**Billing Portal Configuration (Stripe Dashboard):**
- Must be configured BEFORE creating portal sessions
- Enable: payment method update, subscription cancellation, plan switching
- Configure: cancellation reasons, proration behavior, allowed products/prices
- Set: business name, privacy policy URL, terms of service URL
- This is a ONE-TIME Stripe Dashboard setup — not code. Document in story that developer must verify portal is configured.

**Webhook event notes for subscription management:**
- `customer.subscription.updated` fires when: plan changes, status changes, cancel scheduled, trial ends
- `customer.subscription.deleted` fires when: subscription permanently deleted (after cancel at period end expires)
- `invoice.payment_failed` fires when: auto-renewal payment fails
- `invoice.paid` fires when: invoice successfully paid (including retry after failure) — USE THIS for payment recovery
- All events include `data.object` with full subscription/invoice object
- `data.previous_attributes` in `customer.subscription.updated` shows what changed — useful for conditional logic

**NestJS module pattern (existing):**
- StripeService already has `private readonly stripe: Stripe` via constructor
- ConfigService provides `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `WEB_URL`
- Logger instance: `private readonly logger = new Logger(StripeService.name)`

### UX & Design Reference

**"Clinique Zen" aesthetic for the billing page:**
- **Primary color**: Vet Teal (`#009588`) — active subscription status badge, primary buttons
- **Warning color**: Vital Orange (`#F97316`) — past_due status badge, cancellation pending indicator
- **Danger color**: Rose (`#F43F5E`) — canceled status badge
- **Success color**: Emerald (`#10B981`) — paid invoice status
- **Backgrounds**: Surgical White (`#FFFFFF`) cards on Neutral Wash (`#FDFDFD`)
- **Radius**: `rounded-2xl` for cards
- **Shadows**: Soft teal-tinted shadows: `shadow-[0_4px_20px_-4px_rgba(0,149,136,0.15)]`
- **Typography**: Inter font. Headings in Ink Black (`#171717`), body in Soft Steel (`#737373`)
- **Icons**: Lucide React, 1.5px stroke

**Billing page layout:**
- `max-w-4xl mx-auto py-8 px-6` centered container
- **Subscription card** (top): Card with CardHeader (plan name + status badge) + CardContent (renewal date, price, entitlement tier) + CardFooter ("Manage Subscription" button with ExternalLink icon)
- **Cancel pending banner** (conditional): Vital Orange background, "Your subscription will cancel on {date}" message with AlertCircle icon
- **Invoice history** (bottom): Table with columns: Date, Amount, Status (badge), Actions (PDF download, View invoice)
- **Empty state** (if no invoices): "No invoices yet" with FileText icon
- **Loading state**: Skeleton cards matching layout structure

**Status badge variants:**
| Status | Color | Label FR | Label EN |
|--------|-------|----------|----------|
| `active` | Vet Teal bg + white text | Actif | Active |
| `trialing` | Indigo bg + white text | Essai | Trial |
| `past_due` | Vital Orange bg + white text | Impayé | Past Due |
| `canceled` | Rose bg + white text | Annulé | Canceled |
| `unpaid` | Rose bg + white text | Impayé | Unpaid |

**Invoice status badge variants:**
| Status | Color | Label FR | Label EN |
|--------|-------|----------|----------|
| `paid` | Emerald bg | Payée | Paid |
| `open` | Indigo bg | En attente | Open |
| `void` | Neutral bg | Annulée | Void |
| `uncollectible` | Rose bg | Irrécouvrable | Uncollectible |

### Skill-Based Guidelines

#### Turborepo (Monorepo)
- **Run all commands from project root**: `pnpm test`, `pnpm build`. NEVER `cd` into `apps/` directories.
- **Package exports**: When adding billing schemas to `@pawly/validators`, ensure proper exports in `packages/validators/src/stripe/index.ts` and `packages/validators/src/index.ts`.
- **Build verification**: After code changes, run `pnpm build` to verify TypeScript compilation across the monorepo.

#### Vercel React Best Practices
- **`server-serialization`**: In `billing/page.tsx` (RSC), fetch billing data server-side and pass ONLY serialized plain objects to the client `BillingOverview` component. Convert Stripe timestamps (Unix) to ISO strings. Do NOT pass raw Stripe API objects.
- **`async-parallel`**: In `billing/page.tsx`, fetch subscription details and invoice list in parallel with `Promise.all([getSubscription, listInvoices])` — they are independent operations.
- **`bundle-dynamic-imports`**: BillingOverview is a single component — no need for dynamic imports.

#### NestJS Best Practices
- **`arch-single-responsibility`**: StripeService handles Stripe API interactions. The tRPC router handles request validation and response mapping. Do NOT put business logic in the router.
- **`error-throw-http-exceptions`**: Throw `NotFoundException` if no Subscription found for clinicId. Throw `InternalServerErrorException` if Stripe API call fails. Log errors before throwing.
- **`db-use-transactions`**: The `invoice.paid` webhook handler does NOT need a transaction — it's a single `prisma.subscription.update()` call.

#### Frontend Design ("Clinique Zen" Implementation)
- **Billing page feel**: Professional, informative, reassuring. Not transactional. The admin should feel in control of their subscription.
- **Card hierarchy**: Subscription card is the hero element (larger, more prominent). Invoice history is secondary (table format, compact).
- **External link indicator**: "Manage Subscription" button should include an `ExternalLink` icon to signal redirect to Stripe's hosted portal.
- **Date formatting**: Use `next-intl` `useFormatter` for locale-aware date formatting (`formatter.dateTime(date, { dateStyle: 'medium' })`).
- **Currency formatting**: Use `next-intl` `useFormatter` for locale-aware currency formatting (`formatter.number(amount / 100, { style: 'currency', currency })`).

#### Stripe Plugin Context
- Story 3.4 uses the Stripe SDK for **read operations** (retrieve subscription, list invoices) and **portal session creation** — no direct subscription modifications via API.
- All subscription modifications happen through Stripe's hosted Billing Portal — this is by design (architecture decision).
- Webhook handlers sync changes back to the local DB — the existing claim-then-process idempotency pattern handles all edge cases.
- **Stripe Dashboard prerequisite**: The Billing Portal must be configured in the Stripe Dashboard before portal sessions can be created. The developer should verify this is done in both test and production environments.
- **Test mode**: Use Stripe test mode (`sk_test_*` / `whsec_test_*`) during development. Stripe CLI (`stripe listen --forward-to`) for local webhook testing.

### Project Structure Notes

- Alignment with architecture: billing page at `app/[locale]/admin/billing/page.tsx` as specified in architecture doc
- No new NestJS module — extends existing StripeModule (single responsibility: all Stripe interactions)
- Subscription data already exists from Story 3.2 (webhook creates subscription on checkout)
- This story does NOT implement subscription-based access control (that's Story 3.6)
- The billing page is accessible to ALL authenticated admins with completed onboarding — no subscription status check at this level (even canceled admins should see their billing page)

### References

- [Source: docs/planning-artifacts/epics.md#Epic 3, Story 3.4]
- [Source: docs/planning-artifacts/architecture.md#Subscription Flow, Implementation Sequence Step 9]
- [Source: docs/planning-artifacts/prd.md#FR14]
- [Source: docs/planning-artifacts/ux-design-specification.md#Clinique Zen Design System]
- [Source: docs/implementation-artifacts/3-3-post-checkout-onboarding-first-login.md]
- [Source: Stripe API — billingPortal.sessions.create]
- [Source: Stripe API — subscriptions.retrieve with expand]
- [Source: Stripe API — invoices.list]
- [Source: Stripe Documentation — Customer Portal integration]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Jest ESM error: `superjson` is ESM-only (`"type": "module"`), broke `stripe.router.spec.ts`. Fixed with `jest.mock('superjson')` at test file level.
- TypeScript error: `invoice.parent?.subscription_details?.subscription` returns `string | Stripe.Subscription`. Must use `typeof` narrowing before passing to Prisma `where` clause.

### Completion Notes List
- Implemented 3 new StripeService methods: `createBillingPortalSession`, `getSubscriptionWithDetails`, `listInvoices` with full Stripe SDK v20.x expand params
- Created 4 Zod validators: `createBillingPortalSessionSchema`, `subscriptionDetailsSchema`, `invoiceSchema`, `billingOverviewSchema` with proper enums and nullable fields
- Extended stripe tRPC router with 2 new `protectedProcedure`s: `getBillingOverview` (query), `createBillingPortalSession` (mutation) — both use `ctx.user.clinicId`, never client input
- Enhanced webhook controller: added `invoice.paid` handler for past_due→active recovery, updated `subscription.deleted` to clear `cancelAtPeriodEnd`. Existing `subscription.updated` already synced cancelAtPeriodEnd from Story 3.2
- Created billing page with RSC (page.tsx) fetching data server-side via tRPC, passing serialized plain objects to BillingOverview client component
- BillingOverview implements Clinique Zen aesthetic: rounded-2xl cards, teal-tinted shadows, status badges with correct colors, invoice history table with PDF download and hosted invoice links
- Added CreditCard billing nav link to AdminLayoutClient
- Added comprehensive FR/EN translation keys (billing namespace: ~30 keys each)
- Added billing namespace to QueryKeyFactory
- Installed shadcn table and badge components
- Total tests: 324 (was 266) — 58 new tests across 4 test suites, 0 regressions
  - API: 120 tests (+29) — service billing methods, invoice.paid webhook, subscription.deleted cancelAtPeriodEnd, tRPC router procedures
  - Validators: 79 tests (+23) — billing schema validation
  - Web: 125 tests (unchanged)

### Change Log
- 2026-02-07: Story 3.4 implemented — Subscription Management & Billing Portal. 10 tasks, 48 new tests, 5 new files, 10 modified files.
- 2026-02-07: Adversarial code review — 8 issues identified (3 HIGH, 3 MEDIUM, 2 LOW), all fixed:
  - HIGH: Removed non-null assertion on nullable `stripeSubscriptionId` → explicit null check with `PRECONDITION_FAILED` error
  - HIGH: Removed dead code in webhook invoice handlers (unreachable `.id` property check on always-string subscription ref)
  - HIGH: Created missing tRPC router tests (10 tests covering auth, NOT_FOUND, PRECONDITION_FAILED, success, clinicId isolation, Zod validation)
  - MEDIUM: Added fallback style helpers for status badges to handle unknown Stripe status values
  - MEDIUM: Removed `as any` cast in billing page, imported proper type from `@pawly/validators`
  - MEDIUM: Extracted magic number `10` to `DEFAULT_INVOICE_LIMIT` constant
  - LOW: Added error logging in billing page catch block
  - LOW: Fixed Jest ESM compatibility for superjson in tRPC router test suite

### File List
**New files:**
- `packages/validators/src/stripe/billing.schema.ts` — Zod billing schemas
- `packages/validators/src/stripe/billing.schema.test.ts` — Validator tests (23 tests)
- `apps/web/src/app/[locale]/admin/billing/page.tsx` — RSC billing page
- `apps/web/src/app/[locale]/admin/billing/_actions/billing-actions.ts` — Zsa server actions
- `apps/web/src/app/[locale]/admin/billing/_components/BillingOverview.tsx` — Client billing component
- `apps/web/src/components/ui/table.tsx` — shadcn table component (auto-installed)
- `apps/web/src/components/ui/badge.tsx` — shadcn badge component (auto-installed)

**Modified files:**
- `apps/api/src/modules/stripe/stripe.service.ts` — Added 3 billing methods
- `apps/api/src/modules/stripe/stripe.service.spec.ts` — Added 12 tests for new methods
- `apps/api/src/modules/stripe/stripe-webhook.controller.ts` — Added invoice.paid handler, updated subscription.deleted, simplified invoice ref extraction
- `apps/api/src/modules/stripe/stripe-webhook.controller.spec.ts` — Added 4 tests for invoice.paid, updated subscription.deleted test
- `apps/api/src/trpc/routers/stripe.router.ts` — Added getBillingOverview + createBillingPortalSession procedures, null check for stripeSubscriptionId, DEFAULT_INVOICE_LIMIT constant
- `apps/api/src/trpc/routers/stripe.router.spec.ts` — NEW: 10 tests for tRPC billing procedures (auth, NOT_FOUND, PRECONDITION_FAILED, success, clinicId isolation, Zod validation)
- `apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx` — Added billing nav link
- `apps/web/src/app/[locale]/admin/billing/page.tsx` — Removed `as any` cast, proper type import from `@pawly/validators`, error logging
- `apps/web/src/app/[locale]/admin/billing/_components/BillingOverview.tsx` — Added fallback style helpers for status badges
- `apps/web/src/lib/hooks/server-action-hooks.ts` — Added billing namespace to QueryKeyFactory
- `apps/web/src/i18n/langs/fr.json` — Added billing translation keys (~30)
- `apps/web/src/i18n/langs/en.json` — Added billing translation keys (~30)
- `packages/validators/src/stripe/index.ts` — Exported billing schemas
