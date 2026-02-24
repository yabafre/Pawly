# Story 7.5: Admin Variance View (Time & Discrepancies Module)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to compare planned shifts vs. actual confirmed attendance,
so that I can track deviations, manage exceptions, and prepare accurate data for payroll.

## Acceptance Criteria

1. **Given** the admin dashboard **When** I access the "Variance View" at `/admin/planning/variance` **Then** I see a summary table highlighting differences between "Planned" and "Confirmed" (VarianceEvents) with color-coded indicators: On-Time (green), Late (yellow/orange), Missed/No-Show (red), Exception (orange with flag icon).
2. **Given** the variance table **When** I interact with the filter controls **Then** I can filter by date range (month selector), employee (dropdown), and variance type (tabs: ALL, PENDING, APPROVED, REJECTED).
3. **Given** a variance event with status PENDING and type NO_SHOW or with an employee-declared exception **When** I click "Approve" **Then** the event status changes to APPROVED, the admin userId and timestamp are recorded, and a success toast is shown.
4. **Given** a variance event with status PENDING **When** I click "Reject" **Then** a dialog asks for a mandatory exception note, and upon confirmation the event status changes to REJECTED with the note recorded.
5. **Given** variance events in the table **When** I click "Export CSV" **Then** the currently filtered data is downloaded as a UTF-8 CSV file (with BOM for Excel) containing: Employee, Job Type, Date, Shift Type, Variance Type, Planned Time, Actual Time, Deviation (min), Status.
6. **Given** the variance page **When** data is loaded **Then** aggregated statistics cards show: total variance events count, pending count, average deviation (min), and no-show count for the selected period.
7. **Given** the admin navigation sidebar **When** I view the nav items **Then** a "Variance" entry appears under the Planning section with an appropriate icon.
8. **Given** the variance page **When** a screen reader is active **Then** the status filter uses `role="tablist"` / `role="tab"` with `aria-selected`, approve/reject buttons have descriptive `aria-label`, and statistics cards are announced properly.
9. **Given** the variance page **When** data is loading **Then** a skeleton loading state is shown. **When** an error occurs **Then** an error boundary with retry button is displayed.
10. **Given** the VarianceEvent Prisma model **When** the schema is enhanced **Then** it includes `status` (enum PENDING/APPROVED/REJECTED), `deltaMinutes` (pre-computed Int), `reviewedBy`, `reviewedAt`, `exceptionNote`, `updatedAt` fields, and a `@@index([clinicId, status])` composite index.

## Tasks / Subtasks

- [x] Task 1: Enhance VarianceEvent Prisma model (AC: #10)
  - [x] 1.1 Add `VarianceEventStatus` enum (PENDING, APPROVED, REJECTED) to `Planning.prisma`
  - [x] 1.2 Add `VarianceEventType` enum (CLOCK_IN_DEVIATION, CLOCK_OUT_DEVIATION, NO_SHOW, EARLY_DEPARTURE) to `Planning.prisma`
  - [x] 1.3 Enhance `VarianceEvent` model: change `type` from `String` to `VarianceEventType` enum, add `deltaMinutes Int @map("delta_minutes")`, `status VarianceEventStatus @default(PENDING)`, `reviewedBy String? @map("reviewed_by")`, `reviewedAt DateTime? @map("reviewed_at")`, `exceptionNote String? @map("exception_note")`, `updatedAt DateTime @updatedAt @map("updated_at")`
  - [x] 1.4 Add composite index `@@index([clinicId, status])` for filter queries
  - [x] 1.5 Run `pnpm db:generate` and `pnpm db:push` from project root

- [x] Task 2: Create Zod validators (AC: #2, #3, #4, #5)
  - [x] 2.1 Create `packages/validators/src/planning/variance.schema.ts` with `import { z } from "@pawly/zod"`
  - [x] 2.2 Export `VARIANCE_EVENT_STATUSES`, `VARIANCE_EVENT_TYPES` const arrays and their inferred types
  - [x] 2.3 Create `listVarianceEventsSchema` (status?: enum, employeeId?: uuid, month?: YYYY-MM regex `(0[1-9]|1[0-2])`, type?: enum)
  - [x] 2.4 Create `reviewVarianceSchema`: base = `z.object({ varianceId: z.string().uuid(), action: z.enum(["approve", "reject"]), exceptionNote: z.string().optional() })`, then `.refine(d => d.action !== "reject" || (d.exceptionNote && d.exceptionNote.trim().length > 0), { message: "Exception note required for rejection", path: ["exceptionNote"] })`. CRITICAL: `.refine()` creates ZodEffects — cannot `.merge()` later. Keep base as plain object FIRST, then refine
  - [x] 2.5 Create `getVarianceStatsSchema` (month?: YYYY-MM regex)
  - [x] 2.6 Create `exportVarianceSchema` (month: YYYY-MM regex, employeeId?: uuid)
  - [x] 2.7 Export all from `packages/validators/src/planning/index.ts`
  - [x] 2.8 Write validator tests in `packages/validators/src/planning/variance.schema.test.ts`

- [x] Task 3: Create VarianceService in PlanningModule (AC: #1, #3, #4, #5, #6)
  - [x] 3.1 Create `apps/api/src/modules/planning/variance.service.ts` with `@Injectable()` and `PrismaService` injection
  - [x] 3.2 Implement `listVarianceEvents(clinicId, filters)` — query VarianceEvent with Shift→Employee include, date range filter from month string using `plannedTime` field (NOT `createdAt` — filter by when the shift was planned, not when the event was created), optional status/type/employeeId filters, orderBy `plannedTime desc`
  - [x] 3.3 Implement `reviewVariance(clinicId, userId, varianceId, action, exceptionNote?)` — follow Absence review pattern: validate PENDING status guard → `$transaction` callback with double-check → update status/reviewedBy/reviewedAt/exceptionNote
  - [x] 3.4 Implement `getVarianceStats(clinicId, month?)` — `Promise.all` parallel queries: `groupBy(['type'])` with `_count` + `_avg`, `groupBy(['status'])` with `_count`, `aggregate()` with `_count` + `_sum` + `_avg` on deltaMinutes
  - [x] 3.5 Implement `countPendingVarianceEvents(clinicId)` — `count({ where: { clinicId, status: 'PENDING' } })`
  - [x] 3.6 Implement `exportVarianceCsv(clinicId, filters)` — returns CSV string with header + rows, proper escaping (quotes, commas), French column names
  - [x] 3.7 Register `VarianceService` in `planning.module.ts` providers AND exports

- [x] Task 4: Create tRPC variance router (AC: #1, #3, #4, #5, #6)
  - [x] 4.1 Create `apps/api/src/trpc/routers/variance.router.ts` with 5 procedures:
    - `list` (subscribedProcedure, query) — calls `varianceService.listVarianceEvents`
    - `review` (subscribedProcedure, mutation, adminOnly guard) — calls `varianceService.reviewVariance`
    - `getStats` (subscribedProcedure, query) — calls `varianceService.getVarianceStats`
    - `countPending` (subscribedProcedure, query, **adminOnly guard**) — calls `varianceService.countPendingVarianceEvents`
    - `exportCsv` (subscribedProcedure, **mutation**, adminOnly guard) — calls `varianceService.exportVarianceCsv` (mutation, NOT query — avoids React Query caching of large CSV strings)
  - [x] 4.2 Add `varianceService: VarianceService` to `TRPCServices` in `apps/api/src/trpc/context.ts`
  - [x] 4.3 Inject `VarianceService` in `TRPCMiddleware` and `TRPCService` constructors in `apps/api/src/trpc/trpc.module.ts` (BOTH classes, same double-registration pattern)
  - [x] 4.4 Add `variance: varianceRouter` to `apps/api/src/trpc/routers/_app.ts`

- [x] Task 5: Create server actions and hooks (AC: #1, #2, #3, #4, #5, #6)
  - [x] 5.1 Create `apps/web/src/app/[locale]/admin/planning/variance/_actions/variance-actions.ts` with `"use server"` directive:
    - `listVarianceEventsAction` → `trpc.variance.list.query(input)`
    - `reviewVarianceAction` → `trpc.variance.review.mutate(input)`
    - `getVarianceStatsAction` → `trpc.variance.getStats.query(input)`
    - `countPendingVarianceAction` → `trpc.variance.countPending.query()`
    - `exportVarianceCsvAction` → `trpc.variance.exportCsv.query(input)`
  - [x] 5.2 Add QueryKeyFactory entries in `apps/web/src/lib/hooks/server-action-hooks.ts`:
    - `varianceEvents: (filter?: string) => ["variance-events", filter ?? "all"]`
    - `pendingVarianceCount: () => ["variance-events", "pending-count"]`
    - `varianceStats: (month?: string) => ["variance-events", "stats", month ?? "all"]`
  - [x] 5.3 Create `apps/web/src/app/[locale]/admin/planning/variance/_hooks/useAdminVariance.ts`:
    - `useAdminVarianceEvents(filters?)` — `useServerActionQuery` with `placeholderData: (prev) => prev`
    - `useVarianceStats(month?)` — `useServerActionQuery`
    - `usePendingVarianceCount()` — `useServerActionQuery` with `refetchInterval: 30_000` (poll every 30s to keep pending badge count fresh)
    - `useReviewVariance()` — `useServerActionMutation` with `onSuccess` invalidating `["variance-events"]` prefix + `pendingVarianceCount()`
    - `useExportVarianceCsv()` — `useServerActionMutation` (mutation, NOT query — avoids caching large CSV strings) with `onSuccess` triggering client-side Blob download

- [x] Task 6: Create admin variance UI page and components (AC: #1, #2, #6, #7, #8, #9)
  - [x] 6.1 Create RSC page `apps/web/src/app/[locale]/admin/planning/variance/page.tsx` — `setRequestLocale(locale)` + render `<VariancePageClient />`
  - [x] 6.2 Create `loading.tsx` (skeleton: 4 stat cards + table skeleton) and `error.tsx` (AlertCircle + retry button)
  - [x] 6.3 Create `_components/VariancePageClient.tsx` — orchestrator with month state, filters, pending badge count, renders: VarianceStatsPanel → VarianceStatusFilter → VarianceEventList → Export button
  - [x] 6.4 Create `_components/VarianceStatsPanel.tsx` — 4 summary cards (total events, pending, avg deviation, no-shows) with motion stagger animation (containerVariants/cardVariants, `type: "spring", stiffness: 300, damping: 30`)
  - [x] 6.5 Create `_components/VarianceStatusFilter.tsx` — tab pills `role="tablist"` with filters: All, Pending, Approved, Rejected. Active: `bg-neutral-900 text-white shadow-md`. Follow `AbsenceStatusFilter` pattern exactly.
  - [x] 6.6 Create `_components/VarianceEventList.tsx` — card-based list (NOT @tanstack/react-table for simplicity). Each card: employee icon + name + job type, shift date + times, variance type badge, deviation delta, status badge, approve/reject buttons (for PENDING). Color-coded by type: CLOCK_IN_DEVIATION=orange, CLOCK_OUT_DEVIATION=amber, NO_SHOW=rose, EARLY_DEPARTURE=amber. Follow `AbsencePendingList` card pattern.
  - [x] 6.7 Create `_components/VarianceRejectDialog.tsx` — shadcn `AlertDialog` with mandatory exception note textarea. Confirm disabled until `note.trim()` is non-empty. Follow `AbsenceRejectDialog` pattern exactly.
  - [x] 6.8 Add navigation entry in `AdminLayoutClient.tsx`: `{ href: "/admin/planning/variance", icon: GitCompareArrows, labelKey: "variance" as const }` (use `GitCompareArrows` from lucide-react for variance/diff concept). **IMPORTANT**: Add `GitCompareArrows` to the existing lucide-react import statement at the top of the file. Also, Task 7 (i18n) MUST be done before or simultaneously with this task — the `labelKey: "variance"` references `admin.nav.variance` which must exist in translation files.

- [x] Task 7: i18n translations (AC: all)
  - [x] 7.1 Add `admin.nav.variance` key to both FR/EN
  - [x] 7.2 Add `admin.variance.*` namespace in FR with ~50 keys covering: title, subtitle, tabs, pendingBadge (ICU plural), types (4), status (3), list (empty, planned, actual, delta ICU, employee, date, reason, noReason), actions (approve, reject, approving, rejecting, exportCsv), rejectDialog (title, description, noteLabel, notePlaceholder, confirm, cancel), stats (title, totalEvents, pendingCount, avgDelta, noShowCount, minutes ICU), monthSelector, toast (approved, rejected, exported, errorApprove, errorReject, errorExport), errors (loadFailed, loadFailedDescription, retry)
  - [x] 7.3 Add matching EN keys

- [x] Task 8: Tests (AC: all)
  - [x] 8.1 Validator tests: `packages/validators/src/planning/variance.schema.test.ts` — 33 tests passing
  - [x] 8.2 Service tests: `apps/api/src/modules/planning/variance.service.spec.ts` — 25 Jest tests passing
  - [x] 8.3 Router tests: `apps/api/src/trpc/routers/variance.router.spec.ts` — 13 Jest tests passing
  - [x] 8.4 Page tests: `apps/web/src/app/[locale]/admin/planning/variance/__tests__/page.spec.tsx` — 1 Vitest test passing
  - [x] 8.5 Client component tests: `apps/web/src/app/[locale]/admin/planning/variance/__tests__/variance-page.spec.tsx` — 32 Vitest tests passing
  - [x] 8.6 Total: 104 new tests (33 validators + 38 API + 33 web)

- [x] Task 9: Build verification and quality gates
  - [x] 9.1 Run `pnpm db:generate` — passed
  - [x] 9.2 Run `pnpm build` — passed (5/5 tasks, zero errors)
  - [x] 9.3 Run `pnpm test` — 1936 total tests passing (693 API + 654 Web + 589 Validators)
  - [x] 9.4 No variance-related TypeScript errors (pre-existing spec errors in planning.service.spec.ts only)

- [x] Task 10: Code review fixes (14 findings: 3 HIGH, 8 MEDIUM, 3 LOW)
  - [x] 10.1 H1: Fix `isPending && !isFetching` always false (TanStack Query v5) → replaced with `isPending` alone in `VariancePageClient.tsx`
  - [x] 10.2 H2: Add employee filter dropdown (missing AC #2) → added `useEmployees` hook + `<select>` in `VariancePageClient.tsx`, pass `employeeId` to hooks and CSV export
  - [x] 10.3 H3: Dashboard has no tests → created `dashboard.service.spec.ts` (7 tests) + `dashboard.router.spec.ts` (5 tests)
  - [x] 10.4 M1: Extract DashboardService from inline router logic → created `apps/api/src/modules/dashboard/dashboard.service.ts` + `dashboard.module.ts`, thin router delegation
  - [x] 10.5 M2: Double-toast on review error → removed hook-level `onError` in `useReviewVariance`, kept per-call handlers only
  - [x] 10.6 M3: CSV filename closure stale → moved `onSuccess`/`onError` into per-call `mutate()` callback in `useExportVarianceCsv`
  - [x] 10.7 M4: Variable shadowing `t` in `VarianceStatsPanel.tsx` → renamed arrow param to `entry`
  - [x] 10.8 M5: Unsafe `events as any` cast → replaced with `events as VarianceEventItem[]` + exported type from `VarianceEventList.tsx`
  - [x] 10.9 M6: Dashboard page skips RSC pattern → extracted to `_components/DashboardPageClient.tsx` + RSC wrapper `page.tsx`
  - [x] 10.10 M7: Race condition TOCTOU in `reviewVariance` → replaced `$transaction` with atomic CAS `updateMany` WHERE status='PENDING'
  - [x] 10.11 M8: Inconsistent authorization (list/getStats open to STAFF) → added ADMIN guard on `list` and `getStats` procedures
  - [x] 10.12 Updated `variance.service.spec.ts` for atomic CAS pattern (M7)
  - [x] 10.13 Updated `variance.router.spec.ts` for ADMIN guards on list/getStats (M8)
  - [x] 10.14 Updated `variance-page.spec.tsx` with `useEmployees` mock (H2)
  - [x] 10.15 Added i18n keys `admin.variance.list.employee` + `admin.variance.list.allEmployees` in FR/EN

- [x] Task 11: Admin navigation restructuring (9 flat items → 5 grouped)
  - [x] 11.1 Refactored `AdminLayoutClient.tsx` from flat pill nav to grouped dropdown navigation
    - Groups: Dashboard (direct) | Team ▼ (Employees, Absences) | Planning ▼ (Schedule, Templates, Equity, Variance, Rules) | Billing (direct) | Settings (direct)
    - Dropdown with click-to-open, auto-close on navigation and outside click
    - Active state propagates to parent group
    - `flex-wrap` replaces `overflow-x-auto` (5 items don't need scroll, and overflow clips dropdowns)
  - [x] 11.2 Moved Planning Rules from Settings tab to standalone route `/admin/planning/rules/page.tsx`
  - [x] 11.3 Removed Planning Rules tab from `SettingsTabs.tsx` (now 2 tabs: Operational + Shift Types)
  - [x] 11.4 Removed duplicate `requests` nav key, added new i18n keys: `team`, `planningView`, `absences`
  - [x] 11.5 Build + tests pass (5/5 tasks, 693 API + 654 Web + 589 Validators)

## Dev Notes

### Critical Discovery: VarianceEvent Model Already Exists

The `VarianceEvent` model already exists in `apps/api/prisma/schema/Planning.prisma` (lines 93-109). **Do NOT create a new file** — enhance the existing model in `Planning.prisma`.

**Current model (lines 93-109):**
```prisma
model VarianceEvent {
  id          String   @id @default(uuid())
  type        String
  plannedTime DateTime @map("planned_time")
  actualTime  DateTime @map("actual_time")

  shift   Shift  @relation(fields: [shiftId], references: [id], onDelete: Cascade)
  shiftId String @map("shift_id")

  clinicId String @map("clinic_id")
  clinic   Clinic @relation(fields: [clinicId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now()) @map("created_at")
  @@index([clinicId])
  @@index([shiftId])
}
```

**Target model (after enhancement):**
```prisma
enum VarianceEventStatus {
  PENDING
  APPROVED
  REJECTED
}

enum VarianceEventType {
  CLOCK_IN_DEVIATION
  CLOCK_OUT_DEVIATION
  NO_SHOW
  EARLY_DEPARTURE
}

model VarianceEvent {
  id             String               @id @default(uuid())
  type           VarianceEventType
  plannedTime    DateTime             @map("planned_time")
  actualTime     DateTime             @map("actual_time")
  deltaMinutes   Int                  @map("delta_minutes")
  status         VarianceEventStatus  @default(PENDING)
  reviewedBy     String?              @map("reviewed_by")
  reviewedAt     DateTime?            @map("reviewed_at")
  exceptionNote  String?              @map("exception_note")

  shift    Shift  @relation(fields: [shiftId], references: [id], onDelete: Cascade)
  shiftId  String @map("shift_id")

  clinicId String @map("clinic_id")
  clinic   Clinic @relation(fields: [clinicId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([clinicId])
  @@index([shiftId])
  @@index([clinicId, status])
}
```

The Shift model (line 35) already has `isConfirmed Boolean @default(false)` and the relation `varianceEvents VarianceEvent[]` at line 40. The Clinic model also already has `varianceEvents VarianceEvent[]`.

### Architecture Compliance

**Data Flow (Non-Negotiable):**
```
VariancePageClient
  └─ useAdminVarianceEvents(filters) → listVarianceEventsAction → trpc.variance.list
  └─ useVarianceStats(month) → getVarianceStatsAction → trpc.variance.getStats
  └─ usePendingVarianceCount() → countPendingVarianceAction → trpc.variance.countPending
  └─ useReviewVariance() → reviewVarianceAction → trpc.variance.review
  └─ useExportVarianceCsv() → exportVarianceCsvAction → trpc.variance.exportCsv
       └─ Client-side Blob download from CSV string
```

**Module Registration Pattern (CRITICAL — 4 files to modify):**
1. `apps/api/src/modules/planning/planning.module.ts` — add `VarianceService` to providers AND exports
2. `apps/api/src/trpc/context.ts` — add `varianceService: VarianceService` to `TRPCServices` interface
3. `apps/api/src/trpc/trpc.module.ts` — inject `VarianceService` in BOTH `TRPCMiddleware` constructor (lines 39-51) AND `TRPCService` class (lines 81-113). This is a **double-registration** pattern. NOTE: `PlanningModule` is already imported in trpc.module.ts — do NOT add a duplicate import. Just add `VarianceService` to the existing constructor injections.
4. `apps/api/src/trpc/routers/_app.ts` — add `variance: varianceRouter`

### Absence Review Pattern — The Exact Blueprint

The variance approve/reject workflow MUST mirror the absence review pattern from Story 7.3. Key files to reference:

**Service pattern** (`apps/api/src/modules/employee/employee.service.ts` lines 673-779):
- Guard: `if (absence.status !== 'PENDING') throw new ConflictException('Already reviewed')`
- `$transaction` callback form (NOT array form) with double-checked PENDING status inside transaction
- On reject: require `exceptionNote`, set `reviewedBy` + `reviewedAt`
- Fire-and-forget email: `this.mailService.send(...).catch(err => this.logger.error(...))`

**Router pattern** (`apps/api/src/trpc/routers/employee.router.ts` lines 148-161):
```typescript
reviewAbsence: subscribedProcedure
  .input(reviewAbsenceSchema)
  .mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== 'ADMIN') throw new TRPCError({ code: 'FORBIDDEN' });
    return ctx.employeeService.reviewAbsence(ctx.user.clinicId, ctx.user.sub, ...);
  }),
```

**Validator pattern** (`packages/validators/src/employee/absence.schema.ts`):
- Base schema as plain `z.object({})` FIRST
- Then `.refine()` to require reason on reject
- CRITICAL: `.refine()` creates ZodEffects — cannot `.merge()` later

**Hook pattern** (`apps/web/.../_hooks/useAdminAbsences.ts` lines 32-76):
```typescript
// Prefix-only invalidation to catch ALL queries under namespace
queryClient.invalidateQueries({ queryKey: ["variance-events"] });
queryClient.invalidateQueries({ queryKey: QueryKeyFactory.pendingVarianceCount() });
```

### UI Decision: Card List vs Data Table

**Use card-based list (like AbsencePendingList), NOT @tanstack/react-table.**

Rationale:
- Matches existing admin UI patterns (absences, equity counters)
- Avoids adding a new dependency (@tanstack/react-table)
- Simpler implementation for MVP scope
- "Clinique Zen" aesthetic favors cards over dense data tables
- CSV export is server-side (tRPC returns CSV string), not client-side table export

If future needs require a full data table, @tanstack/react-table can be added in a follow-up.

### CSV Export — New Pattern for the Project

No CSV export exists in the codebase. Pattern:

**Backend** (tRPC **mutation** returning CSV string — NOT query, to avoid React Query caching large strings):
```typescript
async exportVarianceCsv(clinicId: string, filters: ExportVarianceInput): Promise<string> {
  const events = await this.prisma.varianceEvent.findMany({ where: { clinicId, ... }, include: { shift: { include: { employee: true } } } });
  const header = "Employé,Poste,Date,Type,Planifié,Réel,Écart (min),Statut,Note";
  const rows = events.map(e => [/* fields */].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
  return [header, ...rows].join("\n");
}
```

**Frontend** (Blob download trigger):
```typescript
const downloadCsv = async (month: string) => {
  const [csv, err] = await exportVarianceCsvAction({ month });
  if (err) { toast.error(t("toast.errorExport")); return; }
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ecarts-${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
```

### Aggregated Statistics — Server-Side Computation

Use Prisma `groupBy` + `aggregate` with `Promise.all` for parallel queries:

```typescript
async getVarianceStats(clinicId: string, month?: string) {
  const [year, monthNum] = month ? month.split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));
  const where = { clinicId, plannedTime: { gte: monthStart, lte: monthEnd } };

  const [countByType, countByStatus, totals] = await Promise.all([
    this.prisma.varianceEvent.groupBy({ by: ['type'], where, _count: { id: true }, _avg: { deltaMinutes: true } }),
    this.prisma.varianceEvent.groupBy({ by: ['status'], where, _count: { id: true } }),
    this.prisma.varianceEvent.aggregate({ where, _count: { id: true }, _sum: { deltaMinutes: true }, _avg: { deltaMinutes: true } }),
  ]);

  return { countByType, countByStatus, totals };
}
```

### QueryKeyFactory Entries to Add

In `apps/web/src/lib/hooks/server-action-hooks.ts`:
```typescript
varianceEvents: (filter?: string) => ["variance-events", filter ?? "all"],
pendingVarianceCount: () => ["variance-events", "pending-count"],
varianceStats: (month?: string) => ["variance-events", "stats", month ?? "all"],
```

**Critical cache invalidation rule**: Use `queryKey: ["variance-events"]` (prefix-only, single element) to invalidate ALL variance queries. Do NOT use the full key — it only matches exact prefix.

### Navigation Integration

In `apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx` (lines 29-38), add between equity and billing:
```typescript
{ href: "/admin/planning/variance", icon: GitCompareArrows, labelKey: "variance" as const },
```

The active state logic (lines 72-79) handles sub-path conflicts correctly — no special handling needed.

### Color Semantic Reference

| Variance Type | Color | Hex/Class | Icon |
|---------------|-------|-----------|------|
| CLOCK_IN_DEVIATION | Orange | `bg-orange-100 text-orange-700` | `Clock` |
| CLOCK_OUT_DEVIATION | Amber | `bg-amber-100 text-amber-700` | `Clock` |
| NO_SHOW | Rose | `bg-rose-100 text-rose-700` | `AlertCircle` |
| EARLY_DEPARTURE | Amber | `bg-amber-100 text-amber-700` | `LogOut` |

| Review Status | Color | Class |
|---------------|-------|-------|
| PENDING | Orange | `bg-orange-100 text-orange-700` |
| APPROVED | Emerald | `bg-emerald-100 text-emerald-700` |
| REJECTED | Rose | `bg-rose-100 text-rose-700` |

### Card Visual Reference

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [👤] Dr. Martin · Vétérinaire        [⚠ RETARD ARRIVÉE] [EN ATTENTE]  │
│     Lun 24 Fév · CHIR 8:30-18:30                                      │
│     Planifié: 8:30 → Réel: 8:47  ·  +17 min d'écart                   │
│                                        [✓ Approuver] [✗ Rejeter]      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ [👤] Julie · ASV                      [⚠ ÉCART DÉPART] [APPROUVÉ]     │
│     Mar 25 Fév · ACC 9:00-19:30                                        │
│     Planifié: 9:00 → Réel: 8:58  ·  -2 min d'écart                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ [👤] Thomas · ASV                     [✗ ABSENCE NON CONFIRMÉE] [EN ATTENTE] │
│     Mer 26 Fév · CHIR 8:30-18:30                                      │
│     Non confirmé                                                        │
│                                        [✓ Approuver] [✗ Rejeter]      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Statistics Cards Visual Reference

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Total écarts │ │  En attente  │ │ Écart moyen  │ │  Absences    │
│     47       │ │      8       │ │   12 min     │ │      3       │
│              │ │  ●           │ │              │ │              │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### File Structure

```
apps/web/src/app/[locale]/admin/planning/variance/
├── page.tsx                              ← NEW (RSC)
├── loading.tsx                           ← NEW (skeleton)
├── error.tsx                             ← NEW (error boundary)
├── _actions/
│   └── variance-actions.ts              ← NEW (5 server actions)
├── _hooks/
│   └── useAdminVariance.ts              ← NEW (5 hooks)
├── _components/
│   ├── VariancePageClient.tsx           ← NEW (orchestrator)
│   ├── VarianceEventList.tsx            ← NEW (card list)
│   ├── VarianceStatusFilter.tsx         ← NEW (tab pills)
│   ├── VarianceRejectDialog.tsx         ← NEW (AlertDialog)
│   └── VarianceStatsPanel.tsx           ← NEW (4 stat cards with motion)
└── __tests__/
    ├── page.spec.tsx                    ← NEW (RSC test)
    └── variance-page.spec.tsx           ← NEW (client tests)
```

### i18n Keys to Add

**FR (`apps/web/src/i18n/langs/fr.json` → `admin.variance`):**
```json
{
  "title": "Écarts de présence",
  "subtitle": "Comparez les horaires planifiés avec la présence réelle confirmée.",
  "tabs": { "all": "Tous", "pending": "En attente", "approved": "Approuvés", "rejected": "Rejetés" },
  "pendingBadge": "{count, plural, =0 {} =1 {1 en attente} other {# en attente}}",
  "types": {
    "CLOCK_IN_DEVIATION": "Retard d'arrivée",
    "CLOCK_OUT_DEVIATION": "Écart de départ",
    "NO_SHOW": "Absence non confirmée",
    "EARLY_DEPARTURE": "Départ anticipé"
  },
  "status": { "PENDING": "En attente", "APPROVED": "Approuvé", "REJECTED": "Rejeté" },
  "list": {
    "empty": "Aucun écart de présence pour cette période.",
    "planned": "Planifié",
    "actual": "Réel",
    "delta": "{minutes, plural, =1 {# min d'écart} other {# min d'écart}}",
    "notConfirmed": "Non confirmé"
  },
  "actions": { "approve": "Approuver", "reject": "Rejeter", "exportCsv": "Exporter CSV" },
  "rejectDialog": {
    "title": "Rejeter l'écart",
    "description": "Fournissez une note expliquant pourquoi cet écart est rejeté.",
    "exceptionNoteLabel": "Note d'exception",
    "exceptionNotePlaceholder": "Expliquez pourquoi cet écart est rejeté...",
    "confirm": "Confirmer le rejet",
    "cancel": "Annuler"
  },
  "stats": {
    "totalEvents": "Écarts totaux",
    "pendingCount": "En attente",
    "avgDelta": "Écart moyen",
    "noShowCount": "Absences",
    "minutes": "{count} min"
  },
  "monthSelector": { "label": "Mois" },
  "toast": {
    "approved": "Écart approuvé.",
    "rejected": "Écart rejeté.",
    "exported": "Export CSV téléchargé.",
    "errorApprove": "Erreur lors de l'approbation.",
    "errorReject": "Erreur lors du rejet.",
    "errorExport": "Erreur lors de l'export."
  },
  "errors": {
    "loadFailed": "Impossible de charger les écarts de présence.",
    "loadFailedDescription": "Veuillez réessayer ou contacter le support.",
    "retry": "Réessayer"
  }
}
```

**EN keys** follow the same structure with English translations.
**`admin.nav.variance`**: FR = `"Écarts"`, EN = `"Variance"`

### Testing Standards

- **Validators**: Vitest, `*.test.ts` pattern (NOT `*.spec.ts` for packages/validators)
- **API service + router**: Jest, `*.spec.ts` pattern
- **Web components**: Vitest + @testing-library/react, `*.spec.tsx` pattern
- **Mock strategy**: next-intl globally mocked in vitest.setup.ts, shadcn components mocked locally, custom hooks mocked with `vi.mock()`
- **Motion mock**: Already exists from Story 7-4 — mock `motion/react` to render plain divs
- **RSC page test**: `const el = await Component({ params: Promise.resolve({ locale: "en" }) }); render(el);`

### Previous Story Intelligence (Stories 7-3, 7-4)

**From Story 7-3 (Absence Request & Validation):**
- `$transaction` callback form (NOT array) with double-checked PENDING guard inside — prevents race conditions
- React Query invalidation: prefix-only `queryKey: ["admin-absences"]` to match ALL sub-keys
- ICU plural syntax: always test with count=0, count=1, count=2+
- Code review found 19 issues (5 CRITICAL) — all around type safety, race conditions, i18n correctness

**From Story 7-4 (Planning Health Bar):**
- Motion import from `"motion/react"` (NOT `"framer-motion"`)
- Spring transition: `{ type: "spring", stiffness: 300, damping: 30 }`
- `motion-safe:animate-pulse` for prefers-reduced-motion compliance
- Test mock for motion: render plain divs with style props

**From Story 7-2 (Equity Alerts):**
- Publication status flow — admin workflow patterns
- Badge component with variant="secondary" for status indicators

### Dependency Notes

**No new dependencies needed.** All required libraries are already installed:
- `motion` 12.34.3 (for stat card animations)
- `react-day-picker` 9.13.2 (for date range filter if needed)
- shadcn/ui components: Card, Table, Button, Badge, AlertDialog, Popover, Calendar

If a full data table is later needed, `@tanstack/react-table` can be added. For this story, card-based list is sufficient and consistent with existing patterns.

### Epic 7 Completion Note

This is the **last story in Epic 7**. After Story 7.5 is done and reviewed, Epic 7 should be marked as `done` in sprint-status.yaml. Then tag `v0.7.0` on main after merging develop.

### Project Structure Notes

- All new files follow established `_components/`, `_hooks/`, `_actions/`, `__tests__/` convention
- No new directories needed beyond the `variance/` route directory
- Backend changes are within existing `PlanningModule` — no new NestJS module
- Validators go in existing `packages/validators/src/planning/` directory

### References

- [Source: docs/planning-artifacts/epics.md#Story 7.5] — Acceptance criteria
- [Source: docs/planning-artifacts/architecture.md#Data Flow Pattern] — Non-negotiable data flow
- [Source: docs/planning-artifacts/ux-design-specification.md#Declarative Confirmation Flow] — UX for variance
- [Source: docs/planning-artifacts/ux-design-specification.md#Color System] — Color semantic reference
- [Source: apps/api/prisma/schema/Planning.prisma#93-109] — Existing VarianceEvent model
- [Source: apps/api/src/modules/employee/employee.service.ts#673-779] — Absence review pattern (blueprint)
- [Source: apps/api/src/trpc/routers/employee.router.ts#148-161] — Review router pattern
- [Source: apps/web/src/app/[locale]/admin/employees/absences/_components/AbsencePendingList.tsx] — Card list pattern
- [Source: apps/web/src/app/[locale]/admin/employees/absences/_components/AbsenceStatusFilter.tsx] — Tab filter pattern
- [Source: apps/web/src/app/[locale]/admin/employees/absences/_components/AbsenceRejectDialog.tsx] — Reject dialog pattern
- [Source: apps/web/src/app/[locale]/admin/employees/absences/_hooks/useAdminAbsences.ts] — Hook + cache invalidation pattern
- [Source: apps/web/src/app/[locale]/admin/planning/equity/] — Stats panel + page structure pattern
- [Source: apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx#29-38] — Navigation integration
- [Source: apps/web/src/lib/hooks/server-action-hooks.ts] — QueryKeyFactory
- [Source: packages/validators/src/employee/absence.schema.ts] — Validator pattern with .refine()
- [Source: docs/implementation-artifacts/7-4-planning-health-bar.md] — Previous story learnings
- [Source: docs/implementation-artifacts/7-3-absence-request-validation-workflow.md] — Absence workflow learnings

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- All 11 tasks completed (11/11). 116 new tests (33 validators + 50 API + 33 web).
- Total test count: 1936 (693 API + 654 Web + 589 Validators).
- Build passes with zero errors. No variance-related TS errors.
- Pre-existing `useRef()` issue in HealthBarDetailPopover.tsx fixed (React 19 requires initial arg).
- Pre-existing TS errors in `planning.service.spec.ts` (counterType string vs enum) not related to this story.
- Initial implementation mirrored absence review pattern from Story 7-3. Code review improved it to atomic CAS (updateMany WHERE status='PENDING') for better race safety.
- CSV export is a new pattern for the project (server-side string + client Blob download with BOM).
- Code review fixed 11 issues (3 HIGH + 8 MEDIUM): loading skeleton never showing (TanStack Query v5 isPending semantics), missing employee filter dropdown, dashboard without tests, dashboard business logic in router extracted to DashboardService, double-toast on error, CSV filename closure bug, variable shadowing, unsafe type cast, dashboard RSC pattern, race condition TOCTOU, inconsistent authorization.
- Admin navigation restructured from 9 flat items to 5 grouped items with dropdown menus (Dashboard | Team ▼ | Planning ▼ | Billing | Settings). Planning Rules moved from Settings tab to standalone route `/admin/planning/rules`.
- Bonus: Created `SchedulePublicationEmail.tsx` React Email template to replace raw HTML inline in `sendSchedulePublicationEmail()`. Now uses EmailLayout with tag "PLANNING", consistent with all 7 other email templates ("Modern Clinical v1.3" design system).
- Bonus: Added Resend rate-limiting throttle (550ms min gap) in `MailService` to avoid 429 "Too many requests" errors (Resend API limit: 2 req/s). Applied `await this.throttle()` before all 8 `resend.emails.send()` calls.
- Bonus: Connected admin dashboard (`/admin/dashboard`) to real backend data. Created DashboardService with 6 parallel Prisma queries, thin tRPC router delegation, server action + React Query hook with 60s polling, RSC wrapper pattern. Updated FR/EN i18n keys.

### Change Log

- 2026-02-24: Story 7-5 implemented → review. 9/9 tasks done. Enhanced VarianceEvent Prisma model (VarianceEventStatus/Type enums, deltaMinutes, status, reviewedBy/At, exceptionNote, composite index), 4 Zod validators with .refine() conditional, VarianceService (5 methods: list, review with $transaction, stats with Promise.all groupBy, countPending, exportCsv), 5 tRPC procedures (variance router with adminOnly guards), server actions + 5 React Query hooks (30s polling, prefix invalidation, Blob CSV download), card-based admin UI at /admin/planning/variance (VariancePageClient orchestrator, VarianceStatsPanel with motion stagger, VarianceStatusFilter with ARIA tablist, VarianceEventList with approve/reject, VarianceRejectDialog with mandatory note), GitCompareArrows nav entry, i18n FR/EN (~50 keys). 104 new tests (33 validators + 25 service + 13 router + 1 page + 32 client). 1924 total tests. Build green. Last story in Epic 7.
- 2026-02-24: Bonus improvements: (1) SchedulePublicationEmail.tsx React Email template replacing raw HTML, (2) Resend rate-limit throttle (550ms) in MailService for all 8 send calls, (3) Admin dashboard connected to real backend data via dashboard.router.ts tRPC + server action + React Query hook (60s polling) — 6 parallel Prisma queries for live stats (employees, pending requests, monthly hours, apprentice declarations). Updated dashboard i18n FR/EN keys.
- 2026-02-24: Code review fixes (Task 10): Fixed 11 issues (3H + 8M). H1: isPending && !isFetching always false → isPending alone. H2: Added employee filter dropdown with useEmployees hook. H3: Dashboard tests (12 new). M1: Extracted DashboardService from router (NestJS pattern). M2: Removed double-toast onError. M3: Fixed CSV filename closure. M4: Renamed shadowed variable. M5: Safe type cast with exported VarianceEventItem. M6: Dashboard RSC pattern (DashboardPageClient extraction). M7: Atomic CAS updateMany replaces $transaction for race-safe review. M8: ADMIN guards on list/getStats. Updated all affected test files. 1936 total tests (693 API + 654 Web + 589 Validators).
- 2026-02-24: Admin navigation restructuring (Task 11): Refactored flat 9-item pill nav to 5-group dropdown navigation. Groups: Dashboard | Team ▼ (Employees, Absences) | Planning ▼ (Schedule, Templates, Equity, Variance, Rules) | Billing | Settings. Moved Planning Rules from Settings tab to standalone route /admin/planning/rules. Removed duplicate "requests" nav key. SettingsTabs reduced to 2 tabs (Operational + Shift Types). Added i18n keys: team, planningView, absences. Build + tests green.

### File List

**New Files:**
- `packages/validators/src/planning/variance.schema.ts` — Zod validators (4 schemas)
- `packages/validators/src/planning/variance.schema.test.ts` — 33 validator tests
- `apps/api/src/modules/planning/variance.service.ts` — VarianceService (5 methods)
- `apps/api/src/modules/planning/variance.service.spec.ts` — 25 service tests
- `apps/api/src/trpc/routers/variance.router.ts` — tRPC router (5 procedures)
- `apps/api/src/trpc/routers/variance.router.spec.ts` — 13 router tests
- `apps/web/src/app/[locale]/admin/planning/variance/page.tsx` — RSC page
- `apps/web/src/app/[locale]/admin/planning/variance/loading.tsx` — Skeleton loading
- `apps/web/src/app/[locale]/admin/planning/variance/error.tsx` — Error boundary
- `apps/web/src/app/[locale]/admin/planning/variance/_actions/variance-actions.ts` — 5 server actions
- `apps/web/src/app/[locale]/admin/planning/variance/_hooks/useAdminVariance.ts` — 5 React Query hooks
- `apps/web/src/app/[locale]/admin/planning/variance/_components/VariancePageClient.tsx` — Orchestrator
- `apps/web/src/app/[locale]/admin/planning/variance/_components/VarianceStatsPanel.tsx` — 4 stat cards with motion
- `apps/web/src/app/[locale]/admin/planning/variance/_components/VarianceStatusFilter.tsx` — Tab pills
- `apps/web/src/app/[locale]/admin/planning/variance/_components/VarianceEventList.tsx` — Card list (exported VarianceEventItem type)
- `apps/web/src/app/[locale]/admin/planning/variance/_components/VarianceRejectDialog.tsx` — AlertDialog
- `apps/web/src/app/[locale]/admin/planning/variance/__tests__/page.spec.tsx` — 1 RSC test
- `apps/web/src/app/[locale]/admin/planning/variance/__tests__/variance-page.spec.tsx` — 32 client tests
- `apps/api/src/modules/mail/templates/SchedulePublicationEmail.tsx` — React Email template for planning publication
- `apps/api/src/modules/dashboard/dashboard.service.ts` — DashboardService (extracted from router, 6 parallel Prisma queries)
- `apps/api/src/modules/dashboard/dashboard.module.ts` — DashboardModule (NestJS module)
- `apps/api/src/modules/dashboard/dashboard.service.spec.ts` — 7 dashboard service tests
- `apps/api/src/trpc/routers/dashboard.router.ts` — Dashboard tRPC router (thin delegation to DashboardService)
- `apps/api/src/trpc/routers/dashboard.router.spec.ts` — 5 dashboard router tests
- `apps/web/src/app/[locale]/admin/dashboard/_actions/dashboard-actions.ts` — Dashboard server action
- `apps/web/src/app/[locale]/admin/dashboard/_hooks/useDashboardStats.ts` — React Query hook with 60s polling
- `apps/web/src/app/[locale]/admin/dashboard/_components/DashboardPageClient.tsx` — Dashboard client component (RSC extraction)
- `apps/web/src/app/[locale]/admin/planning/rules/page.tsx` — Planning Rules standalone route (RSC wrapper)

**Modified Files:**
- `apps/api/prisma/schema/Planning.prisma` — Added VarianceEventStatus/Type enums, enhanced VarianceEvent model
- `packages/validators/src/planning/index.ts` — Added variance schema exports
- `apps/api/src/modules/planning/planning.module.ts` — Added VarianceService to providers + exports
- `apps/api/src/trpc/context.ts` — Added varianceService + dashboardService to TRPCServices interface
- `apps/api/src/trpc/trpc.module.ts` — Injected VarianceService + DashboardService in TRPCMiddleware + TRPCService, imported DashboardModule
- `apps/api/src/trpc/routers/_app.ts` — Added variance + dashboard routers
- `apps/web/src/lib/hooks/server-action-hooks.ts` — Added 4 QueryKeyFactory entries (variance + dashboard)
- `apps/web/src/app/[locale]/admin/_components/AdminLayoutClient.tsx` — Restructured from 9 flat items to 5 grouped dropdown navigation (Dashboard | Team ▼ | Planning ▼ | Billing | Settings)
- `apps/web/src/app/[locale]/admin/settings/_components/SettingsTabs.tsx` — Removed Planning Rules tab (now 2 tabs: Operational + Shift Types)
- `apps/web/src/i18n/langs/fr.json` — Added admin.nav (team, planningView, absences), admin.variance.* (~50 keys), admin.variance.list.employee/allEmployees, admin.dashboard.* keys
- `apps/web/src/i18n/langs/en.json` — Added admin.nav (team, planningView, absences), admin.variance.* (~50 keys), admin.variance.list.employee/allEmployees, admin.dashboard.* keys
- `apps/web/src/app/[locale]/admin/planning/_components/HealthBarDetailPopover.tsx` — Fixed useRef() for React 19
- `apps/api/src/modules/mail/mail.service.tsx` — Replaced raw HTML with SchedulePublicationEmail template + render() + added throttle (550ms) for Resend rate limiting
- `apps/web/src/app/[locale]/admin/dashboard/page.tsx` — Converted to RSC wrapper (delegates to DashboardPageClient)
- `apps/api/src/modules/planning/variance.service.ts` — Atomic CAS updateMany replaces $transaction for race-safe review (M7)
- `apps/api/src/trpc/routers/variance.router.ts` — Added ADMIN guards on list + getStats (M8)
- `apps/api/src/modules/planning/variance.service.spec.ts` — Updated for atomic CAS pattern (M7)
- `apps/api/src/trpc/routers/variance.router.spec.ts` — Updated for ADMIN guards on list/getStats (M8)
- `apps/web/src/app/[locale]/admin/planning/variance/__tests__/variance-page.spec.tsx` — Added useEmployees mock (H2)
- `apps/web/src/app/[locale]/admin/planning/variance/_hooks/useAdminVariance.ts` — Removed double-toast (M2), fixed CSV closure (M3)
- `apps/web/src/app/[locale]/admin/planning/variance/_components/VarianceStatsPanel.tsx` — Renamed shadowed variable (M4)
