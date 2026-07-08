# Story: 7-6-post-publication-change-management — Post-Publication Change Management

**Epic:** Epic 7 — Admin Arbitration & Final Validation
**Status:** ready-for-dev
**Branch:** feature/story-7-6-post-publication-change-management
**Origin:** docs/pre-mortem.md R1 (HIGH×CRITICAL) — silent edits on published plannings

## User Story

**As an** admin, **I want** schedule changes made after publication to be explicit, notified, and consistency-preserving, **so that** employees never show up on a stale schedule and the "System Never Lies" promise holds after publication.

## Acceptance Criteria

1. **Given** a month whose `PlanningPeriodStatus` is PUBLISHED, **When** `moveShift`, `createManualShift`, or `deleteShift` is called without `acknowledgePublishedChange: true`, **Then** the API throws `ConflictException('PUBLISHED_CHANGE_REQUIRES_ACK')` and no data changes. A move whose source and target dates fall in different months checks **both** months.
2. **Given** an acknowledged `moveShift` that changes the shift's date or employee, **Then** the shift's `isConfirmed` flag is reset to `false`.
3. **Given** an acknowledged mutation touching a PUBLISHED month, **Then** every affected employee (for a move: the original assignee AND the new assignee, each only if their side's month is published) receives a `schedule-changed` email (new template, 12th email type) and a push notification, regardless of their `notifyOnPublish` preference. Notification failures are logged, never block the mutation.
4. **Given** an acknowledged mutation touching a PUBLISHED month, **Then** that month's `PlanningPeriodStatus` records `amendedAt = now()` and increments `amendmentCount`, and `getPublicationStatus` returns both fields.
5. **Given** the admin grid on a PUBLISHED month, **When** the admin drops a shift or assigns a hole, **Then** a confirmation dialog explains that affected employees will be notified; confirming re-fires the mutation with `acknowledgePublishedChange: true`; cancelling leaves the schedule untouched (DnD snap-back).
6. **Given** the admin grid on a DRAFT month, **Then** behaviour is unchanged — no dialog, no flag, no notification.
7. **Given** the Health Bar on a published-and-amended month, **Then** the "Published" badge additionally shows the last amendment date and count.
8. **Given** FR/EN locales, **Then** the dialog, badge, error toast (`PUBLISHED_CHANGE_REQUIRES_ACK` mapped to a translated message — never raw code/English prose, pre-mortem R9), and email are fully translated; the dialog is keyboard-accessible (WCAG AA).

## Tasks

- [x] **Task 1: Add `acknowledgePublishedChange` to shift-mutation validators** [AC: 1]
  In `packages/validators/src/planning/shift-mutation.schema.ts`, replace the three input schemas with:
  ```ts
  export const moveShiftInputSchema = z
    .object({
      shiftId: z.string().uuid("Shift ID must be a valid UUID"),
      targetEmployeeId: z
        .string()
        .uuid("Target employee ID must be a valid UUID")
        .optional(),
      targetDate: z
        .string()
        .regex(DATE_REGEX, "Target date must be in YYYY-MM-DD format")
        .optional(),
      acknowledgePublishedChange: z.boolean().default(false),
    })
    .superRefine((data, ctx) => {
      if (!data.targetEmployeeId && !data.targetDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "At least one of targetEmployeeId or targetDate must be provided",
          path: ["targetEmployeeId"],
        });
      }
    });
  export type MoveShiftInput = z.infer<typeof moveShiftInputSchema>;

  export const createManualShiftInputSchema = z.object({
    employeeId: z.string().uuid("Employee ID must be a valid UUID"),
    date: z.string().regex(DATE_REGEX, "Date must be in YYYY-MM-DD format"),
    shiftTypeCode: z.string().min(1, "Shift type code is required"),
    startTime: z.string().regex(TIME_REGEX, "Start time must be in HH:MM format"),
    endTime: z.string().regex(TIME_REGEX, "End time must be in HH:MM format"),
    breakMinutes: z.number().int().min(0).default(0),
    acknowledgePublishedChange: z.boolean().default(false),
  });
  export type CreateManualShiftInput = z.infer<
    typeof createManualShiftInputSchema
  >;

  export const deleteShiftInputSchema = z.object({
    shiftId: z.string().uuid("Shift ID must be a valid UUID"),
    acknowledgePublishedChange: z.boolean().default(false),
  });
  export type DeleteShiftInput = z.infer<typeof deleteShiftInputSchema>;
  ```
  In `packages/validators/src/planning/equity-alert.schema.ts`, extend `publicationStatusResultSchema` (keep existing fields, add two optional ones):
  ```ts
  export const publicationStatusResultSchema = z.object({
    status: z.enum(["DRAFT", "PUBLISHED"]),
    publishedAt: z.string().datetime().nullable(),
    publishedBy: z.string().uuid().nullable(),
    amendedAt: z.string().datetime().nullable().optional(),
    amendmentCount: z.number().int().min(0).optional(),
  });
  ```
  (Check the existing object's exact field lines first — only `amendedAt`/`amendmentCount` are new; `status` enum values must match what is already there.)
  In `packages/validators/src/planning/shift-mutation.schema.test.ts`, add:
  ```ts
  describe("acknowledgePublishedChange", () => {
    it("defaults to false on moveShift input", () => {
      const parsed = moveShiftInputSchema.parse({
        shiftId: "123e4567-e89b-12d3-a456-426614174000",
        targetDate: "2026-07-15",
      });
      expect(parsed.acknowledgePublishedChange).toBe(false);
    });

    it("accepts explicit true on all three schemas", () => {
      expect(
        moveShiftInputSchema.parse({
          shiftId: "123e4567-e89b-12d3-a456-426614174000",
          targetDate: "2026-07-15",
          acknowledgePublishedChange: true,
        }).acknowledgePublishedChange,
      ).toBe(true);
      expect(
        createManualShiftInputSchema.parse({
          employeeId: "123e4567-e89b-12d3-a456-426614174000",
          date: "2026-07-15",
          shiftTypeCode: "CHIR",
          startTime: "08:30",
          endTime: "18:30",
          acknowledgePublishedChange: true,
        }).acknowledgePublishedChange,
      ).toBe(true);
      expect(
        deleteShiftInputSchema.parse({
          shiftId: "123e4567-e89b-12d3-a456-426614174000",
          acknowledgePublishedChange: true,
        }).acknowledgePublishedChange,
      ).toBe(true);
    });
  });
  ```
  Run: `pnpm --filter @pawly/validators test -- src/planning/shift-mutation.schema.test.ts`
  Expected: all tests pass (existing 30 + 2 new), exit 0.
  Commit: `git add packages/validators/src/planning/shift-mutation.schema.ts packages/validators/src/planning/equity-alert.schema.ts packages/validators/src/planning/shift-mutation.schema.test.ts && git commit -m "feat(story-7-6): acknowledgePublishedChange flag on shift mutation schemas"`

- [x] **Task 2: Amendment fields on PlanningPeriodStatus** [AC: 4]
  In `apps/api/prisma/schema/PlanningPeriodStatus.prisma`, add the two fields after `publishedBy`:
  ```prisma
  model PlanningPeriodStatus {
    id             String                   @id @default(cuid())
    clinicId       String                   @map("clinic_id")
    clinic         Clinic                   @relation(fields: [clinicId], references: [id], onDelete: Cascade)
    month          String                   // "YYYY-MM"
    status         PlanningPeriodStatusType @default(DRAFT)
    publishedAt    DateTime?                @map("published_at")
    publishedBy    String?                  @map("published_by")
    amendedAt      DateTime?                @map("amended_at")
    amendmentCount Int                      @default(0) @map("amendment_count")
    createdAt      DateTime                 @default(now()) @map("created_at")
    updatedAt      DateTime                 @updatedAt @map("updated_at")

    @@unique([clinicId, month])
    @@index([clinicId])
    @@map("planning_period_statuses")
  }
  ```
  Run (from repo root): `pnpm db:generate && pnpm db:push`
  Expected: `Your database is now in sync with your Prisma schema`, exit 0. This is an additive change (nullable + default) — no data loss warning must appear; if one appears, STOP and report.
  Commit: `git add apps/api/prisma/schema/PlanningPeriodStatus.prisma && git commit -m "feat(story-7-6): amendedAt/amendmentCount on PlanningPeriodStatus"`

- [x] **Task 3: mail-i18n entries for schedule-changed** [AC: 3, 8]
  In `apps/api/src/modules/mail/mail-i18n.ts`, three additions (mirror the `schedulePublication` entries that already exist in the interface and in BOTH the `fr` and `en` objects):
  1. Interface `subjects`: add after `schedulePublication`:
  ```ts
      scheduleChanged: (clinicName: string, month: string) => string;
  ```
  2. Interface per-template content: add after the `schedulePublication` block:
  ```ts
    scheduleChanged: {
      heading: string;
      subject: (month: string) => string;
      button: string;
      disclaimer: string;
    };
  ```
  3. `fr` object — `subjects`: `scheduleChanged: (clinicName, month) => `${clinicName} — Votre planning de ${month} a été modifié``; content block:
  ```ts
    scheduleChanged: {
      heading: 'Planning modifié',
      subject: (month: string) => `Modification de votre planning de ${month}`,
      button: 'Voir mon planning',
      disclaimer:
        'Vous recevez cet email car un créneau de votre planning publié a été modifié.',
    },
  ```
  4. `en` object — `subjects`: `scheduleChanged: (clinicName, month) => `${clinicName} — Your ${month} schedule was updated``; content block:
  ```ts
    scheduleChanged: {
      heading: 'Schedule updated',
      subject: (month: string) => `Your ${month} schedule was updated`,
      button: 'View my schedule',
      disclaimer:
        'You are receiving this email because a shift on your published schedule was changed.',
    },
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20` (type-check only; full test run comes later)
  Expected: no errors mentioning `mail-i18n`, exit 0.
  Commit: `git add apps/api/src/modules/mail/mail-i18n.ts && git commit -m "feat(story-7-6): scheduleChanged mail translations"`

- [x] **Task 4: ScheduleChangedEmail template** [AC: 3, 8]
  Create `apps/api/src/modules/mail/templates/ScheduleChangedEmail.tsx` (new file, full content — style constants copied from `SchedulePublicationEmail.tsx` so both stay visually identical):
  ```tsx
  import { Button, Heading, Text, Section } from '@react-email/components';
  import * as React from 'react';
  import { EmailLayout } from './components/EmailLayout';
  import { getMailTranslations, type MailLocale } from '../mail-i18n';

  interface ScheduleChangedEmailProps {
    firstName: string;
    month: string;
    clinicName: string;
    dashboardUrl?: string;
    locale?: MailLocale;
  }

  export const ScheduleChangedEmail = ({
    firstName,
    month,
    clinicName,
    dashboardUrl = '#',
    locale = 'fr',
  }: ScheduleChangedEmailProps) => {
    const t = getMailTranslations(locale);
    return (
      <EmailLayout
        previewText={
          locale === 'fr'
            ? `Votre planning de ${month} a été modifié`
            : `Your ${month} schedule was updated`
        }
        tag={t.tags.planning}
        locale={locale}
      >
        <Heading style={h1}>{t.scheduleChanged.heading}</Heading>
        <Text style={subjectText}>{t.scheduleChanged.subject(month)}</Text>

        <Text style={text}>
          {t.common.helloName(firstName)},
          <br />
          <br />
          {locale === 'fr' ? (
            <>
              Le planning publié de <strong>{month}</strong> a été modifié par{' '}
              <strong>{clinicName}</strong> et un de vos créneaux est concerné.
              Merci de vérifier vos horaires à jour sur votre espace Pawly.
            </>
          ) : (
            <>
              The published schedule for <strong>{month}</strong> was updated by{' '}
              <strong>{clinicName}</strong> and one of your shifts is affected.
              Please check your up-to-date hours on your Pawly space.
            </>
          )}
        </Text>

        <Section style={buttonContainer}>
          <Button href={dashboardUrl} style={button}>
            {t.scheduleChanged.button}
          </Button>
        </Section>

        <Text style={disclaimer}>{t.scheduleChanged.disclaimer}</Text>
      </EmailLayout>
    );
  };

  const h1 = {
    color: '#171717',
    fontSize: '24px',
    fontWeight: '700',
    lineHeight: '32px',
    letterSpacing: '-0.02em',
    margin: '0 0 8px',
  };

  const subjectText = {
    color: '#A3A3A3',
    fontSize: '14px',
    fontWeight: '500',
    margin: '0 0 24px',
  };

  const text = {
    color: '#525252',
    fontSize: '15px',
    lineHeight: '26px',
    margin: '0 0 32px',
  };

  const buttonContainer = {
    margin: '32px 0 24px',
    textAlign: 'center' as const,
    width: '100%',
  };

  const button = {
    backgroundColor: '#171717',
    borderRadius: '16px',
    color: '#FFFFFF',
    fontSize: '15px',
    fontWeight: '700',
    textDecoration: 'none',
    padding: '16px 0',
    display: 'block',
    width: '100%',
    textAlign: 'center' as const,
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  };

  const disclaimer = {
    color: '#A3A3A3',
    fontSize: '12px',
    textAlign: 'center' as const,
    marginTop: '24px',
  };
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no errors mentioning `ScheduleChangedEmail`, exit 0.
  Commit: `git add apps/api/src/modules/mail/templates/ScheduleChangedEmail.tsx && git commit -m "feat(story-7-6): ScheduleChangedEmail template"`

- [x] **Task 5: MailService.sendScheduleChangedEmail** [AC: 3]
  In `apps/api/src/modules/mail/mail.service.tsx`: add the import `import { ScheduleChangedEmail } from './templates/ScheduleChangedEmail';` next to the other template imports, then add this method after `sendSchedulePublicationEmail` (same trigger-first pattern; non-critical type → log-only on trigger failure, matching `sendSchedulePublicationEmail`):
  ```tsx
  async sendScheduleChangedEmail(
    email: string,
    firstName: string,
    month: string,
    clinicName: string,
    locale: MailLocale = 'fr',
  ) {
    const t = getMailTranslations(locale);
    const webAppUrl = this.configService.get('WEB_APP_URL', { infer: true }) ?? '';
    const dashboardUrl = `${webAppUrl}/dashboard/schedule`;
    if (this.useTrigger) {
      return this.triggerSendEmail('schedule-changed', email, {
        firstName,
        month,
        clinicName,
        dashboardUrl,
        locale,
      });
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
        this.logger.error(`Failed to send schedule changed email: ${error.message}`);
      }
    } catch (err) {
      this.logger.error('Unexpected error sending schedule changed email', err);
    }
  }
  ```
  Note: `triggerSendEmail` returns `Promise<boolean>` since the pre-mortem quick fixes (PR #92) — the `return` here matches the other non-critical senders.
  Run: `pnpm --filter @pawly/api test -- --testPathPatterns "mail.service.spec"`
  Expected: `Test Suites: 1 passed` (the 8 existing fallback tests still green), exit 0.
  Commit: `git add apps/api/src/modules/mail/mail.service.tsx && git commit -m "feat(story-7-6): sendScheduleChangedEmail"`

- [x] **Task 6: schedule-changed type in the Trigger.dev task** [AC: 3]
  In `apps/api/src/trigger/tasks/send-email.ts`:
  1. Add the import next to the other template imports:
  ```ts
  import { ScheduleChangedEmail } from '../../modules/mail/templates/ScheduleChangedEmail';
  ```
  2. Extend the `EmailType` union with `| 'schedule-changed'` (after `'schedule-publication'`).
  3. Add this case to the `renderEmail` switch, right after the `'schedule-publication'` case:
  ```ts
      case 'schedule-changed': {
        const html = await render(createElement(ScheduleChangedEmail, {
          firstName: data.firstName as string,
          month: data.month as string,
          clinicName: data.clinicName as string,
          dashboardUrl: data.dashboardUrl as string,
          locale,
        }));
        return { html, subject: t.subjects.scheduleChanged(data.clinicName as string, data.month as string) };
      }
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no errors mentioning `send-email`, exit 0. (The `trigger-deploy.yml` paths filter already covers both `src/trigger/**` and `src/modules/mail/**` since PR #92 — no CI change needed.)
  Commit: `git add apps/api/src/trigger/tasks/send-email.ts && git commit -m "feat(story-7-6): schedule-changed trigger email type"`

- [x] **Task 7: service guard, amendment tracking, notification helpers + moveShift** [AC: 1, 2, 3, 4]
  In `apps/api/src/modules/planning/planning-generation.service.ts`, add these three private helpers just above `moveShift` (after the `// ── Shift mutation methods` comment banner):
  ```ts
  /**
   * Story 7.6 — post-publication guard. Returns the subset of `months`
   * that are PUBLISHED. Throws when at least one is published and the
   * caller has not acknowledged the change (structured code, mapped to a
   * translated message in the web layer — never English prose).
   */
  private async assertPublishedChangeAcknowledged(
    clinicId: string,
    months: string[],
    acknowledged: boolean,
  ): Promise<string[]> {
    const unique = [...new Set(months)];
    const published = await this.prisma.planningPeriodStatus.findMany({
      where: { clinicId, month: { in: unique }, status: 'PUBLISHED' },
      select: { month: true },
    });
    const publishedMonths = published.map((p) => p.month);
    if (publishedMonths.length > 0 && !acknowledged) {
      throw new ConflictException('PUBLISHED_CHANGE_REQUIRES_ACK');
    }
    return publishedMonths;
  }

  private async recordAmendment(clinicId: string, months: string[]): Promise<void> {
    if (months.length === 0) return;
    await this.prisma.planningPeriodStatus.updateMany({
      where: { clinicId, month: { in: months }, status: 'PUBLISHED' },
      data: { amendedAt: new Date(), amendmentCount: { increment: 1 } },
    });
  }

  /**
   * Notifies each (employee, month) pair once — email + push. Ignores the
   * notifyOnPublish preference on purpose: missing a post-publication
   * change means a missed shift (decision locked in story 7.6).
   */
  private async notifyScheduleChange(
    clinicId: string,
    recipients: Array<{ employeeId: string; month: string }>,
  ): Promise<void> {
    const seen = new Set<string>();
    const unique = recipients.filter((r) => {
      const key = `${r.employeeId}|${r.month}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length === 0) return;

    const [employees, clinic] = await Promise.all([
      this.prisma.employee.findMany({
        where: {
          id: { in: unique.map((r) => r.employeeId) },
          clinicId,
          isActive: true,
          email: { not: null },
        },
        select: {
          id: true,
          firstName: true,
          email: true,
          user: { select: { locale: true } },
        },
      }),
      this.prisma.clinic.findUniqueOrThrow({
        where: { id: clinicId },
        select: { name: true },
      }),
    ]);
    const byId = new Map(employees.map((e) => [e.id, e]));

    for (const r of unique) {
      const emp = byId.get(r.employeeId);
      if (!emp) continue;
      await this.mailService.sendScheduleChangedEmail(
        emp.email!,
        emp.firstName,
        r.month,
        clinic.name,
        (emp.user?.locale as 'fr' | 'en') ?? 'fr',
      );
    }

    const pushIds = [...new Set(unique.map((r) => r.employeeId))].filter((id) => byId.has(id));
    if (pushIds.length > 0) {
      this.pushNotificationService
        .sendBatchPushNotifications(pushIds, {
          title: `${clinic.name} — Planning modifié`,
          body: 'Votre planning a été modifié. Vérifiez vos créneaux.',
          url: '/dashboard/schedule',
        })
        .catch((err: Error) =>
          this.logger.error(`Push schedule-change failed: ${err.message}`),
        );
    }
  }
  ```
  Then replace the whole `moveShift` method with (unchanged parts kept verbatim from current lines 1444-1517; new lines are the `options` param, the guard, `employeeChanged`/`dateChanged`, the `isConfirmed` reset, and the amendment/notification block):
  ```ts
  async moveShift(
    clinicId: string,
    shiftId: string,
    target: { targetEmployeeId?: string; targetDate?: string },
    options: { acknowledgePublishedChange?: boolean } = {},
  ): Promise<ScheduleShift> {
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.clinicId !== clinicId) throw new ForbiddenException('Shift does not belong to this clinic');

    if (target.targetDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(target.targetDate)) {
        throw new BadRequestException('Invalid date format');
      }
      const parsedDate = new Date(`${target.targetDate}T00:00:00.000Z`);
      if (isNaN(parsedDate.getTime())) {
        throw new BadRequestException('Invalid date value');
      }
    }

    if (target.targetEmployeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: { id: target.targetEmployeeId, clinicId, isActive: true },
      });
      if (!employee) throw new NotFoundException('Target employee not found or inactive');
    }

    // Story 7.6 — post-publication guard (checks BOTH months on a cross-month move)
    const originalEmployeeId = shift.employeeId;
    const originalDateISO = shift.date.toISOString().split('T')[0];
    const originalMonth = originalDateISO.slice(0, 7);
    const targetMonth = target.targetDate ? target.targetDate.slice(0, 7) : originalMonth;
    const publishedMonths = await this.assertPublishedChangeAcknowledged(
      clinicId,
      [originalMonth, targetMonth],
      options.acknowledgePublishedChange ?? false,
    );

    // Check for time overlap on the target employee + date
    const overlapEmployeeId = target.targetEmployeeId || shift.employeeId;
    const overlapDate = target.targetDate
      ? new Date(`${target.targetDate}T00:00:00.000Z`)
      : shift.date;

    const existingShifts = await this.prisma.shift.findMany({
      where: {
        employeeId: overlapEmployeeId,
        clinicId,
        date: overlapDate,
        id: { not: shiftId },
      },
    });

    for (const existing of existingShifts) {
      if (this.timesOverlap(shift.startTime, shift.endTime, existing.startTime, existing.endTime)) {
        throw new ConflictException(
          `Shift overlaps with existing shift (${existing.startTime}-${existing.endTime})`,
        );
      }
    }

    const employeeChanged =
      !!target.targetEmployeeId && target.targetEmployeeId !== shift.employeeId;
    const dateChanged = !!target.targetDate && target.targetDate !== originalDateISO;

    const updated = await this.prisma.shift.update({
      where: { id: shiftId },
      data: {
        ...(target.targetEmployeeId && { employeeId: target.targetEmployeeId }),
        ...(target.targetDate && { date: new Date(`${target.targetDate}T00:00:00.000Z`) }),
        source: 'MANUAL',
        // Story 7.6 — a moved shift is no longer the one the employee confirmed
        ...((employeeChanged || dateChanged) && { isConfirmed: false }),
      },
    });

    // Story 7.6 — amendment tracking + notifications (published months only)
    if (publishedMonths.length > 0 && (employeeChanged || dateChanged)) {
      const updatedMonth = updated.date.toISOString().split('T')[0].slice(0, 7);
      const recipients = [
        { employeeId: originalEmployeeId, month: originalMonth },
        { employeeId: updated.employeeId, month: updatedMonth },
      ].filter((r) => publishedMonths.includes(r.month));
      await this.recordAmendment(clinicId, publishedMonths);
      this.notifyScheduleChange(clinicId, recipients).catch((err: Error) =>
        this.logger.error(`schedule-change notification failed: ${err.message}`),
      );
    }

    const shiftTypes = await this.clinicService.listShiftTypes(clinicId);
    const colorMap = new Map(shiftTypes.map((st) => [st.code, st.color]));

    return {
      id: updated.id,
      date: updated.date.toISOString().split('T')[0],
      startTime: updated.startTime,
      endTime: updated.endTime,
      shiftTypeCode: updated.shiftTypeCode,
      breakMinutes: updated.breakMinutes,
      source: updated.source as 'GENERATED' | 'MANUAL',
      employeeId: updated.employeeId,
      isConfirmed: updated.isConfirmed,
      shiftTypeColor: colorMap.get(updated.shiftTypeCode) ?? null,
    };
  }
  ```
  `ConflictException` is already imported (used by the overlap check). Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no new errors, exit 0 (tests come in Task 9).
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(story-7-6): published-change guard + amendment + notify on moveShift"`

- [x] **Task 8: guards on createManualShift/deleteShift + getPublicationStatus fields** [AC: 1, 3, 4]
  Still in `apps/api/src/modules/planning/planning-generation.service.ts`:
  1. `createManualShift` — change the signature's input type and add the guard + post-create block. Input type becomes:
  ```ts
  input: {
    employeeId: string;
    date: string;
    shiftTypeCode: string;
    startTime: string;
    endTime: string;
    breakMinutes?: number;
    acknowledgePublishedChange?: boolean;
  },
  ```
  Insert after the shift-type lookup (`if (!shiftType) throw ...`) and before the overlap check:
  ```ts
    // Story 7.6 — post-publication guard
    const month = input.date.slice(0, 7);
    const publishedMonths = await this.assertPublishedChangeAcknowledged(
      clinicId,
      [month],
      input.acknowledgePublishedChange ?? false,
    );
  ```
  Insert after `const created = await this.prisma.shift.create({...});`:
  ```ts
    if (publishedMonths.length > 0) {
      await this.recordAmendment(clinicId, publishedMonths);
      this.notifyScheduleChange(clinicId, [
        { employeeId: created.employeeId, month },
      ]).catch((err: Error) =>
        this.logger.error(`schedule-change notification failed: ${err.message}`),
      );
    }
  ```
  2. `deleteShift` — replace the whole method with:
  ```ts
  async deleteShift(
    clinicId: string,
    shiftId: string,
    options: { acknowledgePublishedChange?: boolean } = {},
  ): Promise<{ deleted: true }> {
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.clinicId !== clinicId) throw new ForbiddenException('Shift does not belong to this clinic');

    // Story 7.6 — post-publication guard
    const month = shift.date.toISOString().split('T')[0].slice(0, 7);
    const publishedMonths = await this.assertPublishedChangeAcknowledged(
      clinicId,
      [month],
      options.acknowledgePublishedChange ?? false,
    );

    await this.prisma.shift.delete({ where: { id: shiftId } });

    if (publishedMonths.length > 0) {
      await this.recordAmendment(clinicId, publishedMonths);
      this.notifyScheduleChange(clinicId, [
        { employeeId: shift.employeeId, month },
      ]).catch((err: Error) =>
        this.logger.error(`schedule-change notification failed: ${err.message}`),
      );
    }

    return { deleted: true };
  }
  ```
  3. `getPublicationStatus` — replace the return-shape parts so amendments are exposed (keep the month-regex guard as is):
  ```ts
  async getPublicationStatus(
    clinicId: string,
    month: string,
  ): Promise<{
    status: 'DRAFT' | 'PUBLISHED';
    publishedAt: string | null;
    publishedBy: string | null;
    amendedAt: string | null;
    amendmentCount: number;
  }> {
    if (!PlanningGenerationService.MONTH_REGEX.test(month)) {
      throw new BadRequestException(`Invalid month format: ${month}. Expected YYYY-MM`);
    }

    const record = await this.prisma.planningPeriodStatus.findUnique({
      where: { clinicId_month: { clinicId, month } },
    });

    if (!record) {
      return { status: 'DRAFT', publishedAt: null, publishedBy: null, amendedAt: null, amendmentCount: 0 };
    }

    return {
      status: record.status as 'DRAFT' | 'PUBLISHED',
      publishedAt: record.publishedAt?.toISOString() ?? null,
      publishedBy: record.publishedBy,
      amendedAt: record.amendedAt?.toISOString() ?? null,
      amendmentCount: record.amendmentCount,
    };
  }
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no new errors, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(story-7-6): guards on create/delete + amendment fields in publication status"`

- [x] **Task 9: service tests** [AC: 1, 2, 3, 4]
  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, add a `describe('Story 7.6 — post-publication change management', ...)` block. Follow the file's existing mock style (mocked PrismaService object with `jest.fn()` per model method — read the top of the file for the exact mock shape before writing). The block must cover, at minimum, these seven behaviours:
  ```ts
  describe('Story 7.6 — post-publication change management', () => {
    const publishedStatus = { month: '2026-07' };

    it('moveShift throws PUBLISHED_CHANGE_REQUIRES_ACK on a published month without acknowledgement', async () => {
      prisma.shift.findUnique.mockResolvedValue(baseShift); // date in 2026-07
      prisma.planningPeriodStatus.findMany.mockResolvedValue([publishedStatus]);
      await expect(
        service.moveShift(clinicId, baseShift.id, { targetDate: '2026-07-20' }),
      ).rejects.toMatchObject({ message: 'PUBLISHED_CHANGE_REQUIRES_ACK' });
      expect(prisma.shift.update).not.toHaveBeenCalled();
    });

    it('moveShift proceeds on a published month with acknowledgement and resets isConfirmed', async () => { /* acknowledged: expect update called with isConfirmed: false when targetDate differs */ });

    it('moveShift does not reset isConfirmed when neither date nor employee changes', async () => { /* target equals current values */ });

    it('moveShift checks BOTH months on a cross-month move', async () => { /* expect planningPeriodStatus.findMany called with month: { in: ['2026-07','2026-08'] } */ });

    it('acknowledged mutation on a published month increments amendmentCount and notifies', async () => { /* expect planningPeriodStatus.updateMany with amendmentCount increment; expect mailService.sendScheduleChangedEmail called */ });

    it('createManualShift and deleteShift enforce the same guard', async () => { /* both reject without ack when month published */ });

    it('mutations on a DRAFT month behave exactly as before (no guard, no notification)', async () => { /* findMany returns [] → no throw, no updateMany, no email */ });
  });
  ```
  Replace each `/* ... */` with full arrange/act/assert code following the surrounding file's established mocks — the seven test names and their assertions above are the contract. Mock `planningPeriodStatus.findMany`/`updateMany` on the prisma mock (add them if the mock object lacks them) and `sendScheduleChangedEmail: jest.fn()` on the MailService mock.
  Run: `pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec"`
  Expected: all existing + 7 new tests pass, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(story-7-6): post-publication guard service tests"`

- [x] **Task 10: router passthrough + pub-cache invalidation + router tests** [AC: 1, 4]
  In `apps/api/src/trpc/routers/planning.router.ts`, replace the three mutation procedures (current lines 266-304) with:
  ```ts
  moveShift: subscribedProcedure
    .input(moveShiftInputSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      const result = await ctx.planningGenerationService.moveShift(
        ctx.user.clinicId,
        input.shiftId,
        { targetEmployeeId: input.targetEmployeeId, targetDate: input.targetDate },
        { acknowledgePublishedChange: input.acknowledgePublishedChange },
      );
      await ctx.redis.invalidatePattern(`schedule:${ctx.user.clinicId}:*`);
      await ctx.redis.invalidatePattern(`planning:pub:${ctx.user.clinicId}:*`);
      await ctx.redis.del(`dashboard:stats:${ctx.user.clinicId}`);
      return result;
    }),

  createManualShift: subscribedProcedure
    .input(createManualShiftInputSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      const result = await ctx.planningGenerationService.createManualShift(
        ctx.user.clinicId,
        input,
      );
      await ctx.redis.invalidatePattern(`schedule:${ctx.user.clinicId}:*`);
      await ctx.redis.invalidatePattern(`planning:pub:${ctx.user.clinicId}:*`);
      await ctx.redis.del(`dashboard:stats:${ctx.user.clinicId}`);
      return result;
    }),

  deleteShift: subscribedProcedure
    .input(deleteShiftInputSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      const result = await ctx.planningGenerationService.deleteShift(
        ctx.user.clinicId,
        input.shiftId,
        { acknowledgePublishedChange: input.acknowledgePublishedChange },
      );
      await ctx.redis.invalidatePattern(`schedule:${ctx.user.clinicId}:*`);
      await ctx.redis.invalidatePattern(`planning:pub:${ctx.user.clinicId}:*`);
      await ctx.redis.del(`dashboard:stats:${ctx.user.clinicId}`);
      return result;
    }),
  ```
  In `apps/api/src/trpc/routers/planning.router.spec.ts`, add two tests to the existing shift-mutation describe block: (1) `moveShift` forwards `acknowledgePublishedChange: true` to the service as the 4th argument; (2) `moveShift` invalidates the `planning:pub:` Redis pattern. Follow the file's existing caller/mock helpers verbatim.
  Run: `pnpm --filter @pawly/api test -- --testPathPatterns "planning.router.spec"`
  Expected: all existing + 2 new tests pass, exit 0.
  Commit: `git add apps/api/src/trpc/routers/planning.router.ts apps/api/src/trpc/routers/planning.router.spec.ts && git commit -m "feat(story-7-6): router passthrough + pub cache invalidation"`

- [x] **Task 11: PublishedChangeDialog + usePublishedChangeGuard** [AC: 5, 6, 8]
  Create `apps/web/src/app/[locale]/admin/planning/_hooks/usePublishedChangeGuard.ts`:
  ```ts
  "use client";

  import { useCallback, useRef, useState } from "react";

  type PendingRun = (acknowledge: boolean) => void;

  /**
   * Story 7.6 — single interception point for mutations on a PUBLISHED
   * month. On a DRAFT month the mutation runs immediately (ack=false).
   * On a PUBLISHED month the run is stashed and the confirmation dialog
   * opens; confirm re-fires it with ack=true, cancel drops it.
   */
  export function usePublishedChangeGuard(isPublished: boolean) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const pendingRef = useRef<PendingRun | null>(null);

    const guard = useCallback(
      (run: PendingRun) => {
        if (!isPublished) {
          run(false);
          return;
        }
        pendingRef.current = run;
        setDialogOpen(true);
      },
      [isPublished],
    );

    const confirm = useCallback(() => {
      setDialogOpen(false);
      pendingRef.current?.(true);
      pendingRef.current = null;
    }, []);

    const cancel = useCallback(() => {
      setDialogOpen(false);
      pendingRef.current = null;
    }, []);

    return { guard, dialogOpen, confirm, cancel };
  }
  ```
  Create `apps/web/src/app/[locale]/admin/planning/_components/PublishedChangeDialog.tsx` (same shadcn `AlertDialog` composition as `PublishConfirmDialog.tsx` — open that file and mirror its imports and JSX skeleton exactly):
  ```tsx
  "use client";

  import { useTranslations } from "next-intl";
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from "@/components/ui/alert-dialog";

  type Props = {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  };

  export function PublishedChangeDialog({ open, onConfirm, onCancel }: Props) {
    const t = useTranslations("admin.publishedChange");

    return (
      <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("dialogDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancel}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>{t("confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }
  ```
  (If `PublishConfirmDialog.tsx` imports the AlertDialog primitives from a different path or composes them differently, mirror THAT file — it is the source of truth for the project's dialog composition.)
  Run: `pnpm --filter @pawly/web exec tsc --noEmit 2>&1 | head -20`
  Expected: no errors mentioning the two new files, exit 0.
  Commit: `git add "apps/web/src/app/[locale]/admin/planning/_hooks/usePublishedChangeGuard.ts" "apps/web/src/app/[locale]/admin/planning/_components/PublishedChangeDialog.tsx" && git commit -m "feat(story-7-6): published-change guard hook + dialog"`

- [x] **Task 12: wire the guard into ScheduleViewWrapper + error-code mapping** [AC: 5, 6, 8]
  1. In `apps/web/src/app/[locale]/admin/planning/_components/ScheduleViewWrapper.tsx`:
  - Add imports: `import { PublishedChangeDialog } from "./PublishedChangeDialog";` and `import { usePublishedChangeGuard } from "../_hooks/usePublishedChangeGuard";`
  - After the `usePublish` call (current line 35-37), add:
  ```tsx
  const isPublished = publicationStatus?.status === "PUBLISHED";
  const {
    guard,
    dialogOpen: publishedChangeDialogOpen,
    confirm: confirmPublishedChange,
    cancel: cancelPublishedChange,
  } = usePublishedChangeGuard(isPublished);

  const guardedMoveShift = useCallback(
    (vars: { shiftId: string; targetEmployeeId?: string; targetDate?: string }) => {
      guard((acknowledge) =>
        moveShift({ ...vars, acknowledgePublishedChange: acknowledge }),
      );
    },
    [guard, moveShift],
  );
  ```
  - Replace the body of `handleAssign` (current lines 52-64) so it routes through the guard:
  ```tsx
  const handleAssign = useCallback(
    (input: {
      employeeId: string;
      date: string;
      shiftTypeCode: string;
      startTime: string;
      endTime: string;
      breakMinutes: number;
    }) => {
      guard((acknowledge) =>
        createManualShift({ ...input, acknowledgePublishedChange: acknowledge }),
      );
    },
    [guard, createManualShift],
  );
  ```
  - Pass `moveShift={guardedMoveShift}` to `<StaffGrid>` (current line 200) instead of `moveShift={moveShift}`. If StaffGrid's `moveShift` prop is typed as the raw mutation type, loosen it to `(vars: { shiftId: string; targetEmployeeId?: string; targetDate?: string }) => void` in `StaffGrid.tsx` — the wrapped callback satisfies that shape.
  - Render the dialog next to `<PublishConfirmDialog>` (after current line 223):
  ```tsx
  <PublishedChangeDialog
    open={publishedChangeDialogOpen}
    onConfirm={confirmPublishedChange}
    onCancel={cancelPublishedChange}
  />
  ```
  2. In `apps/web/src/app/[locale]/admin/planning/_hooks/useShiftMutations.ts`, map the server code in the three `onError` handlers — replace each `toast.error(t("moveError"), { description: _err?.message });` (and the create/delete equivalents) with the guarded version:
  ```ts
  if (_err?.message === "PUBLISHED_CHANGE_REQUIRES_ACK") {
    toast.error(t("publishedChangeRequired"));
  } else {
    toast.error(t("moveError"), { description: _err?.message });
  }
  ```
  (Use `err` instead of `_err` in the create/delete handlers to match their existing parameter names.)
  Run: `pnpm --filter @pawly/web exec tsc --noEmit 2>&1 | head -20`
  Expected: no errors, exit 0.
  Commit: `git add "apps/web/src/app/[locale]/admin/planning/_components/ScheduleViewWrapper.tsx" "apps/web/src/app/[locale]/admin/planning/_components/StaffGrid.tsx" "apps/web/src/app/[locale]/admin/planning/_hooks/useShiftMutations.ts" && git commit -m "feat(story-7-6): wire published-change guard into planning grid"`

- [x] **Task 13: Health Bar amended badge + i18n keys** [AC: 7, 8]
  1. In `apps/web/src/app/[locale]/admin/planning/_components/PlanningHealthBar.tsx`, locate the published badge (rendered when `isPublished`, shows `t("healthBar.publishedAt", { date })` or the plain published label). Next to it, when `publicationStatus?.amendmentCount` is a number greater than 0, render an additional muted span:
  ```tsx
  {isPublished && (publicationStatus?.amendmentCount ?? 0) > 0 && (
    <span className="text-xs text-muted-foreground">
      {t("healthBar.amended", {
        count: publicationStatus?.amendmentCount ?? 0,
        date: publicationStatus?.amendedAt
          ? new Date(publicationStatus.amendedAt).toLocaleDateString(locale)
          : "",
      })}
    </span>
  )}
  ```
  (The component already resolves `locale` via `useLocale()` since story 7-4 review fix M1 — reuse it. The `PublicationStatus` type comes from `publicationStatusResultSchema`, extended in Task 1, so `amendedAt`/`amendmentCount` type-check.)
  2. i18n — add to `apps/web/src/i18n/langs/fr.json`:
  - under `admin.planningRules.healthBar` (same namespace as the existing healthBar keys):
  ```json
  "amended": "{count, plural, one {Modifié # fois} other {Modifié # fois}} — dernière le {date}"
  ```
  - new namespace `admin.publishedChange`:
  ```json
  "publishedChange": {
    "dialogTitle": "Planning publié — confirmer la modification",
    "dialogDescription": "Ce planning a déjà été publié. Les employés concernés par ce changement seront notifiés par email et notification push.",
    "confirm": "Modifier et notifier",
    "cancel": "Annuler"
  }
  ```
  - under `admin.dragDrop`:
  ```json
  "publishedChangeRequired": "Ce planning est publié : la modification doit être confirmée via la boîte de dialogue."
  ```
  3. Matching EN keys in `apps/web/src/i18n/langs/en.json`:
  ```json
  "amended": "{count, plural, one {Amended # time} other {Amended # times}} — last on {date}"
  ```
  ```json
  "publishedChange": {
    "dialogTitle": "Published schedule — confirm change",
    "dialogDescription": "This schedule has already been published. Employees affected by this change will be notified by email and push notification.",
    "confirm": "Change and notify",
    "cancel": "Cancel"
  }
  ```
  ```json
  "publishedChangeRequired": "This schedule is published: the change must be confirmed through the dialog."
  ```
  Run: `pnpm --filter @pawly/web exec tsc --noEmit 2>&1 | head -20`
  Expected: no errors, exit 0.
  Commit: `git add "apps/web/src/app/[locale]/admin/planning/_components/PlanningHealthBar.tsx" apps/web/src/i18n/langs/fr.json apps/web/src/i18n/langs/en.json && git commit -m "feat(story-7-6): amended badge + published-change i18n"`

- [x] **Task 14: web tests** [AC: 5, 6, 7, 8]
  Create `apps/web/src/app/[locale]/admin/planning/__tests__/published-change.spec.tsx` (Vitest + RTL; reuse the mock setup style of `publish.spec.tsx` — next-intl is globally mocked in vitest.setup.ts, mock the AlertDialog primitives locally exactly as `publish.spec.tsx` does). Required tests:
  ```tsx
  // 1. usePublishedChangeGuard: on a DRAFT month, guard(run) fires run(false) immediately, dialog stays closed
  // 2. usePublishedChangeGuard: on a PUBLISHED month, guard(run) opens the dialog and does NOT fire run
  // 3. usePublishedChangeGuard: confirm() fires the stashed run with acknowledge=true and closes
  // 4. usePublishedChangeGuard: cancel() drops the stashed run (subsequent confirm() fires nothing)
  // 5. PublishedChangeDialog renders title/description/actions from admin.publishedChange keys
  // 6. PlanningHealthBar shows the amended badge when amendmentCount > 0 and hides it at 0
  ```
  Use `renderHook` from `@testing-library/react` for the hook tests (already used elsewhere in the suite; if not, `render` a probe component that exposes the hook's returns via callbacks).
  Run: `pnpm --filter @pawly/web test -- src/app --run 2>/dev/null || pnpm --filter @pawly/web test`
  Expected: `Test Files  46 passed` (45 existing + 1 new), all tests green, exit 0.
  Commit: `git add "apps/web/src/app/[locale]/admin/planning/__tests__/published-change.spec.tsx" && git commit -m "test(story-7-6): published-change guard web tests"`

- [x] **Task 15: quality gates + journey verification (lesson L2)** [AC: all]
  1. Full gates from repo root: `pnpm test` then `pnpm build`.
  Expected: turbo 8/8 tasks successful, API ≥ 845 tests, web ≥ 730, validators ≥ 769, build zero errors.
  2. Journey verification (L2 — unit tests do not replace the real flow). With `pnpm dev` running and a seeded clinic:
     - Publish the current month from the admin grid (Health Bar → Publish).
     - Drag one shift of the published month to another day → the PublishedChangeDialog MUST appear; confirm.
     - Verify: (a) toast success; (b) Health Bar badge shows "modifié"; (c) a `schedule-changed` run appears in the Trigger.dev dashboard (or, without TRIGGER_SECRET_KEY, the API log shows the direct Resend send); (d) the moved shift's slider on the employee dashboard is unconfirmed again; (e) `getPublicationStatus` returns `amendmentCount: 1` (visible via the badge).
     - Drag a shift on a DRAFT month → NO dialog (unchanged behaviour).
     Record the outcome of each check in the Dev Agent Record → Completion Notes.
  Commit (story bookkeeping only): `git add docs/stories/7-6-post-publication-change-management.md docs/state.yaml && git commit -m "docs(story-7-6): mark tasks complete + journey verification notes"`

## Dev Notes

### Architecture compliance (NON-NEGOTIABLE)

- Data flow: `Page (RSC) → Client Component → Hook → Zsa → Server Action → tRPC Client → NestJS Service → Prisma`. The guard decision (published vs draft) is CLIENT-side UX; the ConflictException guard is the SERVER-side source of truth — both are required (defense in depth).
- `clinicId` from `ctx.user.clinicId`, never from the payload. All three mutations stay behind `subscribedProcedure` + `adminOnly`.
- Error contract: the server throws the structured code `PUBLISHED_CHANGE_REQUIRES_ACK` (message = code, no English prose — pre-mortem R9); the web maps it to a translated toast. Never display the raw code.
- Notifications are fire-and-forget with logged errors (same policy as `publishPlan`'s batch notifications). They are NOT auth-critical, so the log-only trigger failure path is acceptable here (contrast with magic-link which falls back — PR #92).
- Push copy is hardcoded French, consistent with the existing `publishPlan` push (`Planning publié`) — accepted debt, tracked by pre-mortem R9's i18n story (10-6), not this one.

### Existing code at write time (Step-0 verbatim quotes)

`apps/api/src/modules/planning/planning-generation.service.ts:1493-1500` (current — moveShift update, no guard, no isConfirmed reset):
```ts
    const updated = await this.prisma.shift.update({
      where: { id: shiftId },
      data: {
        ...(target.targetEmployeeId && { employeeId: target.targetEmployeeId }),
        ...(target.targetDate && { date: new Date(`${target.targetDate}T00:00:00.000Z`) }),
        source: 'MANUAL',
      },
    });
```

`apps/api/src/modules/planning/planning-generation.service.ts:1588-1598` (current — deleteShift):
```ts
  async deleteShift(
    clinicId: string,
    shiftId: string,
  ): Promise<{ deleted: true }> {
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.clinicId !== clinicId) throw new ForbiddenException('Shift does not belong to this clinic');

    await this.prisma.shift.delete({ where: { id: shiftId } });
    return { deleted: true };
  }
```

`apps/api/src/modules/planning/planning-generation.service.ts:1987-2008` (current — getPublicationStatus returns 3 fields; this story adds amendedAt/amendmentCount).

`apps/api/src/trpc/routers/planning.router.ts:266-279` (current — moveShift procedure; the service call has 3 args and there is no `planning:pub` invalidation):
```ts
  moveShift: subscribedProcedure
    .input(moveShiftInputSchema)
    .mutation(async ({ input, ctx }) => {
      adminOnly(ctx.user.role);
      const result = await ctx.planningGenerationService.moveShift(
        ctx.user.clinicId,
        input.shiftId,
        { targetEmployeeId: input.targetEmployeeId, targetDate: input.targetDate },
      );
      await ctx.redis.invalidatePattern(`schedule:${ctx.user.clinicId}:*`);
      await ctx.redis.del(`dashboard:stats:${ctx.user.clinicId}`);
      return result;
    }),
```

`packages/validators/src/planning/shift-mutation.schema.ts:12-33` (current — moveShiftInputSchema has NO acknowledgePublishedChange field; `.superRefine` pattern must be preserved, see file for the full current content quoted in Task 1).

`apps/web/src/app/[locale]/admin/planning/_components/ScheduleViewWrapper.tsx:32-64` (current — `moveShift` passed raw to StaffGrid at line 200, `handleAssign` calls `createManualShift(input)` directly, `publicationStatus` already available from `usePublish` at line 35).

`apps/web/src/app/[locale]/admin/planning/_hooks/useShiftMutations.ts:44-51` (current — onError shows raw `_err?.message` in the toast description; Task 12 adds the code mapping).

`apps/api/src/modules/mail/mail-i18n.ts` — `subjects` interface currently ends at `passwordReset: string;` with `schedulePublication: (clinicName: string, month: string) => string;` present (anchor for Task 3).

`apps/api/src/trigger/tasks/send-email.ts` — `EmailType` union currently has 11 members ending `| 'absence-review'`; `renderEmail` switch has a `case 'schedule-publication'` block (anchor for Task 6).

`apps/api/prisma/schema/PlanningPeriodStatus.prisma` (current — quoted in full in Task 2 minus the two new fields).

`apps/web/src/app/[locale]/admin/planning/_components/PlanningHealthBar.tsx` — props include `publicationStatus?: PublicationStatus`; `const isPublished = publicationStatus?.status === 'PUBLISHED';` exists; `useLocale()` present since 7-4 M1.

### File decision map

- `packages/validators/src/planning/shift-mutation.schema.ts` — input contracts for the 3 mutations; imports `@pawly/zod`; exports schemas + types consumed by router and web actions.
- `packages/validators/src/planning/equity-alert.schema.ts` — publication-status shape; gains the 2 optional amendment fields.
- `apps/api/prisma/schema/PlanningPeriodStatus.prisma` — month-level publication state; gains amendment audit fields.
- `apps/api/src/modules/mail/mail-i18n.ts` — email copy FR/EN; gains scheduleChanged subject + content.
- `apps/api/src/modules/mail/templates/ScheduleChangedEmail.tsx` (NEW) — single responsibility: render the schedule-changed email; imports EmailLayout + mail-i18n; exported to MailService and the trigger task.
- `apps/api/src/modules/mail/mail.service.tsx` — send orchestration; gains `sendScheduleChangedEmail` (trigger-first, direct fallback).
- `apps/api/src/trigger/tasks/send-email.ts` — Trigger.dev renderer; gains the 12th type.
- `apps/api/src/modules/planning/planning-generation.service.ts` — planning domain logic; gains guard/amendment/notify helpers and their use in the 3 mutations + richer publication status.
- `apps/api/src/trpc/routers/planning.router.ts` — transport; passes the flag, invalidates `planning:pub` cache.
- `apps/web/.../_hooks/usePublishedChangeGuard.ts` (NEW) — single responsibility: stash-and-confirm interception state machine.
- `apps/web/.../_components/PublishedChangeDialog.tsx` (NEW) — single responsibility: the confirmation AlertDialog.
- `apps/web/.../_components/ScheduleViewWrapper.tsx` — orchestrator; wires guard between publicationStatus and the two mutation entry points (DnD move + hole assign).
- `apps/web/.../_hooks/useShiftMutations.ts` — mutation hooks; maps the server error code to a translated toast.
- `apps/web/.../_components/PlanningHealthBar.tsx` — status display; gains the amended badge.
- `apps/web/src/i18n/langs/{fr,en}.json` — UI copy.

### Key design decisions (locked with Alex, 2026-07-08)

1. **Acknowledged-change model** — the month stays PUBLISHED; no unpublish/republish cycle. Server guard `PUBLISHED_CHANGE_REQUIRES_ACK` is the safety net; the dialog is the UX.
2. **Always notify** — post-publication change notifications ignore `notifyOnPublish` (missing a change = missed shift).
3. **Immediate per-change notification** — no digest/batching in MVP; the dialog's friction is the rate limiter.
4. **Out of scope** — NO_SHOW variance reconciliation on moved shifts (story 8-4), unpublish workflow, printable schedule, push copy i18n (10-6).
5. **deleteShift has no UI call site today** (verified: only the hook + action reference it) — the dialog covers move + assign; the API guard covers delete for future UI.

### Employee-side staleness (why no PWA change)

`DashboardQueryProvider.tsx:14-16` sets `staleTime: 5min` / `gcTime: 24h` / `offlineFirst`. An employee who opens the app after the change gets fresh data within 5 minutes of cache age; the email + push (deep link `/dashboard/schedule`) close the "doesn't open the app" gap. No service-worker change needed.

### Testing standards

- Validators: Vitest `*.test.ts`; API: Jest `*.spec.ts`; Web: Vitest `*.spec.tsx` (next-intl globally mocked in vitest.setup.ts; AlertDialog mocked locally like `publish.spec.tsx`).
- Jest 30: use `--testPathPatterns` (plural — the singular flag was removed).
- Run all pnpm commands from the repo root. NEVER `cd` into apps/.

### Previous story intelligence (essentials)

- 7-1: `source: 'MANUAL'` must survive regeneration — the moveShift rewrite keeps it. Optimistic UI in `useShiftMutations` (`onMutate` snapshot → `onError` rollback → `onSettled` invalidate) is untouched by the guard (guard runs BEFORE mutate is called).
- 7-2: `publishPlan` / `PlanningPeriodStatus` / structured `messageKey` violations. `PublishConfirmDialog` is the AlertDialog blueprint.
- 7-4: HealthBar `publicationStatus` prop + `useLocale()`; motion mock pattern for tests.
- 7-5: prefix-only React Query invalidation (`["planning"]`); atomic CAS pattern for reviews (not needed here — `updateMany` with `increment` is already atomic).
- Lessons: L1 (Zsa tuple vs React Query — the guard wraps `mutate`, no `mutateAsync` destructuring), L2 (journey verification is Task 15.2, mandatory), L3 (review must check ACs against FR10/NFR3), L4 (consult Context7 for Trigger.dev task payload conventions before Task 6 if unsure), L5 (do not touch `tsc -p tsconfig.types.json` in the api build).

### References

- [Source: docs/pre-mortem.md#R1 — evidence file:line for every gap this story closes]
- [Source: docs/epics.md#Story 7.6]
- [Source: docs/prd.md#FR10, #NFR3]
- [Source: docs/epics-context/epic-7-context.md]
- [Source: apps/api/src/modules/planning/planning-generation.service.ts:1444-1598, 1860-2008]
- [Source: apps/web/src/app/[locale]/admin/planning/_components/ScheduleViewWrapper.tsx]
- [Source: apps/api/src/modules/mail/templates/SchedulePublicationEmail.tsx — template blueprint]

## File List

**To create:**
- `apps/api/src/modules/mail/templates/ScheduleChangedEmail.tsx`
- `apps/web/src/app/[locale]/admin/planning/_hooks/usePublishedChangeGuard.ts`
- `apps/web/src/app/[locale]/admin/planning/_components/PublishedChangeDialog.tsx`
- `apps/web/src/app/[locale]/admin/planning/__tests__/published-change.spec.tsx`

**To modify:**
- `packages/validators/src/planning/shift-mutation.schema.ts`
- `packages/validators/src/planning/shift-mutation.schema.test.ts`
- `packages/validators/src/planning/equity-alert.schema.ts`
- `apps/api/prisma/schema/PlanningPeriodStatus.prisma`
- `apps/api/src/modules/mail/mail-i18n.ts`
- `apps/api/src/modules/mail/mail.service.tsx`
- `apps/api/src/trigger/tasks/send-email.ts`
- `apps/api/src/modules/planning/planning-generation.service.ts`
- `apps/api/src/modules/planning/planning-generation.service.spec.ts`
- `apps/api/src/trpc/routers/planning.router.ts`
- `apps/api/src/trpc/routers/planning.router.spec.ts`
- `apps/web/src/app/[locale]/admin/planning/_components/ScheduleViewWrapper.tsx`
- `apps/web/src/app/[locale]/admin/planning/_components/StaffGrid.tsx` (prop type only, if needed)
- `apps/web/src/app/[locale]/admin/planning/_components/PlanningHealthBar.tsx`
- `apps/web/src/app/[locale]/admin/planning/_hooks/useShiftMutations.ts`
- `apps/web/src/i18n/langs/fr.json`
- `apps/web/src/i18n/langs/en.json`

## Dev Agent Record

- **Model:** claude-opus-4-8[1m]
- **Started:** 2026-07-08
- **Completed:** 2026-07-08 (code + automated gates; journey verification pending manual pass)

### Summary

All 15 tasks implemented via TDD (RED→GREEN→REFACTOR→GATE), one commit per task.
Defense in depth: server guard `PUBLISHED_CHANGE_REQUIRES_ACK` (source of truth) +
client confirmation dialog (UX). 12th email type `schedule-changed`, amendment
tracking (`amendedAt`/`amendmentCount`), `isConfirmed` reset on move, Health Bar
amended badge, FR/EN i18n, pub-cache invalidation.

Backend (Tasks 1-10): validator flag + optional amendment fields, Prisma additive
migration (db:push clean, no data loss), mail i18n + `ScheduleChangedEmail` template +
`sendScheduleChangedEmail` + trigger type, three service helpers
(`assertPublishedChangeAcknowledged` / `recordAmendment` / `notifyScheduleChange`),
guards on `moveShift`/`createManualShift`/`deleteShift`, richer `getPublicationStatus`,
router passthrough + `planning:pub:*` invalidation.

Frontend (Tasks 11-14): `usePublishedChangeGuard` stash-and-confirm state machine,
`PublishedChangeDialog`, wired into `ScheduleViewWrapper` (DnD move + hole assign),
error-code→translated-toast mapping in `useShiftMutations`, amended badge in
`PlanningHealthBar`, FR/EN keys.

### Files changed

**Created (4):** `ScheduleChangedEmail.tsx`, `usePublishedChangeGuard.ts`,
`PublishedChangeDialog.tsx`, `published-change.spec.tsx`.
**Modified (14):** `shift-mutation.schema.ts` (+ `.test.ts`), `equity-alert.schema.ts`,
`PlanningPeriodStatus.prisma`, `mail-i18n.ts`, `mail.service.tsx`, `send-email.ts`,
`planning-generation.service.ts` (+ `.spec.ts`), `planning.router.ts` (+ `.spec.ts`),
`ScheduleViewWrapper.tsx`, `useShiftMutations.ts`, `PlanningHealthBar.tsx`,
`fr.json`, `en.json`.

### Deviations

1. **Single-session (Lead) implementation instead of fullstack dev team.** The story is
   fully pre-specified verbatim and tasks are strictly serialised by typecheck
   dependencies (router/web depend on validators + service), so team parallelism offered
   no benefit and no divergence risk — the story file IS the contract.
2. **`publicationStatusResultSchema` keeps `PLANNING_PERIOD_STATUSES` const** (not the
   inline `z.enum(["DRAFT","PUBLISHED"])` shown in Task 1) — matches existing code, per
   the task's own "match what is already there" note.
3. **`PublicationStatus` type in `PlanningHealthBar` is a LOCAL type**, not derived from
   `publicationStatusResultSchema` as Task 13 assumed. Extended the local type with the
   two optional amendment fields.
4. **Existing tests updated** for the widened contracts: service `deleteShift` mock gained
   a `date`, `getPublicationStatus` assertions gained the two new fields, router
   `moveShift`/`deleteShift` assertions gained the options arg. These are contract
   widenings, not behaviour changes.
5. **Web TDD RED discipline** honoured via the break-to-verify technique (step-06):
   implementation pre-existed (story batches web tests to Task 14), so `confirm()` was
   temporarily broken to witness RED, then restored → GREEN.

### Test output

- Validators (Vitest): **769 passed** (30→32 on shift-mutation schema).
- API (Jest): **848 passed** (service +8 incl. 7 story-7.6 cases; router +2).
- Web (Vitest): **733 passed** (new `published-change.spec.tsx`: 9 passed).
- **Total: 2350 passed.** `turbo run test` 8/8 successful.
- `turbo run build`: **5/5 successful, exit 0, 18s**, zero errors; `trpc-types.d.ts`
  regenerated at `dist/trpc-types.d.ts`.
- NB: the first `pnpm build` stalled at 0% CPU — root cause was a concurrent `pnpm dev`
  server contending for `.next`; a clean build with dev stopped completed in 18s.

### Journey verification (Task 15.2 — L2, MANUAL, PENDING)

Requires `pnpm dev` + a seeded clinic. Checklist to run:
1. Publish the current month (Health Bar → Publish).
2. Drag a shift of the published month to another day → **PublishedChangeDialog appears**;
   confirm.
3. Verify: (a) success toast; (b) Health Bar badge shows "modifié/amended"; (c) a
   `schedule-changed` run in the Trigger.dev dashboard (or API log for the direct Resend
   send); (d) the moved shift's slider on the employee dashboard is unconfirmed again;
   (e) `getPublicationStatus` returns `amendmentCount: 1` (via the badge).
4. Drag a shift on a DRAFT month → **NO dialog** (unchanged behaviour).
