# Pre-Mortem Report

**Date**: 2026-07-02
**Scope**: Pawly MVP production launch (PRD: bilingual SaaS scheduling PWA for veterinary clinics — epics 1–10 complete, 35 stories done)
**Premise**: It is 2026-07-16, two weeks after launch. Real veterinary clinics signed up. The launch failed. Here's what we found.

> **Method.** Five failure categories (technical, scope, integration, process, user) were investigated independently against the actual codebase — every scenario below is anchored to repo-verified evidence (`file:line`), not speculation. The process investigator additionally queried the live SigNoz instance. Scenarios fully mitigated by existing code were discarded during verification (see "Already mitigated" at the end).

## Top Risks (ranked)

### CRITICAL

1. **[HIGH×CRITICAL] R1 — Silent post-publication schedule edits made employees miss shifts.**
   `moveShift` and `createManualShift` work identically on PUBLISHED periods: no status guard, no notification, and a moved shift keeps `isConfirmed=true` on its new date. Email/push fire **only** inside `publishPlanning`; no "schedule changed" template exists among the 13 email templates; nothing in the UI prompts a re-publish. Employees who already checked their week (PWA cache persisted 24h, `offlineFirst`) show up on the old shift — the fastest possible way to kill the "System Never Lies" promise.
   *Evidence*: `apps/api/src/modules/planning/planning-generation.service.ts:1444-1517` (moveShift), `:1519-1569` (createManualShift), `:1937-1975` (notifications only in publish); `apps/web/src/app/[locale]/dashboard/_components/DashboardQueryProvider.tsx:14-25`.

2. **[HIGH×CRITICAL] R2 — Confirmation slider collapses into false no-shows and "2880 minutes late" records.**
   No confirmation reminder exists anywhere (none of the six Trigger.dev tasks covers it). A midnight cron stamps every unconfirmed shift NO_SHOW; when an employee backfills days later (allowed — only future shifts are blocked), `actualTime = new Date()` produces multi-thousand-minute deltas shown raw in a toast, and **no code path ever reconciles the NO_SHOW event** after a late confirmation. Admins find their most reliable staff flagged as absentees and stop trusting variance data (the payroll bridge).
   *Evidence*: `apps/api/src/modules/planning/presence-confirmation.scheduler.ts:19`; `presence-confirmation.service.ts:68,73,88-94`; `apps/web/.../schedule/_components/ShiftDayCard.tsx:15,22,50` (sends only `{shiftId}`); `useConfirmShift.ts:65-75`; no resolve logic in `variance.service.ts`.

3. **[HIGH×CRITICAL] R3 — CI never runs a single test; no e2e on the money path.**
   The only CI workflow runs `pnpm turbo run build` — none of the 2,327 tests executes automatically. No Playwright/Cypress anywhere; the registration → checkout → onboarding → publish → confirm path has zero end-to-end coverage, and unit tests mock exactly the seams (tRPC context, zsa, Stripe webhooks) where integrations break. "Always run tests before PR" is an unenforced manual convention.
   *Evidence*: `.github/workflows/build.yml:38-41`; only `build.yml` + `trigger-deploy.yml` exist; `package.json:19` test script never invoked in CI.

4. **[HIGH×CRITICAL] R4 — Production down for hours with nobody knowing.**
   Live SigNoz query (`signoz_list_alerts`): **zero alert rules configured**. No uptime check references the existing `/health` endpoint. And `nixpacks.toml` runs API+Web in one Dokploy service — one app crashing takes both down (crash-loop takes the marketing site with it). Time-to-detection = time-to-first-customer-complaint; the 99.5% availability NFR is unverifiable and undefended.
   *Evidence*: live SigNoz API result `{"data":[],"total":0}`; `nixpacks.toml:19-22`; `apps/api/src/main.ts:180`; tech-spec defers alerting to "Phase 2".

5. **[MEDIUM×CRITICAL] R5 — `db:push` against live Neon destroys clinic data.**
   No `migrations/` directory exists; the documented workflow for every schema change is `pnpm db:push` against whatever `DATABASE_URL` sits in the root `.env` (same command, same env file, dev and prod). `db:push:force` (`--accept-data-loss`) is a first-class root script. No mention of backups, PITR, restore or rollback anywhere in docs. One post-launch hotfix away from silently dropping live confirmation data.
   *Evidence*: `apps/api/prisma/` (no migrations dir); `apps/api/package.json:28-29`; root `package.json:14`; `docs/architecture.md` — zero matches for backup/PITR/restore.

6. **[MEDIUM×CRITICAL] R6 — Auth-critical emails silently swallowed when Trigger.dev fails.**
   In production (`TRIGGER_SECRET_KEY` set), all email goes through `triggerSendEmail`, which catches every error and only logs it — no rethrow, no fallback to direct Resend. If Trigger.dev is down or the deploy is stale, magic links and OTP codes (the **only** employee auth) silently stop, while the UI reports success. Direct violation of NFR3 "zero silent failures" at the most critical path.
   *Evidence*: `apps/api/src/modules/mail/mail.service.tsx:37-47` (swallow), `:61-63` (magic link path).

7. **[MEDIUM×CRITICAL] R7 — Email deliverability is a single point of failure for all authentication.**
   Employee login is 100% email-dependent (magic link + OTP both arrive by email). Deliverability (SPF/DKIM/DMARC, domain reputation, spam placement at launch on a fresh domain) cannot be verified from the repo and no alert watches the existing `emailSendCounter` failure metric. If launch emails land in spam, the >90% unassisted-adoption target dies quietly.
   *Evidence*: `mail.service.tsx` (counter exists, unalerted); OTP fallback exists (`auth.controller.ts`) but is email-delivered too.

### MAJOR

8. **[HIGH×MAJOR] R8 — No printable schedule; clinics keep Excel as the real artifact.**
   French clinics must physically display working hours (*affichage des horaires*) and every target clinic pins a paper planning in the break room. The product has zero print support: no `@media print`, no `window.print`, no PDF export; the only export in the entire product is the variance CSV. Admins re-type Pawly output into Excel — the product **adds** a step, inverting the "3-5h → 30-45min" pitch.
   *Evidence*: repo-wide grep for print matches only `PawPrint` icons; `variance.service.ts:169-227` is the sole export endpoint.

9. **[HIGH×MAJOR] R9 — Franglais error/violation messages break trust with French-first users.**
   The API builds violation messages, hole reasons, publish errors and OTP errors as interpolated **English** prose; the web layer regex-patches ~6 fragments and passes the rest through verbatim ("Hard rule violated: STAFFING_MINIMUM", "Too many attempts. Check email for login link." on a French screen). Half-translated errors read as an unfinished product exactly when something goes wrong.
   *Evidence*: `planning-generation.service.ts:755,780,802,818,1878`; `HealthBarDetailPopover.tsx:38-64,210`; `auth.service.ts:352,379,406`; `useAuth.ts:14-32`; `useAdminAbsences.ts:49-50`.

10. **[HIGH×MAJOR] R10 — The free Starter tier fits the typical clinic; nobody upgrades.**
    `TIER_LIMITS`: starter = 10 employees, professional = 20. A typical French vet clinic runs 5–15 staff — most target customers fit the free tier **forever**, with planning, PWA and notifications all included. The ">80% trial→paid within 30 days" success criterion is structurally unreachable with the current limit as the only gate.
    *Evidence*: `packages/validators/src/stripe/subscription-status.schema.ts:13-17`.

11. **[MEDIUM×MAJOR] R11 — Shared staff between clinics cannot be onboarded.**
    `User.email` is globally `@unique` with a single `clinicId`. Multi-employer ASVs and locum vets (*remplaçants*) — standard in French veterinary staffing — trigger "already exists in another clinic" (raw English, shown verbatim in a toast). The observed workaround (create employee without email) silently strips login, notifications and the confirmation slider.
    *Evidence*: `apps/api/prisma/schema/User.prisma:8,13`; `employee.service.ts:126-129,136-141`; `planning-generation.service.ts:1911` (publish email filters `email != null`).

12. **[MEDIUM×MAJOR] R12 — Split-brain deploy: API updates, Trigger.dev keeps sending stale emails.**
    `trigger-deploy.yml` fires only on `apps/api/src/trigger/**`, `trigger.config.ts`, `prisma/**` — but the tasks import all 13 templates from `apps/api/src/modules/mail/templates/`, **outside the filter**. A template/URL fix ships to Dokploy while prod Trigger.dev renders the old version. No staging environment exists to catch it.
    *Evidence*: `.github/workflows/trigger-deploy.yml:7-10`; `send-email.ts:4-10` imports.

13. **[MEDIUM×MAJOR] R13 — Solo operator, no runbook, fragile env plumbing.**
    No runbook/incident/support playbook anywhere in docs for the highest-frequency events (admin locked out, magic link missing, webhook stuck). Production boot depends on dotenv-cli parsing the root `.env` — and `.env.example` still ships 6 lines of U+2500 box-drawing characters, the exact documented dotenv-cli breakage. Bus factor of 1 turns a minor email blip into churn.
    *Evidence*: docs grep (no runbook); `package.json:9`; `.env.example` UTF-8 lines; `nixpacks.toml:4-6`.

14. **[MEDIUM×MAJOR] R14 — Planning cold start: onboarding ends at a blank engine.**
    The wizard creates work days, hours and shift types — but **no default PlanningRules and no starter template**. Before the first generation, a non-technical vet must invent staffing minimums, rotation rules and week templates from empty screens. The "wow" moment (Tetris Negotiation journey) sits behind the steepest configuration cliff in the product.
    *Evidence*: `planningRule.create` only in admin-driven `planning.service.ts:64`; `clinic.service.ts:101` seeds shift types only.

15. **[MEDIUM×MAJOR] R15 — Generation runs inline in the tRPC request; NFR10 was never implemented.**
    `planning.generatePlan` awaits `generateMonthlyPlan` directly — the architecture's queue (BullMQ, later Trigger.dev) for concurrent generation was never wired. Concurrent clinic generations compete in-process and share an unbounded-default `pg` Pool against serverless Neon. Duration metric exists; nothing acts on it.
    *Evidence*: `apps/api/src/trpc/routers/planning.router.ts:211-215`; `prisma.service.ts:10-18` (no pool sizing); `planning-generation.service.ts:112,339`.

## Mitigation Plan

| # | Risk | Mitigation | Owner | Verification |
|---|------|-----------|-------|--------------|
| R1 | Silent post-publication edits | Guard `moveShift`/`createManualShift` on PUBLISHED periods: require explicit republish flow; send "schedule changed" notification; reset `isConfirmed` when a confirmed shift moves; bump client cache | Dev | New story ACs + API tests: mutation on published period without republish → 409; e2e: move published shift → employee receives email |
| R2 | False no-shows / absurd deltas | Reconcile (resolve) NO_SHOW on late confirmation; backfill uses planned time as `actualTime` default (or asks); add `confirmation-reminder` Trigger task; cap/reword large deltas in UI | Dev | Unit tests: late confirm resolves NO_SHOW, backfill delta = 0 by default; metric alert on `\|delta\| > 600` |
| R3 | CI runs no tests | Add `pnpm turbo run test` job to `build.yml` (blocking); add a minimal Playwright smoke on the money path (register → onboard → publish → confirm) | Dev | PR checks show test job; smoke e2e green in CI |
| R4 | Undetected outages | Create SigNoz alerts **via UI** (API error rate, event-loop, email failure counter, webhook failures) + external uptime ping on `/health` (SigNoz is self-hosted on the same infra — the watcher must live elsewhere); split API and Web into separate Dokploy services | Ops | Fire drill: kill API container → alert received < 5 min; marketing site stays up |
| R5 | db:push data loss | Baseline Prisma migrations (`migrate dev` locally, `migrate deploy` in prod); remove `db:push:force` from root scripts; verify Neon PITR window and rehearse one restore; document rollback | Dev/Ops | `migrations/` exists; deploy runbook includes restore-tested date; oracle: no `db push` in prod docs |
| R6 | Silent email swallow | In `triggerSendEmail`: rethrow (or fallback to direct Resend send) for auth-critical types (magic-link, OTP, password-reset); alert on failure counter | Dev | Unit test: Trigger failure → exception surfaces / fallback sends; SigNoz alert on `email_send{outcome=failure}` |
| R7 | Deliverability SPOF | Pre-launch checklist: SPF/DKIM/DMARC verified, seed-list spam test (Gmail/Outlook/Orange), Resend webhook → failure alert; document "link not received" support path (OTP resend) | Ops | mail-tester score ≥ 9; alert fires on synthetic bounce |
| R8 | No printable schedule | Add print stylesheet or server-rendered month PDF for published plannings | Dev | AC: printed month legible on A4; support FAQ entry |
| R9 | Franglais errors | API returns i18n **codes + params** (no English prose) for violations/auth errors; web translates all codes; delete regex patching | Dev | Oracle: grep — no interpolated English sentences in thrown exceptions; fr snapshot tests on health-bar popover |
| R10 | Free tier too generous | Business decision: lower Starter cap (e.g. 5) and/or gate generation runs, notifications or history depth by tier; instrument upgrade funnel | Alex | Funnel dashboard live at launch; pricing revisited with real data at +30d |
| R12 | Split-brain Trigger deploy | Add `apps/api/src/modules/mail/**` (and any task-imported paths) to `trigger-deploy.yml` `paths:` | Dev | Editing a template triggers the workflow (dry-run PR) |
| R13 | No runbook / env fragility | Write ops runbook (locked-out admin, missing magic link triage: Resend vs spam vs stale Trigger, webhook replay, deploy rollback); ASCII-only `.env.example` | Ops | Runbook committed under `docs/reference/`; new-env bootstrap tested from `.env.example` |
| R14 | Blank-engine cold start | Seed default PlanningRules + one starter week template at onboarding completion (from wizard answers); "first planning" guided empty state | Dev | e2e: fresh clinic reaches a generated draft in < 10 min without docs |

## Accepted Risks (no mitigation, explicit decision)

- **R15 (inline generation)** — accepted short-term: current algorithm is O(1)-optimized and fast at MVP scale; **watch** the existing `planningGenerationDuration` metric and revisit queueing when p95 > 1s or clinic count > ~30. Set an explicit pool size on `pg` Pool as cheap insurance.
- **R11 (shared staff / email uniqueness)** — full multi-clinic membership is a schema-level change (Phase 2 multi-tenancy). Interim only: localize the error and document the limitation for sales; track `Employee.email = NULL` counts as the signal.
- **Single-VPS + Neon single-region** vs 99.5% NFR — accepted for MVP economics; R4 mitigations (alerting + service split) reduce blast radius.
- **No Excel import of existing staff/schedules** — accepted; onboarding friction watched via time-to-first-publish metric.
- **Manual holiday entry** (no French jours-fériés calendar preloaded) — minor; candidate for a quick win later.
- **Desktop-first admin** — per PRD; solo-vet phone administration remains a known gap.

## Signals to watch during implementation

- Shifts with `updatedAt > publishedAt` climbing past the <10% PRD target; NO_SHOW events on shifts moved after publication (R1).
- Week-1 confirmation rate < 50%; `VarianceEvent` rows with `|deltaMinutes| > 600`; PENDING NO_SHOW on confirmed shifts (R2).
- First prod bug in a flow unit tests "cover" (R3). Any incident detected by a customer email rather than an alert (R4).
- Destructive DDL in Neon console history from a laptop (R5). Trigger.dev deploy timestamp older than latest main deploy (R12).
- Support tickets quoting English error text from French users (R9); "comment imprimer le planning ?" tickets (R8).
- Rising `Employee.email = NULL` in multi-clinic postcodes (R11). Upgrade-funnel conversion near zero at +30 days (R10).

## Recommended downstream additions

**New stories (via aped-story):**
- `7-6 post-publication-change-management` — R1 (status guard, republish flow, changed-schedule notification, isConfirmed reset).
- `8-4 variance-reconciliation-and-reminders` — R2 (NO_SHOW resolution, backfill actualTime, reminder task, delta UX).
- `10-5 printable-published-schedule` — R8.
- `10-6 i18n-error-codes` — R9 (API codes, web translation, delete regex patching).
- `E9-hardening` (ops batch) — R4, R5, R7, R13: alerts, migrations baseline, restore rehearsal, runbook, service split.

**Quick fixes (via aped-quick):** CI test job (R3); `trigger-deploy.yml` paths (R12); `triggerSendEmail` rethrow/fallback for auth-critical mails (R6); ASCII `.env.example` (R13); explicit `pg` Pool `max` (R15).

**Red-flag rows for aped-dev:**
- Any mutation touching a PUBLISHED planning period without notification/republish logic.
- Any user-facing string thrown from the API as English prose instead of an i18n code.
- Any doc/command referencing `db:push` in a production context.
- Any new Trigger.dev task importing files outside the deploy workflow's `paths:` filter.

**Oracle checks:** CI must run tests before any story review passes; `apps/api/prisma/migrations/` must exist before the next schema-touching story merges.

## Already mitigated (verified, dropped from ranking)

- Backfill confirmation is allowed (only future shifts rejected — `presence-confirmation.service.ts:68`), and `no-show-detection` exists — the *detection* half of R2 works; only reconciliation/reminders are missing.
- Global rate limiting exists (`ThrottlerModule` + global `ThrottlerGuard`, `app.module.ts:37,69`); Turnstile is verified server-side.
- Stripe webhook idempotency (`StripeEvent` table), HMAC verification and raw-body scoping are implemented as designed (W1).
- OTP code login exists as a magic-link alternative for employees (link-click friction, not deliverability, is covered).
- Offline staleness (W3) is bounded: service worker precaches shell only; schedule data uses React Query persistence with 24h cap — acceptable *once R1's republish notification exists*.
- CSV export for variance/payroll (Story 7.5 AC) is implemented (`variance.service.ts:169-227`).
