# Epic 13 — Context Cache

> Loaded automatically by `aped-dev` / `aped-review` for every Epic 13 story. Keep this file
> updated as stories complete (append to section 8).

## 0. Why this epic exists (audit synthesis)

Multi-agent audit of 2026-07-14 (6 exclusive-scope auditors: cpsat fidelity, greedy correctness,
equity, French labor law, robustness, test coverage — 35 retained findings, zero speculative;
findings C1/T1 and E2/T7 hand-verified line-by-line). Full report:
https://claude.ai/code/artifact/287153fd-f6f9-4bc7-9cdd-07fea30fa225
Triage of 2026-07-16: `docs/triage-decision.md` (T1–T8 HIGH bugs, T9–T12 MEDIUM; 5 DEFER
records in `.aped/.out-of-scope/2026-07-16-*.md`).

The audit's through-line: **the generated core is hardened (Epic 11/12), but the manual write
paths, the validation windows, and the solver's fidelity/observability lag behind it.** Epic 13
closes that gap. Thesis: whatever generation guarantees, no manual gesture and no solver pass
may bypass — and whatever is served must be true (violations, engine, metrics).

## 1. Scope from PRD

No new FRs. Re-covers FR3/FR5/FR6/FR7/FR8; NFR2/NFR3/NFR10. Extends the FR7 statutory set
(Epic 11: 10h/day net, 13h amplitude, 35h weekly rest, ≤6 consecutive days) with: 11h daily
rest (L.3131-1), 48h absolute weekly ceiling (L.3121-20), 20-min break beyond 6h (L.3121-16).
Note: 11h daily rest was **explicitly descoped by story 11-3** ("13h amplitude is the story's
proxy") — 13-4 revisits that decision deliberately; it is not a bug fix.

## 2. Architecture references

- Engine: `apps/api/src/modules/planning/planning-generation.service.ts` (~4500 lines).
  Manual writes: `moveShift` (~:2320-2455), `createManualShift` (~:2457-2596, the correct
  ±8-day window reference), `preValidateMove` (~:2958-2980, currently the ONLY move check —
  client-gated via `useDragAndDrop.ts:126`).
- Statutory core: `french-labor-law.ts` (pure; `mergedBusyIntervals`, `clampGapLen` ~:200-223,
  `wouldExceedStatutory` ~:315-361). Rules: `rule-engine.ts` (pure, unified in 11-8).
- Solver: `solver-model.ts` (pure IR; SolverInput ~:50-65, monthly bound ~:262-272, spreads
  ~:352-368, `fixed: 0` at :368), `solver-engine.service.ts` (or-tools-wasm adapter, det-time
  budget), improve pass `runSolverImprovePass` (~:4164-4526, acceptance gate ~:4435).
- Equity persistence: `equity-counter.service.ts` (:157-158, :226 local-TZ `getDay()`) and its
  hand-duplicated twin `trigger/tasks/equity-recalc.ts` (:18-19, :68-69) — WARNING header
  already flags the duplication.
- Telemetry: `apps/api/src/common/metrics.ts` (:6-12, histogram has only clinic_id/shift_count).
- UI: `apps/web/.../GenerationPanel.tsx` (:351-363 served-engine badge, Story 12-2).
- Locks/transaction: advisory lock at generation `:747` inside `$transaction` `:753-776`
  (generation↔generation and generation↔publish only — manual writes take NO lock).

## 3. Cross-cutting invariants every story MUST preserve

1. **Improve-never-degrade** (12-1): a served cpsat plan is strictly better (fill, then exact
   `equityObjective`) AND replay-validated; every failure path serves greedy with a warn.
2. **Determinism**: same input → deep-equal output (both engines). No RNG, no wall-clock in
   engine logic, stable iteration order, fixed solver seed/budget. Property 13-8 locks this.
3. **Survivor immutability**: MANUAL / `isConfirmed` / variance-bearing shifts are never in
   `ctx.assignedShifts` — structurally unejectable. Survivor vs deleteMany filters are exact
   complements (`:4844-4848` vs `:753-761`).
4. **Statutory rules are non-disableable** (11-3): hard-coded constants, evaluated
   unconditionally; config can only tighten, never loosen. 13-4's new limits follow the same
   pattern.
5. **Net vs gross**: daily 10h compares NET minutes (breaks deducted); amplitude and weekly
   rest use raw busy intervals. Keep the distinction in any new statutory check.
6. **Byte-identical greedy default**: `engine` unset/greedy → zero solver work, results
   identical (12-1 AC). 13-5/13-6 must not perturb the greedy path.
7. **Tier gate on the VALUE**: `requireProfessional` fires only on `engine: 'cpsat'`
   (12-2). Observability additions (13-6) must not leak Pro info to Starter responses.
8. **UTC everywhere**: dates are UTC-midnight `YYYY-MM-DD`, times are `HH:MM` minute
   arithmetic (DST-immune by design). 13-7 brings the persisted counters in line — do NOT
   introduce local-TZ Date math anywhere.

## 4. Per-story anchor map (start from ground truth, verify the symbol)

| Story | Findings | Ground-truth anchors |
|-------|----------|----------------------|
| 13-1 | T1, T2 | `moveShift` :2320-2455 (zero statutory/rule-engine calls — verified); locks :747 vs :2405/:2551; TOCTOU: plan computed pre-transaction, `deleteMany`+`createManyAndReturn` :753-776 without re-validation |
| 13-2 | T4 | move window :2871-2877 (strict month); publish `validateShiftsAgainstRules` → `planning.service.ts:178-182`; `clampGapLen` french-labor-law.ts:200-204 (phantom rest credit); generation border load :4757-4824 (border-ISO-week only); reference impl: `createManualShift` :2519-2529 (±8 real days) |
| 13-3 | T3 | `timesOverlap` :3565-3578 (no wrap); replay bucket :1144-1157 (same-date only); model mutex solver-model.ts:147,155 (`a.date !== b.date → false`) |
| 13-4 | T9, T10 | french-labor-law.ts:11 (header conflates 11h rest with 13h amplitude), :24; `minRestHoursBetweenShifts` proxy :1196-1221 (configurable, not statutory); cap chain rule-engine.ts:298-301 (no 48h floor); `breakMinutes` only deducted (`shiftNetMinutes` :98-103), never required |
| 13-5 | T5, T7 | SolverInput solver-model.ts:50-65 (no `fixedMonthlyMinutes`); monthly bound :262-272 (raw cap; weekly mirror :252-258 is the pattern); spreads :352-356 (saturday/weekend only vs `equityObjective` 3 terms local-repair.ts:242-246); `fixed: 0` :368; weekly regression comment :4227-4239 (the T5 bug class, fixed for weekly only) |
| 13-6 | T6, T11 | violations accumulated in greedy loop :639-640, never recomputed (:4521-4526, buildResult :3544-3550); metrics.ts:6-12; degradation paths all logged distinctly (solver-engine:73, :4390, :4443, :4512, :701) but not metric'd; GenerationPanel.tsx:351-363 |
| 13-7 | T8 | equity-counter.service.ts:157-158 (`new Date(y,m-1,1)` local), :226 (`getDay()`); duplicated in trigger/tasks/equity-recalc.ts:18-19,:68-69; test blind spot equity-counter.service.spec.ts:395-433 (local dates mask the bug); engine classification is UTC (`getUTCDay` :1457, :3627-3630, local-repair.ts:141-144) |
| 13-8 | T12 | test gaps: solver degradation catch (solver-engine.service.ts:69-76), ejection rollback (:4074-4078 "unreachable by design"), acceptance-gate equity arm (:4435-4438, never served positively), replay reject motives :4472-4507 (only monthly-cap tested, AC6 :8072), cpsat×survivors (none); mock-split: "real tRPC path" spec :8328 calls the service directly |

## 5. Lessons applicable

- **Audit 2026-07-08 lesson**: a guard with N call-sites is only "verified" when ALL entry
  points are tested — 13-1 exists because move was the untested entry point, again. 13-8's
  property (1) is the systemic answer.
- **Epic 11 sprint lessons** (docs/lessons.md): rebuild `@pawly/*` dist before app tsc; use
  `pnpm test --filter` (root runner broken by rtk shim); `shift.findMany` mock is shared with
  `loadBorderWeekShifts` in generation specs — key mocks on the `where` predicate shape
  (survivors `OR` vs border `date.in`), see spec lines :1633/:1896/:6110.
- **ESM/or-tools under Jest**: `process.getBuiltinModule('node:module').createRequire` is the
  only require Jest doesn't shim (memory: esm-only-packages-jest-nest). Perf pins use the
  TURBO_HASH-aware CI budget pattern.
- **13-1 sequencing** (spec-reviewer): run as three explicit tasks — (a) statutory+rule-engine
  guard in moveShift, (b) shared advisory lock, (c) in-transaction plan re-validation — so the
  TOCTOU fix isn't lost behind the guard work.

## 6. Environment & convention gotchas (from project memory)

- All pnpm commands from repo root; NEVER `cd apps/`; NEVER `npm run dev`.
- Branches: `feature/{KON-ticket}-{story-slug}`; commits `feat(KON-xxx): …`; PRs → develop.
- API tests Jest `*.spec.ts`; web Vitest. Prod solver needs Node ≥ 22.12 (graceful greedy
  fallback below — 13-6 makes that fallback observable).
- `docs/state.yaml` schema v4 is strict (`additionalProperties: false`) — never invent keys;
  validate EXIT=0 before commit.

## 7. Linear tickets

Synced to Linear project **Pawly** (team Koni). See the "Epic 13 — Linear Tickets" table in
`docs/epics.md` (filled by the epics ticket sync).

## 8. Previous stories — outcomes

### Story 13-1-manual-write-guards-locks — done 2026-07-16T00:00:00Z

- **Decisions:** Manual writes (`moveShift`, `createManualShift`) and generation share one
  advisory lock (`lockMonths`, sorted+deduped over every touched month) and one pure evaluator
  (`move-validation.ts`); the lock/flags/recipients key off the in-tx `fresh` re-read, never a
  pre-lock snapshot (aped-review F1). Statutory window is ±8 real days on BOTH write and advisory
  paths. Stale generated plan → `ConflictException('STALE_PLAN_REGENERATE')`, surfaced through the
  generation catch. No web change (existing optimistic rollback + error toast hold).
- **Files:** `apps/api/src/modules/planning/move-validation.ts` (new), `move-validation.spec.ts`
  (new), `planning-generation.service.ts`, `planning-generation.service.spec.ts`.
- **Contracts:** new pure module `move-validation.ts` exporting `evaluateMoveViolations` +
  `MoveEvalContext`/`MoveEvalShift` — 13-2 turns the single `statutoryWindowShifts` window knob here.
  `MoveValidationResult` (`@pawly/validators`) and the tRPC `planning.moveShift` contract unchanged.
- **Deviations from plan:** global `mockOperationalConfig.workDays` corrected to day-NAMES (approved)
  rather than per-describe overrides; `$executeRaw` added to the global mock; generation `catch`
  taught to re-throw `ConflictException` (AC4). aped-review added the `moveShift` fresh-keyed lock
  fix + a `createManualShift` lock-acquisition test (AC3 was code-correct but untested). Known
  residual (NIT): sub-ms intra-tx window between the `fresh` read and `lockMonths` — deferred to 13-8.

### Story 13-7-equity-counters-utc — done 2026-07-16T13:39:39Z

- **Decisions:** Persisted equity counting is now a single pure UTC core
  (`equity-counting.ts`, next to `french-labor-law.ts`/`rule-engine.ts`); both runners
  (Nest `EquityCounterService.recalculateForPeriod` + Trigger `equity-recalc.ts`) import it —
  no counting logic may be duplicated between them again (T8). Cron month-selection stays
  local by design (documented Non-Goal). `EquityCounterName` mirrors Prisma's enum locally to
  keep the core Prisma-free for the Trigger bundle.
- **Files:** `apps/api/src/modules/planning/equity-counting.ts` (new),
  `equity-counting.spec.ts` (new), `equity-counter.service.ts` (delegates),
  `equity-counter.service.spec.ts` (UTC-midnight mocks), `trigger/tasks/equity-recalc.ts`
  (duplication removed), `trigger/tasks/equity-recalc.spec.ts` (new, review-added AC-1 coverage),
  root `package.json` (engines `>=22.3.0`).
- **Contracts:** exports `computeEquityCounters`, `utcMonthBounds`, `utcDateKey`,
  `utcDaysInMonth`, `calculateShiftMinutes`, and types `EquityCounterRow` / `EquityCounterName` /
  `EquityShiftInput` / `EquityEmployeeInput` / `EquityCountingInput`. Any future story recomputing
  equity counters MUST call this core, not re-implement day/bounds math.
- **Deviations from plan:** timezone-invariance specs needed `process.getBuiltinModule('node:process')`
  to flush V8's TZ cache under Jest (plain `process.env.TZ` is a no-op there); engines bumped to
  `>=22.3.0` for that API. Review added a Trigger-runner spec (AC-1 was proven only by inspection).
  `OVERTIME_HOURS` still stores MINUTES (persisted enum name unchanged — separate migration).

### Story 13-3-cross-midnight-overlap — done 2026-07-16T14:10:00Z

- **Decisions:** One wrap-aware `shift-interval.ts` primitive is the single source of truth for
  overlap / rest-gap / amplitude across the greedy engine, the solver IR, and french-labor-law —
  do not re-implement the `(date, HH:MM) → absolute minutes` mapping anywhere else (13-5 solver
  work must import it). `loadBorderWeekShifts` now ALWAYS loads the immediate calendar D-1/D+1
  (not only ISO-week straddle days) — a shared border-loading fix that also benefits minRest /
  consecutive-day / rotation scans; keep it. Overnight shift types (`endTime < startTime`) are now
  legal end-to-end (validators reject only `start === end`); clinic opening hours keep `end > start`.
  `HH:MM` is validated by the tightened `timeRegex` (`^([01]\d|2[0-3]):[0-5]\d$`, exported from
  `onboarding.schema.ts`).
- **Files:** `shift-interval.ts` (+spec, new); `planning-generation.service.ts` (+spec);
  `solver-model.ts` (+spec); `french-labor-law.ts`; `clinic.service.spec.ts`; `clinic.router.spec.ts`;
  `packages/validators/src/clinic/{onboarding,shift-type}.schema.ts` (+tests);
  `apps/web/.../onboarding/_components/{StepShiftTypes,OnboardingWizard}.tsx`.
- **Contracts:** new exports `toAbsoluteInterval`, `intervalsOverlap`, `shiftsOverlap`,
  `restMinutesBetween`, types `IntervalShift` / `AbsoluteInterval` from `shift-interval.ts`.
  `timeRegex` now exported from `onboarding.schema.ts`. No tRPC/Prisma/dependency change.
- **Deviations from plan:** `windowsOverlap` (kept same-day by the story's Task 5c) was removed
  during review — the special-day clamp is now wrap-aware, leaving it with no caller. The Dev-Notes
  claim that the month frontier needed no extra border loading was wrong (fixed in review, M1).
  Known gap carried forward (not this story): the settings-page `ShiftTypeFormSheet` still has no
  client-side error surface for overnight validation — deferred to a UX story.
- **Merge weave with 13-1 (KON-131):** 13-1's shared `move-validation.ts` overlap check was ported
  as a deliberately same-day `timesOverlap` awaiting this story; the merge makes it wrap-aware —
  `evaluateMoveViolations` now uses `shiftsOverlap`, the `MoveEvalContext.sameDayShifts` field was
  renamed `overlapWindowShifts` and `loadMoveValidationInputs` loads it over the `adjacentDayRange`
  D-1/D/D+1 window (still read under 13-1's advisory lock, inside the write transaction).
  `createManualShift`'s in-tx overlap and the stale-plan check adopted `shiftsOverlap` + the
  adjacent-day window too. `move-validation.ts`'s obsolete `timesOverlap`/`toMinutes` were removed.

### Story 13-2-unified-validation-windows — done 2026-07-19T00:00:00Z

- **Decisions:** All three validation paths now share the ±8-real-day cross-month window; `clampGapLen`
  clips open sentinels to the loaded data window (`win`), not the ISO week, killing phantom weekly-rest
  at a frontier. Two invariants were made explicit in review: (1) **`findStatutoryViolations` flags EVERY
  worked day beyond the 6-day max**, not just the first — attributing each excess day to its own in-grid
  date is what lets the publish range-filter catch a run whose 7th day sits in an adjacent month but
  continues into the published month (a HARD-block bypass otherwise). (2) **Purely-statutory cross-month
  days are seeded into `assignmentIndex` for the eligibility window but excluded from greedy scoring AND
  from the cpsat `fixedShiftsByEmployee` baseline** via a `statutoryOnlyKeys` set — byte-identical greedy
  (invariant 11-10) is preserved. A future story recomputing statutory violations or touching
  `scoreAndAssign`/the solver baseline MUST keep both invariants.
- **Files:** `french-labor-law.ts` (+spec), `planning.service.ts` (+spec), `planning-generation.service.ts`
  (+spec), `move-validation.spec.ts`. No schema / tRPC / package / web change.
- **Contracts:** `findStatutoryViolations(shifts, window?)` and `wouldExceedStatutory` gained the optional
  data-window bound (window-less callers keep legacy behaviour); `PlanningService.violationInPublishedRange`
  is the publish range filter (`DAILY_*`/`CONSECUTIVE_DAYS` per-day, `WEEKLY_REST` per ISO-week intersection).
  `scoreAndAssign` gained a `statutoryOnlyKeys: Set<string>` param.
- **Deviations from plan:** none in dev. aped-review fixed two MAJORs the story shipped with — the publish
  consecutive-day straddle bypass (M1) and a greedy-scoring perturbation from the seed leaking into
  `scoreAndAssign` (M2) — plus a NIT (n1) extending the same exclusion to the cpsat solver baseline. The
  original "byte-identical fill/equity" seed comment was true only after the M2/n1 fixes.

### Story 13-5-solver-model-fidelity — done 2026-07-19T16:15:00Z

- **Decisions:** The cpsat improve pass is now survivor-aware on BOTH sides (Option A, locked with
  Alex). The monthly bound deducts in-month survivor minutes (`fixedMonthlyMinutes`, the exact
  mirror of the weekly cap); the equity spread models a third `spread:shift` metric whose
  per-employee count carries the survivor's immovable load (`fixedEquityLoads`); the acceptance gate
  scores fairness over survivors + generated via the pure `mergeEquityLoads`. Any future story
  recomputing solver equity fairness MUST call `mergeEquityLoads` (do not re-inline the merge) and
  source the monthly baseline from the pre-greedy `employeeMinutes` snapshot (survivors only —
  border shifts never enter it). Fill still lexicographically dominates: `maxSpread` tracks
  `terms.length + fixed`, not just `slots.length`. `local-repair.ts`'s own greedy-repair
  `equityObjective` usage stays survivor-blind by design (out of scope).
- **Files:** `solver-model.ts` (+spec), `planning-generation.service.ts` (+spec),
  `solver-engine.service.spec.ts`, `local-repair.ts` (+spec — review-added `mergeEquityLoads`).
- **Contracts:** `SolverInput` gains two REQUIRED maps — `fixedMonthlyMinutes: Map<string, number>`
  and `fixedEquityLoads: Map<string, EmployeeLoad>` (every SolverInput construction site must supply
  them; 13-6 will). New pure export `mergeEquityLoads(baseline, generated)` from `local-repair.ts`.
  The `spread:shift` tag joins `spread:saturday`/`spread:weekend` in the IR objective (the or-tools
  adapter already materializes any spread generically via `p.fixed` — no adapter change).
- **Deviations from plan:** AC-4 fixture rebuilt at GREEN as a depth-3 crossed-availability trap +
  a bystander emp-4 carrying a 2h survivor against a 4h cap (bound 240−120), per the story's own
  "tune the fixture" Dev Note — the model-inspection test is the reliable T5/T7 proof. aped-review
  extracted the inline gate merge into the pure `mergeEquityLoads` + added a load-bearing unit test
  (the merge was correct but only reachable through the fill branch, so untested), and hardened the
  AC-4 mock's `where.OR` discriminator against a latent quarterly-query collision.

### Story 13-4-statutory-extensions — done 2026-07-20T14:20:42Z

- **Decisions:** The three new statutory limits (11h daily rest L.3131-1, 48h weekly ceiling
  L.3121-20, 20-min break >6h L.3121-16) flow through the two pure evaluators only — no new call
  sites, `rule-engine.ts` untouched (the 48h ceiling is statutory, not a config cap). Incremental
  "introduced-by-candidate" checks MUST be scoped to the candidate (day/week/adjacent-gap), never a
  whole-window boolean: aped-review found DAILY_REST used a global `hasDailyRestDeficit` that let a
  pre-existing gap mask a fresh one — now a monotonic `countDailyRestDeficits` delta. A shift-type
  UPDATE cannot be validated by pure zod against the persisted row, so `updateSingleShiftType`
  re-reads and validates the MERGED patch server-side; any future partial-patch validation MUST do
  the same. The web resolves `@pawly/validators` to the built main-checkout copy in a worktree, so
  new validator runtime exports are invisible to web code pre-merge — keep web validators
  self-contained (13-3/13-4 both inline the break arithmetic client-side by necessity).
- **Files:** `french-labor-law.ts` (+spec), `planning.service.ts` (+spec), `planning-generation.service.spec.ts`,
  `clinic.service.ts` (+spec), `planning-rule.schema.ts`, `onboarding.schema.ts` (+ barrel `clinic/index.ts`),
  `shift-type.schema.ts` (+test), `StepShiftTypes.tsx` + new `shift-types-validation.ts` (+spec),
  `OnboardingWizard.tsx`, `fr.json`/`en.json`.
- **Contracts:** `StatutoryViolationKind` gains `DAILY_REST | WEEKLY_CEILING | MANDATORY_BREAK`
  (7 total); `STATUTORY_MESSAGE_KEY`/`STATUTORY_RULE_CONFIG` mirror them; `MINUTE_KINDS` now includes
  `DAILY_REST`+`WEEKLY_CEILING` (minutes→hours), MANDATORY_BREAK stays minutes; `violationInPublishedRange`
  treats `WEEKLY_CEILING` like `WEEKLY_REST` (ISO-week intersection). `shiftBreakRuleOk`,
  `MANDATORY_BREAK_MINUTES`, `BREAK_REQUIRED_AFTER_NET_MINUTES`, `timeRegex` now exported from the
  `@pawly/validators` barrel.
- **Deviations from plan:** `move-validation.ts` not touched (kind-agnostic loop inherits the new
  limits). aped-review fixed 4 MAJOR + 1 MINOR the story shipped with — DAILY_REST whole-window
  masking (F1, real correctness bug), two untested AC-2 arms (looser-cap independence + WEEKLY_CEILING
  publish wiring), the untested onboarding error (extracted+unit-tested validator), and the
  partial-PATCH break bypass in `updateSingleShiftType` (server-side merged re-validation) — plus a
  MANDATORY_BREAK generation test. F8 (legacy shift-type backfill) and F9 (window-frontier under-report)
  documented as Out-of-scope; one known residual: `updateSingleShiftType` read-then-write is unlocked
  (blast radius unchanged, candidate for 13-8).
