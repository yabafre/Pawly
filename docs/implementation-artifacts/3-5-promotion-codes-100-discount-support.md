# Story 3.5: Promotion Codes (100% Discount Support)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a partner or promotional user,
I want to apply a promotion code during checkout that can cover up to 100% of the subscription cost,
So that I can access Pawly at a discounted or zero price.

## Acceptance Criteria

1. **Given** the Stripe Checkout flow, **When** I enter a promotion code in the Stripe-hosted checkout page, **Then** Stripe applies the associated coupon (configured via Stripe Dashboard) and the discount is reflected in the checkout total.
2. **Given** a coupon configured for up to 100% discount with indefinite duration, **When** the `checkout.session.completed` webhook fires, **Then** the webhook handler retrieves the session with expanded `discounts` and extracts the coupon metadata (`type=partner|internal|lifetime`), discount percentage/amount, and promotion code used.
3. **Given** a completed checkout with a promotion code applied, **When** the Clinic + Admin + Subscription records are created, **Then** the `Subscription` record stores: `promotionCodeId` (Stripe promo code ID), `couponId` (Stripe coupon ID), `discountType` (`percent` or `amount`), `discountValue` (percentage or amount in cents), and `couponMetadataType` (from coupon metadata: `partner|internal|lifetime|null`).
4. **Given** a 100% discount checkout (`payment_status: 'no_payment_required'`), **When** the webhook processes the event, **Then** the Clinic, Admin, and Subscription are created identically to a paid checkout, the `entitlementTier` matches the subscribed plan tier (promo users get the same tier, NOT more), and the Magic Link email is sent.
5. **Given** the billing overview page, **When** the admin views their subscription, **Then** the UI displays the active promotion (code name, discount percentage/amount, coupon type badge) if a promotion is applied, alongside existing subscription details.
6. **Given** the Stripe Dashboard, **Then** promotions are configured entirely via the Stripe Dashboard (coupons + promotion codes) — Pawly does NOT build custom promo code management UI. Coupons use metadata `{ type: 'partner' | 'internal' | 'lifetime' }` for tracking purposes.
7. **Given** the `entitlementTier` field on `Subscription`, **When** any checkout completes (paid or promo), **Then** the `entitlementTier` is dynamically derived from the subscribed plan's `price.lookup_key` or `product.metadata.tier` (NOT hardcoded to `'starter'`).
8. **Given** the capped promotion usage requirement, **Then** promotion code usage limits are enforced by Stripe via `max_redemptions` on the Promotion Code object — Pawly does NOT implement its own usage tracking.
9. **Given** the billing overview with a promotion applied, **Then** all user-facing strings (discount labels, coupon type badges) have FR/EN translation keys and follow the "Clinique Zen" aesthetic.
10. **Given** the data flow architecture, **Then** all new functionality follows the mandatory pattern: Component → Hook → Zsa → Server Action → tRPC → NestJS API.

## Tasks / Subtasks

- [x] Task 1: Extend Prisma Subscription model with promotion/discount fields (AC: #3, #7)
  - [x] 1.1 Add fields to `apps/api/prisma/schema/Subscription.prisma`: `promotionCodeId String?`, `couponId String?`, `discountType String?` (percent|amount), `discountValue Int?` (percentage 0-100 or amount in cents), `couponMetadataType String?` (partner|internal|lifetime)
  - [x] 1.2 Run `pnpm db:push` and `pnpm db:generate` from root to sync schema

- [x] Task 2: Fix hardcoded `entitlementTier` — dynamic tier mapping (AC: #7)
  - [x] 2.1 In `stripe-webhook.controller.ts` `handleCheckoutSessionCompleted()`: derive `entitlementTier` from `subscription.items.data[0].price.lookup_key` or `subscription.items.data[0].price.product.metadata.tier`, falling back to `'starter'` if not set
  - [x] 2.2 In `stripe-webhook.controller.ts` `handleSubscriptionUpdated()`: derive `entitlementTier` from `subscription.items.data[0].price.lookup_key` with same mapping logic
  - [x] 2.3 In `stripe.service.ts` `getSubscriptionWithDetails()`: derive `entitlementTier` from retrieved subscription data (remove hardcoded `'starter'`)
  - [x] 2.4 Create a shared utility function `deriveEntitlementTier(subscription: Stripe.Subscription): string` in `apps/api/src/modules/stripe/stripe.utils.ts`

- [x] Task 3: Enhance webhook handler to capture promotion/discount data (AC: #2, #3, #4)
  - [x] 3.1 In `handleCheckoutSessionCompleted()`, after the session event arrives, retrieve the full session with expanded discounts: `stripe.checkout.sessions.retrieve(session.id, { expand: ['discounts', 'discounts.promotion_code'] })`
  - [x] 3.2 Extract discount data from the expanded session: `session.total_details.amount_discount`, `session.discounts[0]` (coupon ID, promotion code ID)
  - [x] 3.3 Retrieve coupon metadata via `stripe.coupons.retrieve(couponId)` to get `metadata.type` (partner|internal|lifetime)
  - [x] 3.4 Pass extracted promotion data into the `prisma.$transaction` block to store on the Subscription record: `promotionCodeId`, `couponId`, `discountType`, `discountValue`, `couponMetadataType`
  - [x] 3.5 Ensure 100% discount checkout (`payment_status: 'no_payment_required'`) follows exact same creation flow — no special branching

- [x] Task 4: Extend Zod validators with promotion/discount schemas (AC: #3, #5, #10)
  - [x] 4.1 Create `packages/validators/src/stripe/promotion.schema.ts` with schemas:
    - `promotionDetailsSchema` — z.object({ promotionCodeId, couponId, discountType, discountValue, couponMetadataType })
    - `couponMetadataTypeEnum` — z.enum(['partner', 'internal', 'lifetime']).nullable()
    - `discountTypeEnum` — z.enum(['percent', 'amount']).nullable()
  - [x] 4.2 Extend `subscriptionDetailsSchema` in `billing.schema.ts` to include optional promotion fields
  - [x] 4.3 Export from `packages/validators/src/stripe/index.ts`

- [x] Task 5: Extend tRPC `getBillingOverview` to return promotion data (AC: #5, #10)
  - [x] 5.1 In `stripe.router.ts` `getBillingOverview`, include promotion fields from the `Subscription` record in the response
  - [x] 5.2 In `stripe.service.ts` `getSubscriptionWithDetails()`, expand subscription to include `discount` and map promotion code name if available
  - [x] 5.3 Update return type to include promotion details (promotion code name, discount type/value, coupon metadata type)

- [x] Task 6: Update billing UI to display promotion details (AC: #5, #9)
  - [x] 6.1 Update `BillingOverview.tsx` to display a "Promotion Applied" section when promotion data exists on the subscription:
    - Promotion code name badge
    - Discount amount/percentage display
    - Coupon type indicator (Partner/Internal/Lifetime) with colored badge
    - "100% Discount" special highlight when `discountValue === 100` and `discountType === 'percent'`
  - [x] 6.2 Follow "Clinique Zen" aesthetic: Vet Teal badges for active promos, Emerald for partner type, Indigo for internal type, Vital Orange for lifetime type
  - [x] 6.3 Update `useBilling.ts` hook if needed to handle new promotion fields

- [x] Task 7: Add i18n translation keys for promotion display (AC: #9)
  - [x] 7.1 Add `billing.promotion.*` keys to `apps/web/src/i18n/langs/fr.json`: `promotion.title`, `promotion.code`, `promotion.discount`, `promotion.type.partner`, `promotion.type.internal`, `promotion.type.lifetime`, `promotion.fullDiscount`
  - [x] 7.2 Add corresponding keys to `apps/web/src/i18n/langs/en.json`

- [x] Task 8: Write tests (all ACs)
  - [x] 8.1 Unit tests for `deriveEntitlementTier()` utility function in `stripe.utils.spec.ts`: tests for lookup_key mapping, product metadata fallback, default to 'starter'
  - [x] 8.2 Unit tests for enhanced `handleCheckoutSessionCompleted` with discount data: paid checkout with promo code, 100% discount checkout (`no_payment_required`), checkout without promo code (no discount fields stored), coupon metadata extraction
  - [x] 8.3 Unit tests for `getBillingOverview` returning promotion data: subscription with promo, subscription without promo
  - [x] 8.4 Unit tests for new Zod promotion validators in `packages/validators/src/stripe/promotion.schema.test.ts`
  - [x] 8.5 Run `pnpm test` from root — all existing 324+ tests must pass, no regressions
  - [x] 8.6 Run `pnpm build` from root — TypeScript compilation must succeed

## Dev Notes

### Critical Rules (NON-NEGOTIABLE)

1. **Data flow**: Component → Hook → Zsa → Server Action → tRPC → NestJS. NO shortcuts. NO direct Prisma calls from Next.js.
2. **Multi-tenant isolation**: All queries MUST resolve `clinicId` from the authenticated user's JWT (`ctx.user.clinicId`). NEVER accept clinicId as client input.
3. **Stripe is source of truth**: Coupons and Promotion Codes are managed ENTIRELY in the Stripe Dashboard. Pawly does NOT build admin UI for creating/editing promo codes. Pawly only reads and stores promotion data from Stripe webhook events.
4. **No custom promo code input in checkout form**: The existing `allow_promotion_codes: true` on `stripe.checkout.sessions.create()` already enables a code input field on Stripe's hosted checkout page. Do NOT add a promo code input field to the pre-checkout form on the Pawly pricing page.
5. **Usage limits enforced by Stripe**: `max_redemptions` on the Stripe Promotion Code object controls how many times a code can be used. Pawly does NOT track promo code usage counts. Do NOT create a PromotionCode model in Prisma.
6. **100% discount = valid checkout**: When a 100% coupon is applied, `payment_status` is `'no_payment_required'` (NOT `'paid'`). The existing webhook handler already processes `checkout.session.completed` — verify it handles both `payment_status` values.
7. **entitlementTier must match plan tier, not be inflated by promo**: A 100% promo on a "starter" plan gives `entitlementTier: 'starter'`. A promo does NOT unlock a higher tier. The tier is derived from the subscribed price/product, not from the discount.
8. **Webhook idempotency**: All webhook handlers MUST check `StripeEvent` idempotency before processing (existing claim-then-process pattern from Story 3.1). Do NOT duplicate this logic.
9. **i18n**: All user-facing strings MUST have FR/EN translation keys. Use `useTranslations('billing')` in client components.
10. **No new NestJS controllers or modules**: Promotion handling is part of the existing Stripe domain. Extend `stripe.service.ts`, `stripe-webhook.controller.ts`, and `stripe.router.ts`.

### Architecture Compliance

**Backend module**: Extend existing `apps/api/src/modules/stripe/` — do NOT create a separate PromotionModule.
**tRPC router**: Extend existing `apps/api/src/trpc/routers/stripe.router.ts` — no new procedures needed, only modify `getBillingOverview` response.
**Frontend location**: Modify existing `apps/web/src/app/[locale]/admin/billing/_components/BillingOverview.tsx` — no new routes needed.
**Validators location**: `packages/validators/src/stripe/promotion.schema.ts` (NEW) + extend `billing.schema.ts`
**Utility**: `apps/api/src/modules/stripe/stripe.utils.ts` (NEW — shared entitlement tier mapping)

**Existing files to modify**: `Subscription.prisma`, `stripe-webhook.controller.ts`, `stripe.service.ts`, `stripe.router.ts`, `billing.schema.ts`, `BillingOverview.tsx`, `fr.json`, `en.json`, `packages/validators/src/stripe/index.ts`
**New files**: `stripe.utils.ts`, `stripe.utils.spec.ts`, `promotion.schema.ts`, `promotion.schema.test.ts`

**Webhook data flow (enhanced for promotions):**
```
Stripe → POST /api/stripe/webhook
  → stripe.webhooks.constructEvent() (HMAC verification)
  → StripeEvent idempotency check (claim-then-process)
  → checkout.session.completed:
    → Retrieve full session with expand: ['discounts', 'discounts.promotion_code']
    → Extract discount info: total_details.amount_discount, discounts[0].coupon, discounts[0].promotion_code
    → Retrieve coupon: stripe.coupons.retrieve(couponId) for metadata.type
    → Retrieve subscription: stripe.subscriptions.retrieve() for plan details
    → Derive entitlementTier from price.lookup_key or product.metadata.tier
    → $transaction: Create Clinic + User + Subscription (with promotion fields + dynamic entitlementTier)
    → Send Magic Link email
```

**Billing overview data flow (enhanced for promotions):**
```
billing/page.tsx (RSC)
  → trpc.stripe.getBillingOverview.query()
    → Find Subscription in DB (includes promotion fields)
    → StripeService.getSubscriptionWithDetails() (dynamic entitlementTier)
    → StripeService.listInvoices()
    → Return: { subscription (with promotion details), invoices }
  → BillingOverview client component (displays promotion badge/details)
```

### Library & Framework Requirements

| Library | Version | Usage | Already Installed |
|---------|---------|-------|-------------------|
| `stripe` | ^20.3.1 | Stripe Node SDK — `checkout.sessions.retrieve()` with expand, `coupons.retrieve()` | Yes (apps/api) |
| `@pawly/validators` | workspace | Zod schemas for promotion data | Yes (extend) |
| `next-intl` | latest | i18n translations for promotion labels | Yes |
| `lucide-react` | latest | Icons (Tag, Gift, Percent, BadgeCheck) | Yes |
| `shadcn/ui` | — | Badge component for promotion display | Yes |

**NO new dependencies needed** — all libraries already installed.

**Stripe SDK v20.3.1 — Key API calls for this story:**
```typescript
// Retrieve checkout session with discount expansion
const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
  expand: ['discounts', 'discounts.promotion_code'],
});
// fullSession.total_details.amount_discount → discount amount in cents
// fullSession.discounts[0].coupon → coupon ID (string, expandable)
// fullSession.discounts[0].promotion_code → promotion code object (if expanded)

// Retrieve coupon for metadata
const coupon = await stripe.coupons.retrieve(couponId);
// coupon.percent_off → 100 for 100% discount
// coupon.amount_off → fixed discount in cents
// coupon.metadata.type → 'partner' | 'internal' | 'lifetime'
// coupon.duration → 'once' | 'repeating' | 'forever'

// Important: 100% discount checkout has payment_status: 'no_payment_required'
// The checkout.session.completed webhook fires for BOTH paid and free checkouts
```

**Stripe API version considerations (v20.3.1 uses basil API):**
- The `discounts` array pattern is required (singular `coupon` param deprecated)
- `Discount.coupon` field is still a direct reference (clover API's `source.type` + `source.coupon` polymorphic pattern NOT yet in v20.x)
- `forever` + `amount_off` coupons restricted in basil API — use `percent_off: 100` for 100% discounts

### File Structure Requirements

```
apps/
├── api/
│   ├── prisma/
│   │   └── schema/
│   │       └── Subscription.prisma         # MODIFY — add 5 promotion fields
│   └── src/
│       ├── modules/
│       │   └── stripe/
│       │       ├── stripe.service.ts        # MODIFY — dynamic entitlementTier in getSubscriptionWithDetails
│       │       ├── stripe.service.spec.ts   # MODIFY — tests for enhanced methods
│       │       ├── stripe.utils.ts          # NEW — deriveEntitlementTier() utility
│       │       ├── stripe.utils.spec.ts     # NEW — utility tests
│       │       ├── stripe-webhook.controller.ts     # MODIFY — capture discount data, dynamic tier
│       │       └── stripe-webhook.controller.spec.ts # MODIFY — tests for promo/100% checkout
│       └── trpc/
│           └── routers/
│               └── stripe.router.ts         # MODIFY — include promotion in getBillingOverview response
├── web/
│   └── src/
│       ├── app/[locale]/admin/
│       │   └── billing/
│       │       └── _components/
│       │           └── BillingOverview.tsx   # MODIFY — display promotion details
│       └── i18n/langs/
│           ├── fr.json                      # MODIFY — add billing.promotion.* keys
│           └── en.json                      # MODIFY — add billing.promotion.* keys
packages/
└── validators/src/
    └── stripe/
        ├── promotion.schema.ts              # NEW — promotion Zod schemas
        ├── promotion.schema.test.ts         # NEW — validator tests
        ├── billing.schema.ts                # MODIFY — extend subscriptionDetailsSchema
        └── index.ts                         # MODIFY — export promotion schemas
```

**New files: 4** | **Modified files: 11**

### Testing Requirements

**Utility tests** (`apps/api/src/modules/stripe/stripe.utils.spec.ts`):
- `deriveEntitlementTier`: maps `lookup_key` 'starter_monthly' → 'starter', 'pro_monthly' → 'pro', 'enterprise_yearly' → 'enterprise'
- `deriveEntitlementTier`: falls back to `product.metadata.tier` when `lookup_key` is null
- `deriveEntitlementTier`: defaults to `'starter'` when no mapping found
- `deriveEntitlementTier`: handles subscription with no items gracefully

**Webhook controller tests** (extend `stripe-webhook.controller.spec.ts`):
- `checkout.session.completed` with promotion code: creates Subscription with promotionCodeId, couponId, discountType='percent', discountValue=25, couponMetadataType='partner'
- `checkout.session.completed` with 100% discount: creates Subscription with discountValue=100, discountType='percent'; verifies Clinic + Admin + Subscription + Magic Link created identically
- `checkout.session.completed` without promotion: Subscription promotion fields remain null
- `checkout.session.completed` with fixed amount coupon: stores discountType='amount', discountValue=2000 (cents)
- Dynamic `entitlementTier`: checkout with 'pro_monthly' lookup_key → entitlementTier='pro'; 100% promo on 'starter' plan → entitlementTier='starter' (not inflated)

**tRPC router tests** (extend `stripe.router.spec.ts`):
- `getBillingOverview` returns promotion details when subscription has promo data
- `getBillingOverview` returns null promotion fields when no promo applied

**Zod validator tests** (`packages/validators/src/stripe/promotion.schema.test.ts`):
- `promotionDetailsSchema`: accept valid promo with all fields; accept null couponMetadataType; reject invalid discountType
- `couponMetadataTypeEnum`: accept 'partner', 'internal', 'lifetime'; reject 'unknown'
- `discountTypeEnum`: accept 'percent', 'amount'; reject 'free'
- Extended `subscriptionDetailsSchema`: accept subscription with promotion fields; accept subscription without promotion (all null)

**Regression safety:**
- Run `pnpm test` from root — all existing 324+ tests must pass
- Run `pnpm build` from root — TypeScript compilation must succeed

### Previous Story Intelligence (Story 3.4)

**Patterns established in Story 3.4 that MUST be followed:**

- **tRPC router pattern**: `protectedProcedure` with `ctx.user.clinicId` from JWT. `getBillingOverview` already fetches Subscription + calls StripeService. Extend its response type.
- **Webhook claim-then-process**: Atomic `markEventProcessed()` + P2002 duplicate detection + `deleteEvent()` on failure. Do NOT change this pattern.
- **BillingOverview component**: Uses `useServerActionQuery` via `useBilling` hook. Displays subscription card + invoice table. Add promotion section below subscription card.
- **Badge component**: Already installed via shadcn. Use same pattern as subscription status badges for promotion type badges.
- **QueryKeyFactory**: `billing` namespace exists. No new namespace needed — promotion data is part of billing overview.

**Fixes from Story 3.4 code review to learn from:**
- Non-null assertion on nullable `stripeSubscriptionId` → always use explicit null check
- Hardcoded `entitlementTier: 'starter'` → THIS STORY fixes this (Task 2)
- Dead code in webhook invoice handlers → avoid dead code paths
- Missing tRPC router tests → ensure ALL new behavior has test coverage
- `as any` casts → use proper types imported from `@pawly/validators`

**Key files to reference for patterns:**
- `apps/api/src/modules/stripe/stripe.service.ts` — existing StripeService methods (expand subscription details)
- `apps/api/src/modules/stripe/stripe-webhook.controller.ts` — checkout.session.completed handler (the main enhancement target)
- `apps/api/src/trpc/routers/stripe.router.ts` — getBillingOverview procedure (extend response)
- `apps/web/src/app/[locale]/admin/billing/_components/BillingOverview.tsx` — subscription card display (add promo section)
- `packages/validators/src/stripe/billing.schema.ts` — subscriptionDetailsSchema (extend with promo fields)

### Git Intelligence

**Recent commit patterns (last 10 commits):**
- Commit style: `feat(story-X-Y): description` for features, `fix(story-X-Y): description` for fixes
- Feature branch pattern: `feature/story-X-Y-slug-name`
- Code review fixes: separate commit `fix(story-X-Y): address code review findings`
- All PRs target `develop` branch

**Current branch**: `feature/story-3-5-promotion-codes-100-discount-support` (created from `develop`)

**Dependencies from previous stories already in place:**
- StripeModule with service, webhook controller (Story 3.1)
- `createCheckoutSession` with `allow_promotion_codes: true` (Story 3.2)
- Subscription model with `entitlementTier` field (Story 1.4)
- StripeEvent idempotency (Story 1.4 + 3.1)
- Webhook handlers for 6 events (Stories 3.1, 3.2, 3.4)
- Billing page with subscription display and invoice history (Story 3.4)
- Admin layout with auth + onboarding guards (Story 3.3)
- i18n routing and translation infrastructure (Stories 2.1, 2.2)

### Latest Technical Information

**Stripe SDK v20.3.1 (basil API — project's current version):**

**Checkout Session with discounts:**
- `allow_promotion_codes: true` already enabled in `createCheckoutSession()` — customers enter codes on Stripe's hosted page
- Discount expansion: `stripe.checkout.sessions.retrieve(id, { expand: ['discounts', 'discounts.promotion_code'] })`
- Session fields: `total_details.amount_discount`, `discounts[]` array
- Discount object (v20.x/basil): `discount.coupon` (direct coupon object), `discount.promotion_code` (promo code ID or object if expanded)

**100% Discount handling:**
- `payment_status: 'no_payment_required'` (NOT `'paid'`)
- No PaymentIntent created — `session.payment_intent` is null
- Customer object always created by Stripe Checkout
- `checkout.session.completed` fires normally — handle BOTH `'paid'` AND `'no_payment_required'`
- Subscription created by Stripe with `status: 'active'` (not 'trialing') for 100% off

**Coupon metadata pattern (FR15):**
- Coupons configured in Stripe Dashboard with metadata: `{ type: 'partner' | 'internal' | 'lifetime' }`
- Retrieved via `stripe.coupons.retrieve(couponId)` — metadata accessible on `coupon.metadata`
- `percent_off: 100` for 100% discounts (with `duration: 'forever'` for indefinite)
- `max_redemptions` on Promotion Code (not Coupon) for usage limits

**Entitlement tier mapping strategy:**
- Use Stripe Price `lookup_key` as primary source (e.g., 'starter_monthly' → 'starter', 'pro_yearly' → 'pro')
- Fallback: Stripe Product `metadata.tier` (e.g., 'starter', 'pro', 'enterprise')
- Default: `'starter'` if no mapping found
- Applied consistently in: webhook checkout handler, subscription.updated handler, getSubscriptionWithDetails service

**Billing Portal & Promotions:**
- Stripe Billing Portal can display applied discounts to customers
- Portal configuration in Stripe Dashboard allows enabling discount display
- No code changes needed for portal promotion display — Stripe handles it

### UX & Design Reference

**"Clinique Zen" aesthetic for promotion display on billing page:**

**Promotion badge variants (coupon metadata type):**
| Type | Color | Label FR | Label EN |
|------|-------|----------|----------|
| `partner` | Emerald bg + white text | Partenaire | Partner |
| `internal` | Indigo bg + white text | Interne | Internal |
| `lifetime` | Vet Teal bg + white text | À vie | Lifetime |

**Promotion section layout (within subscription card):**
- Display below subscription status, above "Manage Subscription" button
- Show: Promotion code badge (rounded-full, colored by type), discount amount text, duration indicator
- 100% discount special indicator: Vet Teal background with Gift icon, "100% - Accès offert" / "100% - Free Access"
- Partial discount: Percent icon with discount value, code name

**Promotion card styling:**
- Container: `bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100 rounded-xl p-4`
- Code badge: `bg-teal-600 text-white px-3 py-1 rounded-full text-xs font-bold`
- Discount text: `text-lg font-bold text-teal-700`
- Type badge: Colored per table above, `px-2 py-0.5 rounded-full text-xs font-medium`

### Skill-Based Guidelines

#### Turborepo (Monorepo)
- **Run all commands from project root**: `pnpm test`, `pnpm build`, `pnpm db:push`, `pnpm db:generate`. NEVER `cd` into `apps/`.
- **Package exports**: When adding promotion schemas to `@pawly/validators`, ensure proper exports in `packages/validators/src/stripe/index.ts`.
- **Schema changes**: After modifying `Subscription.prisma`, run `pnpm db:push` then `pnpm db:generate` from root.

#### Vercel React Best Practices
- **`server-serialization`**: The billing page RSC already fetches data server-side. Promotion data is additional fields on the existing response — no new server-side fetching needed.
- **`minimize-client-state`**: Promotion data is read-only display. No additional client state management needed.

#### NestJS Best Practices
- **`arch-single-responsibility`**: `deriveEntitlementTier()` utility function is a pure function in `stripe.utils.ts` — not a service method. This keeps mapping logic separate from Stripe API calls.
- **`error-throw-http-exceptions`**: If coupon retrieval fails during webhook processing, log the error and continue without promotion data (non-critical). The Clinic/Admin/Subscription creation should NOT fail because of promo data extraction failure.
- **`graceful-degradation`**: Promotion data extraction in the webhook is additive. If `session.discounts` is empty or retrieval fails, store null values in promotion fields and proceed normally.

#### Frontend Design ("Clinique Zen" Implementation)
- **Promotion display feel**: Celebratory but not flashy. The admin should feel valued and recognized as a partner/promo user, without the UI feeling promotional or "sale-sy".
- **Conditional rendering**: Only show promotion section if `promotionCodeId` is non-null. Clean absence when no promo applied.
- **100% discount highlight**: Use Gift icon + Vet Teal gradient to signal "full access granted" — this is a special moment for partner clinics.

#### Stripe Plugin Context
- Story 3.5 does NOT build promo code management UI — all promo administration happens in Stripe Dashboard
- Pawly's role is limited to: (1) enabling promo code entry in checkout via `allow_promotion_codes: true`, (2) capturing promo data from webhook, (3) displaying promo status on billing page
- The `discounts` parameter on `checkout.sessions.create()` is NOT used — we let customers self-service enter codes
- Coupon metadata (`type`) is the primary mechanism for classifying promotions for internal tracking

### Project Structure Notes

- Alignment with architecture: promotion handling is part of the Stripe domain in `apps/api/src/modules/stripe/`
- No new NestJS module — extends existing StripeModule
- No new frontend routes — promotion display is added to the existing billing page
- The Subscription model gains 5 new nullable fields for promotion tracking
- The `entitlementTier` fix is a cross-cutting improvement that benefits all future stories (especially Story 3.6: Subscription-Based Access Control)
- This story does NOT implement subscription-based access control (that's Story 3.6) — but fixes `entitlementTier` which Story 3.6 depends on

### References

- [Source: docs/planning-artifacts/epics.md#Epic 3, Story 3.5]
- [Source: docs/planning-artifacts/architecture.md#Subscription Flow, Promo 100% Flow]
- [Source: docs/planning-artifacts/prd.md#FR15]
- [Source: docs/planning-artifacts/ux-design-specification.md#Clinique Zen Design System]
- [Source: docs/implementation-artifacts/3-4-subscription-management-billing-portal.md]
- [Source: docs/implementation-artifacts/3-2-stripe-checkout-clinic-registration.md]
- [Source: Stripe API — checkout.sessions.retrieve with expand discounts]
- [Source: Stripe API — coupons.retrieve for metadata]
- [Source: Stripe Documentation — Coupons and Promotion Codes]
- [Source: Stripe Documentation — No-cost orders (100% discount)]
- [Source: Stripe Changelog — basil API changes (2025-03-31)]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Fixed TS error: Stripe v20.3.1 uses `subscription.discounts[]` array (not singular `discount`) — updated `getSubscriptionWithDetails` accordingly
- Fixed TS error in BillingOverview.tsx: `discountValue` is `number | null | undefined` — added null guard before passing to `t()` ICU formatter
- Fixed test structure in `stripe.router.spec.ts`: misplaced `});` closing brace caused orphaned tests outside describe block

### Completion Notes List

- **Task 1**: Added 5 nullable promotion fields to Subscription.prisma (`promotionCodeId`, `couponId`, `discountType`, `discountValue`, `couponMetadataType`). Schema pushed to Neon DB and Prisma client regenerated.
- **Task 2**: Created `deriveEntitlementTier()` utility in `stripe.utils.ts` that extracts tier from `price.lookup_key` (e.g. `starter_monthly` → `starter`), falls back to `product.metadata.tier`, defaults to `'starter'`. Applied in webhook controller (checkout + subscription.updated handlers) and stripe service (getSubscriptionWithDetails). Hardcoded `'starter'` fully replaced.
- **Task 3**: Enhanced `handleCheckoutSessionCompleted` to retrieve expanded session with discounts, extract coupon/promo code IDs, discount type/value, and coupon metadata type. Graceful degradation: if session expand or coupon retrieval fails, null values stored and checkout proceeds normally. 100% discount (`no_payment_required`) follows identical creation flow — no special branching.
- **Task 4**: Created `promotion.schema.ts` with `promotionDetailsSchema`, `couponMetadataTypeEnum`, `discountTypeEnum`. Extended `subscriptionDetailsSchema` with 6 optional promotion fields. Exported from `stripe/index.ts`.
- **Task 5**: Extended `getBillingOverview` tRPC procedure to merge promotion fields from DB Subscription record with Stripe-fetched details. Added `promotionCodeName` from `getSubscriptionWithDetails` which retrieves promo code name from Stripe `discounts[]` array.
- **Task 6**: Added promotion section to BillingOverview with Clinique Zen aesthetic: gradient card with Gift/Percent icons, colored type badges (Emerald=partner, Indigo=internal, Teal=lifetime), 100% discount special highlight, promo code name pill. Conditionally rendered only when `promotionCodeId` exists.
- **Task 7**: Added FR/EN translation keys: `billing.promotion.title`, `promotion.code`, `promotion.discount`, `promotion.discountPercent`, `promotion.discountAmount`, `promotion.type.{partner|internal|lifetime}`, `promotion.fullDiscount`.
- **Task 8**: 8 new tests for `deriveEntitlementTier` utility, 6 new promotion webhook tests (percent discount, 100% discount, no promo, amount discount, dynamic tier, graceful failure), 2 new tRPC router tests (promo/no-promo), 14 new Zod validator tests. Updated existing tests for new response shapes. **Total: 354 tests passing** (136 API + 93 validators + 125 web). Build green.

### Change Log

- 2026-02-07: Story 3-5 implementation complete — Promotion Codes & 100% Discount Support. Added dynamic entitlementTier mapping, webhook promotion data capture, billing UI promotion display, i18n keys, comprehensive test coverage. 354 tests passing, build green.

### File List

**New files (4):**
- `apps/api/src/modules/stripe/stripe.utils.ts` — deriveEntitlementTier utility
- `apps/api/src/modules/stripe/stripe.utils.spec.ts` — utility tests (8 tests)
- `packages/validators/src/stripe/promotion.schema.ts` — promotion Zod schemas
- `packages/validators/src/stripe/promotion.schema.test.ts` — validator tests (14 tests)

**Modified files (11):**
- `apps/api/prisma/schema/Subscription.prisma` — added 5 promotion fields
- `apps/api/src/modules/stripe/stripe-webhook.controller.ts` — promotion data capture + dynamic entitlementTier
- `apps/api/src/modules/stripe/stripe-webhook.controller.spec.ts` — 6 new promotion tests + updated existing tests
- `apps/api/src/modules/stripe/stripe.service.ts` — dynamic entitlementTier + promotionCodeName retrieval
- `apps/api/src/modules/stripe/stripe.service.spec.ts` — updated expected response shape
- `apps/api/src/trpc/routers/stripe.router.ts` — promotion fields in getBillingOverview response
- `apps/api/src/trpc/routers/stripe.router.spec.ts` — 2 new promotion tests + updated response shape
- `packages/validators/src/stripe/billing.schema.ts` — extended subscriptionDetailsSchema with promotion fields
- `packages/validators/src/stripe/index.ts` — export promotion schemas
- `apps/web/src/app/[locale]/admin/billing/_components/BillingOverview.tsx` — promotion display section
- `apps/web/src/i18n/langs/fr.json` — billing.promotion.* FR translation keys
- `apps/web/src/i18n/langs/en.json` — billing.promotion.* EN translation keys

**Infrastructure:**
- `docs/implementation-artifacts/sprint-status.yaml` — status: in-progress → review
- `docs/implementation-artifacts/3-5-promotion-codes-100-discount-support.md` — story file updated
