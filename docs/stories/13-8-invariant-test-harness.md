# Story: 13-8-invariant-test-harness — Invariant Test Harness (Property-Based + End-to-End)

**Epic:** Epic 13 — Planning Integrity & Solver Fidelity
**Status:** ready-for-dev
**Branch:** feature/KON-138-13-8-invariant-test-harness
**Ticket:** KON-138 (Linear · project Pawly · blocked by KON-132 [13-3, done], KON-136 [13-4, done], KON-137 [13-6, done]) — Wave 4, the final Epic 13 story.
**Origin:** Audit finding T12 (2026-07-14) — `docs/triage-decision.md`. The three fix waves added per-guard unit tests with their stories; T12 asks for the *systemic* net: property-based invariants over randomized inputs + one true router→service→solver→replay→transaction integration test, closing the router/service mock split.

> **Read first:** `docs/epics-context/epic-13-context.md` — §3 cross-cutting invariants this story LOCKS: **1** (improve-never-degrade), **2** (determinism), **3** (survivor immutability), **4** (statutory rules non-disableable); §4 anchor map row 13-8.
>
> **This is a TEST-ONLY story. Zero production code changes are expected.** It writes tests + one dependency (`fast-check`) + one build-exclude line + one reference doc. It *locks* the guarantees built in 13-1…13-6; it does not re-implement them.
>
> **Load-bearing rule (locked with Alex).** If a property surfaces a **genuine** engine violation (a real bug, not a fixture defect), **STOP and report it** — open a follow-up (candidate `aped-debug`) and leave the failing property in place (or `.failing`-annotated). Do **NOT** patch the engine inside this harness story. This harness is precisely the safety net that hand-picked unit fixtures do not provide (retro lesson **L2**).
>
> **Key discovery that shapes the design (verified in code at story time).** In the test harness, `PlanningService` is a **mock**, so on the **cpsat** served path `result.violations.hard` comes from the *mocked* `validateShiftsAgainstRules` (`planning-generation.service.ts:1009-1049`) — asserting on it directly would be **vacuous for cpsat**. Therefore **P1 re-evaluates the served plan independently** with the real pure evaluator `findStatutoryViolations` (`french-labor-law.ts:273`) over `result.assignments + survivors` — engine-agnostic, never trusting the SUT's self-report. (The greedy path's `result.violations.hard` IS the real accumulation `:639-640` and is asserted too, as belt-and-suspenders.)
>
> **Scope decisions (locked with Alex at story time — GO):**
> 1. **Survivors are legal-by-construction** — one ≤6h (`SURGERY` 08:00-12:00) survivor per employee on a single early day → trivially satisfies every statutory rule regardless of the sampled configurable rules, so the whole served plan stays clean. Still exercises survivor immutability + cpsat×survivors.
> 2. **Shared harness lives in `planning-harness.testutil.ts`** (NOT a `.spec.ts`, so Jest never runs it as an empty suite; excluded from the SWC build so its dev-only imports never reach `dist/`).
> 3. **Bounded instances** — ≤5 employees, a 2-entry non-overlapping shift-type menu (each 4h), 1-3 workdays/week over the fixed month `2026-03` (≈4-13 working days). `numRuns` follow the `CI / TURBO_HASH / local` ladder. The full 31-day month is exercised only by the single AC-2 integration test.
> 4. **Doc lives at `docs/reference/planning-invariant-harness.md`** (APED-allowlisted, next to `planning-algorithm-reference.md`).

## User Story

**As a** maintainer, **I want** property-based invariants and one true end-to-end integration test, **so that** the engine's safety guarantees hold across the input space instead of on hand-picked fixtures.

## Acceptance Criteria

1. **Given** randomized fixtures (property-based generation of employees, template slots, rules, unavailabilities, and survivors), **When** the invariant suite runs schedule generation over them, **Then** three properties hold for both the greedy engine and the exact engine:
   - **P1 (safety)** — no served schedule introduces a statutory violation, verified by an independent re-evaluation of the served shifts rather than the engine's self-reported violations.
   - **P2 (improve-never-degrade)** — the exact engine never fills fewer slots, nor leaves more holes, than greedy for the same input.
   - **P3 (determinism)** — generating the same input twice with the same engine yields identical output.
2. **Given** one end-to-end integration test that drives the real generation request path — the tRPC generation endpoint through the real generation service and the real solver into the database write transaction — for an exact-engine request, **When** it runs, **Then** it asserts the solver was actually invoked, the write transaction executed, the served schedule is statutory-clean, and a valid solver outcome is reported — closing the gap where endpoint tests mock the service and service tests never exercise the endpoint.
3. **Given** a CI run, **When** the property suite executes, **Then** its number of randomized runs is bounded by the project's CI/turbo/local budget ladder with per-test timeouts, and a reference document explains how to add new invariants for future engine work.

## Tasks

- [ ] **Task 1 — Add `fast-check` dev dependency + exclude the harness helper from the build** [AC: 3]

  `fast-check@3.23.2` is already resolved transitively in `pnpm-lock.yaml`; make it a direct devDependency of `@pawly/api`. In `apps/api/package.json`, inside the `devDependencies` block, add the line (keep alphabetical order — it sits between `eslint-plugin-prettier` and `globals`):

  ```jsonc
    "eslint-plugin-prettier": "^5.2.2",
    "fast-check": "^3.23.2",
    "globals": "^16.0.0",
  ```

  Then, so the shared `*.testutil.ts` helper (which imports `fast-check` and `@nestjs/testing`, both dev-only) is never transpiled into `dist/`, add `"**/*.testutil.ts"` to the exclude array in `apps/api/tsconfig.build.json`:

  ```json
  {
    "extends": "./tsconfig.json",
    "exclude": ["node_modules", "test", "dist", "**/*spec.ts", "**/*.testutil.ts"]
  }
  ```

  Install from the repo root (never `cd apps/`), then verify `fast-check` resolves:

  ```bash
  pnpm install
  ```

  Run: `pnpm --filter @pawly/api exec node -e "console.log(require.resolve('fast-check'))"`
  Expected: prints a path ending in `…/node_modules/fast-check/lib/fast-check.js` (or similar), exit 0.
  Commit: `git add apps/api/package.json apps/api/tsconfig.build.json pnpm-lock.yaml && git commit -m "chore(KON-138): add fast-check devDep + exclude harness testutil from build"`

- [ ] **Task 2 — Shared harness (`planning-harness.testutil.ts`) + property spec with P3 (determinism)** [AC: 1, 3]

  This is the foundational task: the harness must run the **real** `generateMonthlyPlan` (real `SolverEngineService`) end-to-end against a randomized fixture. It mirrors the proven mock scaffold in `planning-generation.service.spec.ts:165-293` (verbatim below in Dev Notes) and adds fast-check arbitraries + a fixture→mock mapper.

  **2a.** Create `apps/api/src/modules/planning/planning-harness.testutil.ts`:

  ```ts
  // Shared property/integration harness for the planning engine (Story 13-8, KON-138).
  // NOT a *.spec.ts — Jest never runs it as a suite; excluded from the SWC build
  // (tsconfig.build.json) so its dev-only imports never reach dist/.
  import { Test, TestingModule } from '@nestjs/testing';
  import fc from 'fast-check';
  import { PlanningGenerationService } from './planning-generation.service';
  import { SolverEngineService } from './solver-engine.service';
  import { PlanningService } from './planning.service';
  import { PlanningTemplateService } from './planning-template.service';
  import { EquityCounterService } from './equity-counter.service';
  import { ApprenticeDeclarationService } from './apprentice-declaration.service';
  import { PrismaService } from '@/prisma/prisma.service';
  import { ClinicService } from '@/modules/clinic/clinic.service';
  import { MailService } from '@/modules/mail/mail.service';
  import { PushNotificationService } from '@/modules/notification/push-notification.service';
  import type { TemplateData } from '@pawly/validators';

  export const HARNESS_CLINIC_ID = 'clinic-123';
  export const HARNESS_MONTH = '2026-03';
  export const HARNESS_TEMPLATE_ID = 'tpl-harness';

  // Non-overlapping 4h shift-type menu: an employee may hold both on one day (8h < 10h,
  // no overlap) without ever tripping a statutory limit. Kept ≤6h so MANDATORY_BREAK
  // (>6h net) never applies and breakMinutes stays 0.
  const SHIFT_TYPE_MENU = [
    { id: 'st-surgery', code: 'SURGERY', name: 'Surgery', startTime: '08:00', endTime: '12:00', color: '#4f46e5', clinicId: HARNESS_CLINIC_ID },
    { id: 'st-care', code: 'CARE', name: 'Care', startTime: '14:00', endTime: '18:00', color: '#f59e0b', clinicId: HARNESS_CLINIC_ID },
  ] as const;

  const WORKDAY_NAMES = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const;
  const DOW_INDEX: Record<(typeof WORKDAY_NAMES)[number], number> = {
    MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5,
  };

  export type PlanningFixture = {
    month: string;
    templateId: string;
    operationalConfig: {
      workDays: string[];
      defaultStartTime: string;
      defaultEndTime: string;
      closedDays: Array<{ id: string; date: string; reason: string | null }>;
      specialDays: Array<{ id: string; date: string; startTime: string; endTime: string; label: string | null }>;
    };
    shiftTypes: Array<(typeof SHIFT_TYPE_MENU)[number]>;
    template: TemplateData;
    employees: Array<{ id: string; firstName: string; lastName: string; jobType: string; contractHours: number }>;
    rules: unknown[];
    unavailabilities: unknown[];
    survivors: Array<{
      id: string; clinicId: string; employeeId: string; date: Date;
      startTime: string; endTime: string; shiftTypeCode: string; breakMinutes: number;
      source: string; isConfirmed: boolean; planningTemplateId: string | null; varianceEvents: unknown[];
    }>;
  };

  // ── fast-check arbitraries ────────────────────────────────────────────────
  const employeesArb = fc
    .integer({ min: 1, max: 5 })
    .chain((n) =>
      fc.tuple(
        ...Array.from({ length: n }, (_, i) =>
          fc.record({
            jobType: fc.constantFrom('VET', 'ASV'),
            contractHours: fc.constantFrom(20, 35),
          }).map((r) => ({
            id: `emp-${i + 1}`,
            firstName: `E${i + 1}`,
            lastName: 'Test',
            jobType: r.jobType,
            contractHours: r.contractHours,
          })),
        ),
      ),
    );

  // 1-3 workdays; each drives a template day with 1-2 slots referencing the menu.
  const workdaysArb = fc
    .subarray([...WORKDAY_NAMES], { minLength: 1, maxLength: 3 })
    .filter((d) => d.length > 0);

  const requiredStaffArb = fc.integer({ min: 1, max: 2 });

  export const planningFixtureArb: fc.Arbitrary<PlanningFixture> = fc
    .record({
      employees: employeesArb,
      shiftTypes: fc.subarray([...SHIFT_TYPE_MENU], { minLength: 1, maxLength: 2 }).filter((s) => s.length > 0),
      workDays: workdaysArb,
      // 0 or 1 legal survivor per employee (built after employees are known).
      survivorEmpCount: fc.integer({ min: 0, max: 2 }),
    })
    .chain((base) =>
      fc
        .tuple(
          ...base.workDays.map(() =>
            fc.subarray(base.shiftTypes.map((s) => s.code), { minLength: 1, maxLength: 2 }).filter((c) => c.length > 0),
          ),
        )
        .map((slotCodesPerDay) => {
          const days: TemplateData['days'] = base.workDays.map((dayName, i) => ({
            dayOfWeek: DOW_INDEX[dayName as (typeof WORKDAY_NAMES)[number]],
            slots: slotCodesPerDay[i].map((code) => ({ shiftTypeCode: code, requiredStaff: 1 })),
          }));
          // Legal-by-construction survivors: one 4h SURGERY on 2026-03-02 (Monday),
          // ≤6h, single day → satisfies every statutory rule. distinct employees.
          const survivorEmps = base.employees.slice(0, Math.min(base.survivorEmpCount, base.employees.length));
          const survivors = survivorEmps.map((e, i) => ({
            id: `surv-${i}`,
            clinicId: HARNESS_CLINIC_ID,
            employeeId: e.id,
            date: new Date('2026-03-02T00:00:00.000Z'),
            startTime: '08:00',
            endTime: '12:00',
            shiftTypeCode: 'SURGERY',
            breakMinutes: 0,
            source: 'MANUAL',
            isConfirmed: true,
            planningTemplateId: null,
            varianceEvents: [] as unknown[],
          }));
          return {
            month: HARNESS_MONTH,
            templateId: HARNESS_TEMPLATE_ID,
            operationalConfig: {
              workDays: base.workDays,
              defaultStartTime: '08:00',
              defaultEndTime: '18:00',
              closedDays: [],
              specialDays: [],
            },
            shiftTypes: base.shiftTypes,
            template: { days },
            employees: base.employees,
            rules: [], // configurable rules kept empty: P1 targets the non-configurable statutory floor.
            unavailabilities: [],
            survivors,
          } satisfies PlanningFixture;
        }),
    );

  // ── Nest module: REAL generation service + REAL solver, mocked deps ────────
  export type GenerationHarness = {
    module: TestingModule;
    service: PlanningGenerationService;
    solverEngine: SolverEngineService;
    prisma: any;
    clinic: any;
    planning: any;
    template: any;
    equity: any;
    apprentice: any;
  };

  export async function createGenerationHarness(): Promise<GenerationHarness> {
    const prisma = {
      employee: { findMany: jest.fn(), findFirst: jest.fn() },
      unavailability: { findMany: jest.fn() },
      shift: {
        findMany: jest.fn(), findUnique: jest.fn(), createManyAndReturn: jest.fn(),
        create: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(), count: jest.fn(),
      },
      clinicShiftType: { findFirst: jest.fn() },
      planningPeriodStatus: { upsert: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
      clinic: { findUniqueOrThrow: jest.fn() },
      $executeRaw: jest.fn().mockResolvedValue(0),
      $transaction: jest.fn(),
    };
    const clinic = { getOperationalConfig: jest.fn(), listShiftTypes: jest.fn() };
    const planning = { listRules: jest.fn(), validateShiftsAgainstRules: jest.fn() };
    const template = { getTemplateById: jest.fn() };
    const equity = { getCountersForPeriod: jest.fn(), getCountersForWindow: jest.fn() };
    const apprentice = { getUndeclaredApprentices: jest.fn(), listForMonth: jest.fn(), upsertNoSchool: jest.fn(), deleteDeclaration: jest.fn() };
    const mail = { sendSchedulePublicationEmail: jest.fn(), sendBatchSchedulePublicationEmails: jest.fn().mockResolvedValue(0), sendScheduleChangedEmail: jest.fn().mockResolvedValue(true) };
    const push = { sendBatchPushNotifications: jest.fn().mockResolvedValue(0) };

    const module = await Test.createTestingModule({
      providers: [
        PlanningGenerationService,
        SolverEngineService, // REAL solver adapter — tiny CP-SAT solves per run
        { provide: PrismaService, useValue: prisma },
        { provide: ClinicService, useValue: clinic },
        { provide: MailService, useValue: mail },
        { provide: PushNotificationService, useValue: push },
        { provide: PlanningService, useValue: planning },
        { provide: PlanningTemplateService, useValue: template },
        { provide: EquityCounterService, useValue: equity },
        { provide: ApprenticeDeclarationService, useValue: apprentice },
      ],
    }).compile();

    return {
      module,
      service: module.get(PlanningGenerationService),
      solverEngine: module.get(SolverEngineService),
      prisma, clinic, planning, template, equity, apprentice,
    };
  }

  // Wire every mock return from the sampled fixture. Call ONCE per generateMonthlyPlan
  // invocation (it resets call history so per-run assertions stay isolated).
  export function configureFixture(h: GenerationHarness, f: PlanningFixture): void {
    jest.clearAllMocks();
    h.clinic.getOperationalConfig.mockResolvedValue(f.operationalConfig);
    h.clinic.listShiftTypes.mockResolvedValue(f.shiftTypes);
    h.template.getTemplateById.mockResolvedValue(f.template);
    h.planning.listRules.mockResolvedValue(f.rules);
    // Mocked whole-schedule evaluator: cpsat served-plan recompute reads THIS. P1 does
    // NOT trust it — it re-evaluates independently — so returning "clean" here is safe;
    // the served cpsat plan is separately protected by the real replay gate.
    h.planning.validateShiftsAgainstRules.mockResolvedValue({ hardViolations: [], softViolations: [], rules: [] });
    h.equity.getCountersForPeriod.mockResolvedValue([]);
    h.equity.getCountersForWindow.mockResolvedValue([]);
    h.apprentice.getUndeclaredApprentices.mockResolvedValue([]);
    h.prisma.employee.findMany.mockResolvedValue(f.employees);
    h.prisma.unavailability.findMany.mockResolvedValue(f.unavailabilities);
    // shift.findMany is shared: survivors (where.OR), statutory context (where.date.gte/lte),
    // border-week (where.date.in). Only survivors return rows here.
    h.prisma.shift.findMany.mockImplementation((args: any) => {
      if (args?.where?.OR) return Promise.resolve(f.survivors);
      return Promise.resolve([]);
    });
    h.prisma.shift.deleteMany.mockResolvedValue({ count: 0 });
    h.prisma.planningPeriodStatus.findMany.mockResolvedValue([]);
    h.prisma.planningPeriodStatus.updateMany.mockResolvedValue({ count: 0 });
    h.prisma.$executeRaw.mockResolvedValue(0);
    // Bespoke tx: echo createManyAndReturn so result.assignments reflects what the
    // generator actually decided to persist (a flat [] would make assignments vacuous).
    h.prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(0),
        shift: {
          findMany: jest.fn().mockResolvedValue([]),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          createManyAndReturn: jest.fn().mockImplementation((a: any) =>
            Promise.resolve((a?.data ?? []).map((d: any, i: number) => ({ ...d, id: `gen-${i}` }))),
          ),
        },
        planningPeriodStatus: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      };
      return fn(tx);
    });
  }

  // A deterministic fixture aimed at exercising a full cpsat solve (AC-2). Full 31-day
  // month, 3 employees, both shift types on Mon-Fri. Whether cpsat is SERVED or falls
  // back, the router→service→solver→replay→transaction path executes end-to-end.
  export function buildServedCpsatFixture(): PlanningFixture {
    const employees = [
      { id: 'emp-1', firstName: 'A', lastName: 'T', jobType: 'VET', contractHours: 35 },
      { id: 'emp-2', firstName: 'B', lastName: 'T', jobType: 'ASV', contractHours: 35 },
      { id: 'emp-3', firstName: 'C', lastName: 'T', jobType: 'VET', contractHours: 35 },
    ];
    const days: TemplateData['days'] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      slots: [
        { shiftTypeCode: 'SURGERY', requiredStaff: 1 },
        { shiftTypeCode: 'CARE', requiredStaff: 1 },
      ],
    }));
    return {
      month: HARNESS_MONTH,
      templateId: HARNESS_TEMPLATE_ID,
      operationalConfig: {
        workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        defaultStartTime: '08:00', defaultEndTime: '18:00', closedDays: [], specialDays: [],
      },
      shiftTypes: [...SHIFT_TYPE_MENU],
      template: { days },
      employees,
      rules: [],
      unavailabilities: [],
      survivors: [],
    };
  }
  ```

  > **CONFIRM SHAPES at first RED.** Two Prisma row shapes are best-effort and must match the real models — verify against `apps/api/prisma/schema/` and the engine's read sites, adjusting fields if the service reads more:
  > - **survivor rows** (returned by `shift.findMany` `where.OR`): the engine reads `date`/`startTime`/`endTime`/`shiftTypeCode`/`employeeId`/`breakMinutes`. Compare with a survivor fixture in `planning-generation.service.spec.ts` (search `source: 'MANUAL'`).
  > - **unavailability rows** (`unavailability.findMany`): kept `[]` in the arbitrary above. Once the harness is green, extend `planningFixtureArb` with 0-2 unavailabilities using the real `Unavailability` shape and confirm the engine excludes those employee-days.

  **2b.** Create `apps/api/src/modules/planning/planning-invariants.property.spec.ts` with the determinism property (P3):

  ```ts
  // Story 13-8 (KON-138) — property-based invariants over randomized planning inputs.
  jest.mock('@/trigger/client', () => ({
    batchEmailPublishTask: { trigger: jest.fn().mockResolvedValue({ id: 'mock' }) },
    batchPushPublishTask: { trigger: jest.fn().mockResolvedValue({ id: 'mock' }) },
    sendEmailTask: { trigger: jest.fn().mockResolvedValue({ id: 'mock' }) },
  }));

  import fc from 'fast-check';
  import { findStatutoryViolations, type StatutoryShift } from './french-labor-law';
  import {
    createGenerationHarness,
    configureFixture,
    planningFixtureArb,
    HARNESS_CLINIC_ID,
    type GenerationHarness,
  } from './planning-harness.testutil';

  // CI-aware run ladder (NFR2 budget pattern — bounded shrinking/runs).
  const NUM_RUNS_DET = process.env.CI ? 15 : 40;

  describe('Planning engine invariants (Story 13-8, KON-138)', () => {
    let harness: GenerationHarness;
    beforeAll(async () => {
      harness = await createGenerationHarness();
    });

    it('P3 — same input twice yields deep-equal output (greedy & cpsat)', async () => {
      await fc.assert(
        fc.asyncProperty(planningFixtureArb, async (f) => {
          for (const engine of ['greedy', 'cpsat'] as const) {
            configureFixture(harness, f);
            const run1 = await harness.service.generateMonthlyPlan(HARNESS_CLINIC_ID, f.month, f.templateId, { engine });
            configureFixture(harness, f);
            const run2 = await harness.service.generateMonthlyPlan(HARNESS_CLINIC_ID, f.month, f.templateId, { engine });
            expect(run2).toEqual(run1);
          }
        }),
        { numRuns: NUM_RUNS_DET, endOnFailure: true },
      );
    }, 180000);
  });
  ```

  Run: `pnpm --filter @pawly/api test src/modules/planning/planning-invariants.property.spec.ts`
  Expected: `✓ P3 — same input twice yields deep-equal output (greedy & cpsat)`, `Tests: 1 passed`, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-harness.testutil.ts apps/api/src/modules/planning/planning-invariants.property.spec.ts && git commit -m "test(KON-138): property harness + determinism invariant (P3)"`

- [ ] **Task 3 — Add P1 (statutory safety) to the property spec** [AC: 1]

  Add this `it` inside the same `describe` in `planning-invariants.property.spec.ts` (after P3). It independently re-evaluates the served plan — generated assignments are ≤6h with no break (menu is 4h), so `breakMinutes: 0` is exact:

  ```ts
    const NUM_RUNS_SAFETY = process.env.CI ? 25 : 100;

    it('P1 — no served plan introduces a statutory violation (greedy & cpsat)', async () => {
      const isoDate = (d: unknown): string =>
        d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);

      await fc.assert(
        fc.asyncProperty(planningFixtureArb, async (f) => {
          for (const engine of ['greedy', 'cpsat'] as const) {
            configureFixture(harness, f);
            const result = await harness.service.generateMonthlyPlan(HARNESS_CLINIC_ID, f.month, f.templateId, { engine });

            // Independent re-evaluation of the SERVED plan (generated + legal survivors),
            // per employee — never trusts result.violations.hard (mocked on cpsat).
            const byEmployee = new Map<string, StatutoryShift[]>();
            const add = (empId: string, s: StatutoryShift) => {
              const list = byEmployee.get(empId) ?? [];
              list.push(s);
              byEmployee.set(empId, list);
            };
            for (const a of result.assignments) {
              add(a.employeeId, { date: isoDate(a.date), startTime: a.startTime, endTime: a.endTime, breakMinutes: 0 });
            }
            for (const s of f.survivors) {
              add(s.employeeId, { date: isoDate(s.date), startTime: s.startTime, endTime: s.endTime, breakMinutes: s.breakMinutes });
            }
            for (const [, shifts] of byEmployee) {
              expect(findStatutoryViolations(shifts)).toEqual([]);
            }

            // Belt-and-suspenders: greedy's own accumulated hard array is the real
            // evaluation (not mocked) and must be clean.
            if (engine === 'greedy') {
              expect(result.violations.hard).toEqual([]);
            }
          }
        }),
        { numRuns: NUM_RUNS_SAFETY, endOnFailure: true },
      );
    }, 180000);
  ```

  Run: `pnpm --filter @pawly/api test src/modules/planning/planning-invariants.property.spec.ts`
  Expected: `✓ P1 — no served plan introduces a statutory violation (greedy & cpsat)`, `Tests: 2 passed`, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-invariants.property.spec.ts && git commit -m "test(KON-138): statutory-safety invariant (P1)"`

- [ ] **Task 4 — Add P2 (improve-never-degrade) to the property spec** [AC: 1]

  Add this `it` inside the same `describe` (after P1). cpsat is served only when strictly better, else greedy is served — so cpsat fill can never drop below greedy, and holes never increase:

  ```ts
    const NUM_RUNS_CPSAT = process.env.CI ? 8 : 20;

    it('P2 — cpsat never degrades greedy (fill dominates, holes non-increasing)', async () => {
      await fc.assert(
        fc.asyncProperty(planningFixtureArb, async (f) => {
          configureFixture(harness, f);
          const greedy = await harness.service.generateMonthlyPlan(HARNESS_CLINIC_ID, f.month, f.templateId, { engine: 'greedy' });
          configureFixture(harness, f);
          const cpsat = await harness.service.generateMonthlyPlan(HARNESS_CLINIC_ID, f.month, f.templateId, { engine: 'cpsat' });

          expect(cpsat.stats.filledSlots).toBeGreaterThanOrEqual(greedy.stats.filledSlots);
          expect(cpsat.stats.holeCount).toBeLessThanOrEqual(greedy.stats.holeCount);
        }),
        { numRuns: NUM_RUNS_CPSAT, endOnFailure: true },
      );
    }, 180000);
  ```

  Run: `pnpm --filter @pawly/api test src/modules/planning/planning-invariants.property.spec.ts`
  Expected: `✓ P2 — cpsat never degrades greedy (fill dominates, holes non-increasing)`, `Tests: 3 passed`, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-invariants.property.spec.ts && git commit -m "test(KON-138): improve-never-degrade invariant (P2)"`

- [ ] **Task 5 — Integration test: real tRPC caller → real service → real solver → replay → transaction** [AC: 2]

  Create `apps/api/src/modules/planning/planning-generation.integration.spec.ts`. It mounts the real `planningRouter` via `createCallerFactory`, injects the **real** `PlanningGenerationService` (built by the harness, with the **real** `SolverEngineService`) into the caller context, and drives `generatePlan({ engine: 'cpsat' })` through the whole path:

  ```ts
  // Story 13-8 (KON-138) — AC-2: the ONE end-to-end path that closes the router/service
  // mock split. Real router (createCallerFactory) + real PlanningGenerationService +
  // real SolverEngineService; only Prisma/peripheral services are mocked.
  jest.mock('@/trigger/client', () => ({
    batchEmailPublishTask: { trigger: jest.fn().mockResolvedValue({ id: 'mock' }) },
    batchPushPublishTask: { trigger: jest.fn().mockResolvedValue({ id: 'mock' }) },
    sendEmailTask: { trigger: jest.fn().mockResolvedValue({ id: 'mock' }) },
  }));

  import { createCallerFactory } from '@/trpc/trpc';
  import { planningRouter } from '@/trpc/routers/planning.router';
  import { solverOutcomeSchema } from '@pawly/validators';
  import {
    createGenerationHarness,
    configureFixture,
    buildServedCpsatFixture,
    HARNESS_CLINIC_ID,
    type GenerationHarness,
  } from './planning-harness.testutil';

  describe('generatePlan integration — real router→service→solver (Story 13-8, KON-138)', () => {
    let harness: GenerationHarness;
    beforeAll(async () => {
      harness = await createGenerationHarness();
    });

    it('drives cpsat generation through the tRPC caller into the transaction path', async () => {
      const fixture = buildServedCpsatFixture();
      configureFixture(harness, fixture);

      const solveSpy = jest.spyOn(harness.solverEngine, 'solve');
      const createCaller = createCallerFactory(planningRouter);
      const caller = createCaller({
        user: { sub: 'user-1', email: 'admin@clinic.fr', role: 'ADMIN', clinicId: HARNESS_CLINIC_ID },
        prisma: {
          subscription: {
            findUnique: jest.fn().mockResolvedValue({
              status: 'active', entitlementTier: 'professional',
              currentPeriodEnd: new Date('2026-12-31'), cancelAtPeriodEnd: false,
            }),
          },
        },
        redis: {
          get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn(),
          invalidatePattern: jest.fn(), incr: jest.fn().mockResolvedValue(1), isAvailable: false,
        },
        planningGenerationService: harness.service,
      } as any);

      const result = await caller.generatePlan({
        month: fixture.month,
        templateId: fixture.templateId,
        engine: 'cpsat',
      });

      // Real solver was invoked (cpsat path), transaction ran, served plan is clean,
      // and a valid solver outcome is reported (cpsat request → outcome present).
      expect(solveSpy).toHaveBeenCalled();
      expect(harness.prisma.$transaction).toHaveBeenCalled();
      expect(result.violations.hard).toEqual([]);
      expect(result.stats.engine === 'greedy' || result.stats.engine === 'cpsat').toBe(true);
      expect(solverOutcomeSchema.safeParse(result.stats.solverOutcome).success).toBe(true);
    }, 60000);
  });
  ```

  Run: `pnpm --filter @pawly/api test src/modules/planning/planning-generation.integration.spec.ts`
  Expected: `✓ drives cpsat generation through the tRPC caller into the transaction path`, `Tests: 1 passed`, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.integration.spec.ts && git commit -m "test(KON-138): end-to-end tRPC→service→solver integration (AC-2)"`

- [ ] **Task 6 — Reference doc for future engine work** [AC: 3]

  Create `docs/reference/planning-invariant-harness.md` with this content:

  ```markdown
  # Planning Invariant Harness (Story 13-8, KON-138)

  Property-based + end-to-end safety net for the planning engine. Locks the guarantees
  built across Epic 13 so they hold over the input space, not just hand-picked fixtures.

  ## Files

  - `apps/api/src/modules/planning/planning-harness.testutil.ts` — shared harness:
    `fast-check` arbitraries (`planningFixtureArb`), the Nest module builder
    (`createGenerationHarness` — REAL `PlanningGenerationService` + REAL
    `SolverEngineService`, mocked Prisma/peripherals), and `configureFixture`
    (maps a sampled fixture onto every mock). NOT a `*.spec.ts`; excluded from the
    SWC build via `tsconfig.build.json`.
  - `apps/api/src/modules/planning/planning-invariants.property.spec.ts` — the three
    properties: **P1** statutory safety (independent re-evaluation via
    `findStatutoryViolations`), **P2** improve-never-degrade, **P3** determinism.
  - `apps/api/src/modules/planning/planning-generation.integration.spec.ts` — the one
    tRPC `generatePlan({ engine: 'cpsat' })` path through the real router → service →
    solver → replay → `$transaction`.

  ## Running

  ```bash
  pnpm --filter @pawly/api test src/modules/planning/planning-invariants.property.spec.ts
  pnpm --filter @pawly/api test src/modules/planning/planning-generation.integration.spec.ts
  ```

  ## CI budget

  `numRuns` follow the ladder `process.env.CI ? … : process.env.TURBO_HASH ? … : …`
  (fewer runs on shared/parallel runners) with per-`it` timeouts, mirroring the NFR2
  budget pattern in `planning-generation.service.spec.ts`.

  ## Adding a new invariant

  1. Extend `planningFixtureArb` if the invariant needs new input dimensions (keep
     survivors legal-by-construction so the served plan stays clean).
  2. Add an `it(...)` that runs `generateMonthlyPlan` via the harness and asserts the
     property. Prefer **independent** re-evaluation (pure evaluators like
     `findStatutoryViolations`) over the SUT's self-reported arrays — on the cpsat path
     `validateShiftsAgainstRules` is mocked.
  3. Pick `numRuns` from the CI ladder; cpsat properties run the real solver, so keep
     their run counts low.

  ## Load-bearing rule

  A property that surfaces a genuine engine violation is a **bug report**, not a test to
  relax. Open a follow-up; do not patch the engine to make the property pass.
  ```

  Run: `test -f docs/reference/planning-invariant-harness.md && echo OK`
  Expected: `OK`, exit 0.
  Commit: `git add docs/reference/planning-invariant-harness.md && git commit -m "docs(KON-138): planning invariant harness reference"`

- [ ] **Task 7 — Regression: full planning suite + validators stay green** [AC: 1, 2, 3]

  Confirm nothing existing broke and the new specs pass alongside the suite.

  Run: `pnpm --filter @pawly/api test src/modules/planning`
  Expected: all planning specs pass (existing + the two new files), `Test Suites:` all passed, `Tests:` 0 failed, exit 0.

  Then the validators package (unchanged, sanity):
  Run: `pnpm --filter @pawly/validators test`
  Expected: all pass, exit 0.

  Commit: nothing new to commit if the prior tasks committed cleanly. If lint/format touched files, `git add -p` the intended changes and `git commit -m "chore(KON-138): tidy invariant harness"`.

## Dev Notes

- **Architecture:** Pure test-harness story. It observes the existing generation chain; it does not change it. The chain (verified at story time): tRPC `generatePlan` mutation (`apps/api/src/trpc/routers/planning.router.ts:257`, `subscribedProcedure`) → `adminOnly(ctx.user.role)` + `if (input.engine === 'cpsat') requireProfessional(ctx.subscription.entitlementTier)` → `ctx.planningGenerationService.generateMonthlyPlan(ctx.user.clinicId, input.month, input.templateId, { acknowledgePublishedChange, engine })` (cache invalidation in `finally`).
- **Entry point signature** — `planning-generation.service.ts:229`:
  ```ts
  async generateMonthlyPlan(
    clinicId: string,
    month: string,
    templateId: string,
    options: {
      acknowledgePublishedChange?: boolean;
      enableRepair?: boolean;
      engine?: 'greedy' | 'cpsat';
    } = {},
  ): Promise<GenerationResult>
  ```
- **Result shape** (`packages/validators/src/planning/planning-generation.schema.ts:134`) — assert against the REAL field names, not the guesses in the ticket:
  ```ts
  // GenerationResult
  { assignments, holes, violations: { hard, soft }, stats }
  // stats: { totalSlots, filledSlots, holeCount, hardViolationCount, softWarningCount, engine, solverOutcome? }
  // assignments[]: { id, date, startTime, endTime, shiftTypeCode, employeeId, employeeName }  ← no breakMinutes
  ```
  There is NO top-level `hardViolations` / `softViolations` / `solverOutcome`. `solverOutcome` lives on `stats`, spread conditionally (present only when cpsat was requested).
- **Solver** (`solver-engine.service.ts:74`) — `async solve(model, options): Promise<SolveResult>`, `SolveResult { status: 'OPTIMAL'|'FEASIBLE'|'INFEASIBLE'|'UNKNOWN'|'ENGINE_UNAVAILABLE'; chosenVarNames }`. Seeded `RANDOM_SEED = 129`, `numWorkers = 1` → determinism (P3-cpsat). No constructor deps; tests instantiate via the Nest module (harness) or `new SolverEngineService()`.
- **Existing mock scaffold to mirror** — `planning-generation.service.spec.ts:165-293` (verbatim, current at story time). This is the source of truth for every mock's method surface + default returns the harness reproduces:
  ```ts
  const mockClinicService = { getOperationalConfig: jest.fn(), listShiftTypes: jest.fn() };
  const mockPlanningService = { listRules: jest.fn(), validateShiftsAgainstRules: jest.fn() };
  const mockTemplateService = { getTemplateById: jest.fn() };
  const mockEquityService = { getCountersForPeriod: jest.fn(), getCountersForWindow: jest.fn() };
  // beforeEach defaults:
  mockClinicService.getOperationalConfig.mockResolvedValue(mockOperationalConfig);
  mockClinicService.listShiftTypes.mockResolvedValue(mockShiftTypes);
  mockPlanningService.listRules.mockResolvedValue([]);
  mockEquityService.getCountersForPeriod.mockResolvedValue([]);
  mockEquityService.getCountersForWindow.mockResolvedValue([]);
  mockPrismaService.unavailability.findMany.mockResolvedValue([]);
  mockPrismaService.employee.findMany.mockResolvedValue(mockEmployees);
  mockPrismaService.shift.findMany.mockResolvedValue([]);
  mockPrismaService.shift.deleteMany.mockResolvedValue({ count: 0 });
  mockApprenticeDeclarationService.getUndeclaredApprentices.mockResolvedValue([]);
  mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);
  mockPrismaService.planningPeriodStatus.updateMany.mockResolvedValue({ count: 0 });
  mockPrismaService.$transaction.mockImplementation(async (fn) => fn(mockPrismaService));
  ```
- **Every property/integration spec MUST begin with** `jest.mock('@/trigger/client', …)` (the service imports `@/trigger/client`; the mock is copied from `planning-generation.service.spec.ts:1-11`). The `*.testutil.ts` helper is NOT a spec and cannot call `jest.mock` — so the mock lives at the top of each spec file, not in the helper.
- **Why P1 re-evaluates independently:** in the harness `PlanningService` is mocked, so on the cpsat served path `result.violations.hard` = the mocked `validateShiftsAgainstRules` return. Asserting on it would be vacuous for cpsat. P1 therefore rebuilds `StatutoryShift[]` from `result.assignments + survivors` and calls the real pure `findStatutoryViolations` (`french-labor-law.ts:273`, signature `findStatutoryViolations(shifts: StatutoryShift[], window?): StatutoryViolation[]`, `StatutoryShift = { date; startTime; endTime; breakMinutes? }`). Generated shifts are ≤6h (menu is 4h) so `breakMinutes: 0` is exact and `MANDATORY_BREAK` (>6h net) never spuriously fires.
- **Legal-by-construction survivors:** one `SURGERY` (08:00-12:00, 4h) survivor per employee on `2026-03-02`, single day → no `CONSECUTIVE_DAYS`, no rest deficit, <48h/week, ≤10h/day, no break required. This keeps the whole served plan statutory-clean under P1 regardless of the sampled inputs, while still exercising survivor immutability (invariant 3) and cpsat×survivors.
- **tRPC caller context** (integration test) — modelled on `planning.router.spec.ts:89-108`. `isSubscribed` reads `ctx.prisma.subscription.findUnique` (→ `entitlementTier: 'professional'`) and populates `ctx.subscription`; `generatePlan`'s `finally` calls `invalidateScheduleCaches(ctx.redis, …)`. The caller's `prisma` is only the subscription-lookup mock; the REAL generation service (with its own transactional Prisma mock) is injected as `planningGenerationService`.
- **Build safety (lesson L5):** `tsconfig.build.json` excludes `**/*spec.ts`; the shared helper is `*.testutil.ts` (not a spec), so it is added to that exclude to keep its `fast-check`/`@nestjs/testing` imports out of `dist/`. `tsconfig.types.json` only includes `src/trpc-types.ts`, whose import graph never reaches the helper — no change needed there.
- **Files:**
  - `apps/api/package.json` — add `fast-check` devDependency. *(modify)*
  - `apps/api/tsconfig.build.json` — exclude `**/*.testutil.ts`. *(modify)*
  - `apps/api/src/modules/planning/planning-harness.testutil.ts` — shared arbitraries + Nest harness + `configureFixture`; single responsibility: turn a randomized fixture into a runnable real-engine invocation. *(new)*
  - `apps/api/src/modules/planning/planning-invariants.property.spec.ts` — P1/P2/P3 properties. *(new)*
  - `apps/api/src/modules/planning/planning-generation.integration.spec.ts` — the one real tRPC→service→solver path. *(new)*
  - `docs/reference/planning-invariant-harness.md` — future-engine-work doc. *(new)*
- **Testing:** Jest (`*.spec.ts`, `ts-jest`, `testEnvironment: node`, `rootDir: src`; per-test timeout is the 3rd arg to `it`). Run a single spec with `pnpm --filter @pawly/api test <path>` (NEVER root `pnpm test` — it fans out `dotenv -- turbo run test` across every workspace). `fast-check` `numRuns` bounded by `process.env.CI ? … : process.env.TURBO_HASH ? … : …` (existing pattern at `planning-generation.service.spec.ts:2290`).
- **Dependencies:** `fast-check@^3.23.2` (new devDep, already in the lockfile transitively). Real `or-tools-wasm@0.9.1` loads via `process.getBuiltinModule('node:module').createRequire` inside `solver-engine.service.ts:44-68` (the only require ts-jest cannot shim — memory `esm-only-packages-jest-nest`); prod solver needs Node ≥ 22.12, else graceful greedy fallback.
- **Commit prefix:** `test(KON-138): …` for specs, `chore(KON-138): …` for tooling, `docs(KON-138): …` for the reference doc. Stage specific files — never `git add .`.

## File List

_Expected files (created/modified by this story):_

- `apps/api/package.json` *(modify)* — add `fast-check` devDependency.
- `apps/api/tsconfig.build.json` *(modify)* — exclude `**/*.testutil.ts` from the SWC build.
- `apps/api/src/modules/planning/planning-harness.testutil.ts` *(new)* — shared arbitraries + Nest harness + `configureFixture`.
- `apps/api/src/modules/planning/planning-invariants.property.spec.ts` *(new)* — P1/P2/P3 properties.
- `apps/api/src/modules/planning/planning-generation.integration.spec.ts` *(new)* — real tRPC→service→solver path.
- `docs/reference/planning-invariant-harness.md` *(new)* — future-engine-work reference.

## Dev Agent Record

- **Model:**
- **Started:**
- **Completed:**

### Summary

_(filled by aped-dev at completion)_

### Files changed

### Deviations

### Test output
