# Story 5.2: Declarative Constraints Configuration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to define recurring unavailabilities for employees,
So that the planning engine does not assign shifts during blocked periods.

## Acceptance Criteria

1. **Given** a specific employee profile **When** I create a one-time unavailability constraint (startDate, endDate, type, optional reason) **Then** the constraint is saved in the `Unavailability` model with the authenticated admin's `clinicId` and selected `employeeId`.

2. **Given** a specific employee profile **When** I create a recurring unavailability constraint **Then** the constraint is saved in `Unavailability` with recurrence metadata (`daysOfWeek`) and a validity window (`startDate`, `endDate`) that can be expanded by downstream planning logic.

3. **Given** any create, read, update, or delete operation on constraints **When** the operation is executed **Then** all queries are scoped by authenticated `clinicId` and cross-clinic access is rejected.

4. **Given** the employee management interface **When** I open an employee constraint panel **Then** I can list, add, edit, and delete constraints and see recurrence mode, date window, type, and reason.

5. **Given** the planning domain consumes constraint data **When** hard-rule constraints are requested for a date range **Then** all employee unavailabilities (one-time and recurring-expanded) are returned as `ruleType: "HARD"` inputs for algorithm blocking logic.

6. **Given** invalid payloads (endDate before startDate, invalid recurrence weekday, missing required fields) **When** I submit the form **Then** inline validation errors are shown and no mutation is executed.

7. **Given** successful mutations **When** create/update/delete completes **Then** relevant queries are invalidated and localized success toasts are shown with correct action semantics.

8. **Given** FR/EN locales **When** I use this feature **Then** all UI strings are translated and components follow the Clinique Zen design conventions and WCAG AA accessibility.

## Tasks / Subtasks

- [x] **Task 1: Extend Prisma schema for recurring constraints** (AC: #1, #2, #5)
  - [x] 1.1 Update `apps/api/prisma/schema/Employee.prisma` `Unavailability` model with `daysOfWeek Int[] @default([]) @map("days_of_week")`
  - [x] 1.2 Add/adjust indexes for common lookups (`clinicId`, `employeeId`, `startDate`, `endDate`)
  - [x] 1.3 Run `pnpm db:push` from repo root
  - [x] 1.4 Run `pnpm db:generate` from repo root

- [x] **Task 2: Add shared validators for unavailability constraints** (AC: #1, #2, #6)
  - [x] 2.1 Create `packages/validators/src/employee/unavailability.schema.ts`
  - [x] 2.2 Define schemas: `createUnavailabilitySchema`, `updateUnavailabilitySchema`, `unavailabilityIdSchema`, `listUnavailabilitiesSchema`, `hardRuleRangeSchema`
  - [x] 2.3 Add cross-field validation (`endDate >= startDate`, `daysOfWeek` in 1..7, recurring mode inference)
  - [x] 2.4 Export from `packages/validators/src/employee/index.ts` and `packages/validators/src/index.ts`

- [x] **Task 3: Implement NestJS service logic in employee domain** (AC: #1, #2, #3, #5)
  - [x] 3.1 Extend `apps/api/src/modules/employee/employee.service.ts` with `listConstraints`, `createConstraint`, `updateConstraint`, `deleteConstraint`
  - [x] 3.2 Add range-expansion helper for recurring constraints to produce planning hard-rule windows
  - [x] 3.3 Enforce clinic ownership checks via existing employee lookup pattern (`findById(clinicId, employeeId)`)

- [x] **Task 4: Expose tRPC procedures for constraints** (AC: #3, #5)
  - [x] 4.1 Extend `apps/api/src/trpc/routers/employee.router.ts` with procedures: `listConstraints`, `createConstraint`, `updateConstraint`, `deleteConstraint`, `listHardRules`
  - [x] 4.2 Apply `subscribedProcedure` and shared validators on all procedures
  - [x] 4.3 Cover multi-tenant and auth behavior in router tests

- [x] **Task 5: Create server actions for web app** (AC: #3, #7)
  - [x] 5.1 Create `apps/web/src/app/[locale]/admin/employees/_actions/employee-constraint-actions.ts`
  - [x] 5.2 Implement action wrappers for all constraint procedures via `createServerAction()` + `trpc.employee.*`

- [x] **Task 6: Create web hooks for constraints** (AC: #4, #7)
  - [x] 6.1 Create `apps/web/src/app/[locale]/admin/employees/_hooks/useEmployeeConstraints.ts`
  - [x] 6.2 Add query keys for constraint lists and invalidate on mutation success
  - [x] 6.3 Ensure toast messages are semantically correct for create/update/delete flows

- [x] **Task 7: Build employee constraint management UI** (AC: #4, #6, #8)
  - [x] 7.1 Add a "Manage Constraints" entry point from employee cards/list
  - [x] 7.2 Create `EmployeeConstraintsPanel` (list + actions) and `EmployeeConstraintForm` (one-time + recurring)
  - [x] 7.3 Add inline validation feedback and accessible form semantics (`aria-invalid`, alert messaging)

- [x] **Task 8: Integrate hard-rule projection contract** (AC: #5)
  - [x] 8.1 Define normalized output shape for planning consumption (`ruleType: "HARD"`, employeeId, blocked windows)
  - [x] 8.2 Keep projection logic server-side (no frontend rule derivation)

- [x] **Task 9: Add i18n translations** (AC: #8)
  - [x] 9.1 Add `employees.constraints` namespace keys in `apps/web/src/i18n/langs/en.json`
  - [x] 9.2 Add equivalent keys in `apps/web/src/i18n/langs/fr.json`

- [x] **Task 10: Add comprehensive tests and regression guards** (AC: all)
  - [x] 10.1 Validators: `unavailability.schema.test.ts` for valid/invalid one-time and recurring payloads
  - [x] 10.2 API service: unit tests for clinic isolation, CRUD, recurring expansion, hard-rule projection
  - [x] 10.3 tRPC router: tests for auth/subscription guards and input validation
  - [x] 10.4 Web: component/hook tests for constraint panel form behaviors and mutation feedback
  - [x] 10.5 Ensure `nuqs`-using tests are wrapped with adapter context to avoid runtime test crashes

## Dev Notes

This story extends the completed employee CRUD baseline (Story 5.1) by introducing declarative constraint management tied to each employee profile. Keep implementation incremental: reuse existing employee module/router/web patterns, avoid creating parallel infrastructure, and preserve strict multi-tenant boundaries.

### Technical Requirements

- `Unavailability` remains the blocking constraint source for planning (hard-rule semantics by model intent).
- Add recurrence metadata directly on `Unavailability`:
  - `daysOfWeek Int[] @default([]) @map("days_of_week")`
  - Interpretation:
    - `daysOfWeek.length === 0` -> one-time range (`startDate` to `endDate`)
    - `daysOfWeek.length > 0` -> recurring weekly constraint active between `startDate` and `endDate`
- Keep `UnavailabilityType` enum usage explicit (`SCHOOL`, `VACATION`, `SICK`, `OTHER`) and expose friendly labels in UI.
- Validation rules (shared Zod):
  - `startDate` and `endDate` are required ISO datetime strings
  - `endDate >= startDate`
  - `daysOfWeek` values must be unique integers in `[1..7]`
  - recurring mode requires non-empty `daysOfWeek`
- Multi-tenancy and ownership:
  - every constraint query filters by `clinicId`
  - every mutation validates employee belongs to same clinic before write
- Hard-rule projection contract for planning:
  - server-side function expands recurring constraints in requested date window
  - output includes `ruleType: "HARD"`, `employeeId`, `type`, and resolved blocked intervals
- Keep dates stored in UTC; convert only at display boundaries in frontend.

### Architecture Compliance (NON-NEGOTIABLE)

**Mandatory data flow (no shortcuts):**

```text
Page (RSC) -> Client Component -> Custom Hook -> Zsa Hook -> Server Action -> tRPC Client -> NestJS Service -> Prisma
```

- Do not call tRPC directly from client components.
- Keep service business logic in `apps/api/src/modules/employee/employee.service.ts`.
- Keep procedure composition local in router (`protectedProcedure` + `subscribedProcedure`) as done in `clinic.router.ts` and `employee.router.ts`.
- Use server action wrappers (`createServerAction`) as the only web-to-API bridge.
- Keep cache invalidation centralized through React Query keys; never use Zustand for server state.
- Preserve subscription guard assumptions: admin employee management remains behind `subscribedProcedure`.

### Library and Framework Requirements

- **Prisma (7.2.0 project baseline):**
  - Use schema-folder conventions already in place.
  - Prefer explicit indexes for high-frequency filters (`clinicId`, `employeeId`, date range).
  - Use enums and mapped fields consistently with existing naming conventions.
- **NestJS (v11 baseline):**
  - Keep logic in injectable service providers.
  - Throw typed HTTP exceptions (`NotFoundException`, `BadRequestException`, `ConflictException`) for predictable tRPC error mapping.
- **tRPC + Zod validators:**
  - Every procedure input validated via `@pawly/validators`.
  - No inline ad-hoc parsing in router handlers.
- **Zsa + React Query:**
  - Use `useServerActionQuery` / `useServerActionMutation` and invalidate related keys on mutation success.
- **TanStack Form + sonner + next-intl:**
  - Inline validation errors for all constraint form failures.
  - Localized toasts for successful actions.
- **nuqs:**
  - If URL-driven filters are used for constraint lists, ensure provider context exists and tests include adapter wrappers.
- **Stripe plugin guidance (project-wide guardrail):**
  - No Stripe changes are required in this story, but keep the established source-of-truth rule (subscription state from verified webhooks only) unchanged while adding employee constraint features.

### File Structure Requirements

**Files to create:**

```text
packages/validators/src/employee/
  unavailability.schema.ts
  unavailability.schema.test.ts

apps/web/src/app/[locale]/admin/employees/_actions/
  employee-constraint-actions.ts

apps/web/src/app/[locale]/admin/employees/_hooks/
  useEmployeeConstraints.ts

apps/web/src/app/[locale]/admin/employees/_components/
  EmployeeConstraintsPanel.tsx
  EmployeeConstraintForm.tsx

apps/web/src/app/[locale]/admin/employees/__tests__/
  employee-constraints-panel.spec.tsx
```

**Files to modify:**

- `apps/api/prisma/schema/Employee.prisma` (recurrence metadata + indexes)
- `packages/validators/src/employee/index.ts` (export new schemas)
- `packages/validators/src/index.ts` (barrel export)
- `apps/api/src/modules/employee/employee.service.ts` (constraint CRUD + hard-rule projection)
- `apps/api/src/modules/employee/employee.service.spec.ts` (new service coverage)
- `apps/api/src/trpc/routers/employee.router.ts` (new procedures)
- `apps/api/src/trpc/routers/employee.router.spec.ts` (router coverage)
- `apps/web/src/lib/hooks/server-action-hooks.ts` (query keys if needed)
- `apps/web/src/app/[locale]/admin/employees/_components/EmployeeList.tsx` (entry point to constraint UI)
- `apps/web/src/i18n/langs/en.json` and `apps/web/src/i18n/langs/fr.json` (translations)

**Do not create a new domain module unless necessary.** Reuse existing employee domain ownership for this story.

### Testing Requirements

**Validators (Vitest, `*.test.ts`):**
- accept valid one-time constraint payloads
- accept valid recurring payloads (`daysOfWeek`)
- reject invalid date windows
- reject invalid weekday values and duplicates

**API service tests (Jest, `*.spec.ts`):**
- create/list/update/delete constraints scoped by clinic
- reject cross-clinic employee/constraint access
- verify recurring expansion into hard-rule intervals for a range
- verify one-time constraints pass through as hard rules

**tRPC router tests (Jest, `*.spec.ts`):**
- auth and subscription guard enforcement
- schema validation failures return typed errors
- successful procedures call service with `ctx.user.clinicId`

**Web tests (Vitest, `*.spec.tsx`):**
- constraint panel renders list and empty state
- form shows inline validation errors and blocks invalid submit
- create/update/delete flows trigger expected toasts and query invalidation
- recurring and one-time mode toggles behave correctly
- tests using nuqs-backed UI include adapter context

**Quality gates before PR:**
- `pnpm test` from repo root
- `pnpm build` from repo root

### Previous Story Intelligence (Story 5.1)

- Employee CRUD foundations are complete and stable; implement constraints as an extension, not a parallel feature.
- Keep procedure composition local in router files (`const subscribedProcedure = protectedProcedure.use(isSubscribed);`).
- Query key correctness matters: include filter dimensions in query keys to avoid stale cache behavior.
- Regression to avoid: mutation feedback text must match action semantics (activated vs deactivated style issues already occurred).
- Regression to avoid: form-level validation failures must be surfaced inline; silent submit failures are not acceptable.
- Regression to avoid: nuqs-powered components need adapter context in tests to prevent runtime failures.
- Preserve existing employee edit/create UX and avoid introducing focus-loss regressions when filters are URL-synced.

### Git Intelligence Summary

Recent non-merge commits show active refinement in employee management and are directly relevant:

- `44b99e94` `fix: address review findings for employee management`
- `826dab18` `feat: Introduce nuqs for URL-synced employee list filters...`
- `275d2205` `fix(story-5-1): include filters in employees queryKey...`
- `af1d9ee4` `fix: Implement fetch retry logic in tRPC client...`
- `98340066` `fix(story-5-1): fix edit form submit button and Date defaultValues`

Actionable implications for Story 5.2:
- Prefer incremental extension of `employee` backend/frontend surfaces.
- Keep query keys deterministic and mutation invalidation explicit.
- Add regression coverage around forms, adapter providers, and typed mutation outputs.

### Latest Tech Information (Context7 Research)

- **Prisma docs (context7 `/prisma/docs`):**
  - Continue using explicit Prisma model fields and enums for domain semantics.
  - Keep timestamp fields and relation mappings explicit for maintainability.
  - Use targeted indexes for expected query patterns (clinic + employee + date constraints).
- **NestJS docs (context7 `/nestjs/docs.nestjs.com`):**
  - Keep CRUD logic in service providers and module boundaries by domain.
  - Maintain typed, explicit exceptions and test coverage at service and integration layers.
- **Stripe docs (context7 `/websites/stripe`):**
  - Current project rule remains valid: webhook verification + idempotent processing + server-side source of truth.
  - No direct Stripe change in this story, but do not bypass existing subscription guard assumptions while extending employee features.

### Project Structure Notes

- No `project-context.md` file was found in repository search; story context was derived from planning artifacts, architecture docs, previous implementation story, and current codebase.
- All implementation work for this story should remain within existing monorepo boundaries and root-level pnpm workflows.

### References

- [Source: docs/planning-artifacts/epics.md] - Epic 5, Story 5.2 acceptance criteria.
- [Source: docs/planning-artifacts/architecture.md] - Constraints model, mandatory data flow, tooling and module boundaries.
- [Source: docs/planning-artifacts/prd.md] - FR3, FR7, NFR6, NFR9, multi-tenant and hard-rule expectations.
- [Source: docs/planning-artifacts/ux-design-specification.md] - Clinique Zen direction, transparency, and admin constraint workflows.
- [Source: docs/implementation-artifacts/5-1-employee-contract-management-crud.md] - previous story learnings and regressions to avoid.
- [Source: apps/api/prisma/schema/Employee.prisma] - current `Unavailability` and employee schema baseline.
- [Source: apps/api/src/modules/employee/employee.service.ts] - existing employee domain service pattern.
- [Source: apps/api/src/trpc/routers/employee.router.ts] - existing employee tRPC pattern.
- [Source: apps/web/src/app/[locale]/admin/employees/] - existing employee UI/actions/hooks baseline.
- [Source: Context7 `/prisma/docs`, `/nestjs/docs.nestjs.com`, `/websites/stripe`] - latest framework guidance used for guardrails.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- Context7 research used for Prisma, NestJS, next-intl and planning rule projection guardrails.
- Implemented backend and frontend incrementally with red-green cycles on validators, service/router, and web panel tests.
- `agent-browser` validation executed: `/fr/admin/employees` redirects to `/login` in current local session (no authenticated context available).
- Root quality gates executed: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm db:generate`, `pnpm db:push`.

### Completion Notes List

- Implemented employee constraint CRUD end-to-end (schema, validators, service, router, server actions, hooks, UI panel/form, i18n).
- Added hard-rule projection output for one-time and recurring unavailabilities with clinic isolation guarantees.
- Added and updated tests across validators/API/web, including `nuqs` testing adapter coverage for employee list tests.
- Global lint baseline stabilized to ensure `pnpm lint` is green across all workspaces (including API/Web/types/validators config harmonization).
- Story moved to `review` after successful quality gates.

### File List

- `apps/api/eslint.config.mjs`
- `apps/api/package.json`
- `apps/api/prisma/schema/Employee.prisma`
- `apps/api/src/modules/auth/auth.service.spec.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/employee/employee.service.spec.ts`
- `apps/api/src/modules/employee/employee.service.ts`
- `apps/api/src/modules/stripe/stripe.service.spec.ts`
- `apps/api/src/trpc/routers/employee.router.spec.ts`
- `apps/api/src/trpc/routers/employee.router.ts`
- `apps/api/src/trpc/trpc.spec.ts`
- `apps/web/eslint.config.mjs`
- `apps/web/src/app/[locale]/admin/employees/__tests__/employee-constraints-panel.spec.tsx`
- `apps/web/src/app/[locale]/admin/employees/__tests__/employee-list.spec.tsx`
- `apps/web/src/app/[locale]/admin/employees/_actions/employee-constraint-actions.ts`
- `apps/web/src/app/[locale]/admin/employees/_components/EmployeeCard.tsx`
- `apps/web/src/app/[locale]/admin/employees/_components/EmployeeConstraintForm.tsx`
- `apps/web/src/app/[locale]/admin/employees/_components/EmployeeConstraintsPanel.tsx`
- `apps/web/src/app/[locale]/admin/employees/_components/EmployeeList.tsx`
- `apps/web/src/app/[locale]/admin/employees/_hooks/useEmployeeConstraints.ts`
- `apps/web/src/app/[locale]/admin/onboarding/_components/OnboardingWizard.tsx`
- `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepClinicName.tsx`
- `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepShiftTypes.tsx`
- `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepWorkDays.tsx`
- `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepWorkHours.tsx`
- `apps/web/src/app/[locale]/admin/onboarding/page.tsx`
- `apps/web/src/app/[locale]/auth/activate/_components/ActivateClient.tsx`
- `apps/web/src/i18n/langs/en.json`
- `apps/web/src/i18n/langs/fr.json`
- `apps/web/src/i18n/request.ts`
- `apps/web/src/lib/contexts/__tests__/subscription-context.spec.tsx`
- `apps/web/src/lib/hooks/server-action-hooks.ts`
- `apps/web/vitest.setup.ts`
- `docs/implementation-artifacts/5-2-declarative-constraints-configuration.md`
- `docs/implementation-artifacts/sprint-status.yaml`
- `packages/types/eslint.config.mjs`
- `packages/validators/eslint.config.mjs`
- `packages/validators/src/employee/index.ts`
- `packages/validators/src/employee/unavailability.schema.test.ts`
- `packages/validators/src/employee/unavailability.schema.ts`

### Change Log

- 2026-02-10: Implemented Story 5.2 (declarative employee constraints) across API/web/validators with hard-rule projection and full test coverage.
- 2026-02-10: Stabilized monorepo lint workflow so `pnpm lint` is green without mutating unrelated files during standard lint runs.
