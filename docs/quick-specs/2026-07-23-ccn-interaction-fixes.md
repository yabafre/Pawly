# Quick Spec: Fix the 13-4×KON-139 design-interaction cluster (KON-140)

**Date:** 2026-07-23
**Author:** Alex
**Type:** fix
**Status:** in-progress

> **Gate note:** the remediation plan was presented in the verification-audit report
> (https://claude.ai/code/artifact/fc6aac28-3f46-43fd-b707-8394e4991e07) and approved by
> Alex on 2026-07-23, including P1 which reverses the 13-4 "stricter reading" — this spec
> transcribes that approved plan; no second gate.

## What

Fix the confirmed major findings of the 2026-07-22 verification audit: the DAILY_REST
intra-day reading that made every 2-vacation day unsatisfiable (V1), the removal paths that
skip re-validation now that structure rules are non-monotone (V3), the order-sensitive
cpsat replay (V4), the forward-blind 44h generation gate (V5), the dead `maxDailyHours`
config (V7) and the lying seeded showcase rule (V8), plus a strengthened harness (V6) and
bundled cleanups.

## Why

V1 is live in prod since v0.15.0: generation never assigns a split day (morning+afternoon)
to the same employee and publish blocks CCN-lawful historical split days. V3/V5 are the two
under-strict holes (illegal states persistable). The rest is truthfulness (V7/V8) and
verification power (V6).

## Acceptance Criteria

- [ ] **AC1 (V1/P1)** — A DAILY_REST gap counts iff the two adjacent merged busy blocks
  START on different calendar dates. Given a 3h+5h split day (gap 2h), Then no DAILY_REST;
  amplitude/vacation rules alone govern intra-day structure; the lawful 2h+3h day passes
  with ZERO violations (test un-filtered). Cross-midnight deficits (22:00→06:00 then 14:00
  next day = 8h) still flag. Both post-hoc and incremental paths.
- [ ] **AC2 (V3)** — Given `deleteShift` or a `moveShift` whose SOURCE (employee, day)
  loses a block, When the removal would introduce a structure violation on the affected
  days (VACATIONS_COUNT via block split, VACATION_MIN_DURATION fragments, practitioner
  amplitude shape-change, inter-day DAILY_REST via bridge removal), Then the mutation is
  rejected in-transaction (introduced-by-removal semantics: pre-existing violations don't
  block).
- [ ] **AC3 (V4)** — The cpsat replay defers the order-sensitive kinds (VACATIONS_COUNT,
  VACATION_MIN_DURATION, DAILY_AMPLITUDE, DAILY_REST) during the one-by-one loop and
  validates them ONCE on the final applied state per (employee, day); a final-state
  violation still rejects the plan (greedy served); a valid plan is never rejected for
  application order.
- [ ] **AC4 (V5)** — The generation 44h gate sees future weeks already persisted in DB:
  the weekly preload extends 11 weeks FORWARD past the month (excluding in-month weeks,
  which stay on the live counter), and `lastWeekMonday` moves to the forward horizon.
  Generating months out of order can no longer persist a >44h/12-week average silently.
- [ ] **AC5 (V7)** — A HARD CONTRACT_COMPLIANCE rule with `maxDailyHours` is now evaluated
  (net minutes per day) on the same surfaces as the weekly caps (generation eligibility,
  move validation, publish). Config can only tighten: values above 12h clamp to the
  statutory 720.
- [ ] **AC6 (V8)** — The seeded statutory showcase rule is normalized AT READ: whenever
  rules are listed, the rule named `STATUTORY_RULE_NAME` carries the current
  `STATUTORY_RULE_CONFIG` (display always truthful, no DB migration).
- [ ] **AC7 (V6)** — Harness generators can produce ≥10h continuous days (with lawful
  breaks) and dense weeks so P1/properties can trigger DAILY_WORK/amplitude/REST_DAYS/44h;
  at least one property run demonstrably exercises a KON-139 rule (assert generator
  coverage, CI-aware numRuns).
- [ ] **AC8 (bundle)** — stale "±8 real days"/"eligibility is monotone" docstrings fixed;
  deficit-kind fallback messages use the right comparator; `failingWindows` memoized
  (verdict-identical); `equity-recalc` Trigger task derives its period from UTC.
- [ ] **AC9 (V2, docs)** — the corps 12h-net continuous-guard pinch is documented as
  legally-correct (CCN art. 18) in the CCN dossier + epic-13 context; KON-139's AC2 claim
  amended.
- [ ] **AC10** — full suite green; property harness green; NFR2 budgets green; zero new
  tsc errors; greedy behavior changes ONLY where specified (V1 unblocks split days).

## Files to Change

- `french-labor-law.ts` (+spec) — inter-day DAILY_REST semantics, removal-check helper,
  deferred-structural option for the replay, failingWindows memoization, docstrings.
- `planning-generation.service.ts` (+spec) — deleteShift/moveShift-source removal guards,
  replay final-state structural validation, forward weekly preload, maxDailyHours in the
  contract eligibility path, docstrings.
- `move-validation.ts` (+spec) — source-side removal check wiring, maxDailyHours.
- `rule-engine.ts` (+spec) — maxDailyHours contract evaluation.
- `planning.service.ts` (+spec) — publish maxDailyHours + showcase normalize-at-read +
  message comparator.
- `planning-harness.testutil.ts` / `planning-invariants.property.spec.ts` — generator
  enrichment + coverage assertion.
- `trigger/tasks/equity-recalc.ts` — UTC period derivation.
- `docs/reference/ccn-veterinary-worktime-verification.md`, `docs/epics-context/epic-13-context.md`,
  `docs/quick-specs/2026-07-21-ccn-worktime-regimes.md` — V2 documentation.

## Test Plan

- Pure module: split-day matrix (2h+3h passes clean; 1h30+4h → VACATION_MIN only;
  3 blocks → VACATIONS_COUNT only; cross-midnight rest deficits unchanged; overnight
  start-date semantics), removal-check unit matrix (block split → count/minima; bridge
  removal → inter-day rest; practitioner shape-change amplitude), deferred-structural
  equivalence (order-permutation property: same final state → same verdict).
- Service: deleteShift/move-source rejection specs; replay order-insensitivity spec
  (two application orders of the same plan → same outcome); forward-44h spec (future month
  loaded → generation blocked); maxDailyHours tightening spec; showcase normalize spec.
- Harness: generator coverage assertion + full property re-run; NFR2 stress family.

## Result

<!-- Filled after implementation -->
