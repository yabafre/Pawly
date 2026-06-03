# Story 5.4: Monthly School Day Declaration (Apprentices)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## User Story

As an apprentice,
I want to declare my school days before the end of each month,
so that the planning engine knows when I am unavailable for the upcoming month.

## Acceptance Criteria

1. **Given** my employee portal (as an apprentice) **When** I access the "School Days" declaration page **Then** I see a calendar for the upcoming month where I can select specific dates via a tap/click interaction.
2. **Given** the school days calendar **When** I select dates for the upcoming month **Then** the selected dates are visually highlighted with the SCHOOL shift color (`bg-neutral-100 border-neutral-200 text-neutral-600`) and a `GraduationCap` icon.
3. **Given** I have selected my school days **When** I submit the declaration **Then** each selected date is persisted as an individual `Unavailability` record with `type: SCHOOL` and `ruleType: HARD` in the planning engine.
4. **Given** the monthly declaration workflow **When** the current submission replaces a previous declaration for the same month **Then** the system atomically deletes old SCHOOL records for that month and creates new ones (replace-list semantics).
5. **Given** a submitted school day declaration **When** the submission succeeds **Then** the admin is notified (email via Resend) that the apprentice has declared their school days for the upcoming month.
6. **Given** an apprentice who has NOT declared school days **When** the 25th of the current month is reached **Then** a reminder notification (email) is sent to the apprentice prompting them to declare before month end.
7. **Given** any read or write on school day declarations **When** the operation is executed **Then** it is strictly scoped to the authenticated user's `clinicId` and `employeeId` (self-service: apprentice can only manage their own declarations).
8. **Given** FR/EN locales **When** I use this feature **Then** all user-facing strings are translated and the interface follows the Clinique Zen conventions with WCAG AA-compliant interactions.

## Tasks

- [x] **Task 1: Create employee dashboard layout and auth guard** (AC: #1, #7)
  - [x] 1.1 Create `apps/web/src/app/[locale]/dashboard/layout.tsx` with EMPLOYEE role auth guard (server-side check via tRPC, redirect to `/login` if unauthenticated or wrong role).
  - [x] 1.2 Create `apps/web/src/app/[locale]/dashboard/_components/DashboardLayoutClient.tsx` with minimal sidebar/nav for employee portal (school days link, future: schedule, presence).
  - [x] 1.3 Add subscription guard check (employee's clinic must have active subscription).
  - [x] 1.4 Add i18n support with `setRequestLocale(locale)` and translation keys.

- [x] **Task 2: Add school day declaration validators** (AC: #1, #3, #4, #7)
  - [x] 2.1 Create `packages/validators/src/employee/school-days.schema.ts` with:
    - `declareSchoolDaysSchema`: `{ month: string (YYYY-MM format), dates: string[] (ISO date strings), employeeId: string (uuid) }`
    - `listSchoolDaysSchema`: `{ month: string (YYYY-MM), employeeId: string (uuid) }`
  - [x] 2.2 Add validation: month must be current or future month, dates must fall within declared month, no duplicate dates, minimum 0 and maximum 31 dates.
  - [x] 2.3 Export from `packages/validators/src/employee/index.ts` and `packages/validators/src/index.ts`.

- [x] **Task 3: Extend employee service with school day batch operations** (AC: #3, #4, #7)
  - [x] 3.1 Add `declareSchoolDays(clinicId, employeeId, month, dates)` method to `EmployeeService`.
  - [x] 3.2 Implement replace-list semantics in a transaction: delete existing SCHOOL Unavailabilities for the month range, then create new ones (one per date, `startDate = endDate = date`, `type: SCHOOL`).
  - [x] 3.3 Validate that employee belongs to clinic and has `jobType: APPRENTICE`.
  - [x] 3.4 Add `listSchoolDays(clinicId, employeeId, month)` method to retrieve existing declarations for a given month.
  - [x] 3.5 Add `listUndeclaredApprentices(clinicId, month)` method to find apprentices without school day declarations for a given month.

- [x] **Task 4: Expose tRPC procedures for school day declarations** (AC: #3, #4, #7)
  - [x] 4.1 Add `declareSchoolDays` mutation to `employee.router.ts` using `subscribedProcedure`.
  - [x] 4.2 Add `listSchoolDays` query to `employee.router.ts` using `subscribedProcedure`.
  - [x] 4.3 Add self-service enforcement: for EMPLOYEE role callers, ensure `employeeId` matches the caller's linked employee record (prevent accessing other apprentices' data).
  - [x] 4.4 For ADMIN role callers, allow viewing any employee's school days within their clinic.

- [x] **Task 5: Add admin notification on school day submission** (AC: #5)
  - [x] 5.1 Create `SchoolDaysDeclarationEmail.tsx` React Email template in `apps/api/src/modules/mail/templates/`.
  - [x] 5.2 Add `sendSchoolDaysNotification(adminEmail, apprenticeName, month, dates)` method to `MailService`.
  - [x] 5.3 Trigger notification in `declareSchoolDays` service method after successful persistence.
  - [x] 5.4 Look up clinic admin(s) to determine notification recipients.

- [x] **Task 6: Add monthly reminder cron job** (AC: #6)
  - [x] 6.1 Install `@nestjs/schedule` and register `ScheduleModule.forRoot()` in `AppModule`.
  - [x] 6.2 Create `apps/api/src/modules/scheduler/scheduler.module.ts` and `scheduler.service.ts`.
  - [x] 6.3 Add `@Cron('0 9 25 * *', { timeZone: 'Europe/Paris' })` handler that:
    - Lists all clinics with active subscriptions.
    - For each clinic, finds apprentice employees without SCHOOL declarations for the next month.
    - Sends reminder email to each undeclared apprentice.
  - [x] 6.4 Create `SchoolDaysReminderEmail.tsx` React Email template.
  - [x] 6.5 Add `sendSchoolDaysReminder(apprenticeEmail, name, month)` method to `MailService`.

- [x] **Task 7: Create web server actions and hooks for school days** (AC: #1, #3, #4)
  - [x] 7.1 Create `apps/web/src/app/[locale]/dashboard/school-days/_actions/school-days-actions.ts` with `declareSchoolDaysAction` and `listSchoolDaysAction`.
  - [x] 7.2 Create `apps/web/src/app/[locale]/dashboard/school-days/_hooks/useSchoolDays.ts` with query and mutation hooks using `useServerActionQuery` / `useServerActionMutation`.
  - [x] 7.3 Use deterministic query keys via `QueryKeyFactory` (add `schoolDays: (month?) => ["employees", "school-days", month ?? "all"]`).

- [x] **Task 8: Build apprentice school day declaration UI** (AC: #1, #2, #8)
  - [x] 8.1 Create `apps/web/src/app/[locale]/dashboard/school-days/page.tsx` (RSC entry point with `setRequestLocale`).
  - [x] 8.2 Create `_components/SchoolDayCalendar.tsx` client component using shadcn/ui Calendar with `mode="multiple"` (react-day-picker).
  - [x] 8.3 Calendar scoped to upcoming month only (disable past dates and dates outside target month).
  - [x] 8.4 Selected dates highlighted with SCHOOL shift color (`bg-neutral-100 text-neutral-600` + `GraduationCap` badge).
  - [x] 8.5 Submit button: "Submit my school days" CTA with loading state.
  - [x] 8.6 Reminder banner (orange warning) if current date >= 25th and no declaration submitted for next month.
  - [x] 8.7 Success state showing submitted dates with option to modify.
  - [x] 8.8 Follow Clinique Zen aesthetic: `rounded-3xl` cards, soft shadows, Vet Teal validation.

- [x] **Task 9: Add admin-side apprentice school day visibility** (AC: #5)
  - [x] 9.1 Add school day status indicator on employee cards/list for APPRENTICE employees (badge: "Declared" / "Not declared" for upcoming month).
  - [x] 9.2 Extend admin employee constraint panel to show school day declarations read-only.

- [x] **Task 10: Add i18n translations** (AC: #8)
  - [x] 10.1 Add `dashboard.schoolDays` namespace keys in `apps/web/src/i18n/langs/en.json`.
  - [x] 10.2 Add equivalent keys in `apps/web/src/i18n/langs/fr.json`.
  - [x] 10.3 Keys: page title, calendar instructions, reminder banner, submit button, success message, error messages, months, admin notification labels.

- [x] **Task 11: Add comprehensive tests and regression guards** (AC: all)
  - [x] 11.1 Validators: `school-days.schema.test.ts` for valid/invalid month formats, date ranges, duplicates.
  - [x] 11.2 API service: unit tests for batch declaration, replace-list atomicity, clinic isolation, APPRENTICE jobType validation, undeclared apprentice listing.
  - [x] 11.3 tRPC router: tests for auth/subscription guards, self-service enforcement (EMPLOYEE can only manage own), ADMIN can view all.
  - [x] 11.4 Web: component tests for calendar rendering, date selection, submission flow, reminder banner, success state.
  - [x] 11.5 Scheduler: test cron handler logic (mock date, verify email calls for undeclared apprentices).
  - [x] 11.6 Run root quality gates: `pnpm test` and `pnpm build`.

- [x] **Task 12: Employee invitation flow — auto-create User account on employee creation** (Cross-cutting)
  - [x] 12.1 Import `AuthModule` in `EmployeeModule` to inject `AuthService`.
  - [x] 12.2 Modify `EmployeeService.create()`: when email is provided, check for existing User, then atomically create User (role: EMPLOYEE) + Employee in `$transaction` with `userId` link.
  - [x] 12.3 Fire-and-forget activation email via `AuthService.createActivationToken(email)`.
  - [x] 12.4 If no email, create Employee without User account (original behavior preserved).
  - [x] 12.5 Reject duplicate email with `BadRequestException` if User already exists.
  - [x] 12.6 Update `employee.service.spec.ts` with AuthService mock and 6 create tests covering transaction path, activation email, duplicate rejection, CDI endDate clearing.

## Dev Notes

This story introduces the first employee-facing feature in the application. While the full Employee PWA Portal is planned for Epic 8, Story 5.4 creates a minimal employee dashboard route specifically for apprentice school day declarations. The implementation reuses the existing `Unavailability` model with `type: SCHOOL` and extends the employee service with batch operations for monthly declarations. A NestJS cron job handles monthly reminders, and Resend handles email notifications.

### Technical Requirements

- Reuse existing `Unavailability` model with `type: SCHOOL` for school day persistence:
  - Each school day = one `Unavailability` record with `startDate = endDate = school_day`, `type: SCHOOL`, `daysOfWeek: []` (one-time).
  - Monthly declarations use replace-list semantics: delete all SCHOOL records for the month, then create new ones.
  - This approach ensures seamless integration with the existing hard-rule projection (`listHardRules`) — no changes needed to planning consumption.
- Self-service enforcement:
  - Apprentices (role: EMPLOYEE) can only declare for their own linked `Employee` record.
  - The tRPC procedure must resolve the caller's `employeeId` from `ctx.user` → `User.employee` relation.
  - Admins can view (but not modify via this endpoint) any apprentice's declarations.
- Employee portal route:
  - New route at `app/[locale]/dashboard/school-days/` with employee auth guard.
  - Minimal layout with navigation (future-proof for Epic 8 expansion).
  - Subscription guard: employee's clinic must have active subscription (reuse `isSubscribed` middleware).
- Calendar interaction:
  - shadcn/ui Calendar component with `mode="multiple"` (react-day-picker).
  - Restrict selection to upcoming month only.
  - Visual: selected dates use SCHOOL color scheme from UX spec.
- Notification infrastructure:
  - `@nestjs/schedule` for cron-based reminder on the 25th of each month.
  - Resend + React Email templates for both reminder and admin notification emails.
  - Look up clinic admin(s) via `User` model with `role: ADMIN` and matching `clinicId`.
- Validation rules (shared Zod in `@pawly/validators`):
  - Month format: `YYYY-MM` strict regex.
  - Dates must be valid ISO date strings falling within the declared month.
  - No duplicate dates in a single declaration.
  - Employee must have `jobType: APPRENTICE`.
- Multi-tenancy and security:
  - Every read/write derives clinic scope from authenticated `ctx.user.clinicId`.
  - Self-service: `employeeId` validated against caller's user record.
  - No client-provided `clinicId` accepted in input payloads.

### Architecture Compliance (NON-NEGOTIABLE)

Mandatory end-to-end flow must remain unchanged:

```text
Page (RSC) -> Client Component -> Hook -> Zsa Hook -> Server Action -> tRPC Client -> NestJS Service -> Prisma
```

- No direct Prisma access from `apps/web`.
- No direct tRPC calls from client components; only through route-local server actions.
- Keep employee business logic in `apps/api/src/modules/employee/employee.service.ts`.
- All tRPC procedures must validate input with schemas from `@pawly/validators`.
- Keep auth/subscription semantics:
  - School day declaration behind `subscribedProcedure` (requires auth + active subscription).
  - Self-service enforcement: EMPLOYEE role callers can only manage their own employee record.
  - ADMIN role callers can read any employee's school days within their clinic.
- Preserve strict clinic tenancy:
  - Scope all queries by `ctx.user.clinicId`.
  - Reject any design that relies on client-passed clinic identifiers.
- Mutations must invalidate relevant React Query keys through `QueryKeyFactory` patterns.
- Email notifications are fire-and-forget (do not block the mutation response on email delivery success).

### Library & Framework Requirements

- **Prisma (project pinned to `7.2.0`)**
  - Keep schema-folder conventions in `apps/api/prisma/schema/`.
  - No schema changes needed — reuse existing `Unavailability` model with `type: SCHOOL`.
  - Use transactional batch operations for replace-list semantics (`deleteMany` + `createMany` in `$transaction`).
- **NestJS (project baseline `11.x`)**
  - Keep employee operational logic in `EmployeeService`.
  - Add `@nestjs/schedule` for cron-based reminder (new dependency).
  - Create `SchedulerModule` for periodic task management.
  - Use typed exceptions (`NotFoundException`, `BadRequestException`, `ForbiddenException`) for predictable tRPC error surfaces.
- **tRPC (`11.x`)**
  - Continue procedure validation with shared Zod schemas.
  - Add role-based authorization check in procedures (EMPLOYEE vs ADMIN).
  - Keep auth/subscription middleware layering consistent (`subscribedProcedure`).
- **Zod via `@pawly/zod` (`zod` override `4.3.6`)**
  - Single source of truth for school day declaration contracts in `packages/validators`.
  - Avoid ad-hoc route-level validation logic.
- **Next.js (`16.x`) + next-intl (`4.x`)**
  - Create new employee-facing route under `app/[locale]/dashboard/`.
  - Follow `proxy.ts`-based locale routing and layout guards.
  - Use `setRequestLocale(locale)` in every page and layout.
- **react-day-picker (via shadcn/ui Calendar)**
  - Use `mode="multiple"` for multi-date selection.
  - Restrict month navigation to target month only.
  - Custom day rendering for SCHOOL-colored selected dates.
- **Resend + React Email**
  - Create two new email templates: `SchoolDaysDeclarationEmail.tsx` and `SchoolDaysReminderEmail.tsx`.
  - Follow existing `MailService` patterns from `apps/api/src/modules/mail/`.
- **@nestjs/schedule (NEW dependency)**
  - Install: `pnpm add @nestjs/schedule` in `apps/api`.
  - Configure `ScheduleModule.forRoot()` in `AppModule`.
  - Use `@Cron()` decorator with timezone-aware pattern (`Europe/Paris`).
- **UI stack**
  - Tailwind v4 + shadcn/ui + Lucide + Sonner.
  - Preserve Clinique Zen conventions and WCAG AA interactions.
  - Calendar component: shadcn/ui `<Calendar mode="multiple" />`.

### File Structure Requirements

**Files to create:**

```text
packages/validators/src/employee/
  school-days.schema.ts
  school-days.schema.test.ts

apps/api/src/modules/scheduler/
  scheduler.module.ts
  scheduler.service.ts

apps/api/src/modules/mail/templates/
  SchoolDaysDeclarationEmail.tsx
  SchoolDaysReminderEmail.tsx

apps/web/src/app/[locale]/dashboard/
  layout.tsx
  _components/
    DashboardLayoutClient.tsx

apps/web/src/app/[locale]/dashboard/school-days/
  page.tsx
  _actions/
    school-days-actions.ts
  _hooks/
    useSchoolDays.ts
  _components/
    SchoolDayCalendar.tsx
    SchoolDayReminderBanner.tsx
  __tests__/
    school-day-calendar.spec.tsx
```

**Files to modify:**

- `packages/validators/src/employee/index.ts` (export new schemas)
- `packages/validators/src/index.ts` (barrel export)
- `apps/api/src/modules/employee/employee.service.ts` (add batch school day methods)
- `apps/api/src/modules/employee/employee.service.spec.ts` (new service coverage)
- `apps/api/src/trpc/routers/employee.router.ts` (new procedures)
- `apps/api/src/trpc/routers/employee.router.spec.ts` (router coverage)
- `apps/api/src/modules/mail/mail.service.tsx` (add notification methods)
- `apps/api/src/app.module.ts` (import SchedulerModule, ScheduleModule)
- `apps/api/package.json` (add @nestjs/schedule dependency)
- `apps/web/src/lib/hooks/server-action-hooks.ts` (add `schoolDays` query key)
- `apps/web/src/i18n/langs/en.json` (add dashboard.schoolDays namespace)
- `apps/web/src/i18n/langs/fr.json` (add dashboard.schoolDays namespace)

**Structure constraints:**

- Keep all employee dashboard web artifacts route-local under `app/[locale]/dashboard/*`.
- Keep Prisma schema unchanged — reuse existing `Unavailability` model.
- Keep root scripts delegating to Turborepo tasks only.
- New `SchedulerModule` is a standalone NestJS module, not coupled to employee domain.

### Testing Requirements

**Validators (Vitest, `*.test.ts`):**

- accept valid school day declaration with correct month and dates
- reject invalid `YYYY-MM` month format
- reject dates outside the declared month
- reject duplicate dates in a single declaration
- reject empty and oversized date arrays
- accept listing schema with valid month and employeeId

**API service tests (Jest, `*.spec.ts`):**

- `declareSchoolDays` creates SCHOOL Unavailabilities in a transaction
- `declareSchoolDays` replaces existing SCHOOL records for the same month (delete + create atomically)
- `declareSchoolDays` rejects non-APPRENTICE employees with `BadRequestException`
- `declareSchoolDays` enforces clinic isolation (cannot declare for employees of another clinic)
- `listSchoolDays` returns only SCHOOL-type Unavailabilities for the specified month
- `listUndeclaredApprentices` correctly identifies apprentices without declarations for target month

**tRPC router tests (Jest, `*.spec.ts`):**

- auth/subscription middleware behavior stays correct (`subscribedProcedure`)
- EMPLOYEE role can only declare for their own linked employee record
- EMPLOYEE role cannot access other employees' school days
- ADMIN role can read any employee's school days within their clinic
- input validation failures return typed tRPC errors via shared validators

**Scheduler tests (Jest, `*.spec.ts`):**

- cron handler correctly identifies undeclared apprentices for next month
- cron handler calls mail service for each undeclared apprentice
- cron handler skips clinics without active subscriptions
- cron handler handles empty results gracefully (no apprentices, all declared)

**Web tests (Vitest, `*.spec.tsx`):**

- calendar renders with correct month restriction
- date selection toggles individual dates on/off
- submission triggers mutation with correct payload
- reminder banner appears when current date >= 25th and no declaration exists
- success state renders after submission with declared dates
- loading/error states handled correctly
- FR/EN rendering assertions for key labels

**Quality gates before PR (run from repository root):**

- `pnpm test`
- `pnpm build`
- `pnpm lint`

### Previous Story Intelligence (Stories 5.1, 5.2, 5.3)

- Story 5.2 established the employee-constraint pipeline end-to-end (validators -> service -> router -> server actions -> hooks -> panel/form). Story 5.4 MUST reuse this infrastructure rather than creating parallel architecture.
- Story 5.2 uses `Unavailability` model with `type: SCHOOL` — Story 5.4 leverages the same model but adds batch operations for monthly declarations.
- Story 5.3 introduced replace-list semantics for clinic operational config (`deleteMany` + `createMany` in transaction) — the same pattern applies to school day declarations.
- Review fix from Story 5.2: reset local form/panel state when dialogs close to prevent stale edit-context reuse. Apply the same pattern to the school day calendar component.
- Review fix from Story 5.3: `placeholderData: (prev) => prev` prevents skeleton flash during refetch — apply to school day query hook.
- Story 5.3 added `loading.tsx`, `error.tsx`, and dedicated skeleton components for admin routes — follow the same pattern for the new dashboard route.
- Story 5.1 code review: mutation feedback text must match action semantics. Ensure toast messages for "declared" vs "updated" are distinct.
- Query key correctness matters: include month dimension in query keys to avoid stale cache.
- All stories confirm: `subscribedProcedure` composition is LOCAL in each router file, NOT global.

### Git Intelligence Summary

Recent relevant commit trajectory:

- `05bedbbd` — `Merge pull request #20 from yabafre/feature/story-5-3-clinic-configuration-hours-days`
- `b9a3c9da` — `fix(story-5-3): code review fixes + replace window.confirm with AlertDialog`
- `7ecb7be1` — `feat(story-5-3): add loading.tsx, error.tsx and dedicated skeleton components`
- `9fdee982` — `fix(story-5-3): code review fixes + relocate config UI to admin/settings`
- `1db6616f` — `feat(story-5-3): implement clinic operational configuration`
- `6ce028e3` — `fix: reset constraint panel state and validate partial date updates`
- `c9ce455c` — `feat(story-5-2): finalize declarative constraints implementation`

Actionable implications for Story 5.4:

- Expect review scrutiny on self-service security enforcement (apprentice can only manage own data).
- Follow the established cross-layer implementation style from Stories 5.1-5.3 (schema + validators + service + router + server actions + hooks + UI + tests).
- Loading/error/skeleton patterns are now established — apply consistently to the new dashboard route.
- State hygiene in calendar component: reset selected dates when navigating away or after successful submission.
- Transaction-based replace-list operations (from Story 5.3) should be the pattern for monthly declaration updates.
- Keep query cache semantics explicit and deterministic; include month in `schoolDays` query key.

### Latest Tech Information (Context7 + Applied Skills)

- **react-day-picker (Context7 `/gpbl/react-day-picker`)**
  - Use `mode="multiple"` for multi-date selection: `<DayPicker mode="multiple" selected={dates} onSelect={setDates} />`.
  - `selected` prop accepts `Date[]`, `onSelect` callback receives updated `Date[]`.
  - Supports `min` and `max` props to limit number of selectable dates.
  - shadcn/ui Calendar wraps react-day-picker — check if `mode="multiple"` is already exposed or needs direct import.
  - Restrict visible months with `fromDate` and `toDate` props to constrain to target month.
- **@nestjs/schedule (Context7 `/nestjs/docs.nestjs.com`)**
  - Install: `@nestjs/schedule` package, register `ScheduleModule.forRoot()` in root module.
  - Use `@Cron('0 9 25 * *', { name: 'schoolDaysReminder', timeZone: 'Europe/Paris' })` for monthly reminder on 25th at 9 AM Paris time.
  - Cron handler is an `@Injectable()` service method decorated with `@Cron()`.
  - Keep cron logic thin: delegate to service methods for business logic and mail service for email delivery.
- **NestJS (Context7 `/nestjs/docs.nestjs.com` + `nestjs-best-practices` skill)**
  - Keep controllers/routers thin and delegate domain logic to `EmployeeService`.
  - Use typed exceptions for predictable error mapping.
  - New `SchedulerModule` should import `EmployeeModule` and `MailModule` for cross-domain operations.
- **Next.js/React guardrails (applied from `vercel-react-best-practices` + `frontend-design`)**
  - New employee dashboard layout follows same SSR auth guard pattern as admin layout.
  - Calendar component should be client-side only (date interaction requires browser).
  - Clinique Zen aesthetic for school day calendar: clean card with soft shadow, generous radius, Vet Teal for validation states.
- **Turborepo guardrails (applied from `turborepo` skill)**
  - New `@nestjs/schedule` dependency must be added to `apps/api/package.json` specifically.
  - Run `pnpm install` from monorepo root after adding dependency.
  - Maintain package-level scripts and root delegation.
- **Stripe integration guardrails (from `stripe-best-practices` skill)**
  - This story does not add payment behavior, but must not regress subscription assumptions:
    - Webhook signature verification remains mandatory.
    - Subscription status check for employee routes must query via tRPC (same as admin).
    - Cron job must check subscription status before sending reminders (skip inactive clinics).

### Project Structure Notes

- This story introduces the first employee-facing route (`/[locale]/dashboard/`). The architecture defines this as `PROTECTED: auth employee`, separate from admin routes.
- The employee dashboard layout needs its own auth guard that checks for `role: EMPLOYEE` (not ADMIN). This is different from the admin layout which checks `role: ADMIN` + subscription + onboarding.
- For employee routes, subscription check should verify the employee's clinic has an active subscription (employee doesn't manage billing but needs access gated by clinic subscription).
- The `User` model links to `Employee` via optional `userId` field. Self-service enforcement requires resolving the caller's `employeeId` from their `User` record.
- Employee portal is minimal for now (school days only). Future Epic 8 stories will expand it with schedule consultation, presence confirmation, and PWA features.
- Keep dashboard route artifacts separate from admin route artifacts — no cross-domain leakage.

### References

- [Source: docs/planning-artifacts/epics.md#Epic 5: Staff Management & Clinic Configuration - Story 5.4]
- [Source: docs/planning-artifacts/prd.md#FR3, FR7, NFR6, NFR14]
- [Source: docs/planning-artifacts/architecture.md#Data Flow (Non-Negotiable), Data Architecture, Authentication & Security, Frontend Architecture]
- [Source: docs/planning-artifacts/ux-design-specification.md#Apprentice School Day Declaration UI, One-Tap Compliance, Clinique Zen]
- [Source: docs/implementation-artifacts/5-1-employee-contract-management-crud.md#Previous story learnings]
- [Source: docs/implementation-artifacts/5-2-declarative-constraints-configuration.md#Unavailability model, constraint CRUD, hard-rule projection]
- [Source: docs/implementation-artifacts/5-3-clinic-configuration-hours-days.md#Replace-list semantics, loading/error/skeleton patterns]
- [Source: docs/implementation-artifacts/sprint-status.yaml#development_status]
- [Source: apps/api/prisma/schema/Employee.prisma#Unavailability model, UnavailabilityType enum (SCHOOL)]
- [Source: apps/api/src/modules/employee/employee.service.ts#Constraint CRUD, hard-rule projection]
- [Source: apps/api/src/trpc/routers/employee.router.ts#Existing procedures, subscribedProcedure pattern]
- [Source: apps/api/src/modules/mail/mail.service.tsx#Resend email patterns]
- [Source: apps/api/src/trpc/trpc.ts#isAuthed, isSubscribed middleware]
- [Source: apps/web/src/lib/hooks/server-action-hooks.ts#QueryKeyFactory]
- [Source: Context7 `/gpbl/react-day-picker` — multi-date selection mode]
- [Source: Context7 `/nestjs/docs.nestjs.com` — @nestjs/schedule cron job setup]

### Story Completion Status

- Story status: `done`.
- All 12 tasks completed with comprehensive test coverage (Task 12 added: employee invitation flow).
- Quality gates passed: `pnpm test` (703 tests) and `pnpm build` (clean).
- Adversarial code review completed: 22 issues found (3 CRITICAL, 6 HIGH, 5 MEDIUM, 8 TEST GAPS), all fixed.
- Mobile-first responsive pass completed: dashboard layout, calendar, loading/error states.

## File List

**Files created:**
- `packages/validators/src/employee/school-days.schema.ts`
- `packages/validators/src/employee/school-days.schema.test.ts`
- `apps/api/src/modules/scheduler/scheduler.module.ts`
- `apps/api/src/modules/scheduler/scheduler.service.ts`
- `apps/api/src/modules/scheduler/scheduler.service.spec.ts`
- `apps/api/src/modules/mail/templates/SchoolDaysDeclarationEmail.tsx`
- `apps/api/src/modules/mail/templates/SchoolDaysReminderEmail.tsx`
- `apps/web/src/app/[locale]/dashboard/layout.tsx`
- `apps/web/src/app/[locale]/dashboard/_components/DashboardLayoutClient.tsx`
- `apps/web/src/app/[locale]/dashboard/_components/EmployeeContext.tsx`
- `apps/web/src/app/[locale]/dashboard/school-days/page.tsx`
- `apps/web/src/app/[locale]/dashboard/school-days/_actions/school-days-actions.ts`
- `apps/web/src/app/[locale]/dashboard/school-days/_hooks/useSchoolDays.ts`
- `apps/web/src/app/[locale]/dashboard/school-days/_components/SchoolDayCalendar.tsx`
- `apps/web/src/app/[locale]/dashboard/school-days/_components/SchoolDayReminderBanner.tsx`
- `apps/web/src/app/[locale]/dashboard/school-days/__tests__/school-day-calendar.spec.tsx`
- `apps/web/src/app/[locale]/dashboard/school-days/__tests__/school-days-page.spec.tsx`
- `apps/web/src/app/[locale]/dashboard/school-days/__tests__/school-day-reminder-banner.spec.tsx`
- `apps/web/src/app/[locale]/admin/employees/__tests__/employee-card-school-days.spec.tsx`
- `apps/web/src/components/ui/calendar.tsx`

**Files modified:**
- `packages/validators/src/employee/index.ts` (export new schemas)
- `apps/api/src/modules/employee/employee.service.ts` (add school day batch methods + MailService + AuthService + employee invitation flow)
- `apps/api/src/modules/employee/employee.service.spec.ts` (add MailService/AuthService mocks + 16 new tests + 6 rewritten create tests)
- `apps/api/src/modules/employee/employee.module.ts` (import MailModule + AuthModule)
- `apps/api/src/trpc/routers/employee.router.ts` (add declareSchoolDays + listSchoolDays procedures)
- `apps/api/src/trpc/routers/employee.router.spec.ts` (update count 10→12 + 8 new procedure tests)
- `apps/api/src/trpc/routers/auth.router.ts` (add getMe procedure)
- `apps/api/src/modules/mail/mail.service.tsx` (add school day notification + reminder methods)
- `apps/api/src/app.module.ts` (import ScheduleModule.forRoot() + SchedulerModule)
- `apps/web/src/lib/hooks/server-action-hooks.ts` (add schoolDays query key)
- `apps/web/src/app/[locale]/admin/employees/_components/EmployeeCard.tsx` (add schoolDaysDeclared badge)
- `apps/web/src/app/[locale]/admin/settings/_hooks/useClinicOperationalConfig.ts` (fix placeholderData type)
- `apps/web/src/i18n/langs/en.json` (add dashboard + employees.schoolDays namespaces)
- `apps/web/src/i18n/langs/fr.json` (add dashboard + employees.schoolDays namespaces)
- `docs/implementation-artifacts/sprint-status.yaml` (status → done)
- `docs/implementation-artifacts/5-4-monthly-school-day-declaration-apprentices.md` (this file)

## Dev Agent Record

### Summary

Story 5.4 implemented: employee dashboard portal at `/[locale]/dashboard/` with EMPLOYEE role guard and subscription check. School day declarations use existing `Unavailability` model with `type: SCHOOL` — zero schema changes. Self-service enforcement ensures apprentices can only manage their own declarations. Admin notification via fire-and-forget Resend emails after successful declaration. Monthly cron reminder at 9 AM on the 25th (Europe/Paris) for undeclared apprentices. Calendar uses react-day-picker v9 with `mode="multiple"` restricted to next month. EmployeeContext React context propagates employeeId/jobType from server layout to client components. Admin-side visibility via school day badge on EmployeeCard for APPRENTICE employees. Employee invitation flow: admin creates employee with email → User+Employee created atomically → activation email sent → employee can log in.

Agent model: Claude Opus 4.6 (claude-opus-4-6).

Debug log:
- Fixed `return this.prisma.$transaction(...)` preventing fire-and-forget notification code from executing — changed to `const result = await this.prisma.$transaction(...)`
- Fixed `NEXT_PUBLIC_APP_URL` not in API env config — changed to `WEB_APP_URL`
- Fixed pre-existing `placeholderData: (prev: unknown) => prev` type error in `useClinicOperationalConfig.ts`
- Fixed cross-namespace translation keys issue with next-intl — added `employees.schoolDays` keys directly

### Files changed

- **Validators**: +18 tests (school-days.schema.test.ts)
- **API service**: +16 tests (declareSchoolDays, listSchoolDays, listUndeclaredApprentices + admin notification) + 6 rewritten create tests (employee invitation flow)
- **API scheduler**: +5 tests (cron handler, multi-clinic, error resilience)
- **API router**: +8 tests (declareSchoolDays, listSchoolDays, self-service enforcement, FORBIDDEN)
- **Web components**: +19 tests (calendar, reminder banner, page, employee card badge)
- **Total new tests**: 69 (across 7 new test files + 2 updated)
- **Final test counts**: API 253 | Web 287 | Validators 148 | Total 688

### Deviations

None recorded.

### Test output

Quality gates passed: `pnpm test` (703 tests) and `pnpm build` (clean). Adversarial code review completed: 22 issues found (3 CRITICAL, 6 HIGH, 5 MEDIUM, 8 TEST GAPS), all fixed. Mobile-first responsive pass completed: dashboard layout, calendar, loading/error states.
