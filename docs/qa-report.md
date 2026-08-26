# QA report — end-to-end and integration coverage

**Date:** 2026-08-26 · **Author:** Alex · **Scope:** all completed stories (Epics 1–13)

Two suites were built and both run the **real** application: the integration
suite drives the actual `AppModule` over HTTP, and the journey suite drives a
real browser against the running web app. Only the mail transport is replaced,
because a link or a code in an email is otherwise unreachable from a test.

## What runs

| Suite | Runner | Tests | Command |
|---|---|---|---|
| Integration | Jest + Supertest | 148 | `pnpm test:integration` |
| Journeys | Playwright (Chromium) | 90 | `pnpm test:e2e` |

Both are wired into CI as a separate `E2E & Integration` workflow — separate
from `Build` on purpose, since it needs a database and a browser and therefore
fails for different reasons than a compile.

### Integration suites

| File | Tests | Covers |
|---|---|---|
| `auth.e2e-spec.ts` | 35 | login, magic link, OTP, refresh, activation, profile, password reset — full handshakes using the captured links and codes (1-2, 1-5, 10-1) |
| `employee.e2e-spec.ts` | 35 | employee CRUD, invitations, constraints, school days, absences (5-1, 5-2, 5-4, 7-3) |
| `multi-tenancy.e2e-spec.ts` | 21 | every id-taking procedure across every router, plus a closing assertion that no record of the other clinic moved |
| `planning.e2e-spec.ts` | 20 | generation, publication and its mails, the published-change guard, idempotence (6-2, 7-6, 11-1, 11-4, 11-5) |
| `stripe-webhook.e2e-spec.ts` | 16 | signature verification, subscription lifecycle, replay idempotence (3-1, 3-4) |
| `subscription-gating.e2e-spec.ts` | 14 | `subscribedProcedure`, starter limits, professional-only features (3-6, 12-2) |
| `role-boundaries.e2e-spec.ts` | 4 | which procedures an employee token may call |
| `app.e2e-spec.ts` | 3 | the harness itself |

### Journey suites

| File | Tests | Covers |
|---|---|---|
| `auth.spec.ts` | 17 | admin password login, employee code login, magic link, password reset (1-2, 1-3, 1-5, 10-1) |
| `clinic-configuration.spec.ts` | 26 | opening hours, 24/7, shift types, assistance rules, week templates, admin settings (5-3, 5-5, 5-7, 6-1, 10-2) |
| `team-management.spec.ts` | 19 | employee CRUD, form validation, invitations, declarative constraints (5-1, 5-2) |
| `planning.spec.ts` | 14 | generation, the grid, holes and conflicts, health bar, publication (6-2, 6-3, 7-4, 11-4) |
| `employee-dashboard.spec.ts` | 12 | passwordless sign-in, the employee area, language switching (8-1, 2-2) |
| `smoke.spec.ts` | 2 | the harness itself |

## Defects found

Five, all confirmed against the source, none of them visible to the 1230 unit
tests. Every one of them lives in a seam between layers — a Prisma transaction,
a guard, a mail side effect — which is exactly where unit tests substitute a
stub for the thing that actually misbehaves.

### 1. An employee can read the whole admin roster — *moderate*

`app/[locale]/admin/layout.tsx` guards on the presence of the `auth-token`
cookie and never on the role, and `employee.list` is a plain
`subscribedProcedure` with no role check either. An employee opening
`/fr/admin/employees` gets the roster rendered in full — colleagues' names,
emails, phone numbers, contract types and contract hours. Verified three times
out of three by hand, and again through the API with an employee's own token.

The check is applied inconsistently rather than missing everywhere:
`dashboard.getStats` answers `Admin only`, and three procedures further down the
same employee router do test `ctx.user.role !== 'ADMIN'`.
`stripe.getSubscriptionStatus` answers an employee too.

Pinned by `role-boundaries.e2e-spec.ts` and by a `test.fail` in
`employee-dashboard.spec.ts`, both of which start failing the day the guard
lands.

**Fix:** gate `employee.list` on the admin role, or return a reduced projection
(first name, colour, job type) to non-admin callers — which is all the planning
views actually consume — and add a role check to the admin layout.

### 2. The OTP lockout never fires — *moderate*

`AuthService.verifyOtp` increments `otpCode.attempts` inside the same
`prisma.$transaction` it then throws from. The throw rolls the increment back,
so `attempts` stays at 0 for every wrong guess: the five-attempt ceiling is
unreachable and `otpFallbackUntil` is never armed, which makes the "too many
attempts, check your email for a login link" message untrue.

The per-IP throttler (5 requests a minute on `/auth/otp/verify`) is what
actually stops a brute force, and it holds — which is why this is moderate
rather than critical. But there is no per-account ceiling at all, so a
distributed attempt has nothing standing in its way.

**Why the unit suite misses it:** it stubs `$transaction` as a plain callback
invoker with no rollback semantics, and asserts only the thrown message. The
test passes against code that cannot work in production.

**Fix:** do the attempt bookkeeping outside the transaction, or commit it and
signal failure by return value rather than by throwing.

### 3. `planning.upsertNoSchool` accepts another clinic's apprentice — *moderate*

`ApprenticeDeclarationService.upsertNoSchool` upserts on the composite key
`(clinicId, employeeId, month)` without ever checking that the employee belongs
to the caller's clinic. Both foreign keys are satisfied independently, so the row
is accepted: clinic A persists a declaration referencing clinic B's employee.

No data of B's leaks — A's own listing joins on A's apprentices — but three
things are wrong: an unauthorised write lands; it is an existence oracle (a real
employee id from any clinic returns 200, a made-up uuid returns a foreign-key
error, and the difference is observable); and `dashboard.service.ts` counts
declarations by `{clinicId, month, status}` with no employee filter, so the
rogue row inflates a real dashboard figure.

Every other id-taking planning procedure resolves the row through a
clinic-scoped `findFirst` first. This one does not.

**Fix:** resolve the employee with `{ id, clinicId }` before the upsert, as
`EmployeeService.findById` does, and apply the same guard to `deleteDeclaration`.

### 4. A refused password is reported in English to a French user — *low, but everywhere*

The API throws `Invalid credentials`; `resolveErrorMessage` in `useAuth.ts`
matches on the token `INVALID_CREDENTIALS`, so `includes()` never hits and the
raw English string is shown. `auth.errors.INVALID_CREDENTIALS` ("Email ou mot de
passe incorrect.") is dead translation in both language files. It is the most
travelled error path in the product — every mistyped password.

### 5. `otpFallbackUntil` is never armed — *low*

Same root cause as #2: the write happens inside the transaction the method
throws from. Listed separately because fixing #2 by moving only the counter
would leave this one behind.

## Gaps

- **Account language preference (10-2).** `settings.account.localeLabel` exists
  in both language files, but no control renders it. The only way to switch is
  the header switcher, which changes the URL prefix and never writes
  `User.locale`. Recorded as not shipped rather than as a failing test.
- **No language switcher in the employee shell.** An employee can only change
  language by editing the URL. The switcher is a public-shell control.
- **Stripe handler failure path.** One integration test is skipped: forcing a
  mid-processing failure means letting the suite make a real Stripe API call.
  The unclaim-on-failure path is covered by the unit suite, which mocks the
  client.
- **PWA and offline behaviour (8-1, 8-3).** Not exercised. Service-worker
  registration and offline fallbacks need a production build; the suites run
  against `next dev`.
- **Drag-and-drop reordering (7-1).** Not exercised. dnd-kit needs keyboard
  driving and the value of asserting it in a browser is low next to the rule
  engine tests that already cover the consequences of a move.

## Notes on the harness

- **Two problems predate this work.** `apps/api/test/jest-e2e.json` never
  functioned — path aliases were unresolved and `superjson` (ESM-only, reached
  through the tRPC layer) broke the runner — so the single scaffolded e2e test
  had never executed. Both are fixed here.
- **The mailbox is the enabling piece.** `MailService` is replaced by a stub
  that appends every message to a file. Activation, magic link, OTP, invitation
  and password reset all end in an email, and without reading it those journeys
  stop at the point where the product actually begins.
- **A database of its own, not a schema.** The suites use a dedicated
  `pawly_e2e` database on the Neon project. A schema-based split was tried first
  and is a trap: Prisma's `pg` adapter pins itself to `public` whatever
  `search_path` says, so the seed reaches the real data while appearing to work.
- **Passing file by file is not passing.** The first full run was 41 green and 8
  red purely from cross-test interference: a per-IP auth throttler shared by
  every test, and fixtures left behind by earlier tests. Only the whole-suite
  run tells the truth, and that is the run CI performs.
