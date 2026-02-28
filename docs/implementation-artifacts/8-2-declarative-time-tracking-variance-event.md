# Story 8.2: Declarative Time Tracking (VarianceEvent Tracking)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an employee,
I want to confirm my presence for each scheduled shift via a simple slider action,
so that I can declare my worked hours and any time deviations are automatically tracked for admin review.

## Acceptance Criteria

1. **Given** an employee viewing their schedule on `/dashboard/schedule` **When** a shift is for today or a past date AND the planning period is PUBLISHED **Then** a confirmation slider (binary toggle) is displayed on the shift card, allowing me to confirm "I was here."

2. **Given** a shift card with the confirmation slider **When** I slide/toggle to confirm my presence **Then** `Shift.isConfirmed` is set to `true` via optimistic UI, a green "Confirmed" badge replaces the slider, and a `VarianceEvent` is created on the backend comparing `plannedTime` (shift startTime) with `actualTime` (confirmation timestamp).

3. **Given** the confirmation action **When** the confirmation timestamp differs from the planned start time by more than a configurable threshold (default: 15 minutes) **Then** the `VarianceEvent` is created with `type: CLOCK_IN_DEVIATION` and `deltaMinutes` computed as the signed difference (positive = late, negative = early). **When** within threshold **Then** a `VarianceEvent` is still created with `deltaMinutes: 0` and no deviation type flag for admin audit trail.

4. **Given** a confirmed shift **When** I view it later **Then** the confirmation is irreversible (no un-confirm), the green "Confirmed" badge is displayed, and the slider is hidden.

5. **Given** a shift that was NOT confirmed by end of day (23:59 of the shift date) **Then** a `VarianceEvent` with `type: NO_SHOW` is created automatically by a scheduled backend job, flagging it for admin review in the Variance View (Story 7.5).

6. **Given** the employee portal **When** the device is offline **Then** the confirmation mutation is queued locally via React Query persistence and synced automatically when connectivity is restored (leveraging the PWA offline infrastructure from Story 8.1).

7. **Given** the confirmation action **When** I confirm a shift **Then** the weekly summary card updates immediately to reflect the new confirmed hours count.

8. **Given** the admin Variance View (Story 7.5) **Then** all VarianceEvents created by employee confirmations appear in the admin list with employee name, shift date, planned vs actual time, delta, and status (PENDING for admin review).

## Tasks / Subtasks

- [ ] Task 1: Validators (AC: #2, #3)
  - [ ] 1.1 Create `confirmShiftSchema` in `packages/validators/src/planning/presence-confirmation.schema.ts` (shiftId: uuid, actualStartTime?: ISO string)
  - [ ] 1.2 Create `noShowDetectionSchema` for the scheduled job input
  - [ ] 1.3 Add `PRESENCE_CONFIRMATION` to VarianceEventType enum values if needed (or reuse CLOCK_IN_DEVIATION / NO_SHOW)
  - [ ] 1.4 Write validator tests (~20 tests)

- [ ] Task 2: Backend — PresenceConfirmationService (AC: #2, #3, #5)
  - [ ] 2.1 Create `apps/api/src/modules/planning/presence-confirmation.service.ts`
  - [ ] 2.2 Implement `confirmPresence(clinicId, employeeId, shiftId, actualStartTime?)`:
    - Verify shift exists, belongs to employee, clinicId matches
    - Verify shift is for today or past date
    - Verify shift is NOT already confirmed (`isConfirmed === false`)
    - Verify planning period is PUBLISHED (query PlanningPeriodStatus)
    - Update `Shift.isConfirmed = true` in $transaction
    - Compute `deltaMinutes` = diff between actualStartTime (or now()) and shift.startTime
    - Create VarianceEvent (type based on deltaMinutes threshold)
    - Return confirmed shift data
  - [ ] 2.3 Implement `detectNoShows(clinicId, date)`:
    - Find all shifts for given date where `isConfirmed = false` AND planning period is PUBLISHED
    - Create VarianceEvent with `type: NO_SHOW` for each
    - Set `actualTime = plannedTime` and `deltaMinutes = 0` for NO_SHOW events
  - [ ] 2.4 Register service in PlanningModule providers + exports
  - [ ] 2.5 Write service tests (~20 tests)

- [ ] Task 3: Backend — Scheduled Job for No-Show Detection (AC: #5)
  - [ ] 3.1 Add `@Cron('0 0 * * *')` method in existing PlanningScheduler (or create PresenceScheduler) — runs daily at midnight
  - [ ] 3.2 Query all clinics with PUBLISHED periods for yesterday
  - [ ] 3.3 Call `detectNoShows(clinicId, yesterday)` for each
  - [ ] 3.4 Write scheduler test (~5 tests)

- [ ] Task 4: Backend — tRPC Procedures (AC: #2, #3, #8)
  - [ ] 4.1 Create `presence-confirmation.router.ts` with `confirmMyShift` mutation (subscribedProcedure — employee role)
  - [ ] 4.2 Resolve employeeId from `ctx.user.sub` via DB lookup (same pattern as employee-schedule.router.ts)
  - [ ] 4.3 Register router in `_app.ts` as `presenceConfirmation`
  - [ ] 4.4 Inject PresenceConfirmationService in context.ts + trpc.module.ts
  - [ ] 4.5 Write router tests (~10 tests)

- [ ] Task 5: Types — Shared interfaces (AC: #2, #7)
  - [ ] 5.1 Add `ConfirmShiftResult` interface to `packages/types/src/planning/index.ts`
  - [ ] 5.2 Export types for frontend consumption

- [ ] Task 6: Web — Server Actions + Hooks (AC: #2, #6, #7)
  - [ ] 6.1 Create `apps/web/src/app/[locale]/dashboard/schedule/_actions/presence-actions.ts` with `confirmMyShiftAction`
  - [ ] 6.2 Create `_hooks/useConfirmShift.ts` with `useServerActionMutation` + optimistic update pattern:
    - `onMutate`: cancel queries, snapshot schedule data, optimistically set `isConfirmed = true`
    - `onError`: rollback to snapshot
    - `onSettled`: invalidate `["my-schedule"]` queries
  - [ ] 6.3 Ensure mutation works with `networkMode: "offlineFirst"` for PWA offline queueing
  - [ ] 6.4 Write hook tests (~8 tests)

- [ ] Task 7: Web — ConfirmationSlider Component (AC: #1, #2, #4)
  - [ ] 7.1 Create `_components/ConfirmationSlider.tsx` — binary toggle/slider component
    - Idle state: orange outline, "Slide to confirm" text with arrow indicator
    - Confirming state: loading spinner, disabled
    - Confirmed state: green filled, checkmark icon, "Confirmed" text, non-interactive
    - Must meet 44px minimum touch target (NFR15)
    - Accessible: role="switch", aria-checked, aria-label
  - [ ] 7.2 Integrate into `ShiftDayCard.tsx` — show slider for unconfirmed today/past shifts when period is PUBLISHED
  - [ ] 7.3 Hide slider for future shifts and DRAFT periods
  - [ ] 7.4 Add haptic feedback via `navigator.vibrate(50)` on confirmation (if supported)
  - [ ] 7.5 Write component tests (~15 tests)

- [ ] Task 8: Web — Update WeeklySummaryCard (AC: #7)
  - [ ] 8.1 Add "confirmed hours" count to WeeklySummaryCard display
  - [ ] 8.2 Show confirmed/total shift ratio (e.g., "3/5 confirmed")
  - [ ] 8.3 Write tests (~5 tests)

- [ ] Task 9: i18n — Translation keys (AC: all)
  - [ ] 9.1 Add ~25 keys to `dashboard.schedule.confirmation` namespace in FR and EN:
    - `slideToConfirm`, `confirming`, `confirmed`, `alreadyConfirmed`
    - `confirmSuccess`, `confirmError`, `offlineQueued`
    - `noShowWarning`, `lateArrival`, `earlyArrival`, `onTime`
    - `confirmedHours`, `confirmedRatio`
    - Error messages for each validation case
  - [ ] 9.2 Verify 100% key coverage in both locales

- [ ] Task 10: Integration Testing & Build Verification (AC: all)
  - [ ] 10.1 Run `pnpm test` — all tests pass (target: ~2150+ total)
  - [ ] 10.2 Run `pnpm build` — clean build across all Turborepo tasks
  - [ ] 10.3 Run `pnpm db:generate` — Prisma client generated
  - [ ] 10.4 Verify confirmation flow end-to-end in dev mode
  - [ ] 10.5 Verify offline mutation queuing works with service worker

## Dev Notes

### Critical Architecture Constraints

- **Data Flow (NON-NEGOTIABLE):** ShiftDayCard → useConfirmShift hook → Zsa useServerActionMutation → confirmMyShiftAction (server action) → tRPC presenceConfirmation.confirmMyShift → PresenceConfirmationService → Prisma. NO shortcuts.
- **Employee role, NOT admin:** All new tRPC procedures use `subscribedProcedure` with employee-level access. Admin already has the Variance View (Story 7.5) for reviewing events.
- **employeeId resolution:** There is NO `employeeId` in `AuthenticatedUser`. MUST resolve via DB lookup: `prisma.user.findUnique({ where: { id: ctx.user.sub }, select: { employee: { select: { id: true } } } })` then throw FORBIDDEN if no linked employee. Follow exact pattern from `employee-schedule.router.ts`.
- **Shift ownership verification:** Before confirming, verify `shift.employeeId === resolvedEmployeeId` AND `shift.clinicId === ctx.user.clinicId`. Never trust client-provided IDs alone.

### Existing Infrastructure to REUSE (Do NOT Reinvent)

| Component | Location | What to Reuse |
|-----------|----------|---------------|
| VarianceEvent model | `apps/api/prisma/schema/Planning.prisma` | Already has enums (CLOCK_IN_DEVIATION, NO_SHOW, etc.), deltaMinutes, status, reviewedBy/At |
| VarianceService | `apps/api/src/modules/planning/variance.service.ts` | Admin review methods — do NOT duplicate. Story 8.2 only CREATES events |
| Shift.isConfirmed | `apps/api/prisma/schema/Planning.prisma` | Boolean field already exists on Shift model, default false |
| ShiftDayCard | `apps/web/.../dashboard/schedule/_components/ShiftDayCard.tsx` | Already shows confirmation badge for past/today shifts. ENHANCE, don't replace |
| WeeklySummaryCard | `apps/web/.../dashboard/schedule/_components/WeeklySummaryCard.tsx` | Already shows weekly hours. ADD confirmed count |
| PlanningPeriodStatus | `apps/api/prisma/schema/Planning.prisma` | Month-level DRAFT/PUBLISHED — use to gate confirmations |
| EmployeeScheduleService | `apps/api/src/modules/planning/employee-schedule.service.ts` | getEmployeeSchedule returns shifts with isConfirmed |
| DashboardQueryProvider | `apps/web/.../dashboard/_components/DashboardQueryProvider.tsx` | PersistQueryClientProvider with offlineFirst — mutations auto-queue offline |
| SchedulePageClient | `apps/web/.../dashboard/schedule/_components/SchedulePageClient.tsx` | Orchestrator — already passes shifts to timeline components |
| PlanningModule | `apps/api/src/modules/planning/planning.module.ts` | Register new service HERE, not in a new module |
| @nestjs/schedule | Already installed | Cron decorator for no-show detection job |

### VarianceEvent Creation Logic

```
confirmPresence(clinicId, employeeId, shiftId, actualStartTime?):
  1. Load shift with { id, employeeId, clinicId, date, startTime, endTime, isConfirmed }
  2. Guard: shift.employeeId === employeeId
  3. Guard: shift.clinicId === clinicId
  4. Guard: shift.isConfirmed === false (idempotent — return success if already confirmed)
  5. Guard: shift.date <= today (no future confirmation)
  6. Guard: PlanningPeriodStatus for shift month = PUBLISHED

  7. Compute actualTime = actualStartTime ?? new Date()
  8. Compute deltaMinutes = Math.round((actualTime - plannedStartTime) / 60000)
  9. Determine type:
     - |deltaMinutes| <= 15 → CLOCK_IN_DEVIATION (deltaMinutes = 0, on-time)
     - deltaMinutes > 15 → CLOCK_IN_DEVIATION (late arrival)
     - deltaMinutes < -15 → CLOCK_IN_DEVIATION (early arrival)

  10. $transaction:
      - UPDATE Shift SET isConfirmed = true WHERE id = shiftId AND isConfirmed = false
      - CREATE VarianceEvent { type, plannedTime: shift.startTime, actualTime, deltaMinutes, shiftId, clinicId, status: PENDING }

  11. Return { shiftId, isConfirmed: true, deltaMinutes, varianceType }
```

### No-Show Detection Cron Job Logic

```
detectNoShows() — Cron: 0 0 * * * (daily midnight)
  1. Get yesterday's date
  2. Find all clinics with PlanningPeriodStatus PUBLISHED for yesterday's month
  3. For each clinic:
     - Find shifts WHERE date = yesterday AND isConfirmed = false
     - For each unconfirmed shift:
       - Check VarianceEvent doesn't already exist for this shift (idempotent)
       - CREATE VarianceEvent { type: NO_SHOW, plannedTime: shift.startTime, actualTime: shift.startTime, deltaMinutes: 0, shiftId, clinicId, status: PENDING }
  4. Log summary: "Detected X no-shows across Y clinics"
```

### Optimistic Update Pattern (zsa-react-query)

```typescript
// useConfirmShift.ts — follows TanStack Query v5 pattern
const { mutate: confirmShift, isPending } = useServerActionMutation(
  confirmMyShiftAction,
  {
    onMutate: async ({ shiftId }) => {
      // Cancel outgoing schedule refetches
      await queryClient.cancelQueries({ queryKey: ["my-schedule"] });
      // Snapshot previous schedule data
      const previous = queryClient.getQueryData(["my-schedule", month]);
      // Optimistically update isConfirmed in cache
      queryClient.setQueryData(["my-schedule", month], (old) => ({
        ...old,
        shifts: old.shifts.map(s =>
          s.id === shiftId ? { ...s, isConfirmed: true } : s
        ),
      }));
      return { previous };
    },
    onError: (err, vars, context) => {
      // Rollback on failure
      queryClient.setQueryData(["my-schedule", month], context?.previous);
      toast.error(t("confirmation.confirmError"));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["my-schedule"] });
    },
    onSuccess: () => {
      toast.success(t("confirmation.confirmSuccess"));
    },
  }
);
```

**IMPORTANT:** `useServerActionMutation` wraps standard React Query `useMutation` — does NOT have `actionKeyFactory`. Use `onSuccess` with `queryClient.invalidateQueries()` for cache invalidation. This is a known pattern from all previous stories.

### Offline Mutation Queueing

The existing `DashboardQueryProvider` uses `PersistQueryClientProvider` with `networkMode: "offlineFirst"` and calls `queryClient.resumePausedMutations()` on success. This means:
- When offline, `confirmShift` mutation is **paused** (not rejected)
- When back online, `resumePausedMutations` auto-retries
- The optimistic UI shows confirmed state immediately (green badge)
- If sync fails after coming back online, `onError` rollback restores the unconfirmed state
- Show a subtle toast: "Confirmation queued — will sync when online" using the existing `OfflineBanner` detection pattern (`navigator.onLine`)

### UI Design — ConfirmationSlider Component

```
┌─────────────────────────────────────────────┐
│  ShiftDayCard (existing)                    │
│  ┌───────────────────────────────────────┐  │
│  │ 🏥 CHIR  08:30 - 18:30  (60min break)│  │
│  │                                       │  │
│  │  ┌─────────────────────────────┐      │  │
│  │  │ ○ ──────── Confirmer ──▶    │      │  │  ← Unconfirmed (orange outline)
│  │  └─────────────────────────────┘      │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  After confirmation:                        │
│  ┌───────────────────────────────────────┐  │
│  │ 🏥 CHIR  08:30 - 18:30  (60min break)│  │
│  │                                       │  │
│  │  ✅ Confirmé                          │  │  ← Confirmed (green badge, no slider)
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**Design tokens (Clinique Zen):**
- Unconfirmed slider: `border-orange-300 bg-orange-50` with `text-orange-700`
- Confirming (loading): `bg-neutral-100 animate-pulse` with spinner
- Confirmed badge: `bg-emerald-100 text-emerald-700` with Check icon
- Touch target: minimum 48px height (exceeds NFR15 44px requirement)

### Accessibility Requirements

- ConfirmationSlider: `role="switch"`, `aria-checked={isConfirmed}`, `aria-label={t("confirmation.slideToConfirm")}`
- Loading state: `aria-busy="true"`, `aria-label={t("confirmation.confirming")}`
- Confirmed state: `aria-live="polite"` announcement of "Shift confirmed"
- Keyboard: Enter/Space to toggle (standard switch behavior)
- `prefers-reduced-motion`: disable slide animation, use instant toggle

### Previous Story Learnings (Story 8.1)

- **zsa-react-query return type** doesn't infer correctly → explicit cast: `const data = rawData as Type | undefined`
- **RSC + PersistQueryClientProvider**: Dashboard layout is RSC → "use client" wrapper already handles this
- **date-fns NOT in API workspace**: Use native JS date utilities (Story 8.1 pattern: `formatDateYMD`, manual date math)
- **AuthenticatedUser has NO employeeId**: Must resolve via DB lookup every time
- **Locale-aware content**: Use `useTranslations()` for all user-facing strings, never hardcode French
- **Service worker caching**: Schedule API responses go through ZSA server actions (NOT direct browser HTTP), so SW cache doesn't intercept. Offline works via React Query localStorage persistence only.
- **Offline detection**: Use `navigator.onLine` + online/offline event listeners for UI feedback (existing OfflineBanner pattern)

### Code Review Learnings from Epic 6+7 (Prevent Regressions)

| Pattern | Rule | Source |
|---------|------|--------|
| $transaction form | Use callback form, NOT array form | Story 7.3 C1 |
| Race condition guard | Double-check precondition INSIDE transaction | Story 7.3 C5, 7.5 M7 |
| Query key invalidation | Prefix-only: `queryKey: ["my-schedule"]` matches all sub-keys | Story 7.3 fix |
| Zod .refine() | Creates ZodEffects — cannot .merge() after. Base schema first | Story 5.2 |
| UTC date handling | Use `getUTCFullYear/Month/Date` for date-only strings parsed as UTC | Story 6.2 C2 |
| ICU plural | Test count=0, 1, 2+ for all plural keys | Story 7.3 |
| Toast duplication | Don't use both hook-level onError AND per-call error handler | Story 7.5 M2 |
| motion-safe animations | Always add `@media (prefers-reduced-motion: reduce)` guard | Story 7.4 M2 |
| React.memo | Wrap frequently re-rendered components | Story 7.1 M6 |
| Atomic CAS | `updateMany WHERE { id, status: expected }` for concurrent safety | Story 7.5 CAS pattern |

### Module Registration Checklist (4 files)

1. `apps/api/src/modules/planning/planning.module.ts` — add PresenceConfirmationService to providers + exports
2. `apps/api/src/trpc/context.ts` — add `presenceConfirmationService: PresenceConfirmationService` to TRPCServices
3. `apps/api/src/trpc/trpc.module.ts` — inject in BOTH TRPCMiddleware + TRPCService constructors
4. `apps/api/src/trpc/_app.ts` — add `presenceConfirmation: presenceConfirmationRouter`

### File Structure

```
packages/validators/src/planning/
  presence-confirmation.schema.ts     # NEW — validators
  presence-confirmation.schema.test.ts # NEW — ~20 tests

packages/types/src/planning/
  index.ts                            # MODIFIED — add ConfirmShiftResult

apps/api/src/modules/planning/
  presence-confirmation.service.ts     # NEW — core service
  presence-confirmation.service.spec.ts # NEW — ~20 tests
  planning.module.ts                   # MODIFIED — register service

apps/api/src/trpc/routers/
  presence-confirmation.router.ts      # NEW — tRPC procedures
  presence-confirmation.router.spec.ts # NEW — ~10 tests

apps/api/src/trpc/
  _app.ts                             # MODIFIED — add router
  context.ts                          # MODIFIED — add service to interface
  trpc.module.ts                      # MODIFIED — inject service

apps/web/src/app/[locale]/dashboard/schedule/
  _actions/presence-actions.ts         # NEW — server actions
  _hooks/useConfirmShift.ts            # NEW — mutation hook
  _components/ConfirmationSlider.tsx   # NEW — slider UI component
  _components/ConfirmationSlider.spec.tsx # NEW — ~15 tests
  _components/ShiftDayCard.tsx         # MODIFIED — integrate slider
  _components/WeeklySummaryCard.tsx    # MODIFIED — add confirmed count
  _components/SchedulePageClient.tsx   # MODIFIED — pass new props

apps/web/src/i18n/langs/
  fr.json                             # MODIFIED — add ~25 keys
  en.json                             # MODIFIED — add ~25 keys
```

### Testing Requirements

| Layer | Count | Framework | Pattern |
|-------|-------|-----------|---------|
| Validators | ~20 | Vitest `*.test.ts` | Valid/invalid inputs, edge cases (future dates, already confirmed, missing fields) |
| Service | ~20 | Jest `*.spec.ts` | Happy path, guards (wrong employee, already confirmed, DRAFT period, future shift), deltaMinutes computation, no-show detection |
| Router | ~10 | Jest `*.spec.ts` | Auth guard, employee resolution, input validation, clinicId isolation |
| Web components | ~15 | Vitest `*.spec.tsx` | Slider states (idle/loading/confirmed), optimistic update, a11y (aria attributes), offline indicator |
| Hook | ~8 | Vitest `*.spec.tsx` | Mutation call, cache invalidation, rollback on error |
| Integration | ~5 | Manual | E2E confirmation flow, offline queueing, no-show cron |
| **Total** | **~78** | | Target: 2061 + 78 = ~2139 |

### Technology Versions (confirmed via codebase)

- Next.js: 16.1.6 (App Router)
- @serwist/next: 9.5.6
- TanStack Query: v5 (via zsa-react-query)
- Prisma: 7.2.0 (Schema Folders)
- NestJS: latest with @nestjs/schedule
- Zod: 4.x (via @pawly/zod)
- Vitest (web + validators) / Jest (API)
- shadcn/ui + Tailwind CSS v4

### Project Structure Notes

- Alignment with unified project structure: new files follow existing `_actions/`, `_hooks/`, `_components/` pattern under dashboard/schedule route
- Service registered in existing PlanningModule (NOT a new module) — follows pattern from VarianceService, EmployeeScheduleService
- Router is a new file (not added to existing employee-schedule.router.ts) because presence confirmation is a distinct concern with different authorization model
- No new Prisma models or enums needed — reuse existing VarianceEvent model and enums

### References

- [Source: docs/planning-artifacts/epics.md#Epic-8 — Story 8.2 definition, FR9]
- [Source: docs/planning-artifacts/prd.md#FR9 — "Employees confirm daily presence via a binary slider action"]
- [Source: docs/planning-artifacts/prd.md#User-Journey-2 — "Declarative Trust" — Thomas swipes green slider]
- [Source: docs/planning-artifacts/architecture.md#Data-Flow-Pattern — Non-negotiable Zsa→tRPC→NestJS flow]
- [Source: docs/implementation-artifacts/8-1-*.md — PWA offline infrastructure, employee schedule service, ShiftDayCard]
- [Source: docs/implementation-artifacts/7-5-*.md — VarianceEvent model, admin variance service, review workflow]
- [Source: docs/implementation-artifacts/7-3-*.md — Employee-side form pattern, absence request workflow, $transaction callback]
- [Source: docs/implementation-artifacts/6-2-*.md — Shift model (isConfirmed, shiftTypeCode, source), ShiftSource enum]
- [Source: apps/api/prisma/schema/Planning.prisma — VarianceEvent, Shift, PlanningPeriodStatus models]
- [Source: apps/api/src/modules/planning/variance.service.ts — Admin variance methods (do NOT duplicate)]
- [Source: apps/api/src/modules/planning/employee-schedule.service.ts — Employee schedule data fetching]
- [Source: apps/web/src/app/[locale]/dashboard/schedule/_components/ShiftDayCard.tsx — Current confirmation badge display]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
