# Story 1.2: Backend d'Authentification (JWT + Magic Link Logic)

Status: done

## Story

As an employee,
I want to request a Magic Link via my email and receive a secure link,
so that I can log in without a password.

## Acceptance Criteria

1. **Given** a valid employee email in the database, **When** I call the request magic link endpoint, **Then** a hashed token is stored in the database with a 15-minute TTL. [Source: docs/planning-artifacts/epics.md#Story 1.2]
2. **Given** the token is generated, **Then** an email is sent via Resend containing the single-use login link. [Source: docs/planning-artifacts/epics.md#Story 1.2]
3. **Given** an admin user, **Then** they can still login using password + JWT (hybride mode). [Source: docs/planning-artifacts/architecture.md#Authentication & Security]
4. **Given** a magic link is used once or expires, **Then** it cannot be used again. [Source: docs/planning-artifacts/epics.md#NFR2]

## Tasks / Subtasks

- [x] **Infrastructure & Models** (AC: 1)
  - [x] Verify `MagicLink` model in `apps/api/prisma/schema/User.prisma` (Done)
  - [x] Ensure `password` is nullable in `User` model (Done)
- [x] **Auth Service Enhancements** (AC: 1, 3, 4)
  - [x] Implement `requestMagicLink(email: string)`:
    - [x] Check if user exists.
    - [x] Generate secure token (UUID or crypto).
    - [x] Store hashed token with `expiresAt` (now + 15m).
  - [x] Implement `validateMagicLink(token: string)`:
    - [x] Find token in DB.
    - [x] Verify `used == false` and `expiresAt > now`.
    - [x] Mark as `used`.
    - [x] Return JWT for the associated user.
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
- **Security**: Magic Link TTL 15m, single-use, hashed in DB. [Source: docs/planning-artifacts/epics.md#NFR2]
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

### File List

- `apps/api/src/auth/auth.service.ts` (Modified)
- `apps/api/src/auth/auth.controller.ts` (Modified)
- `apps/api/src/auth/auth.module.ts` (Modified)
- `apps/api/src/auth/dto/request-magic-link.dto.ts` (New)
- `apps/api/src/auth/auth.service.spec.ts` (New)
- `apps/api/src/auth/auth.controller.spec.ts` (New)
- `apps/api/src/mail/mail.module.ts` (New)
- `apps/api/src/mail/mail.service.tsx` (New)
- `apps/api/src/mail/templates/MagicLinkEmail.tsx` (New)
- `apps/api/package.json` (Modified)
- `apps/api/tsconfig.json` (Modified)
- `apps/api/src/app.module.ts` (Modified)
- `.env.example` (Modified)
- `pnpm-lock.yaml` (Modified)
- `docs/implementation-artifacts/sprint-status.yaml` (Modified)
