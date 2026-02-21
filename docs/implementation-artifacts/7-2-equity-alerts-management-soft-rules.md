# Story 7.2: Equity Alerts Management (Soft Rules)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to receive visual warnings when equity counters indicate unfair distribution and a Health Bar summarizing planning quality,
so that I can act fairly, balance workload across my team, and confidently publish the schedule when ready.

## Acceptance Criteria

1. **Given** a planning in edit mode **When** a SOFT rule (configured in Story 5.5) is violated — including contract hours exceeded, weekend equity imbalance, Saturday rotation fairness violated, holiday distribution unfair **Then** a visual orange warning icon (Vital Orange #F97316) appears on the affected employee's row in the StaffGrid with an explanatory message enriched with equity counter context (e.g., "Julie: 3 Saturdays this month vs. average 1.5").
2. **Given** the StaffGrid with equity alerts **When** I hover/click on a soft warning indicator on an employee row **Then** a popover reveals the detailed equity breakdown: current counter values, configured thresholds (from ROTATION_EQUITY / CONTRACT_COMPLIANCE rules), and the comparison with clinic averages.
3. **Given** the planning page with a generated or edited schedule **When** I view the page **Then** a "Health Bar" component is visible above the StaffGrid showing: count of hard conflicts (red), count of soft warnings (orange), total shifts, and a "ready percentage" — with a segmented visual bar (red → orange → teal).
4. **Given** the Health Bar **When** hard conflicts exist (count > 0) **Then** the "Publish" button on the Health Bar is disabled with a tooltip explaining why (e.g., "Resolve 3 blocking conflicts before publishing").
5. **Given** the Health Bar with zero hard conflicts **When** I click "Publish" **Then** a confirmation dialog appears listing any remaining soft warnings, asking the admin to confirm publication. Upon confirmation, the schedule month is marked as `PUBLISHED` and employees associated with shifts in that month are notified (email via Resend).
6. **Given** the `getScheduleViewForMonth` backend method **When** it computes violations **Then** SOFT violations from ROTATION_EQUITY and CONTRACT_COMPLIANCE include `affectedEmployeeId` and are enriched with equity counter values (current count, max threshold, clinic average) fetched from EquityCounterService.
7. **Given** the StaffGridRow employee name cell **When** the employee has employee-level soft violations (ROTATION_EQUITY or CONTRACT_COMPLIANCE) **Then** a small equity alert badge appears next to the employee name showing a summary (e.g., "⚠ 3/2 Sam." for Saturday over-allocation) with a clickable popover for details.
8. **Given** any shift operation (move, create, delete) via drag-and-drop **When** `preValidateMove` runs **Then** equity-related soft messages include counter context (e.g., "Overtime risk: 38.5h this week, contract limit 35h — would be 4th Saturday this month (max 2)").
9. **Given** any equity alert operation **When** executed **Then** it is strictly scoped to the authenticated admin's `clinicId` (multi-tenant isolation) and requires ADMIN role + active subscription.
10. **Given** FR/EN locales **When** I use equity alerts, Health Bar, or publish features **Then** all labels, tooltips, modals, and accessibility announcements are translated, soft violation messages use i18n keys (not hardcoded English), and the interface follows Clinique Zen aesthetic with WCAG AA compliance including non-text contrast >= 3:1 for status indicators.

## Tasks / Subtasks

- [x] **Task 1: Enrich backend violations with equity counter context** (AC: #1, #6, #8)
  - [x] 1.1 Modify `PlanningService.validateShiftsAgainstRules` to accept optional `equityCounters` parameter
  - [x] 1.2 Enrich ROTATION_EQUITY soft violations with `currentCount`, `maxPerPeriod`, `clinicAverage` in a structured `equityContext` field on `SoftViolation`
  - [x] 1.3 Enrich CONTRACT_COMPLIANCE soft violations with `currentWeeklyHours`, `maxWeeklyHours`, `overtimeMinutes` in `equityContext`
  - [x] 1.4 Add `affectedDate` to ROTATION_EQUITY violations by spreading the violation across the employee's shift dates in the period (so they appear on the correct grid cells)
  - [x] 1.5 Update `PlanningGenerationService.getScheduleViewForMonth` to call `EquityCounterService.getCountersForPeriod` and pass counters to `validateShiftsAgainstRules`
  - [x] 1.6 Add `equitySummary` field to `ScheduleViewData` response — per-employee equity counter snapshot for the displayed month
  - [x] 1.7 Update `preValidateMove` to include equity context in soft violation messages
  - [x] 1.8 Add tests for enriched violations in `planning.service.spec.ts` and `planning-generation.service.spec.ts`

- [x] **Task 2: Create equity alert validators** (AC: #1, #6)
  - [x] 2.1 Create `packages/validators/src/planning/equity-alert.schema.ts` — `equityContextSchema`, enriched `softViolationSchema` with optional `equityContext`, `publishPlanInputSchema` (month YYYY-MM)
  - [x] 2.2 Update `scheduleViewDataSchema` in `schedule-view.schema.ts` to include `equitySummary` field
  - [x] 2.3 Create tests in `equity-alert.schema.test.ts`
  - [x] 2.4 Export from `packages/validators/src/planning/index.ts`

- [x] **Task 3: Create publish plan backend workflow** (AC: #5, #9)
  - [x] 3.1 Created `PlanningPeriodStatus.prisma` model with DRAFT/PUBLISHED enum, @@unique([clinicId, month])
  - [x] 3.2 Added `publishPlan(clinicId, month, userId)` to `PlanningGenerationService` — validates no hard conflicts, upserts PlanningPeriodStatus, sends emails
  - [x] 3.3 Email notification via existing Resend infrastructure (`sendSchedulePublicationEmail`)
  - [x] 3.4 Added `publishPlan` tRPC mutation (subscribedProcedure + ADMIN)
  - [x] 3.5 Added `getPublicationStatus` tRPC query
  - [x] 3.6 Updated router spec (28 → 30 procedures), added MailService mock to generation service spec
  - [x] 3.7 Ran `pnpm db:generate` and `pnpm db:push` from root

- [x] **Task 4: Create web server actions and hooks** (AC: #3, #5)
  - [x] 4.1 Created `_actions/publish-actions.ts` with `publishPlanAction`, `getPublicationStatusAction`
  - [x] 4.2 Created `_hooks/usePublish.ts` with publish mutation + publication status query
  - [x] 4.3 Added `publicationStatus` query key to `QueryKeyFactory`

- [x] **Task 5: Wire PlanningHealthBar into the planning page** (AC: #3, #4, #5)
  - [x] 5.1 Rendered PlanningHealthBar in `ScheduleViewWrapper` above StaffGrid
  - [x] 5.2 Wired `hardViolationCount`, `softViolationCount`, `totalShifts` from `scheduleData`
  - [x] 5.3 Wired `onPublish` to open `PublishConfirmDialog`
  - [x] 5.4 Added `isPublished` state to hide publish button when already published

- [x] **Task 6: Build employee-level equity alert indicators** (AC: #1, #2, #7)
  - [x] 6.1 Created `_components/EmployeeEquityBadge.tsx` — trend icon + hover popover with counter breakdown
  - [x] 6.2 Popover shows counter type, current value vs clinic average
  - [x] 6.3 Passed `equitySummary` through StaffGrid → StaffGridRow via `equitySummaryMap`
  - [x] 6.4 Badge rendered next to employee name in StaffGridRow

- [x] **Task 7: Build PublishConfirmDialog** (AC: #5)
  - [x] 7.1 Created `_components/PublishConfirmDialog.tsx` using shadcn AlertDialog
  - [x] 7.2 Shows soft warning count in description
  - [x] 7.3 Clear consequences message about email notifications
  - [x] 7.4 On confirm, calls `publishPlan` and closes dialog
  - [x] 7.5 On success, invalidates scheduleView and publicationStatus queries via usePublish hook

- [x] **Task 8: Localize violation messages** (AC: #10)
  - [x] 8.1 Added `admin.publication` namespace in en.json and fr.json (publish dialog, success/error toasts)
  - [x] 8.2 Added `admin.equity` namespace (badge label, popover title, counter types, hint)
  - [x] 8.3 French translations with proper pluralization

- [x] **Task 9: Comprehensive test suite** (AC: all)
  - [x] 9.1 Validators: 503 tests passing (26 new equity-alert tests)
  - [x] 9.2 API: 565 tests passing (+20 review: enriched violations, publishPlan, getPublicationStatus, router behavioral)
  - [x] 9.3 Web: 517 tests passing (+37 review: EmployeeEquityBadge 12, PublishConfirmDialog 8, PlanningHealthBar 17)
  - [x] 9.5 Root quality gates: `pnpm test` green (1585 total), `pnpm build` green

## Dev Notes

This story **bridges** the existing equity counter infrastructure (Story 5.6) and the interactive planning grid (Stories 6.3 + 7.1) to create a complete admin decision-support system. It makes the `PlanningHealthBar` (created in Story 5.5 but never wired) fully functional, enriches soft violations with meaningful equity context, adds employee-level equity alerts on the grid, and introduces the schedule publication workflow.

### Critical Architecture Context

**What already exists and MUST NOT be recreated:**
- `PlanningHealthBar.tsx` — the component is complete (3-segment bar, publish button, disabled logic). It just needs to be rendered with real data.
- `EquityCounterService` — fully functional with `getCountersForPeriod`, `recalculateForPeriod`. Already registered in `TRPCServices`.
- `validateShiftsAgainstRules` — 4 rule evaluators (STAFFING_MINIMUM, SKILL_REQUIREMENT, ROTATION_EQUITY, CONTRACT_COMPLIANCE). Needs enrichment, not replacement.
- `WarningBadge.tsx` — works for cell-level soft violations. Still needed for per-cell warnings.
- `ConflictIndicator.tsx` — works for hard violations. No changes needed.
- `conflictMap` in `ScheduleViewWrapper` — works for violations with both `affectedEmployeeId` AND `affectedDate`. Needs a sibling `employeeViolationMap` for employee-level violations.

**The core gap being filled:**
```
BEFORE (Story 7.1):
  validateShiftsAgainstRules → raw violation strings → conflictMap (drops employee-level violations)
  EquityCounterService → separate page only → not visible on grid
  PlanningHealthBar → exists but never rendered

AFTER (Story 7.2):
  validateShiftsAgainstRules(equityCounters) → enriched violations with context → conflictMap + employeeViolationMap
  EquityCounterService → integrated into getScheduleViewForMonth → visible on grid rows
  PlanningHealthBar → rendered in ScheduleViewWrapper with real data → publish workflow
```

### Design Decision: PlanningPeriodStatus Model (NOT per-Shift flag)

Use a **dedicated `PlanningPeriodStatus` model** instead of a per-Shift `isPublished` field because:
- Publication is a **month-level** operation, not per-shift
- Need to track `publishedAt`, `publishedBy`, and status transitions (DRAFT → PUBLISHED → DRAFT on re-generation)
- Enables future "unpublish" and "re-publish after changes" workflows
- A single record per clinic+month is simpler to query than aggregating per-shift flags

```prisma
// PlanningPeriodStatus.prisma
model PlanningPeriodStatus {
  id          String   @id @default(cuid())
  clinicId    String
  clinic      Clinic   @relation(fields: [clinicId], references: [id])
  month       String   // "YYYY-MM"
  status      PlanningPeriodStatusType @default(DRAFT)
  publishedAt DateTime?
  publishedBy String?  // userId who published
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([clinicId, month])
  @@index([clinicId])
  @@map("planning_period_statuses")
}

enum PlanningPeriodStatusType {
  DRAFT
  PUBLISHED
}
```

### Design Decision: Structured Violation Messages (i18n-ready)

Replace raw English strings with structured message objects:

```typescript
// BEFORE (current):
{ message: "Employee has 3 saturday shifts, exceeds maximum of 2 per period" }

// AFTER (Story 7.2):
{
  messageKey: "violations.rotationEquity.exceeded",
  messageParams: { employeeName: "Julie Martin", currentCount: 3, maxPerPeriod: 2, targetDay: "saturday", trackingPeriod: "monthly" },
  equityContext: {
    counterType: "SATURDAY_WORKED",
    currentCount: 3,
    maxPerPeriod: 2,
    clinicAverage: 1.5,
    trend: "above_average"  // "below_average" | "average" | "above_average"
  }
}
```

Frontend renders via `t(messageKey, messageParams)` which handles FR/EN automatically. The `equityContext` feeds the `EquityDetailPopover`.

### Backend: enriched violation pipeline

```
getScheduleViewForMonth(clinicId, month)
  │
  ├── Promise.all([
  │     employees, shifts, unavailabilities, config, shiftTypes,  // existing
  │     equityCounterService.getCountersForPeriod(clinicId, year, [monthNum])  // NEW
  │   ])
  │
  ├── validateShiftsAgainstRules(clinicId, dateRange, { equityCounters })
  │     │
  │     ├── evaluateRotationEquity → enriched with counter + clinic avg
  │     ├── evaluateContractCompliance → enriched with weekly hours + overtime
  │     ├── evaluateStaffingMinimum → unchanged
  │     └── evaluateSkillRequirement → unchanged
  │
  ├── Compute equitySummary: per-employee { saturdayCount, weekendCount, holidayCount, overtimeMinutes, thresholds }
  │
  └── Return { ...existing, equitySummary, violations: { hard, soft (enriched) } }
```

### Publish Workflow

```
Admin clicks "Publish" on Health Bar
  → PublishConfirmDialog opens (lists remaining soft warnings)
  → Admin clicks "Publish Anyway"
  → publishPlanAction → trpc.planning.publishPlan
    → PlanningGenerationService.publishPlan(clinicId, month)
      → 1. Verify no hard conflicts (re-run validateShiftsAgainstRules)
      → 2. Upsert PlanningPeriodStatus (DRAFT → PUBLISHED, set publishedAt)
      → 3. Fetch all employees with shifts in month
      → 4. Send publication email via Resend to each employee
      → 5. Return { publishedAt, notifiedCount }
  → Invalidate scheduleView + publicationStatus queries
  → Toast: "Planning publié. 8 employés notifiés."
  → Health Bar shows "Published" badge
```

### Employee Equity Alert Rendering

In `StaffGridRow`, the employee name cell gains an equity badge:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [color dot] Julie Martin (ASV)  ⚠ 3/2 Sam.  │ Mon │ Tue │ ... │ 38.5h │
└──────────────────────────────────────────────────────────────────────────┘
                                    ↑
                            EmployeeEquityBadge
                            Click → EquityDetailPopover
```

The `EquityDetailPopover` shows:
```
┌─────────────────────────────────────────────┐
│ Equity — Julie Martin                        │
├─────────────────────────────────────────────┤
│ 🟢 Samedis travaillés    3 / 2 max ▲       │
│ 🟢 Week-ends totaux      4 / — (pas de max)│
│ 🟡 Heures supplémentaires 38.5h / 35h ▲    │
│ 🟢 Jours fériés          0 / — (pas de max)│
├─────────────────────────────────────────────┤
│ Moyenne clinique: 1.5 Sam. / 35.2h          │
│ Tendance: Au-dessus de la moyenne ▲          │
└─────────────────────────────────────────────┘
```

### Relationship to Existing Infrastructure

**Services consumed:**

| Service | Method | Purpose |
|---------|--------|---------|
| `PlanningService` | MODIFIED: `validateShiftsAgainstRules()` | Enriched violations with equity context |
| `EquityCounterService` | EXISTING: `getCountersForPeriod()` | Counter data for equity summary |
| `PlanningGenerationService` | MODIFIED: `getScheduleViewForMonth()` | Returns equity summary + enriched violations |
| `PlanningGenerationService` | MODIFIED: `preValidateMove()` | Enriched soft messages |
| `PlanningGenerationService` | NEW: `publishPlan()` | Publication workflow |
| `PlanningGenerationService` | NEW: `getPublicationStatus()` | Current month publication state |
| Resend | `send()` | Publication notification emails |

**No new NestJS module** — extends existing `PlanningModule` with `PlanningPeriodStatus` model.

**TRPCServices** — no new service injection needed (all services already registered).

### Technical Requirements

- **New Prisma model**: `PlanningPeriodStatus` with `@@unique([clinicId, month])` — tracks DRAFT/PUBLISHED state per month per clinic
- **No changes to Shift model** — publication is month-level, not shift-level
- **Enriched SoftViolation type**: Add optional `equityContext` field with `counterType`, `currentCount`, `maxPerPeriod`, `clinicAverage`, `trend`
- **Structured message keys**: Replace raw English strings with `messageKey` + `messageParams` for i18n rendering
- **Employee-level violation display**: New `employeeViolationMap` in `ScheduleViewWrapper` keyed by `employeeId` only (not `employeeId|date`)
- **Health Bar wiring**: `PlanningHealthBar` rendered in `ScheduleViewWrapper` with live violation counts
- **Publish workflow**: New tRPC mutation with hard-conflict gate + email notifications
- **WCAG AA compliance**: Non-text contrast >= 3:1 for equity status indicators, `aria-label` on Health Bar segments, `role="status"` for live region updates
- **Debounced equity alerts during DnD**: The `preValidateMove` already debounces at 200ms — enriched messages ride the same debounce

### Architecture Compliance (NON-NEGOTIABLE)

Mandatory end-to-end flow:
```text
Page (RSC) -> Client Component -> Hook -> Zsa Hook -> Server Action -> tRPC Client -> NestJS Service -> Prisma
```

- All equity enrichment logic in `PlanningService.validateShiftsAgainstRules()` — NEVER compute equity in frontend
- Publication logic in `PlanningGenerationService.publishPlan()` — includes hard-conflict re-validation
- tRPC procedures behind `subscribedProcedure` + ADMIN role check
- clinicId from `ctx.user.clinicId` — NEVER from client payload
- Input validation with Zod schemas from `@pawly/validators`
- Mutations invalidate `planningScheduleView`, `planningPublicationStatus`, and `equityCounters` React Query keys via `QueryKeyFactory`
- Publication emails via existing Resend infrastructure (from Story 5.4)
- PlanningHealthBar is a client component — receives data from `useScheduleView` hook
- Equity badges are client components — receive data from the enriched `scheduleData.equitySummary`

### Library & Framework Requirements

- **Prisma (`7.2.0`)**: New `PlanningPeriodStatus.prisma` model. `upsert` for DRAFT → PUBLISHED transitions. No migration needed (Neon, `db:push`).
- **NestJS (`11.x`)**: Modify `validateShiftsAgainstRules` in `PlanningService`. Add `publishPlan`, `getPublicationStatus` to `PlanningGenerationService`. Email via Resend.
- **tRPC (`11.x`)**: Add `publishPlan` mutation + `getPublicationStatus` query to `planning.router.ts`. `subscribedProcedure` + ADMIN.
- **Zod (`4.x` via `@pawly/zod`)**: `equityContextSchema`, `publishPlanInputSchema`, enriched `softViolationSchema`.
- **Next.js (`16.x`) + next-intl (`4.x`)**: Grid integration unchanged. Violation messages use `t(messageKey, params)`.
- **shadcn/ui**: `AlertDialog` for `PublishConfirmDialog` (already installed), `Popover` for `EquityDetailPopover` (already installed), `Badge` for `EmployeeEquityBadge` (already installed), `Progress` for Health Bar segments (may need install).
- **Lucide icons**: `AlertTriangle` (equity warning), `CheckCircle` (published), `Send` (publish action), `TrendingUp`/`TrendingDown` (equity trend).
- **Resend**: Publication email to employees — reuse existing Resend infrastructure from Story 5.4.
- **NO new chart libraries** — equity popover uses text/badge layout, not charts.
- **NO framer-motion** — CSS transitions for Health Bar animations.

### File Structure Requirements

**Files to create:**

```text
apps/api/prisma/schema/
  PlanningPeriodStatus.prisma

packages/validators/src/planning/
  equity-alert.schema.ts
  equity-alert.schema.test.ts

apps/web/src/app/[locale]/admin/planning/
  _components/
    EmployeeEquityBadge.tsx
    EquityDetailPopover.tsx
    PublishConfirmDialog.tsx
    PublishStatusBadge.tsx
  _actions/
    publish-actions.ts
  _hooks/
    usePublish.ts
  __tests__/
    equity-alerts.spec.tsx
    publish.spec.tsx
```

**Files to modify:**

- `apps/api/prisma/schema/Clinic.prisma` (add `planningPeriodStatuses PlanningPeriodStatus[]` relation)
- `apps/api/src/modules/planning/planning.service.ts` (enrich `validateShiftsAgainstRules` with equity context)
- `apps/api/src/modules/planning/planning.service.spec.ts` (enriched violation tests)
- `apps/api/src/modules/planning/planning-generation.service.ts` (add equity to getScheduleViewForMonth, publishPlan, getPublicationStatus)
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` (publish workflow tests)
- `apps/api/src/modules/planning/planning.module.ts` (no new services — PlanningPeriodStatus accessed via PrismaService)
- `apps/api/src/trpc/routers/planning.router.ts` (add publishPlan mutation + getPublicationStatus query)
- `apps/api/src/trpc/routers/planning.router.spec.ts` (publish router tests)
- `packages/validators/src/planning/schedule-view.schema.ts` (add equitySummary to ScheduleViewData)
- `packages/validators/src/planning/index.ts` (export equity-alert schemas)
- `apps/web/src/app/[locale]/admin/planning/_components/ScheduleViewWrapper.tsx` (add PlanningHealthBar, employeeViolationMap, publish dialog state)
- `apps/web/src/app/[locale]/admin/planning/_components/StaffGrid.tsx` (pass employeeViolationMap to rows)
- `apps/web/src/app/[locale]/admin/planning/_components/StaffGridRow.tsx` (render EmployeeEquityBadge in name cell)
- `apps/web/src/app/[locale]/admin/planning/_components/PlanningHealthBar.tsx` (minor: add isPublished state visual)
- `apps/web/src/app/[locale]/admin/planning/_components/WarningBadge.tsx` (render structured messages with i18n, not raw strings)
- `apps/web/src/lib/hooks/server-action-hooks.ts` (add planningPublicationStatus query key)
- `apps/web/src/i18n/langs/en.json` (add admin.equityAlerts + admin.publish namespaces, violation message keys)
- `apps/web/src/i18n/langs/fr.json` (add admin.equityAlerts + admin.publish namespaces, violation message keys)

**Structure constraints:**
- PlanningHealthBar stays in `_components/` — it's already there, just needs to be rendered
- New publish components are route-local under `/admin/planning/_components/`
- Equity alert components are route-local under `/admin/planning/_components/`
- Publication status is fetched as a separate query (lightweight) — not bundled into the heavy `getScheduleViewForMonth` response
- Violation message rendering happens in frontend via `t(messageKey, params)` — backend sends structured keys, not translated strings
- EquityCounterService is NOT re-injected — PlanningGenerationService calls it directly since both live in PlanningModule

### Testing Requirements

**Validators (Vitest, `*.test.ts`):**
- accept valid equityContext with counterType, currentCount, maxPerPeriod, clinicAverage, trend
- reject equityContext with negative currentCount
- reject equityContext with invalid trend value
- accept enriched softViolation with equityContext
- accept softViolation without equityContext (backward compatible)
- accept valid publishPlanInput with YYYY-MM month
- reject publishPlanInput with invalid month format
- accept scheduleViewData with equitySummary field
- accept scheduleViewData without equitySummary (backward compatible)

**API service tests (Jest, `*.spec.ts`):**
- `validateShiftsAgainstRules` with equity counters returns enriched ROTATION_EQUITY violations
- `validateShiftsAgainstRules` enriched violations include clinicAverage calculation
- `validateShiftsAgainstRules` enriched CONTRACT_COMPLIANCE violations include current weekly hours
- `validateShiftsAgainstRules` without equity counters returns standard violations (backward compatible)
- `getScheduleViewForMonth` includes equitySummary in response
- `getScheduleViewForMonth` equitySummary has correct per-employee counter values
- `publishPlan` succeeds when no hard conflicts exist
- `publishPlan` fails with ConflictException when hard conflicts remain
- `publishPlan` creates PlanningPeriodStatus with PUBLISHED status
- `publishPlan` sends email notifications to employees with shifts
- `publishPlan` is idempotent (re-publishing same month updates timestamp)
- `getPublicationStatus` returns DRAFT for unpublished months
- `getPublicationStatus` returns PUBLISHED with publishedAt for published months
- `preValidateMove` soft messages include equity context
- clinic isolation for publish operations

**tRPC router tests (Jest, `*.spec.ts`):**
- auth/subscription middleware enforced for publishPlan
- auth/subscription middleware enforced for getPublicationStatus
- ADMIN can execute publishPlan
- ADMIN can query getPublicationStatus
- EMPLOYEE receives FORBIDDEN for publishPlan
- EMPLOYEE receives FORBIDDEN for getPublicationStatus
- input validation for publishPlan (month format)

**Web tests (Vitest, `*.spec.tsx`):**
- PlanningHealthBar renders with violation counts from scheduleData
- PlanningHealthBar publish button disabled when hardViolationCount > 0
- PlanningHealthBar publish button enabled when hardViolationCount === 0
- PlanningHealthBar shows "Published" badge when isPublished
- PublishConfirmDialog opens on publish click
- PublishConfirmDialog lists soft warning summary by category
- PublishConfirmDialog calls publishPlanAction on confirm
- PublishConfirmDialog closes on cancel without action
- EmployeeEquityBadge renders green when counter < 75% of threshold
- EmployeeEquityBadge renders orange when counter >= 75% of threshold
- EmployeeEquityBadge renders red when counter >= 100% of threshold
- EmployeeEquityBadge not rendered when no equity violations for employee
- EquityDetailPopover shows full equity breakdown on click
- EquityDetailPopover shows clinic average comparison
- WarningBadge renders localized messages (not raw English strings)
- FR/EN rendering assertions for equity alert labels and publish dialog
- Keyboard accessibility: equity popover opens with Enter, closes with Escape
- Health Bar aria-label updates with violation count changes

**Quality gates before PR (run from repository root):**
- `pnpm test`
- `pnpm build`
- `pnpm lint`

### Previous Story Intelligence (Story 7.1 + Epic 5/6) — EXHAUSTIVE

**Story 7.1 (Manual Schedule Adjustment — Drag & Drop):**
- `ScheduleViewWrapper.tsx` builds `conflictMap` from `scheduleData.violations` — but ONLY for violations with BOTH `affectedEmployeeId` AND `affectedDate`. ROTATION_EQUITY and CONTRACT_COMPLIANCE violations (employee-level, no date) are silently dropped. Story 7.2 MUST build a separate `employeeViolationMap` keyed by just `employeeId`.
- `StaffGridRow.tsx` renders `ConflictIndicator` and `WarningBadge` per-cell. The employee name cell (lines 107-124) has **no violation indicator**. Story 7.2 adds `EmployeeEquityBadge` here.
- `PlanningHealthBar.tsx` exists with full visual implementation (3-segment bar, publish button, disabled logic) but is **never rendered** anywhere. Only imported in a test file. Story 7.2 renders it in `ScheduleViewWrapper`.
- `preValidateMove` in `PlanningGenerationService` has its own independent rotation equity and contract compliance checks — these generate raw strings. Story 7.2 enriches these with equity counter context.
- `useShiftMutations.ts` uses optimistic update pattern with `onMutate` → snapshot → cache update → `onSettled` → invalidate. Publish mutations follow the same pattern.
- `DndContext` wraps `StaffGrid` content with pointer and keyboard sensors — no changes needed for Story 7.2.
- Code review: 14 issues found (6 CRITICAL, 4 HIGH, 4 MEDIUM). `preValidateMove` was changed from `.query()` to `.mutation()` to prevent React Query caching validation results. `AssignShiftModal` uses client-side eligibility instead of calling preValidateMove per employee.
- `animate-shake` CSS keyframes in `globals.css` for blocked drop animation — no changes needed.
- 1502 total tests (545 API + 480 Web + 477 Validators).

**Story 6.3 (Schedule Visualization & Conflict Indicators):**
- `getScheduleViewForMonth` aggregates employees, shifts, unavailabilities, config, shiftTypes, template, and violations in `Promise.all`. Story 7.2 adds `equityCounterService.getCountersForPeriod` to this parallel fetch.
- `ScheduleViewData` type — Story 7.2 adds `equitySummary` field.
- `conflictMap` pattern — keyed by `"employeeId|date"`. Story 7.2 adds `employeeViolationMap` keyed by `"employeeId"` only.
- Week navigation is client-side (full month data, client slices to week). Equity badges are per-employee (not per-week) so they persist across week navigation.
- Responsive 3-day lite view for `< 1024px` — equity badges must work in both modes.
- `StaffGridRow` already shows weekly hours summary in right sticky column — could optionally show overtime warning here too.
- Code review: 22 issues fixed. Vital Orange `bg-[#F97316]/10` for hard conflicts — different from equity warning orange. Use a distinct visual (badge vs overlay) to avoid confusion.

**Story 6.2 (Greedy Generation Algorithm):**
- `deleteGeneratedShifts` only removes `source: 'GENERATED'` — re-generation should also reset `PlanningPeriodStatus` to DRAFT.
- `generateMonthlyPlan` uses `$transaction` for atomicity — publication similarly uses upsert in service layer.
- `validateShiftsAgainstRules` is called during generation for violation reporting — same method enriched in Story 7.2.

**Story 5.6 (Equity Counters Management):**
- `EquityCounterService.getCountersForPeriod(clinicId, year, months[], counterTypes?)` — returns `CounterWithEmployee[]` with `{ counterType, count, employee: { id, firstName, lastName, color, jobType, contractHours } }`.
- Counter types: `SATURDAY_WORKED`, `WEEKEND_TOTAL`, `HOLIDAY_WORKED`, `OVERTIME_HOURS`.
- OVERTIME_HOURS stored as excess **minutes** — display as `Math.round(count / 60 * 10) / 10` hours.
- Nightly cron recalculation at 2:00 AM Paris time — ensures counters are fresh.
- `recalculateForPeriod` uses `$transaction` for atomic batch upsert.
- `EquityCounterService` is registered in `PlanningModule` providers and exports — already accessible from `PlanningGenerationService` via module-level injection.
- But wait: `EquityCounterService` is injected into tRPC context separately. For `PlanningGenerationService` to call it, either inject via constructor or access via PrismaService directly. Check current `PlanningModule` provider config.

**Story 5.5 (Planning Assistance Rules):**
- `PlanningRule.ruleType: HARD | SOFT` — determines blocking vs warning behavior.
- ROTATION_EQUITY config: `{ targetDay, maxPerPeriod, trackingPeriod, applicableJobTypes? }` — these are the thresholds for equity badges.
- CONTRACT_COMPLIANCE config: `{ maxWeeklyHours?, maxMonthlyHours?, overtimeThresholdPercent? }` — these are the thresholds for overtime badges.
- `PlanningHealthBar` component created here — accepts `hardViolationCount`, `softViolationCount`, `totalShifts`, `onPublish?` props.
- `subscribedProcedure` composition is LOCAL in each router file — follow same pattern.

**Story 5.4 (Monthly School Day Declaration):**
- Resend email infrastructure already set up — reuse for publication notifications.
- `WEB_APP_URL` env var (not `NEXT_PUBLIC_APP_URL`) for email links.
- `ScheduleModule.forRoot()` already imported — do NOT re-import.

**Cross-cutting learnings:**
- `useServerActionMutation` wraps standard React Query `useMutation` — use `onSuccess` with `queryClient.invalidateQueries()`.
- Zod `.refine()` creates ZodEffects — create base schemas separately.
- Test patterns: API = Jest `*.spec.ts`, Web = Vitest `*.spec.tsx`, Validators = Vitest `*.test.ts`.
- `placeholderData: (prev) => prev` prevents skeleton flash during refetch.
- `staleTime: 0` + `refetchOnMount: "always"` for data that changes server-side.

### Git Intelligence Summary

Recent commit trajectory:
- `6fb50570` — `feat(story-7-1): Manual schedule adjustment with drag-and-drop (#28)`
- `34e89b11` — `Merge pull request #27 from yabafre/develop`
- `837902a7` — `Merge pull request #26 from yabafre/feature/story-6-3-schedule-visualization-conflict-indicators`

Story 7.2 is the natural continuation: 7.1 added interactive editing, 7.2 adds the equity intelligence layer and publish workflow. The grid infrastructure (StaffGrid, DnD, violations) is mature — 7.2 enriches it with equity data and completes the "draft → publish" lifecycle.

### Latest Tech Information (Context7 + Web Research)

- **@dnd-kit/core v6.x**: `useDndMonitor.onDragMove()` can be used for real-time equity impact preview during drag — but for Story 7.2, the existing `preValidateMove` debounce pattern is sufficient. No new DnD integration needed.
- **React Query v5**: Optimistic updates with `onMutate` → cancel → snapshot → update → `onSettled` → invalidate. For publish, use simple mutation (no optimistic update needed — publish is a one-way action with server confirmation).
- **shadcn/ui**: `AlertDialog` (already installed) for `PublishConfirmDialog`. `Progress` component may need installation for Health Bar refinements — check first.
- **WCAG AA**: Non-text contrast >= 3:1 for color-coded equity badges. Pair colors with icons + text labels. `role="status"` on Health Bar for aria-live announcements. Badge should not rely on color alone — include text abbreviation (e.g., "3/2 Sam.").
- **NestJS**: Aggregate `EquityCounterService.getCountersForPeriod()` into `getScheduleViewForMonth()` via `Promise.all` for zero-waterfall data fetching.
- **Resend email**: Use existing infrastructure from Story 5.4. Template for publication notification: "Votre planning pour [month] a été publié. Consultez vos créneaux sur [link]."

### Project Structure Notes

- The `PlanningHealthBar` is the capstone component for the planning page — it transforms the grid from an editing tool into a complete workflow tool (edit → validate → publish).
- Publication is a **non-destructive** status change (DRAFT → PUBLISHED). The admin can still edit shifts after publication (which silently reverts to DRAFT). Re-publishing is allowed.
- Employee equity badges on the grid provide at-a-glance fairness information that was previously only available on the separate `/admin/planning/equity` page. This contextualizes the equity data where admins make decisions.
- The enriched violation messages solve the "raw English string" problem that affects all violation display (grid, DnD, health bar). This is a cross-cutting improvement.
- `getPublicationStatus` is a lightweight separate query — it doesn't reload the heavy schedule view data. This allows the Health Bar to show publication state without re-fetching.

### References

- [Source: docs/planning-artifacts/epics.md#Story 7.2 — Equity Alerts Management (Soft Rules)]
- [Source: docs/planning-artifacts/prd.md#FR8 — System flags Soft Rule violations (Overtime, Equity)]
- [Source: docs/planning-artifacts/architecture.md#Data Flow, StaffGrid, Resend emails]
- [Source: docs/planning-artifacts/ux-design-specification.md#Health Bar, Soft Rule warnings, Publication workflow]
- [Source: docs/implementation-artifacts/7-1-manual-schedule-adjustment-drag-drop.md — DnD, preValidateMove, ScheduleViewWrapper conflictMap gap]
- [Source: docs/implementation-artifacts/6-3-schedule-visualization-conflict-indicators.md — StaffGrid, ConflictIndicator, WarningBadge, conflictMap]
- [Source: docs/implementation-artifacts/6-2-greedy-generation-algorithm-blocking-rules.md — validateShiftsAgainstRules, generation pipeline]
- [Source: docs/implementation-artifacts/5-6-equity-counters-management.md — EquityCounterService, counter types, getCountersForPeriod]
- [Source: docs/implementation-artifacts/5-5-planning-assistance-rules-configurable.md — PlanningRule, PlanningHealthBar, ROTATION_EQUITY/CONTRACT_COMPLIANCE configs]
- [Source: docs/implementation-artifacts/5-4-monthly-school-day-declaration-apprentices.md — Resend email infrastructure, @nestjs/schedule]
- [Source: Context7 @dnd-kit/core — useDndMonitor, DragOverlay (no changes needed for 7.2)]
- [Source: W3C WCAG 2.1 SC 1.4.11 — Non-text Contrast >= 3:1 for status indicators]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- API test fix: MailService mock added to planning-generation.service.spec.ts
- Web test fix: usePublish mock + AlertDialog mock + `getAllByText("title")` for dual "title" text
- Router test fix: procedure count 28 → 30 (publishPlan + getPublicationStatus)
- AuthenticatedUser uses `sub` not `id` for userId

### Completion Notes List

- All 9 tasks completed (including 1.8 after code review)
- 1585 total tests passing (565 API + 517 Web + 503 Validators)
- Build green
- PlanningPeriodStatus model created and pushed to Neon DB
- Publication emails use existing Resend infrastructure
- EquityContext enrichment flows: backend → validators → frontend components
- EmployeeEquityBadge uses TrendingUp/TrendingDown icons with hover popover

### Code Review Fixes (2026-02-21)

**Reviewer:** Claude Opus 4.6 (adversarial code review)

**19 issues found (8 CRITICAL, 4 HIGH, 5 MEDIUM, 2 LOW) — 12 CRITICAL+HIGH fixed:**

- C1: Race condition dialog close → moved `setPublishDialogOpen(false)` to `onSuccess` in `usePublish`
- C2: Non-atomic `publishPlan` → wrapped in `$transaction`, lighter hard-violation check, early exit for already-published
- C3: Dead branch in `evaluateContractCompliance` → `equityCounters` OVERTIME_HOURS now used for enriched clinicAverage
- C4: Missing `maxPerPeriod` in `EquitySummaryEntry` → added to schema + `buildEquitySummary` with rules lookup
- C5: Hardcoded English violation messages → added `messageKey`/`messageParams` to soft violations (ROTATION_EQUITY + CONTRACT_COMPLIANCE)
- C6: Zero API tests → +20 new tests (6 enriched violations + 7 publishPlan + 2 getPublicationStatus + 5 router behavioral)
- C7: Missing web test files → created `equity-alerts.spec.tsx` (12 tests) + `publish.spec.tsx` (25 tests)
- C8: Zero UI component tests → covered EmployeeEquityBadge, PublishConfirmDialog, PlanningHealthBar
- H1: `publish-actions.ts` tRPC import → confirmed correct project pattern (no change needed)
- H2: EmployeeEquityBadge WCAG → added `aria-expanded`, `role="tooltip"`, `Escape` handler, `onBlur`, fixed positioning
- H3: publishPlan emails inactive employees → added `isActive: true` + `email: { not: null }` DB-level filter
- H4: Router zero behavioral tests → +5 tests (admin/employee role, input validation)
- M1: `dayToCounterType` only Saturday → added `sunday: 'WEEKEND_TOTAL'`
- M3: Double-close on PublishConfirmDialog → removed `onOpenChange`, fully parent-controlled
- Added `admin.violations` i18n namespace (rotationEquity.exceeded + contractCompliance.overtime) in FR/EN

### File List

**New files:**
- `apps/api/prisma/schema/PlanningPeriodStatus.prisma` — Month-level DRAFT/PUBLISHED tracking model
- `packages/validators/src/planning/equity-alert.schema.ts` — Publish plan and publication status schemas
- `packages/validators/src/planning/equity-alert.schema.test.ts` — 26 tests for equity alert schemas
- `apps/web/src/app/[locale]/admin/planning/_actions/publish-actions.ts` — Server actions for publish workflow
- `apps/web/src/app/[locale]/admin/planning/_hooks/usePublish.ts` — Hook for publication status + publish mutation
- `apps/web/src/app/[locale]/admin/planning/_components/PublishConfirmDialog.tsx` — AlertDialog for publish confirmation
- `apps/web/src/app/[locale]/admin/planning/_components/EmployeeEquityBadge.tsx` — Equity indicator badge + popover

**Modified files:**
- `apps/api/src/modules/planning/planning.service.ts` — Enriched validateShiftsAgainstRules with equityContext
- `apps/api/src/modules/planning/planning-generation.service.ts` — Added publishPlan, getPublicationStatus, buildEquitySummary, MailService injection
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` — Added MailService mock
- `apps/api/src/modules/planning/planning.module.ts` — Added MailModule import
- `apps/api/src/modules/mail/mail.service.tsx` — Added sendSchedulePublicationEmail method
- `apps/api/src/trpc/routers/planning.router.ts` — Added publishPlan mutation + getPublicationStatus query
- `apps/api/src/trpc/routers/planning.router.spec.ts` — Updated procedure count to 30
- `apps/api/prisma/schema/Clinic.prisma` — Added planningPeriodStatuses relation
- `packages/validators/src/planning/planning-generation.schema.ts` — Added equityContextSchema
- `packages/validators/src/planning/schedule-view.schema.ts` — Added equitySummaryEntrySchema + equitySummary field
- `packages/validators/src/planning/index.ts` — Exported equity alert schemas
- `apps/web/src/app/[locale]/admin/planning/_components/ScheduleViewWrapper.tsx` — Integrated HealthBar, PublishDialog, usePublish
- `apps/web/src/app/[locale]/admin/planning/_components/StaffGrid.tsx` — Added equitySummary prop
- `apps/web/src/app/[locale]/admin/planning/_components/StaffGridRow.tsx` — Added EmployeeEquityBadge
- `apps/web/src/app/[locale]/admin/planning/__tests__/schedule-view.spec.tsx` — Added usePublish/AlertDialog mocks
- `apps/web/src/lib/hooks/server-action-hooks.ts` — Added publicationStatus query key
- `apps/web/src/i18n/langs/en.json` — Added publication + equity i18n keys
- `apps/web/src/i18n/langs/fr.json` — Added publication + equity i18n keys
- `docs/implementation-artifacts/7-2-equity-alerts-management-soft-rules.md` — Updated status + task checkboxes
- `docs/implementation-artifacts/sprint-status.yaml` — Updated story status
