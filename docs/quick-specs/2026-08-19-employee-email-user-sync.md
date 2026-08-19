# Quick Spec: Keep the employee's login account email in sync with the employee record

**Date:** 2026-08-19
**Author:** Alex
**Type:** fix
**Status:** in-progress

## What

When an admin changes an employee's email, propagate the change to the linked `User`
(the login account) in the same transaction, and make "Resend invitation" fail loudly
instead of reporting success when no login account matches the employee's email.

## Why

Reproduced live on 2026-08-19 (clinic "Clinique test", employee *testi teso*): after the
email was changed to `nadir91270+pawly@gmail.com`, the linked `User` kept `testi@test.app`.
"Resend invitation" showed the green success toast but created no magic link and sent
nothing (`createWelcomeMagicLink` looks the `User` up by the *new* email → `null` → swallowed).
OTP / magic-link login with the new email also sends nothing (anti-enumeration answer).
Nothing reaches Trigger.dev or Resend, so the failure is invisible in monitoring.

## Acceptance Criteria

- [ ] **AC1** — `EmployeeService.update()` with a new non-empty `email` on an employee that
  has a `userId` updates `User.email` to the same value, atomically with the employee
  update (single `$transaction`). Updating other fields, or an employee without `userId`,
  never touches `User`.
- [ ] **AC2** — If another `User` already owns the new email, `update()` throws
  `BadRequestException` (same wording family as `create()`) and changes nothing.
- [ ] **AC3** — `resendInvitation()` throws (`BadRequestException`, "no login account for
  this email") when `createWelcomeMagicLink()` returns `null`, instead of returning
  `{ message: 'Invitation resent' }`. The existing web toast `invitationFailed` surfaces it.
- [ ] **AC4** — Existing employee/invitation tests stay green; new unit tests cover AC1–AC3.
- [ ] **AC5 (data)** — Production row repaired: `User` linked to employee
  `a2c3dd64-3969-43df-bd07-a2c197855d2a` gets `email = nadir91270+pawly@gmail.com`
  (verified by a successful "Resend invitation" → Trigger run → Resend `sent`).

## Files to Change

- `apps/api/src/modules/employee/employee.service.ts` — `update()`: conflict check +
  transactional `User.email` sync; `resendInvitation()`: throw on `null` magic link.
- `apps/api/src/modules/employee/employee.service.spec.ts` — tests for AC1–AC3.

## Test Plan

- `update()` with email change + `userId` → `$transaction` callback runs
  `tx.user.update({ where: { id: userId }, data: { email } })` and `tx.employee.update(...)`.
- `update()` with email change, no `userId` → plain `employee.update`, no `user.update`.
- `update()` with email owned by another `User` → rejects `BadRequestException`, no writes.
- `update()` without email in payload → `user.findUnique` not called, no transaction.
- `resendInvitation()` when `createWelcomeMagicLink` resolves `null` → rejects
  `BadRequestException`, `sendEmployeeInvitationEmail` not called.
- Full API suite: `pnpm --filter @pawly/api test`.

## Result

<!-- Filled after implementation -->
