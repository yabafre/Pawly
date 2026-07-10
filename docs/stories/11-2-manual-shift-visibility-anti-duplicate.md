# Story: 11-2-manual-shift-visibility-anti-duplicate — Manual/Surviving Shifts Visible to Generator + Anti-Duplicate Constraint

**Epic:** Epic 11 — Planning Engine Hardening & Compliance
**Status:** review
**Branch:** feature/KON-119-11-2-manual-shift-visibility-anti-duplicate
**Ticket:** KON-119 (Linear · project Pawly · milestone Epic 11 · blocked-by KON-118)
**Origin:** Multi-agent planning audit 2026-07-08 — convergent CRITICAL #2 (both audits). See `docs/epics-context/epic-11-context.md` § 0.2. Direct hand-off from Story 11-1 (`Dev Notes → Non-Goals`): 11-1 preserves confirmed/variance shifts on regeneration while the generator stays blind → **ship 11-1 + 11-2 together** (wave W1 → W2).

> **Read first:** `docs/epics-context/epic-11-context.md` — audit synthesis, file:line anchors, and the cross-cutting invariants every Epic 11 story MUST preserve. Line numbers below are anchors as of the audit commit and were re-verified against `develop` during story authoring; **re-locate the symbol, do not trust the number blindly.**

## User Story

**As an** admin, **I want** the generator to account for the shifts that survive a regeneration inside the target month, **so that** regenerating an amended month never double-books an employee, silently exceeds their contract hours, or over-staffs a slot that is already covered.

## Acceptance Criteria

1. **Given** a target month that contains shifts which survive a regeneration — shifts an admin created manually, shifts an employee has already confirmed, or shifts that carry attendance history (clock-in / no-show) — **When** the schedule for that month is regenerated (whether the month is DRAFT or PUBLISHED), **Then** the generator treats every surviving shift as an existing commitment: an employee who already holds a surviving shift that overlaps a slot is never assigned a second, conflicting shift for that slot, and the surviving hours count toward that employee's weekly and monthly totals so regeneration cannot silently push them past their contract limits.
2. **Given** an attempt to persist two shifts for the same employee that start at the same time on the same day, **When** the second shift is written — by a retried generation or by a manual action — **Then** the database rejects the duplicate, so an exact double-booking cannot exist even when an application-level check is bypassed or a request is retried.
3. **Given** a slot whose staffing is already partly or fully covered by surviving shifts, **When** the month is regenerated, **Then** the generator fills only the remaining unmet demand for that slot — it never adds staff beyond what the slot requires, and a slot already fully covered by surviving shifts produces neither a new assignment nor a staffing-gap warning.

**FRs covered:** FR5, FR7. **NFRs:** NFR3 (no silent double-booking / overrun), NFR6 (tenancy preserved).

> **Ticket-AC mapping (mechanism → Tasks):** KON-119's ACs specify the implementation — "loaded into `assignmentIndex`, `weeklyMinutesCounter`, and the equity/hour counters … same query shape as `loadBorderWeekShifts`, bounded to the target month", "a partial `@@unique` … (employee × date × slot)", "the slot overlap check accounts for pre-existing manual coverage when computing remaining `requiredStaff`". Those mechanisms are realized in Tasks 2–4 and specified in Dev Notes; the behavioural ACs above are the observable contract they must satisfy. Scope decisions locked with Alex during authoring: **survivor set = full deleteMany complement** (manual + confirmed + variance), **unique key = `(employeeId, date, startTime)`** (declarative Prisma `@@unique` via `db push`; "partial" not needed on the push-only flow), **AC3 included**.

## Tasks

- [x] **Task 1: Add the `@@unique([employeeId, date, startTime])` anti-duplicate constraint to `Shift`** [AC: 2]
  In `apps/api/prisma/schema/Planning.prisma`, replace the `Shift` model's index block (currently lines 45–48):
  ```prisma
  @@index([clinicId])
  @@index([employeeId])
  @@index([date])
  @@index([clinicId, date, source])
  ```
  with (add the `@@unique` above the indexes):
  ```prisma
  // Story 11-2 — anti-duplicate net: an employee cannot hold two shifts that
  // start at the same time on the same day. Backstop against generator retries
  // (the dead P2002 catch becomes real in 11-5) and exact manual double-books.
  @@unique([employeeId, date, startTime])
  @@index([clinicId])
  @@index([employeeId])
  @@index([date])
  @@index([clinicId, date, source])
  ```
  Apply and regenerate (this repo uses `db push` on Neon — no migration files):
  ```bash
  pnpm db:push
  pnpm db:generate
  ```
  Expected: `pnpm db:push` prints "Your database is now in sync with your Prisma schema" (the unique index is created), exit 0. `pnpm db:generate` regenerates the client, exit 0.
  > **If `pnpm db:push` fails with "could not create unique index … contains duplicate values"**, an amended month already carries duplicates the pre-11-2 generator produced. De-duplicate first (keep the earliest row per key), then re-run `pnpm db:push`:
  > ```bash
  > dotenv -- pnpm --filter @pawly/api exec prisma db execute --schema prisma/schema --stdin <<'SQL'
  > DELETE FROM "Shift" a USING "Shift" b
  > WHERE a."employee_id" = b."employee_id"
  >   AND a."date" = b."date"
  >   AND a."start_time" = b."start_time"
  >   AND (a."created_at" > b."created_at"
  >        OR (a."created_at" = b."created_at" AND a."id" > b."id"));
  > SQL
  > ```
  Commit: `git add apps/api/prisma/schema/Planning.prisma && git commit -m "feat(KON-119): add @@unique(employeeId,date,startTime) anti-duplicate constraint on Shift"`

- [x] **Task 2: Add the `loadSurvivingShiftsInMonth` loader** [AC: 1]
  In `apps/api/src/modules/planning/planning-generation.service.ts`, insert this new private method immediately **after** `loadBorderWeekShifts` (i.e., between its closing `  }` and the `// FIX 1 — MRV …` comment). Anchor on:
  ```ts
      breakMinutes: s.breakMinutes,
    }));
  }

  // FIX 1 — MRV (Minimum Remaining Values) heuristic: process most constrained slots first.
  ```
  and insert the method between the `}` and the `// FIX 1` comment:
  ```ts
      breakMinutes: s.breakMinutes,
    }));
  }

  // Story 11-2 — load the shifts INSIDE the target month that SURVIVE a
  // regeneration. This is the exact complement of the Story 11-1 bulk deleteMany
  // predicate (delete = source:GENERATED AND isConfirmed:false AND no-variance),
  // so it returns MANUAL shifts, confirmed GENERATED shifts, and GENERATED shifts
  // carrying VarianceEvent history — and EXCLUDES the unconfirmed, history-free
  // GENERATED shifts that are about to be deleted and regenerated. The generator
  // must see these survivors so it never double-books an employee, overruns their
  // contract hours, or over-staffs a slot they already cover. Same projection
  // shape as loadBorderWeekShifts, bounded to the target month.
  private async loadSurvivingShiftsInMonth(
    clinicId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<AssignedShift[]> {
    const shifts = await this.prisma.shift.findMany({
      where: {
        clinicId,
        date: { gte: monthStart, lte: monthEnd },
        OR: [
          { source: { not: 'GENERATED' } },
          { isConfirmed: true },
          { varianceEvents: { some: {} } },
        ],
      },
      select: {
        employeeId: true,
        date: true,
        startTime: true,
        endTime: true,
        shiftTypeCode: true,
        breakMinutes: true,
      },
    });

    return shifts.map((s) => ({
      employeeId: s.employeeId,
      date: s.date.toISOString().split('T')[0],
      startTime: s.startTime,
      endTime: s.endTime,
      shiftTypeCode: s.shiftTypeCode,
      breakMinutes: s.breakMinutes,
    }));
  }

  // FIX 1 — MRV (Minimum Remaining Values) heuristic: process most constrained slots first.
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no new type errors referencing `loadSurvivingShiftsInMonth` / `varianceEvents` / `source`, exit 0. (Pre-existing unrelated spec-fixture noise may remain — see Dev Notes → Testing.)
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-119): add loadSurvivingShiftsInMonth (deleteMany complement)"`

- [x] **Task 3: Seed the surviving shifts into every counter before the slot loop** [AC: 1]
  In `apps/api/src/modules/planning/planning-generation.service.ts`, replace this block (currently lines 301–303):
  ```ts
    let totalPositions = 0;

    for (const slot of slots) {
  ```
  with (insert the seeding block between them):
  ```ts
    let totalPositions = 0;

    // Story 11-2 — seed the in-month surviving shifts into every counter BEFORE
    // the loop so the generator is aware of them. Unlike border shifts (adjacent
    // months → only weekly minutes + overlap matter), survivors are IN this month
    // so they count toward this month's shift/type/equity/monthly-minute load too.
    // Unconditional: 11-1's deleteMany preserves confirmed/variance shifts on
    // DRAFT and PUBLISHED alike, so survivors can exist on any regeneration.
    const survivingShifts = await this.loadSurvivingShiftsInMonth(
      clinicId,
      monthStart,
      monthEnd,
    );
    for (const ss of survivingShifts) {
      const key = `${ss.employeeId}|${ss.date}`;
      const existing = assignmentIndex.get(key) || [];
      existing.push(ss);
      assignmentIndex.set(key, existing);

      allShiftsForScoring.push(ss);

      const netMin =
        this.calculateShiftMinutes(ss.startTime, ss.endTime) -
        (ss.breakMinutes || 0);
      const weekKey = `${ss.employeeId}|${this.getWeekBounds(ss.date).start}`;
      weeklyMinutesCounter.set(
        weekKey,
        (weeklyMinutesCounter.get(weekKey) || 0) + netMin,
      );

      let typeCounts = shiftTypeCounts.get(ss.employeeId);
      if (!typeCounts) {
        typeCounts = new Map();
        shiftTypeCounts.set(ss.employeeId, typeCounts);
      }
      typeCounts.set(
        ss.shiftTypeCode,
        (typeCounts.get(ss.shiftTypeCode) || 0) + 1,
      );

      employeeShiftCounts.set(
        ss.employeeId,
        (employeeShiftCounts.get(ss.employeeId) || 0) + 1,
      );

      employeeMinutes.set(
        ss.employeeId,
        (employeeMinutes.get(ss.employeeId) || 0) + netMin,
      );

      const date = new Date(`${ss.date}T00:00:00.000Z`);
      const dayOfWeek = date.getUTCDay();
      const equity = constraints.equityMap.get(ss.employeeId);
      if (equity) {
        if (dayOfWeek === 6) equity.saturdayCount++;
        if (dayOfWeek === 0 || dayOfWeek === 6) equity.weekendCount++;
      }
    }

    for (const slot of slots) {
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no new type errors, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-119): seed surviving in-month shifts into generator counters"`

- [x] **Task 4: Subtract pre-existing coverage from effective `requiredStaff`** [AC: 3]
  In `apps/api/src/modules/planning/planning-generation.service.ts`, replace the loop head (currently lines 303–317):
  ```ts
    for (const slot of slots) {
      totalPositions += slot.requiredStaff;

      const result = this.scoreAndAssign(
        slot,
        employees,
        constraints,
        allShiftsForScoring,
        assignmentIndex,
        employeeMinutes,
        weeksInMonth,
        weeklyMinutesCounter,
        shiftTypeCounts,
        employeeShiftCounts,
      );
  ```
  with (prepend the coverage index, then compute the effective requirement and pass a coverage-reduced slot clone):
  ```ts
    // Story 11-2 (AC3) — index the pre-existing surviving coverage per slot key
    // (date|shiftTypeCode) so the loop can subtract it from requiredStaff and
    // never over-staff a slot that manual/confirmed coverage already fills.
    const preExistingSlotCoverage = new Map<string, number>();
    for (const ss of survivingShifts) {
      const coverageKey = `${ss.date}|${ss.shiftTypeCode}`;
      preExistingSlotCoverage.set(
        coverageKey,
        (preExistingSlotCoverage.get(coverageKey) || 0) + 1,
      );
    }

    for (const slot of slots) {
      totalPositions += slot.requiredStaff;

      // Story 11-2 (AC3) — reduce the requirement by pre-existing coverage.
      // Skip fully-covered slots entirely (no generation, no false hole). The
      // coverage map is decremented so multiple slots sharing a (date,shiftType)
      // key consume the coverage once. scoreAndAssign receives a slot clone whose
      // requiredStaff is the residual, so its slice + hole logic stay correct.
      const coverageKey = `${slot.date}|${slot.shiftTypeCode}`;
      const preCovered = preExistingSlotCoverage.get(coverageKey) || 0;
      const effectiveRequiredStaff = Math.max(
        0,
        slot.requiredStaff - preCovered,
      );
      preExistingSlotCoverage.set(
        coverageKey,
        Math.max(0, preCovered - slot.requiredStaff),
      );
      if (effectiveRequiredStaff === 0) continue;

      const result = this.scoreAndAssign(
        { ...slot, requiredStaff: effectiveRequiredStaff },
        employees,
        constraints,
        allShiftsForScoring,
        assignmentIndex,
        employeeMinutes,
        weeksInMonth,
        weeklyMinutesCounter,
        shiftTypeCounts,
        employeeShiftCounts,
      );
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no new type errors; `{ ...slot, requiredStaff: effectiveRequiredStaff }` type-checks as `SlotRequirement`, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-119): subtract pre-existing coverage from effective requiredStaff"`

- [x] **Task 5: Service spec — survivor query, no double-booking, coverage-aware requiredStaff** [AC: 1, 3]
  **5a.** The generator now issues **two** `shift.findMany` calls (border-week `date:{in}` and in-month survivors `where.OR`). The existing border test feeds both via a single `mockResolvedValue`, which would wrongly seed border shifts as in-month survivors. In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, inside `describe('generateMonthlyPlan')`, replace this line (currently line 1543):
  ```ts
      mockPrismaService.shift.findMany.mockResolvedValue(borderShiftsFromDb);
  ```
  with a predicate-keyed mock so the survivor query returns `[]` there:
  ```ts
      // Story 11-2 — generateMonthlyPlan now issues TWO shift.findMany queries:
      // border-week (where.date.in) and in-month survivors (where.OR). Key the
      // mock on the predicate so only the border query returns borderShiftsFromDb.
      mockPrismaService.shift.findMany.mockImplementation((args: any) => {
        if (args?.where?.OR) return Promise.resolve([]);
        return Promise.resolve(borderShiftsFromDb);
      });
  ```
  **5b.** Add this block immediately **before** the `// ─── deleteGeneratedShifts ─` comment (i.e., right after the `describe('generateMonthlyPlan', …)` block closes at its `});`). It reuses the file's `clinicId`, `mockPrismaService`, `mockTemplateService`:
  ```ts
  // ─── Story 11-2 — surviving shifts visible to generator + anti-duplicate ──
  describe('Story 11-2 — surviving shifts visible to generator', () => {
    const mondaySurgery2 = {
      id: 'tpl-11-2',
      name: 'Monday Surgery x2',
      data: {
        days: [
          { dayOfWeek: 1, slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 2 }] },
        ],
      },
      clinicId,
    };

    const twoVets = [
      { id: 'emp-1', firstName: 'Alice', lastName: 'Martin', jobType: 'VET', contractHours: 35 },
      { id: 'emp-2', firstName: 'Bob', lastName: 'Dupont', jobType: 'VET', contractHours: 35 },
    ];

    // Key shift.findMany on the survivor predicate (where.OR) vs the border query
    // (where.date.in). Only the survivor query returns `survivors`.
    const mockShiftQueries = (survivors: any[]) => {
      mockPrismaService.shift.findMany.mockImplementation((args: any) => {
        if (args?.where?.OR) return Promise.resolve(survivors);
        return Promise.resolve([]);
      });
    };

    // Capture the rows handed to createManyAndReturn inside the $transaction.
    const captureCreate = () => {
      const captured: any[] = [];
      mockPrismaService.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            shift: {
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
              createManyAndReturn: jest
                .fn()
                .mockImplementation(({ data }: { data: any[] }) => {
                  captured.push(...data);
                  return data.map((d, i) => ({ id: `gen-${i}`, ...d }));
                }),
            },
          };
          return fn(tx);
        },
      );
      return captured;
    };

    it('queries in-month survivors with the deleteMany-complement predicate (AC1)', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(mondaySurgery2);
      mockPrismaService.employee.findMany.mockResolvedValue(twoVets);
      mockShiftQueries([]);
      captureCreate();

      await service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-11-2');

      expect(mockPrismaService.shift.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clinicId,
            date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
            OR: expect.arrayContaining([
              { source: { not: 'GENERATED' } },
              { isConfirmed: true },
              { varianceEvents: { some: {} } },
            ]),
          }),
        }),
      );
    });

    it('excludes an employee with a surviving overlapping shift and fills only the residual (AC1 + AC3)', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(mondaySurgery2);
      mockPrismaService.employee.findMany.mockResolvedValue(twoVets);
      // emp-1 already has a MANUAL SURGERY (08:00–12:00) on Mon 2026-03-02 that
      // survives regeneration. That day's SURGERY slot needs 2.
      mockShiftQueries([
        {
          employeeId: 'emp-1',
          date: new Date('2026-03-02'),
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
        },
      ]);
      const created = captureCreate();

      await service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-11-2');

      const mar2 = created.filter((d) =>
        d.date.toISOString().startsWith('2026-03-02'),
      );
      // AC3 — 2 required − 1 pre-existing coverage = exactly 1 generated.
      expect(mar2.length).toBe(1);
      // AC1 — emp-1 is overlap-excluded; the residual goes to emp-2.
      expect(mar2[0].employeeId).toBe('emp-2');
    });

    it('skips a slot fully covered by surviving shifts — no generation, no hole (AC3)', async () => {
      const mondaySurgery1 = {
        ...mondaySurgery2,
        data: {
          days: [
            { dayOfWeek: 1, slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }] },
          ],
        },
      };
      mockTemplateService.getTemplateById.mockResolvedValue(mondaySurgery1);
      mockPrismaService.employee.findMany.mockResolvedValue(twoVets);
      // emp-1 covers the single SURGERY position on Mon 2026-03-02 (requiredStaff 1).
      mockShiftQueries([
        {
          employeeId: 'emp-1',
          date: new Date('2026-03-02'),
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
        },
      ]);
      const created = captureCreate();

      const result = await service.generateMonthlyPlan(
        clinicId,
        '2026-03',
        'tpl-11-2',
      );

      const mar2Created = created.filter((d) =>
        d.date.toISOString().startsWith('2026-03-02'),
      );
      expect(mar2Created.length).toBe(0); // fully covered → nothing generated
      expect(result.holes.filter((h) => h.date === '2026-03-02').length).toBe(0);
    });
  });
  ```
  Run: `pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec"`
  Expected: all suites pass, including the 3 new `Story 11-2` tests and the fixed border test, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-119): survivor seeding, no double-booking, coverage-aware requiredStaff"`

- [x] **Task 6: Full verification + story bookkeeping** [AC: all]
  Run the full matrix and the build to confirm nothing regressed (the `@@unique` and the two extra service edits touch the hottest path in the planning module):
  ```bash
  pnpm test
  pnpm build
  ```
  Expected: `pnpm test` — turbo all workspaces green (API ≥ 863 tests incl. the 3 new Story 11-2 tests, web unchanged, validators unchanged), exit 0. `pnpm build` — all tasks successful, exit 0.
  > If root `pnpm test` is broken by the local `rtk` turbo shim (see project memory `epic11-dev-gotchas`), run per-workspace: `pnpm --filter @pawly/api test`. If `pnpm build` stalls at 0% CPU, it is the iCloud `.git` eviction issue (`icloud-git-eviction`), **not** a code error — retry, do not "fix" the build.
  Commit: `git add docs/stories/11-2-manual-shift-visibility-anti-duplicate.md docs/state.yaml && git commit -m "docs(KON-119): mark story ready-for-dev bookkeeping"`

## Dev Notes

### Non-Goals — deferred to later Epic 11 stories

- **Runtime `P2002` net for retried generation + `pg_advisory_xact_lock(clinicId, month)` → Story 11-5** (`depends_on: 11-2`). 11-2 only adds the DB `@@unique`; wiring the dead `P2002` catch (`planning-generation.service.ts` transaction) into a real safety net and serialising concurrent generations is 11-5. Do **not** touch `fetchWithRetry` or add advisory locks here.
- **Transactional amendment + Redis coherence → Story 11-6.** The seeding capture query runs outside the `$transaction`; do not try to fold it in.
- **French labor-law hard rules (10h/day, 35h weekly rest, max-6-consecutive) → Story 11-3.** Unrelated to survivor visibility.
- **Rule-engine unification / performance → 11-8 / 11-10.** Do not refactor `scoreAndAssign` beyond the AC3 slot-clone; the signature stays unchanged.

### Architecture

- **Data flow (non-negotiable):** `Page (RSC) → Client Component → Hook → Zsa → Server Action → tRPC Client → NestJS Service → Prisma`. This story touches **only** the backend service + the Prisma schema — no router, hook, or component change. `generateMonthlyPlan` is already `subscribedProcedure` + `adminOnly`, `isEntitled('professional')`-gated; `clinicId` comes from `ctx.user.clinicId`. Do not change any of that.
- **Cross-cutting invariant (epic-context § 3.4 — net-minute accounting):** every counter update deducts `breakMinutes` and uses `getWeekBounds` over ISO weeks with UTC arithmetic. The Task-3 seeding mirrors the existing per-assignment update (net minutes, week key) exactly — do not introduce a different hour model.
- **Cross-cutting invariant (epic-context § 3.3 — determinism):** the seeding is a deterministic pass over a DB-ordered result; it introduces no RNG and preserves the `score → #shifts → #weekends → employeeId` tiebreakers. Reproducibility holds.
- **Why the OR predicate is the exact deleteMany complement:** 11-1's delete predicate is `source:'GENERATED' ∧ isConfirmed:false ∧ varianceEvents:{none:{}}`. De Morgan ⇒ preserved = `source≠GENERATED ∨ isConfirmed:true ∨ varianceEvents:{some:{}}`. Seeding this complement (and nothing else) means the generator sees exactly the shifts that will still exist after the in-transaction `deleteMany`, and never the stale unconfirmed-GENERATED rows it is about to replace.
- **AC3 slot-clone over a scoreAndAssign signature change:** passing `{ ...slot, requiredStaff: effectiveRequiredStaff }` keeps `scoreAndAssign` (and its ~30 direct unit-test callers) untouched, and its existing hole/slice logic automatically reports the residual. `continue`-on-zero avoids the `STAFFING_MINIMUM` / partial-fill hole paths emitting a false 0-size hole for a fully-covered slot.
- **Known, intentional metric nuance (surface at review, do not "fix"):** `stats.totalSlots` counts full demand (`totalPositions += slot.requiredStaff`) while `stats.filledSlots` counts generator-created rows only. A position covered by a surviving manual shift is neither a hole nor a generated row, so the fill **percentage** can read slightly low. The load-bearing signals — `holes`, `violations`, and the absence of double-booking — are all correct. Counting manual coverage into `filledSlots` is out of scope for 11-2.

### Existing code at write time (Step-0 verbatim quotes — re-verify the symbol, line numbers may drift)

`apps/api/prisma/schema/Planning.prisma:1-4, :20-49` — enum + `Shift` model (no `@@unique` today; Task 1 adds it):
```prisma
enum ShiftSource {
  GENERATED
  MANUAL
}

model Shift {
  id            String      @id @default(uuid())
  date          DateTime
  startTime     String      @map("start_time")
  endTime       String      @map("end_time")
  shiftTypeCode String      @default("OTHER") @map("shift_type_code")
  breakMinutes  Int         @default(0) @map("break_minutes")
  source        ShiftSource @default(MANUAL)

  employee   Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  employeeId String   @map("employee_id")

  clinicId String @map("clinic_id")
  clinic   Clinic @relation(fields: [clinicId], references: [id], onDelete: Cascade)

  isConfirmed Boolean @default(false) @map("is_confirmed")

  planningTemplateId String?           @map("planning_template_id")
  planningTemplate   PlanningTemplate? @relation(fields: [planningTemplateId], references: [id])

  varianceEvents VarianceEvent[]

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([clinicId])
  @@index([employeeId])
  @@index([date])
  @@index([clinicId, date, source])
}
```

`planning-generation.service.ts` — the `AssignedShift` type the seeding uses (loader returns this shape):
```ts
type AssignedShift = {
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  shiftTypeCode: string;
  breakMinutes?: number;
};
```

`planning-generation.service.ts:248-266` — the existing border-shift seeding this story parallels (border = adjacent months → only `assignmentIndex` + `weeklyMinutesCounter`; survivors = in-month → all counters):
```ts
    const borderShifts = await this.loadBorderWeekShifts(clinicId, month);

    const assignedShifts: AssignedShift[] = [];
    const assignmentIndex = new Map<string, AssignedShift[]>();

    // Pre-seed assignmentIndex with border shifts (for overlap/consecutive checks)
    for (const bs of borderShifts) {
      const key = `${bs.employeeId}|${bs.date}`;
      const existing = assignmentIndex.get(key) || [];
      existing.push(bs);
      assignmentIndex.set(key, existing);
    }

    // allShiftsForScoring includes border + newly assigned (for weekly hour calculation)
    const allShiftsForScoring: AssignedShift[] = [...borderShifts];

    // FIX 4 — O(1) weekly minutes counter: maintained incrementally instead of O(E×A) per slot
    const weeklyMinutesCounter = new Map<string, number>(); // key: `empId|weekStart`
```

`planning-generation.service.ts:293-303` — the counters the seeding must also touch (declared before the loop) and the loop head Task 3 splits:
```ts
    // FIX 4 — O(1) shift type counter: maintained incrementally
    const shiftTypeCounts = new Map<string, Map<string, number>>(); // empId -> (shiftTypeCode -> count)
    // FIX 4 — O(1) shift count per employee
    const employeeShiftCounts = new Map<string, number>();

    const holes: GenerationResult['holes'] = [];
    const hardViolations: GenerationResult['violations']['hard'] = [];
    const softViolations: GenerationResult['violations']['soft'] = [];
    const employeeMinutes = new Map<string, number>();
    let totalPositions = 0;

    for (const slot of slots) {
```

`planning-generation.service.ts:321-361` — the per-assignment counter update the Task-3 seeding mirrors (note: equity only touches `saturdayCount`/`weekendCount` — `holidayCount` is intentionally NOT incremented in the loop, so the seeding matches):
```ts
      for (const a of result.assigned) {
        const key = `${a.employeeId}|${a.date}`;
        const existing = assignmentIndex.get(key) || [];
        existing.push(a);
        assignmentIndex.set(key, existing);
        // … netMin → weeklyMinutesCounter; shiftTypeCounts; employeeShiftCounts …
        const date = new Date(`${a.date}T00:00:00.000Z`);
        const dayOfWeek = date.getUTCDay();
        const equity = constraints.equityMap.get(a.employeeId);
        if (equity) {
          if (dayOfWeek === 6) equity.saturdayCount++;
          if (dayOfWeek === 0 || dayOfWeek === 6) equity.weekendCount++;
        }
      }
```

`planning-generation.service.ts:795-812` — the overlap check that AC1's `assignmentIndex` seeding activates (a seeded surviving shift makes the employee ineligible for an overlapping slot — no code change here, the seeding is enough):
```ts
    const eligible = employees.filter((emp) => {
      const unavailDates = constraints.unavailableMap.get(emp.id);
      if (unavailDates?.has(slot.date)) return false;

      const key = `${emp.id}|${slot.date}`;
      const existingOnDate = assignmentIndex.get(key) || [];
      for (const existing of existingOnDate) {
        if (
          this.timesOverlap(
            slot.startTime,
            slot.endTime,
            existing.startTime,
            existing.endTime,
          )
        ) {
          return false;
        }
      }
```

`planning-generation.service.ts:2037-2072` — `createManualShift` already pre-validates overlap and throws BEFORE `create`, so Task 1's `@@unique` is a pure backstop for the manual path (it fires only on an exact duplicate that slips past this check):
```ts
    // Check for time overlap on the target employee + date
    const existingShifts = await this.prisma.shift.findMany({
      where: { employeeId: input.employeeId, clinicId, date: new Date(`${input.date}T00:00:00.000Z`) },
    });
    for (const existing of existingShifts) {
      if (this.timesOverlap(shiftType.startTime, shiftType.endTime, existing.startTime, existing.endTime)) {
        throw new ConflictException(`Shift overlaps with existing shift (${existing.startTime}-${existing.endTime})`);
      }
    }
    const created = await this.prisma.shift.create({ data: { …, source: 'MANUAL', … } });
```

`planning-generation.service.ts:3198-3265` — `loadBorderWeekShifts`, the projection/return shape Task 2 replicates (bounded to the month instead of border days, with the survivor `OR` filter):
```ts
  private async loadBorderWeekShifts(clinicId: string, month: string): Promise<AssignedShift[]> {
    // … compute borderDates …
    const shifts = await this.prisma.shift.findMany({
      where: { clinicId, date: { in: borderDates } },
      select: { employeeId: true, date: true, startTime: true, endTime: true, shiftTypeCode: true, breakMinutes: true },
    });
    return shifts.map((s) => ({
      employeeId: s.employeeId,
      date: s.date.toISOString().split('T')[0],
      startTime: s.startTime,
      endTime: s.endTime,
      shiftTypeCode: s.shiftTypeCode,
      breakMinutes: s.breakMinutes,
    }));
  }
```

### File decision map

**Modify (backend)**
- `apps/api/prisma/schema/Planning.prisma` — add `@@unique([employeeId, date, startTime])` to `Shift`. *Single responsibility:* the planning/shift data model. *In/out:* consumed by Prisma Client generation; the constraint is enforced by Postgres (applied via `db push`).
- `apps/api/src/modules/planning/planning-generation.service.ts` — add `loadSurvivingShiftsInMonth` (Task 2), seed survivors into all counters before the loop (Task 3), subtract pre-existing coverage from effective `requiredStaff` (Task 4). *Single responsibility:* monthly generation loop + shift mutations. *In/out:* Prisma reads (`shift.findMany`), reuses `calculateShiftMinutes`/`getWeekBounds`/`scoreAndAssign` (same file); returns `GenerationResult`.
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` — fix the border test's shared `shift.findMany` mock (5a) + 3 new `Story 11-2` tests (5b). *Single responsibility:* generation service unit coverage.

**Create:** none.

### Testing

- **Framework:** API = Jest, `*.spec.ts`. Run: `pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec"`.
- **Shared `shift.findMany` mock — critical (see project memory `epic11-dev-gotchas` + 11-1 Deviations):** `generateMonthlyPlan` now calls `shift.findMany` in **two** places — `loadBorderWeekShifts` (`where.date.in`) and `loadSurvivingShiftsInMonth` (`where.OR`). Any test that seeds a non-empty `shift.findMany` MUST key on the predicate (`args?.where?.OR` ⇒ survivors, else border) — a flat `mockResolvedValue` feeds both and corrupts seeding. Task 5a fixes the one existing offender (the border test). The survivor key (`where.OR`) does **not** collide with 11-1's capture-query key (top-level `where.varianceEvents`), so the 11-1 generate tests stay green.
- **AC1 coverage:** Task-5 test 1 asserts the survivor query shape (OR complement + month bounds); test 2 proves the seeded overlap excludes the employee (`assignmentIndex` seeding) and fills only the residual. The weekly-minute / equity seeding reuses the byte-identical per-assignment update (lines 321-361) and the border-verified `weeklyMinutesCounter` path — flag any deeper weekly-cap seeding assertion as an aped-review add (as 11-1 did for its notify-failure tests).
- **AC3 coverage:** test 2 (partial → residual 1) and test 3 (full → 0 generated, 0 hole).
- **AC2 (DB constraint):** enforced at the database, not unit-testable with the mocked Prisma client — verified by `pnpm db:push` creating the unique index (Task 1) and `prisma validate` implicit in push; the runtime `P2002` behaviour under retry is Story 11-5's scope.
- **Typecheck / full gate:** `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json` per code task, then `pnpm test` + `pnpm build` (Task 6). Per project memory `epic11-dev-gotchas`, rebuild `@pawly/*` dist before app `tsc` if cross-package types look stale; pre-existing unrelated `tsc --noEmit` spec-fixture noise in `apps/api` is not introduced by this story (documented in 11-1).

### Dependencies

- No new libraries. `date-fns` is **not** installed in `apps/api` — the seeding uses only native `Date`/`Date.UTC` and the existing `getWeekBounds`/`calculateShiftMinutes` helpers.
- Per **L4** (epic-context § 5): before implementing, confirm via Context7 (`/prisma/docs`) two semantics used here and record the source in the Dev Agent Record — (a) the relation filter `varianceEvents: { some: {} }` returns rows with ≥1 related record, and (b) a declarative `@@unique` on `(employeeId, date, startTime)` is created by `prisma db push` on PostgreSQL as a unique index.
- Per **L-audit** (epic-context § 5): "verified" means every entry-point. The single new seeding entry-point (`loadSurvivingShiftsInMonth` → the seed loop) is exercised by Task-5 tests 1 (query) + 2 (overlap/assignmentIndex) + 3 (coverage). Do not declare done until the survivor path is behaviourally covered, not just type-clean.
- **Wave dependency (locked with Alex):** 11-1 (`done`) preserves confirmed/variance shifts while leaving the generator blind; 11-2 closes that blindness. Ship together — do not merge 11-1 to a release without 11-2.

## File List

**Modify (backend):**
- `apps/api/prisma/schema/Planning.prisma`
- `apps/api/src/modules/planning/planning-generation.service.ts`
- `apps/api/src/modules/planning/planning-generation.service.spec.ts`

**Create:** none.

## Dev Agent Record

- **Model:** claude-opus-4-8[1m]
- **Started:** 2026-07-10
- **Completed:** 2026-07-10

### Summary

Closed convergent-CRITICAL #2: the generator is no longer blind to shifts that
survive a regeneration inside the target month. A new `loadSurvivingShiftsInMonth`
loader returns the exact complement of Story 11-1's bulk `deleteMany` predicate
(`source≠GENERATED ∨ isConfirmed:true ∨ varianceEvents:{some:{}}`) bounded to the
month; every survivor is seeded into `assignmentIndex`, `weeklyMinutesCounter`,
`shiftTypeCounts`, `employeeShiftCounts`, `employeeMinutes` and the equity
counters before the slot loop, so an employee holding a surviving overlapping
shift is overlap-excluded (no double-booking) and surviving hours count toward
their weekly/monthly load (no silent overrun). AC3: pre-existing coverage is
indexed per `date|shiftTypeCode` and subtracted from each slot's `requiredStaff`
via a slot clone — a fully-covered slot is skipped entirely (no generation, no
false hole), leaving `scoreAndAssign`'s signature and its ~30 unit callers
untouched. A DB `@@unique([employeeId, date, startTime])` on `Shift` is the
anti-duplicate backstop (AC2), enforced by Postgres (applied via `db push`).

Per **L4**, both Prisma semantics were confirmed via Context7 (`/prisma/web`):
(a) relation filter `varianceEvents: { some: {} }` returns rows with ≥1 related
record — *"`some` without parameters returns all records with at least one
relation"* (`relation-queries.mdx` / `prisma-client-reference.mdx`); (b) a
declarative multi-field `@@unique` is created as a unique index by `prisma db
push` on PostgreSQL — *"pushes the updated Prisma schema, including new index
definitions"* → `Unique index` (`prisma-schema-reference.mdx` + db-push blog).

### Files changed

- `apps/api/prisma/schema/Planning.prisma` — `@@unique([employeeId, date, startTime])` on `Shift`.
- `apps/api/src/modules/planning/planning-generation.service.ts` — `loadSurvivingShiftsInMonth` loader (Task 2), survivor seeding into all counters (Task 3), coverage-reduced effective `requiredStaff` (Task 4).
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` — predicate-keyed fix to the shared border `shift.findMany` mock (5a) + 3 new `Story 11-2` tests (5b).

### Deviations

- **`db push` required `--accept-data-loss`.** Prisma flags any constraint
  addition as potentially lossy and refuses without the flag. For adding a
  unique index the flag is non-destructive — Postgres either creates the index
  or refuses on existing duplicates; it never deletes rows to satisfy the
  constraint. The story's Task 1 did not anticipate the flag.
- **One pre-existing duplicate in the Neon dev DB blocked the unique index
  (P2002).** A read-only report found exactly 1 offending group: emp `051b53b9`,
  2026-03-02 08:30 — a `GENERATED` shift double-booked over a `MANUAL` one
  (neither confirmed, neither carrying `VarianceEvent`). This is the precise
  artifact of the bug 11-2 fixes. De-duplicated with **Alex's explicit approval**
  using the story's sanctioned semantics (keep the earliest row per key → kept
  the `MANUAL`, removed the `GENERATED`), 1 row deleted, 0 groups remaining, then
  the index created cleanly.
- **De-dup ran via a `pg` client, not `prisma db execute --stdin`.** The heredoc
  stdin did not forward through the nested `pnpm exec dotenv -- pnpm --filter …
  exec prisma` layers (Prisma received neither `--file` nor `--stdin`). The
  identical `DELETE … USING …` was executed through `pg` (wrapped in a
  transaction, row count reported) — same SQL, reliable transport.
- **Pre-existing `tsc --noEmit` spec-fixture noise (not introduced here).**
  `apps/api` surfaces 32 unrelated type errors in `clinic.service.spec.ts` (12),
  `variance.service.spec.ts` (11), `employee.service.spec.ts` (5) and
  `planning.service.spec.ts` (4); zero reference `planning-generation.service.ts`
  or its spec. Matches the baseline 11-1 documented. `pnpm build` (ordered
  declaration pass) is green.
- **Known, intentional metric nuance (surfaced for review, not "fixed"):**
  `stats.totalSlots` counts full demand while `filledSlots` counts generated rows
  only, so a slot covered by a surviving manual shift can read the fill % slightly
  low. `holes`, `violations` and the absence of double-booking are all correct
  (Dev Notes → Architecture). Out of scope for 11-2.

### Test output

Per-workspace (`--filter`; root `pnpm test` is broken by the local `rtk` turbo
shim, unrelated to this story):

```
@pawly/api         → Test Suites 32 passed (32) · Tests 865 passed (865)
@pawly/validators  → Test Files 27 passed (27) · Tests 773 passed (773)
@pawly/web         → Test Files 50 passed (50) · Tests 750 passed (750)
pnpm build         → Tasks: 5 successful, 5 total
```

AC-to-test trace: **AC1** → Story 11-2 test 1 (survivor query = OR complement +
month bounds) + test 2 (seeded overlap excludes emp-1, residual → emp-2); **AC3**
→ test 2 (partial: 2 required − 1 covered = 1 generated) + test 3 (full coverage →
0 generated, 0 hole); **AC2** → DB-enforced `@@unique`, verified by `db push`
creating the unique index (not unit-testable with the mocked Prisma client — the
runtime `P2002`-under-retry net is Story 11-5's scope).

## Review Record

**Date:** 2026-07-10
**Auditors:** Spec, Code, Edge & Hallucination (backend surface → Aria not dispatched)
**Verdict:** done

### Findings

#### Resolved

- [BLOCKER] AC3 pre-existing-coverage map keyed on `date|shiftTypeCode` alone → silent
  under-staffing. [`planning-generation.service.ts:360-390` (pre-fix)]
  - Source: Code (CRITICAL, time facet) + Edge (MINOR, time facet) + Spec (MAJOR, job-type facet) — one root cause, two facets.
  - Root cause: coverage was credited for any survivor sharing a slot's `(date, shiftTypeCode)`, without a time-overlap check or a `requiredJobTypes` check, while slot hours resolve **live** from `ClinicShiftType` (`expandTemplateToMonth :617-654`) and `Shift` rows freeze their hours. A stale-hours survivor (shift-type hours edited, or a `moveShift`'d shift — `:2043-2054` sets `source:MANUAL` and never rewrites `startTime`/`endTime`) or a wrong-job-type survivor could drive `effectiveRequiredStaff` to 0 and `continue`-skip a genuinely uncovered slot with no hole — contradicting AC3 and the Epic-11 NFR3 "no silent failure" invariant.
  - Resolution: commit `e40d897`. `loadSurvivingShiftsInMonth` now selects `employee.jobType` (new `SurvivingShift` type); `preExistingSlotCoverage` stores per-`(date,shiftTypeCode)` buckets of `{ startTime, endTime, jobType, consumed }`; a survivor is credited to a slot only when `timesOverlap(slot, survivor)` **and** the survivor's `jobType` satisfies `slot.requiredJobTypes` (mirroring the AC1 eligibility gates), and is consumed at most once. Both auditors re-verified RESOLVED (HIGH). RED→GREEN proven: the two pinning tests fail against the old key-only code, pass after the fix.
- [MAJOR] AC1 weekly/monthly hour-accounting had no end-to-end test through the survivor
  seeding path (self-acknowledged gap in Dev Notes → Testing). [`planning-generation.service.spec.ts`]
  - Source: Spec.
  - Resolution: commit `e40d897`. Added a `generateMonthlyPlan`-level test seeding a survivor that consumes a HARD `maxMonthlyHours: 4` cap and asserting the sole employee gets no further assignment (`created … length 0`) with visible holes — flowing through `loadSurvivingShiftsInMonth` → `employeeMinutes` seeding → the real HARD-rule eligibility check (`:943-949`), not a hand-fed `scoreAndAssign`. Spec re-rates AC1 IMPLEMENTED.

#### Dismissed

- [MINOR] AC3 coverage is credited to survivors of inactive employees (`employees` is loaded
  `isActive:true`, survivors are not). [`planning-generation.service.ts:364-370`]
  - Source: Edge (classified info).
  - Rationale: semantically correct — an inactive employee's surviving MANUAL/confirmed shift physically survives the regeneration deletion, so the position is genuinely staffed and should reduce demand. No silent gap results.
- [MINOR] Task-6 commit message drift (`docs(KON-119): dev record + flip story 11-2 to review`
  vs the story's specified `…mark story ready-for-dev bookkeeping`).
  - Source: Spec.
  - Rationale: cosmetic; no functional impact on code or history integrity.
- [INFO] `stats.totalSlots` (full demand) vs `stats.filledSlots` (generated rows only) can
  read the fill % slightly low when a slot is covered by a surviving manual shift.
  - Source: Spec, Edge.
  - Rationale: explicitly self-flagged "do not fix" in Dev Notes → Architecture; `holes`/`violations`/absence-of-double-booking are all correct. Counting manual coverage into `filledSlots` is out of scope for 11-2.
- [LOW] No explicit test for two distinct template slots sharing `(date, shiftTypeCode)` with
  one shared overlapping survivor (consumed-once path). [`planning-generation.service.ts:404-428`]
  - Source: Code (re-verification, confidence ~30).
  - Rationale: structurally proven correct by trace (the `consumed` flag mutates the shared bucket entry in place; MRV re-validates overlap + jobType per slot regardless of order). Low value vs. the three shipped pins; deferred.

### Verification

- Test command: `pnpm --filter @pawly/api test` (root `pnpm test` broken by the `rtk` turbo shim).
- Test output (final pass): Story 11-2 suite **6 passed** (3 original + 2 BLOCKER pins + 1 AC1 hour-cap); full API **Test Suites 32 passed, Tests 868 passed**.
- Build: `pnpm --filter @pawly/api build` → `nest build` (SWC 141 files) + `tsc -p tsconfig.types.json`, green. `prisma validate` → schema valid.
- Live E2E (Chrome DevTools, headed): admin regenerated a **PUBLISHED** month (Clinique Simulation E2E, 2026-07) holding **4 survivors** (2 MANUAL, 2 GENERATED-with-variance) via the real UI. The Story 11-1 published-change guard fired its acknowledgement dialog ("Planning publié — confirmer la modification"); the Story 11-2 path then ran end-to-end through the real NestJS+Prisma stack. DB assertions post-regen: survivors preserved **4/4**, employee double-bookings **0**, exact `(employeeId, date, startTime)` duplicates **0**; health went 96% (1 hole) → 100% (0 violations), amendment count incremented. Confirms AC1 (no double-booking of a surviving overlap) and AC2 (`@@unique` holds) in the running app, not just under mocked Jest.

### Ticket sync

- Ticket comment posted: n/a (`ticket_system: none`).
- PR opened/updated: draft → `develop` (see below).
