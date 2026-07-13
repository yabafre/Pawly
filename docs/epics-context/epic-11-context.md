# Epic 11 — Context Cache

_Hand-authored 2026-07-08 from the multi-agent planning audit (2 independent audits, 48 sub-agents, 28 confirmed findings, 0 refuted). Consumers: aped-dev, aped-review — **every Epic 11 story MUST read this file first**. Ground truth is the code; line numbers are audit anchors as of commit `2c66709` and may drift — re-locate the symbol, don't trust the number blindly._

---

## 0. Why this epic exists (audit synthesis)

The planning engine is a **soigné greedy, above the MVP standard** (deterministic, O(1) counters, net-minute hour accounting, partial fill, Paris-timezone-correct). It is **not optimal** (single-pass, incompleteness proven by counter-example) — but optimality is not why this epic exists. Two audits, blind to each other, converged on the **same two critical safety bugs**, and both flagged the same reliability and legal-compliance gaps. Fix **safety and compliance before touching optimality**.

**The two convergent criticals (both audits found them independently):**

1. **Regenerating a PUBLISHED month bypasses the entire Story 7-6 guard.** `assertPublishedChangeAcknowledged` (`planning-generation.service.ts:1683-1698`) is only wired to the manual mutations (`moveShift` :1817, `createManualShift` :1932, `deleteShift` :2018). `generateMonthlyPlan` / `deleteGeneratedShifts` run an unconditional `deleteMany` (`:369-375`) that wipes GENERATED shifts of a published month — **including `isConfirmed=true`** — with no acknowledgement, no amendment, no notification. `VarianceEvent` is `onDelete: Cascade` (`Planning.prisma:117`) so no-show/pointing history is destroyed too. → **Story 11-1**.

2. **The generator is blind to MANUAL shifts in the target month.** They survive the `deleteMany` but are never seeded into `assignmentIndex` / `weeklyMinutesCounter` (`:238-266`; `loadBorderWeekShifts` `:3099-3166` only loads *outside* the target month). Result: double-booking and silent contract-hour overrun on any amended month. No DB safety net — no `@@unique` on `Shift` (`Planning.prisma:20-48`). → **Story 11-2**.

**The reliability & compliance gaps (each confirmed):**

- **No French labor law by default.** All hard limits live inside `for (const rule of hardContractRules)` (`:788-835`); zero configured `CONTRACT_COMPLIANCE` rule = zero exclusion. No 10h/day cap, no 13h amplitude, no 35h weekly rest, no max-6-consecutive-days (only a `-8/day` soft penalty capped at `-48`, `:1061-1071`, dominated by `+50/+30` fill bonuses `:1046-1059`). Fields all `.optional()` (`planning-rule.schema.ts:56-62`); nothing seeded (`seed.ts`). → **Story 11-3**.
- **Publication emails fail silently.** `batch-email-publish.ts` configures `maxAttempts:5` (`:18-23`) but `run()` never throws (errors caught+logged `:57-75`, unconditional `{sent}` return `:79`); trigger is fire-and-forget (`:2461-2467`). A Resend outage = no employee notified, no retry, no trace. The recent mail fallback (commit `6dcd029`) does **not** cover `sendSchedulePublicationEmail` / `sendScheduleChangedEmail` (`mail.service.tsx:358-370, :419-427`). → **Story 11-4**.
- **Retry × non-uniqueness = month duplication.** `fetchWithRetry` retries *mutations* on 5xx/ECONNRESET (`apps/web/src/lib/trpc/client.ts:46-53, :70-84, :103`); the delete+create runs in READ COMMITTED with no `isolationLevel` (`:367-391`); the `P2002` catch is dead code (`:392-398`). A reverse-proxy 502/504 during a slow generation can double the whole month. → **Story 11-5**.
- **Amendment flow is non-transactional.** `shift.update` (`:1858`) → `recordAmendment` (`:1700-1709`, separate `updateMany`) → `notifyScheduleChange` run outside a transaction; the router throws before Redis invalidation (`planning.router.ts:300-331`), leaving `schedule:*` stale. Same for create (`:1962→:1977`) and delete (`:2024→:2027`). → **Story 11-6**.
- **Equity resets every January + fix inoperative for un-mapped employees.** `allMonths=[]` in January, December N-1 never loaded (`:596-602`; `equity-counter.service.ts:48-54`); live increment guarded by `if (equity)` without creating the entry (`:347-351`); scoring short-circuits to a flat `+20` (`:964-1009`). A new hire preferentially absorbs Sundays / unpopular shifts. → **Story 11-7**.
- **Rule engine in 3 divergent implementations.** `evaluateRotationEquity` / `evaluateContractCompliance` push to `softViolations` regardless of `ruleType` (`planning.service.ts:184-188, :281-456`); `validateShiftsAgainstRules` ignores `maxWeeklyHours` (`:386-388`) and does not deduct `breakMinutes` (`:392-393`), unlike `preValidateMove` (`:2225-2241, :2192-2194`) and `scoreAndAssign` (`:786-835`). `publishPlan` only blocks on `hard` (`:2385-2389`) → HARD contract/rotation violations pass publication. → **Story 11-8**.
- **Greedy is incomplete (assumed, documented).** Single pass, no backtracking (`:293`); hole on `No eligible employees` (`:1308-1324`); bin-packing counter-example verified. Documented in `docs/reference/planning-algorithm-reference.md:321-331`. Fix with a local repair pass (GRASP), **not** CP-SAT at this scale. → **Story 11-9**.
- **Rotation scoring freezes the event loop.** Re-scans the whole pool per employee per slot, no `await` → NFR2 (<2s) breaks at 50 employees. → **Story 11-10**.

**Full report (scores, roadmap):** artifact published 2026-07-08 — see memory `planning-algo-audit-2026-07`.

---

## 1. Scope from PRD

- **FRs in this epic (all re-covered, none new):** FR3 — configure shift types & contract rules; FR5 — generate draft schedules with holes; FR6 — adjust shifts via drag-and-drop; **FR7 — block shifts conflicting with Hard Rules, EXTENDED to French labor law**; FR8 — flag Soft Rule violations; FR10 — notify employees on publication.
- **NFRs that bind:** NFR2 — generation < 2s with loading feedback > 1s (11-9, 11-10); NFR3 — zero silent failures, all exceptions visible to the Admin (11-1, 11-4, 11-5, 11-6); NFR6 — multi-tenant isolation via `clinicId` on every query; NFR9 — 50 employees without degradation (11-10); NFR10 — concurrent generations across clinics (11-5).

---

## 2. Architecture references

- **Data flow (non-negotiable):** `Page (RSC) → Client Component → Hook → Zsa → Server Action → tRPC Client → NestJS Service → Prisma` (architecture.md § Communication Patterns).
- **Auth:** `subscribedProcedure` + ADMIN role guard on every admin planning procedure; `clinicId` always from `ctx.user.clinicId`, never from client payload. Generation/templates/equity/rules are `isEntitled('professional')`-gated; the subscription is cached in Redis `sub:{clinicId}` for 120s.
- **Planning module map** (`apps/api/src/modules/planning/`):
  - `planning-generation.service.ts` (~3246 lines) — generation loop, `moveShift`/`createManualShift`/`deleteShift`/`preValidateMove`, `publishPlan`, the 7-6 guard. **Touched by 11-1, 11-2, 11-5, 11-6, 11-9, 11-10.**
  - `planning.service.ts` — `validateShiftsAgainstRules`, rotation/contract evaluators. **Touched by 11-8.**
  - `equity-counter.service.ts` / `.scheduler.ts` — equity counters. **Touched by 11-7.**
  - `variance.service.ts`, `presence-confirmation.*` — downstream consumers; `VarianceEvent` cascades on shift delete.
- **Publication state:** `PlanningPeriodStatus` (`@@unique([clinicId, month])`, DRAFT/PUBLISHED, `amendedAt`, `amendmentCount`) — story 7-2/7-6.
- **Notifications:** `MailService.sendBatchSchedulePublicationEmails` + Trigger.dev `batchEmailPublishTask` / `batchPushPublishTask`, fired only inside publish/amendment paths.
- **Validation:** Zod schemas in `packages/validators/src/planning/`; violation messages use structured `messageKey`/`messageParams`, never raw English strings.

---

## 3. Cross-cutting invariants every story MUST preserve

1. **Multi-tenancy:** every query filtered by `clinicId` from `ctx.user`, never from the client. Any client-supplied id (`shiftId`, `periodId`, `employeeId`, `templateId`) is re-verified as belonging to the caller's clinic.
2. **The 7-6 guard contract is now a whole-surface invariant, not a per-endpoint check.** Any code path that mutates shifts of a PUBLISHED month must go through `assertPublishedChangeAcknowledged` + `recordAmendment` + `notifyScheduleChange`. 11-1 extends it to bulk; do not re-open the hole elsewhere.
3. **Determinism:** the generator is fully deterministic (tiebreakers `score → #shifts → #weekends → employeeId`, no RNG). Preserve it — it is the precondition for reproducible bugs, tests, and any future benchmark. 11-9's repair pass must stay deterministic.
4. **Net-minute hour accounting:** hours are always computed with `breakMinutes` deducted, over ISO weeks, UTC arithmetic (DST-safe). Every new rule/eval path must use net minutes (this is exactly what 11-8 unifies).
5. **The correct transactional pattern already exists — generalize it, don't reinvent.** `confirmPresence` is the model: re-check `PUBLISHED` status *inside* the transaction (anti-TOCTOU), CAS via `updateMany`, atomic `VarianceEvent`. 11-5 and 11-6 apply this shape; 11-1 preserves confirmed shifts the same way.
6. **Never delete confirmed or past data on regeneration.** `deleteMany` on a month must exclude `isConfirmed=true` and past days (11-1), and `VarianceEvent` cascade must not silently erase history.
7. **No silent failure (NFR3):** every hole carries a visible reason; every notification outage is observable; every hard violation blocks publication.

---

## 4. Per-story anchor map (start from ground truth, verify the symbol)

| Story | Primary files (audit anchors) |
|-------|-------------------------------|
| 11-1 | `planning-generation.service.ts` guard `:1683-1698`, call-sites `:1817/:1932/:2018`, bulk `deleteMany :369-375`, `generateMonthlyPlan :117-418`; `packages/validators/src/planning/planning-generation.schema.ts` (add `acknowledgePublishedChange`); `Planning.prisma:117` (VarianceEvent cascade) |
| 11-2 | `:238-266` (counter seeding), `loadBorderWeekShifts :3099-3166`, overlap `:744-757`; `apps/api/prisma/schema/Planning.prisma:20-48` (add partial `@@unique`) |
| 11-3 | `hardContractRules :734-736, :788-835`, `minRest :810-834`, consecutive-day penalty `:1061-1071`; `packages/validators/src/planning/planning-rule.schema.ts:56-62`; `apps/api/prisma/seed.ts` |
| 11-4 | `apps/api/src/trigger/tasks/batch-email-publish.ts:18-23, :57-75, :79`; trigger fire `:2461-2467` / fallback `:2470`; `mail.service.tsx:358-370, :419-427`; caller `:1754` |
| 11-5 | `apps/web/src/lib/trpc/client.ts:46-53, :70-84, :103`; generation tx `:367-391` (add `isolationLevel` + `pg_advisory_xact_lock`); dead `P2002 :392-398` |
| 11-6 | `shift.update :1858`, `recordAmendment :1700-1709 / :1878`, create `:1962→:1977`, delete `:2024→:2027`; `planning.router.ts:300-331` (Redis invalidation in `try/finally`) |
| 11-7 | `:596-602` (window), `equity-counter.service.ts:48-54`, live increment `:347-351`, scoring shortcut `:964-1009` |
| 11-8 | `planning.service.ts:184-188, :281-456, :386-388, :392-393`; `preValidateMove :2192-2194, :2225-2241`; `scoreAndAssign :786-835`; `publishPlan :2378-2411` |
| 11-9 | greedy loop `:293`, hole `:1308-1324`; `docs/reference/planning-algorithm-reference.md:321-331`; depends on 11-8's evaluator |
| 11-10 | rotation scoring `countTargetDayShifts` loop (no `await`); `:1049` (dominant weekly-capacity term) |

---

## 5. Lessons applicable

- **L-audit — "verified" means every guard entry-point, not one.** The 7-6 E2E tested only the manual-move path (guarded) and missed the bulk-regenerate path (bypassed). A guard with N call-sites is verified only when all N that *should* trigger it are exercised. Scope: every story that adds/extends a guard (11-1, 11-8), and their QA gate.
- **L1 — Never mix Zsa tuple returns with TanStack Query direct returns** (`apps/web` hooks bridging Zsa ↔ React Query).
- **L2 — Unit/integration tests do not replace real user-journey testing.** 428 green tests still let 3 CRITICAL runtime bugs through (and this audit found 2 more the tests never covered).
- **L3 — Reviews must cross-reference the PRD and architecture, not just the code.**
- **L4 — Consult up-to-date docs (Context7) for third-party SDKs; record sources in Dev Notes** (Prisma advisory locks, transaction isolation, Trigger.dev retry semantics all matter here).
- **L5 — SWC builds emit no `.d.ts`; the `tsc -p tsconfig.types.json` pass in `apps/api` build is load-bearing** for `@pawly/api/trpc-types`.

---

## 6. Environment & convention gotchas (from project memory)

- **Redis:** subscription cache `sub:{clinicId}` (120s); schedule caches `schedule:*`. React Query invalidation is **prefix-only** (`["planning"]`, not full keys) — full keys silently miss dynamic sub-keys.
- **Planning grid drag is keyboard (dnd-kit)**, not pointer — relevant for any 11-x E2E on the grid.
- **API tests:** Jest `*.spec.ts` in `apps/api`. Web tests: Vitest `*.spec.ts`. Validators: Vitest `src/**/*.test.ts`.
- **Never `rm -rf .next`** (kills `routes-manifest.json`; only `pnpm build` regenerates it). All pnpm from repo root, never `cd apps/*`.
- **date-fns is NOT installed in `apps/api`** — use native JS date utilities server-side.
- **`AuthenticatedUser` has no `employeeId`** — resolve via `prisma.user.findUnique({ where: { id: ctx.user.sub }, select: { employee: { select: { id: true } } } })`.

---

## 7. Linear tickets

Milestone *Epic 11 — Planning Engine Hardening & Compliance* (project **Pawly**, team **Koni**). Dependencies are wired as blocked-by relations.

| Story | Ticket | Blocked by |
|-------|--------|-----------|
| 11-1 | KON-118 | — |
| 11-2 | KON-119 | KON-118 |
| 11-3 | KON-120 | — |
| 11-4 | KON-121 | — |
| 11-5 | KON-122 | KON-119 |
| 11-6 | KON-123 | KON-118 |
| 11-7 | KON-124 | — |
| 11-8 | KON-125 | KON-119, KON-120 |
| 11-9 | KON-126 | KON-119, KON-125 |
| 11-10 | KON-127 | KON-119 |

**Wave order:** W1 (parallel) 11-1 · 11-3 · 11-4 · 11-7 → W2 11-2 · 11-6 → W3 11-5 · 11-10 · 11-8 → W4 11-9. Critical quick wins (~1-2 weeks): 11-1, 11-2, 11-4, 11-5.

---

## 8. Previous stories — outcomes

_(Appended by aped-review at story→done. Empty on first story of the epic.)_

### Story 11-9-local-repair-pass-grasp — done 2026-07-13T00:15:00Z

- **Decisions:** A bounded GRASP local-repair pass runs after the greedy loop, before persistence — Phase 1 fills holes via depth-≤2 ejection chains, Phase 2 rebalances weekend/Saturday load via equity hill-climbing swaps. Decision core is a pure module (`local-repair.ts`, beside `rule-engine.ts` / `french-labor-law.ts`), NOT a `@pawly/*` package. The ejection MOVER is checked on **post-removal** state (revising the story's locked "pre-move" scope — a hole exists precisely because no one is eligible now, so a pre-move check makes AC1 unsatisfiable; user-approved). The equity objective is deliberately **generated-only** (survivors immovable / out of scope); eligibility still accounts for survivors, so this is a fairness-quality choice, never a validity one.
- **Files:** `apps/api/src/modules/planning/local-repair.ts` (+spec) NEW; `planning-generation.service.ts` (+spec) MODIFY; `docs/reference/planning-algorithm-reference.md` MODIFY (Known Limitations bullet 1 → local-repair; bullet 4 → deterministic tiebreaker).
- **Contracts:** `local-repair.ts` exports `computeLoads` / `equityObjective` / `findEjectionChain` (6-arg: gained an `isMoverEligibleForHole` mover predicate) / `selectImprovingSwap` (O(A²) delta-based) + types (`RepairSlot` / `RepairAssignment` / `EmployeeLoad` / `EjectionChain` / `EquitySwap` / `IsEligible` / `MoverEligibility`). Service adds shared `evaluateEligibility` (used by both `scoreAndAssign` and the pass — the single per-employee predicate; surfaces `blockedOnlyByRotation`), counter-safe `applyAssignment` / `removeAssignment` (exact inverses over all live counters; `quarterlyDayOfWeekCounts` is fixed history, never mutated), `recomputeHoles`. `generateMonthlyPlan` signature + `GenerationResult` shape unchanged (holes now recomputed post-repair). Internal `enableRepair` test seam — NOT tRPC-forwarded.
- **Deviations from plan:** ejection mover evaluated post-removal (above); AC1 counter-example fixture rebuilt to a genuine MRV-defeating case (2 Mondays, HARD monthly cap invisible to MRV, VACATION); `selectImprovingSwap` optimized to O(A²) (7.7s→0.2s at 50-emp). aped-review closed 4 MAJOR test-coverage/doc gaps (commit `e61a432`): added the AC2 end-to-end equity-swap integration test, made the AC3 no-violation assertion non-vacuous (independent cap recompute), added a Phase-1 scarcity NFR2 stress (~86 real holes, <0.8s), documented the generated-only objective / revert-free swaps / `enableRepair` seam.

- **Decisions:** `rule-engine.ts` (pure, in-app, NOT a `@pawly/*` package) is the single CONTRACT_COMPLIANCE/ROTATION_EQUITY evaluator for all three write paths; HARD breaches land in `hardViolations` → publish 409. **Weekly contract floor `min(contractHours, maxWeeklyHours)` applies ONLY to rules declaring ≥1 hour cap** — capless rules (the seeded 11-3 statutory row, rest-only) evaluate nothing post-hoc: `contractHours` is a contractual base, not a legal limit, and must never gate publication under the "labor law" label (review finding m3, 2 fix attempts). Validation now respects `applicableJobTypes` on rotation (accepted behaviour change, pinned). Weekly SOFT violations carry NO `equityContext`; monthly keeps it.
- **Files:** `apps/api/src/modules/planning/rule-engine.ts`(+spec) NEW; `planning.service.ts`(+spec), `planning-generation.service.ts`(+spec) MODIFY; `apps/web/src/i18n/langs/{fr,en}.json` (`weeklyOvertime`, 2 namespaces).
- **Contracts:** engine exports `netMinutes`/`isoWeekStart`/`isoWeekday`/`evaluateContractCompliance`/`evaluateRotationEquity`/`violatesHardContractIncremental`/`violatesHardRotation` + types (`RuleType`/`EvaluatorRule`/`EvalShift`/`RuleViolation`). New messageKey `violations.contractCompliance.weeklyOvertime`; `messageParams.date` is FR-formatted `DD/MM/YYYY`, `affectedDate` stays ISO (grid conflict key). 11-9's repair pass MUST consume this evaluator.
- **Deviations from plan:** aped-review fixed 7 findings (1 MAJOR: untested applicableJobTypes change on validation). The first m3 fix (unconditional weekly floor) turned the statutory row into a 35h/week publication gate on every clinic — caught at fix-verification, re-scoped with the capless guard. **Follow-up ticket-worthy:** gen/move still over-constrain `contractHours` weekly via capless rules (pre-existing since 11-3), stricter than validation; `merge-findings.mjs` missing from the 6.14 scaffold.

### Story 11-7 — done 2026-07-12T18:00:00Z

- **Decisions:** Generation equity now scores over a rolling 12-month window (`EquityCounterService.getCountersForWindow`, absolute-month arithmetic, crosses the year boundary) so a January generation sees December N-1 and equity never resets on 1 January. Every active employee is seeded with a zero-init equity entry BEFORE the slot loop (`getOrCreateEquityEntry`), making `getAverageEquity`'s denominator the whole workforce and keeping averages order-independent (invariant #3); the flat `+20` un-mapped fallback is gone and both live increments (survivor + assignment) route through create-if-absent. `getCountersForPeriod` and its callers (schedule-view, quarterly, recalculation) are untouched; window length is the constant `EQUITY_WINDOW_MONTHS = 12`, not clinic-configurable.
- **Files:** `apps/api/src/modules/planning/equity-counter.service.ts` (+spec); `apps/api/src/modules/planning/planning-generation.service.ts` (+spec).
- **Contracts:** New `EquityCounterService.getCountersForWindow(clinicId, year, month, windowMonths=12, counterTypes?) → CounterWithEmployee[]` (rolling cross-year window; returns `[]` for a non-positive window). New private `getOrCreateEquityEntry(equityMap, employeeId)`. `generateMonthlyPlan` contract unchanged. **11-8 (unified rule engine) must keep the up-front seeding — it is the determinism precondition — and must not reintroduce a flat un-mapped equity bonus.**
- **Deviations from plan:** none in the shipped mechanism (RED/GREEN applied verbatim). aped-review added 3 tests + 2 hardenings: the inactive-employee-survivor create-branch test (AC3), a behavioural generated-distribution test replacing the spy-only AC2 coverage, removal of the dead `if (equity)` guard, and a `windowMonths <= 0` guard. **Open follow-up:** a PUBLISHED-January QA journey (Dec N-1 history + one new hire) for the end-to-end fairness magnitude — deferred by the story's documented workload confound, not encoded as a brittle unit assertion.

### Story 11-10-generation-performance-under-load — done 2026-07-12T17:53:35Z

- **Decisions:** Rotation-equity counting is now an incremental per-`(employee, ISO-weekday)` index (`dayOfWeekCounts` live + `quarterlyDayOfWeekCounts` one-shot), seeded at the same three points as the FIX-4 counters (border / survivors / per-assignment); the three evaluators keep separate call sites but count via `countFromDayIndex` — 11-8's unification must preserve (or consciously rebuild) this mechanism. Async offload to Trigger.dev is DEAD for now: esbuild strips `emitDecoratorMetadata` → Nest DI resolves `undefined` graph-wide inside a Trigger task; a future retry needs decorator-metadata support (e.g. `@anatine/esbuild-decorators`) or explicit `@Inject()` tokens. AC2 shipped as an in-process `setImmediate` yield every 8 slots (no yield under 8 slots, accepted).
- **Files:** `apps/api/src/modules/planning/planning-generation.service.ts` (+spec).
- **Contracts:** `scoreAndAssign` now takes 12 params (appended `dayOfWeekCounts`, `quarterlyDayOfWeekCounts`); the 3 rotation evaluators take the two indexes instead of `alreadyAssigned`/`quarterlyShifts`. Any story that adds/moves assignments outside `result.assigned` MUST increment the index in lockstep (11-9's repair pass especially). Spec helper `callScore` auto-builds both indexes.
- **Deviations from plan:** Spike KO → branch 6B (router/frontend untouched — `generatePlan` still returns a synchronous `GenerationResult`). T5b HARD test rewritten as a two-employee exclusion pin (the pre-existing relaxation fallback re-admits blocked employees rather than leaving a hole). Benchmark needed a `listShiftTypes` mock override + one live SOFT ROTATION_EQUITY rule to actually exercise the hot path. aped-review scoped the "pre-existing tests staying green = equivalence proof" claim to the tests that actually discriminate (2 named pre-existing ROTATION_EQUITY tests pass even with a sabotaged index — fixture tiebreak confound; the real proof is 3 T5b + 2 discriminating tests, RED under sabotage).

### Story 11-4 — done 2026-07-10T14:42:00Z

- **Decisions:** Notification reliability = three enforced faces of NFR3. The batch task (`batch-email-publish`) throws **only on send failures** so `maxAttempts:5` retries a transient Resend outage, and chunks over the **stable input `emails` array** (render per chunk) so each per-chunk idempotency key `<seed>-cN` stays anchored to the same recipients across retries — render failures are counted into the failure metric but **not** retried (deterministic bad data). The singular mail methods fall back to a direct Resend send and return a **boolean** (never throw) so one bad recipient never aborts the caller loop. `emailSendCounter` is emitted on the batch + direct-fallback paths only.
- **Files:** `apps/api/src/trigger/tasks/batch-email-publish.ts`(+spec), `apps/api/src/modules/mail/mail.service.tsx`(+spec), `apps/api/src/modules/planning/planning-generation.service.ts`(+spec).
- **Contracts:** `batchEmailPublishTask` payload gained `idempotencyKey?: string` (seed `schedule-publish/<clinicId>:<month>:<publishedAtMs>`; `publishPlan` always passes it — a legitimate re-publish gets a fresh key). `sendScheduleChangedEmail` / `sendSchedulePublicationEmail` now return `Promise<boolean>` (were `void`) — **any caller must react to the status**. `notifyScheduleChange` fire-and-forget preserved (`.catch`→`logger.error`) — 11-6 must keep it out of its transaction.
- **Deviations from plan:** none in the shipped mechanism. aped-review added 6 tests + 4 hardenings: chunk over input array (idempotency-key stability), count render failures in the metric, `attempted`-not-`unique.length` denominator, and the multi-chunk/partial-failure + loop-continuation coverage the plan's specs omitted. **Open follow-up:** the Trigger-worker single-send path (`send-email.ts`) still emits no `emailSendCounter` — deferred by the type-string-normalisation Non-Goal; ticket-worthy.

### Story 11-2 — done 2026-07-10T00:00:00Z

- **Decisions:** The generator is now aware of in-month **surviving** shifts (deleteMany complement: `source≠GENERATED ∨ isConfirmed ∨ varianceEvents:{some:{}}`), seeded into every counter before the slot loop. **AC3 coverage subtraction must be gated exactly like AC1 eligibility** — a survivor credits a slot's `requiredStaff` only when it time-overlaps the slot's *live-resolved* hours (`ClinicShiftType`, not the survivor's frozen hours) AND its `jobType` satisfies `requiredJobTypes`; keying coverage on `date|shiftTypeCode` alone silently masks staffing gaps (the aped-review BLOCKER). Anti-duplicate net is the DB `@@unique([employeeId, date, startTime])` on `Shift`.
- **Files:** `apps/api/prisma/schema/Planning.prisma`; `apps/api/src/modules/planning/planning-generation.service.ts`; `apps/api/src/modules/planning/planning-generation.service.spec.ts`.
- **Contracts:** `Shift` now has `@@unique([employeeId, date, startTime])` — any path writing shifts (11-5 retry net, manual create/move) must expect a P2002 on exact same-start collisions. New private `loadSurvivingShiftsInMonth` + `SurvivingShift` type (carries `jobType`). `scoreAndAssign` signature unchanged (AC3 uses a slot clone). `generateMonthlyPlan` now issues **two** `shift.findMany` (border `where.date.in` + survivors `where.OR`) — tests must key mocks on the predicate.
- **Deviations from plan:** aped-review found + fixed a BLOCKER — the shipped AC3 coverage map (`date|shiftTypeCode`) ignored time-overlap and jobType, silently under-staffing a slot when a survivor's frozen hours/jobType diverged from the live slot (reachable via a shift-type-hours edit or `moveShift`, which keeps frozen times + flips `source:MANUAL`). Coverage now gated on `timesOverlap` + `requiredJobTypes`, loader selects `employee.jobType`; +3 tests (2 BLOCKER pins RED→GREEN, 1 AC1 monthly-cap). Also fixed the `filledSlots` metric to count survivor-covered positions (accurate fill %). Verified live (headed Chrome DevTools) by regenerating a PUBLISHED month with 4 survivors: 4/4 preserved, 0 double-bookings, 0 exact duplicates. `db push` needed `--accept-data-loss` + one pre-existing duplicate de-duped (kept earliest). API 870 tests green.

### Story 11-1 — done 2026-07-09

- **Decisions:** The 7-6 published-change guard is now a whole-surface invariant — both bulk paths (`generateMonthlyPlan`, `deleteGeneratedShifts`) route through `assertPublishedChangeAcknowledged` → `recordAmendment` → `notifyScheduleChange`. The bulk `deleteMany` preserves `isConfirmed=true` and `varianceEvents:{none:{}}` shifts **unconditionally** (DRAFT + PUBLISHED). Notify is fire-and-forget (`.catch` → `logger.error`), never blocks the operation.
- **Files:** validators `planning-generation.schema.ts`(+test); api `planning-generation.service.ts`(+spec), `planning.router.ts`(+spec); web `_hooks/useGeneration.ts`(+new `useGeneration.spec.tsx`), `GenerationPanel.tsx`, `__tests__/generation.spec.tsx`, `i18n/langs/{fr,en}.json`.
- **Contracts:** `acknowledgePublishedChange: z.boolean().default(false)` added to `generatePlanSchema` + `deleteGeneratedShiftsSchema`; both service methods gained `options: { acknowledgePublishedChange? }`; router threads it and adds `planning:pub:*` Redis invalidation. Toast key `admin.planningGeneration.toast.publishedChangeRequired` (fr/en).
- **Deviations from plan:** `planning.router.spec.ts` added (ack-flag arity + `planning:pub` tests). Task-5 generate mock reworked to key on the `varianceEvents` predicate (shared `shift.findMany` with `loadBorderWeekShifts`). aped-review added a generate-path FE test, `useGeneration.spec.tsx` (AC6), and two notify-failure service tests (AC4). **Wave dependency stands:** generator-awareness of surviving shifts + DB `@@unique` → 11-2 (ship together); transactional re-check → 11-6; idempotency/locks → 11-5.
