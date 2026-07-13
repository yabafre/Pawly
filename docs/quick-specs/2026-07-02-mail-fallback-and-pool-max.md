# Quick Spec: auth-critical mail fallback + explicit pg pool max (pre-mortem R6, R15)

**Date:** 2026-07-02
**Author:** Alex
**Type:** fix
**Status:** done

## What

(1) Stop silently swallowing auth-critical email failures: in production, `MailService.triggerSendEmail` catches every Trigger.dev dispatch error and only logs it (`mail.service.tsx:41-47`) — if Trigger.dev is down, magic links / OTP / password resets silently stop while the UI reports success. Make the dispatch report failure and have the auth-critical senders (`magic-link`, `otp`, `password-reset`) **fall back to the direct Resend path that already exists in each method**, throwing only if both channels fail. Record a failure metric on trigger-dispatch errors. (2) Set an explicit `max` on the `pg` Pool in `PrismaService` (env-overridable `DB_POOL_MAX`, default 10) instead of relying on the implicit driver default against serverless Neon.

## Why

R6 violates NFR3 ("zero silent failures") on the single most critical path — employee authentication is 100% email-dependent. R15's pool sizing is the cheap-insurance half of an accepted risk.

## Acceptance Criteria

- [ ] `triggerSendEmail` returns a success/failure signal (no behavior change for existing non-critical callers) and increments `emailSendCounter` with `outcome: 'trigger_failure'` on dispatch error.
- [ ] `sendMagicLink`, OTP send, and password-reset send: when `useTrigger` is true and the dispatch fails, the method falls through to its existing direct Resend branch; if that also fails, the existing `InternalServerErrorException` surfaces (no silent path remains).
- [ ] Non-critical email types keep current log-only behavior on trigger failure.
- [ ] `PrismaService` constructs the Pool with `max: Number(process.env.DB_POOL_MAX ?? '10')`.
- [ ] New Jest specs cover: trigger dispatch failure → direct send called (fallback); both channels fail → throws; trigger success → no direct send.

## Files to Change

- `apps/api/src/modules/mail/mail.service.tsx` — boolean-returning dispatch + fallback in 3 auth-critical methods + failure counter
- `apps/api/src/modules/mail/mail.service.spec.tsx` — new test file (none exists today)
- `apps/api/src/prisma/prisma.service.ts` — explicit pool `max`

## Test Plan

- RED: Jest spec mocking `sendEmailTask.trigger` (reject) and `resend.emails.send` — assert fallback send for `magic-link`; assert throw when both fail; assert non-critical type does not throw. Run `bash .aped/aped-dev/scripts/run-tests.sh`.
- GREEN: implement dispatch signal + fallback; re-run.
- Pool: assert via unit test or constructor inspection that `max` is applied (and `DB_POOL_MAX=5` is honored).

## Result

- `mail.service.tsx` — `triggerSendEmail` now returns `Promise<boolean>` and records `emailSendCounter{outcome:'trigger_failure'}` on dispatch error; `sendMagicLink` / `sendOtpCode` / `sendPasswordResetEmail` fall through to their existing direct Resend branch when the dispatch fails (throw only if both channels fail). Non-critical senders unchanged.
- `prisma.service.ts` — Pool constructed with `max: Number(process.env.DB_POOL_MAX ?? '10')`.
- New tests: `mail.service.spec.ts` (8 tests — fallback, metric, double-failure throw, non-critical log-only preserved) and `prisma.service.spec.ts` (2 tests — default max, env override). TDD: RED observed (8 failed for target behavior), then GREEN 10/10.
- Full suite green: API 838/838 (was 825), typecheck via `@pawly/api#build` green.
