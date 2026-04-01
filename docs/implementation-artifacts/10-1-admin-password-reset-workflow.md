# Story 10.1: Admin Password Reset Workflow

Status: done

## Story

As an admin user,
I want to reset my password when I forget it,
so that I can regain access to my clinic management dashboard without contacting support.

## Acceptance Criteria

1. **Given** the admin login form **When** I see the password field **Then** a "Forgot password?" link is displayed below it, navigating to `/auth/forgot-password`.

2. **Given** the forgot password page **When** I enter my email and submit **Then** I see a confirmation message "If an account exists with this email, a reset link has been sent" regardless of whether the email exists (prevents user enumeration).

3. **Given** a valid admin email submitted **When** the backend processes the request **Then** a `PasswordResetToken` is created (SHA256 hashed, 1h TTL), and a reset email is sent via Resend with a link to `/auth/reset-password?token={rawToken}`.

4. **Given** a non-existent email submitted **When** the backend processes the request **Then** no token is created, no email is sent, but the same confirmation message is shown (timing-attack-safe with 300ms minimum response).

5. **Given** I receive the reset email **When** I click the reset link **Then** I land on `/auth/reset-password` with a form to enter a new password (same validation rules as activation: 8+ chars, uppercase, lowercase, digit).

6. **Given** a valid token and new password **When** I submit the reset form **Then** my password is updated (bcrypt 12 rounds), the token is marked as used, and I see a success message with a link to login.

7. **Given** an expired or already-used token **When** I try to reset **Then** I see an error message "This link has expired or has already been used" and a link to request a new one.

8. **Given** the password reset email **Then** it follows the existing email template pattern (React Email, EmailLayout, i18n FR/EN, Pawly branding).

9. **Given** a user requesting multiple resets **When** they submit a new request **Then** previous unused tokens for that user are invalidated (only the latest token is valid).

10. **Given** the reset is successful **When** I navigate to login **Then** I can log in with my new password immediately.

## Tasks / Subtasks

- [x] Task 1: Database — PasswordResetToken model (AC: #3, #7, #9)
  - [x] 1.1 Create `apps/api/prisma/schema/PasswordResetToken.prisma` (pattern: ActivationToken — id, token SHA256, expiresAt, used, userId, clinicId, indexes)
  - [x] 1.2 Add `passwordResetTokens PasswordResetToken[]` relation to User.prisma
  - [x] 1.3 Run `pnpm db:generate` + `pnpm db:push`

- [x] Task 2: Validators (AC: #1, #5, #6)
  - [x] 2.1 Create `packages/validators/src/auth/password-reset.schema.ts`
    - `requestPasswordResetSchema` — email (string, email format)
    - `resetPasswordSchema` — token (64 hex chars) + password (8+ chars, uppercase, lowercase, digit — reuse activation password rules)
  - [x] 2.2 Export from `packages/validators/src/auth/index.ts`
  - [x] 2.3 Write validator tests (~15 tests)

- [x] Task 3: Backend — Auth service methods (AC: #2, #3, #4, #6, #7, #9)
  - [x] 3.1 `requestPasswordReset(email: string)` in auth.service.ts:
    - Check user exists AND role === ADMIN (employees use OTP, no password)
    - Invalidate previous unused tokens for this user (deleteMany where used=false)
    - Generate raw token (crypto.randomBytes(32).toString('hex'))
    - Store SHA256 hash in PasswordResetToken (1h TTL)
    - Send email via mailService.sendPasswordResetEmail
    - 300ms minimum response time on ALL paths (timing attack prevention)
    - Return void (never leak user existence)
  - [x] 3.2 `resetPassword(token: string, password: string)` in auth.service.ts:
    - Hash token with SHA256, find PasswordResetToken (not used, not expired)
    - Atomic update: mark token as used + update user password (bcrypt 12 rounds) in $transaction
    - Cleanup expired tokens for this user
    - Return success boolean
  - [x] 3.3 Write service tests (~20 tests: happy path, expired, used, wrong email, timing, invalidation)

- [x] Task 4: Backend — tRPC endpoints (AC: #2, #6)
  - [x] 4.1 Add `requestPasswordReset` public procedure to auth.router.ts (input: requestPasswordResetSchema)
  - [x] 4.2 Add `resetPassword` public procedure to auth.router.ts (input: resetPasswordSchema)
  - [x] 4.3 Write router tests (~10 tests)

- [x] Task 5: Email — Password reset template (AC: #8)
  - [x] 5.1 Add i18n strings to `apps/api/src/modules/mail/mail-i18n.ts` (FR/EN: subject, heading, body, button, disclaimer)
  - [x] 5.2 Create `apps/api/src/modules/mail/templates/PasswordResetEmail.tsx` (pattern: ActivationEmail — EmailLayout, button with reset URL, 1h expiry notice)
  - [x] 5.3 Add `sendPasswordResetEmail(email, url, locale)` to mail.service.tsx
  - [x] 5.4 Support Trigger.dev async delegation (if TRIGGER_SECRET_KEY set)

- [x] Task 6: Frontend — Server actions & forgot password page (AC: #1, #2)
  - [x] 6.1 Add `requestPasswordResetAction` to auth-actions.ts
  - [x] 6.2 Create `apps/web/src/app/[locale]/(auth)/forgot-password/page.tsx` (SSR wrapper)
  - [x] 6.3 Create `_components/ForgotPasswordClient.tsx` (email form, success state, link back to login)
  - [x] 6.4 Add "Forgot password?" link to LoginPageClient.tsx (visible on admin tab only, below password field)

- [x] Task 7: Frontend — Reset password page (AC: #5, #6, #7, #10)
  - [x] 7.1 Add `resetPasswordAction` to auth-actions.ts
  - [x] 7.2 Create `apps/web/src/app/[locale]/(auth)/reset-password/page.tsx` (SSR wrapper, reads token from searchParams)
  - [x] 7.3 Create `_components/ResetPasswordClient.tsx` (password + confirm fields, validation, success/error states, link to login)

- [x] Task 8: i18n translations (AC: #2, #5, #7)
  - [x] 8.1 Add FR translations to `apps/web/src/i18n/langs/fr.json` (auth.forgotPassword.*, auth.resetPassword.*)
  - [x] 8.2 Add EN translations to `apps/web/src/i18n/langs/en.json`

- [x] Task 9: Frontend tests (~15 tests)
  - [x] 9.1 ForgotPasswordClient tests (form submit, success state, validation)
  - [x] 9.2 ResetPasswordClient tests (password validation, success/error states, expired token)
  - [x] 9.3 LoginPageClient test (forgot password link visible on admin tab)

## Technical Notes

### Existing Patterns to Reuse
- **Token hashing**: `crypto.createHash('sha256').update(rawToken).digest('hex')` (same as MagicLink/ActivationToken)
- **Timing attack prevention**: `delayToMinimumResponse(startTime, 300)` from auth.service.ts
- **Optimistic locking**: `updateMany({ where: { token, used: false } })` with count check
- **Email template**: Follow ActivationEmail.tsx structure (EmailLayout + button + expiry notice)
- **Server actions**: zsa `createServerAction().input(schema).handler()` pattern

### Security Considerations
- Token stored as SHA256 hash (raw token only in email URL)
- 1-hour TTL (shorter than activation's 24h — password reset is more sensitive)
- Previous tokens invalidated on new request (only latest valid)
- Minimum 300ms response on all paths (prevents timing-based user enumeration)
- Admin-only (employees have no password — they use OTP)
- Rate limiting: consider adding per-email throttle (future enhancement)

### URL Construction (locale-aware)
- FR (default): `{WEB_APP_URL}/auth/reset-password?token={rawToken}`
- EN: `{WEB_APP_URL}/en/auth/reset-password?token={rawToken}`
- Use `localePrefix: 'as-needed'` convention (no `/fr/` prefix for default locale)

### Dependencies
- No new npm packages required
- Resend email service (already configured)
- React Email components (already installed)
- bcrypt for password hashing (already used in auth.service.ts)
