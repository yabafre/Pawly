# Story: 11-10-generation-performance-under-load — Rotation-Scoring O(1) Index + Spike-Gated Async Generation

**Epic:** Epic 11 — Planning Engine Hardening & Compliance
**Status:** review
**Branch:** feature/KON-127-11-10-generation-performance-under-load
**Ticket:** KON-127 (Linear · project Pawly · milestone Epic 11 · blocked-by KON-119)
**Origin:** Multi-agent planning audit 2026-07-08 — MAJOR (perf): "Rotation scoring freezes the event loop. Re-scans the whole pool per employee per slot, no `await` → NFR2 (<2s) breaks at 50 employees." See `docs/epics-context/epic-11-context.md` § 0 (last bullet) + § 4 (anchor `:1049` / `countTargetDayShifts`). Depends on Story 11-2 (`done`) — the survivor-seeding this story extends the index across.

> **Read first:** `docs/epics-context/epic-11-context.md` — audit synthesis, cross-cutting invariants (determinism §3.3, net-minute accounting §3.4). Line numbers below are anchors verified against this branch during authoring; **re-locate the symbol, do not trust the number blindly** — 11-2/11-3/11-5 have grown the file to 3739 lines.

## User Story

**As an** admin of a large clinic, **I want** month generation to stay responsive at 50 employees, **so that** generating a full month never freezes the API event loop or breaks the < 2s target.

## Acceptance Criteria

1. **[AC1 — rotation evaluation cost decoupled from schedule size]** **Given** a stress configuration (50 employees, 24/7 clinic, 3 shift types, 31-day month), **When** a month is generated, **Then** the schedule produced — every assignment, every staffing hole, and every hard and soft violation, including all rotation-equity outcomes (hard caps that exclude an employee, soft penalties that reorder candidates, soft warnings that get recorded) — is **identical** to the schedule produced before this story. **And** the per-employee rotation-equity evaluation no longer re-examines the whole set of already-placed shifts for each candidate of each slot, so evaluation time stops growing with the number of shifts already assigned. **And** the result stays deterministic and reproducible across runs.

2. **[AC2 — the API stays responsive during generation]** **Given** a full-month generation for a 50-employee clinic, **When** it runs, **Then** the API is never blocked for the whole generation: a concurrent request — another clinic generating its own month, or any other admin action — continues to be served while a month is being generated. **And** the generated schedule is unchanged by whatever mechanism keeps the API responsive.

3. **[AC3 — NFR2 / NFR9]** **Given** the stress configuration, **When** the month is generated, **Then** generation completes within the < 2s target (NFR2) at 50 employees with no degradation (NFR9), and the admin sees a loading indication while it runs (NFR2 feedback beyond 1s).

**FRs covered:** (perf hardening — no new FR). **NFRs:** NFR2 (<2s + loading feedback >1s), NFR9 (50 employees), NFR10 (concurrent generations).

> **AC-to-mechanism mapping (implementation → Tasks):** AC1's identical-output-without-the-rescan is realised by the incremental per-`(employee, ISO-weekday)` rotation index + pre-built quarterly index (Tasks 2–5, unconditional). AC2's "API never blocked" is realised **either** by offloading generation to a Trigger.dev job with a Realtime-subscribed UI (Task 6A) **or**, if the Task-1 feasibility spike fails, by an in-process `setImmediate` yield (Task 6B) — both keep the schedule identical. AC3 is proven by a logged stress benchmark plus the AC1 equivalence tests. See Dev Notes → Scope decisions.

## Tasks

- [x] **Task 1: SPIKE — prove `NestFactory.createApplicationContext(AppModule)` inside a Trigger.dev task** ⏸ **GATE** [AC: 2]
  This gates the whole of Task 6. Create a throwaway spike task at `apps/api/src/trigger/tasks/_spike-nest-context.ts`:
  ```ts
  import { task, logger } from '@trigger.dev/sdk';

  // Story 11-10 Task 1 — SPIKE (throwaway). Proves a NestJS standalone application
  // context can boot AND resolve PlanningGenerationService inside a Trigger.dev
  // worker (no precedent: all existing tasks are standalone getPrisma() code).
  // Verdict gates Task 6 (async offload vs in-process yield). Delete after verdict.
  export const spikeNestContextTask = task({
    id: 'spike-nest-context',
    retry: { maxAttempts: 1 },
    run: async () => {
      const { NestFactory } = await import('@nestjs/core');
      const { AppModule } = await import('../../app.module');
      const { PlanningGenerationService } = await import(
        '../../modules/planning/planning-generation.service'
      );
      const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
      });
      const service = app.get(PlanningGenerationService);
      const ok = typeof service.generateMonthlyPlan === 'function';
      logger.info('Nest context booted inside Trigger task', { ok });
      await app.close();
      return { booted: true, hasGenerate: ok };
    },
  });
  ```
  Re-export it so it is triggerable — add to `apps/api/src/trigger/client.ts`:
  ```ts
  export { spikeNestContextTask } from './tasks/_spike-nest-context';
  ```
  Run it against the real Trigger.dev dev worker (creds already configured — `TRIGGER_SECRET_KEY` / `TRIGGER_PROJECT_ID` in root `.env`):
  ```bash
  # Terminal A — start the dev worker (background); it builds the tasks bundle:
  pnpm --filter @pawly/api exec trigger dev
  # Terminal B — trigger the spike once the worker reports "Ready":
  pnpm --filter @pawly/api exec trigger trigger spike-nest-context
  ```
  > If `trigger trigger` is unavailable in this CLI version, trigger the run from the Trigger.dev dashboard (Test tab → `spike-nest-context` → Run) or via the Trigger MCP `trigger_task`.

  **Record the verdict verbatim in Dev Agent Record → Debug Log**, then decide:
  - **Build succeeds AND the run returns `{ booted: true, hasGenerate: true }`** → verdict **OK** → Task 6 = **async branch (6A)**.
  - **Build fails** (esbuild cannot bundle `AppModule`'s graph — Stripe/mail/etc.), **or** the run errors on boot (missing env, provider init throws), and cannot be resolved by adding the failing module's package to `trigger.config.ts` `build.external`/`additionalPackages` within ~30 min → verdict **KO** → Task 6 = **yield branch (6B)**.

  Delete the spike file + its client.ts re-export once the verdict is recorded (it must not ship):
  ```bash
  git rm apps/api/src/trigger/tasks/_spike-nest-context.ts
  # then remove the spikeNestContextTask line from apps/api/src/trigger/client.ts
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no new type errors after the spike file is removed, exit 0.
  Commit: `git add apps/api/src/trigger/client.ts docs/stories/11-10-generation-performance-under-load.md && git commit -m "spike(KON-127): verdict on Nest-context-in-Trigger (gates async offload)"`

- [x] **Task 2: Add the pure per-`(employee, ISO-day)` index helpers** [AC: 1]
  In `apps/api/src/modules/planning/planning-generation.service.ts`, add these four private methods immediately **after** `getWeekBounds` (anchor on the closing `  }` of `getWeekBounds`, before `reorderSlotsNonWorkDaysFirst`). Full code:
  ```ts
  // Story 11-10 — per-(employee, ISO-weekday) rotation index. Maintained
  // incrementally (mirrors the FIX-4 O(1) counters) so the three rotation-equity
  // evaluators do an O(1) lookup instead of re-filtering the flat alreadyAssigned
  // array (O(A), allocating a Date per element) per employee per slot per rule —
  // the last O(E×A) scan in the generation loop. Outer key: employeeId. Inner key:
  // ISO weekday 1..7. Value: shift count on that weekday.
  private isoDayOf(dateStr: string): number {
    const dow = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
    return dow === 0 ? 7 : dow;
  }

  private incrementDayOfWeekCount(
    index: Map<string, Map<number, number>>,
    employeeId: string,
    dateStr: string,
  ): void {
    const iso = this.isoDayOf(dateStr);
    let byDay = index.get(employeeId);
    if (!byDay) {
      byDay = new Map<number, number>();
      index.set(employeeId, byDay);
    }
    byDay.set(iso, (byDay.get(iso) || 0) + 1);
  }

  private buildDayOfWeekIndex(
    shifts: AssignedShift[],
  ): Map<string, Map<number, number>> {
    const index = new Map<string, Map<number, number>>();
    for (const s of shifts) {
      this.incrementDayOfWeekCount(index, s.employeeId, s.date);
    }
    return index;
  }

  // Equivalent to the old `[...alreadyAssigned, ...quarterlyShifts].filter(...)`:
  // the live index reflects alreadyAssigned (border + survivors + assigned), the
  // quarterly index reflects constraints.quarterlyShifts. Sum only when quarterly.
  private countFromDayIndex(
    dayOfWeekCounts: Map<string, Map<number, number>>,
    quarterlyDayOfWeekCounts: Map<string, Map<number, number>>,
    employeeId: string,
    targetIsoDay: number,
    trackingPeriod: string | undefined,
  ): number {
    const live = dayOfWeekCounts.get(employeeId)?.get(targetIsoDay) || 0;
    if (trackingPeriod !== 'quarterly') return live;
    const historical =
      quarterlyDayOfWeekCounts.get(employeeId)?.get(targetIsoDay) || 0;
    return live + historical;
  }
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no new type errors referencing `isoDayOf` / `buildDayOfWeekIndex` / `countFromDayIndex` (methods are unused until Task 3/4 — TS does not flag unused private methods), exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-127): add pure per-(employee,ISO-day) rotation index helpers"`

- [x] **Task 3: Declare, seed and increment `dayOfWeekCounts` + pre-build `quarterlyDayOfWeekCounts`** [AC: 1]
  All edits in `apps/api/src/modules/planning/planning-generation.service.ts`, inside `generateMonthlyPlan`.

  **3a — Declare the live index next to the other FIX-4 counters.** Anchor on:
  ```ts
    // FIX 4 — O(1) shift type counter: maintained incrementally
    const shiftTypeCounts = new Map<string, Map<string, number>>(); // empId -> (shiftTypeCode -> count)
    // FIX 4 — O(1) shift count per employee
    const employeeShiftCounts = new Map<string, number>();
  ```
  and insert immediately **after** that `employeeShiftCounts` line:
  ```ts
    // Story 11-10 — O(1) per-(employee, ISO-weekday) rotation index. Reflects the
    // exact multiset in allShiftsForScoring (border + survivors + assigned) so the
    // rotation-equity evaluators lookup instead of re-scanning alreadyAssigned.
    const dayOfWeekCounts = new Map<string, Map<number, number>>();
  ```

  **3b — Seed the live index from border shifts.** Anchor on the existing border-shift pre-seed of `assignmentIndex`:
  ```ts
    // Pre-seed assignmentIndex with border shifts (for overlap/consecutive checks)
    for (const bs of borderShifts) {
      const key = `${bs.employeeId}|${bs.date}`;
      const existing = assignmentIndex.get(key) || [];
      existing.push(bs);
      assignmentIndex.set(key, existing);
    }
  ```
  and replace the loop body so it also seeds `dayOfWeekCounts`:
  ```ts
    // Pre-seed assignmentIndex with border shifts (for overlap/consecutive checks)
    for (const bs of borderShifts) {
      const key = `${bs.employeeId}|${bs.date}`;
      const existing = assignmentIndex.get(key) || [];
      existing.push(bs);
      assignmentIndex.set(key, existing);
      // Story 11-10 — border shifts are already part of allShiftsForScoring, so
      // the pre-index rotation scan counted them too. Seed them here to preserve
      // bit-for-bit equivalence (see Dev Notes → Equivalence).
      this.incrementDayOfWeekCount(dayOfWeekCounts, bs.employeeId, bs.date);
    }
  ```
  > **Ordering note:** `dayOfWeekCounts` is declared at 3a (near the other FIX-4 counters, ~line 333) but the border-seed loop at 3b runs earlier in the method (~line 292). Move the `const dayOfWeekCounts = …` declaration from 3a to just **above** the border pre-seed loop (right after `const assignmentIndex = new Map<string, AssignedShift[]>();`) so it exists before 3b uses it. Delete the 3a copy if you seed it here instead — there must be exactly one declaration. Verify with `tsc` (a use-before-declaration is a compile error).

  **3c — Seed the live index from surviving shifts (Story 11-2 loop).** Anchor on the survivor-seeding block's equity update (the end of the `for (const ss of survivingShifts)` loop):
  ```ts
      const date = new Date(`${ss.date}T00:00:00.000Z`);
      const dayOfWeek = date.getUTCDay();
      const equity = constraints.equityMap.get(ss.employeeId);
      if (equity) {
        if (dayOfWeek === 6) equity.saturdayCount++;
        if (dayOfWeek === 0 || dayOfWeek === 6) equity.weekendCount++;
      }
    }
  ```
  and insert the index increment just **before** that block's closing `}` (i.e., append after the equity `if`, inside the loop):
  ```ts
      const date = new Date(`${ss.date}T00:00:00.000Z`);
      const dayOfWeek = date.getUTCDay();
      const equity = constraints.equityMap.get(ss.employeeId);
      if (equity) {
        if (dayOfWeek === 6) equity.saturdayCount++;
        if (dayOfWeek === 0 || dayOfWeek === 6) equity.weekendCount++;
      }
      // Story 11-10 — survivors are in allShiftsForScoring; seed the rotation index.
      this.incrementDayOfWeekCount(dayOfWeekCounts, ss.employeeId, ss.date);
    }
  ```

  **3d — Pre-build the quarterly index once, before the slot loop.** Anchor on the Story-11-2 coverage-index build that ends just before `for (const slot of slots) {`:
  ```ts
    for (const ss of survivingShifts) {
      const coverageKey = `${ss.date}|${ss.shiftTypeCode}`;
      const bucket = preExistingSlotCoverage.get(coverageKey) || [];
      bucket.push({
        startTime: ss.startTime,
        endTime: ss.endTime,
        jobType: ss.jobType,
        consumed: false,
      });
      preExistingSlotCoverage.set(coverageKey, bucket);
    }

    for (const slot of slots) {
  ```
  and insert the quarterly-index build between them:
  ```ts
    for (const ss of survivingShifts) {
      const coverageKey = `${ss.date}|${ss.shiftTypeCode}`;
      const bucket = preExistingSlotCoverage.get(coverageKey) || [];
      bucket.push({
        startTime: ss.startTime,
        endTime: ss.endTime,
        jobType: ss.jobType,
        consumed: false,
      });
      preExistingSlotCoverage.set(coverageKey, bucket);
    }

    // Story 11-10 — quarterly history is fixed for the whole run; index it once
    // (was spread + filtered on every quarterly rotation check, per emp per slot).
    const quarterlyDayOfWeekCounts = this.buildDayOfWeekIndex(
      constraints.quarterlyShifts,
    );

    for (const slot of slots) {
  ```

  **3e — Increment the live index on every assignment.** Anchor on the FIX-3 equity update inside the `for (const a of result.assigned)` loop:
  ```ts
        // FIX 3 — Update equity counters during generation
        const date = new Date(`${a.date}T00:00:00.000Z`);
        const dayOfWeek = date.getUTCDay();
        const equity = constraints.equityMap.get(a.employeeId);
        if (equity) {
          if (dayOfWeek === 6) equity.saturdayCount++;
          if (dayOfWeek === 0 || dayOfWeek === 6) equity.weekendCount++;
        }
      }
  ```
  and append the index increment before the loop's closing `}`:
  ```ts
        // FIX 3 — Update equity counters during generation
        const date = new Date(`${a.date}T00:00:00.000Z`);
        const dayOfWeek = date.getUTCDay();
        const equity = constraints.equityMap.get(a.employeeId);
        if (equity) {
          if (dayOfWeek === 6) equity.saturdayCount++;
          if (dayOfWeek === 0 || dayOfWeek === 6) equity.weekendCount++;
        }
        // Story 11-10 — keep the rotation index in lockstep with allShiftsForScoring.
        this.incrementDayOfWeekCount(dayOfWeekCounts, a.employeeId, a.date);
      }
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no new type errors; `quarterlyDayOfWeekCounts` and `dayOfWeekCounts` are declared and used, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-127): seed + maintain the rotation day-of-week index"`

- [x] **Task 4: Thread the indexes through `scoreAndAssign` and rewrite the 3 evaluators to O(1)** [AC: 1]
  All edits in `apps/api/src/modules/planning/planning-generation.service.ts`.

  **4a — Extend `scoreAndAssign`'s signature with the two indexes** (append them after `employeeShiftCountsMap`). Anchor on:
  ```ts
      shiftTypeCounts: Map<string, Map<string, number>>,
      employeeShiftCountsMap: Map<string, number>,
    ): {
      assigned: AssignedShift[];
  ```
  replace with:
  ```ts
      shiftTypeCounts: Map<string, Map<string, number>>,
      employeeShiftCountsMap: Map<string, number>,
      dayOfWeekCounts: Map<string, Map<number, number>>,
      quarterlyDayOfWeekCounts: Map<string, Map<number, number>>,
    ): {
      assigned: AssignedShift[];
  ```

  **4b — Pass the two indexes at the call site** in `generateMonthlyPlan`. Anchor on:
  ```ts
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
  replace with:
  ```ts
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
        dayOfWeekCounts,
        quarterlyDayOfWeekCounts,
      );
  ```

  **4c — HARD eligibility call site.** Inside `scoreAndAssign`'s `eligible = employees.filter(...)`, anchor on:
  ```ts
            this.violatesHardRotationEquity(
              rule,
              slot,
              emp,
              alreadyAssigned,
              constraints.quarterlyShifts,
            )
  ```
  replace with:
  ```ts
            this.violatesHardRotationEquity(
              rule,
              slot,
              emp,
              dayOfWeekCounts,
              quarterlyDayOfWeekCounts,
            )
  ```

  **4d — SOFT-scoring call site.** Anchor on the ROTATION_EQUITY soft-scoring block:
  ```ts
            const trackingPeriod = rule.config.trackingPeriod as
              | string
              | undefined;
            const count = this.countTargetDayShifts(
              rule,
              emp,
              alreadyAssigned,
              constraints.quarterlyShifts,
              trackingPeriod,
            );
            const maxPerPeriod = rule.config.maxPerPeriod as number;
  ```
  replace with (drop the now-unused `trackingPeriod` local — the method reads it):
  ```ts
            const count = this.countTargetDayShifts(
              rule,
              emp,
              dayOfWeekCounts,
              quarterlyDayOfWeekCounts,
            );
            const maxPerPeriod = rule.config.maxPerPeriod as number;
  ```

  **4e — SOFT-violation call site.** Anchor on:
  ```ts
          this.checkRotationEquity(
            rule,
            slot,
            employee,
            alreadyAssigned,
            constraints.quarterlyShifts,
            softViols,
          );
  ```
  replace with:
  ```ts
          this.checkRotationEquity(
            rule,
            slot,
            employee,
            dayOfWeekCounts,
            quarterlyDayOfWeekCounts,
            softViols,
          );
  ```

  **4f — Rewrite `countTargetDayShifts`** (whole method). Replace the current method verbatim:
  ```ts
  private countTargetDayShifts(
    rule: RuleEntry,
    employee: EmployeeInfo,
    alreadyAssigned: AssignedShift[],
    quarterlyShifts: AssignedShift[],
    trackingPeriod: string | undefined,
  ): number {
    const targetDay = rule.config.targetDay as string;
    const targetIsoDay = PlanningGenerationService.DAY_NAME_TO_ISO[targetDay];
    if (!targetIsoDay) return 0;

    const shiftPool =
      trackingPeriod === 'quarterly'
        ? [...alreadyAssigned, ...quarterlyShifts]
        : alreadyAssigned;

    return shiftPool.filter((a) => {
      if (a.employeeId !== employee.id) return false;
      const d = new Date(`${a.date}T00:00:00.000Z`);
      const aIsoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
      return aIsoDay === targetIsoDay;
    }).length;
  }
  ```
  with:
  ```ts
  // Story 11-10 — O(1) lookup via the incremental rotation index (was an O(A)
  // filter over alreadyAssigned per employee per slot per rule).
  private countTargetDayShifts(
    rule: RuleEntry,
    employee: EmployeeInfo,
    dayOfWeekCounts: Map<string, Map<number, number>>,
    quarterlyDayOfWeekCounts: Map<string, Map<number, number>>,
  ): number {
    const targetDay = rule.config.targetDay as string;
    const targetIsoDay = PlanningGenerationService.DAY_NAME_TO_ISO[targetDay];
    if (!targetIsoDay) return 0;
    const trackingPeriod = rule.config.trackingPeriod as string | undefined;
    return this.countFromDayIndex(
      dayOfWeekCounts,
      quarterlyDayOfWeekCounts,
      employee.id,
      targetIsoDay,
      trackingPeriod,
    );
  }
  ```

  **4g — Rewrite `violatesHardRotationEquity`** (whole method). Replace verbatim:
  ```ts
  private violatesHardRotationEquity(
    rule: RuleEntry,
    slot: SlotRequirement,
    employee: EmployeeInfo,
    alreadyAssigned: AssignedShift[],
    quarterlyShifts: AssignedShift[],
  ): boolean {
    // Skip rule if it has applicableJobTypes and employee doesn't match
    const applicableJobTypes = rule.config.applicableJobTypes as
      | string[]
      | undefined;
    if (
      applicableJobTypes &&
      applicableJobTypes.length > 0 &&
      !applicableJobTypes.includes(employee.jobType)
    ) {
      return false;
    }

    const targetDay = rule.config.targetDay as string;
    const maxPerPeriod = rule.config.maxPerPeriod as number;
    const trackingPeriod = rule.config.trackingPeriod as string | undefined;
    const dayNameToIso: Record<string, number> = {
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
      sunday: 7,
    };
    const targetIsoDay = dayNameToIso[targetDay];
    if (!targetIsoDay) return false;

    const slotDate = new Date(`${slot.date}T00:00:00.000Z`);
    const slotIsoDay = slotDate.getUTCDay() === 0 ? 7 : slotDate.getUTCDay();
    if (slotIsoDay !== targetIsoDay) return false;

    // Include quarterly historical shifts when trackingPeriod is "quarterly"
    const shiftPool =
      trackingPeriod === 'quarterly'
        ? [...alreadyAssigned, ...quarterlyShifts]
        : alreadyAssigned;

    const count = shiftPool.filter((a) => {
      if (a.employeeId !== employee.id) return false;
      const d = new Date(`${a.date}T00:00:00.000Z`);
      const aIsoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
      return aIsoDay === targetIsoDay;
    }).length;

    return count >= maxPerPeriod;
  }
  ```
  with:
  ```ts
  // Story 11-10 — O(1) lookup via the incremental rotation index. Behaviour
  // preserved: applicableJobTypes gate, slot-day early-exit, quarterly inclusion.
  private violatesHardRotationEquity(
    rule: RuleEntry,
    slot: SlotRequirement,
    employee: EmployeeInfo,
    dayOfWeekCounts: Map<string, Map<number, number>>,
    quarterlyDayOfWeekCounts: Map<string, Map<number, number>>,
  ): boolean {
    const applicableJobTypes = rule.config.applicableJobTypes as
      | string[]
      | undefined;
    if (
      applicableJobTypes &&
      applicableJobTypes.length > 0 &&
      !applicableJobTypes.includes(employee.jobType)
    ) {
      return false;
    }

    const targetDay = rule.config.targetDay as string;
    const maxPerPeriod = rule.config.maxPerPeriod as number;
    const trackingPeriod = rule.config.trackingPeriod as string | undefined;
    const targetIsoDay = PlanningGenerationService.DAY_NAME_TO_ISO[targetDay];
    if (!targetIsoDay) return false;

    if (this.isoDayOf(slot.date) !== targetIsoDay) return false;

    const count = this.countFromDayIndex(
      dayOfWeekCounts,
      quarterlyDayOfWeekCounts,
      employee.id,
      targetIsoDay,
      trackingPeriod,
    );
    return count >= maxPerPeriod;
  }
  ```
  > **Equivalence note:** the old method used a **local** `dayNameToIso` map; the static `PlanningGenerationService.DAY_NAME_TO_ISO` is the same monday→1…sunday→7 mapping (already used by `countTargetDayShifts` at write-time). Confirm the static map has all 7 keys before deleting the local one.

  **4h — Rewrite `checkRotationEquity`** (whole method). Replace verbatim:
  ```ts
  // checkRotationEquity: supports trackingPeriod (monthly/quarterly) + job type filter
  private checkRotationEquity(
    rule: RuleEntry,
    slot: SlotRequirement,
    employee: EmployeeInfo,
    alreadyAssigned: AssignedShift[],
    quarterlyShifts: AssignedShift[],
    softViols: GenerationResult['violations']['soft'],
  ) {
    // Skip rule if it has applicableJobTypes and employee doesn't match
    const applicableJobTypes = rule.config.applicableJobTypes as
      | string[]
      | undefined;
    if (
      applicableJobTypes &&
      applicableJobTypes.length > 0 &&
      !applicableJobTypes.includes(employee.jobType)
    ) {
      return;
    }

    const targetDay = rule.config.targetDay as string;
    const maxPerPeriod = rule.config.maxPerPeriod as number;
    const trackingPeriod = rule.config.trackingPeriod as string | undefined;
    const targetIsoDay = PlanningGenerationService.DAY_NAME_TO_ISO[targetDay];
    if (!targetIsoDay) return;

    const slotDate = new Date(`${slot.date}T00:00:00.000Z`);
    const slotIsoDay = slotDate.getUTCDay() === 0 ? 7 : slotDate.getUTCDay();
    if (slotIsoDay !== targetIsoDay) return;

    const shiftPool =
      trackingPeriod === 'quarterly'
        ? [...alreadyAssigned, ...quarterlyShifts]
        : alreadyAssigned;

    const count = shiftPool.filter((a) => {
      if (a.employeeId !== employee.id) return false;
      const d = new Date(`${a.date}T00:00:00.000Z`);
      const aIsoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
      return aIsoDay === targetIsoDay;
    }).length;

    if (count + 1 > maxPerPeriod) {
      softViols.push({
        ruleId: rule.id,
        ruleName: rule.name,
        category: rule.category,
        message: `Employee ${employee.firstName} ${employee.lastName} has ${count + 1} ${targetDay} shifts (${trackingPeriod || 'monthly'}), exceeds maximum of ${maxPerPeriod}`,
        affectedEmployeeId: employee.id,
        affectedDate: slot.date,
        severity: 'warning' as const,
      });
    }
  }
  ```
  with:
  ```ts
  // checkRotationEquity: supports trackingPeriod (monthly/quarterly) + job type filter
  // Story 11-10 — O(1) lookup via the incremental rotation index.
  private checkRotationEquity(
    rule: RuleEntry,
    slot: SlotRequirement,
    employee: EmployeeInfo,
    dayOfWeekCounts: Map<string, Map<number, number>>,
    quarterlyDayOfWeekCounts: Map<string, Map<number, number>>,
    softViols: GenerationResult['violations']['soft'],
  ) {
    const applicableJobTypes = rule.config.applicableJobTypes as
      | string[]
      | undefined;
    if (
      applicableJobTypes &&
      applicableJobTypes.length > 0 &&
      !applicableJobTypes.includes(employee.jobType)
    ) {
      return;
    }

    const targetDay = rule.config.targetDay as string;
    const maxPerPeriod = rule.config.maxPerPeriod as number;
    const trackingPeriod = rule.config.trackingPeriod as string | undefined;
    const targetIsoDay = PlanningGenerationService.DAY_NAME_TO_ISO[targetDay];
    if (!targetIsoDay) return;

    if (this.isoDayOf(slot.date) !== targetIsoDay) return;

    const count = this.countFromDayIndex(
      dayOfWeekCounts,
      quarterlyDayOfWeekCounts,
      employee.id,
      targetIsoDay,
      trackingPeriod,
    );

    if (count + 1 > maxPerPeriod) {
      softViols.push({
        ruleId: rule.id,
        ruleName: rule.name,
        category: rule.category,
        message: `Employee ${employee.firstName} ${employee.lastName} has ${count + 1} ${targetDay} shifts (${trackingPeriod || 'monthly'}), exceeds maximum of ${maxPerPeriod}`,
        affectedEmployeeId: employee.id,
        affectedDate: slot.date,
        severity: 'warning' as const,
      });
    }
  }
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no new type errors; the three evaluators no longer reference `alreadyAssigned` / `quarterlyShifts`, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-127): rewrite the 3 rotation evaluators to O(1) index lookups"`

- [x] **Task 5: Update the `callScore` test helper + rotation-equivalence tests** [AC: 1]
  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`.

  **5a — Extend `callScore` to build + append the two new indexes** (mirrors how it auto-builds the FIX-4 counters). Anchor on the tail of `callScore`:
  ```ts
    return callPrivate(
      'scoreAndAssign',
      ...baseArgs,
      weeklyMinutesCounter,
      stc,
      esc,
    ) as ScoreAndAssignResult;
  };
  ```
  replace with:
  ```ts
    // Story 11-10 — build the per-(employee, ISO-day) live index from alreadyAssigned
    // (mirrors the production seeding) and the quarterly index from constraints.
    const isoDayOf = (dateStr: string) => {
      const dow = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
      return dow === 0 ? 7 : dow;
    };
    const buildDayIdx = (
      shifts: Array<{ employeeId: string; date: string }>,
    ) => {
      const idx = new Map<string, Map<number, number>>();
      for (const s of shifts) {
        const iso = isoDayOf(s.date);
        let byDay = idx.get(s.employeeId);
        if (!byDay) {
          byDay = new Map<number, number>();
          idx.set(s.employeeId, byDay);
        }
        byDay.set(iso, (byDay.get(iso) || 0) + 1);
      }
      return idx;
    };
    const dayOfWeekCounts = buildDayIdx(alreadyAssigned);
    const constraints = (args[2] || {}) as { quarterlyShifts?: Array<{ employeeId: string; date: string }> };
    const quarterlyDayOfWeekCounts = buildDayIdx(constraints.quarterlyShifts || []);

    return callPrivate(
      'scoreAndAssign',
      ...baseArgs,
      weeklyMinutesCounter,
      stc,
      esc,
      dayOfWeekCounts,
      quarterlyDayOfWeekCounts,
    ) as ScoreAndAssignResult;
  };
  ```

  **5b — Add explicit equivalence tests.** Append this block inside the top-level `describe` (right after the existing `describe('SOFT rule evaluation in scoreAndAssign', …)` block closes at its `});`). It exercises the three evaluators through `callScore` (which now feeds the index), proving the index yields the same HARD-block / SOFT-penalty / SOFT-violation behaviour as the old scan:
  ```ts
  // ─── Story 11-10 — rotation index equivalence (HARD block / SOFT penalty / SOFT violation) ──
  describe('Story 11-10 — rotation-equity via O(1) day index', () => {
    const satSlot = {
      date: '2026-03-07', // Saturday (ISO 6)
      shiftTypeCode: 'SURGERY',
      startTime: '08:00',
      endTime: '12:00',
      requiredStaff: 1,
    };
    const rule = (extra: Record<string, unknown> = {}) => ({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Max 2 Saturdays',
      category: 'ROTATION_EQUITY',
      config: { targetDay: 'saturday', maxPerPeriod: 2, ...extra },
      priority: 5,
    });
    // Two prior Saturdays already worked by emp-1 (ISO 6): 2026-02-28 and 2026-03-07.
    const priorSaturdays = (empId: string) => [
      { employeeId: empId, date: '2026-02-28', startTime: '08:00', endTime: '12:00', shiftTypeCode: 'SURGERY', breakMinutes: 0 },
    ];

    it('HARD rotation: excludes an employee at the Saturday cap (index == scan)', () => {
      // maxPerPeriod 1, emp-1 already has 1 Saturday → HARD-blocked → hole (only emp-1 in pool).
      const oneVet = [{ id: 'emp-1', firstName: 'A', lastName: 'M', jobType: 'VET', contractHours: 35 }];
      const result: ScoreAndAssignResult = callScore(
        satSlot,
        oneVet,
        { ...baseConstraints, hardRules: [rule({ maxPerPeriod: 1 })] },
        priorSaturdays('emp-1'),
        new Map(),
        new Map(),
      );
      expect(result.assigned.length).toBe(0);
      expect(result.holeInfo).toBeDefined();
    });

    it('SOFT rotation: penalises the capped employee so the under-cap one wins', () => {
      const twoVets = [
        { id: 'emp-1', firstName: 'A', lastName: 'M', jobType: 'VET', contractHours: 35 },
        { id: 'emp-2', firstName: 'B', lastName: 'D', jobType: 'VET', contractHours: 35 },
      ];
      // emp-1 already has 1 Saturday, cap is 1 → soft penalty on emp-1 → emp-2 wins the single slot.
      const result: ScoreAndAssignResult = callScore(
        satSlot,
        twoVets,
        { ...baseConstraints, softRules: [rule({ maxPerPeriod: 1 })] },
        priorSaturdays('emp-1'),
        new Map(),
        new Map(),
      );
      expect(result.assigned.length).toBe(1);
      expect(result.assigned[0].employeeId).toBe('emp-2');
    });

    it('SOFT rotation: records a violation when the assignee exceeds the cap', () => {
      const oneVet = [{ id: 'emp-1', firstName: 'A', lastName: 'M', jobType: 'VET', contractHours: 35 }];
      // emp-1 has 1 Saturday, cap is 1; assigning this slot makes 2 → soft violation recorded.
      const result: ScoreAndAssignResult = callScore(
        satSlot,
        oneVet,
        { ...baseConstraints, softRules: [rule({ maxPerPeriod: 1 })] },
        priorSaturdays('emp-1'),
        new Map(),
        new Map(),
      );
      expect(result.assigned.length).toBe(1);
      expect(
        result.softViolations.some((v) => v.category === 'ROTATION_EQUITY'),
      ).toBe(true);
    });
  });
  ```
  Run: `pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec"`
  Expected: all suites pass, including the 3 new `Story 11-10` tests AND every pre-existing rotation test (their green state is the equivalence proof), exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-127): rotation-index equivalence (HARD block / SOFT penalty / violation)"`

- [x] **Task 6: Phase B — event-loop non-blocking (BRANCH on Task-1 verdict)** [AC: 2]

  ### Branch 6A — SPIKE OK: offload to Trigger.dev + Realtime UI

  **6A.1 — Expose a public guard wrapper on the service.** In `planning-generation.service.ts`, add this public method immediately after `generateMonthlyPlan`'s closing `}`:
  ```ts
  // Story 11-10 — public wrapper so the router can enforce the 11-1 published-change
  // guard SYNCHRONOUSLY (immediate PUBLISHED_CHANGE_REQUIRES_ACK for the ack dialog)
  // before enqueuing the async generation job. The job re-checks inside its own tx.
  async assertCanRegenerate(
    clinicId: string,
    month: string,
    acknowledgePublishedChange: boolean,
  ): Promise<string[]> {
    return this.assertPublishedChangeAcknowledged(
      clinicId,
      [month],
      acknowledgePublishedChange,
    );
  }
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20` — expect exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-127): expose assertCanRegenerate for sync published-change guard"`

  **6A.2 — Create the generation task.** New file `apps/api/src/trigger/tasks/generate-monthly-plan.ts`:
  ```ts
  import { task, logger, metadata } from '@trigger.dev/sdk';
  import type { INestApplicationContext } from '@nestjs/common';
  import type { GenerationResult } from '@pawly/validators';
  import type { PlanningGenerationService } from '../../modules/planning/planning-generation.service';

  // Story 11-10 — offload month generation to Trigger.dev so the API event loop is
  // never held for the generation duration (NFR10: concurrent generations across
  // clinics). The generation logic lives in the NestJS PlanningGenerationService;
  // we boot a standalone Nest application context ONCE (cached across warm runs on
  // the same worker) and resolve the service from the DI container. Shape validated
  // by Story-11-10 Task-1 spike; adjust build.external / additionalPackages in
  // trigger.config.ts if the spike required it.
  interface GeneratePlanJobPayload {
    clinicId: string;
    month: string;
    templateId: string;
    acknowledgePublishedChange: boolean;
  }

  let cachedApp: Promise<INestApplicationContext> | null = null;

  async function getNestContext(): Promise<INestApplicationContext> {
    if (!cachedApp) {
      cachedApp = (async () => {
        const { NestFactory } = await import('@nestjs/core');
        const { AppModule } = await import('../../app.module');
        return NestFactory.createApplicationContext(AppModule, {
          logger: ['error', 'warn'],
        });
      })();
    }
    return cachedApp;
  }

  export const generateMonthlyPlanTask = task({
    id: 'generate-monthly-plan',
    // Generation is a deterministic single-shot guarded by a pg advisory lock
    // (Story 11-5) — retries would redo the whole month, so cap at 1 attempt.
    retry: { maxAttempts: 1 },
    run: async (
      payload: GeneratePlanJobPayload,
    ): Promise<GenerationResult> => {
      const { clinicId, month, templateId, acknowledgePublishedChange } =
        payload;
      metadata.set('progress', { phase: 'starting', percentage: 0 });
      const app = await getNestContext();
      const { PlanningGenerationService: Token } = await import(
        '../../modules/planning/planning-generation.service'
      );
      const service = app.get<PlanningGenerationService>(Token);
      const result = await service.generateMonthlyPlan(
        clinicId,
        month,
        templateId,
        { acknowledgePublishedChange },
      );
      metadata.set('progress', {
        phase: 'done',
        percentage: 100,
        holes: result.holes.length,
      });
      logger.info('generation complete', {
        clinicId,
        month,
        holes: result.holes.length,
        filled: result.stats.filledSlots,
      });
      return result;
    },
  });
  ```
  > **Redis cache coherence:** the router used to invalidate `schedule:*` / `planning:pub:*` in a `finally`. With the async offload that invalidation must happen **after** the real generation. Simplest correct option: resolve `RedisService` from the same Nest context and invalidate at the end of the task `run` (before `return`). Add, just before the `metadata.set('progress', { phase: 'done' … })`:
  > ```ts
  >       const { RedisService } = await import('../../redis');
  >       const redis = app.get(RedisService);
  >       await redis.invalidatePattern(`schedule:${clinicId}:*`);
  >       await redis.invalidatePattern(`planning:pub:${clinicId}:*`);
  >       await redis.del(`dashboard:stats:${clinicId}`);
  > ```
  > Confirm the `RedisService` export path (`../../redis`) and method names (`invalidatePattern` / `del`) against `apps/api/src/redis` before wiring — mirror `invalidateScheduleCaches` in `planning.router.ts:63-81`.

  **6A.3 — Re-export the task.** In `apps/api/src/trigger/client.ts` add:
  ```ts
  export { generateMonthlyPlanTask } from './tasks/generate-monthly-plan';
  ```

  **6A.4 — Add the async handle schema.** In `packages/validators/src/planning/planning-generation.schema.ts`, add after `generatePlanSchema`:
  ```ts
  // Story 11-10 — async generation handle. generatePlan now enqueues a Trigger.dev
  // job and returns the run handle; the client subscribes via useRealtimeRun and
  // reads run.output (a GenerationResult) on completion.
  export const generatePlanHandleSchema = z.object({
    runId: z.string(),
    publicAccessToken: z.string(),
  });
  export type GeneratePlanHandle = z.infer<typeof generatePlanHandleSchema>;
  ```
  Then re-export it from `packages/validators/src/planning/index.ts` (next to the `generatePlanSchema` export):
  ```ts
  export { generatePlanHandleSchema } from './planning-generation.schema';
  export type { GeneratePlanHandle } from './planning-generation.schema';
  ```
  Rebuild the package so the app picks up the new export (per project memory `epic11-dev-gotchas` — SWC dist must be fresh):
  ```bash
  pnpm --filter @pawly/validators build
  ```

  **6A.5 — Rewrite the `generatePlan` router procedure.** In `apps/api/src/trpc/routers/planning.router.ts`, add the import at the top (with the other imports):
  ```ts
  import { auth } from '@trigger.dev/sdk';
  import { generateMonthlyPlanTask } from '@/trigger/client';
  ```
  Replace the current procedure verbatim:
  ```ts
  generatePlan: subscribedProcedure
    .input(generatePlanSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      try {
        return await ctx.planningGenerationService.generateMonthlyPlan(
          ctx.user.clinicId,
          input.month,
          input.templateId,
          { acknowledgePublishedChange: input.acknowledgePublishedChange },
        );
      } finally {
        await invalidateScheduleCaches(ctx.redis, ctx.user.clinicId);
      }
    }),
  ```
  with:
  ```ts
  generatePlan: subscribedProcedure
    .input(generatePlanSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      // Story 11-10 — enforce the 11-1 published-change guard SYNCHRONOUSLY here so
      // the ack dialog still gets an immediate PUBLISHED_CHANGE_REQUIRES_ACK before
      // we enqueue the async job (the job re-checks inside its own transaction).
      await ctx.planningGenerationService.assertCanRegenerate(
        ctx.user.clinicId,
        input.month,
        input.acknowledgePublishedChange,
      );
      // Redis invalidation moves INTO the task (runs after real generation).
      const handle = await generateMonthlyPlanTask.trigger({
        clinicId: ctx.user.clinicId,
        month: input.month,
        templateId: input.templateId,
        acknowledgePublishedChange: input.acknowledgePublishedChange,
      });
      const publicAccessToken = await auth.createPublicToken({
        scopes: { read: { runs: [handle.id] } },
        expirationTime: '1h',
      });
      return { runId: handle.id, publicAccessToken };
    }),
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20` — expect exit 0.
  Commit: `git add apps/api/src/trigger/tasks/generate-monthly-plan.ts apps/api/src/trigger/client.ts apps/api/src/trpc/routers/planning.router.ts packages/validators/src/planning/ && git commit -m "feat(KON-127): offload generation to Trigger.dev job, return run handle (6A)"`

  **6A.6 — Add the frontend Realtime dependency.** In `apps/web/package.json`, add to `dependencies`:
  ```json
  "@trigger.dev/react-hooks": "^4.4.6",
  ```
  Install:
  ```bash
  pnpm install
  ```

  **6A.7 — Rewrite `useGeneration` to return the handle.** In `apps/web/src/app/[locale]/admin/planning/_hooks/useGeneration.ts`, the mutation now resolves `{ runId, publicAccessToken }` instead of a `GenerationResult`. Change the `onSuccess` so it does **not** invalidate immediately (generation isn't done yet — invalidation happens on run completion in the panel). Replace:
  ```ts
  const { mutate: generatePlan, isPending: isGenerating } = useServerActionMutation(
    generatePlanAction,
    {
      onSuccess: () => {
        invalidateAll();
        toast.success(t('generated'));
      },
      onError: (err: { message?: string }) => {
        if (err?.message === 'PUBLISHED_CHANGE_REQUIRES_ACK') {
          toast.error(t('publishedChangeRequired'));
        } else {
          toast.error(t('generateFailed'), { description: err?.message });
        }
      },
    }
  );
  ```
  with:
  ```ts
  // Story 11-10 — generatePlan now ENQUEUES an async job and resolves a run handle;
  // the panel subscribes via useRealtimeRun and invalidates on completion. No toast
  // here on success (the job hasn't run yet) — only the enqueue error is surfaced.
  const { mutate: generatePlan, isPending: isEnqueuing } = useServerActionMutation(
    generatePlanAction,
    {
      onError: (err: { message?: string }) => {
        if (err?.message === 'PUBLISHED_CHANGE_REQUIRES_ACK') {
          toast.error(t('publishedChangeRequired'));
        } else {
          toast.error(t('generateFailed'), { description: err?.message });
        }
      },
    }
  );
  ```
  Then export `invalidateAll` and `isEnqueuing` from the hook (add to the returned object; keep `isGenerating` as an alias `isGenerating: isEnqueuing` so the delete-path callers are untouched). Confirm the return object includes: `generatePlan, isEnqueuing, isGenerating: isEnqueuing, invalidateAll` alongside the existing keys.

  **6A.8 — Subscribe to the run in `GenerationPanel`.** In `apps/web/src/app/[locale]/admin/planning/_components/GenerationPanel.tsx`:
  - Add the import: `import { useRealtimeRun } from '@trigger.dev/react-hooks';`
  - Add handle state next to `generationResult` (line ~74):
    ```tsx
    const [handle, setHandle] = useState<{ runId: string; publicAccessToken: string } | null>(null);
    ```
  - Subscribe to the run and consume `run.output` on completion (place after the hooks, before `handleGenerate`):
    ```tsx
    // Story 11-10 — generation runs async in a Trigger.dev job; subscribe to the run
    // and render its GenerationResult output when it completes.
    const { run } = useRealtimeRun(handle?.runId, {
      accessToken: handle?.publicAccessToken,
      enabled: !!handle,
      onComplete: (completed) => {
        const output = completed?.output as GenerationResult | undefined;
        if (output) setGenerationResult(output);
        invalidateAll();
        toast.success(t('generated'));
        setHandle(null);
      },
    });
    const isGenerating = isEnqueuing || (!!handle && run?.status !== 'COMPLETED');
    ```
    > Pull `invalidateAll` and `isEnqueuing` from `useGeneration` in the destructure at line ~79. Import `toast` and `useState` if not already present. The `run.status` union comes from `@trigger.dev/react-hooks`; if a status string mismatch surfaces, gate on `run?.finishedAt` / `onComplete` instead.
  - In `handleGenerate` (and `handleConfirmRegenerate`), replace the `onSuccess: (result: GenerationResult) => setGenerationResult(result)` with capturing the handle:
    ```tsx
        {
          onSuccess: (h: { runId: string; publicAccessToken: string }) => {
            setHandle(h);
          },
        }
    ```
  Run (web unit tests + typecheck):
  ```bash
  pnpm --filter @pawly/web exec tsc --noEmit
  pnpm --filter @pawly/web test -- GenerationPanel
  ```
  Expected: typecheck exit 0; existing GenerationPanel/useGeneration specs updated to the handle flow pass (see Testing note — the 11-1 specs mocking a synchronous `GenerationResult` return must be reworked to mock the handle + a completed run). exit 0.
  Commit: `git add apps/web/ && git commit -m "feat(KON-127): subscribe to async generation run via Trigger Realtime (6A)"`

  ### Branch 6B — SPIKE KO: in-process `setImmediate` yield

  Single edit in `planning-generation.service.ts`. Anchor on the slot loop head (already carrying the Story-11-2 coverage logic):
  ```ts
    for (const slot of slots) {
      totalPositions += slot.requiredStaff;
  ```
  replace with (add the yield counter declaration just above the loop, and the yield at the top of the body):
  ```ts
    // Story 11-10 (AC2 fallback) — yield to the event loop every 8 slots so a
    // month-long generation never blocks concurrent API requests for its whole
    // duration. Deterministic: the yield does not reorder slot processing.
    let slotsSinceYield = 0;
    for (const slot of slots) {
      if (++slotsSinceYield % 8 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      totalPositions += slot.requiredStaff;
  ```
  (`generateMonthlyPlan` is already `async`; no signature change. The router and frontend stay exactly as they are today — synchronous `GenerationResult`.)
  Run: `pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec"`
  Expected: all suites pass (the yield changes nothing observable), exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-127): yield event loop every 8 slots during generation (6B)"`

- [x] **Task 7: Stress benchmark + full verification + bookkeeping** [AC: 1, 3]
  **7a — Add the logged stress benchmark.** In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, append inside the top-level `describe('generateMonthlyPlan')` block (it reuses the file's `service`, `mockPrismaService`, `mockTemplateService`, `clinicId`). It builds a 24/7 × 3-shift-type × 31-day template for 50 VETs, generates, logs the duration, and asserts the NFR2 budget with a wide anti-flaky threshold:
  ```ts
  it('Story 11-10 — generates the 50-employee stress config well under the NFR2 budget', async () => {
    const shiftTypes = [
      { code: 'MORNING', startTime: '00:00', endTime: '08:00', breakMinutes: 0 },
      { code: 'DAY', startTime: '08:00', endTime: '16:00', breakMinutes: 0 },
      { code: 'NIGHT', startTime: '16:00', endTime: '24:00', breakMinutes: 0 },
    ];
    const days = Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i + 1,
      slots: shiftTypes.map((st) => ({ shiftTypeCode: st.code, requiredStaff: 2 })),
    }));
    mockTemplateService.getTemplateById.mockResolvedValue({
      id: 'tpl-stress',
      name: '24/7 stress',
      data: { days },
      clinicId,
    });
    // 50 active VETs
    const fiftyVets = Array.from({ length: 50 }, (_, i) => ({
      id: `emp-${i}`,
      firstName: `E${i}`,
      lastName: 'X',
      jobType: 'VET',
      contractHours: 35,
    }));
    mockPrismaService.employee.findMany.mockResolvedValue(fiftyVets);
    // No survivors, no border shifts (both queries return []).
    mockPrismaService.shift.findMany.mockResolvedValue([]);
    mockPrismaService.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          shift: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createManyAndReturn: jest
              .fn()
              .mockImplementation(({ data }: { data: unknown[] }) =>
                data.map((d, i) => ({ id: `gen-${i}`, ...(d as object) })),
              ),
            $executeRaw: jest.fn().mockResolvedValue(0),
          },
          $executeRaw: jest.fn().mockResolvedValue(0),
        }),
    );

    const start = Date.now();
    const result = await service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-stress');
    const elapsedMs = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`[11-10] stress 50-emp/24-7/31d generation core: ${elapsedMs}ms`);

    expect(result.stats.totalSlots).toBeGreaterThan(0);
    // NFR2 budget is 2s; wide threshold keeps CI non-flaky while still catching a
    // regression back to the O(E×A) scan (which blew past 2s at this scale).
    expect(elapsedMs).toBeLessThan(2000);
  });
  ```
  > **Mock-shape caveat:** the `$transaction` callback must expose whatever the generation tx calls — at minimum `tx.shift.deleteMany`, `tx.shift.createManyAndReturn`, and `tx.$executeRaw` (Story 11-5's `pg_advisory_xact_lock`). Re-check the tx body in `generateMonthlyPlan` and mirror any additional `tx.*` call the current code makes; a missing mock throws inside the tx and fails the test with a clear message. If `apprenticeDeclarationService.getUndeclaredApprentices` is called, ensure its mock returns `[]`.

  **7b — Full gate.** Run the whole matrix + build:
  ```bash
  pnpm test
  pnpm build
  ```
  Expected: `pnpm test` — API green (≥ 873 tests: the 3 Task-5 equivalence tests + the Task-7 benchmark on top of the 870 baseline), validators + web green; `pnpm build` — all tasks successful, exit 0.
  > If root `pnpm test` is broken by the local `rtk` turbo shim (project memory `epic11-dev-gotchas`), run per-workspace: `pnpm --filter @pawly/api test`, `pnpm --filter @pawly/web test`, `pnpm --filter @pawly/validators test`. If `pnpm build` stalls at 0% CPU, it is the iCloud `.git` eviction issue (`icloud-git-eviction`), not a code error — retry.

  **7c — Bookkeeping.** Fill the Dev Agent Record (branch verdict for Task 6, benchmark ms, deviations) and flip state.
  Commit: `git add docs/stories/11-10-generation-performance-under-load.md docs/state.yaml && git commit -m "docs(KON-127): dev record + benchmark result + story bookkeeping"`

## Dev Notes

### Scope decisions (locked with Alex during authoring)

This story was scoped interactively. Three load-bearing decisions:

1. **The O(1) rotation index (AC1) is the real perf fix and is UNCONDITIONAL.** It eliminates the last `O(E×A)` re-scan in the generation loop; it alone takes stress-config generation from seconds to ~tens of ms, satisfying NFR2/NFR9. Everything else is about NFR10 (never blocking concurrent requests).
2. **The async offload to Trigger.dev (AC2) is SPIKE-GATED.** `generateMonthlyPlan` is a NestJS service method with 8 injected dependencies; Trigger.dev tasks run in a separate deployed worker with **no NestJS DI container** (all 7 existing tasks are standalone `getPrisma()` code — zero precedent for booting Nest inside a task). **Task 1 is a spike** that proves `NestFactory.createApplicationContext(AppModule)` builds and runs inside a Trigger task. Its verdict gates Task 6:
   - **Spike OK** → offload generation to a Trigger.dev job; `generatePlan` returns `{ runId, publicAccessToken }`; the frontend subscribes via `useRealtimeRun`.
   - **Spike KO** → fall back to an in-process `setImmediate` yield in the slot loop.
3. **Perf proof (AC3) = functional equivalence + a logged benchmark** with a wide threshold (anti-flaky), not a strict wall-clock gate. The existing rotation tests staying green IS the equivalence proof; the OTel metric `planningGenerationDuration` (already emitted at `:644`) covers prod observability.

### Non-Goals — do NOT do these here

- **Do not "fix" the border-shift inclusion in the monthly rotation count.** Today the rotation count for a `monthly` rule includes border shifts (adjacent months) because they live in `alreadyAssigned`. The index seeds them too — **on purpose**, to stay bit-for-bit equivalent. Whether a monthly rule should exclude border months is a behaviour change out of scope for a perf story; surface it at review (like the `filledSlots` nuance in 11-2).
- **Do not unify the three evaluators into one method / change the rule engine.** That is Story 11-8. Here they keep their three distinct call sites and semantics — only their *counting mechanism* changes.
- **Do not touch the greedy completeness (backtracking / repair).** That is Story 11-9.
- **Do not add per-slot progress streaming from the service in the async branch.** The Trigger `metadata.set('progress', …)` is coarse (starting/done). With the O(1) index the core runs in ~tens of ms, so fine-grained progress is pointless. A `run.status` badge is enough loading feedback (NFR2 >1s).
- **Do not change `deleteGeneratedShifts` to async.** Only `generatePlan` is offloaded. `deleteGeneratedShifts` stays synchronous (it is fast — a single guarded `deleteMany`).

### Architecture

- **Data flow (non-negotiable):** `Page (RSC) → Client Component → Hook → Zsa → Server Action → tRPC Client → NestJS Service → Prisma`. AC1 touches **only** the backend service + its spec. The async branch (6A) additionally changes the router return contract and the frontend consumer; the guard/gating chain (`subscribedProcedure` + `adminOnly`) is unchanged.
- **Cross-cutting invariant (epic-context §3.3 — determinism):** the index is a deterministic pass over the same shift multiset the scan saw. Tiebreakers (`score → #shifts → #weekends → employeeId`) and the whole scoring path are untouched. The `setImmediate` yield (6B) does not reorder slot processing (the loop order is fixed before the yield), so determinism holds there too.
- **Cross-cutting invariant (epic-context §3.4 — net-minute accounting):** unaffected — this story only changes how target-day *counts* are computed, not hours.
- **Why the index is exactly equivalent to the scan:** every scan was `shiftPool.filter(a => a.employeeId === emp.id && isoDay(a.date) === targetIso).length`, where `shiftPool = trackingPeriod==='quarterly' ? [...alreadyAssigned, ...quarterlyShifts] : alreadyAssigned`. `dayOfWeekCounts` is maintained to reflect exactly `alreadyAssigned` (border + survivors + assigned, seeded/incremented at the same three points as the FIX-4 counters); `quarterlyDayOfWeekCounts` reflects exactly `constraints.quarterlyShifts`. `countFromDayIndex` returns `live` for monthly and `live + historical` for quarterly — the same multiset, the same count.
- **Async guard ordering (6A):** the published-change guard (`assertCanRegenerate`) runs synchronously in the router *before* the enqueue, so the 11-1 acknowledgement dialog still receives an immediate `PUBLISHED_CHANGE_REQUIRES_ACK`. The job re-runs the full guard inside its own transaction (`assertPublishedChangeAcknowledged` at the top of `generateMonthlyPlan`), so there is no TOCTOU gap — belt and suspenders.
- **Trigger.dev conventions (from the audit of `apps/api/src/trigger/`):** tasks are auto-discovered from `dirs: ['src/trigger/tasks']`; triggerable tasks are re-exported from `client.ts` and imported via `@/trigger/client`; the `useTrigger` gate is `!!process.env.TRIGGER_SECRET_KEY`. Existing tasks use `getPrisma()` (standalone pg pool) — **this story is the first to boot a Nest context in a task** (hence the Task-1 spike). If the build fails to bundle `AppModule`, add the offending package to `trigger.config.ts` `build.external` / `additionalPackages` (the pattern `@prisma/client`, `pg`, `stripe` etc. are already externalised there).

### Existing code at write time (Step-0 verbatim quotes — re-verify the symbol, line numbers may drift)

`planning-generation.service.ts:59-66, :72-95` — the types this story reuses:
```ts
type AssignedShift = {
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  shiftTypeCode: string;
  breakMinutes?: number;
};
// ...
type RuleEntry = {
  id: string;
  name: string;
  category: string;
  config: Record<string, unknown>;
  priority: number;
};

type ConstraintMap = {
  unavailableMap: Map<string, Set<string>>;
  schoolDayMap: Map<string, Set<string>>;
  hardRules: RuleEntry[];
  softRules: RuleEntry[];
  equityMap: Map<string, { saturdayCount: number; weekendCount: number; holidayCount: number; overtimeMinutes: number; }>;
  quarterlyShifts: AssignedShift[];
};
```

`planning-generation.service.ts:102` — the static day map the rewritten evaluators reuse (must have all 7 keys monday→1…sunday→7; `countTargetDayShifts` already uses it at write-time):
```ts
private static readonly DAY_NAME_TO_ISO: Record<string, number> = { /* monday:1 … sunday:7 */ };
```

`planning-generation.service.ts:3716-3738` — `countTargetDayShifts` (the SOFT-scoring re-scan, hot path — full body in Task 4f):
```ts
  private countTargetDayShifts(rule, employee, alreadyAssigned, quarterlyShifts, trackingPeriod): number {
    // ... shiftPool = quarterly ? [...alreadyAssigned, ...quarterlyShifts] : alreadyAssigned;
    return shiftPool.filter((a) => { if (a.employeeId !== employee.id) return false; const d = new Date(`${a.date}T00:00:00.000Z`); const aIsoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); return aIsoDay === targetIsoDay; }).length;
  }
```

`planning-generation.service.ts:3453-3505` — `violatesHardRotationEquity` (HARD eligibility re-scan; full body in Task 4g). Note the **local** `dayNameToIso` map to be replaced by the static one.

`planning-generation.service.ts:3176-3230` — `checkRotationEquity` (SOFT-violation re-scan; full body in Task 4h).

`planning-generation.service.ts:936-946` — `scoreAndAssign` signature (10 params today; Task 4a appends 2):
```ts
  private scoreAndAssign(slot, employees, constraints, alreadyAssigned, assignmentIndex, employeeMinutes, weeksInMonth, weeklyMinutesCounter, shiftTypeCounts, employeeShiftCountsMap): { assigned; holeInfo?; hardViolations; softViolations; } {
```

`planning.router.ts:249-263` — `generatePlan` (synchronous today; Task 6A.5 rewrites):
```ts
  generatePlan: subscribedProcedure.input(generatePlanSchema).mutation(async ({ input, ctx }) => {
    adminOnly(ctx.user.role);
    try { return await ctx.planningGenerationService.generateMonthlyPlan(ctx.user.clinicId, input.month, input.templateId, { acknowledgePublishedChange: input.acknowledgePublishedChange }); }
    finally { await invalidateScheduleCaches(ctx.redis, ctx.user.clinicId); }
  }),
```

`planning.router.ts:63-81` — `invalidateScheduleCaches` (patterns the async task must reproduce): `schedule:${clinicId}:*`, `planning:pub:${clinicId}:*`, `del(dashboard:stats:${clinicId})`.

`trigger.config.ts:32-80` — `defineConfig` (project via `TRIGGER_PROJECT_ID`, `runtime: 'node-22'`, `dirs: ['src/trigger/tasks']`, Prisma build extension, `build.external` already lists `@prisma/client`, `pg`, `zod`, react). SDK `@trigger.dev/sdk@^4.4.6`.

`apps/api/src/main.ts:1,7,72` — the only existing Nest bootstrap (the spike parallels it with `createApplicationContext`):
```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, logger: [...] });
```

`useGeneration.ts:55-70` (web) — the mutation (Task 6A.7 rewrites the `onSuccess`). `GenerationPanel.tsx:74, :105-127, :288-300, :378-382` — result state, `handleGenerate`, the button spinner (`Loader2` + `t('generating')` — the only current loading feedback), and the `PublishedChangeDialog`. `generation-actions.ts:1-15` — `generatePlanAction` (zsa) returns `trpc.planning.generatePlan.mutate(input)` verbatim; its inferred return type changes to the handle automatically in branch 6A.

### File decision map

**Modify (backend, UNCONDITIONAL)**
- `apps/api/src/modules/planning/planning-generation.service.ts` — index helpers (T2), seed/increment + quarterly (T3), signature + 3 evaluators O(1) (T4), `assertCanRegenerate` (6A) or `setImmediate` yield (6B). *Single responsibility:* monthly generation loop + shift mutations. *In/out:* Prisma reads; returns `GenerationResult`.
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` — `callScore` index build (T5a), rotation equivalence tests (T5b), stress benchmark (T7a). *Single responsibility:* generation service unit coverage.

**Modify / create (async branch 6A only — if Task-1 spike = OK)**
- `apps/api/src/trigger/tasks/generate-monthly-plan.ts` *(create)* — Trigger job booting a Nest context + running the service + Redis invalidation. *In/out:* payload `{clinicId, month, templateId, ack}` → `GenerationResult`.
- `apps/api/src/trigger/client.ts` — re-export the task.
- `packages/validators/src/planning/planning-generation.schema.ts` (+`index.ts`) — `generatePlanHandleSchema`.
- `apps/api/src/trpc/routers/planning.router.ts` — enqueue + `createPublicToken`, return handle.
- `apps/web/package.json` — add `@trigger.dev/react-hooks`.
- `apps/web/src/app/[locale]/admin/planning/_hooks/useGeneration.ts` — return handle, defer invalidation.
- `apps/web/src/app/[locale]/admin/planning/_components/GenerationPanel.tsx` — `useRealtimeRun`, render `run.output` on complete.

**Modify (yield branch 6B only — if Task-1 spike = KO)**
- `apps/api/src/modules/planning/planning-generation.service.ts` — the slot loop only.

**Create:** none (unconditional); the async branch creates the one task file above.

### Testing

- **Framework:** API = Jest `*.spec.ts`. Run the focused file: `pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec"`.
- **`callScore` is the single choke point (T5a).** Every direct `scoreAndAssign` test flows through `callScore`, which already auto-appends the FIX-4 counters; extend it once to append the two indexes and all ~9 direct tests keep working. This is why the signature change is low-risk.
- **Equivalence is the AC1 proof — scoped to the discriminating tests (aped-review correction).** "Pre-existing rotation tests staying green" over-claims: 2 of the named ROTATION_EQUITY tests (`enforces HARD ROTATION_EQUITY by excluding employees at limit`, `higher priority SOFT ROTATION_EQUITY rule creates stronger scoring penalty`) stay green even with a sabotaged index — their fixtures give the "should-lose" employee the only prior shifts, so the orthogonal fewer-shifts tiebreak alone reproduces the expected winner (confound predates this story). The genuine equivalence proof = the 3 T5b tests plus the 2 discriminating pre-existing tests (`re-admits rotation-blocked employees to avoid holes`, `records soft warning for ROTATION_EQUITY violation`) — all 5 verified RED under a sabotaged `countFromDayIndex`, GREEN with the correct one.
- **Shared `shift.findMany` mock (project memory `epic11-dev-gotchas` + 11-2):** `generateMonthlyPlan` issues two `shift.findMany` (border `where.date.in`, survivors `where.OR`). The benchmark (T7a) returns `[]` for both via a flat `mockResolvedValue([])` — safe because both are empty. Any test seeding non-empty shifts must key on the predicate.
- **Async branch specs (6A):** the 11-1 `useGeneration.spec.tsx` / `generation.spec.tsx` mock a synchronous `GenerationResult` mutation return — they must be reworked to mock `{ runId, publicAccessToken }` + a completed `useRealtimeRun`. Mock `@trigger.dev/react-hooks`'s `useRealtimeRun` to return `{ run: { status: 'COMPLETED', output: <GenerationResult> } }` and assert `setGenerationResult` + `invalidateAll` fire via `onComplete`. Flag deeper Realtime-integration coverage as an aped-review add if the mock proves brittle.
- **Benchmark is logged, not gated tightly (AC3 decision):** wide `< 2000ms` threshold + `console.log` of the real ms. It catches a regression to the O(E×A) scan without flaking on slow CI runners.

### Dependencies

- **No new libraries in the unconditional path.** `date-fns` is **not** installed in `apps/api` — the index helpers use only native `Date`/`getUTCDay`.
- **Async branch 6A adds `@trigger.dev/react-hooks@^4.4.6` to `apps/web`** (matches `@trigger.dev/sdk@^4.4.6` in `apps/api`). No provider needed — `useRealtimeRun(runId, { accessToken })` takes the token inline.
- Per **L4** (epic-context §5): the Trigger.dev Realtime + `auth.createPublicToken` scopes syntax was confirmed against Trigger.dev docs during authoring — `auth.createPublicToken({ scopes: { read: { runs: [handle.id] } }, expirationTime: '1h' })` and `useRealtimeRun(runId, { accessToken, onComplete })` with typed `run.output`. Re-confirm against the installed `@trigger.dev/sdk@4.4.6` types before shipping; record sources in the Dev Agent Record.
- Per **L-audit** (epic-context §5): "verified" means every entry-point. The three rewritten evaluators (`violatesHardRotationEquity`, `countTargetDayShifts`, `checkRotationEquity`) are each behaviourally covered by a T5b test (HARD block / SOFT penalty / SOFT violation) — do not declare AC1 done until all three are green through the index path, not just type-clean.

## File List

**Modify (backend, unconditional):**
- `apps/api/src/modules/planning/planning-generation.service.ts`
- `apps/api/src/modules/planning/planning-generation.service.spec.ts`

**Async branch 6A (if Task-1 spike = OK):**
- `apps/api/src/trigger/tasks/generate-monthly-plan.ts` *(create)*
- `apps/api/src/trigger/client.ts`
- `packages/validators/src/planning/planning-generation.schema.ts`
- `packages/validators/src/planning/index.ts`
- `apps/api/src/trpc/routers/planning.router.ts`
- `apps/web/package.json`
- `apps/web/src/app/[locale]/admin/planning/_hooks/useGeneration.ts`
- `apps/web/src/app/[locale]/admin/planning/_components/GenerationPanel.tsx`

**Yield branch 6B (if Task-1 spike = KO):**
- `apps/api/src/modules/planning/planning-generation.service.ts` (slot loop only)

**Spike (Task 1, throwaway — must NOT ship):**
- `apps/api/src/trigger/tasks/_spike-nest-context.ts` *(create then delete)*

## Dev Agent Record

- **Model:** claude-fable-5
- **Started:** 2026-07-12
- **Completed:** 2026-07-12

### Debug Log

- **2026-07-12 — Task 1 spike VERDICT: KO (verbatim).** Alex restarted the self-hosted
  instance (root → 302, `trigger whoami` OK: project pawly / org hakubo). Run 1 —
  **build failed**: esbuild `Could not resolve "@nestjs/microservices"` /
  `"@nestjs/microservices/microservices-module"` / `"@nestjs/websockets/socket-module"` /
  `"class-transformer/storage"` (NestJS optional lazy requires). `build.external`
  entries did NOT fix it — the CLI's externals collector requires the package to
  resolve locally (`isExternalResolvable` → `resolveSync` throws → external silently
  dropped) and these optional peers are not installed. Worked around with a custom
  BuildExtension registering a raw esbuild `onResolve` → `{ external: true }` plugin →
  **build OK** (`Local worker ready [node-22] -> 20260712.1`). Run 2 — ESM/CJS interop:
  `TypeError: Cannot read properties of undefined (reading 'createApplicationContext')`
  (`NestFactory` lands on `.default` after bundling, same interop as
  `trigger/lib/prisma.ts`); fixed with an interop-safe destructure → rebuilt
  `20260712.2`. Run 3 (`run_cmri1njh6000l35ozxuppn5ir`) — **boot failure inside the DI
  graph**: `TypeError: Cannot read properties of undefined (reading 'get')` at
  `new HttpExceptionFilter (src/common/filters/http-exception.filter.ts:51)` —
  `ConfigService` injected as `undefined`. Root cause: **esbuild does not emit
  `emitDecoratorMetadata`**, so `design:paramtypes` is stripped for every class in the
  bundle and Nest constructor-injection-by-type silently injects `undefined` graph-wide
  (the API normally builds with SWC, which does emit it). Not resolvable via
  `build.external`/`additionalPackages` — a compiler-capability gap, i.e. the story's
  "run errors on boot … cannot be resolved within ~30 min" KO criterion. → **Task 6 =
  branch 6B (in-process `setImmediate` yield).** Spike file + `client.ts` re-export
  deleted; `trigger.config.ts` experiments reverted (the esbuild-plugin finding above is
  the reusable knowledge if a future story re-attempts 6A — it would additionally need
  decorator-metadata support, e.g. `@anatine/esbuild-decorators`, or explicit `@Inject()`
  tokens everywhere). *Precision (aped-review):* the spike file, the `client.ts`
  re-export and the `trigger.config.ts` experiments only ever existed in the working
  tree — none was ever `git add`-ed; commit `9beffa5` records the verdict in this story
  doc only, so no spike code churn exists anywhere in git history.

- **2026-07-12 — Task 1 spike attempt (verbatim):** spike file + `client.ts` re-export created per story. `dotenv -- pnpm --filter @pawly/api exec trigger dev` failed: `X Error: You must login first. Use the \`login\` CLI command.` then `404 404 page not found`. Root causes investigated in order: (1) the CLI ignores `TRIGGER_API_URL`/`TRIGGER_ACCESS_TOKEN` env for `dev` — it requires an XDG profile (`~/Library/Preferences/trigger/config.json`), which had no profiles; (2) wrote the `default` profile from the root `.env` creds (non-interactive equivalent of `trigger login`), retried → `Whoami failed: 404 404 page not found`; (3) probed the instance directly: `curl https://trigger.dkp.trafijs.com/` → **404 on every endpoint including root** (traefik default backend — the self-hosted Trigger.dev webapp is down or detached from the router; URL confirmed correct against project memory `trigger_dev_setup` and identical in main checkout `.env`); (4) Trigger MCP also unauthenticated (same instance). **Verdict: UNRESOLVABLE HERE — infra outage, not a build/boot failure.** Posted `dev-blocked` check-in; Task 6 branch decision awaits Alex (restart the Dokploy trigger webapp → run spike → real verdict, or accept 6B fallback). Spike file left in working tree (uncommitted) so the run can happen the moment the instance is back. Unconditional Tasks 2–5 proceed meanwhile.

### Summary

All 7 tasks done. **AC1/AC3:** the per-`(employee, ISO-weekday)` rotation index is
seeded at the same three points as the FIX-4 counters (border, survivors,
per-assignment) plus a one-shot quarterly index; the three rotation-equity evaluators
(`violatesHardRotationEquity`, `countTargetDayShifts`, `checkRotationEquity`) are O(1)
lookups via `countFromDayIndex`. Stress benchmark (50 VETs, 24/7, 3 shift types, 31
days, 1 SOFT ROTATION_EQUITY rule on the hot path): **156–250 ms**, well under the 2 s
NFR2 budget. **AC2:** the Task-1 spike ran against the restarted self-hosted instance
and returned **KO** (esbuild strips `emitDecoratorMetadata` → Nest DI resolves
`undefined` graph-wide; full 3-run trace in Debug Log) → branch **6B**: the slot loop
yields to the event loop every 8 slots (`setImmediate`), pinned by an order-sensitive
test proving a concurrent macrotask is served mid-generation. Router and frontend
untouched — `generatePlan` still returns a synchronous `GenerationResult`.

### Files changed

- `apps/api/src/modules/planning/planning-generation.service.ts` — 4 index helpers (T2);
  index declaration + border/survivor/assignment seeding + quarterly build (T3);
  `scoreAndAssign` +2 params, 5 call sites, 3 evaluators rewritten O(1) (T4);
  `setImmediate` yield in the slot loop (T6B).
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` — `callScore`
  builds/appends the 2 indexes (T5a); `Story 11-10 — rotation-equity via O(1) day index`
  describe, 3 tests (T5b); stress benchmark (T7a); AC2 event-loop-yield order test (T6B).
- Spike artefacts (`_spike-nest-context.ts`, `client.ts` re-export, `trigger.config.ts`
  experiments) created then fully removed after the KO verdict — nothing ships.

### Deviations

- **Task-1 spike verdict:** **KO** — build only passed with a custom esbuild-plugin
  workaround, and the run then failed on boot: esbuild strips `emitDecoratorMetadata`,
  so Nest constructor injection resolves `undefined` graph-wide
  (`HttpExceptionFilter` ← `ConfigService`); unresolvable via
  `build.external`/`additionalPackages` — see Debug Log for the full 3-run trace.
  → Task 6 branch = **6B yield**.
- **Spike snippet fix:** under `moduleResolution: nodenext` the dynamic `import()` of
  relative paths requires the `.js` extension (ESM resolution) — the story's
  extension-less snippet fails `tsc` (TS2307). Added `.js` to both dynamic imports.
- **T5b HARD test corrected:** the story's single-employee version expected a hole, but
  the PRE-EXISTING rotation-equity relaxation fallback in `scoreAndAssign` ("Better to
  slightly exceed rotation limits than create holes") re-admits a blocked employee when
  the eligible pool is short — the expected hole contradicted shipped behaviour before
  AND after the index (equivalence itself holds). Rewritten as a two-employee exclusion
  pin; also made the SOFT-penalty test discriminating (a zeroed index flips all 3 tests
  RED — verified by deliberately breaking `countFromDayIndex` then restoring).
- **T7a benchmark strengthened:** (a) `mockClinicService.listShiftTypes` override added —
  `expandTemplateToMonth` resolves slot times from the shiftTypeMap, so the story's
  snippet generated 0 slots; (b) one SOFT ROTATION_EQUITY rule added — the pre-index
  O(E×A) re-scan only ran when such a rule existed, so a rule-less benchmark could never
  catch a regression back to it.
- **T6B test added (not in story):** the story shipped 6B with "the yield changes
  nothing observable" as its only gate. Added an order-sensitive AC2 pin: a pending
  `setImmediate` macrotask must run BEFORE the persistence tx (with mocked prisma the
  pre-loop awaits are pure microtasks, so only a genuine yield lets it through).
  Witnessed RED (order `['tx','immediate']`) before implementing the yield.

### Test output

- T5 RED witness: 4 tests failed (`TypeError: Cannot read properties of undefined
  (reading 'get')` at `countFromDayIndex`, via `callScore` pre-extension) — proves the
  rotation tests exercise the index path. Deliberate-break check: index zeroed → the 3
  T5b tests RED; restored → GREEN.
- T6B RED witness: yield test failed (`Expected: "immediate", Received: "tx"`) → GREEN
  after the yield landed.
- Focused suite: **168/168** (163 baseline + 3 equivalence + 1 benchmark + 1 AC2 yield).
- Full suites (7b gate): API **34 suites / 935 tests** green; web **756** green;
  validators **777** green; `pnpm build` **5/5 tasks successful**.
- Deploy typecheck `tsc -p tsconfig.types.json`: exit 0. Full `tsc -p tsconfig.json`:
  the 24 pre-existing errors documented by 11-6 (4 unrelated spec files), 0 in story files.
- Benchmark: `[11-10] stress 50-emp/24-7/31d generation core: 250ms` first run, `156ms`
  with the 6B yield in place (< 2000 ms).

## Review Record

**Date:** 2026-07-12
**Auditors:** Spec, Code, Edge & Hallucination (no Aria — backend-only surface)
**Verdict:** done

All three auditors returned APPROVED / confidence HIGH. Production code confirmed correct
independently: the rotation index is seeded at exactly the three mutation points of
`allShiftsForScoring` (border / survivors / per-assignment, no other push/splice exists),
the relaxation fallback flows through the normal assignment path (no double-count), the
`setImmediate` yield sits entirely before the persistence `$transaction` and all mutable
generation state is method-local (concurrency-safe), and every boundary path of the three
rewritten evaluators is behaviourally identical to the old scan (early-exit order included).
Spike artefacts fully absent from the diff; branch 6A correctly not shipped (spike KO).

### Findings

#### Resolved
- [MINOR] Dev Notes over-claimed "the pre-existing rotation tests staying green IS the
  equivalence proof" — 2 of the named ROTATION_EQUITY tests stay green even with a
  sabotaged index (fixture tiebreak confound predating this story: the "should-lose"
  employee holds the only prior shifts, so the fewer-shifts tiebreak alone reproduces the
  expected winner). [apps/api/src/modules/planning/planning-generation.service.spec.ts:2299-2368, :3032-3095]
  - Source: Spec
  - Resolution: `4e98965` — Testing bullet scoped to the discriminating tests (3 T5b +
    2 pre-existing, all 5 verified RED under a sabotaged `countFromDayIndex`, GREEN restored).
- [NIT] Commit `9beffa5` ("spike(KON-127): verdict…") implies spike code churn, but the
  spike never entered git history (working-tree only; verified: no spike file at any
  commit, `client.ts` / `trigger.config.ts` byte-identical to develop).
  - Source: Spec
  - Resolution: `4e98965` — Debug Log now states explicitly the spike artefacts were
    never `git add`-ed; `9beffa5` touches only the story doc.

#### Dismissed
(none)

#### Informational (no action required)
- Edge: fresh-worktree Jest transform cache produced 5 false-negative failures on its
  first run; after `jest --clearCache`, 5 consecutive full runs = 168/168 green. Not a
  code defect (CI always starts on a cold cache).
- Edge: a generation with < 8 slots never yields (`++slotsSinceYield % 8` — yields on
  slots 8/16/24…). Accepted by design: the O(1) index is the real perf fix; the yield
  targets 50-employee months (≫ 8 slots) and a < 8-slot generation runs in ~1 ms.

### Verification
- Test command: `pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec"`
- Test output (final pass, post-fix Lead re-run): **168/168 passed, exit 0**. Full API
  suite re-run live by the Spec auditor: **34 suites / 935 tests green** (exact match to
  the Dev Agent Record claim). Fresh stress benchmark: `[11-10] stress 50-emp/24-7/31d
  generation core: 175ms` (< 2000 ms NFR2 budget). Deploy typecheck
  `tsc -p tsconfig.types.json`: exit 0 (L5). Full `tsc -p tsconfig.json`: the 24
  pre-existing errors in 4 unrelated spec files, 0 in story files.
- Sabotage witnesses: `countFromDayIndex` forced to 0 → the 3 T5b tests RED (+2
  discriminating pre-existing); yield condition forced false → AC2 order test RED
  (`order[0]` flips 'immediate'→'tx'). Both restored GREEN.
- Visual verification: n/a — backend-only surface, Aria not dispatched.
- Git audit: diff vs develop = exactly the story's File List (2 production files) +
  APED bookkeeping (`docs/state.yaml`, story doc). Nothing out of scope.

### Ticket sync
- Ticket comment posted: KON-127 (Linear)
- PR opened/updated: see check-in / Lead merge
