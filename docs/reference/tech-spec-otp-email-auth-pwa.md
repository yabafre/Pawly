---
title: 'OTP Email Authentication for PWA Employees'
slug: 'otp-email-auth-pwa'
created: '2026-02-28'
status: 'done'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['NestJS', 'Prisma 7.2', 'Next.js 16', 'Resend', 'react-email', 'zsa', 'tRPC', '@tanstack/react-form', 'zsa-react-query', 'sonner', 'next-intl']
files_to_modify:
  - 'apps/api/prisma/schema/OtpCode.prisma'
  - 'apps/api/prisma/schema/User.prisma'
  - 'apps/api/prisma/schema/Clinic.prisma'
  - 'apps/api/src/modules/auth/auth.service.ts'
  - 'apps/api/src/modules/auth/auth.controller.ts'
  - 'apps/api/src/modules/auth/dto/request-otp.dto.ts'
  - 'apps/api/src/modules/auth/dto/verify-otp.dto.ts'
  - 'apps/api/src/trpc/routers/auth.router.ts'
  - 'apps/api/src/modules/mail/mail.service.tsx'
  - 'apps/api/src/modules/mail/templates/OtpCodeEmail.tsx'
  - 'packages/validators/src/auth/otp.schema.ts'
  - 'packages/validators/src/auth/index.ts'
  - 'apps/web/src/app/[locale]/(auth)/login/_components/LoginPageClient.tsx'
  - 'apps/web/src/app/[locale]/(auth)/login/_components/MagicLinkForm.tsx'
  - 'apps/web/src/app/[locale]/(auth)/login/_components/OtpInput.tsx'
  - 'apps/web/src/app/[locale]/(auth)/login/_actions/auth-actions.ts'
  - 'apps/web/src/app/[locale]/(auth)/login/_hooks/useAuth.ts'
  - 'apps/web/src/i18n/langs/fr.json'
  - 'apps/web/src/i18n/langs/en.json'
  - 'apps/api/src/modules/auth/auth.service.spec.ts'
  - 'apps/api/src/modules/auth/auth.controller.spec.ts'
  - 'apps/web/src/app/[locale]/(auth)/login/_actions/auth-actions.spec.ts'
  - 'apps/web/src/app/[locale]/(auth)/login/_hooks/useAuth.spec.ts'
  - 'apps/web/src/app/[locale]/(auth)/login/_components/OtpInput.spec.tsx'
  - 'packages/validators/src/auth/otp.schema.test.ts'
code_patterns:
  - 'HMAC-SHA256 OTP hashing via crypto.createHmac("sha256", secret) (SHA256 plain for MagicLink)'
  - 'Optimistic locking: tx.model.updateMany({ where: { used: false }, data: { used: true } })'
  - '300ms minimum response time for user enumeration prevention (both requestOtp AND verifyOtp)'
  - 'createServerAction().input(schema).output(schema).handler(async ({input}) => { ... })'
  - 'useServerActionMutation(action, { returnError: true, onSettled: invalidate })'
  - '@Throttle({ default: { limit: N, ttl: Ms } }) on controller endpoints'
  - 'react-email template: React component rendered by mail.service'
  - 'Cookie: httpOnly, secure (prod), sameSite strict, maxAge 24h, path /'
test_patterns:
  - 'API: Jest with *.spec.ts, mock PrismaService/JwtService/MailService/ConfigService'
  - 'Web: Vitest with *.spec.ts, vi.mock() + vi.hoisted() for captured handlers'
  - 'Validators: Vitest with *.test.ts'
---

# Tech-Spec: OTP Email Authentication for PWA Employees

**Created:** 2026-02-28

## Overview

### Problem Statement

On iOS, Magic Links opened from email apps open in Safari, NOT in the installed PWA standalone. Apple does not support Universal Links for PWAs (reserved for native App Store apps). This creates cookie context isolation — the JWT cookie set by Safari is not accessible by the PWA standalone. Employees on iPhone cannot reliably authenticate within the installed PWA, breaking the entire Employee journey (Epic 8).

### Solution

Replace Magic Link as the default employee authentication method with a 6-digit OTP code sent by email. The employee enters the code directly within the PWA — no redirect, no context switch. The Magic Link becomes an automatic fallback: if OTP verification fails too many times for a given user, the system switches to Magic Link for that user for 48 hours.

### Scope

**In Scope:**
- New `OtpCode` Prisma model (separate from MagicLink)
- Backend endpoints: `requestOtp`, `verifyOtp` in auth.service.ts
- OTP email template (6-digit code, 5-minute TTL)
- UI: OTP input screen with 6 separate digit fields, auto-focus, paste support
- Rate limiting: DB-level attempt tracking (max 5 per code) + controller-level @Throttle
- Automatic fallback to Magic Link for 48h on excessive failures
- Login UI: rename "Magic Link" tab to "Email", keep "Mot de passe" tab for admins

**Out of Scope:**
- SMS OTP, Push notifications, Biometric auth
- Admin auth changes (remains password-based)
- Changes to JWT payload or cookie handling (reuses existing generateToken + setAuthCookie)

## Context for Development

### Codebase Patterns

**Authentication Architecture:**
- `AuthService` injectable with PrismaService, JwtService, MailService, ConfigService
- `hashToken(token)`: SHA256 one-way hash — raw token sent to user, hash stored in DB (for high-entropy tokens like MagicLink)
- `hashOtp(code)`: NEW — HMAC-SHA256 with server secret for low-entropy OTP codes (6-digit = only 900K values, plain SHA256 is reversible)
- `private generateToken(user)`: Returns `{ access_token, refresh_token, user }` with JWT payload `{ email, sub, role, clinicId }` (private method, called internally by verifyOtp/validateMagicLink)
- `delayToMinimumResponse(startTime, minMs?)`: Enforces minimum response time to prevent user enumeration. Refactored to accept optional `minMs` parameter (default 300ms)
- Optimistic locking: `tx.model.updateMany({ where: { used: false }, data: { used: true } })` — prevents race conditions
- Background cleanup: `cleanupExpiredMagicLinks()` deletes expired/used tokens

**Frontend Flow:**
- `LoginPageClient` uses tabbed interface (currently: "Magic Link" / "Mot de passe")
- `MagicLinkForm` uses `@tanstack/react-form` with Zod validation
- `useAuth` hook wraps `useServerActionMutation` — returns mutations + state
- Server actions: `createServerAction().input().output().handler()` pattern
- Cookie: `auth-token`, httpOnly, secure (prod), sameSite `strict` for login, maxAge 24h
- Role-based redirect: ADMIN → `/admin/planning`, EMPLOYEE → `/dashboard`

**Email:** Resend v3 + react-email, 550ms throttle, French copy with `EmailLayout` wrapper

**Rate Limiting:** `@Throttle` on controller, magic-link = 3 req/60s, others = 5 req/60s. Note: tRPC routes bypass `@Throttle` — use DB-level controls as defense in depth.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/api/src/modules/auth/auth.service.ts` | Core auth — requestMagicLink, validateMagicLink, generateToken, hashToken |
| `apps/api/src/modules/auth/auth.controller.ts` | @Throttle decorators, endpoint definitions |
| `apps/api/src/trpc/routers/auth.router.ts` | tRPC: publicProcedure.input().mutation() |
| `apps/api/src/modules/auth/auth.module.ts` | Module registration |
| `apps/api/prisma/schema/MagicLink.prisma` | Token model pattern |
| `apps/api/prisma/schema/User.prisma` | User model — add otpFallbackUntil field |
| `apps/api/src/modules/mail/mail.service.tsx` | sendMagicLink, Resend throttle |
| `apps/api/src/modules/mail/templates/MagicLinkEmail.tsx` | Email template pattern |
| `packages/validators/src/auth/magic-link.schema.ts` | Zod validator pattern |
| `apps/web/src/app/[locale]/(auth)/login/_components/LoginPageClient.tsx` | Tabbed login |
| `apps/web/src/app/[locale]/(auth)/login/_components/MagicLinkForm.tsx` | Email form |
| `apps/web/src/app/[locale]/(auth)/login/_actions/auth-actions.ts` | Server actions + setAuthCookie |
| `apps/web/src/app/[locale]/(auth)/login/_hooks/useAuth.ts` | Auth mutations hook |

### Technical Decisions

- **Separate OtpCode model** — Different fields (6-digit code, attempts counter) vs MagicLink (64-char hex). Cleaner separation. Uses `findFirst` by `userId` (not `findUnique` by code hash) because OTP hashes are not unique globally (only 900K possible values) — lookup is scoped by user.
- **DB-level attempt tracking** — `attempts` integer on OtpCode, max 5. Defense in depth beyond HTTP throttle. Increment protected by optimistic locking (`updateMany` with condition guard).
- **OTP as default, Magic Link as fallback** — Backend decides: checks `User.otpFallbackUntil > now()` → if yes, sends Magic Link; if no, sends OTP.
- **48h fallback window** — `otpFallbackUntil: DateTime?` on User model. Set when max attempts exceeded on ANY code. Auto-expires. Note: attempts are per-code (new code = reset to 0), but fallback is per-user (once triggered, affects all future requests for 48h).
- **Login UI tabs preserved** — Rename "Magic Link" → "Email". Keep "Mot de passe" for admins. After email submit, show OTP input or "check email" message based on backend response.
- **Same JWT/cookie flow** — verifyOtp calls generateToken(user). sameSite `strict` (user stays in-app).
- **OTP code** — 6 digits via `crypto.randomInt(100000, 1000000)` (inclusive range 100000-999999). Stored as HMAC-SHA256 hash with server secret (plain SHA256 is insufficient for 6-digit codes — only 900K values, trivially reversible).
- **Existing callback preserved** — `/auth/callback` route and `validateMagicLink` flow remain untouched. Magic Link emails (from fallback) continue to work through the existing callback page.
- **HMAC secret** — Uses `OTP_HMAC_SECRET` from env (or derives from existing JWT secret). Required because 6-digit OTP has only ~20 bits of entropy vs MagicLink's 256 bits.

## Implementation Plan

### Tasks

#### Layer 1: Data Model (No dependencies)

- [x] **Task 1: Create OtpCode Prisma model**
  - File: `apps/api/prisma/schema/OtpCode.prisma` (NEW)
  - Action: Create model following MagicLink pattern with OTP-specific fields
  - Schema:
    ```prisma
    model OtpCode {
      id        String   @id @default(uuid())
      code      String                        // HMAC-SHA256 hash of 6-digit code (with server secret)
      expiresAt DateTime @map("expires_at")   // 5 minutes TTL
      used      Boolean  @default(false)
      attempts  Int      @default(0)          // Failed verification attempts (max 5)

      userId    String   @map("user_id")
      user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

      clinicId  String   @map("clinic_id")
      clinic    Clinic   @relation(fields: [clinicId], references: [id], onDelete: Cascade)

      createdAt DateTime @default(now()) @map("created_at")

      @@index([clinicId])
      @@index([userId])
      @@index([expiresAt])
    }
    ```
  - Notes: Add `otpCodes OtpCode[]` relation to User model.

- [x] **Task 1b: Add OtpCode back-relation to Clinic model**
  - File: `apps/api/prisma/schema/Clinic.prisma` (MODIFY)
  - Action: Add `otpCodes OtpCode[]` relation field to the Clinic model
  - Notes: Required for FK constraint. Without this, Prisma schema validation fails.

- [x] **Task 2: Add otpFallbackUntil to User model**
  - File: `apps/api/prisma/schema/User.prisma` (MODIFY)
  - Action: Add `otpFallbackUntil DateTime? @map("otp_fallback_until")` field
  - Notes: Nullable. When set and > now(), backend sends Magic Link instead of OTP. Auto-expires.

- [x] **Task 3: Run `pnpm db:generate` and `pnpm db:push`**
  - Action: Generate Prisma client and push schema to Neon DB
  - Notes: Run from project root. Verify OtpCode table created and User.otpFallbackUntil column added.

#### Layer 2: Validators (Depends on Layer 1 for types)

- [x] **Task 4: Create OTP Zod schemas**
  - File: `packages/validators/src/auth/otp.schema.ts` (NEW)
  - Action: Create schemas following magic-link.schema.ts pattern
  - Schemas:
    ```typescript
    import { z } from "@pawly/zod";

    export const requestOtpSchema = z.object({
      email: z.string().email("Email invalide"),
    });

    export const verifyOtpSchema = z.object({
      email: z.string().email("Email invalide"),
      code: z.string().regex(/^\d{6}$/, "Le code doit contenir exactement 6 chiffres"),
    });

    // Response when OTP is sent (vs fallback to Magic Link)
    export const otpRequestResponseSchema = z.object({
      method: z.enum(["otp", "magic_link"]),
      message: z.string(),
    });
    ```
  - Notes: `verifyOtpSchema` includes email (to identify user) + code. `otpRequestResponseSchema` tells frontend which method was used.

- [x] **Task 5: Export OTP schemas**
  - File: `packages/validators/src/auth/index.ts` (MODIFY)
  - Action: Add exports: `export { requestOtpSchema, verifyOtpSchema, otpRequestResponseSchema } from "./otp.schema";`

#### Layer 3: Backend Email (Parallel with Layer 4)

- [x] **Task 6: Create OTP email template**
  - File: `apps/api/src/modules/mail/templates/OtpCodeEmail.tsx` (NEW)
  - Action: Create react-email template following MagicLinkEmail.tsx pattern
  - Props: `{ code: string }` (the 6-digit code as string)
  - Content (French):
    - Tag: "SÉCURITÉ" (via EmailLayout)
    - Title: "Votre code de connexion"
    - Body: "Entrez ce code dans l'application pour vous connecter :"
    - Code display: Large, spaced digits (e.g. "4 2 8 7 1 5") with monospace font
    - Footer: "Ce code est valide pendant 5 minutes. Si vous n'avez pas demandé ce code, ignorez cet email."
  - Notes: Use EmailLayout wrapper. No button/link needed (user types the code).

- [x] **Task 7: Add sendOtpCode to MailService**
  - File: `apps/api/src/modules/mail/mail.service.tsx` (MODIFY)
  - Action: Add method `async sendOtpCode(email: string, code: string)` following sendMagicLink pattern
  - Notes: Renders OtpCodeEmail template. Subject: "Votre code Pawly". Same Resend throttle applies.

#### Layer 4: Backend Auth Service (Core logic)

- [x] **Task 8: Add OTP constants, HMAC helper, and refactor delayToMinimumResponse**
  - File: `apps/api/src/modules/auth/auth.service.ts` (MODIFY)
  - Action: Add constants at top of file:
    ```typescript
    const OTP_TTL_MINUTES = 5;
    const OTP_MAX_ATTEMPTS = 5;
    const OTP_FALLBACK_HOURS = 48;
    const OTP_CLEANUP_HOURS = 24;
    const MIN_RESPONSE_MS = 300;
    ```
  - Action: Add `hashOtp(code: string)` method:
    ```typescript
    private hashOtp(code: string): string {
      const secret = this.configService.get<string>('OTP_HMAC_SECRET') || this.configService.get<string>('JWT_SECRET');
      return crypto.createHmac('sha256', secret).update(code).digest('hex');
    }
    ```
  - Action: Refactor `delayToMinimumResponse(startTime)` to accept optional parameter:
    ```typescript
    private async delayToMinimumResponse(startTime: number, minMs = MIN_RESPONSE_MS) {
      const elapsed = Date.now() - startTime;
      if (elapsed < minMs) await new Promise(r => setTimeout(r, minMs - elapsed));
    }
    ```
  - Notes: Rename `MAGIC_LINK_MIN_RESPONSE_MS` → `MIN_RESPONSE_MS` (shared constant). Existing `requestMagicLink` calls updated to use refactored signature. `hashOtp` uses HMAC-SHA256 with server secret because plain SHA256 on 6-digit codes (900K values) is trivially reversible via precomputation. Falls back to JWT_SECRET if `OTP_HMAC_SECRET` not configured.

- [x] **Task 9: Add requestOtp method**
  - File: `apps/api/src/modules/auth/auth.service.ts` (MODIFY)
  - Action: Add `async requestOtp(email: string)` method
  - Logic:
    1. `const startTime = Date.now()`
    2. Find user by email (`findUnique({ where: { email } })`)
    3. If no user → `await this.delayToMinimumResponse(startTime)`, return `{ method: "otp", message: "If account exists, code sent" }`
    4. Check `user.otpFallbackUntil`: if set and > now() → `await this.requestMagicLink(email)` (must await to ensure email is sent), then `await this.delayToMinimumResponse(startTime)`, return `{ method: "magic_link", message: "If account exists, link sent" }`
    5. Invalidate any existing unused OTP for this user: `updateMany({ where: { userId, used: false }, data: { used: true } })`
    6. Generate 6-digit code: `crypto.randomInt(100000, 1000000).toString()` (range 100000-999999 inclusive)
    7. Hash code: `this.hashOtp(code)` (HMAC-SHA256 with server secret, NOT plain SHA256)
    8. Create OtpCode record: `{ code: hashedCode, expiresAt: now + 5min, userId: user.id, clinicId: user.clinicId }`
    9. Send email: `this.mailService.sendOtpCode(email, code)` (raw code in email). If email send fails, the OTP record exists but user never receives it — "Resend code" button in UI handles this gracefully.
    10. `await this.delayToMinimumResponse(startTime)`
    11. Return `{ method: "otp", message: "If account exists, code sent" }`
  - Notes: Same user enumeration prevention as requestMagicLink (identical response + consistent timing). Step 4 must `await requestMagicLink` before returning to ensure the Magic Link email is actually sent. The return type `{ method, message }` wraps `requestMagicLink`'s own return — the caller only sees the unified response.

- [x] **Task 10: Add verifyOtp method**
  - File: `apps/api/src/modules/auth/auth.service.ts` (MODIFY)
  - Action: Add `async verifyOtp(email: string, code: string)` method
  - Logic:
    1. `const startTime = Date.now()`
    2. Hash the submitted code: `this.hashOtp(code)` (HMAC-SHA256, NOT plain SHA256)
    3. `$transaction` block:
       a. Find user by email (include otpFallbackUntil)
       b. Find latest unused, non-expired OtpCode for this user: `findFirst({ where: { userId, used: false, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" } })`
       c. If no user or no OTP → `await this.delayToMinimumResponse(startTime)`, throw `UnauthorizedException("Invalid or expired code")`
       d. If `otpCode.attempts >= OTP_MAX_ATTEMPTS` → set `user.otpFallbackUntil = now + 48h`, mark OTP as used, `await this.delayToMinimumResponse(startTime)`, throw `UnauthorizedException("Too many attempts. Check email for login link.")`
       e. If `hashedCode !== otpCode.code` → optimistic lock increment: `updateMany({ where: { id: otpCode.id, attempts: otpCode.attempts }, data: { attempts: { increment: 1 } } })`. Check count === 0 → concurrent modification, throw `UnauthorizedException("Invalid code")`. If new attempts >= MAX → set `user.otpFallbackUntil = now + 48h`, mark OTP as used. `await this.delayToMinimumResponse(startTime)`, throw `UnauthorizedException("Invalid code")`
       f. If match → optimistic lock: `updateMany({ where: { id: otpCode.id, used: false }, data: { used: true } })`. Check count === 0 → throw.
       g. Return user
    4. Trigger `cleanupExpiredOtpCodes()` in background
    5. `await this.delayToMinimumResponse(startTime)`
    6. Return `this.generateToken(user)` (same as validateMagicLink)
  - Notes: **300ms minimum response time** (F3 fix) applied to ALL paths (success + failure) to prevent user enumeration via timing. **Optimistic lock on attempts** (F4 fix): `updateMany` with `attempts: otpCode.attempts` condition prevents race condition where concurrent requests both read the same count. On max attempts exceeded, sets `otpFallbackUntil` — the Magic Link is NOT sent proactively here (user must call `requestOtp` again to trigger it via step 4, keeping the flow unidirectional). This corrects the AC5 alignment.

- [x] **Task 11: Add cleanupExpiredOtpCodes method**
  - File: `apps/api/src/modules/auth/auth.service.ts` (MODIFY)
  - Action: Add private cleanup method following cleanupExpiredMagicLinks pattern
  - Logic: Delete OtpCodes where `expiresAt < now - 24h` OR `used: true, createdAt < now - 24h`

#### Layer 5: Backend Endpoints (Depends on Layer 4)

- [x] **Task 12: Create OTP DTOs**
  - File: `apps/api/src/modules/auth/dto/request-otp.dto.ts` (NEW)
  - Action: Create DTO with `@IsEmail() email: string` (follows RequestMagicLinkDto pattern)
  - File: `apps/api/src/modules/auth/dto/verify-otp.dto.ts` (NEW)
  - Action: Create DTO with `@IsEmail() email: string` + `@Matches(/^\d{6}$/) @Length(6, 6) code: string`

- [x] **Task 13: Add OTP endpoints to AuthController**
  - File: `apps/api/src/modules/auth/auth.controller.ts` (MODIFY)
  - Action: Add two endpoints:
    ```typescript
    @Public()
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    @Post('otp/request')
    @ApiOperation({ summary: 'Request OTP code by email' })
    @ApiResponse({ status: 200, description: 'OTP sent (or Magic Link fallback)' })
    async requestOtp(@Body() dto: RequestOtpDto) {
        return this.authService.requestOtp(dto.email);
    }

    @Public()
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('otp/verify')
    @ApiOperation({ summary: 'Verify OTP code' })
    @ApiResponse({ status: 200, description: 'Authentication tokens returned' })
    @ApiResponse({ status: 401, description: 'Invalid or expired code' })
    async verifyOtp(@Body() dto: VerifyOtpDto) {
        return this.authService.verifyOtp(dto.email, dto.code);
    }
    ```
  - Notes: request = 3 req/60s (same as magic link). verify = 5 req/60s (user might mistype). Include `@ApiTags`, `@ApiOperation`, `@ApiResponse` decorators consistent with existing endpoints.

- [x] **Task 14: Add OTP procedures to tRPC router**
  - File: `apps/api/src/trpc/routers/auth.router.ts` (MODIFY)
  - Action: Add two procedures following existing pattern:
    ```typescript
    requestOtp: publicProcedure
      .input(requestOtpSchema)
      .output(otpRequestResponseSchema)
      .mutation(async ({ input, ctx }) => {
        return ctx.authService.requestOtp(input.email);
      }),
    verifyOtp: publicProcedure
      .input(verifyOtpSchema)
      .output(authResponseSchema)
      .mutation(async ({ input, ctx }) => {
        return ctx.authService.verifyOtp(input.email, input.code);
      }),
    ```
  - Notes: Import requestOtpSchema, verifyOtpSchema, otpRequestResponseSchema from @pawly/validators. Import authResponseSchema for verifyOtp output validation — prevents leaking unvalidated Prisma fields to tRPC clients.
  - **Known limitation (F9):** tRPC routes bypass NestJS `@Throttle` middleware. This is a pre-existing pattern (affects `requestMagicLink` too). Mitigation: DB-level attempt tracking provides defense in depth. Full fix (tRPC-level rate limiting middleware) is out of scope for this spec — tracked as tech debt.

#### Layer 6: Frontend (Depends on Layers 2 + 5)

- [x] **Task 15: Add OTP server actions**
  - File: `apps/web/src/app/[locale]/(auth)/login/_actions/auth-actions.ts` (MODIFY)
  - Action: Add two server actions:
    ```typescript
    export const requestOtpAction = createServerAction()
      .input(requestOtpSchema)
      .output(otpRequestResponseSchema)
      .experimental_shapeError(({ err }) => shapeError(err))
      .handler(async ({ input }) => {
        const result = await trpc.auth.requestOtp.mutate(input);
        return otpRequestResponseSchema.parse(result);
      });

    export const verifyOtpAction = createServerAction()
      .input(verifyOtpSchema)
      .output(authResponseSchema)
      .experimental_shapeError(({ err }) => shapeError(err))
      .handler(async ({ input }) => {
        const result = await trpc.auth.verifyOtp.mutate(input);
        const parsed = authResponseSchema.parse(result);
        await setAuthCookie(parsed.access_token); // Same cookie as loginAction (sameSite strict)
        return parsed;
      });
    ```
  - Notes: requestOtpAction does NOT set cookie (just sends code). verifyOtpAction sets cookie (same as loginAction with sameSite strict).

- [x] **Task 16: Create OtpInput component**
  - File: `apps/web/src/app/[locale]/(auth)/login/_components/OtpInput.tsx` (NEW)
  - Action: Create 6-digit OTP input component
  - Features:
    - 6 separate `<input>` fields, each accepting 1 digit
    - Auto-focus next field on input
    - Auto-focus previous field on backspace
    - Paste support: detect 6-digit paste, distribute across fields
    - `onComplete(code: string)` callback when all 6 digits entered
    - Visual: monospace font, 48px height (touch target), border highlight on focus (Vet Teal)
    - Accessibility: `aria-label="Digit N of 6"`, `inputMode="numeric"`, `pattern="[0-9]"`, `autoComplete="one-time-code"`
  - Notes: Consider using `input-otp` library (used by shadcn/ui) instead of building from scratch — handles mobile edge cases (Samsung keyboard, iOS smart text selection, screen readers) that are hard to replicate. If building custom, ensure thorough testing of: non-numeric input rejection, partial paste, triple-digit paste, Android back button, screen reader interaction with individual digit fields.

- [x] **Task 17: Update useAuth hook with OTP methods**
  - File: `apps/web/src/app/[locale]/(auth)/login/_hooks/useAuth.ts` (MODIFY)
  - Action: Add OTP mutations:
    ```typescript
    const otpRequestMutation = useServerActionMutation(requestOtpAction, {
      returnError: true,
      onSettled: invalidateAuthQueries,
    });
    const otpVerifyMutation = useServerActionMutation(verifyOtpAction, {
      returnError: true,
      onSettled: invalidateAuthQueries,
    });
    ```
  - Add methods:
    - `requestOtp(email)` — calls otpRequestMutation, returns `{ method }` to indicate OTP vs Magic Link
    - `verifyOtp(email, code)` — calls otpVerifyMutation, on success → toast + role-based redirect (same as login)
  - Return: add `requestOtp`, `verifyOtp`, `isOtpRequestPending`, `isOtpVerifyPending`, `otpRequestMethod`

- [x] **Task 18: Refactor MagicLinkForm → EmailAuthForm**
  - File: `apps/web/src/app/[locale]/(auth)/login/_components/MagicLinkForm.tsx` (MODIFY, rename conceptually)
  - Action: Replace magic link flow with OTP flow. Two-stage form:
    - **Stage 1 (email):** Same email input. On submit → call `requestOtp(email)`.
      - If response `method === "otp"` → show Stage 2 (OTP input)
      - If response `method === "magic_link"` → show "Check your email for a login link" (same as current success state)
    - **Stage 2 (OTP):** Show OtpInput component + submitted email (read-only). On complete (6 digits entered) → auto-submit → call `verifyOtp(email, code)`.
      - Success → redirect (handled by useAuth)
      - Error → show error message, clear OTP input, allow retry
      - "Resend code" button → re-call `requestOtp(email)`
      - "Back" button → return to Stage 1
  - Notes: Keep the file name as-is or rename to `EmailAuthForm.tsx` — preference is to keep filename stable and just change the component name and behavior.

- [x] **Task 19: Update LoginPageClient tab label**
  - File: `apps/web/src/app/[locale]/(auth)/login/_components/LoginPageClient.tsx` (MODIFY)
  - Action: Rename tab label from "Magic Link" to the i18n key for "Email" (`auth.tabs.email`). Tab behavior unchanged — it renders the (now OTP-based) email form.

- [x] **Task 20: Add OTP translation keys**
  - File: `apps/web/src/i18n/langs/fr.json` (MODIFY)
  - File: `apps/web/src/i18n/langs/en.json` (MODIFY)
  - Action: Add keys under `auth.otp` namespace:
    ```json
    {
      "auth": {
        "tabs": {
          "email": "Email",
          "password": "Mot de passe"
        },
        "otp": {
          "enterCode": "Entrez le code reçu par email",
          "sentTo": "Code envoyé à",
          "placeholder": "0",
          "submitButton": "Vérifier",
          "verifying": "Vérification...",
          "resendCode": "Renvoyer le code",
          "resending": "Envoi...",
          "back": "Retour",
          "invalidCode": "Code invalide",
          "expiredCode": "Code expiré, demandez un nouveau code",
          "tooManyAttempts": "Trop de tentatives. Vérifiez vos emails pour un lien de connexion.",
          "codeExpiry": "Le code expire dans 5 minutes"
        },
        "magicLink": {
          "fallbackMessage": "Vérifiez vos emails pour un lien de connexion",
          "fallbackHelper": "Un lien sécurisé a été envoyé à votre adresse email"
        }
      }
    }
    ```
  - Notes: Add equivalent English keys. Update `auth.magicLink.submitButton` → "Get my code" / "Recevoir mon code". Update `auth.magicLink.helper` → "Recommended for employees. Quick and secure." Remove references to "magic link" in employee-facing copy.

#### Layer 7: Tests (Parallel, depends on implementation)

- [x] **Task 21: OTP validator tests**
  - File: `packages/validators/src/auth/otp.schema.test.ts` (NEW)
  - Action: Test requestOtpSchema (valid/invalid emails), verifyOtpSchema (valid 6-digit codes, invalid formats: letters, 5 digits, 7 digits, empty), otpRequestResponseSchema (valid methods)
  - Pattern: Follow existing `*.test.ts` Vitest pattern

- [x] **Task 22: AuthService OTP tests**
  - File: `apps/api/src/modules/auth/auth.service.spec.ts` (MODIFY)
  - Action: Add describe blocks:
    - `requestOtp`: user exists → creates OtpCode with hashed code, sends email. User doesn't exist → same response + 300ms delay. User has otpFallbackUntil in future → calls requestMagicLink, returns `method: "magic_link"`. Invalidates existing unused OTPs before creating new one.
    - `verifyOtp`: valid code → marks used (optimistic lock), returns tokens. Wrong code → increments attempts, throws. Max attempts → sets otpFallbackUntil, sends Magic Link, throws. Expired code → throws. Used code → throws. Race condition → updateMany count 0 → throws.
    - `cleanupExpiredOtpCodes`: deletes expired + old used records.
  - Pattern: Follow existing Jest mock setup (add `otpCode: { create, findFirst, updateMany, deleteMany }` to mockPrismaService)

- [x] **Task 23: AuthController OTP tests**
  - File: `apps/api/src/modules/auth/auth.controller.spec.ts` (MODIFY)
  - Action: Add tests for `requestOtp` (calls service, returns response) and `verifyOtp` (calls service, returns tokens, propagates exceptions)

- [x] **Task 24: Frontend auth-actions OTP tests**
  - File: `apps/web/src/app/[locale]/(auth)/login/_actions/auth-actions.spec.ts` (MODIFY)
  - Action: Add tests for `requestOtpAction` (calls trpc, returns parsed response, does NOT set cookie) and `verifyOtpAction` (calls trpc, sets auth-token cookie with sameSite strict, returns parsed response, no cookie on error)

- [x] **Task 25: Frontend useAuth OTP tests**
  - File: `apps/web/src/app/[locale]/(auth)/login/_hooks/useAuth.spec.ts` (MODIFY)
  - Action: Add tests for `requestOtp` (success toast, error toast, network error), `verifyOtp` (success redirect by role, error toast, invalidates auth queries)

- [x] **Task 26: OtpInput component tests**
  - File: `apps/web/src/app/[locale]/(auth)/login/_components/OtpInput.spec.ts` (NEW)
  - Action: Test the OtpInput component interaction logic:
    - Renders 6 input fields with correct accessibility attributes (`aria-label`, `inputMode`, `autoComplete`)
    - Typing a digit auto-focuses the next field
    - Backspace on empty field focuses the previous field
    - Pasting a 6-digit code distributes digits across all fields and triggers `onComplete`
    - Pasting non-numeric or partial text is rejected/handled gracefully
    - `onComplete` callback fires with the full 6-digit code string
    - Non-numeric input is rejected
    - Fields clear correctly on reset
  - Pattern: Vitest + Testing Library, `*.spec.ts`

### Acceptance Criteria

#### Happy Path

- [x] **AC1:** Given an employee with a valid account, when they enter their email on the login page and submit, then a 6-digit OTP code is sent to their email and the UI transitions to the OTP input screen.

- [x] **AC2:** Given an employee who received an OTP code, when they enter the correct 6-digit code within 5 minutes, then they are authenticated (JWT cookie set in PWA context) and redirected to `/dashboard`.

- [x] **AC3:** Given an employee using the PWA standalone on iOS, when they complete the OTP flow, then the auth cookie is set in the PWA context (not Safari) and they remain authenticated on subsequent visits.

- [x] **AC4:** Given an admin, when they access the login page, then they can switch to the "Mot de passe" tab and log in with email + password as before.

#### Fallback Behavior

- [x] **AC5:** Given an employee who has exceeded 5 failed OTP attempts on a single code, when `verifyOtp` rejects the 5th attempt, then the backend sets `otpFallbackUntil` on the User (48h). On the next `requestOtp` call, the backend detects the fallback and sends a Magic Link instead of an OTP, and the UI shows "Check your email for a login link" message. The Magic Link is NOT sent proactively during `verifyOtp` — only on the next explicit request.

- [x] **AC6:** Given an employee in Magic Link fallback mode, when 48 hours have passed since the fallback was triggered, then the system returns to OTP as the default method.

#### Error Handling

- [x] **AC7:** Given an employee who enters an incorrect OTP code, when they submit, then an error message is shown ("Code invalide"), the OTP input is cleared, and they can retry. The limit is 5 attempts per code (each new code request resets attempts to 0). However, exceeding 5 attempts on any single code triggers a 48h per-user fallback to Magic Link (AC5).

- [x] **AC8:** Given an expired OTP code (> 5 minutes), when the employee tries to verify it, then an error is shown and they can request a new code via the "Resend" button.

- [x] **AC9:** Given a non-existent email, when submitted, then the response is identical to a valid email (same message, same timing ≥ 300ms) to prevent user enumeration.

#### Security

- [x] **AC10:** Given the OTP code stored in the database, then it is stored as an HMAC-SHA256 hash with server secret (raw code never persisted). The raw code only appears in the email. Plain SHA256 is NOT used for OTP because 6-digit codes (900K values) are trivially reversible without a secret.

- [x] **AC11:** Given the OTP request endpoint (REST), then it is rate-limited to 3 requests per 60 seconds per IP via `@Throttle`. The verify endpoint is limited to 5 requests per 60 seconds per IP. **Note:** tRPC routes bypass `@Throttle` (pre-existing limitation). DB-level attempt tracking (max 5 per code + 48h fallback) provides defense in depth for the tRPC path.

- [x] **AC12:** Given a used OTP code, when someone tries to use it again (replay attack), then verification fails due to optimistic locking (`used: true` guard).

#### UX

- [x] **AC13:** Given the OTP input screen, when the employee pastes a 6-digit code from their email, then the digits are distributed across the 6 input fields and verification is triggered automatically.

- [x] **AC14:** Given the login page, then the tab previously labeled "Magic Link" is now labeled "Email" and uses the OTP flow by default.

## Additional Context

### Dependencies

- Existing auth infrastructure (Epic 1) — reuses generateToken, setAuthCookie, JwtStrategy, hashToken
- Resend email service — already configured
- No new npm packages required

### Testing Strategy

**Unit Tests:**
- Validators: requestOtpSchema, verifyOtpSchema edge cases (Vitest, `*.test.ts`)
- AuthService: requestOtp, verifyOtp with full mock coverage (Jest, `*.spec.ts`)
- AuthController: endpoint routing + throttle decorators (Jest)
- Server actions: requestOtpAction, verifyOtpAction + cookie handling (Vitest)
- useAuth hook: OTP mutations, toast messages, error handling (Vitest)

**Integration Tests (Manual):**
- Full OTP flow on desktop browser
- Full OTP flow on iOS PWA standalone (critical — validates the core problem is solved)
- Full OTP flow on Android PWA standalone
- Magic Link fallback after 5 failed attempts
- Fallback expiry after 48h
- Admin password login still works
- Paste OTP code from email notification

### Notes

**High-Risk Items:**
- iOS PWA standalone cookie behavior — must be validated on real device (not simulator)
- Resend email delivery latency — if slow, users might re-request and get confused. "Resend code" button in UI mitigates this.
- OTP code display in email — must be clearly legible and easy to copy on mobile email clients
- Email notification preview on lock screen — the 6-digit code may be visible in push notification preview without unlocking the phone. Mitigation: code appears AFTER the subject line text in email body, and the 5-minute TTL limits exposure window. Recommend email subject NOT include the code (keep it generic: "Votre code Pawly").

**Known Limitations:**
- No SMS fallback — email is the only delivery channel
- No biometric auth — future consideration
- 5-minute TTL is a trade-off between security and UX (shorter = safer, longer = more forgiving)
- tRPC routes bypass NestJS `@Throttle` middleware — pre-existing pattern affecting all auth endpoints. DB-level controls (attempt tracking + 48h fallback) provide defense in depth. Full tRPC rate limiting is tech debt.
- If email send fails after OTP record creation, the user receives no code. The "Resend code" button in UI handles this by requesting a new OTP (which invalidates the orphaned one).
- Existing `/auth/callback` route for Magic Link validation remains fully functional and untouched. No modifications needed to callback page or `validateMagicLink` flow.

**Future Considerations:**
- `autoComplete="one-time-code"` may trigger iOS/Android native OTP autofill from SMS — won't work with email OTP, but won't break either
- Consider adding "Remember this device" (extended JWT) in a future story to reduce re-authentication frequency

## Change Log

### Code Review — 2026-03-01

**Reviewer:** AI Adversarial Code Review (BMAD Workflow)
**Skills Used:** turborepo, vercel-react-best-practices, frontend-design, nestjs-best-practices

**Issues Found:** 7 (2 HIGH, 2 MEDIUM, 3 LOW)
**Issues Fixed:** 4 (all HIGH + MEDIUM)

| Sev. | ID | Finding | Fix |
|------|-----|---------|-----|
| HIGH | H1 | Timing attack in `verifyOtp` — errors thrown inside `$transaction` bypassed `delayToMinimumResponse`, leaking timing information | Wrapped `$transaction` in try/catch, applying 300ms delay before re-throwing |
| HIGH | H2 | AC7 violation — OTP input not cleared on verification failure; `OtpInput` had no imperative API for parent to trigger clear | Added `forwardRef` + `useImperativeHandle` with `clear()` method to `OtpInput`; `MagicLinkForm` calls `clear()` on `verifyOtp` failure |
| MEDIUM | M1 | Paste handler only attached to first input (`i === 0`), paste on other inputs was silently ignored | Attached `onPaste={handlePaste}` to all 6 inputs |
| MEDIUM | M2 | Uncontrolled inputs with direct DOM manipulation (no React state) | Addressed via H2 fix — imperative handle provides controlled clear mechanism |
| LOW | L1 | `hashOtp` uses `JWT_SECRET` directly instead of dedicated `OTP_HMAC_SECRET` with fallback | Documented — low risk, functional |
| LOW | L2 | Clear button uses `"back"` translation key instead of dedicated `"clear"` key | Documented |
| LOW | L3 | Missing `@ApiResponse({ status: 400 })` on OTP controller endpoints | Documented |

**Tests Added:**
- `auth.service.spec.ts`: 2 timing attack prevention tests (wrong code path + max attempts path)
- `OtpInput.spec.tsx`: 1 paste-on-non-first-input test

**Verification:** All tests pass (787 API, 749 Web), build succeeds (5 Turborepo tasks)
