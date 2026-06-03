# Story 7.3: Absence Request and Validation Workflow

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## User Story

As an employee or admin,
I want to submit, view, and validate absence requests through a structured approval workflow,
so that validated absences automatically create blocking "Hard Rule" entries in the planning engine, ensuring the schedule respects all approved time off.

## Acceptance Criteria

1. **Given** the employee dashboard **When** I access the "Absences" section **Then** I see a form to submit a new absence request with type selection (Paid Leave, Sick Leave, Training, Child Sick, Other), a date range picker (start date → end date), and an optional reason field.
2. **Given** the absence request form **When** I select an absence type from the 2x2 grid of options **Then** the selected type is visually highlighted with the corresponding UX color (Emerald/Paid Leave, Rose/Sick, Neutral/Training, Blue/Child Sick) and an icon (Plane, Thermometer, GraduationCap, Baby).
3. **Given** a valid absence request **When** I submit it **Then** an `Absence` record is created with `status: PENDING`, the request appears in my absence list with a "Pending" badge, and all clinic admin(s) are notified via email (Resend) with the request details.
4. **Given** the admin interface **When** I access the absence management section **Then** I see a list of all absence requests for my clinic, filterable by status (pending/approved/rejected/all) and employee, with pending requests prominently displayed and a count badge in the navigation.
5. **Given** a pending absence request **When** the admin clicks "Approve" **Then** the absence status is updated to `APPROVED`, an `Unavailability` record is atomically created (type mapped from absence type, same date range, `reason` referencing the absence) as a Hard Rule in the planning, the employee is notified via email, and affected planning queries are invalidated.
6. **Given** a pending absence request **When** the admin clicks "Reject" **Then** a dialog prompts for an optional rejection reason, the absence status is updated to `REJECTED` with the reason stored, the employee is notified via email with the rejection reason, and no Unavailability is created.
7. **Given** the employee absence list **When** I view my requests **Then** I see all my absence requests with status (Pending=orange, Approved=green, Rejected=red), type icon, date range, day count, and rejection reason if applicable. Requests are ordered by creation date (newest first).
8. **Given** a submitted absence request **When** the date range overlaps with an existing approved absence or unavailability for the same employee **Then** the form shows an inline warning before submission, informing of the overlap (but does NOT block submission — the admin decides).
9. **Given** an admin creating an absence directly **When** the admin fills the absence form from the admin interface for a specific employee **Then** the absence is created with `status: APPROVED` immediately (no pending step), an Unavailability Hard Rule is created atomically, and the employee is notified.
10. **Given** any absence operation (create, approve, reject, list) **When** executed **Then** it is strictly scoped to the authenticated user's `clinicId` (multi-tenant isolation), EMPLOYEE role can only manage their own requests, ADMIN role can manage all employees' requests within their clinic.
11. **Given** FR/EN locales **When** I use the absence request, validation, or list features **Then** all labels, status badges, email content, toasts, type names, and accessibility announcements are translated using ICU message format, and the interface follows the Clinique Zen aesthetic with WCAG AA compliance including 44px minimum touch targets on mobile.

## Tasks

- [x] **Task 1: Extend Prisma schema for absence workflow** (AC: #1, #5, #6)
  - [x]1.1 Add `AbsenceType` enum to `Planning.prisma`: `PAID_LEAVE`, `SICK_LEAVE`, `TRAINING`, `CHILD_SICK`, `OTHER`
  - [x]1.2 Add `type AbsenceType @default(PAID_LEAVE)` to `Absence` model
  - [x]1.3 Add `reviewedBy String? @map("reviewed_by")` — userId of approving/rejecting admin
  - [x]1.4 Add `reviewedAt DateTime? @map("reviewed_at")` — timestamp of approval/rejection
  - [x]1.5 Add `rejectionReason String? @map("rejection_reason")` — reason if rejected
  - [x]1.6 Add `@@index([clinicId, status])` for efficient pending-request queries
  - [x]1.7 Run `pnpm db:generate` and `pnpm db:push` from root

- [x] **Task 2: Create absence request validators** (AC: #1, #5, #6, #8)
  - [x]2.1 Create `packages/validators/src/employee/absence.schema.ts` with:
    - `ABSENCE_TYPES` const array and `AbsenceType` TypeScript type
    - `createAbsenceRequestSchema`: `{ employeeId: uuid, type: AbsenceType, startDate: datetime, endDate: datetime, reason?: string }` with `endDate >= startDate` validation
    - `reviewAbsenceSchema`: `{ absenceId: uuid, action: "approve" | "reject", rejectionReason?: string }` with `rejectionReason` required when action is "reject"
    - `listAbsencesSchema`: `{ employeeId?: uuid, status?: AbsenceStatus, month?: YYYY-MM }`
    - `absenceIdSchema`: `{ id: uuid }`
    - `adminCreateAbsenceSchema`: `{ employeeId: uuid, type: AbsenceType, startDate: datetime, endDate: datetime, reason?: string }` (admin direct creation = auto-approved)
  - [x]2.2 Create `packages/validators/src/employee/absence.schema.test.ts`
  - [x]2.3 Export from `packages/validators/src/employee/index.ts`

- [x] **Task 3: Implement absence service methods** (AC: #1, #3, #5, #6, #7, #8, #9, #10)
  - [x]3.1 Add `createAbsenceRequest(clinicId, employeeId, input)` to `EmployeeService` — creates Absence with PENDING status, fires admin notification email (non-blocking)
  - [x]3.2 Add `reviewAbsence(clinicId, userId, absenceId, action, rejectionReason?)` — APPROVE: update status + create Unavailability in `$transaction` + notify employee / REJECT: update status + store reason + notify employee
  - [x]3.3 Add `listAbsences(clinicId, filters)` — query with optional filters (employeeId, status, month range), include employee relation for name/jobType
  - [x]3.4 Add `getAbsenceById(clinicId, absenceId)` — single absence with employee details
  - [x]3.5 Add `adminCreateAbsence(clinicId, userId, input)` — creates Absence with APPROVED status + Unavailability in `$transaction`, notifies employee
  - [x]3.6 Add `countPendingAbsences(clinicId)` — count for admin nav badge
  - [x]3.7 Add `checkOverlap(clinicId, employeeId, startDate, endDate)` — checks for overlapping approved absences or unavailabilities, returns overlap details
  - [x]3.8 Add helper `mapAbsenceTypeToUnavailability(absenceType): UnavailabilityType` — PAID_LEAVE→VACATION, SICK_LEAVE→SICK, TRAINING→SCHOOL, CHILD_SICK→SICK, OTHER→OTHER
  - [x]3.9 Add tests to `employee.service.spec.ts`

- [x] **Task 4: Expose tRPC procedures for absences** (AC: #3, #5, #6, #10)
  - [x]4.1 Add `employee.createAbsenceRequest` mutation (subscribedProcedure) — EMPLOYEE: ownership enforced (employeeId must match caller), ADMIN: can submit for any clinic employee
  - [x]4.2 Add `employee.reviewAbsence` mutation (subscribedProcedure + ADMIN only)
  - [x]4.3 Add `employee.listAbsences` query (subscribedProcedure) — EMPLOYEE: filtered to own absences, ADMIN: all clinic absences
  - [x]4.4 Add `employee.getAbsence` query (subscribedProcedure) — EMPLOYEE: ownership enforced, ADMIN: any clinic absence
  - [x]4.5 Add `employee.adminCreateAbsence` mutation (subscribedProcedure + ADMIN only)
  - [x]4.6 Add `employee.countPendingAbsences` query (subscribedProcedure + ADMIN only)
  - [x]4.7 Add `employee.checkAbsenceOverlap` query (subscribedProcedure)
  - [x]4.8 Add tests to `employee.router.spec.ts`

- [x] **Task 5: Add email notifications** (AC: #3, #5, #6)
  - [x]5.1 Create `apps/api/src/modules/mail/templates/AbsenceRequestEmail.tsx` — React Email template for admin notification (employee name, type, dates, day count, approve/reject CTA links)
  - [x]5.2 Create `apps/api/src/modules/mail/templates/AbsenceReviewEmail.tsx` — React Email template for employee notification (approved/rejected, dates, rejection reason if applicable)
  - [x]5.3 Add `sendAbsenceRequestNotification(adminEmail, adminName, employeeName, type, startDate, endDate, dayCount)` to MailService
  - [x]5.4 Add `sendAbsenceReviewNotification(employeeEmail, employeeName, status, type, startDate, endDate, rejectionReason?)` to MailService
  - [x]5.5 Trigger notifications fire-and-forget in service methods (do NOT block on email delivery)

- [x] **Task 6: Create employee-side web layer** (AC: #1, #2, #7, #8, #11)
  - [x]6.1 Create `apps/web/src/app/[locale]/dashboard/absences/_actions/absence-actions.ts` with `createAbsenceRequestAction`, `listMyAbsencesAction`, `checkOverlapAction`
  - [x]6.2 Create `apps/web/src/app/[locale]/dashboard/absences/_hooks/useAbsences.ts` with query/mutation hooks using `useServerActionQuery`/`useServerActionMutation`
  - [x]6.3 Create `apps/web/src/app/[locale]/dashboard/absences/page.tsx` (RSC entry)
  - [x]6.4 Create `_components/AbsenceRequestForm.tsx` — type grid (2x2 + "Other") with icons and colors, react-day-picker `mode="range"` for date range, optional reason textarea, overlap warning, submit CTA
  - [x]6.5 Create `_components/AbsenceTypeSelector.tsx` — 2x2 grid of type cards with icon, label, selected state
  - [x]6.6 Create `_components/AbsenceRequestList.tsx` — employee's own requests with status badges, type icons, date ranges, day counts
  - [x]6.7 Create `_components/AbsenceStatusBadge.tsx` — PENDING=orange, APPROVED=emerald, REJECTED=rose with uppercase label
  - [x]6.8 Update `DashboardLayoutClient.tsx` — add "Absences" nav item with `CalendarOff` icon
  - [x]6.9 Wire `AbsenceRequestForm` submission to `createAbsenceRequestAction` with success toast and list invalidation

- [x] **Task 7: Create admin-side web layer** (AC: #4, #5, #6, #9)
  - [x]7.1 Create `apps/web/src/app/[locale]/admin/employees/absences/page.tsx` (RSC entry)
  - [x]7.2 Create `apps/web/src/app/[locale]/admin/employees/absences/_actions/admin-absence-actions.ts` with `listAbsencesAction`, `reviewAbsenceAction`, `adminCreateAbsenceAction`, `countPendingAction`
  - [x]7.3 Create `apps/web/src/app/[locale]/admin/employees/absences/_hooks/useAdminAbsences.ts`
  - [x]7.4 Create `_components/AbsencePendingList.tsx` — card-based list with employee avatar/name, type icon, date range, day count, approve/reject action buttons
  - [x]7.5 Create `_components/AbsenceRejectDialog.tsx` — shadcn Dialog with rejection reason textarea + confirm/cancel
  - [x]7.6 Create `_components/AdminAbsenceForm.tsx` — admin direct-create form with employee selector dropdown + type + date range + reason
  - [x]7.7 Add status filter (tabs: All/Pending/Approved/Rejected)
  - [x]7.8 Add pending absence count badge to admin sidebar navigation (near employee management)

- [x] **Task 8: Add i18n translations** (AC: #11)
  - [x]8.1 Add `dashboard.absences` namespace in `en.json` (form labels, type names, status names, submit CTA, success/error messages, overlap warning, empty states)
  - [x]8.2 Add `dashboard.absences` namespace in `fr.json`
  - [x]8.3 Add `admin.absences` namespace in `en.json` (review actions, reject dialog, admin create, filter labels, nav label, pending badge)
  - [x]8.4 Add `admin.absences` namespace in `fr.json`
  - [x]8.5 Use ICU `select` for status text: `{status, select, pending {Pending} approved {Approved} rejected {Rejected} other {Unknown}}`
  - [x]8.6 Use ICU `plural` for day count: `{count, plural, =0 {No days} =1 {1 day} other {# days}}`

- [x] **Task 9: Comprehensive test suite** (AC: all)
  - [x]9.1 **Validators (Vitest, `*.test.ts`)**: accept valid absence request, reject invalid dates, reject endDate before startDate, require rejectionReason on reject action, accept valid admin create, accept list filters
  - [x]9.2 **API service (Jest, `*.spec.ts`)**: createAbsenceRequest creates PENDING, reviewAbsence APPROVE creates Unavailability in transaction, reviewAbsence REJECT stores reason + no Unavailability, adminCreateAbsence creates APPROVED + Unavailability atomically, listAbsences with filters, countPendingAbsences, checkOverlap detects collisions, clinic isolation for all operations, mapAbsenceTypeToUnavailability mapping
  - [x]9.3 **tRPC router (Jest, `*.spec.ts`)**: auth/subscription middleware enforced, EMPLOYEE ownership enforcement (can only create/view own), ADMIN can manage all, EMPLOYEE FORBIDDEN for reviewAbsence/adminCreateAbsence/countPendingAbsences, input validation
  - [x]9.4 **Web — Employee (Vitest, `*.spec.tsx`)**: AbsenceTypeSelector renders 5 types with icons, type selection toggles visual state, AbsenceRequestForm validates date range, AbsenceRequestForm shows overlap warning, AbsenceRequestList renders status badges, submission triggers mutation + toast, FR/EN rendering assertions
  - [x]9.5 **Web — Admin (Vitest, `*.spec.tsx`)**: AbsencePendingList renders pending requests, approve action calls reviewAbsenceAction, reject opens dialog then calls reviewAbsenceAction with reason, AdminAbsenceForm creates with auto-APPROVED, status filter switches list, pending badge count renders
  - [x]9.6 Root quality gates: `pnpm test` and `pnpm build` green

## Dev Notes

This story implements the **complete absence request lifecycle** — from employee submission to admin validation to planning integration. It bridges the existing employee self-service infrastructure (Story 5.4 dashboard) with the admin planning workflow (Stories 7.1-7.2). The `Absence` model already exists in the database (from initial schema) but has **zero backend or frontend implementation**. This story brings it to life.

### Critical Architecture Context

**What already exists and MUST NOT be recreated:**
- `Absence` model in `Planning.prisma` — has `id`, `startDate`, `endDate`, `reason`, `status` (PENDING/APPROVED/REJECTED), `employeeId`, `clinicId`. Needs schema extension (type, reviewedBy, reviewedAt, rejectionReason).
- `AbsenceStatus` enum — PENDING, APPROVED, REJECTED. No changes needed.
- `Unavailability` model + `UnavailabilityType` enum (SCHOOL, VACATION, SICK, OTHER) — the target for approved absences.
- `EmployeeService` — already handles Unavailability CRUD (`createConstraint`, `listConstraints`, `listHardRules`). Extend with absence methods.
- Employee dashboard at `/[locale]/dashboard/` with `EmployeeContext` (provides `employeeId`, `jobType`), layout auth guard, subscription check.
- `DashboardLayoutClient.tsx` with nav items (Home, School Days). Add "Absences" entry.
- `DashboardClient.tsx` has a **MOCK** `AbsenceRequestView` UI stub — replace with real implementation pointing to `/dashboard/absences/`.
- `MailService` — existing Resend infrastructure with React Email templates (SchoolDays, MagicLink, SchedulePublication).
- `SchedulerModule` + `@nestjs/schedule` — already installed and configured. Can optionally add reminder cron for stale pending requests.
- `QueryKeyFactory` — already has `employeeConstraints`, `schoolDays` patterns.
- `subscribedProcedure` pattern in `employee.router.ts` — follow identical composition.

**The core gap being filled:**
```
BEFORE (Story 7.2):
  Employee → no way to request time off from the app
  Admin → manually creates Unavailabilities for known absences
  Absence model → exists in DB but zero code references it
  DashboardClient.tsx → mock AbsenceRequestView (non-functional)

AFTER (Story 7.3):
  Employee → submits absence request from dashboard → admin notified
  Admin → reviews (approve/reject) from admin interface → employee notified
  Approved absence → Unavailability created atomically → planning Hard Rule
  Dashboard → real AbsenceRequestForm + AbsenceRequestList
  Admin → AbsencePendingList with approve/reject workflow
```

### Design Decision: AbsenceType Enum (NOT reusing UnavailabilityType)

Create a **separate `AbsenceType` enum** on the Absence model rather than reusing `UnavailabilityType`:

| AbsenceType | UX Label (FR) | UX Label (EN) | Icon | Color | Maps to UnavailabilityType |
|---|---|---|---|---|---|
| `PAID_LEAVE` | Congé payé | Paid Leave | `Plane` | `emerald` | `VACATION` |
| `SICK_LEAVE` | Arrêt maladie | Sick Leave | `Thermometer` | `rose` | `SICK` |
| `TRAINING` | Formation | Training | `GraduationCap` | `neutral` | `SCHOOL` |
| `CHILD_SICK` | Enfant malade | Child Sick | `Baby` | `blue` | `SICK` |
| `OTHER` | Autre | Other | `HelpCircle` | `neutral` | `OTHER` |

**Rationale:** AbsenceType represents the *employee's reason for requesting time off* (5 types matching the UX spec). UnavailabilityType represents the *planning engine's constraint category* (4 types). They serve different purposes. The mapping function `mapAbsenceTypeToUnavailability()` bridges them during approval.

### Design Decision: Atomic Approval = $transaction(Absence + Unavailability)

When an admin approves an absence, the status update AND Unavailability creation happen in a single Prisma `$transaction`:

```typescript
async reviewAbsence(clinicId: string, userId: string, absenceId: string, action: 'approve' | 'reject', rejectionReason?: string) {
  const absence = await this.prisma.absence.findUnique({ where: { id: absenceId }, include: { employee: true } });
  if (!absence || absence.clinicId !== clinicId) throw new NotFoundException();
  if (absence.status !== 'PENDING') throw new ConflictException('Absence already reviewed');

  if (action === 'approve') {
    await this.prisma.$transaction([
      this.prisma.absence.update({
        where: { id: absenceId },
        data: { status: 'APPROVED', reviewedBy: userId, reviewedAt: new Date() },
      }),
      this.prisma.unavailability.create({
        data: {
          clinicId,
          employeeId: absence.employeeId,
          type: mapAbsenceTypeToUnavailability(absence.type),
          startDate: absence.startDate,
          endDate: absence.endDate,
          reason: `Approved absence request`,
          daysOfWeek: [], // one-time constraint
        },
      }),
    ]);
    // Fire-and-forget: notify employee
  } else {
    await this.prisma.absence.update({
      where: { id: absenceId },
      data: { status: 'REJECTED', reviewedBy: userId, reviewedAt: new Date(), rejectionReason },
    });
    // Fire-and-forget: notify employee with reason
  }
}
```

This ensures that an approved absence ALWAYS has a corresponding Unavailability. If either operation fails, neither is committed.

### Design Decision: Employee Self-Service Enforcement

Follow the exact pattern from Story 5.4 (school days):

```typescript
// In employee.router.ts
employee.createAbsenceRequest: subscribedProcedure
  .input(createAbsenceRequestSchema)
  .mutation(async ({ ctx, input }) => {
    // EMPLOYEE role: can only create for themselves
    if (ctx.user.role === 'EMPLOYEE') {
      await ctx.employeeService.validateEmployeeOwnership(ctx.user.sub, input.employeeId);
    }
    // ADMIN role: can create for any clinic employee
    return ctx.employeeService.createAbsenceRequest(ctx.user.clinicId, input.employeeId, input);
  }),
```

### Design Decision: No SCHOOL Type in Absence Requests

The `TRAINING` absence type (formation) covers one-off training events. The `SCHOOL` type is NOT available in absence requests because:
- Apprentice school days are declared via the dedicated `declareSchoolDays` flow (Story 5.4)
- School days follow a monthly batch pattern (calendar multi-select), not an individual request pattern
- Mixing the two would create confusing duplication

If an employee needs to attend a one-off training session, they use `TRAINING` (maps to `UnavailabilityType.SCHOOL` in the planning engine).

### Backend: Absence Lifecycle Pipeline

```
Employee submits absence request
  │
  ├── EmployeeService.createAbsenceRequest(clinicId, employeeId, input)
  │     │
  │     ├── Validate employee belongs to clinic
  │     ├── Create Absence record (status: PENDING)
  │     ├── Fire-and-forget: notifyAdminsOfAbsenceRequest()
  │     └── Return created absence
  │
  ├── [Optional] Employee checks for overlaps
  │     └── EmployeeService.checkOverlap(clinicId, employeeId, startDate, endDate)
  │           └── Query approved Absences + Unavailabilities in date range
  │
Admin reviews absence request
  │
  ├── EmployeeService.reviewAbsence(clinicId, userId, absenceId, action, reason?)
  │     │
  │     ├── Validate absence exists, belongs to clinic, status is PENDING
  │     │
  │     ├── IF APPROVE:
  │     │     ├── $transaction: update Absence (APPROVED) + create Unavailability
  │     │     └── Fire-and-forget: notifyEmployeeOfApproval()
  │     │
  │     └── IF REJECT:
  │           ├── Update Absence (REJECTED, rejectionReason)
  │           └── Fire-and-forget: notifyEmployeeOfRejection()
  │
  └── Planning engine automatically picks up new Unavailability via listHardRules
```

### Employee Absence Request UI (Mobile-First)

```
┌─────────────────────────────────────────────────────┐
│ Demander une absence                                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐  ┌──────────────┐                │
│  │ ✈️ Congé payé │  │ 🤒 Maladie   │                │
│  │              │  │              │                │
│  └──────────────┘  └──────────────┘                │
│  ┌──────────────┐  ┌──────────────┐                │
│  │ 🎓 Formation │  │ 👶 Enfant    │                │
│  │              │  │    malade    │                │
│  └──────────────┘  └──────────────┘                │
│  ┌──────────────────────────────────┐              │
│  │ ❓ Autre                         │              │
│  └──────────────────────────────────┘              │
│                                                     │
│  ┌─────────────────────────────────────────────────┐│
│  │        📅 Date range picker                     ││
│  │        Du: [dd/mm/yyyy]  Au: [dd/mm/yyyy]       ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  ┌─────────────────────────────────────────────────┐│
│  │ Motif (optionnel)                               ││
│  │ ________________________________                ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  ⚠️ Chevauchement avec congé du 10/03 - 12/03      │
│                                                     │
│  ┌─────────────────────────────────────────────────┐│
│  │          Soumettre la demande                   ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### Admin Absence Validation UI (Desktop)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Demandes d'absence                              [3 en attente]       │
├──────────────────────────────────────────────────────────────────────┤
│ [Toutes] [En attente ●3] [Approuvées] [Refusées]                    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 🔵 Julie Martin (ASV)                          En attente     │  │
│  │ ✈️ Congé payé · Du 10/03 au 14/03 · 5 jours                  │  │
│  │ Motif: Vacances familiales                                    │  │
│  │                                                               │  │
│  │                              [✅ Approuver]  [❌ Refuser]     │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 🟢 Marc Dupont (VET)                           En attente     │  │
│  │ 🤒 Arrêt maladie · Du 17/03 au 19/03 · 3 jours              │  │
│  │ Motif: —                                                      │  │
│  │                                                               │  │
│  │                              [✅ Approuver]  [❌ Refuser]     │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Relationship to Existing Infrastructure

**Services consumed:**

| Service | Method | Purpose |
|---------|--------|---------|
| `EmployeeService` | NEW: `createAbsenceRequest()` | Employee submits absence request |
| `EmployeeService` | NEW: `reviewAbsence()` | Admin approves/rejects with $transaction |
| `EmployeeService` | NEW: `listAbsences()` | List with status/employee/month filters |
| `EmployeeService` | NEW: `getAbsenceById()` | Single absence detail |
| `EmployeeService` | NEW: `adminCreateAbsence()` | Admin direct creation (auto-approved) |
| `EmployeeService` | NEW: `countPendingAbsences()` | Nav badge count |
| `EmployeeService` | NEW: `checkOverlap()` | Overlap detection for warnings |
| `EmployeeService` | EXISTING: `findById()` | Employee ownership check |
| `EmployeeService` | EXISTING: `validateEmployeeOwnership()` | Self-service enforcement |
| `MailService` | NEW: `sendAbsenceRequestNotification()` | Admin email on new request |
| `MailService` | NEW: `sendAbsenceReviewNotification()` | Employee email on approve/reject |

**No new NestJS module** — extends existing `EmployeeModule` (where `Unavailability` CRUD already lives) + `EmployeeService` + `employee.router.ts`.

**TRPCServices** — no new service injection needed (`EmployeeService` already registered).

### Technical Requirements

- **Prisma schema extension**: Add `AbsenceType` enum + 4 new fields to `Absence` model. No new model needed.
- **Atomic approval**: `$transaction` wrapping Absence status update + Unavailability creation. If either fails, both rollback.
- **AbsenceType → UnavailabilityType mapping**: Pure utility function in `EmployeeService`. PAID_LEAVE→VACATION, SICK_LEAVE→SICK, TRAINING→SCHOOL, CHILD_SICK→SICK, OTHER→OTHER.
- **Self-service enforcement**: EMPLOYEE role can only submit/view own absences (same pattern as `declareSchoolDays`).
- **Overlap detection**: Query existing approved Absences and Unavailabilities for the employee in the date range. Return overlap details as a warning (NOT a blocker — admin decides).
- **react-day-picker `mode="range"`**: Use `DateRange` type `{ from: Date | undefined, to?: Date }`. Disable past dates with `disabled={{ before: new Date() }}`. Use `excludeDisabled` to prevent range spanning disabled dates. Pass `locale` from `date-fns/locale` matching current next-intl locale.
- **Fire-and-forget notifications**: Email delivery must NOT block the mutation response. Use `.catch(() => {})` on notification promise.
- **Day count calculation**: `differenceInCalendarDays(endDate, startDate) + 1` (inclusive count). Display in list and emails.
- **Pending badge count**: Lightweight query `prisma.absence.count({ where: { clinicId, status: 'PENDING' } })`. Polled via `useServerActionQuery` with `staleTime: 30_000` (30s cache).
- **Admin nav integration**: Add "Absences" link in admin sidebar (near "Employees") with red badge for pending count > 0.

### Architecture Compliance (NON-NEGOTIABLE)

Mandatory end-to-end flow:
```text
Page (RSC) -> Client Component -> Hook -> Zsa Hook -> Server Action -> tRPC Client -> NestJS Service -> Prisma
```

- All absence business logic in `EmployeeService` — NEVER compute approval/rejection in frontend
- All Unavailability creation happens server-side as part of the `reviewAbsence` $transaction
- tRPC procedures behind `subscribedProcedure` + role checks (ADMIN for review/admin-create, EMPLOYEE/ADMIN for submit/list)
- clinicId from `ctx.user.clinicId` — NEVER from client payload
- Input validation with Zod schemas from `@pawly/validators`
- Mutations invalidate `employeeAbsences`, `employeeConstraints`, `pendingAbsenceCount` React Query keys via `QueryKeyFactory`
- Notification emails via existing Resend infrastructure (from Story 5.4)
- Employee dashboard components receive `employeeId` from `useEmployeeContext()` (from EmployeeProvider in layout)
- Admin components use `clinicId` from auth context (same as all admin routes)

### Library & Framework Requirements

- **Prisma (`7.2.0`)**: Extend `Absence` model in `Planning.prisma`. Use `$transaction([...])` for atomic approval. No migration needed (Neon, `db:push`).
- **NestJS (`11.x`)**: Add 7 methods to `EmployeeService`. React Email templates for notifications. Fire-and-forget emails.
- **tRPC (`11.x`)**: Add 7 procedures to `employee.router.ts`. `subscribedProcedure` + role guards. Follow existing `declareSchoolDays`/`listSchoolDays` pattern.
- **Zod (`4.x` via `@pawly/zod`)**: `createAbsenceRequestSchema`, `reviewAbsenceSchema`, `listAbsencesSchema`, `absenceIdSchema`, `adminCreateAbsenceSchema`.
- **Next.js (`16.x`) + next-intl (`4.x`)**: New employee route at `/dashboard/absences/`. New admin route at `/admin/employees/absences/`. ICU `select` for status, `plural` for day count.
- **react-day-picker (via shadcn/ui Calendar)**: `mode="range"` for absence date range selection. `disabled={{ before: new Date() }}` for no-past-dates. `locale` prop from `date-fns/locale`. `excludeDisabled` for holiday-spanning ranges.
- **shadcn/ui**: `Dialog` for AbsenceRejectDialog (already installed), `Badge` for status (already installed), `Textarea` for reason/rejection, `Card` for request cards, `Tabs` for status filter.
- **Lucide icons**: `Plane` (paid leave), `Thermometer` (sick), `GraduationCap` (training), `Baby` (child sick), `HelpCircle` (other), `CalendarOff` (nav icon), `Check` (approve), `X` (reject).
- **Resend + @react-email/components**: 2 new email templates. Use `jsx` from `react/jsx-runtime` in NestJS `.tsx` files.
- **sonner**: Toast notifications for submit/approve/reject feedback (already installed).
- **date-fns**: `differenceInCalendarDays` for day count, `format` for date display, `fr` locale for French date formatting.
- **NO framer-motion** — CSS transitions for badge animations and card hover states.

### File Structure Requirements

**Files to create:**

```text
packages/validators/src/employee/
  absence.schema.ts
  absence.schema.test.ts

apps/api/src/modules/mail/templates/
  AbsenceRequestEmail.tsx
  AbsenceReviewEmail.tsx

apps/web/src/app/[locale]/dashboard/absences/
  page.tsx
  _actions/
    absence-actions.ts
  _hooks/
    useAbsences.ts
  _components/
    AbsenceRequestForm.tsx
    AbsenceTypeSelector.tsx
    AbsenceRequestList.tsx
    AbsenceStatusBadge.tsx
  __tests__/
    absence-request.spec.tsx

apps/web/src/app/[locale]/admin/employees/absences/
  page.tsx
  _actions/
    admin-absence-actions.ts
  _hooks/
    useAdminAbsences.ts
  _components/
    AbsencePendingList.tsx
    AbsenceRejectDialog.tsx
    AdminAbsenceForm.tsx
    AbsenceStatusFilter.tsx
  __tests__/
    admin-absences.spec.tsx
```

**Files to modify:**

- `apps/api/prisma/schema/Planning.prisma` (add AbsenceType enum + 4 new fields to Absence model + index)
- `apps/api/src/modules/employee/employee.service.ts` (add 7 absence methods + mapAbsenceTypeToUnavailability helper)
- `apps/api/src/modules/employee/employee.service.spec.ts` (add absence method tests)
- `apps/api/src/trpc/routers/employee.router.ts` (add 7 absence procedures)
- `apps/api/src/trpc/routers/employee.router.spec.ts` (add absence router tests)
- `apps/api/src/modules/mail/mail.service.tsx` (add 2 absence notification methods)
- `packages/validators/src/employee/index.ts` (export absence schemas)
- `apps/web/src/lib/hooks/server-action-hooks.ts` (add absences, absencesByMonth, pendingAbsenceCount query keys)
- `apps/web/src/app/[locale]/dashboard/_components/DashboardLayoutClient.tsx` (add Absences nav item)
- `apps/web/src/app/[locale]/dashboard/_components/DashboardClient.tsx` (replace mock AbsenceRequestView with link to /dashboard/absences)
- `apps/web/src/i18n/langs/en.json` (add dashboard.absences + admin.absences namespaces)
- `apps/web/src/i18n/langs/fr.json` (add dashboard.absences + admin.absences namespaces)

**Structure constraints:**
- Employee absence UI lives under `/dashboard/absences/` (employee portal) — NOT under admin
- Admin absence review UI lives under `/admin/employees/absences/` (admin management) — grouped with employee management
- `EmployeeService` handles all absence logic (no new module) since it already owns Unavailability CRUD
- Approval $transaction creates Unavailability in same service — no cross-module dependency
- React Email templates stay in `apps/api/src/modules/mail/templates/` (co-located with MailService)
- Employee components receive `employeeId` from `useEmployeeContext()` — not from URL params
- Admin components use `clinicId` from auth context — standard pattern

### Testing Requirements

**Validators (Vitest, `*.test.ts`):**
- accept valid createAbsenceRequest with all AbsenceType values
- reject createAbsenceRequest with endDate before startDate
- reject createAbsenceRequest with invalid type
- reject createAbsenceRequest with missing required fields (employeeId, type, startDate, endDate)
- accept reviewAbsence with action "approve" (no rejectionReason needed)
- accept reviewAbsence with action "reject" and rejectionReason
- reject reviewAbsence with action "reject" and missing rejectionReason
- accept listAbsences with all optional filters
- accept listAbsences with no filters (all optional)
- accept adminCreateAbsence with valid input

**API service tests (Jest, `*.spec.ts`):**
- `createAbsenceRequest` creates Absence with PENDING status
- `createAbsenceRequest` triggers admin notification (verify MailService call)
- `createAbsenceRequest` rejects employee from different clinic
- `reviewAbsence` APPROVE: updates status + creates Unavailability in $transaction
- `reviewAbsence` APPROVE: maps AbsenceType to UnavailabilityType correctly (all 5 types)
- `reviewAbsence` APPROVE: triggers employee approval notification
- `reviewAbsence` REJECT: updates status + stores rejectionReason, no Unavailability created
- `reviewAbsence` REJECT: triggers employee rejection notification with reason
- `reviewAbsence` throws ConflictException for already-reviewed absence
- `reviewAbsence` throws NotFoundException for wrong clinic
- `adminCreateAbsence` creates APPROVED Absence + Unavailability atomically
- `adminCreateAbsence` triggers employee notification
- `listAbsences` filters by status (PENDING, APPROVED, REJECTED)
- `listAbsences` filters by employeeId
- `listAbsences` includes employee name and jobType
- `countPendingAbsences` returns correct count
- `checkOverlap` detects overlapping approved absence
- `checkOverlap` detects overlapping unavailability
- `checkOverlap` returns empty for non-overlapping dates
- `mapAbsenceTypeToUnavailability` returns correct mapping for all types
- clinic isolation for all absence operations

**tRPC router tests (Jest, `*.spec.ts`):**
- auth/subscription middleware enforced for all 7 procedures
- EMPLOYEE can createAbsenceRequest for own employeeId
- EMPLOYEE FORBIDDEN for createAbsenceRequest with different employeeId
- EMPLOYEE can listAbsences (filtered to own)
- EMPLOYEE can getAbsence (own only)
- EMPLOYEE FORBIDDEN for reviewAbsence
- EMPLOYEE FORBIDDEN for adminCreateAbsence
- EMPLOYEE FORBIDDEN for countPendingAbsences
- ADMIN can execute all 7 procedures for any clinic employee
- input validation rejects invalid absenceId format
- input validation rejects invalid date range

**Web — Employee tests (Vitest, `*.spec.tsx`):**
- AbsenceTypeSelector renders 5 type cards with correct icons
- AbsenceTypeSelector toggles selected state on click
- AbsenceRequestForm disables submit when type not selected
- AbsenceRequestForm disables submit when date range incomplete
- AbsenceRequestForm shows overlap warning when detected
- AbsenceRequestForm calls createAbsenceRequestAction on valid submit
- AbsenceRequestList renders requests with correct status badges
- AbsenceRequestList shows rejection reason for rejected requests
- AbsenceStatusBadge renders correct color per status
- Success toast appears after submission
- FR/EN rendering assertions for type labels and status text

**Web — Admin tests (Vitest, `*.spec.tsx`):**
- AbsencePendingList renders pending requests with employee info
- AbsencePendingList approve button calls reviewAbsenceAction with "approve"
- AbsenceRejectDialog opens on reject click
- AbsenceRejectDialog requires reason before confirm
- AbsenceRejectDialog calls reviewAbsenceAction with "reject" and reason
- AdminAbsenceForm creates absence with auto-approved status
- Status filter tabs show correct counts
- Pending badge renders count when > 0
- Pending badge hidden when count === 0
- FR/EN rendering assertions

**Quality gates before PR (run from repository root):**
- `pnpm test`
- `pnpm build`
- `pnpm lint`

### Previous Story Intelligence (Story 7.2 + 7.1 + 5.4 + 5.2) — EXHAUSTIVE

**Story 7.2 (Equity Alerts Management — Soft Rules):**
- `PlanningHealthBar` now renders in `ScheduleViewWrapper` — publication workflow is live. Approved absences from Story 7.3 will automatically appear as Unavailabilities in the grid (absence cells) and reduce holes/conflicts.
- `employeeViolationMap` concept — employee-level violations appear next to name. Similarly, pending absence count could show as a badge in admin nav.
- `PublishConfirmDialog` pattern — reuse for `AbsenceRejectDialog` (shadcn AlertDialog with reason input).
- `usePublish.ts` hook pattern — follow for `useAdminAbsences.ts` (mutation + query combined).
- Code review: i18n structured `messageKey`/`messageParams` pattern for violation messages — use same pattern for absence status text.
- 1585 total tests (565 API + 517 Web + 503 Validators).

**Story 7.1 (Manual Schedule Adjustment — Drag & Drop):**
- `AssignShiftModal` lists employees with eligibility — similar card-based list pattern for admin absence review.
- Optimistic UI with `onMutate`/`onSettled` for mutations — NOT needed for absence approval (non-latency-critical action). Use simple mutation with `onSuccess` invalidation.
- `preValidateMove` pattern — similar concept to `checkOverlap` (dry-run validation before action).
- `source: 'MANUAL'` on Shift — no impact on absence workflow.

**Story 5.4 (Monthly School Day Declaration — Apprentices):**
- Employee dashboard route at `/[locale]/dashboard/` — Story 7.3 adds `/dashboard/absences/` sibling route.
- `EmployeeContext` provides `employeeId` and `jobType` — reuse for absence form.
- `DashboardLayoutClient.tsx` nav items — add "Absences" with `CalendarOff` icon.
- `SchoolDayCalendar.tsx` uses `mode="multiple"` — Story 7.3 uses `mode="range"` for date range selection (different picker mode).
- `declareSchoolDaysAction` pattern — follow for `createAbsenceRequestAction`.
- `useSchoolDays.ts` hook pattern — follow for `useAbsences.ts`.
- Fire-and-forget email notifications with `.catch(() => {})` — apply to absence notifications.
- `WEB_APP_URL` env var for email links — use for absence detail links in admin notification emails.
- Self-service enforcement via `validateEmployeeOwnership()` — apply identical guard.
- 703 total tests at completion.

**Story 5.2 (Declarative Constraints Configuration):**
- `Unavailability` model CRUD in `EmployeeService` — Story 7.3 creates Unavailabilities as a side effect of approval. Use `prisma.unavailability.create()` with `daysOfWeek: []` (one-time constraint).
- `createConstraint` method pattern — the approval path creates an Unavailability with type mapped from AbsenceType.
- Multi-tenant enforcement: `findById(clinicId, employeeId)` pattern for ownership checks — apply to absence operations.
- `subscribedProcedure` composition LOCAL in router file — follow identical pattern.
- `EmployeeConstraintsPanel` UI pattern — follow card-based list with actions.
- Hard-rule projection: approved absences automatically appear in `listHardRules` since they become Unavailabilities — no changes to planning algorithm needed.

**Cross-cutting learnings:**
- `useServerActionMutation` wraps React Query `useMutation` — use `onSuccess` with `queryClient.invalidateQueries()`.
- Zod `.refine()` creates ZodEffects — use `.superRefine()` for cross-field validation (endDate >= startDate, rejectionReason required on reject).
- Test patterns: API = Jest `*.spec.ts`, Web = Vitest `*.spec.tsx`, Validators = Vitest `*.test.ts`.
- `placeholderData: (prev) => prev` prevents skeleton flash during refetch.
- `staleTime: 0` + `refetchOnMount: "always"` for data that changes server-side.
- React Email templates in NestJS: use `jsx` from `react/jsx-runtime` in `.tsx` files.

### Git Intelligence Summary

Recent commit trajectory:
- `425f8093` — `Merge pull request #29 from yabafre/feature/story-7-2-equity-alerts-management-soft-rules`
- `eb24ec60` — `fix(story-7-2): address 8 code review findings from PR #29`
- `bb4dd274` — `feat(story-7-2): Equity alerts management, publish workflow & code review fixes`
- `6fb50570` — `feat(story-7-1): Manual schedule adjustment with drag-and-drop (#28)`

Story 7.3 is the natural continuation: 7.1 added interactive editing, 7.2 added equity intelligence + publish workflow, 7.3 adds the absence request lifecycle that feeds new Hard Rules into the planning system. The Unavailability infrastructure from Story 5.2 is now consumed from both directions: admin-entered constraints AND employee-submitted approved absences.

### Latest Tech Information (Context7 + Skills Research)

- **react-day-picker `mode="range"`**: `selected` accepts `DateRange` type `{ from: Date | undefined, to?: Date }`. `onSelect` receives the updated `DateRange`. Use `min={1}` to prevent zero-length ranges. `excludeDisabled` resets range if it spans a disabled date. `locale` prop from `date-fns/locale` for French formatting. `disabled={{ before: new Date() }}` for past dates.
- **@nestjs/schedule**: Already installed in project (Story 5.4). `ScheduleModule.forRoot()` already in AppModule. Can optionally add a `@Cron('0 9 * * 1', { timeZone: 'Europe/Paris' })` to send weekly digest of stale pending requests — but this is OPTIONAL for Story 7.3.
- **next-intl ICU format**: Use `{status, select, pending {En attente} approved {Approuvée} rejected {Refusée} other {Inconnu}}` for status display. Use `{count, plural, =0 {Aucun jour} =1 {1 jour} other {# jours}}` for day count.
- **Resend**: Use `@react-email/components` barrel import for template components (Html, Head, Body, Container, Section, Heading, Text, Button, Preview). Use `<Preview>` for inbox preview text. Template files in `apps/api/src/modules/mail/templates/`.
- **Turborepo**: All pnpm commands from root. New dependencies (none expected — all libs already installed) would go to `apps/api/package.json` or `apps/web/package.json` specifically.
- **Vercel React Best Practices**: Employee form as client component with proper separation from RSC page. Use `React.Suspense` boundaries for admin absence list loading states.
- **NestJS Best Practices**: Keep approval logic in EmployeeService (not controller/router). Use `$transaction` for atomicity. Typed exceptions (NotFoundException, ConflictException, ForbiddenException).
- **Stripe plugin**: No Stripe changes in this story. Subscription guard (`subscribedProcedure`) remains unchanged. Source of truth = Stripe webhooks.

### Project Structure Notes

- The `Absence` model exists in `Planning.prisma` alongside `Shift`, `PlanningTemplate`, `VarianceEvent` — it's in the planning domain schema file. However, the CRUD operations belong in `EmployeeService` because absences are per-employee and the service already handles Unavailability CRUD. This cross-domain placement is acceptable since Prisma models are shared anyway.
- The employee dashboard expands from 2 nav items (Home, School Days) to 3 (Home, School Days, Absences). Future Epic 8 stories will add Schedule and Presence items.
- The mock `AbsenceRequestView` in `DashboardClient.tsx` should be replaced with a link/CTA card to `/dashboard/absences` — do NOT try to embed the full form on the home page.
- Admin absence management lives under `/admin/employees/absences/` rather than `/admin/planning/` because absences are fundamentally an employee management feature. The planning impact (Unavailability creation) is a backend side effect, not a frontend concern.
- The `checkOverlap` method is a **warning** mechanism, NOT a blocker. Overlapping absence requests are valid (the admin decides). This matches the project principle: "The system flags, the admin decides."

### References

- [Source: docs/planning-artifacts/epics.md#Story 7.3 — Absence Request and Validation Workflow]
- [Source: docs/planning-artifacts/prd.md#FR7 — System blocks shifts conflicting with Hard Rules (Leave, School)]
- [Source: docs/planning-artifacts/architecture.md#Data Flow (Non-Negotiable), Authentication & Security, API Patterns]
- [Source: docs/planning-artifacts/ux-design-specification.md#Absence Request Flow — Type Selection Grid, Card-based List, Badge Statuses]
- [Source: docs/planning-artifacts/ux-design-specification.md#Effortless Interactions — One-Tap Compliance, Magic Link Entry]
- [Source: docs/planning-artifacts/ux-design-specification.md#Emotional Design — Respectful Feedback, Calm Efficiency]
- [Source: docs/implementation-artifacts/7-2-equity-alerts-management-soft-rules.md — PublishConfirmDialog pattern, i18n messageKey pattern]
- [Source: docs/implementation-artifacts/7-1-manual-schedule-adjustment-drag-drop.md — AssignShiftModal card list, preValidateMove dry-run pattern]
- [Source: docs/implementation-artifacts/5-4-monthly-school-day-declaration-apprentices.md — Employee dashboard, EmployeeContext, self-service enforcement, fire-and-forget emails, Resend infrastructure]
- [Source: docs/implementation-artifacts/5-2-declarative-constraints-configuration.md — Unavailability CRUD, createConstraint, hard-rule projection, multi-tenant enforcement]
- [Source: apps/api/prisma/schema/Planning.prisma — Existing Absence model (no type, no reviewedBy)]
- [Source: apps/api/prisma/schema/Employee.prisma — Unavailability model, UnavailabilityType enum]
- [Source: apps/api/src/modules/employee/employee.service.ts — Constraint CRUD, validateEmployeeOwnership]
- [Source: apps/api/src/trpc/routers/employee.router.ts — subscribedProcedure, self-service guard pattern]
- [Source: apps/web/src/app/[locale]/dashboard/ — Employee portal layout, EmployeeContext, DashboardLayoutClient nav]
- [Source: apps/web/src/app/[locale]/dashboard/_components/DashboardClient.tsx — Mock AbsenceRequestView stub]
- [Source: apps/web/src/lib/hooks/server-action-hooks.ts — QueryKeyFactory pattern]
- [Source: apps/api/src/modules/mail/mail.service.tsx — Resend email infrastructure, React Email templates]
- [Source: Context7 react-day-picker — mode="range", DateRange type, excludeDisabled, locale]
- [Source: Context7 @nestjs/schedule — @Cron decorator, SchedulerRegistry, timezone-aware scheduling]
- [Source: Context7 next-intl — ICU message format: select, plural, rich text]
- [Source: Context7 Resend + @react-email/components — Template structure, Preview component, jsx runtime usage]

### Dev Agent Record

#### Agent Model Used

Claude Opus 4.6

#### Debug Log References

_None recorded._

#### Completion Notes List

_None recorded._

#### Senior Developer Review (AI) — 2026-02-24

**Reviewer:** Claude Opus 4.6 (Adversarial Code Review)
**Outcome:** Approved (all issues fixed)
**Skills used:** context7, turborepo, vercel-react-best-practices, frontend-design, nestjs-best-practices, stripe

**Summary:** 19 findings (5 Critical, 11 Medium, 3 Low), all resolved.

**Critical Issues Fixed:**
- C1: `reviewAbsence` `$transaction` array→callback form with PENDING re-check inside tx (race condition protection)
- C2: Duplicate admin nav entries (absences + requests) — deduplicated to single entry
- C3: `AdminAbsenceForm` inline `createServerAction` → imported from server action file (data flow violation)
- C4: Form state reset on submit instead of onSuccess (stale UI on error)
- C5: `adminCreateAbsence` same $transaction callback pattern with atomic guard

**Medium Issues Fixed:**
- M1: adminCreateAbsence $transaction callback form
- M3: `getAbsence` tRPC procedure — security-first pattern (lookup employee before fetching absence)
- M4: Rejection test assertion `.toMatchObject({ code: 'BAD_REQUEST' })` instead of `.toThrow()`
- M5: `checkOverlap` missing `findById` employee existence guard
- M6: ARIA `role="tablist"` / `role="tab"` / `aria-selected` on AbsenceStatusFilter
- M7: Type selector label showed reason key instead of selectType key
- M8: `useReviewAbsence` refactored from fragile `variables` cast to dedicated `approve(id)` / `reject(id, reason)` API
- M9: Month regex strengthened to `(0[1-9]|1[0-2])` (was `\d{2}`, allowed 00, 13)
- M11: Overlap input simplified

**Low Issues Fixed:**
- L1: `adminCreateAbsenceSchema` simplified to `= createAbsenceRequestSchema` (removed duplication)

**UI Feedback Fixes (post-review):**
- Admin nav deduplicated (removed /admin/requests, kept /admin/employees/absences with "requests" label)
- AdminAbsenceForm converted to Dialog popup (was inline form)
- AbsencePendingList cards redesigned to match employee AbsenceRequestList style
- React Query cache invalidation fixed: `["admin-absences"]` prefix match instead of `["admin-absences", "all"]`

**Test Results:** 1793 total (648 API + 589 Web + 556 Validators) — all passing
**Build:** Green (8/8 turbo tasks)

#### Validation Checklist

- [x] Story file loaded from `docs/implementation-artifacts/7-3-absence-request-validation-workflow.md`
- [x] Story Status verified as reviewable (review)
- [x] Epic and Story IDs resolved (7.3)
- [x] Story Context located
- [x] Architecture/standards docs loaded
- [x] Tech stack detected (NestJS, tRPC, Prisma, Next.js, zsa, React Query, shadcn/ui)
- [x] Acceptance Criteria cross-checked against implementation (11/11 ACs verified)
- [x] File List reviewed and validated for completeness (was empty, now populated with 13 modified + 23 created)
- [x] Tests identified and mapped to ACs; gaps noted and addressed
- [x] Code quality review performed on changed files
- [x] Security review performed (race condition fix, auth guard, multi-tenant isolation)
- [x] Outcome: Approved (all HIGH/MEDIUM/CRITICAL fixed)
- [x] Review notes appended under "Senior Developer Review (AI)"
- [x] Status updated: review → done
- [x] Sprint status synced: 7-3-absence-request-validation-workflow → done
- [x] Story saved successfully

## File List

**Modified:**
- `apps/api/prisma/schema/Planning.prisma` — Added AbsenceType enum, extended Absence model (type, reviewedBy, reviewedAt, rejectionReason, @@index)
- `apps/api/src/modules/employee/employee.service.ts` — 7 absence methods (createAbsenceRequest, reviewAbsence w/ $transaction callback, listAbsences, getAbsenceById, adminCreateAbsence, countPendingAbsences, checkOverlap) + mapAbsenceTypeToUnavailability
- `apps/api/src/modules/employee/employee.service.spec.ts` — 43 absence service tests
- `apps/api/src/trpc/routers/employee.router.ts` — 7 absence tRPC procedures with role guards, security-first getAbsence
- `apps/api/src/trpc/routers/employee.router.spec.ts` — 41 absence router tests
- `apps/api/src/modules/mail/mail.service.tsx` — sendAbsenceRequestNotification + sendAbsenceReviewNotification
- `packages/validators/src/employee/index.ts` — Export absence schemas
- `apps/web/src/lib/hooks/server-action-hooks.ts` — QueryKeyFactory: adminAbsences, pendingAbsenceCount, employeeAbsences
- `apps/web/src/app/[locale]/dashboard/_components/DashboardClient.tsx` — Replaced mock AbsenceRequestView with real Link
- `apps/web/src/app/[locale]/dashboard/_components/DashboardLayoutClient.tsx` — Added Absences nav item (CalendarOff icon)
- `apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx` — Added absences nav entry (CalendarOff icon, "requests" label)
- `apps/web/src/i18n/langs/en.json` — dashboard.absences + admin.absences namespaces
- `apps/web/src/i18n/langs/fr.json` — dashboard.absences + admin.absences namespaces

**Created:**
- `packages/validators/src/employee/absence.schema.ts` — 5 Zod schemas (createAbsenceRequest, reviewAbsence, listAbsences, absenceId, adminCreateAbsence) + ABSENCE_TYPES/ABSENCE_STATUSES constants
- `packages/validators/src/employee/absence.schema.test.ts` — 51 validator tests
- `apps/api/src/modules/mail/templates/AbsenceRequestEmail.tsx` — React Email template for admin notification
- `apps/api/src/modules/mail/templates/AbsenceReviewEmail.tsx` — React Email template for employee notification
- `apps/web/src/components/ui/textarea.tsx` — shadcn Textarea component
- `apps/web/src/app/[locale]/dashboard/absences/page.tsx` — RSC entry
- `apps/web/src/app/[locale]/dashboard/absences/_actions/absence-actions.ts` — Server actions (createAbsenceRequest, listMyAbsences, checkOverlap)
- `apps/web/src/app/[locale]/dashboard/absences/_hooks/useAbsences.ts` — Query/mutation hooks
- `apps/web/src/app/[locale]/dashboard/absences/_components/AbsenceRequestForm.tsx` — Type selector + calendar + overlap warning + submit
- `apps/web/src/app/[locale]/dashboard/absences/_components/AbsenceTypeSelector.tsx` — 2x2 grid type cards with icons/colors
- `apps/web/src/app/[locale]/dashboard/absences/_components/AbsenceRequestList.tsx` — Employee request list with status badges
- `apps/web/src/app/[locale]/dashboard/absences/_components/AbsenceStatusBadge.tsx` — Status badge component
- `apps/web/src/app/[locale]/dashboard/absences/_components/AbsencePageClient.tsx` — Employee absence page orchestrator
- `apps/web/src/app/[locale]/dashboard/absences/__tests__/absence-request.spec.tsx` — 35 employee web tests
- `apps/web/src/app/[locale]/admin/employees/absences/page.tsx` — RSC entry
- `apps/web/src/app/[locale]/admin/employees/absences/_actions/admin-absence-actions.ts` — Server actions (listAbsences, reviewAbsence, adminCreateAbsence, countPending, listEmployees)
- `apps/web/src/app/[locale]/admin/employees/absences/_hooks/useAdminAbsences.ts` — Admin hooks (useAdminAbsences, useReviewAbsence, useAdminCreateAbsence, usePendingAbsenceCount)
- `apps/web/src/app/[locale]/admin/employees/absences/_components/AdminAbsencePageClient.tsx` — Admin page orchestrator with Dialog trigger
- `apps/web/src/app/[locale]/admin/employees/absences/_components/AbsencePendingList.tsx` — Card-based list with approve/reject actions
- `apps/web/src/app/[locale]/admin/employees/absences/_components/AbsenceRejectDialog.tsx` — AlertDialog with rejection reason
- `apps/web/src/app/[locale]/admin/employees/absences/_components/AdminAbsenceForm.tsx` — Dialog form for admin direct creation
- `apps/web/src/app/[locale]/admin/employees/absences/_components/AbsenceStatusFilter.tsx` — Tab filter (All/Pending/Approved/Rejected)
- `apps/web/src/app/[locale]/admin/employees/absences/__tests__/admin-absences.spec.tsx` — 39 admin web tests
