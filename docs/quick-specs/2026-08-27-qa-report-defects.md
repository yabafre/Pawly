# Quick Spec: Fix the seven defects the QA suites pinned

**Date:** 2026-08-27
**Author:** Alex
**Type:** fix
**Status:** in-progress

## What

Fix the seven defects reported in `docs/qa-report.md` (v0.16.5). Each is already
pinned by a test marked `it.failing` / `test.fail`; fixing a defect flips its
test, and the marker is then removed so the assertion guards the fix.

## Why

They are live in production. Two are outright broken features (an admin cannot
rename their clinic; an employee can open the admin area and read the roster),
and the rest range from a dead security ceiling to an untranslated error on the
most travelled path in the product.

## Scope note

Six source files — one above the five-file quick threshold. These are five
independent fixes of one or two files each, none introducing a pattern or a
dependency, every one of them already covered by a test. Splitting them into
five specs would add five gates and no safety. Flagged rather than hidden.

## Acceptance Criteria

- [ ] **AC1 (defect 6)** — An admin renames their clinic from the settings page
  and it persists. The web action and `clinic.updateClinicName` validate the
  *same* shared schema, so the two contracts cannot drift apart again.
- [ ] **AC2 (defect 1)** — `employee.list` refuses a non-admin caller, and
  `/admin/*` redirects a signed-in employee away instead of rendering. No
  employee-facing screen loses data: `employee.list` has no caller under
  `/dashboard`.
- [ ] **AC3 (defect 2 + 5)** — A wrong OTP code increments `attempts`
  durably, so the five-attempt ceiling is reachable and `otpFallbackUntil` is
  armed when it trips. The bookkeeping survives the rejection.
- [ ] **AC4 (defect 4)** — A refused password reaches a French user in French.
  The API answers the token `INVALID_CREDENTIALS`, matching the convention it
  already uses for `ADMIN_USE_PASSWORD` and `EMAIL_ALREADY_EXISTS`.
- [ ] **AC5 (defect 3)** — `planning.upsertNoSchool` refuses an employee of
  another clinic, and answers a foreign id exactly as it answers a made-up one,
  so it stops working as an existence oracle. `deleteDeclaration` gets the same
  guard.
- [ ] **AC6 (defect 7)** — A wrong current password is named as such in the
  settings panel rather than surfacing as a generic failure.
- [ ] **AC7** — Every pinned test flips and its `it.failing` / `test.fail`
  marker is removed. Both suites and the unit suite are green.

## Correction to the report

`stripe.getSubscriptionStatus` was listed inside defect 1 as a second procedure
missing a role check. That was wrong: `dashboard/layout.tsx` calls it to decide
whether to bounce an employee whose clinic has lapsed. It is deliberate and
stays open to employees; the report and its pinned test are corrected instead of
the code.

## Files to Change

- `apps/web/.../settings/_actions/settings-actions.ts` — share the rename schema (AC1); shape the change-password error (AC6)
- `apps/web/.../settings/_components/ClinicProfilePanel.tsx` — send the shared field name (AC1)
- `apps/api/src/trpc/routers/employee.router.ts` — admin guard on `list` (AC2)
- `apps/web/src/app/[locale]/admin/layout.tsx` — role guard (AC2)
- `apps/api/src/modules/auth/auth.service.ts` — OTP bookkeeping outside the rejected transaction (AC3); `INVALID_CREDENTIALS` token (AC4)
- `apps/api/src/modules/planning/apprentice-declaration.service.ts` — clinic-scoped resolve (AC5)

## Test Plan

Flip the existing pins, then run everything:

- `role-boundaries.e2e-spec.ts` — `employee.list` refused; drop the
  `getSubscriptionStatus` pin and assert the documented behaviour instead.
- `auth.e2e-spec.ts` — attempt counter and lockout.
- `multi-tenancy.e2e-spec.ts` — `upsertNoSchool` refused and no longer an oracle.
- `employee-dashboard.spec.ts` — the admin roster does not render for an employee.
- `auth.spec.ts` (journey) — the refusal is in French.
- `clinic-configuration.spec.ts` — the rename persists; the wrong current
  password is named.
- Unit suites that encode the old message (`auth.service.spec.ts`,
  `useAuth.spec.ts`) are updated to the token.
- Full: `pnpm test:integration`, `pnpm test:e2e`, `pnpm --filter @pawly/api test`.

## Result

<!-- Filled after implementation -->
