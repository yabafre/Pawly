# Story 4.2: Pricing Page with Pre-Checkout Form

Status: done

## User Story

As a non-authenticated visitor,
I want to view detailed pricing plans and start the subscription process directly from the pricing page,
so that I can compare options and seamlessly begin my clinic registration.

## Acceptance Criteria

1. **Pricing page route** at `/pricing` (FR) and `/en/pricing` (EN) displays all subscription plans with features, prices, and CTAs
2. **Pre-checkout form** — each plan's CTA opens a form collecting: clinic name, admin name, admin email
3. **Stripe Checkout redirect** — submitting the form calls `stripe.createCheckoutSession` (Story 3.2) and redirects to Stripe hosted Checkout
4. **Promotion code field** — rendered by Stripe on the hosted Checkout page (configured via `allow_promotion_codes: true` — already implemented in Story 3.2). No promo code input needed on the Pawly pre-checkout form.
5. **SSG-rendered** — page uses `generateStaticParams` for locale-based static generation, `setRequestLocale(locale)` in page component
6. **Performance** — Lighthouse Performance score >= 90 (NFR21), no authentication required, no non-essential cookies (NFR22)
7. **Success page** — after Stripe Checkout, user lands on `/pricing/success` with confirmation message and "check your email" instruction
8. **i18n** — all user-facing text translated in FR and EN using `pricing.*` namespace
9. **Responsive** — fully responsive layout on mobile, tablet, desktop following "Clinique Zen" aesthetic
10. **Accessibility** — WCAG AA compliance, semantic HTML, 44px+ touch targets, keyboard navigation

## Tasks

**IMPORTANT: Existing Code from Story 3.2**

The following files **already exist** and must be **refactored/enhanced**, NOT recreated:
- `pricing/page.tsx` — exists as basic single-plan page, needs SSG refactor + multi-plan redesign
- `pricing/_actions/checkout-actions.ts` — exists with correct Zsa pattern, keep as-is
- `pricing/_components/PreCheckoutForm.tsx` — exists with full @tanstack/react-form implementation, enhance for multi-plan
- `pricing/success/page.tsx` — exists, needs SSG refactor (setRequestLocale, generateMetadata)

---

- [x] Task 1: Refactor pricing page for SSG + multi-plan (AC: #1, #5)
  - [x] 1.1 Refactor `pricing/page.tsx`: convert from client component (`useTranslations`) to async Server Component (`getTranslations`), add `setRequestLocale(locale)`, accept `params` as Promise, add `generateMetadata`
  - [x] 1.2 Migrate from single `NEXT_PUBLIC_STRIPE_PRICE_ID` to 3 env vars: `NEXT_PUBLIC_STRIPE_PRICE_STARTER`, `NEXT_PUBLIC_STRIPE_PRICE_PROFESSIONAL`, `NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE`. Update `.env.example` accordingly.
  - [x] 1.3 Implement SEO metadata (title, description, OG, Twitter) via `generateMetadata` using `pricing.meta.*` i18n keys
  - [x] 1.4 Wrap page content with `LandingHeader` and `LandingFooter` from `@/app/[locale]/_components/` for consistent navigation
  - [x] 1.5 Verify `/pricing` entries in `sitemap.ts` (already present from Story 4-1)

- [x] Task 2: Build PricingPlans Server Component (AC: #1, #9, #10)
  - [x] 2.1 Create `_components/PricingPlans.tsx` as Server Component displaying 3 plans (Starter/Professional/Enterprise) in responsive grid
  - [x] 2.2 Use plan data from `landing.pricing.*` translation keys (prices: 29€/59€/99€ per month)
  - [x] 2.3 Each plan card: name, price, description, feature list with Check icons, CTA button
  - [x] 2.4 "Most Popular" badge on Professional plan (key: `landing.pricing.professional.popular`)
  - [x] 2.5 CTA button opens/expands the PreCheckoutForm below the selected plan, passing the plan's `priceId`
  - [x] 2.6 Follow Clinique Zen design: `rounded-3xl` cards, `shadow-lg shadow-primary/10`, Inter font, `h-12` CTAs

- [x] Task 3: Enhance PreCheckoutForm for multi-plan (AC: #2, #3)
  - [x] 3.1 The existing `PreCheckoutForm.tsx` already handles: form fields (clinicName, adminName, adminEmail), validation with `createCheckoutSessionSchema`, Zsa server action call, loading/error states, redirect to Stripe
  - [x] 3.2 Enhance: accept `priceId` dynamically from selected plan (currently works — already accepts `priceId` prop)
  - [x] 3.3 Add `useCheckout` hook in `_hooks/useCheckout.ts` wrapping `useServerActionMutation` from `zsa-react-query` for proper data flow compliance (Component → Hook → Zsa → Server Action → tRPC → NestJS)
  - [x] 3.4 Refactor PreCheckoutForm to use `useCheckout` hook instead of calling `createCheckoutSessionAction` directly

- [x] Task 4: Refactor success page for SSG (AC: #7)
  - [x] 4.1 Refactor `success/page.tsx`: convert from `useTranslations` to `getTranslations`, add `setRequestLocale(locale)`, accept async `params`, add `generateMetadata`
  - [x] 4.2 Add link back to homepage using `Link` from `@/i18n/navigation` (auto-handles locale prefix)
  - [x] 4.3 The `?session_id=` query param in the URL is for Stripe analytics only — do NOT use `searchParams` (would break SSG)
  - [x] 4.4 Wrap with `LandingHeader` and `LandingFooter` for consistent navigation

- [x] Task 5: i18n translations (AC: #8)
  - [x] 5.1 Add `pricing.meta.title` and `pricing.meta.description` keys to `en.json` and `fr.json` (for SEO — currently missing)
  - [x] 5.2 Add `pricing.page.heading` and `pricing.page.subtitle` keys for the dedicated pricing page (distinct from `pricing.title`/`pricing.subtitle` which are for the single-plan view)
  - [x] 5.3 Existing keys to REUSE (do NOT recreate): `pricing.preCheckout.*` (6 keys), `pricing.success.*` (5 keys), `pricing.title`, `pricing.subtitle`, `landing.pricing.*` (all plan data)

- [x] Task 6: Tests (AC: all)
  - [x] 6.1 Unit tests for PricingPlans Server Component (rendering, plan cards, features, CTA buttons)
  - [x] 6.2 Unit tests for enhanced PreCheckoutForm (field validation, submit via hook, error display)
  - [x] 6.3 Unit tests for refactored success page (rendering, messages, homepage link)
  - [x] 6.4 Unit tests for `useCheckout` hook (mock `useServerActionMutation`, success/error paths)
  - [x] 6.5 Test `generateMetadata` returns correct locale-specific metadata for both pricing page and success page
  - [x] 6.6 Test SSG: verify `setRequestLocale` is called in both pages

## Dev Notes

### Critical Architecture Constraints

- **Data flow**: Component → Hook → Zsa → Server Action → tRPC → NestJS (mandatory for checkout mutation)
- **Pricing page is FULLY PUBLIC** — zero authentication, zero session cookies, zero subscription checks
- **SSG for display, Client Component ONLY for form** — PricingPlans = Server Component, PreCheckoutForm = Client Component
- **`setRequestLocale(locale)` MUST be called** in pricing page AND success page
- **`params` is a Promise** in Next.js 15+ — always `const { locale } = await params`
- **All pnpm commands from project root**, never `cd` into apps/

### Existing Code Inventory (from Story 3.2)

| File | Status | What Needs to Change |
|------|--------|---------------------|
| `pricing/page.tsx` | REFACTOR | `useTranslations` → `getTranslations`, add SSG (setRequestLocale, generateMetadata, async params), single priceId → multi-plan with PricingPlans component, add Header/Footer |
| `pricing/_actions/checkout-actions.ts` | KEEP AS-IS | Already correct: `createServerAction()` + `createCheckoutSessionSchema` + tRPC call |
| `pricing/_components/PreCheckoutForm.tsx` | ENHANCE | Already works. Refactor to use `useCheckout` hook instead of direct action call |
| `pricing/success/page.tsx` | REFACTOR | `useTranslations` → `getTranslations`, add SSG (setRequestLocale, generateMetadata, async params), add homepage link, add Header/Footer |
| `pricing/_components/PricingPlans.tsx` | NEW | Server Component — 3-plan grid display |
| `pricing/_hooks/useCheckout.ts` | NEW | Hook wrapping `useServerActionMutation` from `zsa-react-query` |

### DO NOT Recreate — Reuse These Existing Components & Code

| What | Location | Notes |
|------|----------|-------|
| `createCheckoutSessionAction` | `pricing/_actions/checkout-actions.ts` | Already implements Zsa pattern correctly |
| `createCheckoutSessionSchema` | `@pawly/validators` checkout.schema.ts | Zod schema: clinicName, adminName, adminEmail, priceId, locale |
| `stripe.createCheckoutSession` | tRPC router `stripe.router.ts` | Public procedure, calls StripeService |
| `StripeService.createCheckoutSession` | `apps/api/src/modules/stripe/stripe.service.ts` | Creates hosted Checkout, success_url → `/pricing/success` |
| `PricingPreviewSection` | `apps/web/src/app/[locale]/_components/PricingPreviewSection.tsx` | Landing page pricing (display-only) — use as DESIGN REFERENCE, do NOT import directly |
| `LandingHeader` | `apps/web/src/app/[locale]/_components/LandingHeader.tsx` | Reusable header with logo, nav, language switcher — import for pricing pages |
| `LandingFooter` | `apps/web/src/app/[locale]/_components/LandingFooter.tsx` | Reusable footer — import for pricing pages |
| `useServerActionMutation` | `src/lib/hooks/server-action-hooks.ts` | Exported from `zsa-react-query` wrapper — use for `useCheckout` hook |
| `QueryKeyFactory` | `src/lib/hooks/server-action-hooks.ts` | Add `checkout: () => ["checkout"]` key for the new hook |
| `Button, Card, Input, Label` | `src/components/ui/` | shadcn/ui components |
| `cn()` | `src/lib/utils.ts` | Classname merge utility |
| `Link` | `@/i18n/navigation` | Locale-aware link component |
| Existing translations | `pricing.*` in `en.json`/`fr.json` | `preCheckout` (6 keys), `success` (5 keys), `title`, `subtitle` |
| Existing translations | `landing.pricing.*` in `en.json`/`fr.json` | Plan names, prices, features, CTA, currency, perMonth |

### i18n Key Inventory

**Already exist (DO NOT recreate):**
- `pricing.title` — "Start managing your clinic"
- `pricing.subtitle` — "Subscribe to get started..."
- `pricing.preCheckout.clinicNameLabel`, `.clinicNamePlaceholder`, `.adminNameLabel`, `.adminNamePlaceholder`, `.adminEmailLabel`, `.adminEmailPlaceholder`, `.submitButton`, `.submitting`, `.error`
- `pricing.success.title`, `.description`, `.checkEmail`, `.checkEmailDescription`, `.spamNote`
- `landing.pricing.title`, `.subtitle`, `.badge`, `.cta`, `.currency`, `.perMonth`
- `landing.pricing.starter.*`, `.professional.*`, `.enterprise.*` (name, price, interval, description, features, popular)

**Need to CREATE:**
- `pricing.meta.title` — SEO title for pricing page
- `pricing.meta.description` — SEO description for pricing page
- `pricing.page.heading` — page heading for dedicated pricing page (different from generic `pricing.title`)
- `pricing.page.subtitle` — page subtitle for dedicated pricing page

### Hook Architecture: useCheckout

```typescript
// pricing/_hooks/useCheckout.ts
import { useServerActionMutation } from "@/lib/hooks/server-action-hooks";
import { createCheckoutSessionAction } from "../_actions/checkout-actions";

export const useCheckout = () => {
  const { mutate, isPending, error } = useServerActionMutation(
    createCheckoutSessionAction,
    { actionKeyFactory: () => ["checkout"] }
  );
  return { checkout: mutate, isPending, error };
};
```

### Environment Variables Migration

**Current (Story 3.2):** Single env var
```
NEXT_PUBLIC_STRIPE_PRICE_ID=price_xxxxxxxxxxxx
```

**Target (Story 4.2):** Three env vars for multi-plan
```
NEXT_PUBLIC_STRIPE_PRICE_STARTER=price_xxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PRICE_PROFESSIONAL=price_xxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE=price_xxxxxxxxxxxx
```

Update `.env.example` and remove the old `NEXT_PUBLIC_STRIPE_PRICE_ID`.

### Stripe Integration Details

**Existing `createCheckoutSession` already handles:**
- `mode: 'subscription'` with `line_items: [{ price: priceId, quantity: 1 }]`
- `allow_promotion_codes: true` (promo code field built into Stripe hosted Checkout — NOT on Pawly form)
- `success_url: /{locale}/pricing/success?session_id={CHECKOUT_SESSION_ID}`
- `cancel_url: /{locale}/pricing`
- Metadata: `clinicName`, `adminName`, `adminEmail` on both session and subscription
- After payment, webhook `checkout.session.completed` creates Clinic + Admin + Subscription + sends Magic Link

**NO @stripe/stripe-js needed** — Checkout is fully hosted by Stripe. Client just redirects to the session URL.

### Design System: "Clinique Zen" (Brand Board v1.3 — "Modern Clinical")

**Color Palette:**
| Token | Hex | Usage |
|-------|-----|-------|
| Surgical White | `#FFFFFF` | Card backgrounds, content areas |
| Neutral Wash | `#FDFDFD` | Page/app background |
| Ink Black | `#171717` | Headings, high-contrast text, **primary CTA buttons** |
| Soft Steel | `#737373` | Body text, muted labels, inactive icons |
| Vet Teal | `#009588` | Medical identity, validation accents, text links, focus rings, badges |
| Electric Indigo | `#4F46E5` | UI actions, secondary buttons, links |
| Vital Orange | `#F97316` | Soft alerts, tags, warmth accents (NOT for CTAs) |

**Buttons (CRITICAL — teal is NOT for primary CTAs):**
- **Primary CTA:** `bg-neutral-900 text-white rounded-xl font-bold hover:bg-black shadow-lg shadow-neutral-900/10`
- **Secondary:** `bg-white text-neutral-900 border border-neutral-200 rounded-xl hover:bg-neutral-50`
- **Text link:** `text-[#009588] hover:text-[#00796B]` (teal for text links only)

**Cards:**
- `rounded-3xl border border-neutral-100 bg-white`
- Shadow: `shadow-[0_8px_30px_rgba(0,0,0,0.04)]` (subtle, NOT teal-tinted)
- Hover: `hover:border-[#009588]/30 hover:shadow-lg`
- Active indicator: small teal dot

**Inputs:**
- `bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4`
- Focus: `focus:border-[#009588] focus:ring-1 focus:ring-[#009588]/20 focus:bg-white`

**Typography:** Inter, sans-serif
- Display H1: `text-5xl md:text-6xl font-bold tracking-tighter`
- Heading H2: `text-3xl md:text-4xl font-bold tracking-tight`
- Body: `text-lg text-neutral-500 leading-relaxed`
- Labels: `text-[10px] font-mono uppercase tracking-widest text-neutral-400`

**Icons:** Lucide React, `stroke-[1.5]` thin lines, default `text-neutral-900`, medical accent `text-[#009588]`

**Touch targets:** `h-12` (48px) minimum for all CTAs and form inputs
**Spacing:** generous whitespace between plan cards

**Atmosphere:** Subtle ambient teal/orange glow spots (`blur-[80px]`, very low opacity) for depth without coldness

### Technical Stack (Exact Versions)

Same stack as Story 4-1. Additional dependencies already installed:
- `@tanstack/react-form` v1.x — form state (let TS infer, no generic)
- `zsa` + `zsa-react-query` — server actions wrapper with `useServerActionMutation`
- `sonner` — toast notifications for errors

### File Structure

```
apps/web/src/app/[locale]/pricing/
  ├── page.tsx                          ← REFACTOR (SSG, multi-plan, Header/Footer)
  ├── _actions/
  │   └── checkout-actions.ts           ← KEEP AS-IS (correct Zsa pattern)
  ├── _components/
  │   ├── PricingPlans.tsx              ← NEW (Server Component — plan cards grid)
  │   └── PreCheckoutForm.tsx           ← ENHANCE (use useCheckout hook)
  ├── _hooks/
  │   └── useCheckout.ts               ← NEW (wrapping useServerActionMutation)
  ├── success/
  │   └── page.tsx                      ← REFACTOR (SSG, homepage link, Header/Footer)
  └── __tests__/
      ├── pricing-page.spec.tsx         ← NEW (page + PricingPlans tests)
      ├── pre-checkout-form.spec.tsx    ← NEW (form + hook tests)
      ├── success-page.spec.tsx         ← NEW (success page tests)
      └── checkout-actions.spec.ts      ← NEW (server action tests)

apps/web/src/lib/hooks/
  └── server-action-hooks.ts            ← MODIFY (add checkout key to QueryKeyFactory)

apps/web/src/i18n/langs/
  ├── en.json                           ← MODIFY (add pricing.meta.*, pricing.page.*)
  └── fr.json                           ← MODIFY (add pricing.meta.*, pricing.page.*)

.env.example                            ← MODIFY (3 price env vars, remove old one)
```

### Previous Story Intelligence (Story 4-1)

**Key learnings:**
- All landing components are Server Components — follow same pattern for PricingPlans
- Only client-interactive elements need `"use client"` — PreCheckoutForm is the sole client component
- `setRequestLocale(locale)` must be called in EVERY page (pricing/page.tsx AND pricing/success/page.tsx)
- `params` is a Promise → `const { locale } = await params`
- Test pattern: mock `getTranslations` from `next-intl/server` in vitest.setup.ts (already configured)
- Async Server Component test pattern: `const el = await Component()` then `render(el)`
- Clinique Zen design: `rounded-3xl` cards, soft teal shadows, Inter font, generous whitespace
- Build verification: SSG pages show circle icon (not `f` for dynamic) in `pnpm build` output

**Files from Story 4-1 to NOT modify:**
- `apps/web/src/app/[locale]/page.tsx` — landing page
- `apps/web/src/app/[locale]/_components/PricingPreviewSection.tsx` — landing pricing preview
- `apps/web/src/app/sitemap.ts` — already includes `/pricing` entries
- `apps/web/src/app/robots.ts` — already configured

### Git Intelligence

**Commit convention:** `feat(story-4-2): description`
**Branch:** `feature/story-4-2-pricing-page-with-pre-checkout-form`

### CRITICAL RULES FROM CLAUDE.md

1. **NEVER commit directly to main or develop** — use feature branch
2. **ALWAYS run tests before creating PR** — `pnpm test`
3. **All pnpm commands from project root** — NEVER `cd apps/web`
4. **Data flow is NON-NEGOTIABLE**: Component → Hook → Zsa → Server Action → tRPC → NestJS
5. **`@tanstack/react-form` for form state** — NOT Zustand or local useState
6. **Server Actions are the ONLY bridge** between Next.js and NestJS
7. **No `register()` endpoint** — registration = Stripe Checkout ONLY
8. **No `@stripe/stripe-js`** — Checkout is hosted, just redirect to URL

### References

- [Source: docs/planning-artifacts/epics.md#Story-4.2] — Story requirements and AC
- [Source: docs/planning-artifacts/architecture.md] — SSG patterns, Stripe integration, data flow
- [Source: docs/planning-artifacts/prd.md#FR12] — Public landing page requirement
- [Source: docs/planning-artifacts/prd.md#FR13] — Stripe Checkout IS registration
- [Source: docs/planning-artifacts/prd.md#NFR21] — Lighthouse >= 90
- [Source: docs/planning-artifacts/prd.md#NFR22] — No auth, no non-essential cookies
- [Source: docs/planning-artifacts/ux-design-specification.md] — Clinique Zen aesthetic
- [Source: packages/validators/src/stripe/checkout.schema.ts] — createCheckoutSessionSchema
- [Source: apps/api/src/trpc/routers/stripe.router.ts] — createCheckoutSession tRPC procedure
- [Source: apps/api/src/modules/stripe/stripe.service.ts] — StripeService.createCheckoutSession
- [Source: apps/web/src/app/[locale]/_components/PricingPreviewSection.tsx] — Design reference
- [Source: apps/web/src/app/[locale]/pricing/_actions/checkout-actions.ts] — Existing Zsa server action
- [Source: apps/web/src/app/[locale]/pricing/_components/PreCheckoutForm.tsx] — Existing form component
- [Source: apps/web/src/app/[locale]/pricing/success/page.tsx] — Existing success page
- [Source: apps/web/src/lib/hooks/server-action-hooks.ts] — zsa-react-query hook setup
- [Source: apps/web/src/i18n/langs/en.json] — Existing pricing translations
- [Source: docs/implementation-artifacts/4-1-public-landing-page-ssg-seo-acquisition.md] — Previous story learnings

### Dev Agent Record

#### Agent Model Used

Claude Opus 4.6

#### Debug Log References

- Initial run: all 513 tests pass (237 web + 161 API + 115 validators)
- One test fix: replaced `@testing-library/user-event` (not installed) with `fireEvent` from `@testing-library/react`

#### Completion Notes List

- **Task 1**: Refactored `pricing/page.tsx` from client component (useTranslations) to async Server Component (getTranslations). Added `setRequestLocale`, async `params`, `generateMetadata` with SEO (title, description, OG, Twitter). Wrapped with LandingHeader/LandingFooter. Migrated env vars from single `NEXT_PUBLIC_STRIPE_PRICE_ID` to 3 plan-specific vars. Verified sitemap already includes `/pricing` entries.
- **Task 2**: Created `PricingCheckout.tsx` as Client Component. Reads `?plan=` query param from URL (defaults to "professional"). Displays plan summary card (name, price, features) + PreCheckoutForm below. "Change plan" link back to landing `/#pricing`. User selects plan on landing → arrives on pricing with form only. `PricingPreviewSection` CTAs updated to `/pricing?plan=xxx`.
- **Task 3**: Created `useCheckout` hook wrapping `useServerActionMutation` with `["checkout"]` key factory. Refactored `PreCheckoutForm` to use `useCheckout` instead of calling `createCheckoutSessionAction` directly. Updated CTA button to Clinique Zen primary style (`bg-neutral-900` instead of teal). Updated focus ring colors to Vet Teal (`#009588`).
- **Task 4**: Refactored `success/page.tsx` from `useTranslations` to `getTranslations`. Added `setRequestLocale`, async `params`, `generateMetadata` (with `noindex`). Added homepage link via `Link` from `@/i18n/navigation`. Wrapped with LandingHeader/LandingFooter. Added `pricing.success.backToHome` i18n key.
- **Task 5**: Added `pricing.meta.title`, `pricing.meta.description`, `pricing.page.heading`, `pricing.page.subtitle` to both `en.json` and `fr.json`. Added `pricing.success.backToHome` key. Added `checkout` key to `QueryKeyFactory` in `server-action-hooks.ts`. Updated `.env.example` with 3 Stripe price env vars.
- **Task 6**: Created 4 test files with 28 new tests total: pricing-page.spec.tsx (7 tests), success-page.spec.tsx (8 tests), pre-checkout-form.spec.tsx (8 tests), use-checkout.spec.ts (5 tests). Covers generateMetadata, setRequestLocale, rendering, form fields, validation, submission, accessibility, touch targets.

#### Change Log

- 2026-02-09: Story 4-2 implemented. Refactored pricing page and success page to SSG Server Components. Created PricingCheckout component (plan summary + form). Landing CTAs pass plan via query param. Added useCheckout hook for data flow compliance. Created 28 new tests. Total: 513 tests passing (237 web + 161 API + 115 validators).
- 2026-02-10: Refactored flow per user feedback: removed multi-plan grid from pricing page. Landing PricingPreviewSection CTAs now link to `/pricing?plan=xxx`. Pricing page shows selected plan summary + form only. Replaced PricingPlans.tsx with PricingCheckout.tsx.
- 2026-02-10: Adversarial code review completed. 12 issues found (5 HIGH, 4 MEDIUM, 3 LOW). All HIGH and MEDIUM fixed: H1 (hardcoded English error → i18n), H2 (broken validation test assertions), H3 (zero PricingCheckout tests → 9 new tests), H4 (redundant isSubmitting state → use isPending from hook), H5 (open redirect → Stripe URL domain validation). PreCheckoutForm simplified. Total: 248 web tests passing.

## File List

**New files:**
- `apps/web/src/app/[locale]/pricing/_components/PricingCheckout.tsx`
- `apps/web/src/app/[locale]/pricing/_hooks/useCheckout.ts`
- `apps/web/src/app/[locale]/pricing/__tests__/pricing-page.spec.tsx`
- `apps/web/src/app/[locale]/pricing/__tests__/success-page.spec.tsx`
- `apps/web/src/app/[locale]/pricing/__tests__/pre-checkout-form.spec.tsx`
- `apps/web/src/app/[locale]/pricing/__tests__/use-checkout.spec.ts`
- `apps/web/src/app/[locale]/pricing/__tests__/pricing-checkout.spec.tsx` — Added during code review (H3 fix)

**Modified files:**
- `apps/web/src/app/[locale]/pricing/page.tsx` — SSG refactor, multi-plan, Header/Footer
- `apps/web/src/app/[locale]/pricing/_components/PreCheckoutForm.tsx` — useCheckout hook, Clinique Zen CTA style, removed redundant isSubmitting state (review fix H4)
- `apps/web/src/app/[locale]/pricing/_actions/checkout-actions.ts` — Added Stripe URL domain validation (review fix H5)
- `apps/web/src/app/[locale]/pricing/success/page.tsx` — SSG refactor, homepage link, Header/Footer
- `apps/web/src/app/[locale]/_components/PricingPreviewSection.tsx` — CTAs link to /pricing?plan=xxx
- `apps/web/src/app/[locale]/_components/__tests__/landing-page.spec.tsx` — Updated for PricingPreviewSection changes
- `apps/web/src/lib/hooks/server-action-hooks.ts` — Added checkout key to QueryKeyFactory
- `apps/web/src/i18n/langs/en.json` — Added pricing.meta.*, pricing.page.*, pricing.success.backToHome, pricing.page.missingPriceIdError (review fix H1)
- `apps/web/src/i18n/langs/fr.json` — Added pricing.meta.*, pricing.page.*, pricing.success.backToHome, pricing.page.missingPriceIdError (review fix H1)
- `.env.example` — Migrated to 3 Stripe price env vars
- `docs/implementation-artifacts/sprint-status.yaml` — Status updated
- `docs/implementation-artifacts/4-2-pricing-page-with-pre-checkout-form.md` — Story file updated
