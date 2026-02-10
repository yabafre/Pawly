# Story 5.3: Clinic Configuration (Hours & Days)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to configure my clinic's operational settings,
so that the planning engine respects our specific schedule.

## Acceptance Criteria

1. **Given** the clinic configuration interface, **When** I set default work hours and work days for my clinic, **Then** the values are validated and saved to clinic-scoped configuration data.
2. **Given** the clinic configuration interface, **When** I add closed days (holidays, annual closures), **Then** those dates are persisted as blocking clinic-level constraints.
3. **Given** the clinic configuration interface, **When** I add special days (reduced or extended schedule), **Then** those date-specific overrides are persisted and linked to the clinic.
4. **Given** any read or write on clinic configuration data, **When** the request is executed, **Then** the operation is strictly scoped to the authenticated admin's `clinicId`.
5. **Given** invalid inputs (invalid time format, end time before start time, duplicate or invalid dates), **When** I submit the form, **Then** inline validation errors are shown and no mutation is executed.
6. **Given** a successful update, **When** the mutation completes, **Then** related queries are invalidated and localized success feedback is shown.
7. **Given** planning logic consumes base clinic constraints, **When** planning reads clinic configuration, **Then** work days, default hours, closed days, and special-day overrides are available in a normalized shape for downstream hard-rule processing.
8. **Given** FR/EN locales, **When** I use this feature, **Then** all user-facing strings are translated and the interface follows the Clinique Zen conventions with WCAG AA-compliant interactions.

## Tasks / Subtasks

- [x] **Task 1: Extend operational clinic data model** (AC: #1, #2, #3, #4, #7)
  - [x] 1.1 Add Prisma models for clinic-level closure dates and special-day overrides (date-specific hours), both scoped by `clinicId`.
  - [x] 1.2 Add uniqueness/index constraints for date queries (e.g., per clinic, one closure or special override per date).
  - [x] 1.3 Keep `ClinicConfig` as the base container for `workDays` and default hours; avoid duplicating existing onboarding schema fields.
  - [x] 1.4 Run `pnpm db:generate` and `pnpm db:push` from repository root.

- [x] **Task 2: Extend shared validators for operational configuration** (AC: #1, #2, #3, #5)
  - [x] 2.1 Create/extend clinic validators for full operational payload: `workDays`, `defaultStartTime`, `defaultEndTime`, `closedDays`, `specialDays`.
  - [x] 2.2 Enforce cross-field and collection validation: valid `HH:MM`, end > start, no duplicate dates, valid date formats.
  - [x] 2.3 Export new schemas/types through `packages/validators/src/clinic/index.ts` and `packages/validators/src/index.ts`.

- [x] **Task 3: Implement NestJS clinic operational config service methods** (AC: #1, #2, #3, #4, #7)
  - [x] 3.1 Add service methods to read/write full operational settings in a transaction (base config + closures + special overrides).
  - [x] 3.2 Ensure all reads and writes are clinic-scoped using authenticated `clinicId`.
  - [x] 3.3 Return normalized data shape suitable for planning consumption (base defaults + date-level constraints).

- [x] **Task 4: Expose clinic operational procedures via tRPC** (AC: #1, #2, #3, #4, #7)
  - [x] 4.1 Add or extend clinic router procedures for reading/updating operational configuration.
  - [x] 4.2 Validate all inputs with shared Zod schemas from `@pawly/validators`.
  - [x] 4.3 Keep procedure authorization with existing `subscribedProcedure` pattern.

- [x] **Task 5: Implement web server actions and hooks** (AC: #4, #5, #6)
  - [x] 5.1 Create route-local server actions for operational config read/update in admin area.
  - [x] 5.2 Add hook wrappers with `useServerActionQuery` / `useServerActionMutation`.
  - [x] 5.3 Use deterministic query keys and invalidate related clinic/planning keys after successful mutations.

- [x] **Task 6: Build admin clinic configuration UI** (AC: #1, #2, #3, #5, #6, #8)
  - [x] 6.1 Add a dedicated clinic operational settings surface in admin planning domain.
  - [x] 6.2 Implement form sections for work days/hours, closed days list, and special-day override list.
  - [x] 6.3 Provide inline validation and localized messages/toasts in FR/EN with accessible interactions (keyboard and error semantics).

- [x] **Task 7: Integrate planning-facing operational config contract** (AC: #7)
  - [x] 7.1 Ensure backend contract exposes operational settings in a structure directly consumable by future planning generation stories.
  - [x] 7.2 Keep derivation logic server-side; do not duplicate planning-rule derivation in client components.

- [x] **Task 8: Add tests and regression guards** (AC: all)
  - [x] 8.1 Validators tests for valid and invalid operational payloads (times, dates, duplicates).
  - [x] 8.2 Clinic service tests for transactionality, clinic scoping, and normalized output.
  - [x] 8.3 tRPC clinic router tests for auth/subscription behavior and input validation.
  - [x] 8.4 Web tests for configuration UI rendering, validation errors, mutation success flows, and query invalidation.
  - [x] 8.5 Run root quality gates: `pnpm test` and `pnpm build`.

## Dev Notes

This story formalizes clinic-level operational constraints after onboarding. Story 3.3 introduced initial setup (`workDays`, default hours, shift types), while Story 5.3 adds an explicit admin-managed operational configuration surface and persistence for calendar-level closures and special-day overrides. The implementation must preserve strict clinic isolation and produce a planning-ready contract for downstream hard-rule processing.

### Technical Requirements

- Reuse existing clinic configuration baseline from Story 3.3:
  - `ClinicConfig` already stores `workDays`, `defaultStartTime`, `defaultEndTime`.
  - `ClinicShiftType` already stores clinic-scoped shift catalog.
- Extend data model for date-level operational exceptions:
  - `ClosedDay` (clinic-wide blocking date, optional reason).
  - `SpecialDay` (date-specific override of operating hours, optional label/reason).
  - Both must include `clinicId` FK and be enforced with per-clinic date uniqueness.
- Validation rules (shared Zod in `@pawly/validators`):
  - Time format strictly `HH:MM`.
  - `defaultEndTime > defaultStartTime`; same rule for special-day override times.
  - `workDays` must be non-empty and values restricted to existing `WORK_DAYS`.
  - Dates must be valid ISO dates and unique within each payload list.
- Transactional update contract:
  - Operational update endpoint writes base config + closure list + special-day list in one transaction.
  - Replace-list semantics should be explicit (e.g., delete existing clinic rows then insert submitted list) to avoid drift.
- Multi-tenancy and security:
  - Every read/write derives clinic scope from authenticated `ctx.user.clinicId`.
  - No client-provided `clinicId` accepted in input payloads.
- Planning-facing output contract:
  - Backend returns normalized shape combining:
    - base weekly defaults (`workDays`, `defaultStartTime`, `defaultEndTime`)
    - date-level hard blocks (`closedDays`)
    - date-level schedule overrides (`specialDays`)
  - This contract must be server-authored for future planning stories (do not derive in frontend).

### Architecture Compliance (NON-NEGOTIABLE)

Mandatory end-to-end flow must remain unchanged:

```text
Page (RSC) -> Client Component -> Hook -> Zsa Hook -> Server Action -> tRPC Client -> NestJS Service -> Prisma
```

- No direct Prisma access from `apps/web`.
- No direct tRPC calls from client components; only through route-local server actions.
- Keep clinic business logic in `apps/api/src/modules/clinic/clinic.service.ts` (do not spread domain logic into router handlers).
- All tRPC procedures must validate input with schemas from `@pawly/validators`.
- Keep auth/subscription semantics aligned with existing clinic router patterns:
  - read/write clinic operational config behind `subscribedProcedure`
  - do not break onboarding access behavior that currently uses `protectedProcedure` for onboarding status/completion.
- Preserve strict clinic tenancy:
  - scope all queries by `ctx.user.clinicId`
  - reject any design that relies on client-passed clinic identifiers.
- Mutations must invalidate relevant React Query keys through existing `QueryKeyFactory` patterns.

### Library & Framework Requirements

- **Prisma (project pinned to `7.2.0`)**
  - Keep schema-folder conventions in `apps/api/prisma/schema/`.
  - Use explicit relation mappings and model-level uniqueness/indexes for clinic/date lookups.
  - Maintain UTC-safe date persistence and convert only at UI boundaries.
- **NestJS (project baseline `11.x`)**
  - Keep clinic operational logic in `ClinicService`.
  - Use typed exceptions (`NotFoundException`, `BadRequestException`, `ConflictException`) for predictable tRPC error surfaces.
  - Keep transactional writes for multi-entity updates.
- **tRPC (`11.x`)**
  - Continue procedure validation with shared Zod schemas.
  - Keep auth/subscription middleware layering consistent (`protectedProcedure`, `subscribedProcedure`).
  - Security note: known tRPC v11 WebSocket DoS issue was patched in `v11.1.1`; project version (`11.9.0`) remains above patched baseline.
- **Zod via `@pawly/zod` (`zod` override `4.3.6`)**
  - Single source of truth for operational config contracts in `packages/validators`.
  - Avoid ad-hoc route-level validation logic.
- **Next.js (`16.x`) + next-intl (`4.x`)**
  - Keep locale-aware admin routes under `app/[locale]/admin`.
  - Follow `proxy.ts`-based locale routing and existing layout guards.
  - Security note: Next.js RSC RCE advisory patched in `16.0.7`; project version (`16.1.6`) is above patched baseline.
- **TanStack Form (`@tanstack/react-form` 1.x), Zsa, React Query**
  - Form state must remain in TanStack Form (not Zustand/local-only state).
  - Reads: `useServerActionQuery`; writes: `useServerActionMutation`.
  - Invalidate clinic/planning keys after successful mutations.
- **UI stack**
  - Tailwind v4 + shadcn/ui + Lucide + Sonner.
  - Preserve Clinique Zen conventions and WCAG AA interactions for operational settings forms.

### File Structure Requirements

**Files to create:**

```text
packages/validators/src/clinic/
  operational-config.schema.ts
  operational-config.schema.test.ts

apps/web/src/app/[locale]/admin/planning/_actions/
  clinic-operational-config-actions.ts

apps/web/src/app/[locale]/admin/planning/_hooks/
  useClinicOperationalConfig.ts

apps/web/src/app/[locale]/admin/planning/_components/
  ClinicOperationalConfigPanel.tsx
  ClosedDaysFieldArray.tsx
  SpecialDaysFieldArray.tsx

apps/web/src/app/[locale]/admin/planning/__tests__/
  clinic-operational-config-panel.spec.tsx

apps/api/src/trpc/routers/
  clinic.router.spec.ts
```

**Files to modify:**

- `apps/api/prisma/schema/ClinicConfig.prisma` (or add a dedicated schema file under the same folder for new clinic operational models if preferred by team convention)
- `packages/validators/src/clinic/index.ts`
- `packages/validators/src/index.ts`
- `apps/api/src/modules/clinic/clinic.service.ts`
- `apps/api/src/modules/clinic/clinic.service.spec.ts`
- `apps/api/src/trpc/routers/clinic.router.ts`
- `apps/web/src/lib/hooks/server-action-hooks.ts`
- `apps/web/src/i18n/langs/en.json`
- `apps/web/src/i18n/langs/fr.json`

**Structure constraints:**

- Keep all admin-planning web artifacts route-local under `app/[locale]/admin/planning/*` (no cross-domain leakage into employees/onboarding folders).
- Keep Prisma model declarations in schema-folder structure under `apps/api/prisma/schema/`.
- Keep root scripts delegating to Turborepo tasks only (`turbo run ...`); do not add package-specific logic to root scripts.

### Testing Requirements

**Validators (Vitest, `*.test.ts`):**

- accept valid operational payloads containing weekly defaults, closed days, and special days
- reject invalid `HH:MM` formats and end-before-start ranges (default and special-day level)
- reject invalid dates and duplicate dates within closure/override lists
- reject invalid `workDays` values and empty-day selections

**API service tests (Jest, `*.spec.ts`):**

- read/write operations are always scoped to `clinicId` from authenticated context
- transactional update replaces closure/override lists atomically and leaves no stale rows
- invalid merged ranges (including partial updates if applicable) are rejected with typed exceptions
- normalized output contract includes defaults + closed days + special-day overrides in planning-ready shape

**tRPC router tests (Jest, `*.spec.ts`):**

- auth/subscription middleware behavior stays correct (`subscribedProcedure` for operational read/write)
- input validation failures return typed tRPC errors via shared validators
- router forwards `ctx.user.clinicId` and never accepts client-provided clinic identifiers

**Web tests (Vitest, `*.spec.tsx`):**

- panel renders with loading/empty/populated states for clinic operational config
- inline validation errors block submission for invalid times/dates/duplicates
- successful mutation flow triggers localized success feedback and query invalidation
- list editors for closed days and special days support add/edit/remove without state leakage between items
- FR/EN rendering assertions for key labels and validation messages

**Quality gates before PR (run from repository root):**

- `pnpm test`
- `pnpm build`
- `pnpm lint`

### Previous Story Intelligence (Story 5.2)

- Story 5.2 established the employee-constraint pipeline end-to-end (validators -> service -> router -> server actions -> hooks -> panel/form), which should be mirrored for clinic-level operational constraints rather than introducing a parallel architecture.
- Two high-priority review fixes from Story 5.2 must directly inform this story:
  - reset local form/panel state when dialogs close to prevent stale edit-context reuse across entities
  - validate merged date ranges on partial updates (not only when both dates are provided in one payload)
- Query key correctness and explicit invalidation were critical in recent employee work; reuse deterministic key patterns (including clinic/planning dimensions) to avoid stale reads after mutations.
- Keep strict clinic isolation as non-negotiable: all writes/reads derive scope from `ctx.user.clinicId` and never from client payload.
- Preserve inline validation and localized feedback semantics already adopted in Story 5.2 to avoid silent form failures and inconsistent action messaging.
- Testing lesson from prior stories: if route/query-state helpers are involved, ensure tests include required adapters/providers to prevent false negatives caused by missing runtime context.

### Git Intelligence Summary

Recent relevant commit trajectory:

- `6ce028e3` — `fix: reset constraint panel state and validate partial date updates`
- `7b4070e5` — `feat(story-5-2): mark declarative constraints configuration as complete`
- `c9ce455c` — `feat(story-5-2): finalize declarative constraints implementation`
- `44b99e94` — `fix: address review findings for employee management`
- `826dab18` — `feat: Introduce nuqs for URL-synced employee list filters...`

Actionable implications for Story 5.3:

- Expect review scrutiny on state hygiene in complex admin forms/dialogs; explicitly reset or reinitialize local editing state when context changes.
- Service-level validation must protect invariants even for partial mutation payloads; do not rely only on full-payload happy paths.
- Follow the established cross-layer implementation style from Story 5.2 (schema + validators + service + router + server actions + hooks + UI + tests) for consistency and easier review.
- Keep query cache semantics explicit and deterministic; include clinic/planning dimensions in invalidation targets.
- Reuse existing quality-gate discipline from recent work (lint/test/build + schema generation/push when schema changes occur).

### Latest Tech Information (Context7 + Applied Skills)

- **Prisma (Context7 `/prisma/docs`)**
  - Prefer composite uniqueness for tenant/date constraints (e.g., one closure or special override per clinic/date via `@@unique([clinicId, date])`).
  - Add tenant/date indexes to optimize operational lookups used by planning reads.
  - For replace-list mutations (`deleteMany` + `createMany`), keep a single transaction boundary; if concurrency risk appears, use retry logic for serialization conflicts (`P2034` guidance).
- **NestJS (Context7 `/nestjs/docs.nestjs.com`)**
  - Keep controllers/routers thin and delegate domain logic to `ClinicService`.
  - Continue typed exception usage (`NotFoundException`, `BadRequestException`, `ConflictException`) for predictable error mapping to clients.
  - Use constructor injection and feature-module boundaries, consistent with current module structure.
- **Next.js/React guardrails (applied from `vercel-react-best-practices` + `frontend-design`)**
  - Avoid client-side data waterfalls by keeping server actions as the data bridge and parallelizing independent requests where needed.
  - Keep operational forms focused and route-local to minimize bundle impact and reduce cross-route coupling.
  - Preserve Clinique Zen accessibility baselines (keyboard navigation, clear error semantics, localized feedback) while keeping interaction density manageable on admin screens.
- **Turborepo guardrails (applied from `turborepo` skill)**
  - Maintain package-level scripts and root delegation through Turbo; no task logic drift into root scripts.
  - Run quality checks from monorepo root to preserve pipeline consistency.
- **Stripe integration guardrails (Context7 `/websites/stripe` + `stripe-best-practices`)**
  - This story does not add payment behavior, but must not regress platform subscription assumptions:
    - webhook signature verification remains mandatory
    - webhook events remain the subscription source of truth
    - idempotent event processing remains enforced
  - Keep any admin access assumptions aligned with existing subscription-gated middleware behavior (no client-side entitlement source of truth).

### Project Structure Notes

- No `project-context.md` was discovered during input analysis; implementation context is derived from planning artifacts, current codebase, and Story 5.2 history.
- Existing code placement shows a temporary mismatch with architecture intent:
  - operational clinic procedures currently sit in onboarding-oriented clinic surfaces (`clinic.router.ts`, onboarding actions/hooks)
  - Story 5.3 should add planning-admin operational configuration surfaces under `app/[locale]/admin/planning/*` while reusing the same backend clinic domain
- Planning route currently contains placeholder/demo client state and needs migration toward server-driven clinic config data flow for this story.
- Naming and module boundaries should remain consistent with established patterns:
  - validators in `packages/validators/src/clinic/*`
  - service logic in `apps/api/src/modules/clinic/clinic.service.ts`
  - transport in `apps/api/src/trpc/routers/clinic.router.ts`
  - web bridge via route-local server actions and hooks
- Root-level command discipline is mandatory in this monorepo: run `pnpm` workflows from repository root only.

### References

- [Source: /Users/fredyaba/Documents/web-dev/Pawly/docs/planning-artifacts/epics.md#Epic 5: Staff Management & Clinic Configuration]
- [Source: /Users/fredyaba/Documents/web-dev/Pawly/docs/planning-artifacts/prd.md#FR3, FR7, NFR6, NFR14]
- [Source: /Users/fredyaba/Documents/web-dev/Pawly/docs/planning-artifacts/architecture.md#Data Flow (Non-Negotiable), Data Architecture, Authentication & Security, Frontend Architecture]
- [Source: /Users/fredyaba/Documents/web-dev/Pawly/docs/planning-artifacts/ux-design-specification.md#Clinique Zen, Accessibility and interaction principles]
- [Source: /Users/fredyaba/Documents/web-dev/Pawly/docs/implementation-artifacts/5-2-declarative-constraints-configuration.md#Previous story learnings and guardrails]
- [Source: /Users/fredyaba/Documents/web-dev/Pawly/docs/implementation-artifacts/sprint-status.yaml#development_status]
- [Source: /Users/fredyaba/Documents/web-dev/Pawly/apps/api/prisma/schema/ClinicConfig.prisma]
- [Source: /Users/fredyaba/Documents/web-dev/Pawly/apps/api/src/modules/clinic/clinic.service.ts]
- [Source: /Users/fredyaba/Documents/web-dev/Pawly/apps/api/src/trpc/routers/clinic.router.ts]
- [Source: /Users/fredyaba/Documents/web-dev/Pawly/packages/validators/src/clinic/onboarding.schema.ts]
- [Source: /Users/fredyaba/Documents/web-dev/Pawly/apps/web/src/app/[locale]/admin/planning/page.tsx]
- [Source: /Users/fredyaba/Documents/web-dev/Pawly/apps/web/src/lib/hooks/server-action-hooks.ts]
- [Source: Context7 `/prisma/docs`, `/nestjs/docs.nestjs.com`, `/websites/stripe`]

### Story Completion Status

- Story status confirmed: `ready-for-dev`.
- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story file is fully contexted for `dev-story` execution with architecture, testing, and guardrail requirements.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- Context7 research was consulted for Prisma/NestJS/Stripe guardrails before implementation.
- Skills applied during implementation: `turborepo`, `vercel-react-best-practices`, `frontend-design`, `nestjs-best-practices`, `stripe-best-practices`.
- Database and quality commands run from repository root: `pnpm db:generate`, `pnpm db:push`, `pnpm test`, `pnpm build`, `pnpm lint`.
- Additional targeted test runs executed for new validators/API/web modules before full regression.
- `agent-browser` validation was attempted but blocked by runtime environment (`Daemon failed to start`), so visual verification could not be completed in this session.

### Completion Notes List

- Implemented clinic operational configuration end-to-end across Prisma, validators, NestJS service, tRPC router, and web planning route-local actions/hooks/UI.
- Added normalized planning-facing contract output (weekly defaults + closed days + special days) fully scoped by authenticated `clinicId`.
- Added/updated coverage for validators, clinic service, clinic router, and planning panel behavior; full regression/build/lint gates are green.
- Story and sprint status are updated to `review`.

### File List

- `apps/api/prisma/schema/Clinic.prisma`
- `apps/api/prisma/schema/ClinicConfig.prisma`
- `apps/api/src/modules/clinic/clinic.service.ts`
- `apps/api/src/modules/clinic/clinic.service.spec.ts`
- `apps/api/src/trpc/routers/clinic.router.ts`
- `apps/api/src/trpc/routers/clinic.router.spec.ts`
- `apps/web/src/app/[locale]/admin/planning/page.tsx`
- `apps/web/src/app/[locale]/admin/planning/_actions/clinic-operational-config-actions.ts`
- `apps/web/src/app/[locale]/admin/planning/_hooks/useClinicOperationalConfig.ts`
- `apps/web/src/app/[locale]/admin/planning/_components/ClinicOperationalConfigPanel.tsx`
- `apps/web/src/app/[locale]/admin/planning/_components/ClosedDaysFieldArray.tsx`
- `apps/web/src/app/[locale]/admin/planning/_components/SpecialDaysFieldArray.tsx`
- `apps/web/src/app/[locale]/admin/planning/__tests__/clinic-operational-config-panel.spec.tsx`
- `apps/web/src/i18n/langs/en.json`
- `apps/web/src/i18n/langs/fr.json`
- `apps/web/src/lib/hooks/server-action-hooks.ts`
- `packages/validators/src/clinic/operational-config.schema.ts`
- `packages/validators/src/clinic/operational-config.schema.test.ts`
- `packages/validators/src/clinic/index.ts`
- `docs/implementation-artifacts/5-3-clinic-configuration-hours-days.md`
- `docs/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-02-10: Implemented Story 5.3 clinic operational configuration across API/web/validators with normalized planning contract and clinic-scoped transactional updates.
- 2026-02-10: Added comprehensive validator/service/router/web tests and completed root quality gates (`pnpm test`, `pnpm build`, `pnpm lint`).
