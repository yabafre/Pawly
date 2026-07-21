# Quick Spec: CCN working-time regimes (corps 1875 + annexe VII) in the statutory engine

**Date:** 2026-07-21
**Author:** Alex
**Type:** feature
**Status:** done

> **Scope deviation (explicit owner decision):** this spec exceeds the quick-track criteria
> (~8 files, new 12-week data window). Alex chose "all in one quick-spec" over a mini-epic
> on 2026-07-21 (precedent: KON-128). Sequenced tasks below keep it survivable.
> **Legal basis:** `docs/reference/ccn-veterinary-worktime-verification.md` (research dossier,
> owner-approved as working basis — no juriste appointment; §5 attention points apply).

## What

Make the statutory engine convention-aware: two working-time regimes selected by `JobType`
(corps IDCC 1875 for support staff, annexe VII ex-2564 for practitioners), with the
conventional limits that differ from the current Code-only set — 12h daily cap, 12h/15h
continuous-day amplitude, max 2 vacations/day with minimum durations, the 4-rest-days /
2-weeks rule for ≥10h continuous days, and the 44h rolling average over 12 consecutive weeks.

## Why

Post-Epic 13 the engine is legally sound on the Code du travail but convention-blind: it
**over-blocks** lawful 12h continuous guard shifts (HARD 10h) and **under-blocks** rosters the
extended CCN forbids (12h continuous-day amplitude for support staff, 44h/12-week average,
rest-days rule, vacation caps). The CCN text is *étendu* — it binds every French veterinary
clinic, which is Pawly's entire market.

## Design decisions (locked)

- `StatutoryRegime = 'SUPPORT_STAFF' | 'PRACTITIONER'`; mapping `VET → PRACTITIONER`,
  `ASV | APPRENTICE → SUPPORT_STAFF`. (Vet-school apprentices under ordinal authority are an
  edge case — treated as support staff, documented; minors remain the separate DEFER record.)
- `FRENCH_LABOR_LAW` becomes a per-regime table `STATUTORY_LIMITS[regime]`; every consumer
  passes the employee's regime. The non-disableable invariant (config can only tighten) is
  preserved unchanged.
- "Journée continue" is **derived, not configured**: a worked day whose merged busy intervals
  collapse to a single block (`shift-interval.ts`).
- Rules stay OUT of the CP-SAT model; the replay via `evaluateEligibility` picks them up
  automatically (improve-never-degrade unchanged). The ±8-day unified window (13-2) grows to
  **±14 days**; the 44h average gets a dedicated 11-prior-ISO-weeks aggregated preload.

## Acceptance Criteria

- [ ] **AC1 — Regime plumbing.** Given any statutory evaluation on any entry point
  (generation eligibility, `moveShift`/`createManualShift` guards, publish validation,
  cpsat replay), When the employee is a `VET`, Then annexe VII limits apply; otherwise corps
  1875 limits apply. Zero call-site left regime-blind (compile-enforced signature change).
- [ ] **AC2 — 12h daily cap.** Given a 12h-net continuous guard shift, When eligibility runs,
  Then it is assignable (was blocked at 10h); Given 12h01+, Then blocked — both regimes
  (corps art. 18 / annexe VII art. 20).
- [ ] **AC3 — Continuous-day amplitude.** Given a single-block worked day, Then amplitude is
  capped at 12h (SUPPORT_STAFF) / 15h (PRACTITIONER) as HARD; Given a discontinuous day,
  Then the 13h cap stays as today.
- [ ] **AC4 — Vacations.** Given a day where an employee would hold >2 disjoint work blocks,
  Then the assignment is blocked (HARD); Given exactly 2 blocks, When one is <2h or the
  other <3h (order-independent), Then blocked (échelon-1 relaxation unsupported = stricter,
  documented).
- [ ] **AC5 — Rest-days rule.** Given any sliding 14-day window containing ≥1 continuous
  worked day ≥10h net, Then the window must hold ≥4 non-worked days including ≥2
  consecutive (HARD, both regimes); And the 2 consecutive days include a Sunday: HARD for
  SUPPORT_STAFF (« comprenant un dimanche »), SOFT warning for PRACTITIONER
  (« de préférence »). Cross-month windows are fed by the ±14-day unified load.
- [ ] **AC6 — 44h/12-week average.** Given any 12-consecutive-ISO-week window ending at a
  week touched by the candidate assignment, When average net worked would exceed 44h
  (total > 31 680 min), Then blocked on every entry point. Prior 11 weeks come from ONE
  aggregated per-employee query cached in the generation context.
- [ ] **AC7 — Invariants held.** Byte-identical greedy default except the new rules;
  determinism (same input → deep-equal); 13-8 property harness green with the new rules in
  the HARD set; NFR2 CI-aware perf budget respected (stress fixture).
- [ ] **AC8 — Surfacing.** New violation `messageKey`s exist in FR and EN and reach the
  Health Bar / publish report like the Epic 11 statutory set.

## Files to Change

- `apps/api/src/modules/planning/french-labor-law.ts` (+spec) — per-regime `STATUTORY_LIMITS`
  table, continuous-day detection, vacations rule, rest-days-window rule, 44h/12-week math.
- `apps/api/src/modules/planning/shift-interval.ts` — helper reuse (single-block day), if any.
- `apps/api/src/modules/planning/planning-generation.service.ts` (+spec) — regime pass-through,
  ±14-day window bump, 11-week history preload + live week counters, eligibility wiring.
- `apps/api/src/modules/planning/planning.service.ts` (+spec) — publish validation wiring.
- `apps/api/src/modules/planning/rule-engine.ts` (+spec) — regime-aware statutory delegation
  (if statutory flows through it post-11-8).
- `apps/web/src/i18n/langs/fr.json` / `en.json` — new violation messages.

## Test Plan

- Unit (`french-labor-law.spec.ts`): regime table resolution; 12h boundary (720/721 net);
  amplitude 12/15 vs 13 by day shape; vacations (3 blocks, 2 blocks 1h30+3h, 2h+2h30);
  rest-days windows (satisfied / missing 4th day / no consecutive pair / Sunday corps vs VII);
  44h/12-week (exactly 44h avg OK, +1 min blocked, window straddling months).
- Generation specs: 12h guard shift now fills; VET vs ASV divergence on the same slot;
  partial-fill hole (not illegal assignment) when the new rules bind; replay rejects a
  solver plan violating a new rule → greedy served.
- Guard specs: direct-API `moveShift` violating AC5/AC6 rejected (13-1 path).
- Harness: 13-8 properties re-run green; NFR2 stress budget green.

## Result

Shipped on `feature/KON-139-ccn-worktime-regimes` (ticket KON-139).

**Files changed (12):** `french-labor-law.ts` (+spec, 47 tests): `StatutoryRegime` +
`regimeForJobType` + `CCN_LIMITS`/`CCN_SHARED`, 12h daily cap (720), day-shape-aware
amplitude (12h/15h continuous vs 13h discontinuous), vacation-structure rules, 14-day
rest-days windows (`STATUTORY_WINDOW_DAYS = 14`), history-authoritative 44h/12-week math;
`planning-generation.service.ts` (+spec): `StatutoryEvalCtx` threaded through
scoreAndAssign/repair/replay eligibility, `loadWeeklyHistory` preload, ±14-day statutory
border load, move loader + `createManualShift` regime/12-week wiring;
`move-validation.ts` (+spec): `twelveWeek` ctx + regime-aware statutory call;
`planning.service.ts` (+spec): publish-side regimes, weekly-history preload, SOFT routing
for `REST_DAYS_SUNDAY`, 5 new message keys; `planning-invariants.property.spec.ts`:
regime-aware oracle; `solver-model.ts`: daily bound aligned 600→720 (amplitude left at 13h,
replay-guarded — documented); `fr.json`/`en.json`: 5 statutory message keys each.

**Verification:** planning module 611/611 (Jest), property harness 4/4 (P1 covers the new
HARD set on random fixtures, determinism preserved), full turbo suite 8/8 tasks green
(web 781 incl. i18n parity), `.aped/.last-test-exit = 0`. `tsc --noEmit`: 24 pre-existing
errors on bare develop, 24 with this change — zero introduced. NFR2 stress budgets green.

**Notes:** solver-model daily-bound alignment had no dedicated RED (value alignment
covered by parity specs + harness — no assertion pinned 600). The CP-SAT model does NOT
encode the per-regime continuous-day amplitude nor the new CCN rules; the replay
re-validation enforces them (over-strictness risk only — improve-never-degrade intact).
Deliberate interpretations to revisit if challenged: rest-days rule evaluated on every
FULLY-COVERED sliding 14-day window; unknown pre-Pawly weekly history counts as 0 for the
44h average; échelon-1 vacation relaxation (1h/1h) unsupported (stricter).
