# Story 10.3: Onboarding Flow Revamp — Account-First Registration

Status: done

## Story

As a veterinary clinic admin,
I want to register my account before being asked for payment,
so that I can explore the platform as a Starter user immediately and upgrade to Professional only when I'm ready.

## Acceptance Criteria

1. **Given** the pricing page **When** I click "Commencer gratuitement" on a plan **Then** I am redirected to `/pricing/register?plan=starter` (or `plan=professional`).

2. **Given** the registration page **When** I fill in clinic name, my name, email, password **Then** the form validates: email uniqueness (async), password strength (8+ chars, upper, lower, digit), clinic name (2-100 chars), Turnstile CAPTCHA token.

3. **Given** a valid registration form **When** I submit **Then** a Clinic, User (ADMIN, with hashed password), and Subscription (starter tier, no Stripe IDs) are created atomically in a $transaction.

4. **Given** successful registration **When** the account is created **Then** I am auto-logged in (JWT access + refresh tokens set as cookies) and redirected to `/admin/onboarding`.

5. **Given** the onboarding wizard **When** I land on it **Then** I see 3 steps: Work Days, Work Hours, Shift Types (NO clinic name step — it was already provided at registration).

6. **Given** the onboarding wizard **When** I complete all 3 steps and click "Terminer" **Then** `completeOnboarding` is called and I am redirected to `/admin/dashboard`.

7. **Given** I selected the Professional plan during registration **When** I land on the dashboard for the first time **Then** I see a dismissible modal: "Passez au plan Professionnel" with plan benefits, a CTA to Stripe Checkout, and a "Plus tard" dismiss button.

8. **Given** the upgrade modal **When** I click the upgrade CTA **Then** I am redirected to Stripe Checkout (existing `createCheckoutSession` endpoint, but now with the clinic already existing). On success, the webhook upgrades the subscription tier.

9. **Given** the upgrade modal **When** I click "Plus tard" **Then** the modal is dismissed and does not reappear for the current session. The user can upgrade later from `/admin/billing`.

10. **Given** an email that is already registered **When** I submit the registration form **Then** I see a generic message with a 300ms minimum response time on all paths (prevents user enumeration via timing attack).

11. **Given** the old `/pricing/success` page **When** someone visits it directly **Then** redirect to `/pricing` (backward compat — page is no longer part of the flow).

12. **Given** the Stripe webhook `checkout.session.completed` **When** it fires for a user who already has an account (upgrade flow) **Then** it updates the existing Subscription record instead of trying to create a new Clinic + User.

## Tasks / Subtasks

- [x] Task 1: Backend — Registration endpoint (AC: #2, #3, #4, #10)
  - [x] 1.1 Create `registerAdminSchema` in `packages/validators/src/auth/register-admin.schema.ts`
    - clinicName (string, 2-100 chars, trimmed), adminName (2-100, trimmed), email (email, trimmed, lowercase), password (8+ chars, upper, lower, digit), turnstileToken (string)
  - [x] 1.2 Add `registerAdmin` method in `auth.service.ts`
    - Turnstile verified in web server action (not in API)
    - Check email uniqueness (timing-safe 300ms)
    - $transaction: Clinic (slug auto-generated) + User (ADMIN, bcrypt, locale) + Subscription (starter_free, no Stripe IDs)
    - Issue JWT tokens (access + refresh)
    - Send welcome email via `sendWelcomeEmail` (fire-and-forget, reuses ActivationEmail template with login URL)
    - Locale from client saved on User record
  - [x] 1.3 Add `register` public procedure in `auth.router.ts` (input: registerAdminSchema.omit(turnstileToken) + locale)
  - [x] 1.4 Write validator tests (19 tests)
  - [x] 1.5 Write service tests (7 tests: success, duplicate email, bcrypt, starter tier, welcome email, clinic onboarding false, ADMIN role)

- [x] Task 2: Backend — Webhook adaptation for upgrade flow (AC: #12)
  - [x] 2.1 Modify `handleCheckoutSessionCompleted` in `stripe-webhook.controller.ts`
    - Check if user with `adminEmail` already exists
    - If exists: update existing Subscription (add Stripe IDs, upgrade tier)
    - If not exists: keep legacy creation path (backward compat)
    - Guard against empty `subscription.items.data` (log error + return early)
  - [x] 2.2 Add `user.findUnique` mock to webhook tests for legacy path compatibility

- [x] Task 3: Backend — Prisma schema + Stripe router (AC: #3, #12)
  - [x] 3.1 `Subscription.stripeCustomerId` made nullable (was required — Starter accounts have no Stripe IDs)
  - [x] 3.2 `stripe.router.ts` handles null stripeCustomerId/stripeSubscriptionId (returns starter-tier response with no invoices)
  - [x] 3.3 `stripe.router.ts` createBillingPortalSession guards against null stripeCustomerId
  - [x] 3.4 `Clinic.onboardingDraft` Json? field added for draft persistence

- [x] Task 4: Frontend — Registration page (AC: #1, #2, #4)
  - [x] 4.1 Create `/pricing/register/page.tsx` (SSR, reads `?plan` query param)
  - [x] 4.2 Create `RegisterPageClient.tsx` component
    - Compact card layout (logo + back in CardHeader, name+email on grid-cols-2)
    - PasswordStrength component reused from reset-password
    - Eye/EyeOff password visibility toggle
    - TurnstileBox widget (skipped in dev via NODE_ENV check)
    - Locale passed to register endpoint for User.locale persistence
  - [x] 4.3 Create server action `registerAction` + hook `useRegister`
  - [x] 4.4 Warm Linen design: split layout (form left, FallingAnimals right), rounded-2xl card, bg-background
  - [x] 4.5 i18n FR/EN (~15 keys each for register namespace)

- [x] Task 5: Frontend — Onboarding wizard refactor (AC: #5, #6)
  - [x] 5.1 Remove StepClinicName import (Step 1 removed — clinic name at registration)
  - [x] 5.2 Update TOTAL_STEPS 4→3, stepLabels, stepDescriptions, validation cases
  - [x] 5.3 Landscape layout: vertical StepIndicator left, Card content right (`grid-cols-[220px_1fr]`)
  - [x] 5.4 StepIndicator rewritten as vertical stepper with Warm Linen tokens (`bg-primary`, `border-border`)
  - [x] 5.5 All step components (StepWorkDays, StepWorkHours, StepShiftTypes) migrated to Warm Linen tokens + shadcn Field/FieldLabel/FieldError components
  - [x] 5.6 Add loading.tsx + error.tsx for the onboarding route
  - [x] 5.7 Onboarding draft persistence to DB (`Clinic.onboardingDraft` Json field, debounced 1s save via `saveOnboardingDraftAction`, restore on mount)
  - [x] 5.8 Completion uses `window.location.href` (not `router.push`) to force full reload (avoids onboarding guard loop)
  - [x] 5.9 Admin nav + header actions (bell, logout) hidden during onboarding, LanguageSwitcher kept visible

- [x] Task 6: Frontend — Upgrade modal (AC: #7, #8, #9)
  - [x] 6.1 Create `UpgradeModal.tsx` in `/admin/_components/`
    - Dialog with plan benefits, CTA → `/admin/billing`, dismiss → sessionStorage
    - Show when tier=starter AND sessionStorage `pawly_selected_plan` = professional
  - [x] 6.2 Integrate in DashboardPageClient (useSubscription hook moved before early return to fix hooks order)
  - [x] 6.3 i18n FR/EN (~10 keys each for upgradeModal namespace)

- [x] Task 7: Frontend — Pricing page updates (AC: #1, #11)
  - [x] 7.1 CTA buttons → `/pricing/register?plan=starter` or `?plan=professional` (HeroSection, PricingPreviewSection, CTASection)
  - [x] 7.2 `/pricing/success/page.tsx` → redirect to `/pricing`

- [x] Task 8: Backend — Welcome email (post-review fix)
  - [x] 8.1 Add `sendWelcomeEmail` method in `mail.service.tsx` (reuses ActivationEmail template with login URL instead of activation URL)
  - [x] 8.2 Called in `registerAdmin` fire-and-forget with correct locale
  - [x] 8.3 Turnstile verification skipped in development (`NODE_ENV === 'development'`)

- [x] Task 9: Shadcn component updates
  - [x] 9.1 Installed `@shadcn/field` + `@shadcn/input-group` (Field, FieldLabel, FieldError, FieldGroup for TanStack Form)
  - [x] 9.2 Fixed pagination.tsx (ButtonProps removed from new shadcn button, size type inlined)
  - [x] 9.3 All `import { z } from 'zod'` → `import { z } from '@pawly/zod'` in API routers

## Dev Notes

### Critical Architecture Constraints

- **Data Flow (NON-NEGOTIABLE):** RegisterForm → useRegister hook → Zsa useServerActionMutation → registerAction (server action) → tRPC auth.register → AuthService.registerAdmin → Prisma. NO shortcuts.
- **Admin role only:** Registration creates ADMIN users. Employee accounts are created separately via invitation flow (uses `createActivationToken` — untouched).
- **Timing-safe responses:** `delayToMinimumResponse(startTime, 300)` on all paths (email exists or not).
- **$transaction callback form:** Story 7.3 C1 learning.
- **Turnstile verified in web server action**, not in API (same pattern as login). Skipped in dev via `NODE_ENV` check.
- **Locale persistence:** Client locale passed to `registerAdmin` → saved on `User.locale` → used for welcome email language.
- **Zod v4:** `z.record()` requires 2 args (`z.record(z.string(), z.unknown())`). Cannot `.extend()` schemas with `.transform()` (creates ZodEffects).
- **React 19:** `useRef()` requires initial argument. Hooks must be called before any early return.

### Code Review Findings (Fixed)

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | CRITICAL | `sendActivationEmail` with empty URL → broken email | Replaced with `sendWelcomeEmail` (login URL) |
| 2 | HIGH | Webhook upgrade path writes `planKey: 'default'` on empty items | Added guard: log error + return early |
| 3 | HIGH | `useSubscription()` called after early return → hooks order error | Moved before early return |
| 4 | HIGH | `router.push` after onboarding completion → guard loop | Changed to `window.location.href` for full reload |
| 5 | HIGH | Double padding (layout + wizard wrapper) | Removed wizard `min-h-screen py-12 px-6` wrapper |
| 6 | HIGH | Onboarding nav/header visible during setup | Hide nav + bell/logout, keep LanguageSwitcher |

### File Structure (Actual)

```
packages/validators/src/auth/
  register-admin.schema.ts              # NEW — 19 tests
  register-admin.schema.test.ts         # NEW

apps/api/prisma/schema/
  Clinic.prisma                         # MODIFIED — added onboardingDraft Json?
  Subscription.prisma                   # MODIFIED — stripeCustomerId nullable

apps/api/src/modules/auth/
  auth.service.ts                       # MODIFIED — registerAdmin(), locale, sendWelcomeEmail
  auth.service.spec.ts                  # MODIFIED — 7 new tests

apps/api/src/modules/mail/
  mail.service.tsx                      # MODIFIED — sendWelcomeEmail(), sendPlanConfirmationEmail(), all methods use Trigger
  mail-i18n.ts                          # MODIFIED — welcome + planConfirmation subjects + sections (FR/EN)
  templates/WelcomeEmail.tsx            # NEW — generic welcome (no plan)
  templates/PlanConfirmationEmail.tsx   # NEW — plan card + invoice link for Pro

apps/api/src/modules/clinic/
  clinic.service.ts                     # MODIFIED — saveOnboardingDraft(), onboardingDraft in getOnboardingStatus

apps/api/src/modules/stripe/
  stripe-webhook.controller.ts          # MODIFIED — upgrade path + empty items guard
  stripe-webhook.controller.spec.ts     # MODIFIED — user.findUnique mock

apps/api/src/trpc/
  context.ts                            # MODIFIED — added mailService to TRPCServices
  trpc.module.ts                        # MODIFIED — MailModule import, mailService injection
  routers/auth.router.ts                # MODIFIED — register procedure + locale
  routers/clinic.router.ts              # MODIFIED — saveOnboardingDraft procedure
  routers/stripe.router.ts              # MODIFIED — setupStarterSubscription, syncAfterCheckout, createUpgradeSession successPath

apps/api/src/trigger/tasks/
  send-email.ts                         # MODIFIED — 11 email types (was 6), WelcomeEmail + PlanConfirmationEmail

apps/web/src/app/[locale]/pricing/
  register/page.tsx                     # NEW
  register/_components/RegisterPageClient.tsx # NEW
  register/_actions/register-actions.ts # NEW
  register/_hooks/useRegister.ts        # NEW
  success/page.tsx                      # MODIFIED — redirect to /pricing

apps/web/src/app/[locale]/_components/
  HeroSection.tsx                       # MODIFIED — CTA → /pricing/register
  PricingPreviewSection.tsx             # MODIFIED — CTA → /pricing/register
  CTASection.tsx                        # MODIFIED — CTA → /pricing/register

apps/web/src/app/[locale]/admin/
  _components/UpgradeModal.tsx          # NEW
  _components/AdminLayoutClient.tsx     # MODIFIED — hide nav during onboarding, keep LanguageSwitcher

apps/web/src/app/[locale]/admin/billing/
  _actions/billing-actions.ts           # MODIFIED — setupStarterSubscription, syncAfterCheckout, createUpgradeSession actions
  _hooks/useUpgradeCheckout.ts          # NEW — upgrade to Pro from billing page
  _components/BillingOverview.tsx        # MODIFIED — StarterUpgradeView component

apps/web/src/app/[locale]/admin/onboarding/
  loading.tsx                           # NEW
  error.tsx                             # NEW
  _components/OnboardingWizard.tsx      # MODIFIED — 3 steps, landscape, DB draft persistence
  _components/StepIndicator.tsx         # MODIFIED — vertical stepper, Warm Linen tokens
  _components/steps/StepWorkDays.tsx    # MODIFIED — Warm Linen tokens, shadcn Field
  _components/steps/StepWorkHours.tsx   # MODIFIED — Warm Linen tokens, shadcn Field
  _components/steps/StepShiftTypes.tsx  # MODIFIED — Warm Linen tokens, shadcn Field

apps/web/src/app/[locale]/admin/dashboard/
  _components/DashboardPageClient.tsx   # MODIFIED — UpgradeModal + hooks order fix

apps/web/src/components/ui/
  field.tsx                             # NEW (shadcn @shadcn/field)
  input-group.tsx                       # NEW (shadcn @shadcn/input-group)
  separator.tsx                         # NEW (shadcn dependency)
  pagination.tsx                        # MODIFIED — size type fix for new button
  button.tsx                            # UPDATED (shadcn override)
  input.tsx                             # UPDATED (shadcn override)
  label.tsx                             # UPDATED (shadcn override)
  textarea.tsx                          # UPDATED (shadcn override)

apps/web/next.config.ts                   # MODIFIED — CSP: challenges.cloudflare.com in script-src + frame-src

apps/web/src/components/ui/
  falling-animals.tsx                   # MODIFIED — null-check on stamp canvases

apps/web/src/lib/
  turnstile-verify.ts                   # MODIFIED — skip in development

apps/web/src/i18n/langs/
  fr.json                              # MODIFIED — register + upgradeModal keys
  en.json                              # MODIFIED — register + upgradeModal keys
```

### Testing

| Layer | Count | Framework |
|-------|-------|-----------|
| Validators | 19 | Vitest `*.test.ts` |
| Auth Service | 7 | Jest `*.spec.ts` |
| Webhook | 37 (all pass, 0 new regression) | Jest `*.spec.ts` |
| **Total new** | **26** | |

### What NOT Changed

- Employee invitation flow (uses `createActivationToken` — separate path)
- Employee OTP/magic link login
- Stripe webhook for `customer.subscription.updated` / `customer.subscription.deleted`
- Existing billing page (`/admin/billing`)
- PreCheckoutForm / useCheckout (not deleted — still referenced by pricing page, cleanup deferred)

## Change Log

- **Task 1**: `registerAdminInputSchema` + `registerAdminFormSchema` (with passwordConfirm). Email trim+lowercase via `transform().pipe()`. 19 validator tests.
- **Task 2**: `registerAdmin()` in auth.service — $transaction callback, bcrypt 12, JWT auto-login, locale persistence, welcome email fire-and-forget. 7 service tests.
- **Task 3**: `handleCheckoutSessionCompleted` upgrade path — existing user → update Subscription. Empty items guard. `user.findUnique` mock added to webhook spec.
- **Task 4**: `Subscription.stripeCustomerId` nullable. `stripe.router.ts` graceful Starter response. `Clinic.onboardingDraft` Json? for draft persistence.
- **Task 5**: `/pricing/register` page — compact card, grid name+email, Eye/EyeOff toggle, PasswordStrength, Turnstile, locale. `registerAction` + `useRegister`.
- **Task 6**: OnboardingWizard 4→3 steps. Landscape layout (vertical stepper left, card right). All steps migrated to shadcn Field + Warm Linen tokens. Draft persistence to DB (debounced 1s). `window.location.href` on complete.
- **Task 7**: `UpgradeModal` — dialog with benefits, sessionStorage trigger, CTA → billing.
- **Task 8**: CTAs → `/pricing/register?plan=X`. `/pricing/success` → redirect.
- **Task 9**: `sendWelcomeEmail` — reuses ActivationEmail template with login URL. Turnstile dev skip.
- **Review fixes**: Broken welcome email, hooks order, double padding, nav during onboarding, onboarding guard loop, `@pawly/zod` imports.
- **Task 10 (2026-04-05)**: Registration flow branching — Starter goes directly to onboarding, Pro goes to Stripe Checkout first. `useRegister` branches on `selectedPlan`. `?plan=` URL param passed to onboarding to control Stripe setup after completion.
- **Task 11 (2026-04-05)**: `setupStarterSubscription` tRPC procedure — creates Stripe customer + free subscription server-side for Starter users after onboarding. Guarded by entitlementTier + existing Stripe IDs check.
- **Task 12 (2026-04-05)**: `syncAfterCheckout` tRPC procedure — fallback for webhook latency. Lists recent Stripe checkout sessions by email, syncs Pro subscription data to DB. Works whether webhook has fired or not.
- **Task 13 (2026-04-05)**: `createUpgradeSession` — accepts optional `successPath` param. Registration flow passes `/admin/onboarding?plan=professional`, billing upgrade uses default `/admin/billing?upgraded=true`.
- **Task 14 (2026-04-05)**: `WelcomeEmail` template — replaces ActivationEmail for welcome flow. Generic welcome message, teal CTA to dashboard, no plan info (sent at registration before plan is finalized).
- **Task 15 (2026-04-05)**: `PlanConfirmationEmail` template — sent after Stripe setup. Shows plan card (Starter/Pro), invoice link button for Pro, dashboard CTA. FR/EN translations.
- **Task 16 (2026-04-05)**: All 11 email types now routed through Trigger.dev — added `welcome`, `plan-confirmation`, `magic-link`, `otp`, `password-reset` to trigger task. Added `if (this.useTrigger)` guards to `sendMagicLink`, `sendActivationEmail`, `sendOtpCode`, `sendPasswordResetEmail`.
- **Task 17 (2026-04-05)**: `MailService` injected into tRPC context — added to `TRPCServices`, `TRPCMiddleware`, `TRPCService`, `TRPCModule` imports. Enables plan-confirmation emails from Stripe router procedures.
- **Task 18 (2026-04-05)**: CSP fix — added `challenges.cloudflare.com` to `script-src` and `frame-src` for Turnstile. `turnstileToken` validation relaxed to `z.string()` (empty allowed in dev).
- **Task 19 (2026-04-05)**: `FallingAnimals` canvas fix — null-check on stamp canvases before `drawImage` (prevents TypeError when `getContext("2d")` returns null).
- **Task 20 (2026-04-05)**: `StarterUpgradeView` component + `useUpgradeCheckout` hook — billing page shows Starter plan with upgrade CTA to Pro via Stripe Checkout.
- **Bugs fixed (2026-04-05)**: Race condition (setupStarter overwrites webhook Pro data → plan-aware branching), webhook not firing in dev (syncAfterCheckout fallback), plan-confirmation email not sent when webhook already synced (send in early-return path), CSP blocking Turnstile, FallingAnimals canvas crash.
