# Story 3.6: Subscription-Based Access Control

Status: done

## User Story

As the system,
I need to restrict access to application features based on active subscription status,
So that only paying (or validly promoted) clinics can use the application.

## Acceptance Criteria

1. **Given** an authenticated admin, **When** they access any route under `/admin/*`, **Then** the `admin/layout.tsx` checks subscription status server-side
2. **And** source of truth is the `Subscription` record in DB (synced from Stripe via webhooks)
3. **And** access is granted if status is `active` or `trialing`
4. **And** access is denied (with redirect to billing page) if status is `past_due`, `canceled`, or `unpaid`
5. **And** the frontend NEVER determines subscription validity (always server-side check)
6. **And** feature gating respects the `entitlementTier` for future plan differentiation
7. **And** the billing page remains accessible even when subscription is inactive (so users can resubscribe)
8. **And** all access control messages have FR/EN i18n translations
9. **And** a tRPC `subscribedProcedure` middleware enforces subscription status at the API level
10. **And** tests cover all subscription statuses (active, trialing, past_due, canceled, unpaid, no subscription)

## Tasks

- [x] Task 1: Create subscription guard tRPC middleware (AC: #9, #2, #3, #4)
  - [x] 1.1 Export `isSubscribed` middleware from `apps/api/src/trpc/trpc.ts` (same pattern as `isAuthed` — routers compose locally via `const subscribedProcedure = protectedProcedure.use(isSubscribed);`)
  - [x] 1.2 Middleware looks up `Subscription` by `ctx.user.clinicId`, checks `status in ['active', 'trialing']`
  - [x] 1.3 Throws `TRPCError({ code: 'FORBIDDEN', message: 'Subscription inactive' })` if denied
  - [x] 1.4 Passes `subscription` object (with `entitlementTier`) into context for downstream use
  - [x] 1.5 Export `isEntitled(requiredTier)` middleware factory for future tier gating (AC: #6) — routers compose via `protectedProcedure.use(isSubscribed).use(isEntitled('professional'))`

- [x] Task 2: Create subscription check tRPC procedure (AC: #1, #2, #5)
  - [x] 2.1 Add `getSubscriptionStatus` query to `stripe.router.ts` — returns `{ status, entitlementTier, cancelAtPeriodEnd, currentPeriodEnd }` or `null`
  - [x] 2.2 Uses `protectedProcedure` (not subscribedProcedure — must be callable even when inactive)

- [x] Task 3: Update `admin/layout.tsx` with subscription guard (AC: #1, #3, #4, #5, #7)
  - [x] 3.1 After auth check + onboarding check, call `trpc.stripe.getSubscriptionStatus` server-side
  - [x] 3.2 If status NOT in `['active', 'trialing']` AND pathname is NOT `/admin/billing` AND pathname is NOT `/admin/onboarding` → redirect to `/admin/billing`
  - [x] 3.3 If no subscription found AND pathname is NOT `/admin/billing` AND pathname is NOT `/admin/onboarding` → redirect to `/admin/billing`
  - [x] 3.4 Pass `subscriptionStatus` and `entitlementTier` to children via React context or props

- [x] Task 4: Create `SubscriptionContext` provider for frontend (AC: #6)
  - [x] 4.1 Create `apps/web/src/lib/contexts/subscription-context.tsx` with `SubscriptionProvider` + `useSubscription` hook
  - [x] 4.2 Provider wraps admin layout children, exposes `{ status, entitlementTier, isActive, canAccessFeature(tier) }`
  - [x] 4.3 `canAccessFeature(requiredTier)` compares against current `entitlementTier`

- [x] Task 5: Create `SubscriptionGate` UI component (AC: #6)
  - [x] 5.1 Create `apps/web/src/components/SubscriptionGate.tsx` — wrapper component that shows children or upgrade prompt based on tier
  - [x] 5.2 Uses `useSubscription().canAccessFeature(requiredTier)` to gate visibility
  - [x] 5.3 Upgrade prompt shows localized message with link to billing page

- [x] Task 6: Update billing page for inactive subscription state (AC: #7)
  - [x] 6.1 Update `BillingOverview.tsx` to show a prominent "Subscription Inactive" banner when status is `past_due`, `canceled`, or `unpaid`
  - [x] 6.2 Show clear CTA: "Update Payment Method" (past_due), "Resubscribe" (canceled), "Contact Support" (unpaid)
  - [x] 6.3 Ensure "Manage Subscription" button still works for inactive subscriptions (Stripe Portal handles reactivation)

- [x] Task 7: Add i18n translation keys (AC: #8)
  - [x] 7.1 Add `subscription.guard.*` keys to `fr.json` and `en.json`:
    - `subscription.guard.inactive.title`, `subscription.guard.inactive.description`
    - `subscription.guard.pastDue.title`, `subscription.guard.pastDue.description`, `subscription.guard.pastDue.action`
    - `subscription.guard.canceled.title`, `subscription.guard.canceled.description`, `subscription.guard.canceled.action`
    - `subscription.guard.unpaid.title`, `subscription.guard.unpaid.description`, `subscription.guard.unpaid.action`
    - `subscription.guard.upgrade.title`, `subscription.guard.upgrade.description`
    - `subscription.guard.noSubscription.title`, `subscription.guard.noSubscription.description`

- [x] Task 8: Migrate existing procedures to `subscribedProcedure` (AC: #9)
  - [x] 8.1 Update `clinic.router.ts` — import `isSubscribed` from `../trpc`, create local `subscribedProcedure = protectedProcedure.use(isSubscribed)`. Migrate all procedures except `getOnboardingStatus` to `subscribedProcedure`
  - [x] 8.2 Update `stripe.router.ts` — import `isSubscribed` from `../trpc`, create local `subscribedProcedure` but keep `getBillingOverview` and `createBillingPortalSession` as `protectedProcedure` (must work even when inactive). Only use `subscribedProcedure` for future procedures that require active subscription

- [x] Task 9: Add Zod validation schemas (AC: #2)
  - [x] 9.1 Create `packages/validators/src/stripe/subscription-status.schema.ts` with:
    - `subscriptionStatusSchema` (enum: active, trialing, past_due, canceled, unpaid)
    - `subscriptionGuardResponseSchema` (status, entitlementTier, cancelAtPeriodEnd, currentPeriodEnd)
    - Export TypeScript types: `SubscriptionStatus`, `SubscriptionGuardResponse` (via `z.infer<>`)
  - [x] 9.2 Export from `packages/validators/src/stripe/index.ts` — both schemas AND types (follow existing pattern: `export { schema } from ...` + `export type { Type } from ...`)

- [x] Task 10: Write tests (AC: #10)
  - [x] 10.1 **API tests** (`apps/api/src/trpc/trpc.spec.ts`): Test `subscribedProcedure` middleware with all 5 statuses + no subscription
  - [x] 10.2 **API tests** (`stripe.router.spec.ts`): Test `getSubscriptionStatus` procedure — active, inactive, not found
  - [x] 10.3 **Validator tests** (`subscription-status.schema.test.ts`): Test schema validation for all status values
  - [x] 10.4 **Web tests** (`SubscriptionGate.spec.tsx`): Test gate component renders children vs upgrade prompt
  - [x] 10.5 Run `pnpm test` — all tests pass, zero regressions
  - [x] 10.6 Run `pnpm build` — TypeScript compilation succeeds

## Dev Notes

### Critical Rules (NON-NEGOTIABLE)

1. **Data flow**: Component → Hook → Zsa → Server Action → tRPC → NestJS. NO shortcuts.
2. **Server-side enforcement ONLY**: The `admin/layout.tsx` subscription check is the PRIMARY guard. Frontend `SubscriptionContext` is for UI convenience ONLY — never trust it for security.
3. **Multi-tenant isolation**: `Subscription` lookup MUST use `ctx.user.clinicId` from JWT. NEVER accept clinicId from client input.
4. **Billing page exception**: `/admin/billing` MUST remain accessible even with inactive subscription — it's the reactivation path.
5. **Onboarding exception**: `/admin/onboarding` check happens BEFORE subscription check — new clinics in trialing status need onboarding first. The subscription guard must also SKIP the onboarding route (already handled by onboarding guard).
6. **RSC pathname detection**: App Router layouts don't receive pathname props. Use `(await headers()).get('x-pathname')` — set by `proxy.ts` middleware. Already used in existing onboarding guard.
7. **i18n**: All user-facing strings must have FR/EN translation keys. Use `useTranslations('subscription.guard')`.
8. **No new NestJS modules**: This story extends existing `stripe.router.ts` and `trpc.ts`. No new NestJS module needed.
9. **Source of truth**: `Subscription` record in DB (synced from Stripe via webhooks). NEVER call Stripe API to check status in the guard — use cached DB value.
10. **Middleware export pattern**: Export `isSubscribed` middleware from `trpc.ts` (like `isAuthed`). Routers import and compose locally: `const subscribedProcedure = protectedProcedure.use(isSubscribed);`. Do NOT export a global `subscribedProcedure` from `trpc.ts` — this avoids type portability issues.

### Architecture Compliance

**Guard chain order in `admin/layout.tsx`:**
```
1. Auth check → cookie 'auth-token' present? → No → redirect /login
2. Onboarding check → Clinic.onboardingCompleted? → No → redirect /admin/onboarding
3. Subscription check → Subscription.status in [active, trialing]? → No → redirect /admin/billing
4. Render children (with SubscriptionContext providing tier info)
```

**tRPC middleware chain (composed locally in each router):**
```
publicProcedure → (no auth)
protectedProcedure = publicProcedure.use(isAuthed) → validates JWT, injects user
subscribedProcedure = protectedProcedure.use(isSubscribed) → checks Subscription.status
entitlementProcedure = subscribedProcedure.use(isEntitled(tier)) → checks entitlementTier
```
Note: `isAuthed`, `isSubscribed`, `isEntitled()` are exported from `trpc.ts`. Each router imports and composes them locally.

**Backend file locations:**
- Middleware: `apps/api/src/trpc/trpc.ts` (extend existing file)
- Procedure: `apps/api/src/trpc/routers/stripe.router.ts` (extend existing)
- Helpers: `apps/api/src/trpc/helpers.ts` (extend if needed)

**Frontend file locations:**
- Layout: `apps/web/src/app/[locale]/admin/layout.tsx` (modify existing)
- Context: `apps/web/src/lib/contexts/subscription-context.tsx` (NEW)
- Gate component: `apps/web/src/components/SubscriptionGate.tsx` (NEW)
- Billing: `apps/web/src/app/[locale]/admin/billing/_components/BillingOverview.tsx` (modify existing)
- i18n: `apps/web/src/i18n/langs/fr.json` and `en.json` (modify existing)

**Validators location:**
- `packages/validators/src/stripe/subscription-status.schema.ts` (NEW)
- `packages/validators/src/stripe/index.ts` (modify existing)

### Library & Framework Requirements

| Library | Version | Usage | Already Installed |
|---------|---------|-------|-------------------|
| `@trpc/server` | ^11.9.0 | tRPC middleware for subscription guard | Yes |
| `@pawly/validators` | workspace | Zod schemas for subscription status | Yes (extend) |
| `next-intl` | latest | i18n translations | Yes |
| `lucide-react` | latest | Icons (ShieldAlert, CreditCard, AlertTriangle) | Yes |
| `shadcn/ui` | — | Alert, Button, Card components | Yes |
| `next/navigation` | — | `redirect()` in server components | Yes (built-in) |

**NO new dependencies needed.**

### Technical Requirements

**tRPC `isSubscribed` middleware pattern (follows existing `isAuthed` pattern):**
```typescript
// In apps/api/src/trpc/trpc.ts — export middleware (like isAuthed)
export const isSubscribed = t.middleware(async ({ ctx, next }) => {
  const subscription = await ctx.prisma.subscription.findUnique({
    where: { clinicId: ctx.user.clinicId },
    select: { status: true, entitlementTier: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
  });

  if (!subscription || !['active', 'trialing'].includes(subscription.status)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Active subscription required',
    });
  }

  return next({
    ctx: { ...ctx, subscription },
  });
});

// In routers (e.g., clinic.router.ts) — compose locally like protectedProcedure
import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';
const protectedProcedure = publicProcedure.use(isAuthed);
const subscribedProcedure = protectedProcedure.use(isSubscribed);
```

**Admin layout subscription check pattern (Next.js 16 RSC):**
```typescript
// In admin/layout.tsx — after auth + onboarding checks
const pathname = (await headers()).get('x-pathname') || '';
const subscriptionStatus = await trpc.stripe.getSubscriptionStatus.query();

const isSubscriptionActive = subscriptionStatus &&
  ['active', 'trialing'].includes(subscriptionStatus.status);
const isBillingPage = pathname.includes('/admin/billing');
const isOnboardingRoute = pathname.includes('/admin/onboarding');

if (!isSubscriptionActive && !isBillingPage && !isOnboardingRoute) {
  redirect(`/${locale}/admin/billing`);
}
```

**SubscriptionContext pattern:**
```typescript
// In apps/web/src/lib/contexts/subscription-context.tsx
const TIER_HIERARCHY = ['starter', 'professional', 'enterprise'] as const;

interface SubscriptionContextValue {
  status: SubscriptionStatus | null;
  entitlementTier: string;
  isActive: boolean;
  canAccessFeature: (requiredTier: string) => boolean;
}

function canAccessFeature(currentTier: string, requiredTier: string): boolean {
  const currentIndex = TIER_HIERARCHY.indexOf(currentTier as any);
  const requiredIndex = TIER_HIERARCHY.indexOf(requiredTier as any);
  if (currentIndex === -1 || requiredIndex === -1) return false;
  return currentIndex >= requiredIndex;
}
```

### File Structure Requirements

**New files (4):**
```
apps/web/src/lib/contexts/subscription-context.tsx    # React context + hook
apps/web/src/components/SubscriptionGate.tsx           # UI gate component
packages/validators/src/stripe/subscription-status.schema.ts    # Zod schemas
packages/validators/src/stripe/subscription-status.schema.test.ts  # Validator tests
```

**Modified files (8):**
```
apps/api/src/trpc/trpc.ts                              # Add subscribedProcedure middleware
apps/api/src/trpc/routers/stripe.router.ts              # Add getSubscriptionStatus procedure
apps/api/src/trpc/routers/stripe.router.spec.ts         # Add tests for new procedure
apps/api/src/trpc/routers/clinic.router.ts              # Migrate to subscribedProcedure
apps/web/src/app/[locale]/admin/layout.tsx              # Add subscription guard
apps/web/src/app/[locale]/admin/billing/_components/BillingOverview.tsx  # Inactive state UI
apps/web/src/i18n/langs/fr.json                         # Subscription guard translations
apps/web/src/i18n/langs/en.json                         # Subscription guard translations
```

### Testing Requirements

**API Tests (Jest, `*.spec.ts`):**
- `subscribedProcedure` middleware: 6 tests (active ✓, trialing ✓, past_due ✗, canceled ✗, unpaid ✗, no subscription ✗)
- `getSubscriptionStatus` procedure: 3 tests (active sub, inactive sub, no sub found)
- `clinic.router` migration: verify procedures still work with `subscribedProcedure`

**Validator Tests (Vitest, `*.test.ts`):**
- `subscriptionStatusSchema`: 5 tests (one per valid status) + invalid value rejection
- `subscriptionGuardResponseSchema`: valid object + missing fields rejection

**Web Tests (Vitest, `*.spec.ts`):**
- `SubscriptionGate`: renders children when tier matches, shows upgrade when tier insufficient, handles null subscription

**Expected test additions: ~25-30 new tests**
**Target total: ~380-385 tests (354 current + ~30 new)**

### Previous Story Intelligence

**From Story 3-5 (Promotion Codes):**
- `deriveEntitlementTier()` utility in `stripe.utils.ts` — maps Stripe price lookup_key prefix to tier name
- Subscription model already has `entitlementTier` field populated by webhooks
- Current tiers: derived from Stripe, default = `'starter'`
- Promo users get same tier as plan (never inflated)

**From Story 3-4 (Billing Portal):**
- `getBillingOverview` already exists in `stripe.router.ts` — fetches subscription details + invoices
- `createBillingPortalSession` already exists — redirects to Stripe hosted portal
- BillingOverview component already displays subscription status with color-coded badges
- Status badge variants: active=teal, trialing=indigo, past_due=orange, canceled=rose

**From Story 3-3 (Onboarding):**
- `admin/layout.tsx` already has auth + onboarding guard pattern using `x-pathname` header
- Guard reads from `headers()` to detect current pathname in RSC
- Pattern: server-side tRPC call → check condition → `redirect()` if failed
- `clinic.getOnboardingStatus` is the existing guard call pattern to follow

**From Story 3-2 (Checkout):**
- Subscription created with `status: 'active'` (or trialing if configured in Stripe)
- `entitlementTier` set by `deriveEntitlementTier()` at creation time
- 100% promo users also get `status: 'active'` with same tier

**From Story 3-1 (Webhook Security):**
- Webhook handlers update `Subscription.status` on lifecycle events
- `customer.subscription.updated` → updates status, planKey, entitlementTier, currentPeriodEnd
- `customer.subscription.deleted` → sets status to `canceled`
- `invoice.payment_failed` → sets status to `past_due`
- All changes are idempotent via StripeEvent table

### Git Intelligence

**Recent commit pattern:** `feat(story-X-Y): description` for features, `fix(story-X-Y): description` for review fixes.

**Relevant commits:**
- `0bb7b850` fix(story-2-1): restore auth guards in admin layout — the original guard pattern
- `621791ae` feat(story-3-3): onboarding guard added to admin layout
- `e8f06625` feat(story-3-4): billing page created
- `c8c42ee2` feat(story-3-5): entitlementTier derivation + promotion fields

### Project Context Reference

- [Source: docs/planning-artifacts/epics.md, Epic 3, Story 3.6]
- [Source: docs/planning-artifacts/architecture.md, Authentication & Security section]
- [Source: docs/planning-artifacts/prd.md, FR16]
- [Source: docs/planning-artifacts/architecture.md, Subscription Guard definition]

### Clinique Zen Design Reference

For inactive subscription states, use:
- **Past Due**: Vital Orange (#F97316) background-tinted alert card + AlertTriangle icon
- **Canceled**: Rose (#F43F5E) background-tinted alert card + ShieldAlert icon
- **Unpaid**: Rose (#F43F5E) background-tinted alert card + CreditCard icon
- **Upgrade prompt** (tier gate): Vet Teal (#009588) outline card + Lock icon
- Cards: `rounded-2xl`, ample padding, Inter font, lucide-react icons at 1.5px stroke

### Dev Agent Record

#### Agent Model Used

Claude Opus 4.6

#### Debug Log References

- Fixed `@pawly/zod` import (not `zod`) in subscription-status.schema.ts — validators package uses workspace `@pawly/zod`
- Fixed TypeScript type propagation in `isSubscribed` middleware — must re-assert `user` type in `next()` ctx to maintain `AuthenticatedUser` narrowing through middleware chain
- Fixed pre-existing type mismatch in `getBillingOverview` — `discountType` and `couponMetadataType` from Prisma are `string | null` but Zod schema expects union literals; added type assertions

#### Completion Notes List

- **Task 1**: Created `isSubscribed` and `isEntitled(tier)` middlewares in `trpc.ts`, following existing `isAuthed` pattern. Exported for local router composition.
- **Task 2**: Added `getSubscriptionStatus` query to `stripe.router.ts` using `protectedProcedure` (callable even when inactive). Returns status, entitlementTier, cancelAtPeriodEnd, currentPeriodEnd or null.
- **Task 3**: Updated `admin/layout.tsx` with 3-layer guard chain: auth → onboarding → subscription. Uses `x-pathname` header for RSC route detection. Billing and onboarding pages exempted.
- **Task 4**: Created `SubscriptionProvider` + `useSubscription` hook in `subscription-context.tsx` with tier hierarchy comparison via `canAccessFeature()`.
- **Task 5**: Created `SubscriptionGate` component with Clinique Zen styling — renders children or upgrade prompt with Lock icon and billing link.
- **Task 6**: Added status-specific inactive banners to `BillingOverview.tsx`: past_due (orange/AlertTriangle), canceled (rose/ShieldAlert), unpaid (rose/CreditCard) with appropriate CTAs.
- **Task 7**: Added 18 subscription.guard.* translation keys to both fr.json and en.json covering all inactive states and upgrade prompts.
- **Task 8**: Migrated clinic.router.ts procedures to `subscribedProcedure` (except `getOnboardingStatus` which stays `protectedProcedure`). stripe.router.ts billing procedures stay `protectedProcedure` as designed.
- **Task 9**: Created `subscription-status.schema.ts` with Zod schemas and TypeScript types, exported from validators/stripe/index.ts.
- **Task 10**: Tests after code review fixes — 14 isSubscribed/isEntitled middleware (8+3 original + 3 edge cases) + 5 getSubscriptionStatus + 15 subscription schema + 5 SubscriptionGate + 22 SubscriptionContext. Total: 428 tests (161 API + 152 Web + 115 Validators). Build green.

#### Change Log

- 2026-02-09: Story 3-6 implemented — subscription-based access control with tRPC middleware, admin layout guard, SubscriptionContext, SubscriptionGate, billing inactive states, i18n keys, procedure migration, Zod validators.
- 2026-02-09: Code review fixes — removed `as any` type cast in isEntitled, fixed layout early return security bypass (redirect to onboarding instead of bare return), fixed SubscriptionGate CTA i18n key (upgrade.action), extracted shared constants (ACTIVE_SUBSCRIPTION_STATUSES, TIER_HIERARCHY) to validators package, added 22 SubscriptionContext tests, added 3 isEntitled edge case tests, strengthened error message assertions. Total: 428 tests.

## File List

**New files (4):**
- `apps/web/src/lib/contexts/subscription-context.tsx` — SubscriptionProvider + useSubscription hook
- `apps/web/src/components/SubscriptionGate.tsx` — UI gate component for tier-based feature gating
- `packages/validators/src/stripe/subscription-status.schema.ts` — Zod schemas + TypeScript types
- `packages/validators/src/stripe/subscription-status.schema.test.ts` — 15 validator tests

**New test files (3):**
- `apps/api/src/trpc/trpc.spec.ts` — 14 tests (isSubscribed + isEntitled middleware + edge cases)
- `apps/web/src/components/__tests__/SubscriptionGate.spec.tsx` — 5 component tests
- `apps/web/src/lib/contexts/__tests__/subscription-context.spec.tsx` — 22 tests (canAccessFeature all tiers + edge cases)

**Modified files (8):**
- `apps/api/src/trpc/trpc.ts` — Added isSubscribed + isEntitled middleware exports, shared constants import, removed `as any`
- `apps/api/src/trpc/routers/stripe.router.ts` — Added getSubscriptionStatus procedure + type cast fix
- `apps/api/src/trpc/routers/stripe.router.spec.ts` — Added 5 getSubscriptionStatus tests
- `apps/api/src/trpc/routers/clinic.router.ts` — Migrated 4 procedures to subscribedProcedure
- `apps/web/src/app/[locale]/admin/layout.tsx` — Added subscription guard + SubscriptionProvider, fixed early return bypass
- `apps/web/src/app/[locale]/admin/billing/_components/BillingOverview.tsx` — Added inactive subscription banners
- `apps/web/src/i18n/langs/en.json` — Added billing.guard.* translation keys + upgrade.action
- `apps/web/src/i18n/langs/fr.json` — Added billing.guard.* translation keys + upgrade.action
- `apps/web/src/lib/contexts/subscription-context.tsx` — Uses shared constants from validators
- `apps/web/src/components/SubscriptionGate.tsx` — Fixed CTA to use upgrade.action i18n key
- `packages/validators/src/stripe/index.ts` — Added subscription-status schema + constants exports
- `packages/validators/src/stripe/subscription-status.schema.ts` — Added ACTIVE_SUBSCRIPTION_STATUSES + TIER_HIERARCHY constants
- `docs/implementation-artifacts/sprint-status.yaml` — Status updates
