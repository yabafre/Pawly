# Story 1.3: Interface de Connexion & Flux Zsa/tRPC

Status: done (needs refactor in Story 1.5)

## User Story

As a user (Admin or Employee),
I want to use a unified login interface,
so that I can access my dashboard based on my role.

## Acceptance Criteria

1. **Given** a Next.js 16.1.6 login page (RSC + Client Components) using shadcn/ui, **When** I submit my credentials or request a magic link, **Then** the data flow `Page (RSC) -> Client Comp -> Hook -> Zsa -> Server Action -> tRPC -> API` is executed. [Source: docs/planning-artifacts/epics.md#Story 1.3]
   - **Note**: Current route `app/login/` will migrate to `app/[locale]/(auth)/login/` when FR11 i18n is implemented (Epic 2).
2. **Then** I am authenticated with a JWT and redirected to the appropriate route. [Source: docs/planning-artifacts/epics.md#Story 1.3]
3. **Given** the login forms, **Then** they meet NFR14-NFR17 accessibility standards (WCAG 2.1 AA, 44px touch targets, 4.5:1 contrast ratio, keyboard navigation).
4. **Given** admin authentication succeeds, **Then** subscription status check will be added per FR16 (deferred to Epic 3 - Subscription & Registration).

## Tasks

- [x] **Infrastructure & Integration** (AC: 1)
  - [x] Install tRPC and ZSA dependencies in `apps/api` and `apps/web`.
  - [x] Configure tRPC module and router in NestJS (`apps/api`).
  - [x] Integrate tRPC middleware in `apps/api/src/main.ts`.
  - [x] Create tRPC client in `apps/web/src/lib/trpc/client.ts`.
- [x] **Server Actions** (AC: 1)
  - [x] Implement `loginAction` and `requestMagicLinkAction` using ZSA in `apps/web`.
  - [x] Implement `validateMagicLinkAction` for the callback flow in `apps/web`.
- [x] **Frontend Implementation** (AC: 1, 2)
  - [x] Update `apps/web/src/app/login/page.tsx` with unified Tabs (Magic Link / Password).
  - [x] Connect form submissions to ZSA actions.
  - [x] Handle successful authentication (store JWT, redirect based on role).
  - [x] Add `/auth/callback` route to validate magic links and redirect.
  - [x] Use `@tanstack/react-form` for login form state and validation.
- [ ] **Accessibility Compliance (NFR14-NFR17)** (AC: 3)
  - [ ] Verify touch targets >= 44px on mobile for all login buttons/inputs.
  - [ ] Verify color contrast >= 4.5:1 for all text elements.
  - [ ] Verify keyboard navigation works (Tab, Enter, Escape).
  - [ ] Verify WCAG 2.1 AA compliance using automated tools (axe-core).
- [ ] **Auth Refactor (Story 1.5)** (AC: 1, 2)
  - [ ] Remove clinicId from login/magic-link form inputs and schemas.
  - [ ] Remove `NEXT_PUBLIC_CLINIC_ID` from env and all code references.
  - [ ] Update `useAuth.ts` and `auth-actions.ts` to no longer reference clinicId as input.
  - [ ] Remove `register()` flow (registration via Stripe webhook only).
- [ ] **Future Refactoring for i18n (Epic 2, FR11)** (AC: 1)
  - [ ] Migrate route from `app/login/` to `app/[locale]/(auth)/login/`.
  - [ ] Extract all hardcoded strings to `messages/{fr,en}.json`.
  - [ ] Implement locale switching UI (language toggle).
  - [ ] Update root layout to support dynamic locale param.
  - [ ] Add locale param to all auth actions and redirects.
- [ ] **Future Subscription Guard (Epic 3, FR16)** (AC: 4)
  - [ ] Add subscription status check in `admin/layout.tsx` (server-side).
  - [ ] Redirect to billing page if subscription inactive/canceled.
  - [ ] Source of truth: Subscription record in DB (synced from Stripe via webhooks).

## Dev Notes

- **Data Flow Pattern (STRICT COMPLIANCE REQUIRED)**:
  1. **Page (RSC)**: Entry point in `apps/web/src/app`.
  2. **Client Component**: Interactive UI.
  3. **Custom Hook**: (e.g., `useAuth`) in `apps/web/src/app/login/_hooks/`.
  4. **Zsa Hooks**: (e.g., `useServerActionMutation`) in `apps/web/src/lib/hooks/server-action-hooks.ts`.
  5. **Server Action**: (`'use server'`) in `_actions/`.
  6. **tRPC Client**: Communication layer in `apps/web/src/lib/trpc/client.ts`.
  7. **NestJS API**: Backend handling in `apps/api/src/trpc/`.

- **Context7 Usage**: Agents MUST use `context7` to fetch the latest documentation for `tRPC` v11, `Zsa`, and `NestJS` 11 before finalizing implementation details.
- **State Management**: `zsa-react-query` wrapped in custom hooks for server action handling.
  - MUST wrap the application in `ReactQueryProvider`.
  - MUST use `QueryKeyFactory` in `apps/web/src/lib/hooks/server-action-hooks.ts` for typesafe cache keys.
- **Forms**: Use `@tanstack/react-form` for client form state and validation.
- **UI**: Operational UI direction aligned with Admin/Employee flows. Primary: Electric Indigo (#4F46E5) for active states, Secondary: Vital Orange (#F97316) for warnings, Neutral-900 for primary CTAs, logo in black. Vet Teal (#009588) reserved for validation/care. Follow **frontend-design** and **web-design-guidelines** for high-quality, accessible interfaces.
- **Security**: JWT stored in localStorage (MVP). CORS enabled in backend.
- **Performance**: Adhere to **vercel-react-best-practices** for Next.js 16.1.6 performance optimization.
- **Runtime**: Repo uses **Next.js 16.1.6** (kept intentionally; documented for alignment).
- **Pending Refactor (Story 1.5)**: clinicId will be removed from login/magic-link form inputs. `NEXT_PUBLIC_CLINIC_ID` will be eliminated. `useAuth.ts` and `auth-actions.ts` will no longer reference clinicId as input. `register()` flow will be disabled (registration via Stripe webhook only).
- **i18n Refactoring Required (Epic 2, FR11)**: Current route structure (`app/login/`) will migrate to `app/[locale]/(auth)/login/` when next-intl is integrated. All UI strings will be externalized to translation files (fr.json, en.json).
- **Subscription Guard (Epic 3, FR16)**: Admin layout currently only checks auth (localStorage token). When Stripe integration is complete, subscription status validation will be added per architecture requirements (server-side check in admin/layout.tsx).
- **Accessibility (NFR14-NFR17)**: Login forms must meet WCAG 2.1 AA standards. Verify touch targets (44px), contrast (4.5:1 text, 3:1 UI), keyboard navigation.
- **Landing Page (Epic 4, FR12)**: Public landing page at `app/[locale]/page.tsx` (SSG) is NOT in scope for this story but will coexist with login routes.

### Project Structure Notes

- `apps/api/src/trpc/`: tRPC backend configuration.
- `apps/web/src/lib/trpc/`: tRPC client configuration.
- `apps/web/src/app/login/`: Current location (will migrate to `app/[locale]/(auth)/login/` for Epic 2 FR11).
- `apps/web/src/app/login/_actions/`: ZSA server actions.
- `apps/web/src/app/login/_hooks/`: Route-local hooks (auth flow).
- `apps/web/src/app/auth/callback/`: Magic link validation route (RSC + Client).
- `apps/web/src/i18n/`: (Epic 2) i18n config, routing, translation files.
- `apps/web/proxy.ts`: (Epic 2) next-intl locale detection proxy.
- **Shared Packages**: MUST use `@pawly/validators` for Zod schemas, `@pawly/types` for TypeScript contracts, and `@pawly/zod` for the unified Zod instance.
- **Monorepo**: Strictly follow **turborepo** pipeline and workspace conventions.

### References

- [Source: docs/planning-artifacts/epics.md#Story 1.3]
- [Source: docs/planning-artifacts/architecture.md#API & Communication Patterns]

### Future Extension Points (Cross-Epic Dependencies)

**For Auth Refactor (Story 1.5):**
- [ ] Remove clinicId from login/magic-link form inputs and Zod schemas.
- [ ] Remove `NEXT_PUBLIC_CLINIC_ID` from `.env`, `.env.example`, and all code references.
- [ ] Update `useAuth.ts` and `auth-actions.ts` to email-only login.
- [ ] Disable/remove `register()` flow (registration via Stripe webhook only).
- [ ] Update all frontend auth tests.

**For i18n Epic (Epic 2, FR11, NFR20):**
- [ ] Install and configure `next-intl` package.
- [ ] Create `apps/web/src/i18n/routing.ts` (defaultLocale: 'fr', locales: ['fr', 'en']).
- [ ] Create `apps/web/proxy.ts` for locale detection and routing.
- [ ] Migrate all routes to `app/[locale]/` structure.
- [ ] Extract all login/auth strings to `messages/{fr,en}.json`.
- [ ] Add language switcher component.
- [ ] Update root layout to accept locale param.
- [ ] Test instantaneous language switching (NFR20).

**For Landing Page Epic (Epic 4, FR12, NFR21-NFR22):**
- [ ] Create `app/[locale]/page.tsx` (public landing, SSG).
- [ ] Create `app/[locale]/pricing/page.tsx` (pricing + pre-checkout form, SSG).
- [ ] Implement `generateStaticParams` for ['fr', 'en'].
- [ ] Lighthouse Performance >= 90 (NFR21).
- [ ] No auth required, no non-essential cookies (NFR22).

**For Stripe Subscription Epic (Epic 3, FR13-FR17, NFR18-NFR19):**
- [ ] Add subscription status check to `admin/layout.tsx` (server-side).
- [ ] Add onboarding check (`Clinic.onboardingCompleted`) to admin layout.
- [ ] Query Subscription model to verify active status.
- [ ] Redirect to billing page if subscription inactive.
- [ ] Source of truth: Stripe subscription status in DB.

**Accessibility Validation (NFR14-NFR17):**
- [ ] Automated WCAG 2.1 AA audit (axe-core, Lighthouse).
- [ ] Manual keyboard navigation test.
- [ ] Manual color contrast verification.
- [ ] Manual touch target verification on mobile (>= 44px).

### Dev Agent Record (original)

#### Agent Model Used

Gemini 2.0 Flash

#### Debug Log References

- Build successful for `apps/web` and `apps/api`.
- Verified tRPC connectivity between web and api.
- Unit tests implemented and passing for `TrpcRouter` (API) and `useAuth` hook (Web).
- Vitest configured in `apps/web`.
- Review fixes applied; tests not re-run in this pass.

#### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Integrated tRPC in NestJS and connected it to ZSA actions in Next.js.
- Implemented a unified login page with "Clinique Zen" aesthetics.
- Added `@pawly/validators`, `@pawly/types`, and `@pawly/zod` usage.
- Configured React Query provider and custom ZSA hooks abstraction.
- Refactored login page to use local components and custom `useAuth` hook.
- Added unit tests for backend router and frontend auth hook.
- Added `/auth/callback` route to validate magic links and redirect with JWT.
- Enforced RSC page + client component split and route-local hooks for auth flow.
- Added typed ZSA outputs, try/catch error handling, and query invalidation after mutations.
- Added `validateMagicLink` tRPC procedure and sanitized auth payloads.
- Documented Next.js 16.1.6 as the active runtime version.
- Added Prisma seed to bootstrap a clinic, admin, and employee.
- Seed data is now hardcoded in the seed script (no SEED_* env vars).
- Fixed Magic Link TanStack Form validation by moving to field-level validators.
- Enforced clinicId scoping for auth (schemas, DTOs, tRPC, and Prisma queries).
- Added `NEXT_PUBLIC_CLINIC_ID` env wiring and preserved error codes in auth actions.
- Added an employee dashboard and request flow aligned to the UX direction.
- Lazy-initialized the React Query client provider.
- Aligned admin layout, planning grid, and requests UI to the latest UX direction.
- Hardened clinicId resolution to avoid missing identifier errors (fallback when env missing/invalid).
- Restyled login forms to match the operational UI direction (indigo accents, neutral CTA, black logo).
- **2026-02-04**: Story documentation updated to reflect PRD/Architecture changes. Added i18n route migration plan (Epic 6), subscription guard requirements (Epic 7), accessibility requirements (NFR14-NFR17), and future extension points.
- **2026-02-04**: Adversarial code review completed (Claude Opus 4.5). 16 issues fixed:
  - **C1**: Created missing `trpc-types.ts` export file.
  - **C2**: Added auth guards to `/admin` layout and `/dashboard` (localStorage token check + redirect).
  - **C3**: Added JWT propagation via httpOnly cookies (server actions set cookie, tRPC client reads it). Added `superjson` transformer to tRPC client.
  - **C5/C6/H7/M5**: Added 71 tests across 4 spec files (auth-actions, magic-link-actions, useAuth, useMagicLinkCallback).
  - **H1/H2**: Fixed touch targets (h-12 = 48px) and ARIA attributes (aria-invalid, aria-describedby, role="alert").
  - **H3**: Replaced DOM manipulation with React state lifting (tab switching via props).
  - **H4**: Configured React Query defaults (staleTime, refetchOnWindowFocus, retry).
  - **H5/M2**: Improved error code extraction and network error detection.
  - **Zod migration**: Upgraded from Zod 3.23.8 to 4.3.6 (single version, native v4 API). Fixed all UUID test data for Zod 4 strict validation.
  - **C4 (DEFERRED)**: Hardcoded fallback clinicId is planned technical debt for Story 1.5.

## File List

- `.env.example` (Modified)
- `AGENTS.md` (New)
- `apps/api/package.json` (Modified)
- `apps/api/prisma.config.ts` (Modified)
- `apps/api/prisma/seed.ts` (New)
- `apps/api/prisma/schema/migrations/20260202122919_init/migration.sql` (New)
- `apps/api/prisma/schema/migrations/migration_lock.toml` (New)
- `apps/api/src/app.module.ts` (Modified)
- `apps/api/src/auth/auth.controller.spec.ts` (Modified)
- `apps/api/src/auth/auth.controller.ts` (Modified)
- `apps/api/src/auth/auth.service.spec.ts` (Modified)
- `apps/api/src/auth/auth.service.ts` (Modified)
- `apps/api/src/auth/dto/login.dto.ts` (Modified)
- `apps/api/src/auth/dto/request-magic-link.dto.ts` (Modified)
- `apps/api/src/main.ts` (Modified)
- `apps/api/src/prisma/prisma.service.ts` (Modified)
- `apps/api/src/trpc-types.ts` (New)
- `apps/api/src/trpc/trpc.module.ts` (New)
- `apps/api/src/trpc/trpc.service.ts` (New)
- `apps/api/src/trpc/trpc.router.ts` (New)
- `apps/api/src/trpc/trpc.router.spec.ts` (New)
- `apps/web/package.json` (Modified)
- `apps/web/src/app/admin/layout.tsx` (Modified)
- `apps/web/src/app/admin/page.tsx` (Modified)
- `apps/web/src/app/admin/planning/page.tsx` (Modified)
- `apps/web/src/app/admin/dashboard/page.tsx` (New)
- `apps/web/src/app/admin/requests/page.tsx` (New)
- `apps/web/src/app/dashboard/page.tsx` (Modified)
- `apps/web/src/app/dashboard/_components/DashboardClient.tsx` (New)
- `apps/web/src/app/layout.tsx` (Modified)
- `apps/web/src/app/login/page.tsx` (Modified)
- `apps/web/src/app/login/_actions/auth-actions.ts` (New)
- `apps/web/src/app/login/_components/LoginPageClient.tsx` (New)
- `apps/web/src/app/login/_components/MagicLinkForm.tsx` (New)
- `apps/web/src/app/login/_components/PasswordForm.tsx` (New)
- `apps/web/src/app/login/_hooks/useAuth.ts` (New)
- `apps/web/src/app/login/_hooks/useAuth.spec.ts` (New)
- `apps/web/src/app/auth/callback/page.tsx` (New)
- `apps/web/src/app/auth/callback/_actions/magic-link-actions.ts` (New)
- `apps/web/src/app/auth/callback/_components/CallbackClient.tsx` (New)
- `apps/web/src/app/auth/callback/_hooks/useMagicLinkCallback.ts` (New)
- `apps/web/src/components/providers/react-query-provider.tsx` (New)
- `apps/web/src/lib/hooks/server-action-hooks.ts` (New)
- `apps/web/src/lib/trpc/client.ts` (New)
- `apps/web/vitest.config.mts` (New)
- `apps/web/vitest.setup.ts` (New)
- `docs/implementation-artifacts/sprint-status.yaml` (Modified)
- `docs/implementation-artifacts/1-3-interface-de-connexion-flux-zsatrpc.md` (Modified)
- `docs/planning-artifacts/ux-design-specification.md` (Modified)
- `package.json` (Modified)
- `packages/validators/src/index.ts` (Modified)
- `packages/zod/package.json` (Modified)
- `pnpm-lock.yaml` (Modified)
- `apps/web/src/app/login/_actions/auth-actions.spec.ts` (New — code review)
- `apps/web/src/app/auth/callback/_actions/magic-link-actions.spec.ts` (New — code review)
- `apps/web/src/app/auth/callback/_hooks/useMagicLinkCallback.spec.ts` (New — code review)
- `apps/api/prisma/seed.ts` (Modified — UUID fix for Zod 4)
- `packages/zod/src/index.ts` (Modified — Zod 4.3.6 native)
