/**
 * Month generation, publication and the post-publication guard, end to end.
 *
 * Story 6-2 (AC1 template expansion, AC4 unavailabilities and closed days
 * block, AC5 the assignments/holes/violations shape, AC7 regeneration
 * replaces, AC9 clinic scoping), Story 7-6 (AC1 the guard on single-shift
 * mutations, AC2 isConfirmed reset, AC3 change notifications, AC4 amendment
 * bookkeeping), Story 11-1 (AC1/AC2 the guard on bulk operations, AC3
 * confirmed and variance-carrying shifts survive a purge, AC4 amendment +
 * notification), Story 11-4 (AC2 the direct-send fallback actually sends) and
 * Story 11-5 (AC2/AC3 a repeated generation yields exactly one month's worth of
 * shifts, never a doubled month).
 *
 * The clinic is Professional so nothing here is refused by the tier gate, and
 * the month is far enough in the future that no other suite shares it.
 */
import { createTestHarness, login, type TestHarness } from './harness';
import {
  firstWeekdayOfMonth,
  makeClinic,
  makeClinicPlanningSetup,
  makeEmployee,
  settle,
  trpcData,
  trpcError,
  uniqueEmail,
  waitForMail,
  type ClinicFixture,
} from './helpers';

const MONTH = '2028-03';
const MONDAY = firstWeekdayOfMonth(MONTH, 1);
const TUESDAY = firstWeekdayOfMonth(MONTH, 2);

interface GenerationResult {
  assignments: Array<{
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    shiftTypeCode: string;
    employeeId: string;
    employeeName: string;
  }>;
  holes: Array<{ date: string; shiftTypeCode: string; reason: string }>;
  violations: { hard: unknown[]; soft: unknown[] };
  stats: {
    totalSlots: number;
    filledSlots: number;
    holeCount: number;
    engine: string;
  };
}

describe('Planning generation and publication (integration)', () => {
  let harness: TestHarness;
  let clinic: ClinicFixture;
  let token: string;
  let templateId: string;
  let employeeA: { id: string; email: string | null; userId: string | null };
  let employeeB: { id: string; email: string | null; userId: string | null };

  const generate = (input: Record<string, unknown> = {}) =>
    harness.trpcMutation(
      'planning.generatePlan',
      { month: MONTH, templateId, ...input },
      token,
    );

  const publish = () =>
    harness.trpcMutation('planning.publishPlan', { month: MONTH }, token);

  const readStatus = async () =>
    trpcData<{
      status: string;
      publishedAt: string | null;
      amendedAt: string | null;
      amendmentCount: number;
    }>(
      await harness.trpcQuery(
        'planning.getPublicationStatus',
        { month: MONTH },
        token,
      ),
    );

  const countShifts = () =>
    harness.prisma.shift.count({ where: { clinicId: clinic.clinicId } });

  /** Wipes every trace of a previous test's month so each one starts clean. */
  async function resetMonth(): Promise<void> {
    await harness.prisma.shift.deleteMany({
      where: { clinicId: clinic.clinicId },
    });
    await harness.prisma.planningPeriodStatus.deleteMany({
      where: { clinicId: clinic.clinicId },
    });
    await harness.prisma.unavailability.deleteMany({
      where: { clinicId: clinic.clinicId },
    });
    await harness.prisma.clinicClosedDay.deleteMany({
      where: { clinicId: clinic.clinicId },
    });
    harness.mailbox.reset();
  }

  beforeAll(async () => {
    harness = await createTestHarness();
    clinic = await makeClinic(harness, { tier: 'professional' });
    token = await login(harness, clinic.adminEmail, clinic.adminPassword);
    ({ templateId } = await makeClinicPlanningSetup(harness, clinic.clinicId));

    employeeA = await makeEmployee(harness, {
      clinicId: clinic.clinicId,
      firstName: 'Alice',
      lastName: 'Aardvark',
      email: uniqueEmail('it-plan-a'),
      withUser: true,
    });
    employeeB = await makeEmployee(harness, {
      clinicId: clinic.clinicId,
      firstName: 'Bob',
      lastName: 'Badger',
      email: uniqueEmail('it-plan-b'),
      withUser: true,
    });
  });

  afterAll(async () => {
    await clinic.cleanup();
    await harness.close();
  });

  beforeEach(resetMonth);

  // ── Story 6-2 — generation ─────────────────────────────────────────────

  describe('generation', () => {
    it('expands the template across the month and persists the shifts', async () => {
      const result = trpcData<GenerationResult>(await generate());

      expect(result.stats.totalSlots).toBeGreaterThan(0);
      expect(result.stats.filledSlots).toBe(result.assignments.length);
      expect(result.stats.holeCount).toBe(result.holes.length);
      expect(result.stats.engine).toBe('greedy');

      const persisted = await harness.prisma.shift.findMany({
        where: { clinicId: clinic.clinicId },
      });
      expect(persisted).toHaveLength(result.assignments.length);
      expect(persisted.every((s) => s.clinicId === clinic.clinicId)).toBe(true);
      expect(persisted.every((s) => s.source === 'GENERATED')).toBe(true);
      expect(persisted.every((s) => s.planningTemplateId === templateId)).toBe(
        true,
      );
      // The template only covers Monday to Friday.
      expect(
        persisted.every((s) => {
          const day = s.date.getUTCDay();
          return day >= 1 && day <= 5;
        }),
      ).toBe(true);
      // Everything lands inside the requested month.
      expect(
        persisted.every((s) => s.date.toISOString().slice(0, 7) === MONTH),
      ).toBe(true);
    });

    it('returns assignments, holes and violations in one payload', async () => {
      const result = trpcData<GenerationResult>(await generate());

      expect(Array.isArray(result.assignments)).toBe(true);
      expect(Array.isArray(result.holes)).toBe(true);
      expect(Array.isArray(result.violations.hard)).toBe(true);
      expect(Array.isArray(result.violations.soft)).toBe(true);
      for (const assignment of result.assignments) {
        expect(assignment).toMatchObject({
          id: expect.any(String),
          shiftTypeCode: 'MOR',
          startTime: '08:00',
          endTime: '13:00',
          employeeId: expect.any(String),
          employeeName: expect.any(String),
        });
      }
    });

    // AC4 — declared unavailabilities and closed days block assignment.
    it('never assigns an employee on a declared unavailability or a closed day', async () => {
      await harness.prisma.unavailability.createMany({
        data: [employeeA.id, employeeB.id].map((employeeId) => ({
          clinicId: clinic.clinicId,
          employeeId,
          type: 'VACATION' as const,
          startDate: new Date(`${MONDAY}T00:00:00.000Z`),
          endDate: new Date(`${MONDAY}T00:00:00.000Z`),
          daysOfWeek: [],
        })),
      });
      await harness.prisma.clinicClosedDay.create({
        data: {
          clinicId: clinic.clinicId,
          date: new Date(`${TUESDAY}T00:00:00.000Z`),
          reason: 'Integration test closure',
        },
      });

      const result = trpcData<GenerationResult>(await generate());

      // Nobody works the day everybody is away…
      expect(result.assignments.filter((a) => a.date === MONDAY)).toHaveLength(
        0,
      );
      // …and a closed day is not even a slot, so it is neither filled nor a hole.
      expect(result.assignments.filter((a) => a.date === TUESDAY)).toHaveLength(
        0,
      );
      expect(result.holes.filter((h) => h.date === TUESDAY)).toHaveLength(0);
      // The unavailable day IS a slot nobody could take — that is a hole.
      expect(
        result.holes.filter((h) => h.date === MONDAY).length,
      ).toBeGreaterThan(0);

      const persisted = await harness.prisma.shift.findMany({
        where: { clinicId: clinic.clinicId },
      });
      expect(
        persisted.some((s) => s.date.toISOString().slice(0, 10) === MONDAY),
      ).toBe(false);
      expect(
        persisted.some((s) => s.date.toISOString().slice(0, 10) === TUESDAY),
      ).toBe(false);
    });

    // Story 6-2 AC7 + Story 11-5 AC2/AC3 — regenerating replaces, never doubles.
    it('is idempotent: regenerating a month yields one month of shifts, not two', async () => {
      const first = trpcData<GenerationResult>(await generate());
      const afterFirst = await countShifts();
      expect(afterFirst).toBe(first.assignments.length);

      const second = trpcData<GenerationResult>(await generate());
      const afterSecond = await countShifts();

      expect(afterSecond).toBe(afterFirst);
      expect(second.assignments.length).toBe(first.assignments.length);
      expect(second.stats.filledSlots).toBe(first.stats.filledSlots);

      // Same (employee, date, startTime) multiset — the plan is stable, and the
      // unique index would have rejected a duplicate anyway.
      const key = (a: {
        employeeId: string;
        date: string;
        startTime: string;
      }) => `${a.employeeId}|${a.date}|${a.startTime}`;
      expect(second.assignments.map(key).sort()).toEqual(
        first.assignments.map(key).sort(),
      );
    });

    it('rejects an unknown template and a malformed month', async () => {
      const unknownTemplate = await harness.trpcMutation(
        'planning.generatePlan',
        { month: MONTH, templateId: '00000000-0000-4000-8000-000000000000' },
        token,
      );
      expect(trpcError(unknownTemplate).message).toMatch(/not found/i);

      const badMonth = await harness.trpcMutation(
        'planning.generatePlan',
        { month: '2028-13', templateId },
        token,
      );
      expect(trpcError(badMonth).code).toBe('BAD_REQUEST');
      expect(await countShifts()).toBe(0);
    });

    it('refuses to generate while an apprentice has not declared their school days', async () => {
      const apprentice = await makeEmployee(harness, {
        clinicId: clinic.clinicId,
        firstName: 'Ann',
        lastName: 'Trainee',
        jobType: 'APPRENTICE',
        email: null,
      });
      await harness.prisma.employee.update({
        where: { id: apprentice.id },
        data: { contractType: 'APPRENTICESHIP' },
      });

      try {
        const blocked = await generate();
        expect(trpcError(blocked).message).toMatch(
          /apprentice school day declarations missing/i,
        );
        expect(await countShifts()).toBe(0);

        // Declaring "no school this month" unblocks it.
        trpcData(
          await harness.trpcMutation(
            'planning.upsertNoSchool',
            { employeeId: apprentice.id, month: MONTH },
            token,
          ),
        );
        const result = trpcData<GenerationResult>(await generate());
        expect(result.assignments.length).toBeGreaterThan(0);
      } finally {
        await harness.prisma.shift.deleteMany({
          where: { employeeId: apprentice.id },
        });
        await harness.prisma.apprenticeMonthDeclaration.deleteMany({
          where: { employeeId: apprentice.id },
        });
        await harness.prisma.employee.delete({ where: { id: apprentice.id } });
      }
    });
  });

  // ── Publication (Story 7-6, 11-4) ──────────────────────────────────────

  describe('publication', () => {
    beforeEach(async () => {
      trpcData<GenerationResult>(await generate());
      harness.mailbox.reset();
    });

    it('publishes the month and mails everyone who has shifts', async () => {
      const result = trpcData<{ publishedAt: string; totalWithShifts: number }>(
        await publish(),
      );

      expect(result.publishedAt).toEqual(expect.any(String));
      expect(result.totalWithShifts).toBeGreaterThan(0);

      const status = await readStatus();
      expect(status.status).toBe('PUBLISHED');
      expect(status.publishedAt).toBe(result.publishedAt);
      expect(status.amendmentCount).toBe(0);

      // Story 11-4 AC2 — without Trigger.dev configured the direct batch send
      // runs, and the batch really carries the employees who have shifts.
      const mail = await waitForMail(
        harness,
        (m) => m.type === 'sendBatchSchedulePublicationEmails',
      );
      const [recipients, month, clinicName] = mail.args as [
        Array<{ to: string; shiftCount: number }>,
        string,
        string,
      ];
      expect(month).toBe(MONTH);
      expect(clinicName).toBe(clinic.clinicName);
      expect(recipients.map((r) => r.to).sort()).toEqual(
        [employeeA.email!, employeeB.email!].sort(),
      );
      expect(recipients.every((r) => r.shiftCount > 0)).toBe(true);
    });

    it('skips employees who opted out of publication mail', async () => {
      await harness.prisma.employee.update({
        where: { id: employeeB.id },
        data: { notifyOnPublish: false },
      });

      try {
        const result = trpcData<{ totalWithShifts: number }>(await publish());
        // The opted-out employee still counts as "has shifts"…
        expect(result.totalWithShifts).toBe(2);

        const mail = await waitForMail(
          harness,
          (m) => m.type === 'sendBatchSchedulePublicationEmails',
        );
        const [recipients] = mail.args as [Array<{ to: string }>];
        // …but is not mailed.
        expect(recipients.map((r) => r.to)).toEqual([employeeA.email!]);
      } finally {
        await harness.prisma.employee.update({
          where: { id: employeeB.id },
          data: { notifyOnPublish: true },
        });
      }
    });

    it('is a no-op when re-published with nothing changed', async () => {
      const first = trpcData<{ publishedAt: string }>(await publish());
      harness.mailbox.reset();

      const second = trpcData<{ publishedAt: string }>(await publish());

      expect(second.publishedAt).toBe(first.publishedAt);
      await settle();
      expect(
        harness.mailbox
          .read()
          .filter((m) => m.type === 'sendBatchSchedulePublicationEmails'),
      ).toHaveLength(0);
    });

    it('reports the publication preview before anything is sent', async () => {
      const preview = trpcData<{
        employees: Array<{
          id: string;
          shiftCount: number;
          notifyOnPublish: boolean;
        }>;
        emailCount: number;
        disabledCount: number;
        totalWithShifts: number;
      }>(
        await harness.trpcQuery(
          'planning.getPublishPreview',
          { month: MONTH },
          token,
        ),
      );

      expect(preview.totalWithShifts).toBe(2);
      expect(preview.emailCount).toBe(2);
      expect(preview.disabledCount).toBe(0);
      expect(preview.employees.every((e) => e.shiftCount > 0)).toBe(true);

      await settle();
      expect(harness.mailbox.read()).toHaveLength(0);
    });
  });

  // ── The published-change guard (Stories 7-6, 11-1) ─────────────────────

  describe('published-change guard', () => {
    let shiftId: string;

    beforeEach(async () => {
      trpcData<GenerationResult>(await generate());
      trpcData(await publish());
      const shift = await harness.prisma.shift.findFirstOrThrow({
        where: { clinicId: clinic.clinicId },
        orderBy: { date: 'asc' },
      });
      shiftId = shift.id;
      harness.mailbox.reset();
    });

    // Story 7-6 AC1.
    it.each([
      [
        'moveShift',
        'planning.moveShift',
        () => ({ shiftId, targetEmployeeId: employeeB.id }),
      ],
      ['deleteShift', 'planning.deleteShift', () => ({ shiftId })],
      [
        'createManualShift',
        'planning.createManualShift',
        () => ({
          employeeId: employeeA.id,
          date: MONDAY,
          shiftTypeCode: 'MOR',
          startTime: '14:00',
          endTime: '18:00',
        }),
      ],
    ])(
      '%s is refused without an acknowledgement',
      async (_label, path, input) => {
        const before = await countShifts();

        const error = trpcError(
          await harness.trpcMutation(path, input(), token),
        );
          // The planning router has no service-exception mapper, so the
        // ConflictException surfaces as INTERNAL_SERVER_ERROR with its message
        // intact — which is what the web layer maps to a translated toast.
        expect(error.message).toBe('PUBLISHED_CHANGE_REQUIRES_ACK');

        expect(await countShifts()).toBe(before);
        const status = await readStatus();
        expect(status.amendmentCount).toBe(0);
        expect(status.amendedAt).toBeNull();
      },
    );

    // Story 11-1 AC1.
    it('generatePlan is refused without an acknowledgement, before any write', async () => {
      const before = await harness.prisma.shift.findMany({
        where: { clinicId: clinic.clinicId },
        select: { id: true },
      });

      const error = trpcError(await generate());
      expect(error.message).toBe('PUBLISHED_CHANGE_REQUIRES_ACK');

      const after = await harness.prisma.shift.findMany({
        where: { clinicId: clinic.clinicId },
        select: { id: true },
      });
      // Same rows, not merely the same count: nothing was deleted and recreated.
      expect(after.map((s) => s.id).sort()).toEqual(
        before.map((s) => s.id).sort(),
      );
    });

    // Story 11-1 AC2.
    it('deleteGeneratedShifts is refused without an acknowledgement', async () => {
      const before = await countShifts();

      const error = trpcError(
        await harness.trpcMutation(
          'planning.deleteGeneratedShifts',
          { month: MONTH },
          token,
        ),
      );
      expect(error.message).toBe('PUBLISHED_CHANGE_REQUIRES_ACK');
      expect(await countShifts()).toBe(before);
    });

    // Story 7-6 AC2/AC3/AC4.
    it('an acknowledged move resets confirmation, amends the month and notifies', async () => {
      await harness.prisma.shift.update({
        where: { id: shiftId },
        data: { isConfirmed: true },
      });
      const original = await harness.prisma.shift.findUniqueOrThrow({
        where: { id: shiftId },
      });
      const target =
        original.employeeId === employeeA.id ? employeeB : employeeA;

      trpcData(
        await harness.trpcMutation(
          'planning.moveShift',
          {
            shiftId,
            targetEmployeeId: target.id,
            acknowledgePublishedChange: true,
          },
          token,
        ),
      );

      const moved = await harness.prisma.shift.findUniqueOrThrow({
        where: { id: shiftId },
      });
      expect(moved.employeeId).toBe(target.id);
      expect(moved.isConfirmed).toBe(false);

      const status = await readStatus();
      expect(status.amendmentCount).toBe(1);
      expect(status.amendedAt).not.toBeNull();

      // Both sides of the move hear about it, opt-out or not.
      await waitForMail(
        harness,
        (m) => m.type === 'sendScheduleChangedEmail' && m.to === target.email,
      );
      await waitForMail(
        harness,
        (m) =>
          m.type === 'sendScheduleChangedEmail' &&
          m.to ===
            (target.id === employeeA.id ? employeeB.email : employeeA.email),
      );
    });

    // Story 11-1 AC3 — a purge preserves confirmed shifts and variance history.
    it('an acknowledged purge spares confirmed shifts and shifts with variance history', async () => {
      const shifts = await harness.prisma.shift.findMany({
        where: { clinicId: clinic.clinicId },
        orderBy: { date: 'asc' },
        take: 3,
      });
      const [confirmed, withVariance, ordinary] = shifts;

      await harness.prisma.shift.update({
        where: { id: confirmed.id },
        data: { isConfirmed: true },
      });
      await harness.prisma.varianceEvent.create({
        data: {
          clinicId: clinic.clinicId,
          shiftId: withVariance.id,
          type: 'CLOCK_IN_DEVIATION',
          plannedTime: withVariance.date,
          actualTime: new Date(withVariance.date.getTime() + 30 * 60_000),
          deltaMinutes: 30,
          status: 'PENDING',
        },
      });

      const result = trpcData<{ deletedCount: number }>(
        await harness.trpcMutation(
          'planning.deleteGeneratedShifts',
          { month: MONTH, acknowledgePublishedChange: true },
          token,
        ),
      );

      expect(result.deletedCount).toBeGreaterThan(0);
      const survivors = await harness.prisma.shift.findMany({
        where: { clinicId: clinic.clinicId },
        select: { id: true },
      });
      const survivorIds = survivors.map((s) => s.id);
      expect(survivorIds).toContain(confirmed.id);
      expect(survivorIds).toContain(withVariance.id);
      expect(survivorIds).not.toContain(ordinary.id);
      // The no-show / clock-in history is exactly what the exclusion protects.
      expect(
        await harness.prisma.varianceEvent.count({
          where: { shiftId: withVariance.id },
        }),
      ).toBe(1);

      // Story 11-1 AC4 — the purge is an amendment and the cleared employees hear about it.
      const status = await readStatus();
      expect(status.amendmentCount).toBe(1);
      await waitForMail(harness, (m) => m.type === 'sendScheduleChangedEmail');
    });

    // Story 11-1 AC4 — acknowledged regeneration amends and notifies.
    it('an acknowledged regeneration amends the month and notifies the assignees', async () => {
      const result = trpcData<GenerationResult>(
        await generate({ acknowledgePublishedChange: true }),
      );
      expect(result.assignments.length).toBeGreaterThan(0);

      const status = await readStatus();
      expect(status.amendmentCount).toBe(1);
      expect(status.amendedAt).not.toBeNull();

      const mail = await waitForMail(
        harness,
        (m) => m.type === 'sendScheduleChangedEmail',
      );
      expect([employeeA.email, employeeB.email]).toContain(mail.to);
    });

    it('leaves a DRAFT month completely unguarded', async () => {
      await harness.prisma.planningPeriodStatus.update({
        where: { clinicId_month: { clinicId: clinic.clinicId, month: MONTH } },
        data: { status: 'DRAFT' },
      });

      // No acknowledgement, no dialog, no notification.
      trpcData(
        await harness.trpcMutation('planning.deleteShift', { shiftId }, token),
      );
      expect(
        await harness.prisma.shift.findUnique({ where: { id: shiftId } }),
      ).toBeNull();

      const status = await readStatus();
      expect(status.amendmentCount).toBe(0);
      await settle();
      expect(
        harness.mailbox
          .read()
          .filter((m) => m.type === 'sendScheduleChangedEmail'),
      ).toHaveLength(0);
    });

    it('counts each amendment separately', async () => {
      trpcData(
        await harness.trpcMutation(
          'planning.deleteShift',
          { shiftId, acknowledgePublishedChange: true },
          token,
        ),
      );
      const other = await harness.prisma.shift.findFirstOrThrow({
        where: { clinicId: clinic.clinicId },
      });
      trpcData(
        await harness.trpcMutation(
          'planning.deleteShift',
          { shiftId: other.id, acknowledgePublishedChange: true },
          token,
        ),
      );

      expect((await readStatus()).amendmentCount).toBe(2);
    });
  });

  // ── Scoping (Story 6-2 AC9) ────────────────────────────────────────────

  it('scopes listShiftsForMonth and getScheduleView to the calling clinic', async () => {
    trpcData<GenerationResult>(await generate());

    const listed = trpcData<Array<{ id: string; employeeId: string }>>(
      await harness.trpcQuery(
        'planning.listShiftsForMonth',
        { month: MONTH },
        token,
      ),
    );
    const persisted = await harness.prisma.shift.findMany({
      where: { clinicId: clinic.clinicId },
      select: { id: true },
    });
    expect(listed.map((s) => s.id).sort()).toEqual(
      persisted.map((s) => s.id).sort(),
    );

    const view = trpcData<{
      month: string;
      employees: Array<{ id: string }>;
      shifts: Array<{ id: string }>;
    }>(
      await harness.trpcQuery(
        'planning.getScheduleView',
        { month: MONTH },
        token,
      ),
    );
    expect(view.month).toBe(MONTH);
    expect(view.employees.map((e) => e.id).sort()).toEqual(
      [employeeA.id, employeeB.id].sort(),
    );
    expect(view.shifts.length).toBe(persisted.length);
  });

  it('refuses generation and publication to a non-admin caller', async () => {
    const { JwtService } = await import('@nestjs/jwt');
    const employeeToken = harness.app.get(JwtService).sign({
      sub: employeeA.userId!,
      email: employeeA.email!,
      role: 'EMPLOYEE',
      clinicId: clinic.clinicId,
    });

    expect(
      trpcError(
        await harness.trpcMutation(
          'planning.generatePlan',
          { month: MONTH, templateId },
          employeeToken,
        ),
      ).code,
    ).toBe('FORBIDDEN');
    expect(
      trpcError(
        await harness.trpcMutation(
          'planning.publishPlan',
          { month: MONTH },
          employeeToken,
        ),
      ).code,
    ).toBe('FORBIDDEN');
    expect(await countShifts()).toBe(0);
  });
});
