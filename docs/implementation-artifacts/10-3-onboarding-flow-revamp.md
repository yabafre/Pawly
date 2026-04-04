# Story 10.3: Onboarding Flow Revamp — Account-First Registration

Status: ready-for-dev

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

10. **Given** an email that is already registered **When** I submit the registration form **Then** I see a generic message "Si cette adresse est disponible, votre compte sera créé" with a 300ms minimum response time on all paths (prevents user enumeration via timing attack).

11. **Given** the old `/pricing/success` page **When** someone visits it directly **Then** redirect to `/pricing` (backward compat — page is no longer part of the flow).

12. **Given** the Stripe webhook `checkout.session.completed` **When** it fires for a user who already has an account (upgrade flow) **Then** it updates the existing Subscription record instead of trying to create a new Clinic + User.

## Tasks / Subtasks

- [ ] Task 1: Backend — Registration endpoint (AC: #2, #3, #4, #10)
  - [ ] 1.1 Create `registerAdminSchema` in `packages/validators/src/auth/register-admin.schema.ts`
    - clinicName (string, 2-100 chars, trimmed)
    - adminName (string, 2-100 chars, trimmed)
    - email (string, email format, trimmed, lowercase)
    - password (8+ chars, uppercase, lowercase, digit — reuse existing password rules)
    - turnstileToken (string)
  - [ ] 1.2 Add `registerAdmin` method in `auth.service.ts`
    - Verify Turnstile token via Cloudflare API
    - Check email uniqueness (timing-safe: same delay whether exists or not)
    - $transaction: create Clinic (slug auto-generated), User (ADMIN, bcrypt password), Subscription (planKey: 'starter_free', entitlementTier: 'starter', status: ACTIVE, no stripeCustomerId/stripeSubscriptionId)
    - Issue JWT tokens (access + refresh)
    - Send welcome email (non-blocking, fire-and-forget)
    - Return tokens + user profile
  - [ ] 1.3 Add `register` public procedure in `auth.router.ts`
    - Input: registerAdminSchema
    - Rate limit: 5 per hour per IP
    - Returns: { accessToken, refreshToken, user }
  - [ ] 1.4 Write validator tests (~15 tests)
  - [ ] 1.5 Write service tests (~12 tests: success, duplicate email, invalid turnstile, transaction rollback)
  - [ ] 1.6 Write router tests (~8 tests)

- [ ] Task 2: Backend — Webhook adaptation for upgrade flow (AC: #12)
  - [ ] 2.1 Modify `handleCheckoutSessionCompleted` in `stripe-webhook.controller.ts`
    - Check if user with `adminEmail` already exists
    - If exists: update existing Subscription record (add stripeCustomerId, stripeSubscriptionId, upgrade entitlementTier)
    - If not exists: keep current creation logic (backward compat for any edge case)
  - [ ] 2.2 Write webhook tests for upgrade scenario (~5 tests)

- [ ] Task 3: Frontend — Registration page (AC: #1, #2, #4)
  - [ ] 3.1 Create `/pricing/register/page.tsx` (SSR, reads `?plan` query param)
  - [ ] 3.2 Create `RegisterForm.tsx` component
    - @tanstack/react-form with fields: clinicName, adminName, email, password
    - PasswordStrength component (reuse from reset-password)
    - Turnstile widget
    - Async email validation (debounced)
    - Submit → call `register` tRPC procedure
    - On success: set auth cookies + redirect to `/admin/onboarding`
  - [ ] 3.3 Create server action `registerAction` + hook `useRegister`
  - [ ] 3.4 Warm Linen design: split layout like login (form left, pattern right), rounded-2xl card, bg-background
  - [ ] 3.5 i18n FR/EN (~25 keys: form labels, errors, success messages)
  - [ ] 3.6 Write component tests (~10 tests)

- [ ] Task 4: Frontend — Onboarding wizard refactor (AC: #5, #6)
  - [ ] 4.1 Remove Step 1 (StepClinicName) — clinic name now provided at registration
  - [ ] 4.2 Update TOTAL_STEPS from 4 to 3
  - [ ] 4.3 Update StepIndicator labels
  - [ ] 4.4 Remove clinicName from OnboardingFormValues (send empty string or current name to backend)
  - [ ] 4.5 Warm Linen alignment: ensure wizard uses CSS variable tokens (bg-background, bg-card, border-border)
  - [ ] 4.6 Update i18n keys (step labels, step descriptions)
  - [ ] 4.7 Add loading.tsx + error.tsx for the onboarding route
  - [ ] 4.8 Update existing tests

- [ ] Task 5: Frontend — Upgrade modal (AC: #7, #8, #9)
  - [ ] 5.1 Create `UpgradeModal.tsx` in `/admin/_components/`
    - Dialog with plan benefits (features list from pricing page data)
    - CTA: "Passer au Professionnel" → Stripe Checkout (reuse existing createCheckoutSession but with existing clinic)
    - Dismiss: "Plus tard" → sessionStorage flag `upgrade_modal_dismissed`
    - Show condition: entitlementTier === 'starter' AND selectedPlan was 'professional' (pass via searchParam or sessionStorage from registration)
  - [ ] 5.2 Integrate modal in admin dashboard layout (show on mount, check sessionStorage)
  - [ ] 5.3 Modify `createCheckoutSession` to accept optional `clinicId` for existing clinics
    - If clinicId provided: skip metadata for clinic creation, attach stripeCustomerId if exists
  - [ ] 5.4 i18n FR/EN (~15 keys: modal title, benefits, CTA, dismiss)
  - [ ] 5.5 Write component tests (~6 tests)

- [ ] Task 6: Frontend — Pricing page updates (AC: #1, #11)
  - [ ] 6.1 Update CTA buttons on pricing cards: redirect to `/pricing/register?plan=starter` or `?plan=professional`
  - [ ] 6.2 Remove PreCheckoutForm component (no longer needed)
  - [ ] 6.3 Update `/pricing/success/page.tsx` to redirect to `/pricing`
  - [ ] 6.4 Update landing hero CTA to link to `/pricing/register?plan=starter`
  - [ ] 6.5 Clean up unused checkout-actions.ts and useCheckout hook (if only used by PreCheckoutForm)
  - [ ] 6.6 Update i18n keys

- [ ] Task 7: Backend — Stripe checkout adaptation for existing users (AC: #8)
  - [ ] 7.1 Modify `createCheckoutSession` in `stripe.service.ts`
    - Accept optional clinicId parameter
    - If clinicId provided: look up or create Stripe customer, pass clinicId in metadata
    - Checkout success_url points to `/admin/billing` (not `/pricing/success`)
  - [ ] 7.2 Write service tests (~5 tests)

- [ ] Task 8: Cleanup & backward compatibility
  - [ ] 8.1 Keep `createActivationToken` flow working (for employee invitations — separate from admin registration)
  - [ ] 8.2 Remove unused PreCheckoutForm, useCheckout hook, checkout-actions if fully replaced
  - [ ] 8.3 Update proxy.ts / middleware if any auth redirect logic needs adjustment
  - [ ] 8.4 Verify onboarding guard in admin layout still works (redirects to /admin/onboarding if not completed)

## Dev Notes

### Critical Architecture Constraints

- **Data Flow (NON-NEGOTIABLE):** RegisterForm → useRegister hook → Zsa useServerActionMutation → registerAction (server action) → tRPC auth.register → AuthService.registerAdmin → Prisma. NO shortcuts.
- **Admin role only:** Registration creates ADMIN users. Employee accounts are created separately via invitation flow (uses `createActivationToken` — this must NOT be touched).
- **Timing-safe responses:** `delayToMinimumResponse(startTime, 300)` on all paths (email exists or not) — same pattern as `requestPasswordReset` in auth.service.ts.
- **$transaction callback form:** Use callback form, NOT array form (Story 7.3 C1 learning).
- **Subscription without Stripe IDs:** Created with `status: ACTIVE`, `planKey: 'starter_free'`, `entitlementTier: 'starter'`, nullable stripeCustomerId/stripeSubscriptionId. No Prisma migration needed — fields already nullable.

### Target Flow

```
/pricing → /pricing/register?plan=starter|professional
    → Form (clinic name, name, email, password, Turnstile CAPTCHA)
    → Backend: $transaction → Clinic + User (ADMIN, bcrypt) + Subscription (starter)
    → Auto-login (JWT access + refresh tokens)
    → /admin/onboarding (3 steps: work days, hours, shift types)
    → /admin/dashboard
    → If Pro selected: upgrade modal → Stripe Checkout → webhook upgrades tier
```

### Existing Infrastructure to REUSE (Do NOT Reinvent)

| Component | Location | What to Reuse |
|-----------|----------|---------------|
| PasswordStrength | `apps/web/src/components/ui/password-strength.tsx` | Password strength indicator with progress bar |
| Turnstile widget | `apps/web/src/components/ui/turnstile.tsx` (if exists, or Cloudflare React) | CAPTCHA verification component |
| Turnstile verification | `apps/api/src/modules/auth/auth.service.ts` | `verifyTurnstileToken()` method |
| generateSlug | `apps/api/src/common/utils/slug.ts` | Clinic slug generation |
| delayToMinimumResponse | `apps/api/src/modules/auth/auth.service.ts` | Timing attack prevention |
| bcrypt password hashing | `apps/api/src/modules/auth/auth.service.ts` | `hashPassword()` — bcrypt 12 rounds |
| JWT token issuance | `apps/api/src/modules/auth/auth.service.ts` | `generateTokens()` — access + refresh |
| RefreshToken model | `apps/api/prisma/schema/RefreshToken.prisma` | DB-backed refresh tokens with rotation |
| createCheckoutSession | `apps/api/src/modules/stripe/stripe.service.ts` | Stripe checkout — MODIFY to accept clinicId |
| completeOnboarding | `apps/api/src/modules/clinic/clinic.service.ts` | Onboarding completion — MODIFY to skip clinicName |
| OnboardingWizard | `apps/web/.../admin/onboarding/_components/OnboardingWizard.tsx` | Wizard — MODIFY to remove Step 1 |
| StepWorkDays/Hours/ShiftTypes | `apps/web/.../admin/onboarding/_components/steps/` | Existing steps — keep as-is |
| PreCheckoutForm | `apps/web/.../pricing/_components/PreCheckoutForm.tsx` | DELETE — replaced by RegisterForm |
| FallingAnimals | `apps/web/src/components/ui/falling-animals.tsx` | Background pattern for split layout |
| Dialog | `apps/web/src/components/ui/dialog.tsx` | Upgrade modal component |
| LoginPageClient | `apps/web/.../[locale]/(auth)/login/_components/LoginPageClient.tsx` | Reference for split layout pattern |

### Registration Logic

```
registerAdmin(clinicName, adminName, email, password, turnstileToken):
  1. Verify Turnstile token via Cloudflare API (verifyTurnstileToken)
  2. Start timing: startTime = Date.now()
  3. Check email uniqueness: findUnique({ where: { email } })
  4. If exists → delayToMinimumResponse(startTime, 300) → throw generic error
  5. $transaction (callback form):
     - Create Clinic { name: clinicName, slug: generateSlug(clinicName), onboardingCompleted: false }
     - Create User { email, name: adminName, role: ADMIN, password: bcrypt(password, 12), clinicId }
     - Create Subscription { clinicId, status: ACTIVE, planKey: 'starter_free', entitlementTier: 'starter' }
  6. Generate JWT tokens (access + refresh) via generateTokens()
  7. Create RefreshToken in DB (same pattern as login)
  8. Fire-and-forget: send welcome email via mailService
  9. delayToMinimumResponse(startTime, 300)
  10. Return { accessToken, refreshToken, user: { id, email, name, role, clinicId } }
```

### Webhook Upgrade Logic

```
handleCheckoutSessionCompleted(session):
  1. Extract adminEmail from session.metadata
  2. Check: existingUser = findUnique({ where: { email: adminEmail } })
  3. If existingUser:
     - Find existing Subscription by clinicId
     - Update Subscription: { stripeCustomerId, stripeSubscriptionId, entitlementTier: derived, planKey, currentPeriodEnd }
     - Do NOT create Clinic or User (already exist)
  4. Else (legacy path):
     - Current logic: create Clinic + User + Subscription + send activation email
```

### UI Design — Registration Page (Warm Linen)

```
┌──────────────────────────────────────────────────────────────┐
│  Pawly Logo                                                  │
├──────────────────────────┬───────────────────────────────────┤
│                          │                                   │
│  Créer votre clinique    │                                   │
│                          │    FallingAnimals                 │
│  ┌────────────────────┐  │    (mask-image gradient)          │
│  │ Nom de la clinique │  │                                   │
│  └────────────────────┘  │                                   │
│  ┌────────────────────┐  │                                   │
│  │ Votre nom          │  │                                   │
│  └────────────────────┘  │                                   │
│  ┌────────────────────┐  │                                   │
│  │ Email              │  │                                   │
│  └────────────────────┘  │                                   │
│  ┌────────────────────┐  │                                   │
│  │ Mot de passe       │  │                                   │
│  └────────────────────┘  │                                   │
│  ████░░░░ Moyen          │                                   │
│                          │                                   │
│  [Turnstile CAPTCHA]     │                                   │
│                          │                                   │
│  [  Créer mon compte  ]  │                                   │
│                          │                                   │
│  Déjà un compte ?        │                                   │
│  Se connecter            │                                   │
│                          │                                   │
├──────────────────────────┴───────────────────────────────────┤
```

**Design tokens (Warm Linen):**
- Background: `bg-background` (#FAF9F7)
- Card: `bg-card` (#FCFCFC), `rounded-2xl`, `border-border`
- Split layout: `flex-1` form left, `w-1/2 hidden lg:block` pattern right (login page pattern)
- CTA button: `Button` default (teal primary)
- FallingAnimals with `[mask-image:linear-gradient(to_right,transparent,black_30%)]`

### UI Design — Upgrade Modal

```
┌─────────────────────────────────────────────┐
│           ✨ Passez au Professionnel        │
│                                             │
│  Débloquez toutes les fonctionnalités :     │
│                                             │
│  ✓ Employés illimités                       │
│  ✓ Règles de planning avancées             │
│  ✓ Export CSV                               │
│  ✓ Support prioritaire                      │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │    Passer au Professionnel — 29€/m  │    │
│  └─────────────────────────────────────┘    │
│                                             │
│            Plus tard                        │
└─────────────────────────────────────────────┘
```

### Code Review Learnings (Prevent Regressions)

| Pattern | Rule | Source |
|---------|------|--------|
| $transaction form | Use callback form, NOT array form | Story 7.3 C1 |
| Timing-safe auth | `delayToMinimumResponse(300)` on ALL paths (exists or not) | Story 10.1 |
| Anti-enumeration | Generic messages, never reveal if email exists | Story 10.1 AC#2 |
| Token hashing | SHA-256 for refresh tokens, bcrypt for passwords | Security audit |
| Zod .refine() | Creates ZodEffects — cannot .merge() after. Base schema first | Story 5.2 |
| SameSite=lax | All auth cookies must use `lax` (not `strict` — breaks Stripe redirect) | Session 2026-04-01 |
| Turnstile | Verify server-side via Cloudflare API, never trust client-only | Cloudflare integration |

### Module Registration Checklist

No new NestJS module — `registerAdmin` is added to existing `AuthService` + `auth.router.ts`. Files to modify:

1. `apps/api/src/modules/auth/auth.service.ts` — add `registerAdmin()` method
2. `apps/api/src/trpc/routers/auth.router.ts` — add `register` public procedure
3. `apps/api/src/modules/stripe/stripe.service.ts` — modify `createCheckoutSession()` to accept clinicId
4. `apps/api/src/modules/stripe/stripe-webhook.controller.ts` — modify `handleCheckoutSessionCompleted()` for upgrade path

### File Structure

```
packages/validators/src/auth/
  register-admin.schema.ts              # NEW — registerAdminSchema
  register-admin.schema.test.ts         # NEW — ~15 tests

apps/api/src/modules/auth/
  auth.service.ts                       # MODIFIED — add registerAdmin()
  auth.service.spec.ts                  # MODIFIED — add ~12 tests

apps/api/src/modules/stripe/
  stripe.service.ts                     # MODIFIED — createCheckoutSession accepts clinicId
  stripe.service.spec.ts                # MODIFIED — add ~5 tests
  stripe-webhook.controller.ts          # MODIFIED — upgrade path for existing users
  stripe-webhook.controller.spec.ts     # MODIFIED — add ~5 tests

apps/api/src/trpc/routers/
  auth.router.ts                        # MODIFIED — add register procedure
  auth.router.spec.ts                   # MODIFIED — add ~8 tests

apps/web/src/app/[locale]/pricing/
  register/page.tsx                     # NEW — SSR registration page
  register/_components/RegisterForm.tsx # NEW — registration form component
  register/_actions/register-actions.ts # NEW — server action
  register/_hooks/useRegister.ts        # NEW — mutation hook
  register/__tests__/register-form.spec.tsx # NEW — ~10 tests
  success/page.tsx                      # MODIFIED — redirect to /pricing

apps/web/src/app/[locale]/pricing/_components/
  PreCheckoutForm.tsx                   # DELETE — replaced by RegisterForm
  PricingCheckout.tsx                   # MODIFIED — CTA links to /pricing/register

apps/web/src/app/[locale]/pricing/_actions/
  checkout-actions.ts                   # DELETE (if only used by PreCheckoutForm)

apps/web/src/app/[locale]/pricing/_hooks/
  useCheckout.ts                        # DELETE (if only used by PreCheckoutForm)

apps/web/src/app/[locale]/admin/
  _components/UpgradeModal.tsx          # NEW — upgrade modal component
  _components/__tests__/upgrade-modal.spec.tsx # NEW — ~6 tests

apps/web/src/app/[locale]/admin/onboarding/
  loading.tsx                           # NEW — loading skeleton
  error.tsx                             # NEW — error boundary
  _components/OnboardingWizard.tsx      # MODIFIED — 3 steps instead of 4
  _components/StepIndicator.tsx         # MODIFIED — update labels
  _components/steps/StepClinicName.tsx  # DELETE — clinic name at registration

apps/web/src/app/[locale]/admin/dashboard/
  _components/DashboardPageClient.tsx   # MODIFIED — integrate UpgradeModal

apps/web/src/i18n/langs/
  fr.json                              # MODIFIED — add ~40 keys (register + upgrade modal)
  en.json                              # MODIFIED — add ~40 keys
```

### Testing Requirements

| Layer | Count | Framework | Pattern |
|-------|-------|-----------|---------|
| Validators | ~15 | Vitest `*.test.ts` | Valid/invalid inputs, email format, password rules, clinicName length |
| Auth Service | ~12 | Jest `*.spec.ts` | Success, duplicate email, invalid turnstile, $transaction rollback, timing-safe delay |
| Auth Router | ~8 | Jest `*.spec.ts` | Public access, rate limit, input validation, token response |
| Stripe Service | ~5 | Jest `*.spec.ts` | createCheckoutSession with clinicId, customer lookup/create |
| Webhook | ~5 | Jest `*.spec.ts` | Upgrade existing user, new user fallback, missing subscription |
| RegisterForm | ~10 | Vitest `*.spec.tsx` | Form validation, submit, password strength, Turnstile, redirect |
| UpgradeModal | ~6 | Vitest `*.spec.tsx` | Show/dismiss, sessionStorage, CTA click |
| OnboardingWizard | ~5 | Vitest `*.spec.tsx` | 3 steps, no clinic name step, completion |
| **Total** | **~66** | | |

### What NOT to Change

- Employee invitation flow (uses `createActivationToken` — separate path, untouched)
- Employee OTP/magic link login
- Stripe webhook for `customer.subscription.updated` / `customer.subscription.deleted`
- Existing billing page (`/admin/billing`)
- Onboarding guard in admin layout (still redirects to `/admin/onboarding` if not completed)

### References

- [Source: docs/planning-artifacts/epics.md#Epic-10 — Story 10.3 definition]
- [Source: docs/planning-artifacts/prd.md — FR1, FR2, FR16 (Subscription & Registration)]
- [Source: docs/implementation-artifacts/3-2-*.md — Original Stripe checkout + clinic creation flow]
- [Source: docs/implementation-artifacts/3-3-*.md — Original onboarding wizard (4 steps)]
- [Source: docs/implementation-artifacts/10-1-*.md — Password reset pattern (timing-safe, SHA256 tokens)]
- [Source: apps/api/src/modules/auth/auth.service.ts — Token issuance, bcrypt, Turnstile verification]
- [Source: apps/api/src/modules/stripe/stripe-webhook.controller.ts — handleCheckoutSessionCompleted]
- [Source: apps/web/src/app/[locale]/(auth)/login/_components/LoginPageClient.tsx — Split layout reference]
- [Source: apps/web/src/app/[locale]/admin/onboarding/_components/OnboardingWizard.tsx — Current wizard]
