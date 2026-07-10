# Story: 11-4-reliable-publication-notifications — Reliable Publication & Change Notifications

**Epic:** Epic 11 — Planning Engine Hardening & Compliance
**Status:** review
**Branch:** feature/KON-121-11-4-reliable-publication-notifications
**Ticket:** KON-121 (Linear · project Pawly · milestone Epic 11 · Wave 1 · depends-on: none)
**Origin:** Multi-agent planning audit 2026-07-08 — reliability gap "Publication emails fail silently". See `docs/epics-context/epic-11-context.md` § 0 (bullet 4). Independent of 11-1/11-2/11-3 (no code overlap); ships in Wave 1.

> **Read first:** `docs/epics-context/epic-11-context.md` — audit synthesis, cross-cutting invariants (esp. **§ 3.7 "No silent failure (NFR3)"**), and the anchor map. **The audit's line anchors for 11-4 are STALE** (verified during authoring: the planning service is ~2900 lines; `mail.service.tsx` lives in `modules/mail/`, not `modules/planning/`). Corrected anchors are inline below — **re-locate the symbol, do not trust the number blindly.**

## User Story

**As an** employee, **I want** to reliably receive publication and change notifications, **so that** a transient email-provider (Resend) failure never leaves me unaware that my schedule was published or changed.

## Acceptance Criteria

1. **Given** an employee whose schedule has just been published, **When** the email provider is temporarily failing at send time, **Then** the system does not report the notification as delivered — it retries the send automatically until it succeeds or its retry budget is exhausted — **and** no retry ever delivers a duplicate copy of an email that already went out.
2. **Given** a publication or a post-publication change to notify, **When** the primary notification channel cannot dispatch the email, **Then** the system falls back to sending it directly, a single undeliverable recipient never prevents the other recipients from being notified, **and** the operator can see from the logs that some notifications failed.
3. **Given** any publication-notification send, **When** it succeeds or fails, **Then** the outcome is recorded in metrics so that a silent notification outage becomes observable to operations.

**FRs covered:** FR10. **NFRs:** NFR3 (zero silent failures — every notification outage is observable and retried), NFR6 (tenancy preserved — no query shape change).

> **Ticket-AC mapping (mechanism → Tasks):** KON-121's ACs name the exact code — "the task throws so its configured retries (`maxAttempts: 5`) actually run", "the direct-Resend fallback (used by OTP / magic-link) is wired for `sendSchedulePublicationEmail` and `sendScheduleChangedEmail`, and the caller reacts to the returned status", "an `emailSendCounter` metric is emitted". Realized in Tasks 1–5; Task 6 is the full gate. **Scope decisions locked with Alex during authoring:** (a) **idempotency-key + throw-on-any-failure** (not throw-on-total-outage-only) — Resend `batch.send` idempotency verified via Context7 against the installed `resend@6.9.3` (`idempotencyKey?: string`, sets the `Idempotency-Key` header); (b) **`sendSchedulePublicationEmail` is hardened too** even though it has **no production caller today** (publication runs through the batch path) — for symmetry and any future single-recipient caller; (c) schedule emails are **non-throwing** (boolean status), unlike auth emails.

## Tasks

- [x] **Task 1: Make `batch-email-publish` throw on failure, idempotent on retry, and observable** [AC: 1, 3]
  Replace the **entire** contents of `apps/api/src/trigger/tasks/batch-email-publish.ts` with the following (adds the `emailSendCounter` import, an optional `idempotencyKey` on the payload, per-chunk idempotency keys, failure counting, the metric emission, and the throw):
  ```ts
  import { task, logger } from '@trigger.dev/sdk';
  import { createElement } from 'react';
  import { render } from '@react-email/render';
  import { SchedulePublicationEmail } from '../../modules/mail/templates/SchedulePublicationEmail';
  import { getMailTranslations, type MailLocale } from '../../modules/mail/mail-i18n';
  import { getResend, mailFrom } from '../lib/resend';
  import { emailSendCounter } from '../../common/metrics';

  const BATCH_SIZE = 100;

  interface BatchEmailPayload {
    emails: Array<{ to: string; firstName: string; shiftCount: number; locale?: MailLocale }>;
    month: string;
    clinicName: string;
    // Story 11-4 — stable seed for the per-chunk Resend idempotency key.
    // OPTIONAL in the type to avoid a transient compile break, but publishPlan
    // ALWAYS passes it (see planning-generation.service.ts, Task 5). Constant
    // across the retries of one publish (so a replay never duplicates a
    // delivered email) and unique per publish invocation (so a legitimate
    // re-publish re-notifies). Built as
    // `schedule-publish/<clinicId>:<month>:<publishedAtMs>`.
    idempotencyKey?: string;
  }

  export const batchEmailPublishTask = task({
    id: 'batch-email-publish',
    retry: {
      maxAttempts: 5,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
    },
    run: async (payload: BatchEmailPayload) => {
      const { emails, month, clinicName, idempotencyKey } = payload;

      if (emails.length === 0) {
        logger.info('No emails to send');
        return { sent: 0 };
      }

      const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3000';
      const dashboardUrl = `${webAppUrl}/dashboard/schedule`;

      // Pre-render HTML per employee
      const emailPayloads: Array<{ from: string; to: string; subject: string; html: string }> = [];
      for (const emp of emails) {
        try {
          const empLocale: MailLocale = emp.locale ?? 'fr';
          const t = getMailTranslations(empLocale);
          const html = await render(
            createElement(SchedulePublicationEmail, {
              firstName: emp.firstName,
              month,
              clinicName,
              dashboardUrl,
              shiftCount: emp.shiftCount,
              locale: empLocale,
            }),
          );
          emailPayloads.push({
            from: mailFrom,
            to: emp.to,
            subject: t.subjects.schedulePublication(clinicName, month),
            html,
          });
        } catch (err) {
          logger.error(`Failed to render email for ${emp.to}`, { error: String(err) });
        }
      }

      // Chunk into batches of 100 (Resend batch limit). Story 11-4 (AC1): each
      // chunk carries a stable idempotency key so Trigger.dev's retries (below)
      // re-send WITHOUT duplicating already-delivered emails — Resend returns
      // the original response for a repeated (key, identical payload). The key
      // is unique per chunk and per publish invocation.
      let totalSent = 0;
      let failedCount = 0;
      for (let i = 0; i < emailPayloads.length; i += BATCH_SIZE) {
        const chunk = emailPayloads.slice(i, i + BATCH_SIZE);
        const chunkIndex = Math.floor(i / BATCH_SIZE);
        const sendOptions = idempotencyKey
          ? { idempotencyKey: `${idempotencyKey}-c${chunkIndex}` }
          : undefined;
        try {
          const { data, error } = await getResend().batch.send(chunk, sendOptions);
          if (error) {
            failedCount += chunk.length;
            logger.error(`Batch email send error`, { error: error.message, chunkIndex });
          } else {
            totalSent += data?.data?.length ?? chunk.length;
          }
        } catch (err) {
          failedCount += chunk.length;
          logger.error(`Batch email send failed for chunk ${chunkIndex + 1}`, {
            error: String(err),
          });
        }
      }

      // Story 11-4 (AC3) — emit the metric so a silent notification outage is
      // observable (mirrors batch-push-publish.ts). Emitted on every attempt; a
      // sustained `outcome:failure` spike across the 5 retries is the alert
      // signal. The idempotency keys above keep the retry duplicate-safe.
      emailSendCounter.add(totalSent, { type: 'schedule_publication', outcome: 'success' });
      if (failedCount > 0) {
        emailSendCounter.add(failedCount, { type: 'schedule_publication', outcome: 'failure' });
      }

      logger.info(`Batch email publish complete`, { totalSent, failedCount, totalEmails: emails.length });

      // Story 11-4 (AC1) — throw when any send failed so Trigger.dev's
      // maxAttempts:5 retries actually run, instead of returning success
      // unconditionally.
      if (failedCount > 0) {
        throw new Error(
          `batch-email-publish: ${failedCount}/${emailPayloads.length} emails failed to send — retrying`,
        );
      }

      return { sent: totalSent };
    },
  });
  ```
  Create the new spec `apps/api/src/trigger/tasks/batch-email-publish.spec.ts` (the repo's **first** Trigger-task spec — mock `task()` to return its config so `run` is callable directly):
  ```ts
  jest.mock('@trigger.dev/sdk', () => ({
    task: (config: unknown) => config,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));
  const batchSend = jest.fn();
  jest.mock('../lib/resend', () => ({
    getResend: () => ({ batch: { send: batchSend } }),
    mailFrom: 'Pawly <noreply@pawly.app>',
  }));
  jest.mock('@react-email/render', () => ({
    render: jest.fn().mockResolvedValue('<html>mock</html>'),
  }));
  jest.mock('../../modules/mail/templates/SchedulePublicationEmail', () => ({
    SchedulePublicationEmail: () => null,
  }));
  jest.mock('../../modules/mail/mail-i18n', () => ({
    getMailTranslations: () => ({
      subjects: { schedulePublication: () => 'Planning publié' },
    }),
  }));
  jest.mock('../../common/metrics', () => ({
    emailSendCounter: { add: jest.fn() },
  }));

  import { batchEmailPublishTask } from './batch-email-publish';
  import { emailSendCounter } from '../../common/metrics';

  const counterMock = emailSendCounter.add as jest.Mock;
  const runTask = (
    batchEmailPublishTask as unknown as {
      run: (payload: {
        emails: Array<{ to: string; firstName: string; shiftCount: number; locale?: 'fr' | 'en' }>;
        month: string;
        clinicName: string;
        idempotencyKey?: string;
      }) => Promise<{ sent: number }>;
    }
  ).run;

  const basePayload = {
    emails: [{ to: 'vet@clinic.fr', firstName: 'Sarah', shiftCount: 12, locale: 'fr' as const }],
    month: '2026-07',
    clinicName: 'Clinique du Parc',
    idempotencyKey: 'schedule-publish/clinic123:2026-07:1700000000000',
  };

  describe('batchEmailPublishTask.run — Story 11-4 reliable publication', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      batchSend.mockResolvedValue({ data: { data: [{ id: 'e1' }] }, error: null });
    });

    it('passes a per-chunk Resend idempotency key so retries never duplicate', async () => {
      await runTask(basePayload);
      expect(batchSend).toHaveBeenCalledTimes(1);
      expect(batchSend).toHaveBeenCalledWith(expect.any(Array), {
        idempotencyKey: 'schedule-publish/clinic123:2026-07:1700000000000-c0',
      });
    });

    it('throws when Resend returns an error so maxAttempts retries run', async () => {
      batchSend.mockResolvedValue({ data: null, error: { message: 'resend down' } });
      await expect(runTask(basePayload)).rejects.toThrow(/failed to send/);
    });

    it('throws when the Resend batch send call itself rejects', async () => {
      batchSend.mockRejectedValue(new Error('ECONNRESET'));
      await expect(runTask(basePayload)).rejects.toThrow(/failed to send/);
    });

    it('emits emailSendCounter failure so a silent outage is observable', async () => {
      batchSend.mockResolvedValue({ data: null, error: { message: 'resend down' } });
      await expect(runTask(basePayload)).rejects.toThrow();
      expect(counterMock).toHaveBeenCalledWith(1, {
        type: 'schedule_publication',
        outcome: 'failure',
      });
    });

    it('returns { sent } and does not throw when every send succeeds', async () => {
      const result = await runTask(basePayload);
      expect(result).toEqual({ sent: 1 });
      expect(counterMock).toHaveBeenCalledWith(1, {
        type: 'schedule_publication',
        outcome: 'success',
      });
    });
  });
  ```
  Run (isolated — **do not run the whole-graph `tsc` yet**; `planning-generation.service.ts` doesn't pass `idempotencyKey` until Task 5, and the field is optional so nothing breaks at runtime):
  `pnpm --filter @pawly/api test -- --testPathPatterns "batch-email-publish.spec"`
  Expected: `Tests: 5 passed`, exit 0.
  Commit: `git add apps/api/src/trigger/tasks/batch-email-publish.ts apps/api/src/trigger/tasks/batch-email-publish.spec.ts && git commit -m "feat(KON-121): batch-email-publish throws on failure, idempotent retries, emits emailSendCounter (AC1,AC3)"`

- [x] **Task 2: Wire the direct-Resend fallback + boolean status + counter into `sendScheduleChangedEmail`** [AC: 2]
  In `apps/api/src/modules/mail/mail.service.tsx`, replace the **entire** `sendScheduleChangedEmail` method (currently `:408-455`) with:
  ```tsx
    async sendScheduleChangedEmail(
      email: string,
      firstName: string,
      month: string,
      clinicName: string,
      locale: MailLocale = 'fr',
    ): Promise<boolean> {
      const t = getMailTranslations(locale);
      const webAppUrl =
        this.configService.get('WEB_APP_URL', { infer: true }) ?? '';
      const dashboardUrl = `${webAppUrl}/dashboard/schedule`;
      // Story 11-4 — a missed change notification means a missed shift, so a
      // failed Trigger dispatch must fall back to the direct Resend send (same
      // idiom as sendMagicLink). Non-auth-critical: return a boolean status
      // instead of throwing, so one bad recipient never aborts the whole
      // notifyScheduleChange loop.
      if (this.useTrigger) {
        if (
          await this.triggerSendEmail('schedule-changed', email, {
            firstName,
            month,
            clinicName,
            dashboardUrl,
            locale,
          })
        )
          return true;
        this.logger.warn(
          'Trigger dispatch failed for schedule-changed — falling back to direct Resend send',
        );
      }
      try {
        const html = await render(
          <ScheduleChangedEmail
            firstName={firstName}
            month={month}
            clinicName={clinicName}
            dashboardUrl={dashboardUrl}
            locale={locale}
          />,
        );

        await this.throttle();
        const { error } = await this.resend.emails.send({
          from: this.configService.get('MAIL_FROM', { infer: true }),
          to: email,
          subject: t.subjects.scheduleChanged(clinicName, month),
          html,
        });

        if (error) {
          emailSendCounter.add(1, { type: 'schedule_changed', outcome: 'failure' });
          this.logger.error(
            `Failed to send schedule changed email: ${error.message}`,
          );
          return false;
        }

        emailSendCounter.add(1, { type: 'schedule_changed', outcome: 'success' });
        return true;
      } catch (err) {
        emailSendCounter.add(1, { type: 'schedule_changed', outcome: 'failure' });
        this.logger.error('Unexpected error sending schedule changed email', err);
        return false;
      }
    }
  ```
  Append this `describe` block to `apps/api/src/modules/mail/mail.service.spec.ts`, **inside** the top-level `describe('MailService — Trigger.dev fallback for auth-critical emails', ...)` block (i.e., immediately before its final closing `});` on line 145 — it reuses the file's `service`, `resendSend`, `triggerMock`, `counterMock` harness):
  ```ts
    describe('sendScheduleChangedEmail — Story 11-4 reliable change notifications', () => {
      it('returns true and skips the direct send when the Trigger dispatch succeeds', async () => {
        triggerMock.mockResolvedValue({ id: 'run-id' });

        const ok = await service.sendScheduleChangedEmail(
          'vet@clinic.fr',
          'Sarah',
          '2026-07',
          'Clinique du Parc',
        );

        expect(ok).toBe(true);
        expect(resendSend).not.toHaveBeenCalled();
      });

      it('falls back to the direct Resend send when the Trigger dispatch fails', async () => {
        triggerMock.mockRejectedValue(new Error('trigger.dev unreachable'));

        const ok = await service.sendScheduleChangedEmail(
          'vet@clinic.fr',
          'Sarah',
          '2026-07',
          'Clinique du Parc',
        );

        expect(ok).toBe(true);
        expect(resendSend).toHaveBeenCalledTimes(1);
        expect(counterMock).toHaveBeenCalledWith(1, {
          type: 'schedule_changed',
          outcome: 'success',
        });
      });

      it('returns false (does not throw) when both channels fail', async () => {
        triggerMock.mockRejectedValue(new Error('trigger.dev unreachable'));
        resendSend.mockResolvedValue({
          data: null,
          error: { message: 'resend down' },
        });

        const ok = await service.sendScheduleChangedEmail(
          'vet@clinic.fr',
          'Sarah',
          '2026-07',
          'Clinique du Parc',
        );

        expect(ok).toBe(false);
        expect(counterMock).toHaveBeenCalledWith(1, {
          type: 'schedule_changed',
          outcome: 'failure',
        });
      });
    });
  ```
  Run: `pnpm --filter @pawly/api test -- --testPathPatterns "mail.service.spec"`
  Expected: all existing + 3 new `sendScheduleChangedEmail` tests pass (`Tests: N passed`, exit 0).
  Commit: `git add apps/api/src/modules/mail/mail.service.tsx apps/api/src/modules/mail/mail.service.spec.ts && git commit -m "feat(KON-121): sendScheduleChangedEmail direct-Resend fallback + boolean status + counter (AC2)"`

- [x] **Task 3: Wire the same fallback + boolean status + counter into `sendSchedulePublicationEmail`** [AC: 2]
  In `apps/api/src/modules/mail/mail.service.tsx`, replace the **entire** `sendSchedulePublicationEmail` method (currently `:349-406`) with:
  ```tsx
    async sendSchedulePublicationEmail(
      employeeEmail: string,
      firstName: string,
      month: string,
      clinicName: string,
      shiftCount?: number,
      locale: MailLocale = 'fr',
    ): Promise<boolean> {
      const t = getMailTranslations(locale);
      const webAppUrl =
        this.configService.get('WEB_APP_URL', { infer: true }) ?? '';
      const dashboardUrl = `${webAppUrl}/dashboard/schedule`;
      // Story 11-4 — mirror sendScheduleChangedEmail: fall back to the direct
      // Resend send when the Trigger dispatch fails, and return a boolean
      // status. NOTE: this singular method has NO production caller today
      // (publication runs through the batch path — sendBatchSchedulePublicationEmails
      // / batchEmailPublishTask); it is hardened here for symmetry and any future
      // single-recipient caller (locked with Alex during authoring).
      if (this.useTrigger) {
        if (
          await this.triggerSendEmail('schedule-publication', employeeEmail, {
            firstName,
            month,
            clinicName,
            dashboardUrl,
            shiftCount,
            locale,
          })
        )
          return true;
        this.logger.warn(
          'Trigger dispatch failed for schedule-publication — falling back to direct Resend send',
        );
      }
      try {
        const html = await render(
          <SchedulePublicationEmail
            firstName={firstName}
            month={month}
            clinicName={clinicName}
            dashboardUrl={dashboardUrl}
            shiftCount={shiftCount}
            locale={locale}
          />,
        );

        await this.throttle();
        const { error } = await this.resend.emails.send({
          from: this.configService.get('MAIL_FROM', { infer: true }),
          to: employeeEmail,
          subject: t.subjects.schedulePublication(clinicName, month),
          html,
        });

        if (error) {
          emailSendCounter.add(1, { type: 'schedule_publication', outcome: 'failure' });
          this.logger.error(
            `Failed to send schedule publication email to ${employeeEmail}: ${error.message}`,
          );
          return false;
        }

        emailSendCounter.add(1, { type: 'schedule_publication', outcome: 'success' });
        return true;
      } catch (err) {
        emailSendCounter.add(1, { type: 'schedule_publication', outcome: 'failure' });
        this.logger.error(
          'Unexpected error sending schedule publication email',
          err,
        );
        return false;
      }
    }
  ```
  Append this `describe` block to `apps/api/src/modules/mail/mail.service.spec.ts`, **inside** the same top-level `describe` (immediately before its final closing `});`):
  ```ts
    describe('sendSchedulePublicationEmail — Story 11-4 reliable publication notifications', () => {
      it('returns true and skips the direct send when the Trigger dispatch succeeds', async () => {
        triggerMock.mockResolvedValue({ id: 'run-id' });

        const ok = await service.sendSchedulePublicationEmail(
          'vet@clinic.fr',
          'Sarah',
          '2026-07',
          'Clinique du Parc',
          5,
        );

        expect(ok).toBe(true);
        expect(resendSend).not.toHaveBeenCalled();
      });

      it('falls back to the direct Resend send when the Trigger dispatch fails', async () => {
        triggerMock.mockRejectedValue(new Error('trigger.dev unreachable'));

        const ok = await service.sendSchedulePublicationEmail(
          'vet@clinic.fr',
          'Sarah',
          '2026-07',
          'Clinique du Parc',
          5,
        );

        expect(ok).toBe(true);
        expect(resendSend).toHaveBeenCalledTimes(1);
        expect(counterMock).toHaveBeenCalledWith(1, {
          type: 'schedule_publication',
          outcome: 'success',
        });
      });

      it('returns false (does not throw) when both channels fail', async () => {
        triggerMock.mockRejectedValue(new Error('trigger.dev unreachable'));
        resendSend.mockResolvedValue({
          data: null,
          error: { message: 'resend down' },
        });

        const ok = await service.sendSchedulePublicationEmail(
          'vet@clinic.fr',
          'Sarah',
          '2026-07',
          'Clinique du Parc',
          5,
        );

        expect(ok).toBe(false);
        expect(counterMock).toHaveBeenCalledWith(1, {
          type: 'schedule_publication',
          outcome: 'failure',
        });
      });
    });
  ```
  Run: `pnpm --filter @pawly/api test -- --testPathPatterns "mail.service.spec"`
  Expected: all existing + 3 new `sendSchedulePublicationEmail` tests pass, exit 0.
  Commit: `git add apps/api/src/modules/mail/mail.service.tsx apps/api/src/modules/mail/mail.service.spec.ts && git commit -m "feat(KON-121): sendSchedulePublicationEmail direct-Resend fallback + boolean status + counter (AC2)"`

- [x] **Task 4: `notifyScheduleChange` reacts to the boolean send status** [AC: 2]
  In `apps/api/src/modules/planning/planning-generation.service.ts`, replace the change-email loop inside `notifyScheduleChange` (currently `:2015-2025`, the `for (const r of unique) { ... }` block) with:
  ```ts
      let failedEmailCount = 0;
      for (const r of unique) {
        const emp = byId.get(r.employeeId);
        if (!emp || !emp.email) continue;
        // Story 11-4 (AC2) — react to the returned status. sendScheduleChangedEmail
        // now returns false (not throws) when both channels fail, so a change
        // notification outage is visible in the logs (NFR3) instead of silently
        // dropped, and one bad recipient never aborts the loop.
        const ok = await this.mailService.sendScheduleChangedEmail(
          emp.email,
          emp.firstName,
          r.month,
          clinic.name,
          (emp.user?.locale as 'fr' | 'en') ?? 'fr',
        );
        if (!ok) failedEmailCount++;
      }
      if (failedEmailCount > 0) {
        this.logger.error(
          `notifyScheduleChange: ${failedEmailCount}/${unique.length} change email(s) failed for clinic ${clinicId}`,
        );
      }
  ```
  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, update the shared MailService mock default so `sendScheduleChangedEmail` resolves the new boolean success value. Change the line (currently `:213`):
  ```ts
      sendScheduleChangedEmail: jest.fn().mockResolvedValue(undefined),
  ```
  to:
  ```ts
      sendScheduleChangedEmail: jest.fn().mockResolvedValue(true),
  ```
  Then add this test inside the Story 7-6 amendment `describe` block (immediately after the `cross-month move notifies only the published-side month` test that ends at `:4895`, before that describe's closing `});` on `:4896`):
  ```ts
    // Story 11-4 (AC2): the caller reacts to a failed change notification.
    it('error-logs an aggregate when a change email fails (does not throw)', async () => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        publishedStatus,
      ]);
      mockPrismaService.shift.update.mockResolvedValue({
        ...julyShift,
        date: new Date('2026-07-20T00:00:00.000Z'),
        source: 'MANUAL',
        isConfirmed: false,
      });
      mockMailService.sendScheduleChangedEmail.mockResolvedValue(false);
      const errorSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);

      await service.moveShift(
        clinicId,
        julyShift.id,
        { targetDate: '2026-07-20' },
        { acknowledgePublishedChange: true },
      );
      await new Promise((r) => setImmediate(r));

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('change email(s) failed'),
      );
      errorSpy.mockRestore();
    });
  ```
  Run: `pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec"`
  Expected: existing Story 7-6 notify tests stay green + the new AC2 test passes, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "feat(KON-121): notifyScheduleChange reacts to change-email status (AC2)"`

- [x] **Task 5: `publishPlan` passes the idempotency key + reacts to the batch send count** [AC: 1, 2]
  In `apps/api/src/modules/planning/planning-generation.service.ts`, replace the email-notification `if (useTrigger) { ... } else { ... }` block inside `publishPlan` (currently `:2781-2797`) with:
  ```ts
        if (useTrigger) {
          // Async via Trigger.dev — fire-and-forget. Story 11-4 (AC1): pass a
          // stable idempotency-key seed (unique per publish via `now`, the
          // publishedAt timestamp) so the task's retries never duplicate an
          // already-delivered email.
          batchEmailPublishTask
            .trigger({
              emails: emailPayloads,
              month,
              clinicName: clinic.name,
              idempotencyKey: `schedule-publish/${clinicId}:${month}:${now.getTime()}`,
            })
            .catch((err: Error) =>
              this.logger.error(
                `Trigger batch-email-publish failed: ${err.message}`,
              ),
            );
        } else {
          // Direct send (fallback). Story 11-4 (AC2): react to the returned count
          // so a partial/total publication-email failure is visible (NFR3).
          const notified =
            await this.mailService.sendBatchSchedulePublicationEmails(
              emailPayloads,
              month,
              clinic.name,
            );
          if (notified < emailPayloads.length) {
            this.logger.error(
              `publishPlan: ${emailPayloads.length - notified}/${emailPayloads.length} publication email(s) failed for clinic ${clinicId}, month ${month}`,
            );
          }
        }
  ```
  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, the existing Trigger-path test asserts `batchEmailPublishTask.trigger` was called **without** `idempotencyKey` and will now fail. Update its assertion (currently `:5763-5780`, the `toHaveBeenCalledWith({ emails: [...], month, clinicName: 'Clinique Test' })`) to tolerate the dynamic key:
  ```ts
          expect(batchEmailPublishTask.trigger).toHaveBeenCalledWith(
            expect.objectContaining({
              emails: [
                { to: 'alice@clinic.fr', firstName: 'Alice', shiftCount: 5, locale: 'fr' },
                { to: 'bob@clinic.fr', firstName: 'Bob', shiftCount: 3, locale: 'fr' },
              ],
              month,
              clinicName: 'Clinique Test',
              idempotencyKey: expect.stringContaining(`schedule-publish/${clinicId}:${month}:`),
            }),
          );
  ```
  Then add this test inside the main `publishPlan` `describe` (the direct-send branch — no `TRIGGER_SECRET_KEY`; place it after the `should not send email to inactive employees` test that ends at `:5628`):
  ```ts
    // Story 11-4 (AC2): publishPlan reacts to the direct batch send count.
    it('error-logs when the direct batch send reports fewer sent than eligible', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([
        { id: 'emp-1', firstName: 'Alice', email: 'alice@clinic.fr', notifyOnPublish: true, _count: { shifts: 5 } },
        { id: 'emp-2', firstName: 'Bob', email: 'bob@clinic.fr', notifyOnPublish: true, _count: { shifts: 3 } },
      ]);
      mockMailService.sendBatchSchedulePublicationEmails.mockResolvedValue(1);
      const errorSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);

      await service.publishPlan(clinicId, month, userId);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('publication email(s) failed'),
      );
      errorSpy.mockRestore();
    });
  ```
  Run: `pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec"`
  Expected: the updated Trigger-path assertion + the new AC2 direct-count test pass; the rest of the suite stays green, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "feat(KON-121): publishPlan passes idempotencyKey + reacts to batch send count (AC1,AC2)"`

- [x] **Task 6: Full API gate — typecheck + full suite** [AC: 1, 2, 3]
  Now that Task 5 wired the caller, the whole graph type-checks. Run, in order:
  ```bash
  pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json
  pnpm --filter @pawly/api test
  ```
  Expected: `tsc --noEmit` exits 0 with **no new** errors referencing `batch-email-publish`, `idempotencyKey`, `sendScheduleChangedEmail`, `sendSchedulePublicationEmail`, `notifyScheduleChange`, or `publishPlan` (pre-existing unrelated `apps/api` spec-fixture noise, if any, is documented in Story 11-1/11-2 and is not introduced here). `pnpm --filter @pawly/api test` reports all suites passing (baseline 870+ tests from 11-2, plus the ~16 added here), exit 0. If cross-package `@pawly/*` types look stale, rebuild their dist first (project memory `epic11-dev-gotchas`).
  Commit: `git add -A && git commit -m "test(KON-121): full API gate green for reliable publication notifications (AC1-AC3)"`

## Dev Notes

### Non-Goals — deferred to other Epic 11 stories / out of scope

- **Bootstrapping OpenTelemetry inside the Trigger.dev worker → out of scope (SigNoz/Trigger integration).** `batch-email-publish.ts` runs in the Trigger **worker process**, not the NestJS process. The `emailSendCounter` it emits (Task 1) only reaches SigNoz if that worker has an OTel meter provider registered — exactly the same precondition the existing `batch-push-publish.ts` `pushSendCounter` already depends on. This story mirrors the push task's contract; it does **not** add or verify the worker-side OTel bootstrap. If push metrics export today, email metrics will too. See `docs/reference/tech-spec-signoz-triggerdev-integration.md` Phase B. **Do not** add a `NodeSDK`/`tracing.ts` import to the task in this story.
- **tRPC mutation retry + `pg_advisory_xact_lock` idempotency of *generation* → Story 11-5.** 11-4's idempotency is scoped to the *email* send (Resend idempotency key). Do **not** touch `fetchWithRetry` or add advisory locks here.
- **Transactional amendment + Redis `schedule:*` coherence → Story 11-6.** `notifyScheduleChange` stays fire-and-forget (`.catch` → `logger.error`) exactly as 11-1/7-6 left it; do not fold it into a transaction here.
- **Normalising the `type` attribute string across email metric paths → not in this story.** The shared `triggerSendEmail` helper (`:50-63`) emits `trigger_failure` with the **hyphenated dispatch type** (`'schedule-changed'`, `'schedule-publication'` — the `send-email` task discriminators), whereas the direct-send paths use the **underscored** `'schedule_changed'` / `'schedule_publication'` (consistent with `sendBatchSchedulePublicationEmails`). This pre-existing split already applies to the auth emails (`magic-link` vs `magic_link`); match it, do not "fix" the shared helper.

### Architecture

- **Data flow / auth:** this story is **backend + Trigger-worker only** — no router, hook, or component change. `publishPlan` / the amendment mutations remain `subscribedProcedure` + `adminOnly`; `clinicId` comes from `ctx.user.clinicId`. Do not change any of that (NFR6 preserved: no query shape change).
- **Cross-cutting invariant (epic-context § 3.7 — "No silent failure / NFR3"):** every notification outage must be observable and, where a retry can help, retried. AC1 (throw → 5 retries), AC2 (fallback + caller reacts + counter), AC3 (metric) are the three faces of this invariant for the notification surface.
- **The fallback idiom already exists — mirror it, don't invent.** `sendMagicLink` (`:78-117`) is the canonical shape: `if (useTrigger) { if (await triggerSendEmail(...)) return; logger.warn('...falling back...'); } <direct resend.emails.send → error branch → counter → return/throw>`. The only deviation for schedule emails: return a **boolean** and never throw (auth emails throw `InternalServerErrorException` because a lost magic link blocks login; a lost schedule email must not abort the publish/amendment for the other recipients).
- **The throw pattern already exists — mirror it.** `send-email.ts:243-248` throws `new Error('Email send failed: ...')` on a Resend `error` so its `maxAttempts:3` retries fire. `batch-email-publish` (Task 1) applies the same principle at batch granularity, but **only after** attempting every chunk and **guarded by idempotency keys** so the retry does not re-deliver the chunks that already succeeded.
- **The counter already exists — emit it, don't create it.** `emailSendCounter` is defined in `common/metrics.ts:15-17`; `batch-push-publish.ts:75-79` is the exact emission shape to copy. AC3 is a one-import + two-`add` change inside the task.
- **Why idempotency-key + throw-on-any (Alex's decision) over throw-on-total-outage:** throwing on any failed chunk re-runs the whole `run()` on retry (Trigger has no mid-run resume). Without a key that would re-deliver the succeeded chunks → duplicate publication emails. The Resend idempotency key (unique per `(publish, chunk)`, stable across a run's retries, 24h TTL, ≤256 chars) makes the replay return the original response for already-sent chunks → **zero duplicates**, while still retrying the genuinely-failed ones. Key seed is built caller-side in `publishPlan` from `now` (publishedAt), so a *legitimate re-publish* gets a fresh key and re-notifies.

### Existing code at write time (Step-0 verbatim quotes — re-verify the symbol, line numbers may drift)

`apps/api/src/trigger/tasks/batch-email-publish.ts` (**full file today** — Task 1 replaces it; note: no `emailSendCounter` import, no idempotency, `run()` never throws, `return { sent }` is unconditional):
```ts
import { task, logger } from '@trigger.dev/sdk';
import { createElement } from 'react';
import { render } from '@react-email/render';
import { SchedulePublicationEmail } from '../../modules/mail/templates/SchedulePublicationEmail';
import { getMailTranslations, type MailLocale } from '../../modules/mail/mail-i18n';
import { getResend, mailFrom } from '../lib/resend';

const BATCH_SIZE = 100;

interface BatchEmailPayload {
  emails: Array<{ to: string; firstName: string; shiftCount: number; locale?: MailLocale }>;
  month: string;
  clinicName: string;
}

export const batchEmailPublishTask = task({
  id: 'batch-email-publish',
  retry: { maxAttempts: 5, minTimeoutInMs: 1000, maxTimeoutInMs: 10000, factor: 2 },
  run: async (payload: BatchEmailPayload) => {
    // ... render loop (unchanged) ...
    let totalSent = 0;
    for (let i = 0; i < emailPayloads.length; i += BATCH_SIZE) {
      const chunk = emailPayloads.slice(i, i + BATCH_SIZE);
      try {
        const { data, error } = await getResend().batch.send(chunk);
        if (error) {
          logger.error(`Batch email send error`, { error: error.message });      // log-only
        } else {
          totalSent += data?.data?.length ?? chunk.length;
        }
      } catch (err) {
        logger.error(`Batch email send failed for chunk ${Math.floor(i / BATCH_SIZE) + 1}`, { error: String(err) }); // swallowed
      }
    }
    logger.info(`Batch email publish complete`, { totalSent, totalEmails: emails.length });
    return { sent: totalSent };   // ALWAYS success → maxAttempts never engages
  },
});
```

`apps/api/src/trigger/tasks/send-email.ts:236-252` — the **throw-on-error pattern to mirror** (single send):
```ts
    const { error } = await getResend().emails.send({ from: mailFrom, to, subject, html });
    if (error) {
      logger.error(`Failed to send ${type} email`, { to, error: error.message });
      throw new Error(`Email send failed: ${error.message}`);   // <-- this makes maxAttempts fire
    }
    logger.info(`Sent ${type} email`, { to });
    return { sent: true };
```

`apps/api/src/trigger/tasks/batch-push-publish.ts:2, :75-79` — the **counter emission to mirror** (relative import + `{ outcome }` add):
```ts
import { pushSendCounter } from '../../common/metrics';
// ...
    pushSendCounter.add(successCount, { outcome: 'success' });
    const failedCount = subscriptions.length - successCount;
    if (failedCount > 0) {
      pushSendCounter.add(failedCount, { outcome: 'failure' });
    }
```

`apps/api/src/common/metrics.ts:14-25` — `emailSendCounter` already exists (do not re-create; import it in the task):
```ts
// --- Email ---
export const emailSendCounter = meter.createCounter('pawly.email.send', {
  description: 'Emails sent (attributes: type, outcome)',
});
export const emailBatchSize = meter.createHistogram('pawly.email.batch.size', {
  description: 'Number of emails per batch send',
  unit: '{emails}',
});
```

`apps/api/src/modules/mail/mail.service.tsx:46-63` — `useTrigger` getter + `triggerSendEmail` dispatch helper (returns `Promise<boolean>`; already counts `trigger_failure`):
```ts
  private get useTrigger(): boolean {
    return !!process.env.TRIGGER_SECRET_KEY;
  }

  async triggerSendEmail(type: string, to: string, data: Record<string, unknown>): Promise<boolean> {
    try {
      await sendEmailTask.trigger({ type: type as any, to, data });
      return true;
    } catch (err) {
      emailSendCounter.add(1, { type, outcome: 'trigger_failure' });
      this.logger.error(`Failed to trigger send-email task (${type})`, err);
      return false;
    }
  }
```

`apps/api/src/modules/mail/mail.service.tsx:349-406` — `sendSchedulePublicationEmail` **today** (Task 3 replaces it): `return this.triggerSendEmail(...)` short-circuits with **no** `logger.warn` and **no** direct fallback; the direct path is **log-only** (no counter, no throw, implicit `void`):
```tsx
  async sendSchedulePublicationEmail(employeeEmail, firstName, month, clinicName, shiftCount?, locale = 'fr') {
    const t = getMailTranslations(locale);
    if (this.useTrigger) {
      const dashboardUrl = `${webAppUrl}/dashboard/schedule`;
      return this.triggerSendEmail('schedule-publication', employeeEmail, { firstName, month, clinicName, dashboardUrl, shiftCount, locale });
    }
    try {
      // ... render + this.resend.emails.send(...) ...
      if (error) { this.logger.error(`Failed to send schedule publication email to ${employeeEmail}: ${error.message}`); } // log-only
    } catch (err) { this.logger.error('Unexpected error sending schedule publication email', err); }                        // swallowed
  }
```

`apps/api/src/modules/mail/mail.service.tsx:408-455` — `sendScheduleChangedEmail` **today** (Task 2 replaces it): same gap — no fallback, no counter, no throw:
```tsx
  async sendScheduleChangedEmail(email, firstName, month, clinicName, locale = 'fr') {
    const t = getMailTranslations(locale);
    const dashboardUrl = `${webAppUrl}/dashboard/schedule`;
    if (this.useTrigger) {
      return this.triggerSendEmail('schedule-changed', email, { firstName, month, clinicName, dashboardUrl, locale });
    }
    try {
      // ... render + this.resend.emails.send(...) ...
      if (error) { this.logger.error(`Failed to send schedule changed email: ${error.message}`); } // log-only
    } catch (err) { this.logger.error('Unexpected error sending schedule changed email', err); }    // swallowed
  }
```

`apps/api/src/modules/mail/mail.service.tsx:457-540` — `sendBatchSchedulePublicationEmails` (the direct/non-Trigger publication path; **already** emits the counter and returns `Promise<number>` — Task 5's caller reacts to that number). No change to this method:
```ts
  async sendBatchSchedulePublicationEmails(emails, month, clinicName): Promise<number> {
    // ... render + chunked this.resend.batch.send(chunk) (log-only on error) ...
    emailBatchSize.record(emailPayloads.length, { clinic: clinicName });
    emailSendCounter.add(notifiedCount, { type: 'schedule_publication', outcome: 'success' });
    const failedCount = emailPayloads.length - notifiedCount;
    if (failedCount > 0) emailSendCounter.add(failedCount, { type: 'schedule_publication', outcome: 'failure' });
    return notifiedCount;
  }
```

`apps/api/src/modules/planning/planning-generation.service.ts:2015-2025` — the `notifyScheduleChange` change-email loop **today** (Task 4 replaces it): awaits `sendScheduleChangedEmail`, discards the result:
```ts
    for (const r of unique) {
      const emp = byId.get(r.employeeId);
      if (!emp || !emp.email) continue;
      await this.mailService.sendScheduleChangedEmail(
        emp.email, emp.firstName, r.month, clinic.name,
        (emp.user?.locale as 'fr' | 'en') ?? 'fr',
      );
    }
```

`apps/api/src/modules/planning/planning-generation.service.ts:2781-2797` — the `publishPlan` email-notification block **today** (Task 5 replaces it): Trigger call is fire-and-forget with no idempotency key; direct-send count is discarded:
```ts
      if (useTrigger) {
        batchEmailPublishTask
          .trigger({ emails: emailPayloads, month, clinicName: clinic.name })
          .catch((err: Error) => this.logger.error(`Trigger batch-email-publish failed: ${err.message}`));
      } else {
        await this.mailService.sendBatchSchedulePublicationEmails(emailPayloads, month, clinic.name); // count ignored
      }
```
(`now` — the publishedAt `Date` returned by the upsert `$transaction` at `:2714` — is in scope here and is the seed for the idempotency key. `publishPlan(clinicId, month, userId)` returns `{ publishedAt, totalWithShifts }` at `:2831`.)

### File decision map

**Modify (backend + Trigger worker):**
- `apps/api/src/trigger/tasks/batch-email-publish.ts` — throw-on-failure, per-chunk idempotency key, emit `emailSendCounter`. *Single responsibility:* the Trigger batch publication-email task. *In/out:* consumes `getResend()` + templates + i18n; emits the metric; returns `{ sent }` or throws.
- `apps/api/src/modules/mail/mail.service.tsx` — wire the direct-Resend fallback + boolean status + counter into `sendScheduleChangedEmail` and `sendSchedulePublicationEmail`. *Single responsibility:* transactional/notification email dispatch. *In/out:* `triggerSendEmail` (Trigger dispatch) or `this.resend.emails.send` (direct); returns `Promise<boolean>`.
- `apps/api/src/modules/planning/planning-generation.service.ts` — `notifyScheduleChange` reacts to the boolean (Task 4); `publishPlan` passes the idempotency key + reacts to the batch count (Task 5). *Single responsibility:* generation loop + publication/amendment orchestration. *In/out:* calls `MailService` + Trigger tasks; no return-shape change.

**Modify (tests):**
- `apps/api/src/trigger/tasks/batch-email-publish.spec.ts` — **new** (repo's first Trigger-task spec).
- `apps/api/src/modules/mail/mail.service.spec.ts` — +6 tests (2 methods × 3 cases).
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` — flip the `sendScheduleChangedEmail` mock default to `true`; update the Trigger-path `toHaveBeenCalledWith` to include `idempotencyKey`; +2 caller-reaction tests.

**Create:** `apps/api/src/trigger/tasks/batch-email-publish.spec.ts` (only new file).

### Testing

- **Framework:** API = Jest, `*.spec.ts`. Per-file: `pnpm --filter @pawly/api test -- --testPathPatterns "<pattern>"`. Full gate: `pnpm --filter @pawly/api test` + `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json`.
- **First Trigger-task spec (Task 1):** there is **no** precedent for testing a `@trigger.dev/sdk` `task()` in this repo. The pattern is to `jest.mock('@trigger.dev/sdk', () => ({ task: (config) => config, logger: {...} }))` so `batchEmailPublishTask` **is** its config object and `.run(payload)` is directly callable. Mock `../lib/resend` (`getResend` → controllable `batch.send`), `@react-email/render`, the template, `mail-i18n`, and `../../common/metrics`. This isolates the task; the whole-graph `tsc` is intentionally deferred to Task 6 (the `idempotencyKey` field is optional, so the Task-1 commit does not break runtime — only the caller wiring lands in Task 5).
- **MailService fallback tests (Tasks 2-3):** reuse the existing harness in `mail.service.spec.ts` (`triggerMock` = `sendEmailTask.trigger`, `resendSend` overrides `service.resend.emails.send`, `counterMock` = `emailSendCounter.add`; `TRIGGER_SECRET_KEY` toggled in `beforeEach`/`afterEach`). The three cases mirror the existing `sendMagicLink` tests: dispatch-OK (no direct send), dispatch-fail→fallback (direct send + success counter), both-fail (returns `false`, failure counter, **no throw**). Real `getMailTranslations` is used (not mocked) — `t.subjects.scheduleChanged` / `t.subjects.schedulePublication` already exist.
- **Caller-reaction tests (Tasks 4-5):** the planning spec drives `notifyScheduleChange` via `moveShift(..., { acknowledgePublishedChange: true })` on a `publishedStatus` month (fire-and-forget → flush with `await new Promise((r) => setImmediate(r))`), and `publishPlan(clinicId, month, userId)` directly. Assert the aggregate `logger.error` via `jest.spyOn(service['logger'], 'error')`. **Flip the `sendScheduleChangedEmail` mock default to `true`** (Task 4) — otherwise the new `if (!ok)` treats the old `undefined` default as a failure and pollutes unrelated notify tests. The Trigger-path publish test's exact `toHaveBeenCalledWith({...})` **must** move to `objectContaining({..., idempotencyKey: expect.stringContaining('schedule-publish/<clinicId>:<month>:') })` because the key embeds the dynamic `now.getTime()`.
- **L-audit (epic-context § 5) — "verified" means every entry-point:** the notification surface has three entry-points — the batch **task** (AC1/AC3, Task 1 spec), the two singular **mail methods** (AC2, Tasks 2-3 specs), and the two **callers** (`notifyScheduleChange`, `publishPlan`; Tasks 4-5 specs). Do not declare done until all three are behaviourally covered, not just type-clean.

### Dependencies

- **No new libraries.** `resend@6.9.3` (installed) already types `batch.send(payload, { idempotencyKey })` (`dist/index.d.mts:1131` + `idempotencyKey?: string` at `:156`; sets the `Idempotency-Key` header). `@trigger.dev/sdk@^4.4.6`. `date-fns` is **not** in `apps/api` — no date lib needed (the key uses `Date.getTime()`).
- **Per L4 (epic-context § 5) — consult Context7, record sources in the Dev Agent Record:** during authoring, verified via Context7 `/websites/resend` that batch idempotency keys are the Resend-recommended safe-retry mechanism (unique per operation, 24h TTL, ≤256 chars, `<event-type>/<entity-id>` pattern; duplicate payload + existing key ⇒ original response, different payload + same key ⇒ 409). Before implementing, re-confirm via Context7 (a) Trigger.dev v4 retry semantics (a thrown `run()` re-runs with `maxAttempts`) and (b) that `resend.batch.send` accepts the options arg in the installed version, and record both in the Dev Agent Record.
- **Wave / dependency:** none (Wave 1, `depends_on: []`). No code overlap with 11-1/11-2/11-3. Safe to ship independently.

## File List

**Modify (backend + Trigger worker):**
- `apps/api/src/trigger/tasks/batch-email-publish.ts`
- `apps/api/src/modules/mail/mail.service.tsx`
- `apps/api/src/modules/planning/planning-generation.service.ts`

**Modify (tests):**
- `apps/api/src/modules/mail/mail.service.spec.ts`
- `apps/api/src/modules/planning/planning-generation.service.spec.ts`

**Create:**
- `apps/api/src/trigger/tasks/batch-email-publish.spec.ts`

## Dev Agent Record

- **Model:** claude-opus-4-8[1m]
- **Started:** 2026-07-10
- **Completed:** 2026-07-10

### Summary

The notification surface's three entry-points are now reliable: the batch Trigger task
throws on any failed chunk (so `maxAttempts:5` actually retries) while carrying a per-chunk
Resend idempotency key (so a retry re-delivers only the genuinely-failed chunks — zero
duplicates), the two singular mail methods fall back to a direct Resend send and return a
boolean instead of throwing, and both callers (`notifyScheduleChange`, `publishPlan`) react
to that status and error-log an aggregate on partial/total failure. `emailSendCounter` is
emitted on every path (AC3). Scope held exactly to plan; `tsc` surfaced only the
pre-existing `@pawly/*`-dist / spec-fixture noise once the shared packages were rebuilt.

### Files changed

- apps/api/src/trigger/tasks/batch-email-publish.ts
- apps/api/src/trigger/tasks/batch-email-publish.spec.ts
- apps/api/src/modules/mail/mail.service.tsx
- apps/api/src/modules/mail/mail.service.spec.ts
- apps/api/src/modules/planning/planning-generation.service.ts
- apps/api/src/modules/planning/planning-generation.service.spec.ts

### Deviations

- **None** in code — every task landed as authored.
- **Environment (not code):** the worktree needed `pnpm install` (per-workspace `node_modules`
  was absent) and a `@pawly/types` + `@pawly/validators` dist rebuild before `tsc` (project
  memory `epic11-dev-gotchas`; no path mapping → stale `exports.types`). After the rebuild,
  `tsc --noEmit` shows **24 pre-existing errors** in 4 unrelated specs (clinic / employee /
  planning.service / variance — `is24_7`, `employeeId`, `EquityCounterType`, `page/pageSize`),
  **none** referencing any file or symbol this story touched. Documented as spec-fixture noise
  in 11-1/11-2, not introduced here.
- **L4 / Context7 sources consulted:**
  - **Trigger.dev v4 retry** (`/websites/trigger_dev`, `trigger.dev/docs/errors-retrying`,
    `.../how-to-reduce-your-spend`): "when an error is thrown in a task, your run will be
    automatically reattempted based on your retry settings"; a clean return does not retry;
    the whole `run()` re-executes on retry (no mid-run resume) — this is exactly why the
    per-chunk idempotency key is required.
  - **Resend batch idempotency**: re-confirmed against the installed `resend@6.9.3` types —
    `Batch.send<Options>(payload, options?)` and `IdempotentRequest.idempotencyKey?: string`
    → sent as the `Idempotency-Key` header (`dist/index.d.mts:1131`, `:156`).

### Test output

```
# per-file gates (RED→GREEN witnessed each task)
pnpm --filter @pawly/api test -- --testPathPatterns "batch-email-publish.spec"   → 5 passed
pnpm --filter @pawly/api test -- --testPathPatterns "mail.service.spec"          → 14 passed
pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec" → 148 passed

# full API gate (Task 6)
pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json → 24 pre-existing errors, 0 in touched files
pnpm --filter @pawly/api test → Test Suites: 34 passed, 34 total · Tests: 904 passed, 904 total (exit 0)
```

## Review Record

### Findings

### Verification

### Ticket sync
