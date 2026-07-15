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

_(append as Epic 13 stories complete)_
