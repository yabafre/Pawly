# Story 7.4: Planning Health Bar

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to see a real-time, animated summary of the planning health including holes, hard conflicts, and soft warnings,
so that I know at a glance whether the schedule is ready to be published and can take action on any remaining issues.

## Acceptance Criteria

1. **Given** the planning interface **When** I am editing or generating a schedule **Then** a "Health Bar" component aggregates counts for holes, hard conflicts, and soft warnings in a segmented progress bar.
2. **Given** the Health Bar **When** holes exist in the schedule **Then** a distinct neutral/dashed segment appears in the bar representing unfilled slots, and the hole count is displayed in the summary text.
3. **Given** the Health Bar **When** hard conflicts (blocking violations) exist **Then** a rose-colored segment appears, the Publish button is disabled, and a blocking message is displayed.
4. **Given** the Health Bar **When** only soft warnings exist (no hard conflicts, no holes) **Then** an orange segment appears, the Publish button is enabled, and the confirmation dialog warns about existing soft violations before publishing.
5. **Given** the Health Bar **When** all shifts are valid with no holes, hard conflicts, or soft warnings **Then** the bar is fully teal, a healthy message is shown, and the Publish button pulses subtly to invite publication.
6. **Given** any change in violations or holes **When** the schedule data updates (after generation, drag-drop, manual assignment, or deletion) **Then** the Health Bar segments animate smoothly using framer-motion spring transitions (not just CSS transitions).
7. **Given** the Health Bar **When** a screen reader is active **Then** status changes are announced via `aria-live="polite"` region, and the bar has proper `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` attributes.
8. **Given** the Health Bar summary area **When** I hover over or click the violation/hole counts **Then** a popover/tooltip shows a detailed breakdown of violations grouped by category (STAFFING_MINIMUM, SKILL_REQUIREMENT, ROTATION_EQUITY, CONTRACT_COMPLIANCE) and holes grouped by date.
9. **Given** the planning has been published **When** I view the Health Bar **Then** a "Published" badge/indicator is visible with the publication timestamp, and the Publish button is hidden.
10. **Given** a fresh schedule with zero shifts **When** I view the Health Bar **Then** an appropriate empty state is shown (e.g., "No shifts generated yet") rather than misleading 100% healthy.

## Tasks / Subtasks

- [x] Task 1: Enhance PlanningHealthBar props and calculation logic (AC: #1, #2, #3, #10)
  - [x] 1.1 Add `holeCount` prop to PlanningHealthBar
  - [x] 1.2 Add `publicationStatus` prop (status, publishedAt, publishedBy)
  - [x] 1.3 Refactor segment width calculation to include holes: `hardWidth + softWidth + holeWidth + healthyWidth = 100%`
  - [x] 1.4 Add empty state when `totalShifts === 0` and no violations (fresh schedule)
  - [x] 1.5 Update subtitle text to include hole count in summary (e.g., "2 conflicts, 3 warnings, 1 hole, 85% ready")

- [x] Task 2: Add framer-motion animations to Health Bar (AC: #6)
  - [x] 2.1 Install framer-motion if not already present (`pnpm add framer-motion --filter @pawly/web`)
  - [x] 2.2 Replace CSS `transition-all` on bar segments with `motion.div` using `layout` prop and spring transition
  - [x] 2.3 Animate segment width changes with `animate={{ width }}` and `transition={{ type: "spring", stiffness: 300, damping: 30 }}`
  - [x] 2.4 Add subtle entrance animation for the health bar on first render (fade-in + slide-up)
  - [x] 2.5 Add pulse animation on Publish button when status is fully healthy (AC: #5)

- [x] Task 3: Accessibility improvements (AC: #7)
  - [x] 3.1 Add `role="progressbar"` with `aria-valuenow={clampedPercent}`, `aria-valuemin={0}`, `aria-valuemax={100}` to the segmented bar container
  - [x] 3.2 Add `aria-label` describing current state (e.g., "Planning health: 85% ready, 2 conflicts, 3 warnings, 1 hole")
  - [x] 3.3 Wrap the subtitle text in an `aria-live="polite"` region so screen readers announce changes
  - [x] 3.4 Ensure keyboard focus order includes the detail popover trigger and Publish button

- [x] Task 4: Violation/Hole detail popover (AC: #8)
  - [x] 4.1 Create `HealthBarDetailPopover` component using shadcn Popover
  - [x] 4.2 Group hard violations by category (STAFFING_MINIMUM, SKILL_REQUIREMENT, ROTATION_EQUITY, CONTRACT_COMPLIANCE) with counts
  - [x] 4.3 Group soft violations by category with counts
  - [x] 4.4 Group holes by date with shift type codes
  - [x] 4.5 Accept `violations` and `holes` as props from ScheduleViewWrapper
  - [x] 4.6 Add hover trigger on the summary text and a click trigger for mobile

- [x] Task 5: Publication status indicator (AC: #9)
  - [x] 5.1 When `publicationStatus.status === "PUBLISHED"`, show a "Published" badge with timestamp
  - [x] 5.2 Hide the Publish button when already published
  - [x] 5.3 Style the published badge with Vet Teal (`#009588`) and CheckCircle2 icon

- [x] Task 6: Update ScheduleViewWrapper integration (AC: #1, #2, #8, #9)
  - [x] 6.1 Pass `holeCount={scheduleData.holes.length}` to PlanningHealthBar
  - [x] 6.2 Pass `violations={scheduleData.violations}` for detail popover
  - [x] 6.3 Pass `holes={scheduleData.holes}` for detail popover
  - [x] 6.4 Pass `publicationStatus` to PlanningHealthBar
  - [x] 6.5 Remove redundant isPublished logic from ScheduleViewWrapper (moved to Health Bar)

- [x] Task 7: i18n translations (AC: all)
  - [x] 7.1 Add new FR keys: `healthBar.holes`, `healthBar.emptyState`, `healthBar.published`, `healthBar.publishedAt`, `healthBar.detailTitle`, `healthBar.category.*`
  - [x] 7.2 Add matching EN keys
  - [x] 7.3 Use ICU plural syntax for holes count: `"{count, plural, =0 {Aucun trou} one {# trou} other {# trous}}"`

- [x] Task 8: Tests (AC: all)
  - [x] 8.1 Update existing PlanningHealthBar tests in `publish.spec.tsx` for new props (holeCount, publicationStatus)
  - [x] 8.2 Add tests for hole segment rendering and width calculation
  - [x] 8.3 Add tests for empty state (totalShifts === 0)
  - [x] 8.4 Add tests for published state indicator
  - [x] 8.5 Add tests for aria attributes (role, aria-valuenow, aria-live)
  - [x] 8.6 Add tests for HealthBarDetailPopover (grouped violations, grouped holes)
  - [x] 8.7 Add tests for pulse animation class on Publish button when healthy
  - [x] 8.8 Target: ~25-30 new/updated tests

- [x] Task 9: Build verification and quality gates
  - [x] 9.1 Run `pnpm build` — must pass with zero errors
  - [x] 9.2 Run `pnpm test` — all tests must pass (current: 1793 + ~25 new ≈ 1818)
  - [x] 9.3 Verify no TypeScript errors (`tsc --noEmit`)
  - [x] 9.4 Visual verification: Health Bar animates on schedule changes

## Dev Notes

### Existing Implementation (from Story 7-2)

The Health Bar already exists as a basic component created during Story 7-2 (Equity Alerts Management). This story **enhances** it — do NOT rewrite from scratch.

**Files already in place:**
- `apps/web/src/app/[locale]/admin/planning/_components/PlanningHealthBar.tsx` — Basic segmented bar (hard/soft/healthy segments, publish button, CSS transitions)
- `apps/web/src/app/[locale]/admin/planning/_components/ScheduleViewWrapper.tsx` — Orchestrator that integrates Health Bar (lines 144-157)
- `apps/web/src/app/[locale]/admin/planning/_components/PublishConfirmDialog.tsx` — Publication confirmation dialog
- `apps/web/src/app/[locale]/admin/planning/__tests__/publish.spec.tsx` — 16 existing tests for HealthBar + PublishDialog
- `apps/web/src/app/[locale]/admin/planning/_hooks/usePublish.ts` — Publication query/mutation hook
- `apps/web/src/app/[locale]/admin/planning/_hooks/useScheduleView.ts` — Schedule data fetching + week navigation
- `apps/web/src/i18n/langs/fr.json` (lines 216-224) — Existing FR health bar translations
- `apps/web/src/i18n/langs/en.json` (lines 216-224) — Existing EN health bar translations

**Current PlanningHealthBar props:**
```typescript
type Props = {
  hardViolationCount: number;
  softViolationCount: number;
  totalShifts: number;
  onPublish?: () => void;
};
```

**Target PlanningHealthBar props (after enhancement):**
```typescript
type Props = {
  hardViolationCount: number;
  softViolationCount: number;
  holeCount: number;
  totalShifts: number;
  onPublish?: () => void;
  publicationStatus?: {
    status: "DRAFT" | "PUBLISHED";
    publishedAt?: string;
    publishedBy?: string;
  };
  violations?: {
    hard: HardViolation[];
    soft: SoftViolation[];
  };
  holes?: ScheduleHole[];
};
```

### Architecture Compliance

**Data Flow (Non-Negotiable):**
```
PlanningPageClient
  └─ ScheduleViewWrapper
       ├─ useScheduleView(month) → getScheduleViewAction → trpc.planning.getScheduleView
       │   └─ Returns: ScheduleViewData { violations, holes, shifts, ... }
       ├─ usePublish(month) → getPublicationStatusAction → trpc.planning.getPublicationStatus
       │   └─ Returns: { status, publishedAt, publishedBy }
       └─ PlanningHealthBar (enhanced)
            ├─ Receives all data as props (no direct API calls)
            ├─ HealthBarDetailPopover (new child component)
            └─ PublishConfirmDialog (existing, unchanged)
```

**CRITICAL: No backend changes needed.** All data (violations, holes, publication status) is already available in the existing `ScheduleViewData` schema and hooks. This is a **frontend-only** story.

### Library & Framework Requirements

**framer-motion (motion):**
- Already referenced in architecture as required for Health Bar animations
- Use `motion.div` with `layout` prop for smooth segment transitions
- Use `animate={{ width: "XX%" }}` with `transition={{ type: "spring", stiffness: 300, damping: 30 }}`
- Use `AnimatePresence` for entrance/exit animations
- Import from `"motion/react"` (the latest Motion for React API)
- Check package.json first — if not installed: `pnpm add motion --filter @pawly/web`

**shadcn/ui Popover:**
- Use for the detail breakdown popover
- May need to install: `pnpm dlx shadcn@latest add popover --cwd apps/web`
- Wrap trigger around the summary text counts

**Existing shadcn components already available:**
- Button, AlertDialog (used in PublishConfirmDialog)
- Badge (available for Published indicator)

### File Structure (No New Directories)

```
apps/web/src/app/[locale]/admin/planning/
├── _components/
│   ├── PlanningHealthBar.tsx          ← MODIFY (add holes, animations, aria, published state)
│   ├── HealthBarDetailPopover.tsx     ← NEW (violation/hole detail breakdown)
│   ├── ScheduleViewWrapper.tsx        ← MODIFY (pass new props to HealthBar)
│   ├── PublishConfirmDialog.tsx       ← NO CHANGE
│   └── ... (other existing components unchanged)
├── _hooks/
│   ├── usePublish.ts                  ← NO CHANGE (already returns publicationStatus)
│   └── useScheduleView.ts            ← NO CHANGE (already returns violations + holes)
├── _actions/
│   └── publish-actions.ts             ← NO CHANGE
├── __tests__/
│   └── publish.spec.tsx               ← MODIFY (add new tests, update existing)
└── page.tsx                           ← NO CHANGE
```

### i18n Keys to Add

**FR (`apps/web/src/i18n/langs/fr.json` → `admin.planningRules.healthBar`):**
```json
{
  "holes": "{count, plural, =0 {Aucun trou} one {# trou} other {# trous}}",
  "emptyState": "Aucun créneau généré — lancez la génération d'abord",
  "published": "Publié",
  "publishedAt": "Publié le {date}",
  "detailTitle": "Détail de la santé",
  "categoryStaffing": "Effectif minimum",
  "categorySkill": "Compétences requises",
  "categoryEquity": "Équité de rotation",
  "categoryContract": "Conformité contrat",
  "holesOnDate": "{count, plural, one {# trou} other {# trous}} le {date}"
}
```

**EN (`apps/web/src/i18n/langs/en.json` → `admin.planningRules.healthBar`):**
```json
{
  "holes": "{count, plural, =0 {No holes} one {# hole} other {# holes}}",
  "emptyState": "No shifts generated yet — run generation first",
  "published": "Published",
  "publishedAt": "Published on {date}",
  "detailTitle": "Health Details",
  "categoryStaffing": "Staffing Minimum",
  "categorySkill": "Skill Requirements",
  "categoryEquity": "Rotation Equity",
  "categoryContract": "Contract Compliance",
  "holesOnDate": "{count, plural, one {# hole} other {# holes}} on {date}"
}
```

### Testing Standards

- **Framework:** Vitest + @testing-library/react (consistent with existing `publish.spec.tsx`)
- **File:** Update `apps/web/src/app/[locale]/admin/planning/__tests__/publish.spec.tsx`
- **Mock strategy:** `next-intl` globally mocked in vitest.setup.ts, shadcn components mocked locally
- **framer-motion mock:** Mock `motion/react` to render plain divs with style props (for unit tests):
  ```typescript
  vi.mock("motion/react", () => ({
    motion: {
      div: ({ children, animate, style, ...props }: any) => (
        <div style={{ ...style, ...animate }} {...props}>{children}</div>
      ),
    },
    AnimatePresence: ({ children }: any) => children,
  }));
  ```
- **Target:** ~25-30 new/updated tests covering holes, animations, aria, published state, detail popover

### Previous Story Intelligence (Story 7-3)

**Key learnings from Story 7-3 (Absence Request & Validation Workflow):**
- React Query cache invalidation: Use prefix matching `queryKey: ["planning"]` to invalidate ALL planning queries
- Type safety: Avoid `as any` — use specific type assertions or intermediate type helpers
- `$transaction` callback form preferred over array form for atomicity
- ICU message syntax for plurals — always test with count=0, count=1, count=2+
- Test mock patterns: Mock Prisma at the service level, mock tRPC at the action level
- Code review findings from 7-3: 19 issues (5 CRITICAL), all focused on type safety, race conditions, i18n correctness

**Key learnings from Story 7-2 (Equity Alerts):**
- PlanningHealthBar was created as part of this story — minimal implementation
- `equitySummary` already flows through ScheduleViewData
- `WarningBadge` component exists for cell-level soft violation indicators
- `EmployeeEquityBadge` shows individual equity on StaffGridRow
- Publication flow (publishPlan + PublishConfirmDialog) was created here

**Key learnings from Story 7-1 (Drag & Drop):**
- Optimistic UI pattern: onMutate sets temporary state, onSettled invalidates queries
- Toast feedback for every user action (sonner)
- React.memo on StaffGridRow for performance

### Git Intelligence (Recent Commits)

```
eca55190 feat(story-7-3): Absence request & validation workflow (#30)
eb24ec60 fix(story-7-2): address 8 code review findings from PR #29
bb4dd274 feat(story-7-2): Equity alerts management, publish workflow & code review fixes
6fb50570 feat(story-7-1): Manual schedule adjustment with drag-and-drop (#28)
```

**Commit pattern:** `feat(story-X-Y): Description (#PR)`
**Branch pattern:** `feature/story-7-4-planning-health-bar`

### Color Semantic Reference (from UX Spec)

| Segment | Color | Hex/Class | Meaning |
|---------|-------|-----------|---------|
| Hard conflicts | Rose | `bg-rose-500` | Blocking errors — must resolve before publish |
| Soft warnings | Orange | `bg-orange-400` | Warnings — publish allowed but cautioned |
| Holes | Neutral dashed | `bg-neutral-300` with dashed pattern | Unfilled slots needing assignment |
| Healthy | Vet Teal | `bg-[#009588]` | Valid shifts — ready for publication |
| Published badge | Vet Teal | `text-[#009588]` + `bg-emerald-50` | Schedule published successfully |

### Visual States Reference

```
CRITICAL STATE (hard conflicts exist):
┌─[!] Planning Health ─────────────────────────────────────────┐
│  2 conflicts, 3 warnings, 1 hole, 60% ready                 │
│  ██████░░░░░░░░░░░░░░░████████████████████████  [Publish ✗]  │
│  rose   orange         teal                      (disabled)  │
│  ⚠ Publication impossible — résolvez les conflits d'abord    │
└──────────────────────────────────────────────────────────────┘

WARNING STATE (soft warnings only):
┌─[⚠] Planning Health ────────────────────────────────────────┐
│  0 conflicts, 3 warnings, 0 holes, 85% ready                │
│  ░░░░░░░░░░░░░████████████████████████████████  [Publish ✓]  │
│  orange       teal                               (enabled)   │
└──────────────────────────────────────────────────────────────┘

HEALTHY STATE (all clear):
┌─[✓] Planning Health ────────────────────────────────────────┐
│  Tout est bon — aucune violation détectée                    │
│  ████████████████████████████████████████████████ [Publish ✨]│
│  teal (full)                                      (pulsing) │
└──────────────────────────────────────────────────────────────┘

PUBLISHED STATE:
┌─[✓] Planning Health ────────────────────────────────────────┐
│  Tout est bon — aucune violation détectée    ✓ Publié le 24/02│
│  ████████████████████████████████████████████████             │
│  teal (full)                                                 │
└──────────────────────────────────────────────────────────────┘

EMPTY STATE (no shifts):
┌─[○] Planning Health ────────────────────────────────────────┐
│  Aucun créneau généré — lancez la génération d'abord         │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░            │
│  neutral (empty)                                             │
└──────────────────────────────────────────────────────────────┘
```

### Project Structure Notes

- All files align with existing `admin/planning/_components/` structure
- Only 1 new file: `HealthBarDetailPopover.tsx`
- No new directories needed
- No backend changes — pure frontend enhancement
- Follows established patterns: route-local `_components/`, i18n via `useTranslations`, Vitest + RTL

### References

- [Source: docs/planning-artifacts/epics.md#Story 7.4] — Acceptance criteria
- [Source: docs/planning-artifacts/ux-design-specification.md#The Health Bar (Admin)] — UX spec for Health Bar component
- [Source: docs/planning-artifacts/architecture.md#UI Component Libraries] — framer-motion requirement
- [Source: docs/planning-artifacts/ux-design-specification.md#Accessibility Strategy] — aria-live requirement
- [Source: apps/web/src/app/[locale]/admin/planning/_components/PlanningHealthBar.tsx] — Existing implementation
- [Source: apps/web/src/app/[locale]/admin/planning/_components/ScheduleViewWrapper.tsx] — Integration point
- [Source: apps/web/src/app/[locale]/admin/planning/__tests__/publish.spec.tsx] — Existing test suite
- [Source: packages/validators/src/planning/schedule-view.schema.ts] — ScheduleViewData types (violations, holes)
- [Source: packages/validators/src/planning/planning-generation.schema.ts] — HardViolation, SoftViolation types
- [Source: apps/web/src/i18n/langs/fr.json#216-224] — Existing i18n keys
- [Source: docs/implementation-artifacts/7-3-absence-request-validation-workflow.md] — Previous story learnings
- [Source: docs/implementation-artifacts/7-2-equity-alerts-management-soft-rules.md] — Health Bar origin story

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation with no blocking issues.

### Completion Notes List

- **Task 1**: Enhanced PlanningHealthBar with new props (holeCount, publicationStatus, violations, holes). Refactored segment calculation to include holes as 4th segment (bg-neutral-300 with dashed pattern). Empty state shows when totalShifts=0 and no violations. Subtitle includes hole count with ICU plural syntax.
- **Task 2**: Installed `motion` package. Replaced CSS transitions with motion.div spring animations (stiffness: 300, damping: 30). Added entrance animation (fade-in + slide-up via motion.section). Added AnimatePresence for segment enter/exit. Publish button pulses via Tailwind animate-pulse when healthy.
- **Task 3**: Added role="progressbar" with aria-valuenow/min/max on segmented bar. Added aria-label with full status description. Wrapped subtitle in aria-live="polite" + role="status" region. Popover trigger uses semantic button element for keyboard accessibility.
- **Task 4**: Created HealthBarDetailPopover component using shadcn Popover. Groups hard violations by category (4 categories), soft violations by category, and holes by date. Click trigger on summary text. Falls through to plain children when no content.
- **Task 5**: Published badge (Badge variant="secondary" with CheckCircle2 icon) shown when status=PUBLISHED. Displays formatted publishedAt date or just "Published" text. Publish button hidden when published.
- **Task 6**: ScheduleViewWrapper passes holeCount, violations, holes, and publicationStatus to PlanningHealthBar. Removed redundant isPublished variable — logic moved to Health Bar.
- **Task 7**: Added 10 new i18n keys in both FR and EN (holes ICU plural, emptyState, published, publishedAt, detailTitle, 4 category keys, holesOnDate ICU plural).
- **Task 8**: 55 total tests (was 16, added 39 new). Covers holes, empty state, published state, aria attributes, pulse animation, HealthBarDetailPopover grouped violations/holes.
- **Task 9**: Build passes with zero errors. All 1822 tests pass (619 web + 647 API + 556 validators).

### Change Log

- 2026-02-24: Story 7.4 implemented. Enhanced PlanningHealthBar with holes segment, framer-motion spring animations, WCAG accessibility (progressbar, aria-live), HealthBarDetailPopover (grouped violations/holes), publication status indicator, empty state. +39 new tests (55 total in publish.spec.tsx). 1822 total tests. Build green.
- 2026-02-24: Code review fixes (8 issues: 2 HIGH, 3 MEDIUM, 3 LOW). H1: Added hover trigger to HealthBarDetailPopover via controlled open state with onMouseEnter/onMouseLeave + 200ms close delay. H2: Fixed isEmpty to include holeCount check. M1: Added useLocale() for toLocaleDateString. M2: Changed animate-pulse to motion-safe:animate-pulse for prefers-reduced-motion. M3: Changed Math.round to Math.floor for segment widths preventing >100% sum. L1: Removed redundant AnimatePresence mode="sync". L2: Replaced index keys with ruleId/shiftTypeCode composite keys. L3: Added pnpm-lock.yaml to File List. Also fixed planning-rules.spec.tsx (added holeCount prop + missing mocks). 621 web tests pass.

### File List

- `apps/web/src/app/[locale]/admin/planning/_components/PlanningHealthBar.tsx` — MODIFIED (enhanced with holes, animations, aria, published state, review fixes)
- `apps/web/src/app/[locale]/admin/planning/_components/HealthBarDetailPopover.tsx` — NEW (violation/hole detail breakdown popover with hover support)
- `apps/web/src/app/[locale]/admin/planning/_components/ScheduleViewWrapper.tsx` — MODIFIED (pass new props to HealthBar, removed isPublished)
- `apps/web/src/app/[locale]/admin/planning/__tests__/publish.spec.tsx` — MODIFIED (41 new tests, motion mock, popover mock, badge mock, hover test)
- `apps/web/src/app/[locale]/admin/settings/__tests__/planning-rules.spec.tsx` — MODIFIED (added holeCount prop + missing mocks for motion/badge/popover)
- `apps/web/src/i18n/langs/fr.json` — MODIFIED (+10 healthBar keys)
- `apps/web/src/i18n/langs/en.json` — MODIFIED (+10 healthBar keys)
- `apps/web/package.json` — MODIFIED (added motion dependency)
- `pnpm-lock.yaml` — MODIFIED (motion dependency lockfile)
- `docs/implementation-artifacts/sprint-status.yaml` — MODIFIED (7-4 status: in-progress → review)
