# Quick Spec: Local-repair depth-3 ejection chains + calibrated equity objective

**Date:** 2026-07-13
**Author:** Alex
**Type:** feature
**Status:** done

## What

Extend the Story 11-9 local-repair pass on two axes: (1) generalize `findEjectionChain`
from fixed depth ≤2 to bounded depth ≤3 (mover → mover → idle backfill), attempted only
when the depth-2 search fails, so holes strandable by a 2-chain get one more escape route;
(2) replace the implicit equal-weight equity objective with explicit, scale-normalized
weights so `shiftCount` deviations no longer numerically dominate `saturdayCount` /
`weekendCount` deviations, and weekend/Saturday terms honor the clinic's `ROTATION_EQUITY`
rule priority via the existing `1 + priority/10` convention.

Out of scope (deliberate): CP-SAT solver (Phase-3 item, separate story — new dependency +
architecture decision), any change to greedy `scoreAndAssign` soft-rule weighting, any new
DB field or Prisma migration.

## Why

The 2026-07-08 audit's residual optimality gaps: depth-2 chains provably strand
repairable holes (3-chain bin-packing instances), and the unweighted objective
rebalances total shift count at the expense of the weekend fairness clinics actually
configure rules for.

## Acceptance Criteria

- [ ] AC1 — A hole unreachable by any depth-2 chain but repairable by a depth-3 chain
      (regression fixture in `local-repair.spec.ts`) is filled; depth-2 results are
      byte-identical to today when a 2-chain exists (depth-3 only runs on 2-chain failure).
- [ ] AC2 — Soundness invariants hold at depth 3: every intermediate mover validated on
      post-removal state, final backfill on pre-apply state, whole chain reverted if any
      applied step fails `isAppliedShiftValid`; no HARD violation introduced (existing
      service-level property tests keep passing).
- [ ] AC3 — Determinism preserved: sorted-key iteration only, no RNG; the generation
      determinism tests pass unchanged.
- [ ] AC4 — Bounded cost: depth-3 search capped by an explicit budget constant
      (`MAX_EJECTION_CANDIDATES` or equivalent); the CI-aware worst-case ejection-scan
      perf test (commit b48ee7e) still passes within budget.
- [ ] AC5 — `equityObjective` takes explicit `EquityWeights { saturday, weekend, shift }`;
      each term is scale-normalized (divided by the workforce mean of that metric, guard
      mean=0) so no metric dominates by magnitude alone.
- [ ] AC6 — Weekend/Saturday weights derive from the clinic's `ROTATION_EQUITY` rule
      priority (`1 + priority/10`, the existing soft-penalty convention); absent any
      rotation rule, weights default to `{1, 1, 1}` — the swap delta computation in
      `selectImprovingSwap` stays exact (O(1) per pair) under weights + normalization.
- [ ] AC7 — `docs/reference/planning-algorithm-reference.md` "Known Algorithm Limitations"
      §1 updated (depth ≤3, weighted objective); CP-SAT remains listed as Phase 3.

## Files to Change

- `apps/api/src/modules/planning/local-repair.ts` — generalize `EjectionChain` to a move
  list, add bounded depth-3 search (fallback after depth-2 miss), add `EquityWeights` +
  normalization to `equityObjective` / `selectImprovingSwap` delta math
- `apps/api/src/modules/planning/local-repair.spec.ts` — depth-3 fixture, depth-2
  no-regression, weighted/normalized objective math, determinism
- `apps/api/src/modules/planning/planning-generation.service.ts` — apply/revert a chain of
  N moves in `runLocalRepairPass`, wire `ROTATION_EQUITY` priority → weights, budget constant
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` — wiring + revert +
  perf-budget assertions
- `docs/reference/planning-algorithm-reference.md` — limitations §1 + config table (priority
  row: now also feeds equity weights)

## Test Plan

- RED: `local-repair.spec.ts` — fixture where hole needs mover A→hole, mover B→A's slot,
  idle C→B's slot (no 2-chain exists); expect chain of 3 moves. Weighted objective: workforce
  where a shift-count-improving swap worsens weekend spread — normalized+weighted objective
  must prefer the weekend-fair swap (today it doesn't).
- GREEN: implement; run `bash .aped/aped-dev/scripts/run-tests.sh` (API Jest suite — note
  root `pnpm test` broken by rtk shim, use `--filter` form if the script fails).
- Property checks: existing no-HARD-violation + determinism + CI-aware perf tests unchanged.

## Result

Shipped on `feature/KON-128-local-repair-depth3-equity-weights` (ticket KON-128).

- `local-repair.ts` — `EjectionChain` generalized to a move list; depth-3 fallback (first-fit,
  deterministic) runs only on a depth-2 miss; `EquityWeights` + per-metric mean normalization in
  `equityObjective` / `selectImprovingSwap` (delta stays exact O(1)); `deriveEquityWeights` maps
  ROTATION_EQUITY priorities via `1 + priority/10`.
- Budget design changed vs AC4's initial sketch: a per-call budget blew the worst-case perf test
  (6.1s > 5s — N holes × 20k evaluations), so the budget is ONE mutable pool
  (`{remaining: 4000}`) shared across the whole repair pass. Perf test back to 837ms.
- Service applies/reverts N-move chains generically; weights derived once per pass from
  hard+soft rules.
- Tests: local-repair.spec 12 → 24; planning-generation.service.spec +3 (depth-3 both-ways
  fixture: 3 VETs, monthly cap, crossed availabilities — hole 1 → 0, exact assignment asserted,
  determinism). Full suite green (turbo 8/8, exit 0); `pnpm --filter @pawly/api build` clean.
- AC6 note: weights ≥ 1 by construction; the end-to-end discriminating case for weight wiring is
  covered at unit level (weighted selection flips with the saturday weight), not via a
  generateMonthlyPlan fixture — hill-climb convergence makes end-to-end discrimination brittle.
