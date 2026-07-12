# Story: 11-7-equity-counter-window-fix — Rolling 12-Month Equity Window + An Entry for Every Employee

**Epic:** Epic 11 — Planning Engine Hardening & Compliance
**Status:** review
**Branch:** feature/KON-124-11-7-equity-counter-window-fix
**Ticket:** KON-124 (Linear · project Pawly · milestone Epic 11 · no blockers)
**Origin:** Multi-agent planning audit 2026-07-08 — confirmed MAJOR finding. See `docs/epics-context/epic-11-context.md` § 0 ("Equity resets every January + fix inoperative for un-mapped employees"). Wave W1 (parallel, no dependencies).

> **Read first:** `docs/epics-context/epic-11-context.md` — audit synthesis, file:line anchors, and the cross-cutting invariants every Epic 11 story MUST preserve (notably **invariant #3 — determinism**, which this story must not break). Line numbers below were re-verified against this worktree during authoring, **but re-locate the symbol; do not trust the number blindly** (11-1/11-2 already shifted the audit's original anchors).

## User Story

**As an** admin user, **I want** equity computed over a rolling 12-month window with an entry for every employee, **so that** fairness does not reset each January and newly hired employees are not preferentially assigned the unpopular (weekend / holiday) shifts.

## Acceptance Criteria

1. **Given** a schedule generation whose target month is at (or near) the start of a calendar year — or a clinic with a newly hired employee who has no counter history — **When** the generator builds the equity data that feeds its scoring, **Then** it draws on a **rolling 12-month window** of prior counters ending at the month immediately before the target month (the range `[target − 12 … target − 1]`, which crosses the year boundary and always includes December of the previous year), instead of only the elapsed months of the current calendar year. A January generation therefore scores against a full year of prior load rather than an empty history.

2. **Given** an active employee who has **no counter history** in that window (a new hire, or every employee on a January generation), **When** the generator scores that employee for a slot, **Then** they are scored on equal footing with the rest of the team on the same equity terms — they no longer receive a blanket scoring bonus that made an un-tracked employee outscore everyone on every slot and absorb the weekend / holiday work. Fairness is measured across the whole active workforce, and the outcome is **deterministic** (invariant #3): scoring does not depend on the order in which employees happen to be processed.

3. **Given** the live, within-generation update of an employee's running equity load as shifts are assigned to them (and as surviving shifts are accounted for), **When** that employee has no prior entry, **Then** the update still records their new load rather than being silently dropped, so the scoring of later slots in the same generation reflects the shifts this employee has just picked up.

**FRs covered:** FR8 (flag/score Soft-Rule — rotation-equity — balance). **NFRs:** NFR3 (no silent failure — the January reset and the skipped increment were silent). **Complexity:** M.

> **Ticket-AC mapping (mechanism → Tasks):** KON-124 specifies the root cause — "`allMonths=[]` in January, Dec N-1 never loaded (`:596-602`; `equity-counter.service.ts:48-54`); live increment guarded by `if (equity)` without creating entries (`:347-351`)". The audit's `:596-602` / `:347-351` / `:964-1009` anchors have drifted; the **re-verified** anchors in this worktree are: window in `loadConstraints` `:835-842`, `getCountersForPeriod` `equity-counter.service.ts:42-69`, live increments `:392-398` (survivors, added by 11-2) and `:521-528` (assignment), scoring `+20` fallback `:1277-1279`, average helpers `:3507-3537`. AC1 → Tasks 1–4; AC2 → Tasks 5–6; AC3 → Task 6. Scope locked with Alex during authoring: **window = 12 months excluding the target month** (constant, not clinic-configurable); **`getCountersForPeriod` and its callers are untouched** (schedule-view, quarterly, recalculation); seeding + create-if-absent are both kept (determinism + literal AC3, incl. the inactive-survivor edge).

## Tasks

- [x] **Task 1 (RED): Add the failing unit spec for `getCountersForWindow`** [AC: 1]
  In `apps/api/src/modules/planning/equity-counter.service.spec.ts`, add this new `describe` block immediately **after** the `getCountersForPeriod` describe block closes (anchor on its closing `  });` that precedes `  describe('getQuarterlySummary', () => {` around line 156):
  ```ts
    // ─── getCountersForWindow (Story 11-7) ──────────────────────────────────

    describe('getCountersForWindow', () => {
      it('loads a rolling 12-month window ending the month before the target, crossing the year boundary', async () => {
        mockPrismaService.equityCounter.findMany.mockResolvedValue([]);

        // Target January 2026 → window is Jan 2025 … Dec 2025 (12 months, incl. Dec N-1).
        await service.getCountersForWindow(clinicId, 2026, 1);

        const callArgs =
          mockPrismaService.equityCounter.findMany.mock.calls[0][0];
        expect(callArgs.where.clinicId).toBe(clinicId);
        expect(callArgs.where.OR).toHaveLength(12);
        // Includes December of the previous year — the exact case that used to reset.
        expect(callArgs.where.OR).toContainEqual({ year: 2025, month: 12 });
        // Oldest month of the window is January of the previous year.
        expect(callArgs.where.OR).toContainEqual({ year: 2025, month: 1 });
        // Never includes the target month itself (circular-scoring guard).
        expect(callArgs.where.OR).not.toContainEqual({ year: 2026, month: 1 });
      });

      it('rolls the window across months mid-year (July 2026 → Jul 2025 … Jun 2026)', async () => {
        mockPrismaService.equityCounter.findMany.mockResolvedValue([]);

        await service.getCountersForWindow(clinicId, 2026, 7);

        const callArgs =
          mockPrismaService.equityCounter.findMany.mock.calls[0][0];
        expect(callArgs.where.OR).toHaveLength(12);
        expect(callArgs.where.OR).toContainEqual({ year: 2026, month: 6 }); // month before target
        expect(callArgs.where.OR).toContainEqual({ year: 2025, month: 7 }); // 12 months back
        expect(callArgs.where.OR).not.toContainEqual({ year: 2026, month: 7 });
      });

      it('applies the counterTypes filter when provided', async () => {
        mockPrismaService.equityCounter.findMany.mockResolvedValue([]);

        await service.getCountersForWindow(clinicId, 2026, 3, 12, [
          'WEEKEND_TOTAL',
        ]);

        const callArgs =
          mockPrismaService.equityCounter.findMany.mock.calls[0][0];
        expect(callArgs.where.counterType).toEqual({ in: ['WEEKEND_TOTAL'] });
      });

      it('scopes the query to clinicId', async () => {
        mockPrismaService.equityCounter.findMany.mockResolvedValue([]);

        await service.getCountersForWindow('other-clinic', 2026, 5);

        const callArgs =
          mockPrismaService.equityCounter.findMany.mock.calls[0][0];
        expect(callArgs.where.clinicId).toBe('other-clinic');
      });
    });
  ```
  Run: `pnpm --filter @pawly/api test -- equity-counter.service.spec`
  Expected: **RED** — the four new tests fail with `TypeError: service.getCountersForWindow is not a function`. Do NOT commit yet.

- [x] **Task 2 (GREEN): Implement `getCountersForWindow`** [AC: 1]
  In `apps/api/src/modules/planning/equity-counter.service.ts`, insert this method immediately **after** `getCountersForPeriod` (i.e. between its closing `  }` on line 69 and the `  /**\n   * Get quarterly summary` JSDoc on line 71):
  ```ts
    /**
     * Get equity counters over a rolling window of `windowMonths` calendar months
     * ending at the month immediately BEFORE (year, month) — i.e. the range
     * [(year,month) − windowMonths … (year,month) − 1]. Unlike getCountersForPeriod
     * (single `year`), this window crosses the year boundary, so a January target
     * still sees December (and the rest) of the previous year. Story 11-7 — used by
     * the generator so equity never resets on 1 January and reflects a true
     * 12-month history. The target month itself is excluded (callers score against
     * prior load only — "exclude current month to avoid circular scoring").
     */
    async getCountersForWindow(
      clinicId: string,
      year: number,
      month: number,
      windowMonths = 12,
      counterTypes?: EquityCounterType[],
    ): Promise<CounterWithEmployee[]> {
      // Absolute 0-based month index of the target; the preceding month is endAbs-1.
      const endAbs = year * 12 + (month - 1);
      const pairs: { year: number; month: number }[] = [];
      for (let i = 1; i <= windowMonths; i++) {
        const abs = endAbs - i; // endAbs-1 (prev month) … endAbs-windowMonths
        pairs.push({ year: Math.floor(abs / 12), month: (abs % 12) + 1 });
      }

      return this.prisma.equityCounter.findMany({
        where: {
          clinicId,
          OR: pairs.map((p) => ({ year: p.year, month: p.month })),
          ...(counterTypes?.length ? { counterType: { in: counterTypes } } : {}),
        },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              color: true,
              jobType: true,
              contractHours: true,
            },
          },
        },
        orderBy: [{ employee: { lastName: 'asc' } }, { counterType: 'asc' }],
      });
    }
  ```
  Run: `pnpm --filter @pawly/api test -- equity-counter.service.spec`
  Expected: **GREEN** — all `getCountersForWindow` tests pass, existing `getCountersForPeriod`/`getQuarterlySummary`/`recalculateForPeriod` tests still pass. `Tests: N passed`, exit 0.
  Commit: `git add apps/api/src/modules/planning/equity-counter.service.ts apps/api/src/modules/planning/equity-counter.service.spec.ts && git commit -m "feat(KON-124): add rolling 12-month equity window loader (getCountersForWindow)"`

- [x] **Task 3 (RED): Wire the generation mock + failing assertion that generation uses the window** [AC: 1]
  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`:
  (a) Add `getCountersForWindow` to the equity mock. Replace (line 199-201):
  ```ts
    const mockEquityService = {
      getCountersForPeriod: jest.fn(),
    };
  ```
  with:
  ```ts
    const mockEquityService = {
      getCountersForPeriod: jest.fn(),
      getCountersForWindow: jest.fn(),
    };
  ```
  (b) Add its default resolution. Immediately **after** the line `    mockEquityService.getCountersForPeriod.mockResolvedValue([]);` (line 256), add:
  ```ts
      mockEquityService.getCountersForWindow.mockResolvedValue([]);
  ```
  (c) Add this test as the **first** `it` inside the `describe('generateMonthlyPlan', () => {` block (right after the opening `describe(` on line 1379, before the existing `it('creates Shift records via $transaction'` test):
  ```ts
      it('scores equity over a rolling 12-month window — a January generation still sees December N-1 (Story 11-7 AC1)', async () => {
        mockTemplateService.getTemplateById.mockResolvedValue({
          id: 'tpl-1',
          name: 'Simple',
          data: {
            days: [
              {
                dayOfWeek: 1,
                slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }],
              },
            ],
          },
          clinicId,
        });
        mockPrismaService.$transaction.mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) =>
            fn({
              $executeRaw: jest.fn().mockResolvedValue(0),
              shift: {
                deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
                createManyAndReturn: jest.fn().mockResolvedValue([]),
              },
            }),
        );

        await service.generateMonthlyPlan(clinicId, '2026-01', 'tpl-1');

        // Generation must load equity via the rolling window (not the old
        // current-calendar-year path, which returned [] in January).
        expect(mockEquityService.getCountersForWindow).toHaveBeenCalledWith(
          clinicId,
          2026,
          1,
          12,
        );
      });
  ```
  Run: `pnpm --filter @pawly/api test -- planning-generation.service.spec`
  Expected: **RED** — the new test fails (`getCountersForWindow` was not called; `loadConstraints` still calls `getCountersForPeriod`). All other tests still pass. Do NOT commit yet.

- [x] **Task 4 (GREEN): Point `loadConstraints` at the rolling window** [AC: 1]
  In `apps/api/src/modules/planning/planning-generation.service.ts`:
  (a) Add the window-length constant. After the line `  private static readonly SCHOOL_DAY_MINUTES = 420; // 7h — must match SCHOOL_DAY_MINUTES in @pawly/validators` (line 101), add:
  ```ts
    private static readonly EQUITY_WINDOW_MONTHS = 12; // Story 11-7 — rolling equity window (months before the target)
  ```
  (b) Replace the current-calendar-year window (lines 835-842):
  ```ts
      // Load months before the target month for cumulative equity data (exclude current month to avoid circular scoring)
      const allMonths =
        month > 1 ? Array.from({ length: month - 1 }, (_, i) => i + 1) : [];
      const counters = await this.equityCounterService.getCountersForPeriod(
        clinicId,
        year,
        allMonths,
      );
  ```
  with:
  ```ts
      // Story 11-7 — cumulative equity over a rolling 12-month window ending the
      // month BEFORE the target (excludes the current month to avoid circular
      // scoring). Unlike the old current-calendar-year query, this crosses the
      // year boundary, so a January generation still sees December N-1 and equity
      // never resets on 1 January.
      const counters = await this.equityCounterService.getCountersForWindow(
        clinicId,
        year,
        month,
        PlanningGenerationService.EQUITY_WINDOW_MONTHS,
      );
  ```
  Run: `pnpm --filter @pawly/api test -- planning-generation.service.spec`
  Expected: **GREEN** — the Task-3 AC1 test passes and the whole generation suite stays green (existing tests default `getCountersForWindow` to `[]`, same as the old path). `Tests: N passed`, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "feat(KON-124): score generation equity over a rolling 12-month window"`

- [x] **Task 5 (RED): Add the failing mechanism specs for seeding + create-if-absent** [AC: 2, 3]
  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, add this new `describe` block immediately **after** the `describe('Story 11-2 — surviving shifts visible to generator', () => { … })` block closes (find its closing `  });` — it is the block that defines `mondaySurgery2` / `twoVets` / `mockShiftQueries` / `captureCreate`). This new block defines its own local helpers so it does not depend on 11-2's scoped ones:
  ```ts
    // ─── Story 11-7 — equity entry for every employee (seeding + create-if-absent) ──
    describe('Story 11-7 — equity seeding & live increment', () => {
      const mondaySurgery1 = {
        id: 'tpl-11-7',
        name: 'Monday Surgery x1',
        data: {
          days: [
            {
              dayOfWeek: 1,
              slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }],
            },
          ],
        },
        clinicId,
      };

      // Capture the rows the generator actually decided (data → createManyAndReturn).
      const captureCreate = () => {
        const captured: any[] = [];
        mockPrismaService.$transaction.mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => {
            const tx = {
              $executeRaw: jest.fn().mockResolvedValue(0),
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

      it('seeds an equity entry for every active employee, including those with no counters (AC2 — no more flat +20)', async () => {
        const seedSpy = jest.spyOn(service as any, 'getOrCreateEquityEntry');
        mockTemplateService.getTemplateById.mockResolvedValue(mondaySurgery1);
        // Default mockEmployees = emp-1, emp-2, emp-3. Only emp-1 has history in
        // the window; emp-2 and emp-3 are un-mapped (new hires / Jan boundary).
        mockEquityService.getCountersForWindow.mockResolvedValue([
          {
            id: 'c1',
            counterType: 'WEEKEND_TOTAL',
            count: 5,
            year: 2025,
            month: 12,
            lastCalculatedAt: new Date(),
            employee: {
              id: 'emp-1',
              firstName: 'Alice',
              lastName: 'Martin',
              color: '#000',
              jobType: 'VET',
              contractHours: 35,
            },
          },
        ]);
        captureCreate();

        await service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-11-7');

        const seededIds = seedSpy.mock.calls.map((c) => c[1]);
        // Un-mapped employees are seeded (an entry is created for them) rather
        // than short-circuited to the old flat +20 during scoring.
        expect(seededIds).toContain('emp-1');
        expect(seededIds).toContain('emp-2');
        expect(seededIds).toContain('emp-3');
      });

      it('routes the live intra-month increment through create-if-absent so a new hire’s load is recorded (AC3)', async () => {
        const seedSpy = jest.spyOn(service as any, 'getOrCreateEquityEntry');
        mockTemplateService.getTemplateById.mockResolvedValue(mondaySurgery1);
        // A single new hire with no counters — the sole candidate for the slot.
        mockPrismaService.employee.findMany.mockResolvedValue([
          {
            id: 'emp-new',
            firstName: 'Zoe',
            lastName: 'Nouvelle',
            jobType: 'VET',
            contractHours: 35,
          },
        ]);
        mockEquityService.getCountersForWindow.mockResolvedValue([]);
        const created = captureCreate();

        await service.generateMonthlyPlan(clinicId, '2026-01', 'tpl-11-7');

        // The new hire is assigned the slot(s) …
        expect(created.length).toBeGreaterThan(0);
        expect(created.every((r) => r.employeeId === 'emp-new')).toBe(true);
        // … and every equity touch for them (seeding + the live increment as the
        // shift is assigned) went through create-if-absent, never the old
        // `if (equity)` skip. At least: 1 seed + 1 increment.
        const newHireTouches = seedSpy.mock.calls.filter(
          (c) => c[1] === 'emp-new',
        );
        expect(newHireTouches.length).toBeGreaterThanOrEqual(2);
      });
    });
  ```
  Run: `pnpm --filter @pawly/api test -- planning-generation.service.spec`
  Expected: **RED** — both new tests error with `Cannot spy the getOrCreateEquityEntry property because it is not a function; undefined given instead` (the helper does not exist yet). All other tests still pass. Do NOT commit yet.

- [x] **Task 6 (GREEN): Seed every employee, add `getOrCreateEquityEntry`, drop the `+20` fallback, and route both live increments through create-if-absent** [AC: 2, 3]
  All edits in `apps/api/src/modules/planning/planning-generation.service.ts`.

  (a) Add the private helper. Insert immediately **after** `getAverageOvertimeMinutes` closes (after its `  }` on line 3537, before the `  /**\n   * Load existing shifts from DB for days in border ISO weeks …` JSDoc on line 3539):
  ```ts
    /**
     * Story 11-7 — return the employee's equity entry, creating a zero-initialised
     * one when absent (new hire, January boundary, or an inactive-employee
     * survivor). Guarantees every scoring / increment site sees a real entry
     * instead of short-circuiting to a flat scoring bonus, and keeps
     * getAverageEquity's denominator the whole seeded workforce.
     */
    private getOrCreateEquityEntry(
      equityMap: ConstraintMap['equityMap'],
      employeeId: string,
    ): {
      saturdayCount: number;
      weekendCount: number;
      holidayCount: number;
      overtimeMinutes: number;
    } {
      let entry = equityMap.get(employeeId);
      if (!entry) {
        entry = {
          saturdayCount: 0,
          weekendCount: 0,
          holidayCount: 0,
          overtimeMinutes: 0,
        };
        equityMap.set(employeeId, entry);
      }
      return entry;
    }
  ```

  (b) Seed all active employees BEFORE the slot loop. The employees are fetched at lines 255-264; insert this seeding loop immediately **after** that `const employees = await this.prisma.employee.findMany({ … });` block closes (after line 264, before the `    // Pre-check: all apprentices must have school day declarations` comment on line 266):
  ```ts
      // Story 11-7 — seed a zero-initialised equity entry for every active
      // employee BEFORE any scoring or live increment. This makes
      // getAverageEquity's denominator the whole active workforce (not just
      // employees with history), removes the need for a flat "+20" fallback for
      // un-mapped employees, and — critically — keeps the averages deterministic
      // (invariant #3): they no longer depend on the order in which entries would
      // otherwise be lazily created during the slot loop.
      for (const emp of employees) {
        this.getOrCreateEquityEntry(constraints.equityMap, emp.id);
      }
  ```

  (c) Route the **survivor** live increment through create-if-absent. Replace (lines 392-398):
  ```ts
        const date = new Date(`${ss.date}T00:00:00.000Z`);
        const dayOfWeek = date.getUTCDay();
        const equity = constraints.equityMap.get(ss.employeeId);
        if (equity) {
          if (dayOfWeek === 6) equity.saturdayCount++;
          if (dayOfWeek === 0 || dayOfWeek === 6) equity.weekendCount++;
        }
  ```
  with:
  ```ts
        const date = new Date(`${ss.date}T00:00:00.000Z`);
        const dayOfWeek = date.getUTCDay();
        // Story 11-7 — create the entry if absent (e.g. an inactive-employee
        // survivor not seeded above) so its weekend load is reflected in scoring.
        const equity = this.getOrCreateEquityEntry(
          constraints.equityMap,
          ss.employeeId,
        );
        if (dayOfWeek === 6) equity.saturdayCount++;
        if (dayOfWeek === 0 || dayOfWeek === 6) equity.weekendCount++;
  ```

  (d) Route the **assignment** live increment (FIX 3) through create-if-absent. Replace (lines 521-528):
  ```ts
          // FIX 3 — Update equity counters during generation
          const date = new Date(`${a.date}T00:00:00.000Z`);
          const dayOfWeek = date.getUTCDay();
          const equity = constraints.equityMap.get(a.employeeId);
          if (equity) {
            if (dayOfWeek === 6) equity.saturdayCount++;
            if (dayOfWeek === 0 || dayOfWeek === 6) equity.weekendCount++;
          }
  ```
  with:
  ```ts
          // FIX 3 — Update equity counters during generation
          // Story 11-7 — create the entry if absent so subsequent slots score
          // against this employee's real, updated load.
          const date = new Date(`${a.date}T00:00:00.000Z`);
          const dayOfWeek = date.getUTCDay();
          const equity = this.getOrCreateEquityEntry(
            constraints.equityMap,
            a.employeeId,
          );
          if (dayOfWeek === 6) equity.saturdayCount++;
          if (dayOfWeek === 0 || dayOfWeek === 6) equity.weekendCount++;
  ```

  (e) Drop the flat `+20` fallback in scoring and route the read through create-if-absent. In the `scored` mapping, change the equity lookup (line 1234) from:
  ```ts
        // Full equity scoring (weekend, holiday, overtime)
        const equity = constraints.equityMap.get(emp.id);
        if (equity) {
  ```
  to:
  ```ts
        // Full equity scoring (weekend, holiday, overtime).
        // Story 11-7 — every active employee is seeded up front, so `equity` is
        // always present; the former `else { score += 20; }` fallback is gone
        // (an un-mapped new hire no longer gets a flat bonus that made them
        // absorb the unpopular weekend / holiday slots).
        const equity = this.getOrCreateEquityEntry(constraints.equityMap, emp.id);
        if (equity) {
  ```
  and remove the `else` fallback — replace (lines 1277-1279):
  ```ts
        } else {
          score += 20;
        }
  ```
  with:
  ```ts
        }
  ```
  Run: `pnpm --filter @pawly/api test -- planning-generation.service.spec`
  Expected: **GREEN** — the two Story 11-7 mechanism tests pass and the whole generation suite stays green (seeding zeros do not change relative scores: previously every un-mapped employee got a uniform `+20`, now every seeded employee gets a uniform `0`, so assignment order is unchanged; averages over all-zero entries are still `0`). `Tests: N passed`, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "feat(KON-124): seed equity entries for all employees, drop flat +20 fallback"`

- [x] **Task 7: Full API suite + type-declaration build gate** [AC: 1, 2, 3]
  Run the whole API test suite and the declaration build (per lesson L5 — the `tsc` types pass is load-bearing and no `pnpm dev` type-checks the whole graph):
  ```bash
  pnpm --filter @pawly/api test
  pnpm --filter @pawly/api build
  ```
  Expected: `pnpm --filter @pawly/api test` → all suites pass (`Test Suites: N passed`), exit 0. `pnpm --filter @pawly/api build` → SWC transpile + `tsc -p tsconfig.types.json` both succeed, exit 0, no `Cannot find module '@pawly/api/trpc-types'`-style declaration errors.
  No new code change expected here — this is the final gate. If either fails, fix the reported file and re-run before considering the story done. (Everything is already committed in Tasks 2/4/6; if a fix is needed, amend the relevant commit or add a `fix(KON-124): …` commit.)

## Dev Notes

### Non-Goals — deferred / out of scope

- **Do NOT change `getCountersForPeriod` or any of its callers.** The schedule-view enrichment (`planning-generation.service.ts:1774`), `getQuarterlySummary`, and `recalculateForPeriod` all legitimately want the current month / a single year — only the **generation scoring** path moves to the rolling window.
- **Do NOT make the window length clinic-configurable.** It is the constant `EQUITY_WINDOW_MONTHS = 12`. A per-clinic window is a separate scope.
- **Do NOT touch the counter computation** (`recalculateForPeriod`), the nightly recalculation scheduler (`equity-counter.scheduler.ts`), or the `SATURDAY/WEEKEND/HOLIDAY/OVERTIME` semantics. This story fixes only which counters are *loaded* for scoring, and that every employee has an in-memory entry.
- **Do NOT unify the rule engine (11-8) or add a repair pass (11-9).** Keep the greedy single pass and its determinism.

### Architecture

- **Layer:** pure NestJS service change inside the `planning` module — no tRPC/router/web surface. The generation entry point (`generateMonthlyPlan`) and the schedule contract are unchanged; callers see identical behaviour except that January generations and new hires now score fairly.
- **Determinism (invariant #3) is the load-bearing constraint here.** `getAverageEquity` / `getAverageOvertimeMinutes` divide by `equityMap.size` and iterate `equityMap.values()`. If entries were created lazily during the slot loop, the average (and therefore every scoring decision) would depend on processing order. Seeding **all** active employees up front, before the first `scoreAndAssign`, makes the map's contents fixed for the whole loop → deterministic. This is why AC2 mandates up-front seeding, not just lazy create-if-absent.
- **Why removing `+20` is correct, not just "different".** A new hire has all-zero counts, so fair equity already prefers them for the weekend/holiday slots they haven't worked yet — up to the point their counts reach the team average. That is *fair rotation*. The old flat `+20` gave them an advantage on **every** slot (including weekdays and beyond the average), overriding the workload/weekly-balance terms, which is what made them "absorb the unpopular shifts". Seeding + fair scoring replaces a distortion with the intended balance.
- **Interaction with Story 11-2.** The survivor-seeding loop at `:392-398` was added by 11-2; Task 6(c) modifies exactly that site (create-if-absent instead of `if (equity)`). No behavioural change for active survivors (they are seeded in 6(b)); the change only rescues the inactive-employee-survivor edge and satisfies AC3 literally.

### Existing code at write time (Step-0 verbatim quotes — re-verify the symbol, line numbers may drift)

`apps/api/src/modules/planning/equity-counter.service.ts:42-69` — the single-year query this story extends (kept as-is; a new sibling method is added):
```ts
  async getCountersForPeriod(
    clinicId: string,
    year: number,
    months: number[],
    counterTypes?: EquityCounterType[],
  ): Promise<CounterWithEmployee[]> {
    return this.prisma.equityCounter.findMany({
      where: {
        clinicId,
        year,
        month: { in: months },
        ...(counterTypes?.length ? { counterType: { in: counterTypes } } : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            color: true,
            jobType: true,
            contractHours: true,
          },
        },
      },
      orderBy: [{ employee: { lastName: 'asc' } }, { counterType: 'asc' }],
    });
  }
```

`apps/api/src/modules/planning/planning-generation.service.ts:835-842` — the current-calendar-year window (Bug AC1), inside `private async loadConstraints(clinicId, monthStart, monthEnd, year, month)`:
```ts
    // Load months before the target month for cumulative equity data (exclude current month to avoid circular scoring)
    const allMonths =
      month > 1 ? Array.from({ length: month - 1 }, (_, i) => i + 1) : [];
    const counters = await this.equityCounterService.getCountersForPeriod(
      clinicId,
      year,
      allMonths,
    );
```
→ in January (`month === 1`) `allMonths` is `[]`, and December N-1 is never in range because the query is pinned to a single `year`.

`apps/api/src/modules/planning/planning-generation.service.ts:1234, :1277-1279` — the scoring lookup + flat `+20` fallback (Bug AC2):
```ts
      // Full equity scoring (weekend, holiday, overtime)
      const equity = constraints.equityMap.get(emp.id);
      if (equity) {
        // (weekend / saturday / holiday / overtime scoring — body UNCHANGED by
        //  this story; only the two lines shown here change — see Task 6e)
      } else {
        score += 20;
      }
```

`apps/api/src/modules/planning/planning-generation.service.ts:392-398` — survivor live increment (Bug AC3, added by 11-2):
```ts
      const date = new Date(`${ss.date}T00:00:00.000Z`);
      const dayOfWeek = date.getUTCDay();
      const equity = constraints.equityMap.get(ss.employeeId);
      if (equity) {
        if (dayOfWeek === 6) equity.saturdayCount++;
        if (dayOfWeek === 0 || dayOfWeek === 6) equity.weekendCount++;
      }
```

`apps/api/src/modules/planning/planning-generation.service.ts:521-528` — assignment live increment (Bug AC3):
```ts
        // FIX 3 — Update equity counters during generation
        const date = new Date(`${a.date}T00:00:00.000Z`);
        const dayOfWeek = date.getUTCDay();
        const equity = constraints.equityMap.get(a.employeeId);
        if (equity) {
          if (dayOfWeek === 6) equity.saturdayCount++;
          if (dayOfWeek === 0 || dayOfWeek === 6) equity.weekendCount++;
        }
```

`apps/api/src/modules/planning/planning-generation.service.ts:3507-3537` — the average helpers whose denominator this story fixes (unchanged code; behaviour changes only because the map is now fully seeded):
```ts
  private getAverageEquity(
    equityMap: Map< string, { saturdayCount: number; weekendCount: number; holidayCount: number; overtimeMinutes: number; } >,
    field: 'saturdayCount' | 'weekendCount' | 'holidayCount',
  ): number {
    if (equityMap.size === 0) return 0;
    let total = 0;
    for (const data of equityMap.values()) {
      total += data[field];
    }
    return total / equityMap.size;
  }
```

`apps/api/src/modules/planning/planning-generation.service.ts:255-264` — the active-employee fetch the seeding loop sits after; `:85-95` — the `ConstraintMap['equityMap']` value type the helper returns:
```ts
    const employees = await this.prisma.employee.findMany({
      where: { clinicId, isActive: true },
      select: { id: true, firstName: true, lastName: true, jobType: true, contractHours: true },
    });
```

### File decision map

- **`apps/api/src/modules/planning/equity-counter.service.ts`** — *Equity counter reads/writes.* Adds `getCountersForWindow` (rolling cross-year window). Imports: `PrismaService`, `EquityCounterType` (both already imported). Exports: the new async method returning `CounterWithEmployee[]`.
- **`apps/api/src/modules/planning/equity-counter.service.spec.ts`** — *Jest unit tests for the service.* Adds the `getCountersForWindow` describe block. Depends on the existing `mockPrismaService.equityCounter.findMany` mock.
- **`apps/api/src/modules/planning/planning-generation.service.ts`** — *Greedy generation loop + constraints.* Adds `EQUITY_WINDOW_MONTHS` constant + `getOrCreateEquityEntry` helper; seeds all active employees; switches `loadConstraints` to the window; removes the `+20` fallback; routes both live increments through the helper. Imports/exports unchanged.
- **`apps/api/src/modules/planning/planning-generation.service.spec.ts`** — *Jest unit tests for generation.* Adds `getCountersForWindow` to the equity mock + default, the AC1 wiring test, and the Story 11-7 seeding/increment mechanism block.

### Testing

- **Framework:** Jest, `*.spec.ts`, in `apps/api`. Run a single file with `pnpm --filter @pawly/api test -- <path-fragment>` (root `pnpm test` is broken by the rtk shim — always use `--filter`).
- **AC1** is covered deterministically: the window math is unit-tested on `getCountersForWindow` (Dec N-1 inclusion, 12-pair length, mid-year roll, target exclusion, clinic scope), and the generation wiring test asserts `loadConstraints` calls the window with `(clinicId, year, month, 12)`.
- **AC2 / AC3** are covered at the **mechanism** level via `jest.spyOn(service as any, 'getOrCreateEquityEntry')` (a `spyOn`, so the real helper still runs): one test asserts every active employee — including un-mapped new hires — is seeded; the other asserts a new hire's live increment routes through create-if-absent (≥ seed + increment).
- **Known confound (surfaced to aped-review / aped-qa, per lesson L2):** a *pure behavioural* assertion on "the new hire no longer over-absorbs weekend shifts" is hard to isolate in a unit test because the generator's equity term is entangled with the monthly-workload and weekly-hours balancing terms (which also redistribute load and mask the equity effect). The deterministic mechanism tests above are the unit-level guard; a **real generation journey** — generate a PUBLISHED January over a clinic seeded with December N-1 history + one new hire, and verify (a) equity does not reset and (b) the new hire's weekend share is proportionate over the full month — should be added at the QA/review stage rather than encoded as a brittle numeric unit assertion.
- **Regression expectation:** the full generation suite must stay green with no edits to existing tests — seeding zeros and removing a *uniform* `+20` are relative-score-preserving.

### Dependencies

- No new libraries. The only new mechanism is a Prisma `findMany` with an `OR` over `{ year, month }` pairs (composite-column disjunction). Per lesson L4, if the `OR`-over-composite behaviour is at all uncertain at implementation time, confirm the current Prisma `where.OR` semantics via **Context7** (`resolve-library-id` → `prisma`, topic "where OR filter") and note the source here. `date-fns` is **not** installed in `apps/api` — the window math uses plain integer month arithmetic (`year * 12 + month`), no date library.

**Commit prefix:** `feat(KON-124): …` (Linear ticket KON-124; Epic 11 milestone). Stage specific files only — never `git add .`.

## File List

**Modify (backend):**

- `apps/api/src/modules/planning/equity-counter.service.ts` — add `getCountersForWindow`.
- `apps/api/src/modules/planning/equity-counter.service.spec.ts` — add `getCountersForWindow` tests.
- `apps/api/src/modules/planning/planning-generation.service.ts` — add `EQUITY_WINDOW_MONTHS` + `getOrCreateEquityEntry`; seed active employees; switch `loadConstraints` to the window; drop the `+20` fallback; route both live increments through the helper.
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` — add `getCountersForWindow` mock + default, the AC1 wiring test, and the Story 11-7 seeding/increment block.

## Dev Agent Record

- **Model:** claude-opus-4-8[1m]
- **Started:** 2026-07-12
- **Completed:** 2026-07-12

### Summary

Generation equity now scores over a rolling 12-month window ending the month before
the target (new `EquityCounterService.getCountersForWindow`), so a January generation
sees December N-1 and fairness never resets on 1 January (AC1). Every active employee
is seeded with a zero-initialised equity entry up front via a new
`getOrCreateEquityEntry` helper, the flat `+20` scoring fallback for un-mapped
employees is removed, and both live intra-month increments (survivor + assignment)
route through create-if-absent — so a new hire is scored on equal, deterministic
footing and their picked-up load is recorded rather than silently dropped (AC2/AC3).
Scope held exactly to the four planned files; no `getCountersForPeriod` caller,
counter computation, or scheduler was touched.

### Files changed

- apps/api/src/modules/planning/equity-counter.service.ts
- apps/api/src/modules/planning/equity-counter.service.spec.ts
- apps/api/src/modules/planning/planning-generation.service.ts
- apps/api/src/modules/planning/planning-generation.service.spec.ts

### Deviations

- **Mechanism:** None — the plan's RED/GREEN code was applied verbatim across the six
  TDD tasks; all existing tests stayed green (seeding zeros + removing a *uniform*
  `+20` are relative-score-preserving, as predicted).
- **Environment (not a code change):** the freshly-dispatched worktree had no
  installed dependencies — `pnpm install`, `pnpm db:generate`, and building the
  internal `@pawly/*` packages (empty `dist/`) were required before the suite and the
  `tsc` types gate (lesson L5) would run. The two `TS7006` errors surfaced by the
  first build were pre-existing cascades of the un-built `@pawly/validators` types
  (lines 727/1214, untouched code) and cleared once the packages were built.
- **L4 source:** Prisma `where.OR` over `{year, month}` pairs confirmed via Context7
  (Prisma docs, CRUD "Multiple conditions with OR/AND") — each object ANDs its fields,
  the array ORs them; ANDed with the top-level `clinicId`/`counterType`.

### Test output

```
$ pnpm --filter @pawly/api test
Test Suites: 34 passed, 34 total
Tests:       937 passed, 937 total

$ pnpm --filter @pawly/api build
nest build → Successfully compiled: 144 files with swc
tsc -p tsconfig.types.json → exit 0 (dist/trpc-types.d.ts emitted)
```
