# Pawly Planning Algorithm - Reference Document

## Overview

The planning algorithm is a **slot-by-slot greedy algorithm** implemented in `PlanningGenerationService.generateMonthlyPlan()`. It assigns employees to slots defined by a weekly template, respecting hard constraints (blocking) and soft constraints (warnings).

```
Weekly Template -> Month Expansion -> Reordering -> Slot-by-Slot Scoring -> Shifts to DB
```

---

## Phase 1: Inputs

### 1.1 Weekly Template
- Defined by admin (Story 6-1)
- Structure: `{ days: TemplateDay[] }` where each `TemplateDay` contains:
  - `dayOfWeek`: 1 (Monday) to 7 (Sunday)
  - `slots: TemplateSlot[]`:
    - `shiftTypeCode`: shift type code (e.g., `CHIR`, `ACC`, `VET`)
    - `requiredStaff`: number of required employees
    - `requiredJobTypes?`: optional job type filter (e.g., `['VET']`)

### 1.2 Clinic Operational Configuration
- `workDays`: working days (e.g., `['MONDAY', 'TUESDAY', ..., 'SATURDAY']`)
- `closedDays`: specific closed days (e.g., public holidays)
- `specialDays`: days with modified hours (startTime/endTime override)

### 1.3 Shift Types (`ClinicShiftType`)
- `code`: unique identifier (e.g., `CHIR`)
- `startTime` / `endTime`: default hours (e.g., `08:00` - `18:00`)
- **`breakMinutes`**: break time in minutes (e.g., `60`)
  - **Net hours = (endTime - startTime) - breakMinutes**
  - E.g.: 08:00-18:00 with 60 min break = **9h net** (not 10h)

### 1.4 Active Employees
- `id`, `firstName`, `lastName`
- `jobType`: VET, ASV, APPRENTICE, etc.
- `contractHours`: weekly contract hours (e.g., `35`)

### 1.5 Loaded Constraints (`loadConstraints`)

| Constraint | Source | Description |
|------------|--------|-------------|
| `unavailableMap` | `Unavailability` (Prisma) | Map `employeeId -> Set<dates>` of unavailable dates |
| `schoolDayMap` | `Unavailability` type=SCHOOL | Apprentice school dates (count as 7h/day) |
| `hardRules` | `PlanningRule` ruleType=HARD | Blocking rules (prevent assignment) |
| `softRules` | `PlanningRule` ruleType=SOFT | Warning rules (score penalty) |
| `equityMap` | `EquityCounter` | Cumulative equity counters (Saturdays, weekends, holidays, overtime) |
| `quarterlyShifts` | `Shift` history | Shifts from other months in the quarter (if quarterly ROTATION_EQUITY rule) |

---

## Phase 1b: Border Week Shifts Loading

**Method**: `loadBorderWeekShifts(clinicId, month)`

**Problem**: ISO weeks do not align with months. If March starts on a Wednesday, the ISO week contains Monday-Tuesday from February. Without these shifts, the weekly calculation underestimates hours and may exceed contract limits.

**Solution**:
1. Calculate ISO bounds of the first and last week of the month
2. Identify out-of-month days in these weeks (e.g., Feb 23-28 for the week of March 1st)
3. Load existing DB shifts for these days (`prisma.shift.findMany`)
4. Inject them into:
   - `allShiftsForScoring` — for `weeklyMinutesMap` calculation (weekly hours)
   - `assignmentIndex` — for overlap and consecutive day checks
5. **Do NOT persist them** — only `assignedShifts` (new) are written to DB

```
February (already generated)    March (being generated)
... Mon 23 -> Sun 1st <-- borderShifts loaded
    ------- ISO Week 9 -------
```

**Impact**: An employee who already worked 35h in February (Mon-Fri) will NOT be assigned to Sunday March 1st if their weekly limit is reached.

---

## Phase 2: Template Expansion to Month

**Method**: `expandTemplateToMonth(template, month, operationalConfig, shiftTypeMap)`

For each day of the month:
1. **Skip** if closed day (`closedDays`)
2. **Skip** if not in template (`templateDayNumbers`)
3. For each template slot for that day:
   - Retrieve hours from `shiftTypeMap` (via `shiftTypeCode`)
   - If **special day**: clamp hours within the special window
   - Create a `SlotRequirement`: `{ date, shiftTypeCode, startTime, endTime, breakMinutes, requiredStaff, requiredJobTypes }`

**Result**: Flat list of `SlotRequirement[]` for the entire month.

---

## Phase 3: Slot Reordering

**Method**: `reorderSlotsNonWorkDaysFirst(slots, workDaySet)`

**Principle**: Within each ISO week, slots for **non-work days** are processed BEFORE work day slots.

**Why**: Without this, the algorithm processes Monday->Friday first, exhausting employee hour budgets. When it reaches Saturday, no one has remaining budget -> all Saturday slots remain empty.

```
Before: Mon -> Tue -> Wed -> Thu -> Fri -> Sat (budget exhausted)
After:  Sat -> Mon -> Tue -> Wed -> Thu -> Fri (Saturday served first)
```

**Dynamic**: Uses the clinic's `workDays` config (NOT hardcoded Saturday/Sunday). If the clinic works Saturday but not Wednesday, Wednesday will be processed first.

**Intra-day alternation**: On even-numbered days (2nd, 4th, ...), slots on the same date are sorted by `startTime` ascending (earliest first). On odd-numbered days (1st, 3rd, ...), the order is reversed. This prevents the same shift type from always being processed first, which would give one employee a systematic advantage via the tiebreaker.

**Between weeks**: Chronological order is maintained. Week 1 complete, then Week 2, etc.

---

## Phase 4: Scoring and Assignment (algorithm core)

**Method**: `scoreAndAssign(slot, employees, constraints, ...)`

For each `SlotRequirement`, the algorithm:

### 4.1 Pre-calculations

| Calculation | Description |
|-------------|-------------|
| `slotMinutes` | Net slot duration: `(endTime - startTime) - breakMinutes` |
| `weekBounds` | ISO bounds of the slot's week |
| `weeklyMinutesMap` | Minutes worked this week per employee (shifts + school days 7h). **Includes border shifts** from adjacent months (see Phase 1b). |

### 4.2 Eligibility Filtering (eliminatory)

Each employee is tested sequentially. **One failure = eliminated**.

| # | Filter | Description | Priority |
|---|--------|-------------|----------|
| 1 | **Unavailability** | Employee unavailable on this day (vacation, sick, school, other) | Absolute |
| 2 | **Time overlap** | Employee already assigned to an overlapping slot | Absolute |
| 3 | **Required job type** | If the slot requires a job type (e.g., VET), only VETs pass | Absolute |
| 4 | **HARD ROTATION_EQUITY** | Hard rotation rule (e.g., max 2 Saturdays/month). Blocks if exceeded. Supports `applicableJobTypes` to target specific job types. | Rule |
| 5 | **HARD CONTRACT_COMPLIANCE** | Hard hour limit. Calc: `weekMin + slotMinutes > contractHours * 60 * (1 + overtimeTolerance%)` | Rule |

**ROTATION_EQUITY fallback**: If the eligibility filter leaves fewer employees than `requiredStaff` AND some employees were only blocked by ROTATION_EQUITY (not by unavailability, overlap, or contract), those employees are **re-admitted** with a soft warning. This prevents holes when the rotation limit is too tight for the available staffing (e.g., 4 Saturdays x 2 slots = 8 assignments needed, but 3 employees x 2 max = only 6 available).

**Important note on CONTRACT_COMPLIANCE**:
- Effective weekly limit = `min(emp.contractHours, rule.maxWeeklyHours)`
- An employee at 25h contract with a 35h/week rule is limited to 25h
- An employee at 35h contract with a 35h/week rule is limited to 35h
- `overtimeThresholdPercent` (e.g., 10%) allows slight overage: 35h * 1.10 = 38.5h

### 4.3 Slot-Level Hard Rule Verification

Before scoring, HARD rules related to the slot itself are checked:

| Rule | Description | Effect |
|------|-------------|--------|
| `STAFFING_MINIMUM` | Minimum required staff (optional job type filter) | If not enough eligible -> blocking violation, slot = hole |
| `SKILL_REQUIREMENT` | Required job types for this shift type | If a type is missing among eligible -> blocking violation |

If a HARD slot violation is detected -> **no employee is assigned** and the slot becomes a hole.

### 4.4 Scoring System (ranking eligible employees)

Each eligible employee receives a **base score of 100**, then bonuses/penalties:

| Factor | Bonus/Penalty | Condition | Weight |
|--------|---------------|-----------|--------|
| **Weekend equity** | +10 | Employee below average weekend count | Low |
| **Saturday equity** | +10 | Employee below average Saturday count | Low |
| **Holiday equity** | +5 / -5 | Below / above average holiday count | Low |
| **Overtime equity** | -5/excess hour | Above average overtime | Moderate |
| **New employee** (no equity) | +20 | No equity counter yet | Moderate |
| **Monthly contract** | +10 | If assignment stays within monthly budget | Moderate |
| **Job type match** | +15 | Employee job type matches the slot | Moderate |
| **Monthly distribution** | -25 * excess / +15 * deficit | Deviation from average shift count | Strong |
| **Weekly hours under limit** | +50 * remaining ratio | More remaining weekly budget = stronger bonus | **Dominant** |
| **Weekly hours over limit** | -40 * excess hours | Strong penalty for exceeding | **Dominant** |
| **Fill-to-contract** | +30 if <50% used, +15 if <80% | Massive preference for employees far from their limit | **Dominant** |
| **Consecutive days** | -8 per consecutive day | Avoids 6+ consecutive work days | Moderate |
| **Shift type diversity** | -15 per same-type count | Penalizes repeated same `shiftTypeCode` (monthly cumulative) | **Strong** |
| **Yesterday same type** | -20 | Extra penalty if employee had same `shiftTypeCode` on previous day | **Strong** |
| **SOFT ROTATION_EQUITY** | -25 * priorityWeight | If max per period reached | Moderate |
| **SOFT CONTRACT_COMPLIANCE** | -15/h * priorityWeight (weekly), -10/h (monthly) | Soft overage | Moderate |

### 4.5 Effective Scoring Factor Hierarchy

```
                    +-------------------------------------+
                    |  DOMINANT FACTORS (total ~130pts)    |
                    |                                     |
                    |  1. Weekly remaining hours (+50)     |
                    |  2. Fill-to-contract (+30)           |
                    |  3. Weekly overage penalty (-40)     |
                    +----------------+--------------------+
                                     |
                    +----------------v--------------------+
                    |  STRONG FACTORS (~25pts each)        |
                    |                                     |
                    |  4. Monthly shift distribution       |
                    |  5. Soft ROTATION_EQUITY penalty     |
                    +----------------+--------------------+
                                     |
                    +----------------v--------------------+
                    |  MODERATE-STRONG FACTORS (~15-20pts) |
                    |                                     |
                    |  6. Shift type diversity (-15/count) |
                    |  7. Yesterday same type (-20)        |
                    +----------------+--------------------+
                                     |
                    +----------------v--------------------+
                    |  MODERATE FACTORS (~10-20pts)        |
                    |                                     |
                    |  8. Job type match (+15)             |
                    |  9. Monthly contract (+10)           |
                    |  10. Soft CONTRACT_COMPLIANCE penalty|
                    |  11. Consecutive days (-8/day)       |
                    |  12. New employee (+20)              |
                    +----------------+--------------------+
                                     |
                    +----------------v--------------------+
                    |  FINE FACTORS (~5-10pts)             |
                    |                                     |
                    |  13. Weekend/Saturday equity (+10)   |
                    |  14. Holiday equity (+/-5)           |
                    |  15. Overtime equity (-5/h)          |
                    +-------------------------------------+
```

### 4.6 Tie Resolution

When two employees have the same score -> **random tiebreaker** (`Math.random() - 0.5`).

Without this, the same employee would systematically win ties (stable sort + constant DB order), creating bias.

### 4.7 Assignment

The `slot.requiredStaff` top scores are assigned. For each assignee:
1. Check for SOFT violations (recorded as warnings)
2. Add to `assigned` array
3. Update `employeeMinutes` with net minutes (gross hours - break)

If `toAssign.length < slot.requiredStaff` -> **hole** with reason.

---

## Phase 5: Persistence

1. **Atomic transaction** (`$transaction`):
   - Delete all `GENERATED` shifts for the month
   - Batch create new shifts (`createManyAndReturn`)
2. Return `GenerationResult` with stats, holes, and violations

---

## Hour Calculation Summary

| Context | Formula |
|---------|---------|
| Net minutes for a slot | `(endTime - startTime) - breakMinutes` |
| Weekly minutes for an employee | `Sum(week's net shifts) + Sum(school days x 420min)` |
| Effective weekly limit | `min(emp.contractHours, rule.maxWeeklyHours) x 60` |
| Overtime tolerance | `limit x (1 + overtimeThresholdPercent / 100)` |
| Monthly limit | `emp.contractHours x 60 x 4.33` |

**School days**: Apprentices at school count 7h (420 min) per school day toward their weekly budget. An apprentice at 35h with 2 school days (14h) only has 21h budget remaining for shifts.

---

## Rule Categories

### HARD (blocking — prevent assignment)

| Category | Config | Effect |
|----------|--------|--------|
| `CONTRACT_COMPLIANCE` | `maxWeeklyHours`, `maxMonthlyHours`, `overtimeThresholdPercent` | Eliminates employees exceeding limits |
| `STAFFING_MINIMUM` | `shiftTypeCode`, `minStaff`, `jobTypes?` | If not enough eligible -> entire slot = hole |
| `SKILL_REQUIREMENT` | `shiftTypeCode`, `requiredJobTypes` | If a job type is missing -> slot = hole |
| `ROTATION_EQUITY` | `targetDay`, `maxPerPeriod`, `trackingPeriod`, `applicableJobTypes?` | Blocks if max exceeded (monthly or quarterly). If `applicableJobTypes` is set, only applies to listed job types. |

### SOFT (warnings — score penalty)

| Category | Config | Effect |
|----------|--------|--------|
| `CONTRACT_COMPLIANCE` | `maxWeeklyHours`, `maxMonthlyHours` | Score penalty proportional to overage |
| `STAFFING_MINIMUM` | `shiftTypeCode`, `minStaff`, `jobTypes?` | Warning if below recommended minimum |
| `SKILL_REQUIREMENT` | `shiftTypeCode`, `requiredJobTypes` | Warning if job type missing |
| `ROTATION_EQUITY` | `targetDay`, `maxPerPeriod`, `trackingPeriod`, `applicableJobTypes?` | Score penalty (-25 x priority weight). Respects `applicableJobTypes`. |

### applicableJobTypes (ROTATION_EQUITY)

Optional field `applicableJobTypes: string[]` on `ROTATION_EQUITY` rule config.

**Example**: The "ASV equity" rule (max 2 Saturdays/month) with `applicableJobTypes: ["ASV"]` only blocks ASVs. VETs can work as many Saturdays as needed.

**Without this field**: The rule applies to ALL employees (default behavior, backward compatible).

**Applied in**:
- `violatesHardRotationEquity` — skip if employee is not in the list
- `checkRotationEquity` — same for soft violations
- Scoring in `scoreAndAssign` — same for score penalty

---

## Config Parameters and Their Impact

| Parameter | Where to Configure | Impact |
|-----------|--------------------|--------|
| `contractHours` (employee) | Employee profile | Base weekly limit |
| `breakMinutes` (shift type) | Settings > Shift Types | Reduces net hours counted |
| `workDays` | Settings > General | Determines which days are "non-work" (processed first) |
| `closedDays` | Settings > General | Days skipped entirely |
| `maxWeeklyHours` (rule) | Settings > Planning Rules | Additional weekly cap (min with contractHours) |
| `maxMonthlyHours` (rule) | Settings > Planning Rules | Absolute monthly cap |
| `overtimeThresholdPercent` (rule) | Settings > Planning Rules | Overage tolerance (e.g., 10% = 35h -> 38.5h max) |
| `minStaff` (rule) | Settings > Planning Rules | Minimum required per slot |
| `targetDays` + `maxPerPeriod` (rule) | Settings > Planning Rules | Fair rotation (e.g., max 2 Saturdays/month) |
| `trackingPeriod` (rule) | Settings > Planning Rules | `monthly` or `quarterly` for rotation |
| `priority` (rule) | Settings > Planning Rules | Multiplier weight for soft penalties (0-10); on ROTATION_EQUITY rules it also weights the repair pass's equity objective (saturday rules boost the Saturday term, sunday rules the weekend term) |

---

## Known Algorithm Limitations

1. **Greedy with a bounded local-repair pass (Story 11-9, extended by KON-128)**: The greedy assignment never revisits a decision mid-pass, but after the pass a bounded GRASP local-repair runs: ejection chains of depth ≤3 fill holes a single pass strands (depth 2 — one relocation plus an idle backfill — is searched first and unchanged from Story 11-9; a depth-3 fallback relocating two employees runs only on a depth-2 miss, behind one shared evaluation budget for the whole pass), and equity hill-climbing swaps rebalance weekend/Saturday load — every move re-validated through the shared eligibility predicate so no repair introduces a hard-rule violation. The equity objective is scale-normalized per metric (each term divided by its workforce mean, so rare metrics like Saturdays are not drowned by total-shift spread) and weighted from the clinic's ROTATION_EQUITY rule priorities (`1 + priority/10`). Holes needing chains deeper than 3 stay unrepaired by the local pass, but it closes the proven depth-2 incompleteness gap. Since KON-129, an **opt-in CP-SAT improve pass** (`engine: 'cpsat'`) runs after greedy+repair: the greedy solution seeds the solver as a hint, and the solver's plan is served only when strictly better (fill, then the weighted equity objective) and fully re-validated by replaying it through the shared eligibility predicate — `stats.engine` records which engine produced the served plan. The default path remains greedy+repair. The solver's model deliberately relaxes the 35h-weekly-rest rule (re-validation enforces it exactly) and does not reproduce the ROTATION_EQUITY relaxation fallback (where relaxation lets greedy fill more, greedy wins the strictly-better gate). Its deterministic-time budget bounds the solve inside NFR2, so at large scale (50 employees) the pass may return "no improvement found" — at typical clinic scale it proves optimality.

2. **No global optimization by default**: The default engine does not seek the mathematically "optimal" solution — heuristic scoring produces good results but not necessarily the best. The opt-in `engine: 'cpsat'` improve pass (KON-129) adds a proven-optimal path within its time budget.

3. **Processing order affects results**: Reordering (non-workdays first) mitigates this issue but does not eliminate it completely.

4. **Deterministic tiebreaker**: When scores are close the assignment is broken deterministically (`score → #shifts → #weekends → employeeId`) — there is no RNG, so two successive runs produce identical results (verified by the generation determinism tests). The local-repair pass (Story 11-9) preserves this: it iterates sorted keys only.

5. **ROTATION_EQUITY fallback**: When all employees hit the hard rotation limit, the algorithm relaxes the constraint with a warning rather than leaving the slot empty. This is a deliberate trade-off: filled slots with a soft violation are better than holes.

---

## Key Files

| File | Role |
|------|------|
| `apps/api/src/modules/planning/planning-generation.service.ts` | Complete algorithm |
| `apps/api/src/modules/planning/planning.service.ts` | Rule management + validation |
| `apps/api/src/modules/planning/planning-template.service.ts` | Template CRUD |
| `apps/api/src/modules/planning/equity-counter.service.ts` | Equity counters |
| `apps/api/src/modules/planning/solver-model.ts` | Pure CP-SAT IR builder (KON-129, package-agnostic) |
| `apps/api/src/modules/planning/solver-engine.service.ts` | or-tools-wasm adapter — the ONLY file importing the package |
| `apps/api/src/modules/clinic/clinic.service.ts` | Operational config + shift types |
| `packages/validators/src/planning/planning-generation.schema.ts` | Zod schemas |
| `apps/api/prisma/schema/ShiftType.prisma` | Prisma model (breakMinutes) |
| `apps/api/prisma/schema/Planning.prisma` | Shift + PlanningRule model |
