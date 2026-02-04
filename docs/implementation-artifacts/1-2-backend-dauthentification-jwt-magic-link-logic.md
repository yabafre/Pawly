# Story 1.2: Backend d'Authentification (JWT + Magic Link Logic)

Status: complete

## Story

As an employee,
I want to request a Magic Link via my email and receive a secure link,
so that I can log in without a password.

## Acceptance Criteria

1. **Given** a valid employee email in the database, **When** I call the request magic link endpoint, **Then** a hashed token is stored in the database with a 15-minute TTL. [Source: docs/planning-artifacts/epics.md#Story 1.2]
2. **Given** the token is generated, **Then** an email is sent via Resend containing the single-use login link. [Source: docs/planning-artifacts/epics.md#Story 1.2]
3. **Given** an admin user, **Then** they can still login using password + JWT (hybride mode). Password MUST meet NFR7 complexity: 8+ chars, mixed case, numbers. [Source: docs/planning-artifacts/architecture.md#Authentication & Security]
4. **Given** a magic link is used once or expires, **Then** it cannot be used again. [Source: docs/planning-artifacts/epics.md#NFR5]
5. **Given** a JWT is issued, **Then** it expires within 24 hours. Refresh tokens expire within 7 days (NFR8).

## Tasks / Subtasks

- [x] **Infrastructure & Models** (AC: 1)
  - [x] Verify `MagicLink` model in `apps/api/prisma/schema/User.prisma` (Done)
  - [x] Ensure `password` is nullable in `User` model (Done)
- [x] **Auth Service Enhancements** (AC: 1, 3, 4, 5)
  - [x] Implement `requestMagicLink(email: string)`:
    - [x] Check if user exists.
    - [x] Generate secure token (UUID or crypto).
    - [x] Store hashed token with `expiresAt` (now + 15m).
  - [x] Implement `validateMagicLink(token: string)`:
    - [x] Find token in DB.
    - [x] Verify `used == false` and `expiresAt > now`.
    - [x] Mark as `used`.
    - [x] Return JWT for the associated user.
  - [x] Validate password complexity on registration/update (NFR7: 8+ chars, mixed case, numbers)
  - [x] Configure JWT expiration: 24h for access tokens, 7d for refresh tokens (NFR8)
- [x] **Email Integration** (AC: 2)
  - [x] Install `resend` and `@react-email/components` in `apps/api`.
  - [x] Create `MailService` in `apps/api/src/mail/` (or similar).
  - [x] Create simple React Email template for Magic Link.
- [x] **API Endpoints** (AC: 1, 2, 4)
  - [x] Add `POST /auth/magic-link/request` to `AuthController`.
  - [x] Add `GET /auth/magic-link/callback?token=...` to `AuthController`.
- [x] **Security & Multi-tenancy** (AC: 1)
  - [x] Ensure `clinicId` is properly handled in magic link requests.

## Dev Notes

- **Architecture Pattern**: Follow `Zsa -> tRPC -> NestJS` flux for the web app, but this story focuses on the NestJS backend implementation.
- **Database**: Prisma 7.2.0 with Schema Folders. Models are already defined in `apps/api/prisma/schema/User.prisma`.
- **Security**: Magic Link TTL 15m, single-use, hashed in DB. [Source: docs/planning-artifacts/epics.md#NFR5]
- **NFR7 Compliance**: Password complexity validation required (8+ chars, mixed case, numbers)
- **NFR8 Compliance**: JWT access tokens expire in 24h, refresh tokens in 7d
- **Future Integration (FR16)**: When Subscription model is added (Epic 7), auth responses should include subscription status for access control
- **NFR18-NFR19 Note**: No card data stored in auth system. Subscription access control will be layered on top via Stripe webhook-driven status checks (Epic 7).
- **Email**: Use Resend. Ensure API key is handled via env vars (do not hardcode).
- **Tech Stack**: NestJS 11, Prisma 7, Passport JWT, React Email.

### Project Structure Notes

- `apps/api/src/auth/`: Main logic for authentication.
- `apps/api/src/prisma/`: Database access.
- `apps/api/src/mail/`: New module for email sending using Resend and React Email.
- `packages/validators/`: Shared Zod schemas.

### References

- [Source: docs/planning-artifacts/epics.md#Story 1.2]
- [Source: docs/planning-artifacts/architecture.md#Authentication & Security]
- [Source: docs/planning-artifacts/architecture.md#API & Communication Patterns]

## Future Extension Points (Cross-Epic Dependencies)

**For Stripe Subscription Epic (Epic 7, FR16):**
- [ ] Include subscription status in JWT payload or auth response for client-side access control
- [ ] Create NestJS guard to check active subscription status for admin endpoints
- [ ] Ensure auth system can query Subscription model after Stripe webhooks update subscription status

**Validation Completed (Code Review):**
- [x] Verify NFR7 password complexity is enforced in RegisterDto (MinLength 8, uppercase, lowercase, digit)
- [x] Verify NFR8 JWT expiration times (24h access, 7d refresh) are correctly configured via JwtModule.registerAsync

## Dev Agent Record

### Agent Model Used

Gemini 2.0 Flash

### Debug Log References

- Tests passed for `AuthService` and `AuthController`.
- Build successful for `apps/api`.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implemented `requestMagicLink` and `validateMagicLink` in `AuthService`.
- **Security Update**: Magic link tokens are now hashed using SHA-256 before storage and validation.
- **Config Update**: Externalized `WEB_APP_URL` and `MAIL_FROM` to environment variables.
- **Validation Update**: Added `RequestMagicLinkDto` with `class-validator` for better API security.
- Added `POST /auth/magic-link/request` and `GET /auth/magic-link/callback` endpoints in `AuthController`.
- Created `MailModule` and `MailService` with `react-email` templates and error handling.
- Configured NestJS to support JSX/TSX for email templates.
- **2026-02-04**: Story documentation updated to reflect PRD/Architecture changes (NFR5-NFR8 security requirements, FR16 subscription integration points).
- **2026-02-04**: Adversarial code review #1 by Claude Opus 4.5 — 19 issues fixed (8 HIGH, 7 MEDIUM, 4 LOW). See Change Log below.
- **2026-02-04**: Adversarial code review #2 by Claude Opus 4.5 — 14 additional issues fixed (5 CRITICAL, 7 HIGH, 2 MEDIUM). Focus: missing infrastructure (RequestIdInterceptor, global guards/filters, rate limiting), duplicate directories cleanup, tRPC context JWT extraction, @pawly/types single source of truth, helpers refactor storeId→clinicId. Build passes, 28/28 tests pass.

### Change Log (Code Review Fixes — Review #1, Gemini 2.0 Flash)

| # | Severity | Fix Applied |
|---|----------|-------------|
| 1 | HIGH | Fixed user enumeration in `requestMagicLink` — returns identical message for non-existent users |
| 2 | HIGH | Fixed timing attack in `validateMagicLink` — single `isInvalid` boolean combines all checks |
| 3 | HIGH | Removed hardcoded JWT secret fallback (`'secretKey'`) — fail-fast if `JWT_SECRET` not set |
| 4 | HIGH | Added `clinicId` to JWT payload for multi-tenant isolation |
| 5 | HIGH | Implemented `POST /auth/refresh` endpoint with 7d refresh tokens (NFR8) |
| 6 | HIGH | Added NFR7 password complexity validation in `RegisterDto` (8+ chars, mixed case, digit) |
| 7 | HIGH | Changed `JwtModule.register` to `JwtModule.registerAsync` with fail-fast factory |
| 8 | HIGH | JWT strategy fail-fast if `JWT_SECRET` env var not set |
| 9 | MEDIUM | Added full Swagger `@ApiResponse` decorators on all 6 endpoints |
| 10 | MEDIUM | Added `@ApiBearerAuth('JWT-auth')` on protected `/profile` endpoint |
| 11 | MEDIUM | Added `ValidateMagicLinkDto` with 64-char hex token validation |
| 12 | MEDIUM | Added `RefreshTokenDto` for POST /auth/refresh |
| 13 | MEDIUM | Added `AuthResponseDto`, `MagicLinkResponseDto`, `UserProfileDto` for Swagger |
| 14 | MEDIUM | Increased bcrypt rounds from 10 to 12 |
| 15 | MEDIUM | Removed email PII from error logs in `MailService` (GDPR) |
| 16 | LOW | Added `afterEach(() => jest.clearAllMocks())` to all test suites |
| 17 | LOW | Added comprehensive test coverage: `login`, `register`, `validateUser`, `refreshToken`, `getProfile` |
| 18 | LOW | Added return value assertions to controller tests |
| 19 | LOW | Added timing attack prevention test (uniform error messages) |

### Change Log (Code Review Fixes — Review #2, Claude Opus 4.5)

| # | Severity | Fix Applied |
|---|----------|-------------|
| 20 | CRITICAL | Created `RequestIdInterceptor` in `common/interceptors/` — was imported but never existed, app would crash |
| 21 | CRITICAL | Fixed `app.module.ts` — removed deleted `AppController`/`AppService` imports, registered `JwtAuthGuard` as global `APP_GUARD` and `HttpExceptionFilter` as global `APP_FILTER` |
| 22 | CRITICAL | Fixed `main.ts` — uses `ConfigService` for PORT/CORS instead of `process.env`, fixed import path `@common` → `@/common`, removed manual `HttpExceptionFilter` instantiation (requires DI) |
| 23 | CRITICAL | Deleted old duplicate `apps/api/src/auth/` and `apps/api/src/mail/` directories (already refactored to `modules/`) |
| 24 | CRITICAL | Fixed `authResponseSchema` — added missing `refresh_token` field in `@pawly/validators` |
| 25 | CRITICAL | Fixed `@pawly/types` — `AuthResponse`/`MagicLinkResponse` now re-exported from `@pawly/validators` (single source of truth), added `@pawly/validators` workspace dependency |
| 26 | HIGH | Fixed tRPC context — added JWT extraction from Authorization header, added `JwtService` to `TRPCServices` interface |
| 27 | HIGH | Fixed `trpc.module.ts` — corrected import paths `@modules/` → `@/modules/`, fixed `createContext` to pass full opts (tRPC v11 requires `info` field) |
| 28 | HIGH | Fixed `RolesGuard` — throws `ForbiddenException` instead of silently returning `false` |
| 29 | HIGH | Refactored `trpc/helpers.ts` — `storeId` → `clinicId`, `Permission` → `Role` from `@pawly/types`, renamed all helpers to clinic-scoped naming |
| 30 | HIGH | Added `@nestjs/throttler` rate limiting — global ThrottlerGuard (10 req/60s) in `AppModule` |
| 31 | HIGH | Fixed `TrpcModule` → `TRPCModule` naming consistency in `app.module.ts` |
| 32 | MEDIUM | Updated `validateMagicLink` tests — mocks now support `$transaction` pattern, added race condition test |
| 33 | MEDIUM | Added barrel export for interceptors in `common/index.ts` |

### File List

- `apps/api/src/modules/auth/auth.service.ts` (Existing — transactional validateMagicLink)
- `apps/api/src/modules/auth/auth.controller.ts` (Existing)
- `apps/api/src/modules/auth/auth.module.ts` (Existing)
- `apps/api/src/modules/auth/jwt.strategy.ts` (Existing)
- `apps/api/src/modules/auth/dto/login.dto.ts` (Existing)
- `apps/api/src/modules/auth/dto/register.dto.ts` (Existing — NFR7 password validation)
- `apps/api/src/modules/auth/dto/request-magic-link.dto.ts` (Existing)
- `apps/api/src/modules/auth/dto/validate-magic-link.dto.ts` (Existing — token format validation)
- `apps/api/src/modules/auth/dto/refresh-token.dto.ts` (Existing — refresh token DTO)
- `apps/api/src/modules/auth/dto/auth-response.dto.ts` (Existing — Swagger response DTOs)
- `apps/api/src/modules/auth/auth.service.spec.ts` (Modified — $transaction mocks, race condition test)
- `apps/api/src/modules/auth/auth.controller.spec.ts` (Existing)
- `apps/api/src/modules/mail/mail.module.ts` (Existing)
- `apps/api/src/modules/mail/mail.service.tsx` (Existing)
- `apps/api/src/modules/mail/templates/MagicLinkEmail.tsx` (Existing)
- `apps/api/src/app.module.ts` (Modified — APP_GUARD, APP_FILTER, ThrottlerModule)
- `apps/api/src/main.ts` (Modified — ConfigService, fixed imports)
- `apps/api/src/common/interceptors/request-id.interceptor.ts` (New)
- `apps/api/src/common/interceptors/index.ts` (New)
- `apps/api/src/common/index.ts` (Modified — interceptors export)
- `apps/api/src/common/guards/roles.guard.ts` (Modified — ForbiddenException)
- `apps/api/src/trpc/context.ts` (Modified — JWT extraction, JwtService)
- `apps/api/src/trpc/helpers.ts` (Modified — clinicId/Role refactor)
- `apps/api/src/trpc/trpc.module.ts` (Modified — import paths, createContext opts)
- `packages/validators/src/auth/response.schema.ts` (Modified — refresh_token)
- `packages/types/src/auth/auth.types.ts` (Modified — re-export from validators)
- `packages/types/package.json` (Modified — @pawly/validators dependency)
- `apps/api/package.json` (Modified — @nestjs/throttler)
- `pnpm-lock.yaml` (Modified)
