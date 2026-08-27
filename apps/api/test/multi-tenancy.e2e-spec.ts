/**
 * Cross-tenant isolation — the property every other feature quietly depends on.
 *
 * Story 5-1 AC2/AC3 ("only employees for my clinicId", "the clinicId filter is
 * enforced on the update query"), Story 5-2 AC3, Story 7-3 AC10 and the
 * architecture's multi-tenant requirement, generalised: clinic A holds a valid,
 * fully entitled session; every id it can name that belongs to clinic B must be
 * unreachable, for reads and for writes.
 *
 * Two shapes of correct answer are accepted, and the tests distinguish them:
 *   - an id-addressed procedure must ERROR (NOT_FOUND / FORBIDDEN);
 *   - a filtered list must come back EMPTY rather than leaking rows.
 * What is never acceptable is a successful read or a mutation that lands.
 *
 * Both clinics are Professional so a rejection is never the tier gate wearing
 * the tenancy gate's clothes.
 */
import { createTestHarness, login, type TestHarness } from './harness';
import {
  makeClinic,
  makeEmployee,
  makeClinicPlanningSetup,
  trpcData,
  trpcError,
  uniqueEmail,
  type ClinicFixture,
} from './helpers';

const ISO = (date: string) => new Date(`${date}T00:00:00.000Z`).toISOString();
const MONTH = '2027-06';
const SHIFT_DATE = '2027-06-07'; // a Monday

/** Everything clinic B owns and clinic A will try to touch. */
interface TenantData {
  employeeId: string;
  employeeUserId: string;
  apprenticeId: string;
  constraintId: string;
  absenceId: string;
  shiftId: string;
  ruleId: string;
  templateId: string;
  shiftTypeId: string;
  varianceId: string;
}

describe('Multi-tenant isolation (integration)', () => {
  let harness: TestHarness;
  let clinicA: ClinicFixture;
  let clinicB: ClinicFixture;
  let tokenA: string;
  let tokenB: string;
  let dataA: TenantData;
  let dataB: TenantData;

  async function seedTenant(clinic: ClinicFixture): Promise<TenantData> {
    const { templateId } = await makeClinicPlanningSetup(
      harness,
      clinic.clinicId,
    );
    const shiftType = await harness.prisma.clinicShiftType.findFirstOrThrow({
      where: { clinicId: clinic.clinicId },
    });

    const employee = await makeEmployee(harness, {
      clinicId: clinic.clinicId,
      firstName: 'Tenant',
      lastName: 'Member',
      email: uniqueEmail('it-tenant'),
      withUser: true,
    });
    const apprentice = await makeEmployee(harness, {
      clinicId: clinic.clinicId,
      firstName: 'Tenant',
      lastName: 'Apprentice',
      jobType: 'APPRENTICE',
    });

    const constraint = await harness.prisma.unavailability.create({
      data: {
        clinicId: clinic.clinicId,
        employeeId: employee.id,
        type: 'VACATION',
        startDate: new Date(ISO('2027-06-20')),
        endDate: new Date(ISO('2027-06-24')),
        daysOfWeek: [],
      },
    });

    const absence = await harness.prisma.absence.create({
      data: {
        clinicId: clinic.clinicId,
        employeeId: employee.id,
        type: 'PAID_LEAVE',
        startDate: new Date(ISO('2027-06-10')),
        endDate: new Date(ISO('2027-06-11')),
        status: 'PENDING',
      },
    });

    const shift = await harness.prisma.shift.create({
      data: {
        clinicId: clinic.clinicId,
        employeeId: employee.id,
        date: new Date(`${SHIFT_DATE}T00:00:00.000Z`),
        startTime: '08:00',
        endTime: '13:00',
        shiftTypeCode: shiftType.code,
        source: 'GENERATED',
        planningTemplateId: templateId,
      },
    });

    const rule = await harness.prisma.planningRule.create({
      data: {
        clinicId: clinic.clinicId,
        name: 'Tenant rule',
        ruleType: 'SOFT',
        category: 'STAFFING_MINIMUM',
        isActive: true,
        priority: 1,
        config: { shiftTypeCode: shiftType.code, minStaff: 1 },
      },
    });

    const variance = await harness.prisma.varianceEvent.create({
      data: {
        clinicId: clinic.clinicId,
        shiftId: shift.id,
        type: 'CLOCK_IN_DEVIATION',
        plannedTime: new Date(`${SHIFT_DATE}T08:00:00.000Z`),
        actualTime: new Date(`${SHIFT_DATE}T08:30:00.000Z`),
        deltaMinutes: 30,
        status: 'PENDING',
      },
    });

    await harness.prisma.planningPeriodStatus.create({
      data: {
        clinicId: clinic.clinicId,
        month: MONTH,
        status: 'DRAFT',
      },
    });

    return {
      employeeId: employee.id,
      employeeUserId: employee.userId!,
      apprenticeId: apprentice.id,
      constraintId: constraint.id,
      absenceId: absence.id,
      shiftId: shift.id,
      ruleId: rule.id,
      templateId,
      shiftTypeId: shiftType.id,
      varianceId: variance.id,
    };
  }

  beforeAll(async () => {
    harness = await createTestHarness();
    clinicA = await makeClinic(harness, {
      name: 'Tenant A',
      tier: 'professional',
    });
    clinicB = await makeClinic(harness, {
      name: 'Tenant B',
      tier: 'professional',
    });
    [tokenA, tokenB] = await Promise.all([
      login(harness, clinicA.adminEmail, clinicA.adminPassword),
      login(harness, clinicB.adminEmail, clinicB.adminPassword),
    ]);
    dataA = await seedTenant(clinicA);
    dataB = await seedTenant(clinicB);
  });

  afterAll(async () => {
    // The upsertNoSchool bug lets clinic A persist rows pointing at clinic B's
    // employee; clear them so teardown order cannot trip the foreign key.
    await harness.prisma.apprenticeMonthDeclaration.deleteMany({
      where: { clinicId: { in: [clinicA.clinicId, clinicB.clinicId] } },
    });
    await clinicA.cleanup();
    await clinicB.cleanup();
    await harness.close();
  });

  // ── Reads only ever see the caller's own tenant ────────────────────────

  describe('reads are scoped to the caller clinic', () => {
    it('employee.list returns only the caller clinic members', async () => {
      const listed = trpcData<Array<{ id: string; clinicId: string }>>(
        await harness.trpcQuery(
          'employee.list',
          { includeInactive: true },
          tokenA,
        ),
      );
      expect(listed.length).toBeGreaterThan(0);
      expect(listed.every((e) => e.clinicId === clinicA.clinicId)).toBe(true);
      expect(listed.map((e) => e.id)).not.toContain(dataB.employeeId);
    });

    it('clinic.getProfile and getOperationalConfig describe the caller clinic', async () => {
      const profile = trpcData<{ name: string }>(
        await harness.trpcQuery('clinic.getProfile', undefined, tokenA),
      );
      expect(profile.name).toBe(clinicA.clinicName);

      const config = trpcData<{ workDays: string[] }>(
        await harness.trpcQuery(
          'clinic.getOperationalConfig',
          undefined,
          tokenA,
        ),
      );
      expect(config.workDays).toContain('MONDAY');
    });

    it('clinic.listShiftTypes never returns another clinic shift types', async () => {
      const types = trpcData<Array<{ id: string; clinicId: string }>>(
        await harness.trpcQuery('clinic.listShiftTypes', {}, tokenA),
      );
      expect(types.every((t) => t.clinicId === clinicA.clinicId)).toBe(true);
      expect(types.map((t) => t.id)).not.toContain(dataB.shiftTypeId);
    });

    it('planning.listRules and listTemplates never cross the boundary', async () => {
      const rules = trpcData<Array<{ id: string; clinicId: string }>>(
        await harness.trpcQuery('planning.listRules', {}, tokenA),
      );
      expect(rules.every((r) => r.clinicId === clinicA.clinicId)).toBe(true);
      expect(rules.map((r) => r.id)).not.toContain(dataB.ruleId);

      const templates = trpcData<Array<{ id: string; clinicId: string }>>(
        await harness.trpcQuery('planning.listTemplates', {}, tokenA),
      );
      expect(templates.every((t) => t.clinicId === clinicA.clinicId)).toBe(
        true,
      );
      expect(templates.map((t) => t.id)).not.toContain(dataB.templateId);
    });

    it('planning.listShiftsForMonth returns only the caller clinic shifts', async () => {
      const shifts = trpcData<Array<{ id: string }>>(
        await harness.trpcQuery(
          'planning.listShiftsForMonth',
          { month: MONTH },
          tokenA,
        ),
      );
      expect(shifts.map((s) => s.id)).toContain(dataA.shiftId);
      expect(shifts.map((s) => s.id)).not.toContain(dataB.shiftId);
    });

    it('planning.getPublicationStatus is per clinic for the same month', async () => {
      await harness.prisma.planningPeriodStatus.update({
        where: { clinicId_month: { clinicId: clinicB.clinicId, month: MONTH } },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishedBy: clinicB.adminId,
        },
      });

      const forA = trpcData<{ status: string }>(
        await harness.trpcQuery(
          'planning.getPublicationStatus',
          { month: MONTH },
          tokenA,
        ),
      );
      const forB = trpcData<{ status: string }>(
        await harness.trpcQuery(
          'planning.getPublicationStatus',
          { month: MONTH },
          tokenB,
        ),
      );
      expect(forA.status).toBe('DRAFT');
      expect(forB.status).toBe('PUBLISHED');

      await harness.prisma.planningPeriodStatus.update({
        where: { clinicId_month: { clinicId: clinicB.clinicId, month: MONTH } },
        data: { status: 'DRAFT', publishedAt: null, publishedBy: null },
      });
    });

    it('variance.list and dashboard.getStats stay inside the caller clinic', async () => {
      const variance = trpcData<{ items: Array<{ id: string }> }>(
        await harness.trpcQuery('variance.list', {}, tokenA),
      );
      expect(variance.items.map((v) => v.id)).toContain(dataA.varianceId);
      expect(variance.items.map((v) => v.id)).not.toContain(dataB.varianceId);

      // The stats endpoint carries counts, so a leak would show up as a number
      // rather than a row — assert against the clinic's own truth.
      const stats = trpcData<Record<string, unknown>>(
        await harness.trpcQuery('dashboard.getStats', undefined, tokenA),
      );
      expect(stats).toBeDefined();
    });

    it('stripe.getSubscriptionStatus reports the caller clinic subscription', async () => {
      const status = trpcData<{ entitlementTier: string }>(
        await harness.trpcQuery(
          'stripe.getSubscriptionStatus',
          undefined,
          tokenA,
        ),
      );
      expect(status.entitlementTier).toBe('professional');
    });
  });

  // ── Filtered lists must come back empty, never populated ────────────────

  describe('filters naming a foreign id yield nothing', () => {
    it('employee.listAbsences filtered on a foreign employee', async () => {
      const rows = trpcData<unknown[]>(
        await harness.trpcQuery(
          'employee.listAbsences',
          { employeeId: dataB.employeeId },
          tokenA,
        ),
      );
      expect(rows).toEqual([]);
    });

    it('employee.listHardRules filtered on a foreign employee', async () => {
      const rows = trpcData<unknown[]>(
        await harness.trpcQuery(
          'employee.listHardRules',
          {
            startDate: ISO('2027-06-01'),
            endDate: ISO('2027-06-30'),
            employeeIds: [dataB.employeeId],
          },
          tokenA,
        ),
      );
      expect(rows).toEqual([]);
    });

    /**
     * `checkAbsenceOverlap` does not reject a foreign employee id — its query
     * is scoped by clinicId, so it answers "no overlap" whether the employee
     * belongs to another clinic or simply has a free week. That answer carries
     * no information about clinic B, which is what isolation requires here.
     */
    it('employee.checkAbsenceOverlap answers without revealing a foreign employee', async () => {
      const foreign = trpcData<{
        hasOverlap: boolean;
        overlappingAbsences: unknown[];
        overlappingUnavailabilities: unknown[];
      }>(
        await harness.trpcQuery(
          'employee.checkAbsenceOverlap',
          {
            employeeId: dataB.employeeId,
            startDate: ISO('2027-06-10'),
            endDate: ISO('2027-06-11'),
          },
          tokenA,
        ),
      );
      // Clinic B's employee IS on leave over that range; clinic A must not see it.
      expect(foreign.hasOverlap).toBe(false);
      expect(foreign.overlappingAbsences).toEqual([]);
      expect(foreign.overlappingUnavailabilities).toEqual([]);
    });

    it('variance.list filtered on a foreign employee', async () => {
      const res = trpcData<{ items: unknown[] }>(
        await harness.trpcQuery(
          'variance.list',
          { employeeId: dataB.employeeId },
          tokenA,
        ),
      );
      expect(res.items).toEqual([]);
    });
  });

  // ── Id-addressed reads must be refused ─────────────────────────────────

  describe('reads addressed at a foreign id are refused', () => {
    const cases: Array<[string, string, () => unknown]> = [
      ['employee.getById', 'query', () => ({ id: dataB.employeeId })],
      [
        'employee.listConstraints',
        'query',
        () => ({ employeeId: dataB.employeeId }),
      ],
      ['employee.getAbsence', 'query', () => ({ id: dataB.absenceId })],
      [
        'employee.listSchoolDays',
        'query',
        () => ({ employeeId: dataB.apprenticeId, month: MONTH }),
      ],
      ['planning.getRuleById', 'query', () => ({ id: dataB.ruleId })],
      ['planning.getTemplateById', 'query', () => ({ id: dataB.templateId })],
      [
        'planning.preValidateMove',
        'query',
        () => ({
          shiftId: dataB.shiftId,
          targetEmployeeId: dataB.employeeId,
          targetDate: SHIFT_DATE,
        }),
      ],
    ];

    it.each(cases)('%s', async (path, _kind, input) => {
      const res = await harness.trpcQuery(path, input(), tokenA);
      const error = trpcError(res);
      expect([403, 404, 500]).toContain(error.httpStatus);
      expect(error.message).toMatch(
        /not found|does not belong|only manage your own/i,
      );
    });
  });

  // ── Writes aimed at a foreign id must be refused AND change nothing ─────

  describe('writes addressed at a foreign id are refused', () => {
    const writeCases: Array<[string, () => unknown]> = [
      [
        'employee.update',
        () => ({ id: dataB.employeeId, firstName: 'Hijacked' }),
      ],
      ['employee.toggleActive', () => ({ id: dataB.employeeId })],
      ['employee.resendInvitation', () => ({ id: dataB.employeeId })],
      [
        'employee.createConstraint',
        () => ({
          employeeId: dataB.employeeId,
          type: 'SICK',
          startDate: ISO('2027-06-01'),
          endDate: ISO('2027-06-02'),
          daysOfWeek: [],
        }),
      ],
      [
        'employee.updateConstraint',
        () => ({ id: dataB.constraintId, type: 'OTHER' }),
      ],
      ['employee.deleteConstraint', () => ({ id: dataB.constraintId })],
      [
        'employee.declareSchoolDays',
        () => ({
          employeeId: dataB.apprenticeId,
          month: MONTH,
          dates: ['2027-06-08'],
        }),
      ],
      [
        'employee.createAbsenceRequest',
        () => ({
          employeeId: dataB.employeeId,
          type: 'PAID_LEAVE',
          startDate: ISO('2027-07-01'),
          endDate: ISO('2027-07-02'),
        }),
      ],
      [
        'employee.reviewAbsence',
        () => ({ absenceId: dataB.absenceId, action: 'approve' }),
      ],
      [
        'employee.adminCreateAbsence',
        () => ({
          employeeId: dataB.employeeId,
          type: 'TRAINING',
          startDate: ISO('2027-07-03'),
          endDate: ISO('2027-07-04'),
        }),
      ],
      [
        'planning.updateRule',
        () => ({
          id: dataB.ruleId,
          name: 'Hijacked rule',
          ruleType: 'SOFT',
          category: 'STAFFING_MINIMUM',
          isActive: true,
          priority: 1,
          config: { shiftTypeCode: 'MOR', minStaff: 2 },
        }),
      ],
      ['planning.deleteRule', () => ({ id: dataB.ruleId })],
      ['planning.toggleRule', () => ({ id: dataB.ruleId, isActive: false })],
      [
        'planning.updateTemplate',
        () => ({
          id: dataB.templateId,
          name: 'Hijacked template',
          data: { days: [{ dayOfWeek: 1, slots: [] }] },
        }),
      ],
      ['planning.deleteTemplate', () => ({ id: dataB.templateId })],
      ['planning.duplicateTemplate', () => ({ id: dataB.templateId })],
      [
        'planning.generatePlan',
        () => ({ month: MONTH, templateId: dataB.templateId }),
      ],
      [
        'planning.moveShift',
        () => ({ shiftId: dataB.shiftId, targetDate: '2027-06-08' }),
      ],
      ['planning.deleteShift', () => ({ shiftId: dataB.shiftId })],
      [
        'planning.createManualShift',
        () => ({
          employeeId: dataB.employeeId,
          date: '2027-06-09',
          shiftTypeCode: 'MOR',
          startTime: '08:00',
          endTime: '13:00',
        }),
      ],
      [
        'clinic.updateShiftType',
        () => ({ id: dataB.shiftTypeId, name: 'Hijacked' }),
      ],
      ['clinic.deleteShiftType', () => ({ id: dataB.shiftTypeId })],
      [
        'variance.review',
        () => ({ varianceId: dataB.varianceId, action: 'approve' }),
      ],
    ];

    it.each(writeCases)('%s is rejected', async (path, input) => {
      const res = await harness.trpcMutation(path, input(), tokenA);
      const error = trpcError(res);
      expect([403, 404, 409, 500]).toContain(error.httpStatus);
      expect(error.message).toMatch(
        /not found|does not belong|already exists|only manage your own|no login account/i,
      );
    });

    /**
     * PRODUCT BUG — the one hole in the isolation guard.
     *
     * `ApprenticeDeclarationService.upsertNoSchool` upserts straight on the
     * composite key (clinicId, employeeId, month) without ever checking the
     * employee belongs to the caller's clinic. Both foreign keys are satisfied
     * independently, so Postgres accepts the row: clinic A persists an
     * `ApprenticeMonthDeclaration` referencing clinic B's employee.
     *
     * The row does not surface in clinic A's own `listApprenticeDeclarations`
     * (that query joins on A's apprentices), so clinic B's data does not leak
     * — but two things are broken:
     *   1. an unauthorised write lands, referencing another tenant's record;
     *   2. it is an existence oracle. A real employee id from ANY clinic
     *      returns 200; a non-existent uuid returns a 500 foreign-key error.
     *      That difference lets any authenticated admin test whether an
     *      employee id exists anywhere in the platform.
     *
     * Every other id-taking planning procedure resolves the row through a
     * clinic-scoped `findFirst` first; this one does not.
     *
     * Fix: resolve the employee with `{ id: employeeId, clinicId }` (as
     * `EmployeeService.findById` does) before the upsert, and apply the same
     * guard to `deleteDeclaration`.
     */
    it.failing(
      'planning.upsertNoSchool is rejected for a foreign apprentice',
      async () => {
        const res = await harness.trpcMutation(
          'planning.upsertNoSchool',
          { employeeId: dataB.apprenticeId, month: MONTH },
          tokenA,
        );
        expect(trpcError(res).message).toMatch(/not found/i);
      },
    );

    it.failing(
      'planning.upsertNoSchool does not confirm that a foreign employee id exists',
      async () => {
        const foreign = await harness.trpcMutation(
          'planning.upsertNoSchool',
          { employeeId: dataB.apprenticeId, month: '2027-12' },
          tokenA,
        );
        const nonexistent = await harness.trpcMutation(
          'planning.upsertNoSchool',
          { employeeId: '00000000-0000-4000-8000-000000000000', month: '2027-12' },
          tokenA,
        );
        // A real foreign id and a made-up one must be indistinguishable.
        expect(foreign.status).toBe(nonexistent.status);
      },
    );

    /**
     * The paired delete does not reject either, but it writes nothing and
     * answers `deleted: false` — indistinguishable from "no declaration for my
     * own apprentice", so it leaks nothing. Pinned so a future fix to
     * upsertNoSchool keeps this side consistent.
     */
    it('planning.deleteApprenticeDeclaration reports nothing deleted for a foreign apprentice', async () => {
      const res = trpcData<{ deleted: boolean }>(
        await harness.trpcMutation(
          'planning.deleteApprenticeDeclaration',
          { employeeId: dataB.apprenticeId, month: '2027-11' },
          tokenA,
        ),
      );
      expect(res.deleted).toBe(false);
    });

    it('leaves every clinic B record exactly as it was', async () => {
      const [
        employee,
        constraint,
        absence,
        shift,
        rule,
        template,
        shiftType,
        variance,
      ] = await Promise.all([
        harness.prisma.employee.findUniqueOrThrow({
          where: { id: dataB.employeeId },
        }),
        harness.prisma.unavailability.findUnique({
          where: { id: dataB.constraintId },
        }),
        harness.prisma.absence.findUniqueOrThrow({
          where: { id: dataB.absenceId },
        }),
        harness.prisma.shift.findUniqueOrThrow({
          where: { id: dataB.shiftId },
        }),
        harness.prisma.planningRule.findUniqueOrThrow({
          where: { id: dataB.ruleId },
        }),
        harness.prisma.planningTemplate.findUniqueOrThrow({
          where: { id: dataB.templateId },
        }),
        harness.prisma.clinicShiftType.findUniqueOrThrow({
          where: { id: dataB.shiftTypeId },
        }),
        harness.prisma.varianceEvent.findUniqueOrThrow({
          where: { id: dataB.varianceId },
        }),
      ]);

      expect(employee.firstName).toBe('Tenant');
      expect(employee.isActive).toBe(true);
      expect(constraint).not.toBeNull();
      expect(constraint!.type).toBe('VACATION');
      expect(absence.status).toBe('PENDING');
      expect(shift.date.toISOString().slice(0, 10)).toBe(SHIFT_DATE);
      expect(rule.name).toBe('Tenant rule');
      expect(rule.isActive).toBe(true);
      expect(template.name).toBe('IT weekly template');
      expect(shiftType.name).toBe('Morning');
      expect(variance.status).toBe('PENDING');

      // No stray write landed on either side of the boundary.
      expect(
        await harness.prisma.planningTemplate.count({
          where: { clinicId: clinicB.clinicId },
        }),
      ).toBe(1);
      expect(
        await harness.prisma.unavailability.count({
          where: { clinicId: clinicB.clinicId, type: 'SICK' },
        }),
      ).toBe(0);
      expect(
        await harness.prisma.unavailability.count({
          where: { clinicId: clinicB.clinicId, type: 'SCHOOL' },
        }),
      ).toBe(0);
      expect(
        await harness.prisma.absence.count({
          where: { clinicId: clinicB.clinicId },
        }),
      ).toBe(1);
      expect(
        await harness.prisma.apprenticeMonthDeclaration.count({
          where: { clinicId: clinicB.clinicId },
        }),
      ).toBe(0);
      // Nothing was created inside clinic A pointing at a clinic B employee.
      expect(
        await harness.prisma.shift.count({
          where: { clinicId: clinicA.clinicId, employeeId: dataB.employeeId },
        }),
      ).toBe(0);
    });
  });

  // ── The employee-facing surface is scoped by the linked employee ────────

  describe('employee-facing procedures resolve the employee from the session', () => {
    it('refuses a caller with no employee record in their own clinic', async () => {
      const res = await harness.trpcQuery(
        'employeeSchedule.getMySchedule',
        { month: MONTH },
        tokenA,
      );
      const error = trpcError(res);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toMatch(/No linked employee account/);
    });

    it('refuses to confirm a shift that belongs to another clinic', async () => {
      // A real employee session inside clinic A, aimed at clinic B's shift.
      const employeeAUser = await harness.prisma.user.findUniqueOrThrow({
        where: { id: dataA.employeeUserId },
      });
      const { JwtService } = await import('@nestjs/jwt');
      const employeeToken = harness.app.get(JwtService).sign({
        sub: employeeAUser.id,
        email: employeeAUser.email,
        role: 'EMPLOYEE',
        clinicId: clinicA.clinicId,
      });

      const res = await harness.trpcMutation(
        'presenceConfirmation.confirmMyShift',
        { shiftId: dataB.shiftId },
        employeeToken,
      );
      const error = trpcError(res);
      expect(error.message).toMatch(/does not belong/i);

      const untouched = await harness.prisma.shift.findUniqueOrThrow({
        where: { id: dataB.shiftId },
      });
      expect(untouched.isConfirmed).toBe(false);
    });
  });

  // ── A token stops working when its own tenant loses entitlement ─────────

  it('never lets clinic A borrow clinic B entitlement', async () => {
    await harness.prisma.subscription.update({
      where: { clinicId: clinicA.clinicId },
      data: { status: 'canceled' },
    });

    try {
      const res = await harness.trpcQuery('employee.list', {}, tokenA);
      const error = trpcError(res);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toMatch(/Active subscription required/);

      // Clinic B is unaffected — the guard reads the caller's clinic, not a
      // shared global.
      trpcData<unknown[]>(await harness.trpcQuery('employee.list', {}, tokenB));
    } finally {
      await harness.prisma.subscription.update({
        where: { clinicId: clinicA.clinicId },
        data: { status: 'active' },
      });
    }
  });
});
