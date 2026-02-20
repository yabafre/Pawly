# Story 7.1: Manual Schedule Adjustment (Drag & Drop)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to manually move shift assignments using drag and drop on the interactive planning grid,
so that I can resolve coverage gaps, adjust the generated schedule, and finalize it for publication.

## Acceptance Criteria

1. **Given** the StaffGrid with generated or manual shifts **When** I drag a shift chip from one cell **Then** it visually lifts from the grid with reduced opacity, a ghost overlay follows the cursor, and valid drop targets highlight with visual feedback.
2. **Given** I am dragging a shift chip **When** I hover over a valid drop target (an employee row on a different date, or the same date for a different employee) **Then** the target cell glows green if the move is valid, orange if a soft warning exists (overtime risk, equity imbalance), or red if a hard rule blocks the move.
3. **Given** I drop a shift on a valid target **When** the drop completes **Then** the shift is reassigned optimistically in the UI, the change is synced to the backend via a Server Action, and the shift's `source` is updated to `MANUAL` (survives future regeneration).
4. **Given** I drop a shift on a blocked target (hard rule violation) **When** the drop is attempted **Then** the shift snaps back to its original position, and a toast notification explains the blocking reason (e.g., "Cannot assign: Employee on vacation").
5. **Given** I drag a shift and press Escape or drop it outside any valid target **When** the drag ends **Then** the shift returns to its original position without any backend call.
6. **Given** the StaffGrid with keyboard focus on a shift cell **When** I press Enter/Space **Then** the shift enters "picked up" mode (visual cue), arrow keys move the selection to adjacent cells, Enter confirms the move, and Escape cancels.
7. **Given** the StaffGrid with a "Hole" (unfilled template slot) **When** I click the "+" CTA on a HoleCell **Then** a modal opens allowing me to select an employee to assign, with eligible employees highlighted and ineligible ones greyed out with reasons.
8. **Given** a successful shift move or manual assignment **When** the backend confirms **Then** the schedule view query is invalidated, the grid re-fetches with updated violations and holes, and a success toast appears ("Shift moved to [Employee] on [Date]").
9. **Given** any shift operation (move, create, delete) **When** executed **Then** it is strictly scoped to the authenticated admin's `clinicId` (multi-tenant isolation) and requires ADMIN role + active subscription.
10. **Given** FR/EN locales **When** I use drag-and-drop or manual assignment features **Then** all labels, toasts, modals, and accessibility announcements are translated, and the interface follows Clinique Zen aesthetic with WCAG AA compliance.

## Tasks / Subtasks

- [x] **Task 1: Install dnd-kit and create shift mutation validators** (AC: #1, #3, #9)
  - [x]1.1 Install `@dnd-kit/core`, `@dnd-kit/utilities` in `apps/web`
  - [x]1.2 Create `packages/validators/src/planning/shift-mutation.schema.ts` with `moveShiftInputSchema` (shiftId UUID, targetEmployeeId UUID optional, targetDate YYYY-MM-DD optional, at least one required), `createManualShiftInputSchema` (employeeId, date, shiftTypeCode, startTime, endTime), `deleteShiftInputSchema` (shiftId UUID)
  - [x]1.3 Create `packages/validators/src/planning/shift-mutation.schema.test.ts`
  - [x]1.4 Export from `packages/validators/src/planning/index.ts`

- [x] **Task 2: Add backend shift mutation methods** (AC: #3, #4, #9)
  - [x]2.1 Add `moveShift(clinicId, shiftId, { targetEmployeeId?, targetDate? })` to `PlanningGenerationService` — updates shift via `prisma.shift.update()`, sets `source: 'MANUAL'`
  - [x]2.2 Add `createManualShift(clinicId, { employeeId, date, shiftTypeCode, startTime, endTime })` — creates shift with `source: 'MANUAL'`
  - [x]2.3 Add `deleteShift(clinicId, shiftId)` — deletes a single shift (verify clinic ownership)
  - [x]2.4 Add `preValidateMove(clinicId, shiftId, targetEmployeeId, targetDate)` — dry-run rule check returning hard/soft violations without persisting
  - [x]2.5 Verify shift belongs to clinic before any mutation (NotFoundException if not found, ForbiddenException if wrong clinic)
  - [x]2.6 Add tests to `planning-generation.service.spec.ts`

- [x] **Task 3: Add tRPC shift mutation procedures** (AC: #3, #9)
  - [x]3.1 Add `moveShift` mutation to `planning.router.ts` (subscribedProcedure + ADMIN)
  - [x]3.2 Add `createManualShift` mutation (subscribedProcedure + ADMIN)
  - [x]3.3 Add `deleteShift` mutation (subscribedProcedure + ADMIN)
  - [x]3.4 Add `preValidateMove` query (subscribedProcedure + ADMIN) — returns violations for a hypothetical move without persisting
  - [x]3.5 Input validation with schemas from `@pawly/validators`
  - [x]3.6 Add tests to `planning.router.spec.ts`

- [x] **Task 4: Create web server actions and hooks for shift mutations** (AC: #3, #8)
  - [x]4.1 Create `_actions/shift-mutation-actions.ts` with `moveShiftAction`, `createManualShiftAction`, `deleteShiftAction`, `preValidateMoveAction`
  - [x]4.2 Create `_hooks/useShiftMutations.ts` — wraps `useServerActionMutation` for move/create/delete with `onSuccess` invalidating `planningScheduleView` and `planningShifts` query keys
  - [x]4.3 Add `planningShiftMutations` key to `QueryKeyFactory` if needed

- [x] **Task 5: Implement drag-and-drop on StaffGrid** (AC: #1, #2, #3, #4, #5)
  - [x]5.1 Create `_hooks/useDragAndDrop.ts` — manages DnD state: `activeShift`, `dropFeedback`, `isDragging`. Wraps dnd-kit `DndContext` callbacks (`onDragStart`, `onDragOver`, `onDragEnd`)
  - [x]5.2 Wrap `StaffGrid` content in `DndContext` with `PointerSensor` + `KeyboardSensor` (activation constraint: 5px distance to prevent click-drag conflicts)
  - [x]5.3 Make `ShiftCell` draggable via `useDraggable({ id: shift.id, data: { shift } })`
  - [x]5.4 Make grid cells droppable via `useDroppable({ id: \`\${employeeId}|\${date}\`, data: { employeeId, date } })`
  - [x]5.5 Create `DragOverlay` component showing a ghost `ShiftCell` during drag
  - [x]5.6 Implement drop target visual feedback: query `preValidateMove` on `onDragOver` (debounced 200ms) to show green/orange/red glow
  - [x]5.7 On `onDragEnd`: if valid target, call `moveShiftAction` optimistically; if blocked, snap back + toast
  - [x]5.8 Handle drag cancel (Escape, drop outside) — restore original position

- [x] **Task 6: Build AssignShiftModal** (AC: #7)
  - [x]6.1 Create `_components/AssignShiftModal.tsx` — shadcn Dialog listing eligible employees for a given hole (date + shiftTypeCode)
  - [x]6.2 Each employee row shows: name, jobType, availability status (available, unavailable+reason, soft warning+reason)
  - [x]6.3 Clicking an eligible employee calls `createManualShiftAction` and closes the modal
  - [x]6.4 Wire HoleCell `onClick` to open AssignShiftModal with hole context

- [x] **Task 7: Add i18n translations** (AC: #10)
  - [x]7.1 Add `admin.dragDrop` namespace keys in `en.json`
  - [x]7.2 Add equivalent keys in `fr.json`
  - [x]7.3 Include: drag feedback ("Move to...", "Cannot assign: ..."), toast messages, modal labels, accessibility announcements, keyboard instructions

- [x] **Task 8: Comprehensive test suite** (AC: all)
  - [x]8.1 **Validators (Vitest, `*.test.ts`)**: moveShift input, createManualShift input, deleteShift input, edge cases (missing both targetEmployeeId and targetDate, invalid UUID)
  - [x]8.2 **API service (Jest, `*.spec.ts`)**: moveShift updates employeeId/date, moveShift sets source=MANUAL, createManualShift creates with source=MANUAL, deleteShift removes shift, preValidateMove returns violations, clinic isolation for all operations
  - [x]8.3 **tRPC router (Jest, `*.spec.ts`)**: auth/subscription guards on all 4 new procedures, ADMIN-only, EMPLOYEE gets FORBIDDEN, input validation
  - [x]8.4 **Web (Vitest, `*.spec.tsx`)**: DnD context renders, ShiftCell is draggable, drop on valid target triggers moveShiftAction, drop on blocked target shows toast, DragOverlay renders ghost, AssignShiftModal opens on HoleCell click, AssignShiftModal lists employees with availability, keyboard DnD (Enter pick up, Enter drop), FR/EN rendering assertions
  - [x]8.5 Root quality gates: `pnpm test` and `pnpm build` green

## Dev Notes

This story transforms the **read-only** StaffGrid from Story 6.3 into an **interactive** planning tool. It is **Phase 2** of the UX implementation roadmap: the "Staff-Tetris" interaction where admins drag shift chips between grid cells to resolve coverage gaps.

### Design Decision: @dnd-kit/core (NOT @dnd-kit/react)

**Use `@dnd-kit/core` + `@dnd-kit/utilities`** — the stable, production-ready API with `DndContext`, `useDraggable`, `useDroppable`, `DragOverlay`. Do NOT use `@dnd-kit/react` (the "next" API at next.dndkit.com) — it's still in beta/0.x.

**Why `@dnd-kit/core` and NOT `useSortable`:**
- The StaffGrid is NOT a sortable list — it's a grid where shifts are reassigned between cells
- We need independent `useDraggable` (on ShiftCell) + `useDroppable` (on grid cells)
- `useSortable` is for reordering items within a list, which doesn't match our use case
- `@dnd-kit/core` gives full control over collision detection, sensors, and visual feedback

**Package installation:**
```bash
pnpm add @dnd-kit/core @dnd-kit/utilities --filter=@pawly/web
```

### Drag-and-Drop Architecture

```
DndContext (in ScheduleViewWrapper or StaffGrid)
├── sensors: [PointerSensor (distance: 5), KeyboardSensor]
├── collisionDetection: closestCenter
├── onDragStart → set activeShift state
├── onDragOver → debounced preValidateMove → update dropFeedback
├── onDragEnd → if valid: moveShiftAction (optimistic) / if blocked: snap back + toast
│
├── StaffGrid
│   ├── StaffGridRow (per employee)
│   │   ├── Cell (useDroppable: id="{employeeId}|{date}")
│   │   │   ├── ShiftCell (useDraggable: id="{shiftId}")  ← DRAG SOURCE
│   │   │   ├── HoleCell (onClick → AssignShiftModal)      ← DROP TARGET + CTA
│   │   │   └── AbsenceCell (no DnD)
│   │   └── ...
│   └── ...
│
└── DragOverlay
    └── Ghost ShiftCell (follows cursor)
```

### Drop Target Visual States

Per UX specification, the drop target must provide immediate visual feedback:

| State | Visual | CSS Classes | Meaning |
|-------|--------|-------------|---------|
| **Valid** | Green glow | `ring-2 ring-emerald-400 bg-emerald-50/50` | Move is allowed, no violations |
| **Soft Warning** | Orange glow | `ring-2 ring-orange-400 bg-orange-50/50` | Move allowed but triggers soft violation |
| **Blocked** | Red shake | `ring-2 ring-rose-400 bg-rose-50/50 animate-shake` | Hard rule blocks this move |
| **Invalid** | No highlight | (default) | Cell cannot receive a drop (closed day, absence) |

### Optimistic UI Pattern

Follow the "Zero Latency" UX principle from the spec:

1. On `onDragEnd` with valid target:
   - **Immediately** update React Query cache with the moved shift
   - Fire `moveShiftAction` in background
   - On success: invalidate `planningScheduleView` for fresh data with updated violations
   - On error: rollback cache to previous state + show error toast

```typescript
// In useShiftMutations.ts
const moveShift = useServerActionMutation(moveShiftAction, {
  onMutate: async ({ shiftId, targetEmployeeId, targetDate }) => {
    await queryClient.cancelQueries({ queryKey: QueryKeyFactory.planningScheduleView(month) });
    const previous = queryClient.getQueryData(QueryKeyFactory.planningScheduleView(month));
    // Optimistically update the shift in cache
    queryClient.setQueryData(QueryKeyFactory.planningScheduleView(month), (old) => {
      // Update shift.employeeId and/or shift.date, set source to 'MANUAL'
      return optimisticallyMoveShift(old, shiftId, targetEmployeeId, targetDate);
    });
    return { previous };
  },
  onError: (_err, _vars, context) => {
    queryClient.setQueryData(QueryKeyFactory.planningScheduleView(month), context?.previous);
    toast.error(t('admin.dragDrop.moveError'));
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: QueryKeyFactory.planningScheduleView(month) });
  },
});
```

### Backend: Shift Mutation Methods

Add to `PlanningGenerationService`:

```typescript
async moveShift(
  clinicId: string,
  shiftId: string,
  target: { targetEmployeeId?: string; targetDate?: string }
): Promise<ScheduleShift> {
  const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) throw new NotFoundException('Shift not found');
  if (shift.clinicId !== clinicId) throw new ForbiddenException();

  // Validate target employee exists and belongs to clinic
  if (target.targetEmployeeId) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: target.targetEmployeeId, clinicId, isActive: true }
    });
    if (!employee) throw new NotFoundException('Employee not found');
  }

  return this.prisma.shift.update({
    where: { id: shiftId },
    data: {
      ...(target.targetEmployeeId && { employeeId: target.targetEmployeeId }),
      ...(target.targetDate && { date: new Date(`${target.targetDate}T00:00:00.000Z`) }),
      source: 'MANUAL', // CRITICAL: survives future regeneration
    },
  });
}

async preValidateMove(
  clinicId: string,
  shiftId: string,
  targetEmployeeId: string,
  targetDate: string
): Promise<{ hard: HardViolation[]; soft: SoftViolation[] }> {
  // 1. Load the shift
  // 2. Create a hypothetical shift placement
  // 3. Check unavailabilities for target employee on target date
  // 4. Check HARD rules (CONTRACT_COMPLIANCE, SKILL_REQUIREMENT, overlap)
  // 5. Check SOFT rules (ROTATION_EQUITY, overtime risk)
  // 6. Return violations without persisting
}
```

**CRITICAL: `source: 'MANUAL'`** — Any shift moved or created via drag-and-drop MUST have `source: 'MANUAL'`. This ensures the shift survives when the admin triggers `deleteGeneratedShifts` + `generatePlan` (which only deletes `source: 'GENERATED'` shifts).

### preValidateMove: Drop Feedback Logic

The `preValidateMove` dry-run check powers the real-time drop target feedback:

1. **Check unavailabilities**: Is the target employee unavailable (VACATION, SICK, SCHOOL) on the target date? → HARD block
2. **Check overlap**: Does the target employee already have a shift on the target date with overlapping times? → HARD block
3. **Check closed/non-work days**: Is the target date a closed day or non-work day? → HARD block
4. **Check SKILL_REQUIREMENT**: Does the target employee's jobType satisfy any active skill rules for this shift type? → HARD block
5. **Check CONTRACT_COMPLIANCE**: Would this move push the employee over weekly/monthly hour limits? → SOFT warning
6. **Check ROTATION_EQUITY**: Would this move worsen equity counters (e.g., 4th Saturday)? → SOFT warning

**Debouncing**: Call `preValidateMove` only after 200ms of hovering over a target cell (not on every pixel of cursor movement). Use `onDragOver` + `setTimeout` with cleanup.

### Keyboard Drag-and-Drop Fallback

Per UX spec and WCAG AA (NFR14, NFR17), keyboard DnD is **mandatory**:

1. **Pick up**: Focus a ShiftCell → press `Enter` or `Space` → shift enters "selected" mode (visual ring + `aria-live` announcement)
2. **Navigate**: Arrow keys move the "ghost" to adjacent grid cells (reuse `useGridKeyboard` logic)
3. **Drop**: Press `Enter` → if valid, execute move; if blocked, announce reason
4. **Cancel**: Press `Escape` → return to original cell

Implementation uses `@dnd-kit/core`'s built-in `KeyboardSensor` with a custom `coordinateGetter` adapted for the CSS Grid layout. The `data-row`/`data-col` attributes on grid cells (from Story 6.3) provide the navigation grid.

### AssignShiftModal

When clicking the "+" on a `HoleCell`, a modal shows eligible employees:

```
┌─────────────────────────────────────────────────┐
│  Assign shift: SURGERY — Mon Mar 3, 8:30-18:30  │
├─────────────────────────────────────────────────┤
│  ✅ Julie Martin (ASV)        [Assign]          │
│  ✅ Marc Dupont (ASV)          [Assign]          │
│  ❌ Eva Petit (APPRENTICE)     School day        │
│  ❌ Thomas Legrand (VET)       Skill mismatch    │
│  ⚠️ Sophie Duval (ASV)         Overtime risk     │
└─────────────────────────────────────────────────┘
```

- **Green rows**: Fully eligible, no violations
- **Red rows**: Hard block — greyed out with reason
- **Orange rows**: Soft warning — selectable but with warning badge

The modal calls `preValidateMove` for each employee to determine eligibility status.

### Relationship to Existing Infrastructure

**Services consumed:**

| Service | Method | Purpose |
|---------|--------|---------|
| `PlanningGenerationService` | NEW: `moveShift()` | Reassign shift to different employee/date |
| `PlanningGenerationService` | NEW: `createManualShift()` | Create shift from HoleCell assignment |
| `PlanningGenerationService` | NEW: `deleteShift()` | Delete a single shift |
| `PlanningGenerationService` | NEW: `preValidateMove()` | Dry-run validation for drop feedback |
| `PlanningGenerationService` | EXISTING: `getScheduleViewForMonth()` | Refresh grid after mutation |
| `PlanningService` | EXISTING: `validateShiftsAgainstRules()` | Used internally by preValidateMove |
| `ClinicService` | EXISTING: `getOperationalConfig()` | Check closed/work days |
| `ClinicService` | EXISTING: `listShiftTypes()` | Shift type metadata for modal |

**No new NestJS module** — extends `PlanningGenerationService` in existing `PlanningModule`.

**TRPCServices** — no new service injection needed (PlanningGenerationService already registered).

### Technical Requirements

- **Install `@dnd-kit/core` + `@dnd-kit/utilities`** — NO other DnD libraries (not react-dnd, not react-beautiful-dnd, not HTML5 native)
- **Do NOT install `@dnd-kit/sortable`** — we use `useDraggable` + `useDroppable` directly (grid reassignment, not list sorting)
- **Do NOT install `@dnd-kit/react`** (the "next" beta) — use stable `@dnd-kit/core`
- **Optimistic UI is MANDATORY** — drops must feel instant (NFR1: <100ms perceived latency). Server sync happens in background
- **`source: 'MANUAL'`** — ALL shifts created or moved via DnD must have `source: 'MANUAL'` to survive `deleteGeneratedShifts`
- **Debounced preValidateMove** — 200ms debounce on `onDragOver` to avoid flooding the API
- **No new Prisma schema changes** — the `Shift` model already has all required fields (`employeeId`, `date`, `source`, `shiftTypeCode`)
- **CSS transitions for snap-back** — invalid drops animate back smoothly (CSS `transition: transform 200ms ease`)
- **`sonner` toast for feedback** — already installed; use for move success/error messages
- **AbsenceCell and ClosedDayColumn are NOT droppable** — absence cells and closed-day columns must NOT accept drops

### Architecture Compliance (NON-NEGOTIABLE)

Mandatory end-to-end flow:
```text
Page (RSC) -> Client Component -> Hook -> Zsa Hook -> Server Action -> tRPC Client -> NestJS Service -> Prisma
```

- All shift mutation logic in `PlanningGenerationService` methods — NEVER compute moves in frontend
- tRPC procedures behind `subscribedProcedure` + ADMIN role check
- clinicId from `ctx.user.clinicId` — NEVER from client payload
- Input validation with Zod schemas from `@pawly/validators`
- Mutations invalidate `planningScheduleView` and `planningShifts` React Query keys via `QueryKeyFactory`
- DnD state management via `@dnd-kit/core` hooks in a client component
- Keyboard DnD via `@dnd-kit/core` `KeyboardSensor` — coexists with existing `useGridKeyboard`

### Library & Framework Requirements

- **`@dnd-kit/core` (`^6.x`)**: `DndContext`, `useDraggable`, `useDroppable`, `DragOverlay`, `PointerSensor`, `KeyboardSensor`, `useSensor`, `useSensors`, `closestCenter` collision detection. Install fresh — NOT currently in the project.
- **`@dnd-kit/utilities` (`^3.x`)**: `CSS.Transform.toString()` for drag transforms.
- **Prisma (`7.2.0`)**: `shift.update()` for move, `shift.create()` for manual, `shift.delete()` for removal. No schema changes.
- **NestJS (`11.x`)**: Add 4 methods to `PlanningGenerationService`. No new services.
- **tRPC (`11.x`)**: Add 4 procedures to `planning.router.ts`. `subscribedProcedure` + ADMIN.
- **Zod (`4.x` via `@pawly/zod`)**: New `moveShiftInputSchema`, `createManualShiftInputSchema`, `deleteShiftInputSchema`.
- **Next.js (`16.x`) + next-intl (`4.x`)**: Grid already in `/admin/planning/page.tsx`. DnD wraps existing components.
- **shadcn/ui**: `Dialog` for AssignShiftModal (already installed), `Badge` for employee status. May need `sonner` toast adjustments.
- **Lucide icons**: `GripVertical` (drag handle), `Check` (eligible), `X` (blocked), `AlertTriangle` (warning).
- **sonner**: Toast notifications for move success/error (already installed).
- **NO framer-motion** — CSS transitions sufficient for snap-back and drop animations.
- **NO `@dnd-kit/sortable`** — grid reassignment, not list sorting.
- **NO `@dnd-kit/react`** — beta/0.x, use stable `@dnd-kit/core`.

### File Structure Requirements

**Files to create:**

```text
packages/validators/src/planning/
  shift-mutation.schema.ts
  shift-mutation.schema.test.ts

apps/web/src/app/[locale]/admin/planning/
  _components/
    DndGridContext.tsx          (DndContext + sensors + overlay wrapper)
    DraggableShiftCell.tsx      (ShiftCell wrapped with useDraggable)
    DroppableGridCell.tsx       (Grid cell wrapper with useDroppable)
    AssignShiftModal.tsx        (Employee selection modal for holes)
    DragGhost.tsx               (DragOverlay content — ghost shift chip)
  _hooks/
    useDragAndDrop.ts           (DnD state: activeShift, dropFeedback)
    useShiftMutations.ts        (move/create/delete mutations with optimistic UI)
  _actions/
    shift-mutation-actions.ts   (ZSA server actions for shift CRUD)

apps/web/src/app/[locale]/admin/planning/
  __tests__/
    drag-drop.spec.tsx          (DnD interaction tests)
```

**Files to modify:**

- `apps/api/src/modules/planning/planning-generation.service.ts` (add moveShift, createManualShift, deleteShift, preValidateMove methods)
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` (add shift mutation tests)
- `apps/api/src/trpc/routers/planning.router.ts` (add 4 new procedures)
- `apps/api/src/trpc/routers/planning.router.spec.ts` (add router tests)
- `apps/web/src/app/[locale]/admin/planning/_components/StaffGrid.tsx` (wrap in DndGridContext)
- `apps/web/src/app/[locale]/admin/planning/_components/StaffGridRow.tsx` (wrap cells in DroppableGridCell, ShiftCells in DraggableShiftCell)
- `apps/web/src/app/[locale]/admin/planning/_components/ShiftCell.tsx` (add drag handle visual, cursor-grab styling)
- `apps/web/src/app/[locale]/admin/planning/_components/HoleCell.tsx` (wire onClick to open AssignShiftModal)
- `apps/web/src/app/[locale]/admin/planning/_components/ScheduleViewWrapper.tsx` (pass mutation callbacks, instantiate useShiftMutations)
- `apps/web/src/lib/hooks/server-action-hooks.ts` (add planningShiftMutations key if needed)
- `packages/validators/src/planning/index.ts` (export shift-mutation schemas)
- `apps/web/src/i18n/langs/en.json` (add admin.dragDrop namespace)
- `apps/web/src/i18n/langs/fr.json` (add admin.dragDrop namespace)

**Structure constraints:**
- DnD context wrapper is route-local under `/admin/planning/_components/`
- `useDragAndDrop` manages DnD interaction state only (no server state)
- `useShiftMutations` manages server mutations + optimistic cache updates
- DnD callbacks flow: `DndGridContext` → `useDragAndDrop` → `useShiftMutations`
- `ShiftCell` remains a presentation component — drag behavior added via wrapper `DraggableShiftCell`
- Grid cell droppable behavior added via wrapper `DroppableGridCell` (composition over modification)

### Testing Requirements

**Validators (Vitest, `*.test.ts`):**
- accept valid moveShift input with shiftId UUID and targetEmployeeId UUID
- accept valid moveShift input with shiftId UUID and targetDate YYYY-MM-DD
- accept valid moveShift input with both targetEmployeeId and targetDate
- reject moveShift input with neither targetEmployeeId nor targetDate
- reject moveShift input with invalid UUID
- reject moveShift input with invalid date format
- accept valid createManualShift input
- reject createManualShift with missing required fields
- accept valid deleteShift input

**API service tests (Jest, `*.spec.ts`):**
- `moveShift` updates employeeId when targetEmployeeId provided
- `moveShift` updates date when targetDate provided
- `moveShift` sets source to 'MANUAL'
- `moveShift` throws NotFoundException for non-existent shift
- `moveShift` throws ForbiddenException for wrong clinic's shift
- `createManualShift` creates shift with source MANUAL
- `createManualShift` creates shift with correct clinic ownership
- `deleteShift` removes shift from database
- `deleteShift` throws NotFoundException for non-existent shift
- `deleteShift` throws ForbiddenException for wrong clinic
- `preValidateMove` returns hard violation when employee is unavailable
- `preValidateMove` returns hard violation when shift overlaps
- `preValidateMove` returns soft violation for overtime risk
- `preValidateMove` returns empty violations for valid move
- clinic isolation: cannot move/create/delete shifts in other clinics

**tRPC router tests (Jest, `*.spec.ts`):**
- auth/subscription middleware enforced for moveShift
- auth/subscription middleware enforced for createManualShift
- auth/subscription middleware enforced for deleteShift
- auth/subscription middleware enforced for preValidateMove
- ADMIN can execute all 4 procedures
- EMPLOYEE receives FORBIDDEN for all 4 procedures
- input validation for moveShift (UUID, date format)
- input validation for createManualShift (required fields)

**Web tests (Vitest, `*.spec.tsx`):**
- DndGridContext renders DndContext with children
- DraggableShiftCell renders shift content with drag attributes
- DroppableGridCell applies visual feedback classes when isOver
- DragGhost renders ghost shift chip during drag
- AssignShiftModal renders employee list with eligible/blocked status
- AssignShiftModal calls createManualShiftAction on employee select
- HoleCell onClick opens AssignShiftModal
- useShiftMutations invalidates schedule view on success
- Keyboard: Enter picks up shift, Enter drops shift
- FR/EN rendering assertions for DnD labels and modal
- Toast appears on successful move
- Toast appears on blocked move

**Quality gates before PR (run from repository root):**
- `pnpm test`
- `pnpm build`
- `pnpm lint`

### Previous Story Intelligence (Story 6.3 + 6.2 + Epic 5) — EXHAUSTIVE

**Story 6.3 (Schedule Visualization & Conflict Indicators):**
- `StaffGrid.tsx` uses CSS Grid with `grid-template-columns: 200px repeat(N, minmax(120px, 1fr)) 90px` — DnD must work within this grid layout
- `StaffGridRow.tsx` builds cell content by checking: `isClosed/!isWorkDay → ClosedDay`, `unavailability → AbsenceCell`, `else → ShiftCell + HoleCell + ConflictIndicator` — DnD wrappers go around existing components
- `ShiftCell.tsx` is a pure display component — wrap with `DraggableShiftCell` rather than modifying directly (composition)
- `HoleCell.tsx` has `role="button"`, `tabIndex={0}`, keyboard handlers — add `onClick` for AssignShiftModal
- `useGridKeyboard.ts` tracks `activeRow`/`activeCol` with `data-row`/`data-col` — DnD keyboard sensor must coexist (not conflict)
- `ScheduleViewWrapper.tsx` builds `conflictMap` and passes data to `StaffGrid` — add `useShiftMutations` instantiation here
- `shiftIndex: Map<"employeeId|date", ScheduleShift[]>` — same key pattern used for drop target IDs
- `unavailabilityIndex: Map<"employeeId|date", ScheduleUnavailability[]>` — use for local pre-validation (immediate red highlight for absence cells)
- `placeholderData: (prev) => prev` in `useScheduleView` prevents skeleton flash during invalidation
- Code review: responsive 3-day lite view for `< 1024px` — DnD must work in both 7-day and 3-day modes
- Code review: Radix `Popover` for conflict details — DnD must not interfere with popover open/close
- Vital Orange `bg-[#F97316]/10` for hard violations — different from DnD blocked red (`rose-400`)

**Story 6.2 (Greedy Generation Algorithm):**
- `deleteGeneratedShifts` only removes `source: 'GENERATED'` shifts — confirms that `source: 'MANUAL'` survives regeneration
- `generateMonthlyPlan` uses `$transaction` for atomicity — DnD mutations are single-shift operations, no $transaction needed
- `PlanningGenerationService` is registered in `TRPCServices` — add new methods to same service
- `validateShiftsAgainstRules` evaluates 4 rule categories — reuse for `preValidateMove` dry-run

**Story 5.5 (Planning Assistance Rules):**
- `PlanningRule.ruleType: HARD | SOFT` determines whether to BLOCK or WARN on drop
- Rule categories: STAFFING_MINIMUM, SKILL_REQUIREMENT, ROTATION_EQUITY, CONTRACT_COMPLIANCE
- `subscribedProcedure` composition is LOCAL in each router file — follow same pattern for new procedures

**Story 5.2 (Declarative Constraints):**
- `Unavailability.daysOfWeek: Int[]` for recurring, empty for one-time — check both in preValidateMove
- Expanding recurring unavailabilities: `getISODay(targetDate)` in `daysOfWeek` → HARD block

**Story 5.1 (Employee CRUD):**
- `Employee.isActive` — only show active employees in AssignShiftModal
- `Employee.jobType` — filter by skill in AssignShiftModal
- `Employee.color` — use in DragGhost for visual continuity

**Cross-cutting learnings:**
- `useServerActionMutation` wraps standard React Query `useMutation` — does NOT have `actionKeyFactory`. Use `onSuccess` with `queryClient.invalidateQueries()` for cache invalidation
- Zod `.refine()` creates ZodEffects — use `.superRefine()` on base object schema for the "at least one of targetEmployeeId/targetDate" validation
- Test patterns: API = Jest `*.spec.ts`, Web = Vitest `*.spec.tsx`, Validators = Vitest `*.test.ts`
- `staleTime: 0` + `refetchOnMount: "always"` ensures fresh data after mutations

### Git Intelligence Summary

Recent commit trajectory:
- `7ee05447` — `fix(story-6-3): address 12 code review findings from PR #26`
- `de021f66` — `docs: Mark epic-6 as done in sprint status.`
- `a3b10561` — `docs(story-6-3): mark story as done in story file and sprint-status`

Story 7.1 is the natural continuation: 6.3 created the read-only StaffGrid, 7.1 adds interactivity. The grid components, data structures, and styling from 6.3 are reused directly — 7.1 wraps them with DnD behavior via composition.

### Latest Tech Information (Context7)

- **`@dnd-kit/core` v6.x**: Stable, production-ready. `DndContext` is the root provider. `useDraggable` returns `{ attributes, listeners, setNodeRef, transform, isDragging }`. `useDroppable` returns `{ setNodeRef, isOver, active }`. `DragOverlay` renders a portal-based ghost element. `PointerSensor` has `activationConstraint: { distance: 5 }` to prevent accidental drags from clicks.
- **`KeyboardSensor`**: Built-in accessibility sensor. Works with `sortableKeyboardCoordinates` for lists, but for grids we may need a custom `coordinateGetter` that maps arrow keys to grid cells using `data-row`/`data-col` attributes.
- **`closestCenter` collision detection**: Best for grid layouts — finds the droppable whose center is closest to the pointer position. Better than `closestCorners` for non-overlapping grid cells.
- **Optimistic update pattern**: React Query v5 `onMutate` → cancel queries → snapshot previous → update cache → return context. `onError` → rollback. `onSettled` → invalidate. This is the standard pattern.
- **Touch activation**: `PointerSensor` handles both mouse and touch. Add `activationConstraint: { delay: 250, tolerance: 5 }` for mobile to distinguish scroll from drag (if mobile DnD is needed in future).

### Project Structure Notes

- Story 7.1 builds ON TOP of Story 6.3's StaffGrid — it does NOT replace or rewrite grid components
- DnD behavior is added via wrapper components (`DraggableShiftCell`, `DroppableGridCell`, `DndGridContext`) — composition over modification
- The `DndContext` wraps the `StaffGrid` content, NOT the entire page
- `useShiftMutations` and `useDragAndDrop` are separate hooks — mutations are independent of DnD (AssignShiftModal also uses mutations without DnD)
- Existing `useGridKeyboard` for arrow key navigation coexists with DnD `KeyboardSensor` — they handle different interaction modes (navigation vs. move)
- The `preValidateMove` API is a lightweight read-only check — it does NOT modify data, so it can be called frequently during drag
- After any mutation, `getScheduleViewForMonth` re-runs server-side (via query invalidation), which recomputes holes and violations automatically

### References

- [Source: docs/planning-artifacts/epics.md#Story 7.1 — Manual Schedule Adjustment]
- [Source: docs/planning-artifacts/architecture.md#UI Component Libraries — dnd-kit for accessible drag-and-drop]
- [Source: docs/planning-artifacts/ux-design-specification.md#The Staff-Grid — Drag states, Drop targets, Keyboard DnD]
- [Source: docs/planning-artifacts/ux-design-specification.md#Experience Mechanics — Initiation, Interaction, Feedback, Completion]
- [Source: docs/planning-artifacts/ux-design-specification.md#Accessibility Strategy — Keyboard navigation, Screen readers]
- [Source: docs/implementation-artifacts/6-3-schedule-visualization-conflict-indicators.md — StaffGrid, ShiftCell, HoleCell, useScheduleView, useGridKeyboard]
- [Source: docs/implementation-artifacts/6-2-greedy-generation-algorithm-blocking-rules.md — PlanningGenerationService, deleteGeneratedShifts, source field]
- [Source: docs/implementation-artifacts/5-5-planning-assistance-rules-configurable.md — validateShiftsAgainstRules, PlanningRule]
- [Source: docs/implementation-artifacts/5-2-declarative-constraints-configuration.md — Unavailability model, recurring expansion]
- [Source: Context7 @dnd-kit/core — DndContext, useDraggable, useDroppable, DragOverlay, sensors, collision detection]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
