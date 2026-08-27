/**
 * The employee tRPC router against the real database.
 *
 * Stories 5-1 (contract CRUD), 5-2 (declarative constraints), 5-4 (apprentice
 * school days), 7-3 (absence request/review) and the 2026-08-19 quick spec
 * "keep the employee's login account email in sync" — a regression that reached
 * production, so it gets the most coverage here.
 *
 * Note on error codes: the employee router has no service-exception mapper, so
 * a `BadRequestException` from EmployeeService surfaces as a tRPC
 * INTERNAL_SERVER_ERROR with the message preserved. Assertions therefore key on
 * the message, which is what the web layer shows.
 */
import { createTestHarness, login, type TestHarness } from './harness';
import {
  makeClinic,
  makeEmployee,
  settle,
  signAccessToken,
  trpcData,
  trpcError,
  uniqueEmail,
  waitForMail,
  type ClinicFixture,
} from './helpers';

const ISO = (date: string) => new Date(`${date}T00:00:00.000Z`).toISOString();

interface EmployeeRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  jobType: string;
  contractHours: number;
  isActive: boolean;
  clinicId: string;
  userId: string | null;
}

describe('Employee router (integration)', () => {
  let harness: TestHarness;
  let clinic: ClinicFixture;
  let adminToken: string;

  const createEmployee = (input: Record<string, unknown>) =>
    harness.trpcMutation(
      'employee.create',
      {
        firstName: 'Ada',
        lastName: 'Lovelace',
        jobType: 'ASV',
        contractType: 'CDI',
        contractHours: 35,
        color: '#3b82f6',
        ...input,
      },
      adminToken,
    );

  beforeAll(async () => {
    harness = await createTestHarness();
    clinic = await makeClinic(harness);
    adminToken = await login(harness, clinic.adminEmail, clinic.adminPassword);
  });

  afterAll(async () => {
    await clinic.cleanup();
    await harness.close();
  });

  beforeEach(async () => {
    harness.mailbox.reset();
    // Each test owns its employees; wipe between tests so the tier limit and
    // the list assertions never see a neighbour's leftovers.
    await harness.prisma.employee.deleteMany({
      where: { clinicId: clinic.clinicId },
    });
    await harness.prisma.user.deleteMany({
      where: { clinicId: clinic.clinicId, role: 'EMPLOYEE' },
    });
  });

  // ── create (Story 5-1 AC1, AC5) ────────────────────────────────────────

  describe('create', () => {
    it('persists an employee scoped to the caller clinic, with no account when there is no email', async () => {
      const created = trpcData<EmployeeRow>(await createEmployee({}));

      expect(created.clinicId).toBe(clinic.clinicId);
      expect(created.email).toBeNull();
      expect(created.userId).toBeNull();
      expect(created.isActive).toBe(true);

      const row = await harness.prisma.employee.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(row.clinicId).toBe(clinic.clinicId);
      expect(row.contractHours).toBe(35);
    });

    it('creates and links a login account when an email is given, and mails the invitation', async () => {
      const email = uniqueEmail('it-emp');
      const created = trpcData<EmployeeRow>(await createEmployee({ email }));

      expect(created.email).toBe(email);
      expect(created.userId).not.toBeNull();

      const user = await harness.prisma.user.findUniqueOrThrow({
        where: { id: created.userId! },
      });
      expect(user.email).toBe(email);
      expect(user.role).toBe('EMPLOYEE');
      expect(user.clinicId).toBe(clinic.clinicId);

      // Fire-and-forget invitation: a welcome magic link, not a bare notice.
      const mail = await waitForMail(
        harness,
        (m) => m.type === 'sendEmployeeInvitationEmail' && m.to === email,
      );
      const token = new URL(mail.url!).searchParams.get('token')!;
      expect(token).toMatch(/^[a-f0-9]{64}$/);
      expect(
        await harness.prisma.magicLink.count({ where: { userId: user.id } }),
      ).toBe(1);
    });

    it('reuses an existing account in the same clinic instead of duplicating it', async () => {
      const email = uniqueEmail('it-existing');
      const user = await harness.prisma.user.create({
        data: { email, role: 'EMPLOYEE', clinicId: clinic.clinicId },
      });

      const created = trpcData<EmployeeRow>(await createEmployee({ email }));
      expect(created.userId).toBe(user.id);
      expect(await harness.prisma.user.count({ where: { email } })).toBe(1);
    });

    it('refuses an email already owned by another clinic', async () => {
      const other = await makeClinic(harness);
      try {
        const foreignEmail = uniqueEmail('it-foreign');
        await harness.prisma.user.create({
          data: {
            email: foreignEmail,
            role: 'EMPLOYEE',
            clinicId: other.clinicId,
          },
        });

        const res = await createEmployee({ email: foreignEmail });
        expect(trpcError(res).message).toMatch(
          /already exists in another clinic/,
        );
        expect(
          await harness.prisma.employee.count({
            where: { email: foreignEmail },
          }),
        ).toBe(0);
      } finally {
        await other.cleanup();
      }
    });

    // Story 5-1 AC5 — the schema rejects before anything is written.
    it('rejects invalid payloads', async () => {
      expect(
        trpcError(await createEmployee({ email: 'not-an-email' })).code,
      ).toBe('BAD_REQUEST');
      expect(trpcError(await createEmployee({ contractHours: 0 })).code).toBe(
        'BAD_REQUEST',
      );
      expect(trpcError(await createEmployee({ contractHours: 60 })).code).toBe(
        'BAD_REQUEST',
      );
      expect(trpcError(await createEmployee({ firstName: '' })).code).toBe(
        'BAD_REQUEST',
      );
      expect(trpcError(await createEmployee({ color: 'blue' })).code).toBe(
        'BAD_REQUEST',
      );
      expect(
        await harness.prisma.employee.count({
          where: { clinicId: clinic.clinicId },
        }),
      ).toBe(0);
    });
  });

  // ── list / toggleActive (Story 5-1 AC2, AC4) ───────────────────────────

  describe('list and toggleActive', () => {
    it('hides deactivated employees unless they are explicitly asked for', async () => {
      const active = trpcData<EmployeeRow>(
        await createEmployee({ lastName: 'Active' }),
      );
      const toDeactivate = trpcData<EmployeeRow>(
        await createEmployee({ lastName: 'Retired' }),
      );

      const toggled = trpcData<EmployeeRow>(
        await harness.trpcMutation(
          'employee.toggleActive',
          { id: toDeactivate.id },
          adminToken,
        ),
      );
      expect(toggled.isActive).toBe(false);

      const visible = trpcData<EmployeeRow[]>(
        await harness.trpcQuery('employee.list', {}, adminToken),
      );
      expect(visible.map((e) => e.id)).toEqual([active.id]);

      const all = trpcData<EmployeeRow[]>(
        await harness.trpcQuery(
          'employee.list',
          { includeInactive: true },
          adminToken,
        ),
      );
      expect(all.map((e) => e.id).sort()).toEqual(
        [active.id, toDeactivate.id].sort(),
      );

      // Historical data survives deactivation — the row is still there.
      const restored = trpcData<EmployeeRow>(
        await harness.trpcMutation(
          'employee.toggleActive',
          { id: toDeactivate.id },
          adminToken,
        ),
      );
      expect(restored.isActive).toBe(true);
    });

    it('filters by job type and name', async () => {
      await createEmployee({
        firstName: 'Grace',
        lastName: 'Hopper',
        jobType: 'VET',
      });
      await createEmployee({
        firstName: 'Ada',
        lastName: 'Byron',
        jobType: 'ASV',
      });

      const vets = trpcData<EmployeeRow[]>(
        await harness.trpcQuery(
          'employee.list',
          { jobType: 'VET' },
          adminToken,
        ),
      );
      expect(vets.map((e) => e.lastName)).toEqual(['Hopper']);

      const search = trpcData<EmployeeRow[]>(
        await harness.trpcQuery('employee.list', { search: 'byr' }, adminToken),
      );
      expect(search.map((e) => e.lastName)).toEqual(['Byron']);
    });
  });

  // ── update + the email/User sync regression ────────────────────────────

  describe('update', () => {
    it('persists edited fields', async () => {
      const created = trpcData<EmployeeRow>(await createEmployee({}));

      const updated = trpcData<EmployeeRow>(
        await harness.trpcMutation(
          'employee.update',
          {
            id: created.id,
            firstName: 'Augusta',
            jobType: 'VET',
            contractHours: 20,
          },
          adminToken,
        ),
      );

      expect(updated).toMatchObject({
        firstName: 'Augusta',
        jobType: 'VET',
        contractHours: 20,
        lastName: 'Lovelace',
      });
    });

    // Quick spec 2026-08-19 AC1 — the regression that reached production.
    it('drags the linked login account along when the email is renamed', async () => {
      const original = uniqueEmail('it-before');
      const created = trpcData<EmployeeRow>(
        await createEmployee({ email: original }),
      );
      const renamed = uniqueEmail('it-after');

      const updated = trpcData<EmployeeRow>(
        await harness.trpcMutation(
          'employee.update',
          { id: created.id, email: renamed },
          adminToken,
        ),
      );

      expect(updated.email).toBe(renamed);
      const user = await harness.prisma.user.findUniqueOrThrow({
        where: { id: created.userId! },
      });
      expect(user.email).toBe(renamed);
      // The old identity is gone, not merely shadowed.
      expect(
        await harness.prisma.user.findUnique({ where: { email: original } }),
      ).toBeNull();
    });

    // Quick spec AC1 — the login account is untouched when the email is not
    // part of the patch, and when there is no account at all.
    it('leaves the login account alone when the email is not in the patch', async () => {
      const email = uniqueEmail('it-stable');
      const created = trpcData<EmployeeRow>(await createEmployee({ email }));

      await harness.trpcMutation(
        'employee.update',
        { id: created.id, firstName: 'Renamed', contractHours: 28 },
        adminToken,
      );

      const user = await harness.prisma.user.findUniqueOrThrow({
        where: { id: created.userId! },
      });
      expect(user.email).toBe(email);
      expect(user.name).toBe('Ada Lovelace');
    });

    it('renames an account-less employee without inventing an account', async () => {
      const created = trpcData<EmployeeRow>(await createEmployee({}));
      const email = uniqueEmail('it-noaccount');

      const updated = trpcData<EmployeeRow>(
        await harness.trpcMutation(
          'employee.update',
          { id: created.id, email },
          adminToken,
        ),
      );

      expect(updated.email).toBe(email);
      expect(updated.userId).toBeNull();
      expect(
        await harness.prisma.user.findUnique({ where: { email } }),
      ).toBeNull();
    });

    // Quick spec AC2 — the rename is refused when the address is taken, and
    // nothing at all changes.
    it('refuses a rename onto an email another account already owns', async () => {
      const mine = uniqueEmail('it-mine');
      const taken = uniqueEmail('it-taken');
      const created = trpcData<EmployeeRow>(
        await createEmployee({ email: mine }),
      );
      const squatter = await harness.prisma.user.create({
        data: { email: taken, role: 'EMPLOYEE', clinicId: clinic.clinicId },
      });

      const res = await harness.trpcMutation(
        'employee.update',
        { id: created.id, email: taken, firstName: 'ShouldNotStick' },
        adminToken,
      );
      expect(trpcError(res).message).toMatch(/already exists/);

      const employee = await harness.prisma.employee.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(employee.email).toBe(mine);
      expect(employee.firstName).toBe('Ada');
      const [owner, victim] = await Promise.all([
        harness.prisma.user.findUniqueOrThrow({
          where: { id: created.userId! },
        }),
        harness.prisma.user.findUniqueOrThrow({ where: { id: squatter.id } }),
      ]);
      expect(owner.email).toBe(mine);
      expect(victim.email).toBe(taken);
    });

    it('accepts a no-op rename to the address the employee already has', async () => {
      const email = uniqueEmail('it-same');
      const created = trpcData<EmployeeRow>(await createEmployee({ email }));

      const updated = trpcData<EmployeeRow>(
        await harness.trpcMutation(
          'employee.update',
          { id: created.id, email },
          adminToken,
        ),
      );
      expect(updated.email).toBe(email);
      const user = await harness.prisma.user.findUniqueOrThrow({
        where: { id: created.userId! },
      });
      expect(user.email).toBe(email);
    });
  });

  // ── resendInvitation (quick spec AC3) ──────────────────────────────────

  describe('resendInvitation', () => {
    it('mints a fresh magic link and mails it', async () => {
      const email = uniqueEmail('it-resend');
      const created = trpcData<EmployeeRow>(await createEmployee({ email }));
      await waitForMail(
        harness,
        (m) => m.type === 'sendEmployeeInvitationEmail',
      );
      harness.mailbox.reset();

      const res = trpcData<{ message: string }>(
        await harness.trpcMutation(
          'employee.resendInvitation',
          { id: created.id },
          adminToken,
        ),
      );
      expect(res.message).toBeTruthy();

      const mail = await waitForMail(
        harness,
        (m) => m.type === 'sendEmployeeInvitationEmail' && m.to === email,
      );
      const token = new URL(mail.url!).searchParams.get('token')!;
      const stored = await harness.prisma.magicLink.findMany({
        where: { userId: created.userId! },
      });
      expect(stored.length).toBe(2);
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('links a legacy employee that has an email but no account yet', async () => {
      const email = uniqueEmail('it-legacy');
      const employee = await makeEmployee(harness, {
        clinicId: clinic.clinicId,
        email,
      });
      expect(employee.userId).toBeNull();

      trpcData(
        await harness.trpcMutation(
          'employee.resendInvitation',
          { id: employee.id },
          adminToken,
        ),
      );

      const linked = await harness.prisma.employee.findUniqueOrThrow({
        where: { id: employee.id },
      });
      expect(linked.userId).not.toBeNull();
      await waitForMail(
        harness,
        (m) => m.type === 'sendEmployeeInvitationEmail' && m.to === email,
      );
    });

    /**
     * Quick spec AC3 — the production failure mode: an employee linked to an
     * account whose email drifted. `createWelcomeMagicLink` looks the account
     * up by the *employee's* email, finds nothing, and used to return success
     * while nothing was sent. It must fail loudly instead.
     */
    it('fails loudly when no account carries the employee email', async () => {
      const employeeEmail = uniqueEmail('it-drifted');
      const accountEmail = uniqueEmail('it-account');
      const employee = await makeEmployee(harness, {
        clinicId: clinic.clinicId,
        email: employeeEmail,
        userEmail: accountEmail,
      });
      expect(employee.userId).not.toBeNull();

      const res = await harness.trpcMutation(
        'employee.resendInvitation',
        { id: employee.id },
        adminToken,
      );
      expect(trpcError(res).message).toMatch(/No login account matches/);

      await settle();
      expect(
        harness.mailbox
          .read()
          .filter((m) => m.type === 'sendEmployeeInvitationEmail'),
      ).toHaveLength(0);
    });

    it('refuses an employee with no email at all', async () => {
      const created = trpcData<EmployeeRow>(await createEmployee({}));
      const res = await harness.trpcMutation(
        'employee.resendInvitation',
        { id: created.id },
        adminToken,
      );
      expect(trpcError(res).message).toMatch(/no email address/);
    });
  });

  // ── constraints (Story 5-2) ────────────────────────────────────────────

  describe('constraints', () => {
    let employeeId: string;

    beforeEach(async () => {
      employeeId = trpcData<EmployeeRow>(await createEmployee({})).id;
    });

    // AC1 + AC4.
    it('creates, lists, updates and deletes a one-time constraint', async () => {
      const created = trpcData<{ id: string; type: string; clinicId: string }>(
        await harness.trpcMutation(
          'employee.createConstraint',
          {
            employeeId,
            type: 'VACATION',
            startDate: ISO('2027-03-10'),
            endDate: ISO('2027-03-14'),
            reason: 'Ski',
            daysOfWeek: [],
          },
          adminToken,
        ),
      );
      expect(created.clinicId).toBe(clinic.clinicId);

      const listed = trpcData<Array<{ id: string }>>(
        await harness.trpcQuery(
          'employee.listConstraints',
          { employeeId },
          adminToken,
        ),
      );
      expect(listed.map((c) => c.id)).toEqual([created.id]);

      const updated = trpcData<{ reason: string | null; type: string }>(
        await harness.trpcMutation(
          'employee.updateConstraint',
          { id: created.id, type: 'SICK', reason: '' },
          adminToken,
        ),
      );
      expect(updated.type).toBe('SICK');
      expect(updated.reason).toBeNull();

      trpcData(
        await harness.trpcMutation(
          'employee.deleteConstraint',
          { id: created.id },
          adminToken,
        ),
      );
      expect(
        trpcData<unknown[]>(
          await harness.trpcQuery(
            'employee.listConstraints',
            { employeeId },
            adminToken,
          ),
        ),
      ).toHaveLength(0);
    });

    // AC2 — recurrence metadata is stored as given.
    it('stores recurrence weekdays on a recurring constraint', async () => {
      const created = trpcData<{ id: string; daysOfWeek: number[] }>(
        await harness.trpcMutation(
          'employee.createConstraint',
          {
            employeeId,
            type: 'OTHER',
            startDate: ISO('2027-03-01'),
            endDate: ISO('2027-03-31'),
            daysOfWeek: [3, 5],
          },
          adminToken,
        ),
      );
      expect(created.daysOfWeek).toEqual([3, 5]);
    });

    // AC5 — what the planning engine consumes.
    it('projects constraints into HARD rules for a date range', async () => {
      await harness.trpcMutation(
        'employee.createConstraint',
        {
          employeeId,
          type: 'VACATION',
          startDate: ISO('2027-04-05'),
          endDate: ISO('2027-04-07'),
          daysOfWeek: [],
        },
        adminToken,
      );
      await harness.trpcMutation(
        'employee.createConstraint',
        {
          employeeId,
          type: 'OTHER',
          startDate: ISO('2027-04-01'),
          endDate: ISO('2027-04-30'),
          daysOfWeek: [1],
        },
        adminToken,
      );

      const rules = trpcData<
        Array<{
          ruleType: string;
          source: string;
          employeeId: string;
          startDate: string;
        }>
      >(
        await harness.trpcQuery(
          'employee.listHardRules',
          { startDate: ISO('2027-04-01'), endDate: ISO('2027-04-30') },
          adminToken,
        ),
      );

      expect(rules.length).toBeGreaterThan(0);
      expect(rules.every((r) => r.ruleType === 'HARD')).toBe(true);
      expect(rules.every((r) => r.employeeId === employeeId)).toBe(true);
      expect(rules.map((r) => r.source)).toContain('ONE_TIME');
      expect(rules.map((r) => r.source)).toContain('RECURRING');
      // April 2027 has four Mondays inside the window.
      expect(rules.filter((r) => r.source === 'RECURRING')).toHaveLength(4);
    });

    // AC6.
    it('rejects an inverted date range and an invalid weekday', async () => {
      const inverted = await harness.trpcMutation(
        'employee.createConstraint',
        {
          employeeId,
          type: 'VACATION',
          startDate: ISO('2027-03-14'),
          endDate: ISO('2027-03-10'),
          daysOfWeek: [],
        },
        adminToken,
      );
      expect(trpcError(inverted).code).toBe('BAD_REQUEST');

      const badWeekday = await harness.trpcMutation(
        'employee.createConstraint',
        {
          employeeId,
          type: 'VACATION',
          startDate: ISO('2027-03-10'),
          endDate: ISO('2027-03-14'),
          daysOfWeek: [0],
        },
        adminToken,
      );
      expect(trpcError(badWeekday).code).toBe('BAD_REQUEST');
    });
  });

  // ── school days (Story 5-4) ────────────────────────────────────────────

  describe('school days', () => {
    let apprenticeId: string;
    let apprenticeUserId: string;
    let apprenticeEmail: string;

    beforeEach(async () => {
      apprenticeEmail = uniqueEmail('it-apprentice');
      const created = trpcData<EmployeeRow>(
        await createEmployee({
          firstName: 'Ann',
          lastName: 'Trainee',
          jobType: 'APPRENTICE',
          contractType: 'APPRENTICESHIP',
          email: apprenticeEmail,
        }),
      );
      apprenticeId = created.id;
      apprenticeUserId = created.userId!;
      harness.mailbox.reset();
    });

    // AC3 + AC5.
    it('stores one SCHOOL unavailability per date and notifies the admin', async () => {
      const declared = trpcData<
        Array<{ type: string; startDate: string; endDate: string }>
      >(
        await harness.trpcMutation(
          'employee.declareSchoolDays',
          {
            employeeId: apprenticeId,
            month: '2027-05',
            dates: ['2027-05-04', '2027-05-11'],
          },
          adminToken,
        ),
      );

      expect(declared).toHaveLength(2);
      expect(declared.every((d) => d.type === 'SCHOOL')).toBe(true);
      // One record per day: start and end collapse onto the same date.
      expect(declared.map((d) => d.startDate.slice(0, 10))).toEqual([
        '2027-05-04',
        '2027-05-11',
      ]);
      expect(declared.map((d) => d.endDate.slice(0, 10))).toEqual([
        '2027-05-04',
        '2027-05-11',
      ]);

      const mail = await waitForMail(
        harness,
        (m) =>
          m.type === 'sendSchoolDaysNotification' && m.to === clinic.adminEmail,
      );
      expect(mail.args).toContain('Ann Trainee');
    });

    // AC4 — replace-list semantics.
    it('replaces the previous declaration for the same month', async () => {
      await harness.trpcMutation(
        'employee.declareSchoolDays',
        {
          employeeId: apprenticeId,
          month: '2027-05',
          dates: ['2027-05-04', '2027-05-11'],
        },
        adminToken,
      );
      await harness.trpcMutation(
        'employee.declareSchoolDays',
        { employeeId: apprenticeId, month: '2027-05', dates: ['2027-05-18'] },
        adminToken,
      );

      const listed = trpcData<Array<{ startDate: string }>>(
        await harness.trpcQuery(
          'employee.listSchoolDays',
          { employeeId: apprenticeId, month: '2027-05' },
          adminToken,
        ),
      );
      expect(listed.map((d) => d.startDate.slice(0, 10))).toEqual([
        '2027-05-18',
      ]);
    });

    it('clears the month when an empty list is declared', async () => {
      await harness.trpcMutation(
        'employee.declareSchoolDays',
        { employeeId: apprenticeId, month: '2027-05', dates: ['2027-05-04'] },
        adminToken,
      );
      const cleared = trpcData<unknown[]>(
        await harness.trpcMutation(
          'employee.declareSchoolDays',
          { employeeId: apprenticeId, month: '2027-05', dates: [] },
          adminToken,
        ),
      );
      expect(cleared).toHaveLength(0);
    });

    it('refuses a non-apprentice and dates outside the declared month', async () => {
      const asv = trpcData<EmployeeRow>(
        await createEmployee({ lastName: 'NotAnApprentice' }),
      );
      const wrongJob = await harness.trpcMutation(
        'employee.declareSchoolDays',
        { employeeId: asv.id, month: '2027-05', dates: ['2027-05-04'] },
        adminToken,
      );
      expect(trpcError(wrongJob).message).toMatch(/Only apprentice employees/);

      const wrongMonth = await harness.trpcMutation(
        'employee.declareSchoolDays',
        { employeeId: apprenticeId, month: '2027-05', dates: ['2027-06-04'] },
        adminToken,
      );
      expect(trpcError(wrongMonth).code).toBe('BAD_REQUEST');
    });

    // AC7 — self-service scoping.
    it('lets an apprentice declare only for themselves', async () => {
      const apprenticeToken = signAccessToken(harness, {
        sub: apprenticeUserId,
        email: apprenticeEmail,
        role: 'EMPLOYEE',
        clinicId: clinic.clinicId,
      });

      const own = await harness.trpcMutation(
        'employee.declareSchoolDays',
        { employeeId: apprenticeId, month: '2027-05', dates: ['2027-05-04'] },
        apprenticeToken,
      );
      expect(trpcData<unknown[]>(own)).toHaveLength(1);

      const other = trpcData<EmployeeRow>(
        await createEmployee({
          lastName: 'Other',
          jobType: 'APPRENTICE',
          contractType: 'APPRENTICESHIP',
        }),
      );
      const foreign = await harness.trpcMutation(
        'employee.declareSchoolDays',
        { employeeId: other.id, month: '2027-05', dates: ['2027-05-04'] },
        apprenticeToken,
      );
      expect(trpcError(foreign).code).toBe('FORBIDDEN');
    });

    it('lists apprentices who have not declared yet', async () => {
      const undeclared = trpcData<Array<{ id: string }>>(
        await harness.trpcQuery(
          'employee.listUndeclaredApprentices',
          { month: '2027-05' },
          adminToken,
        ),
      );
      expect(undeclared.map((a) => a.id)).toContain(apprenticeId);

      await harness.trpcMutation(
        'employee.declareSchoolDays',
        { employeeId: apprenticeId, month: '2027-05', dates: ['2027-05-04'] },
        adminToken,
      );

      const after = trpcData<Array<{ id: string }>>(
        await harness.trpcQuery(
          'employee.listUndeclaredApprentices',
          { month: '2027-05' },
          adminToken,
        ),
      );
      expect(after.map((a) => a.id)).not.toContain(apprenticeId);
    });
  });

  // ── absences (Story 7-3) ───────────────────────────────────────────────

  describe('absences', () => {
    let employeeId: string;
    let employeeUserId: string;
    let employeeEmail: string;
    let employeeToken: string;

    beforeEach(async () => {
      employeeEmail = uniqueEmail('it-absentee');
      const created = trpcData<EmployeeRow>(
        await createEmployee({
          firstName: 'Ada',
          lastName: 'Away',
          email: employeeEmail,
        }),
      );
      employeeId = created.id;
      employeeUserId = created.userId!;
      employeeToken = signAccessToken(harness, {
        sub: employeeUserId,
        email: employeeEmail,
        role: 'EMPLOYEE',
        clinicId: clinic.clinicId,
      });
      harness.mailbox.reset();
    });

    const request = (
      overrides: Record<string, unknown> = {},
      token = employeeToken,
    ) =>
      harness.trpcMutation(
        'employee.createAbsenceRequest',
        {
          employeeId,
          type: 'PAID_LEAVE',
          startDate: ISO('2027-07-05'),
          endDate: ISO('2027-07-09'),
          reason: 'Summer',
          ...overrides,
        },
        token,
      );

    // AC3.
    it('creates a PENDING request and notifies the clinic admin', async () => {
      const created = trpcData<{
        id: string;
        status: string;
        clinicId: string;
      }>(await request());
      expect(created.status).toBe('PENDING');
      expect(created.clinicId).toBe(clinic.clinicId);

      const mail = await waitForMail(
        harness,
        (m) =>
          m.type === 'sendAbsenceRequestNotification' &&
          m.to === clinic.adminEmail,
      );
      expect(mail.args).toContain('Ada Away');
    });

    // AC5.
    it('approves a request, creates the blocking unavailability and tells the employee', async () => {
      const created = trpcData<{ id: string }>(await request());
      harness.mailbox.reset();

      const approved = trpcData<{
        status: string;
        reviewedBy: string;
        reviewedAt: string;
      }>(
        await harness.trpcMutation(
          'employee.reviewAbsence',
          { absenceId: created.id, action: 'approve' },
          adminToken,
        ),
      );
      expect(approved.status).toBe('APPROVED');
      expect(approved.reviewedBy).toBe(clinic.adminId);
      expect(approved.reviewedAt).not.toBeNull();

      const unavailabilities = await harness.prisma.unavailability.findMany({
        where: { employeeId, reason: 'Approved absence request' },
      });
      expect(unavailabilities).toHaveLength(1);
      // PAID_LEAVE maps onto the VACATION unavailability type.
      expect(unavailabilities[0].type).toBe('VACATION');
      expect(unavailabilities[0].startDate.toISOString()).toBe(
        ISO('2027-07-05'),
      );

      const mail = await waitForMail(
        harness,
        (m) =>
          m.type === 'sendAbsenceReviewNotification' && m.to === employeeEmail,
      );
      expect(mail.args).toContain('APPROVED');
    });

    // AC6.
    it('rejects with a reason, notifies, and blocks nothing', async () => {
      const created = trpcData<{ id: string }>(await request());
      harness.mailbox.reset();

      const rejected = trpcData<{ status: string; rejectionReason: string }>(
        await harness.trpcMutation(
          'employee.reviewAbsence',
          {
            absenceId: created.id,
            action: 'reject',
            rejectionReason: 'Understaffed that week',
          },
          adminToken,
        ),
      );
      expect(rejected.status).toBe('REJECTED');
      expect(rejected.rejectionReason).toBe('Understaffed that week');

      expect(
        await harness.prisma.unavailability.count({ where: { employeeId } }),
      ).toBe(0);

      const mail = await waitForMail(
        harness,
        (m) =>
          m.type === 'sendAbsenceReviewNotification' && m.to === employeeEmail,
      );
      expect(mail.args).toContain('REJECTED');
      expect(mail.args).toContain('Understaffed that week');
    });

    it('requires a reason to reject and refuses to review twice', async () => {
      const created = trpcData<{ id: string }>(await request());

      const noReason = await harness.trpcMutation(
        'employee.reviewAbsence',
        { absenceId: created.id, action: 'reject' },
        adminToken,
      );
      expect(trpcError(noReason).code).toBe('BAD_REQUEST');

      trpcData(
        await harness.trpcMutation(
          'employee.reviewAbsence',
          { absenceId: created.id, action: 'approve' },
          adminToken,
        ),
      );
      const again = await harness.trpcMutation(
        'employee.reviewAbsence',
        { absenceId: created.id, action: 'approve' },
        adminToken,
      );
      expect(trpcError(again).message).toMatch(/already reviewed/);
    });

    // AC10.
    it('keeps employees inside their own requests', async () => {
      const mine = trpcData<{ id: string }>(await request());

      const colleague = trpcData<EmployeeRow>(
        await createEmployee({ firstName: 'Colleague', lastName: 'Doe' }),
      );
      const onBehalf = await request({ employeeId: colleague.id });
      expect(trpcError(onBehalf).code).toBe('FORBIDDEN');

      const review = await harness.trpcMutation(
        'employee.reviewAbsence',
        { absenceId: mine.id, action: 'approve' },
        employeeToken,
      );
      expect(trpcError(review).code).toBe('FORBIDDEN');

      // An admin-created absence for the colleague must not show up in the
      // employee's own list.
      trpcData(
        await harness.trpcMutation(
          'employee.adminCreateAbsence',
          {
            employeeId: colleague.id,
            type: 'TRAINING',
            startDate: ISO('2027-08-02'),
            endDate: ISO('2027-08-03'),
          },
          adminToken,
        ),
      );

      const mineOnly = trpcData<Array<{ id: string; employeeId: string }>>(
        await harness.trpcQuery('employee.listAbsences', {}, employeeToken),
      );
      expect(mineOnly.every((a) => a.employeeId === employeeId)).toBe(true);
      expect(mineOnly.map((a) => a.id)).toEqual([mine.id]);

      const adminSees = trpcData<Array<{ id: string }>>(
        await harness.trpcQuery('employee.listAbsences', {}, adminToken),
      );
      expect(adminSees.length).toBe(2);
    });

    // AC9.
    it('lets an admin book an absence that is approved on the spot', async () => {
      const created = trpcData<{
        id: string;
        status: string;
        reviewedBy: string;
      }>(
        await harness.trpcMutation(
          'employee.adminCreateAbsence',
          {
            employeeId,
            type: 'SICK_LEAVE',
            startDate: ISO('2027-09-01'),
            endDate: ISO('2027-09-02'),
          },
          adminToken,
        ),
      );
      expect(created.status).toBe('APPROVED');
      expect(created.reviewedBy).toBe(clinic.adminId);

      const unavailabilities = await harness.prisma.unavailability.findMany({
        where: { employeeId },
      });
      expect(unavailabilities).toHaveLength(1);
      expect(unavailabilities[0].type).toBe('SICK');

      await waitForMail(
        harness,
        (m) =>
          m.type === 'sendAbsenceReviewNotification' && m.to === employeeEmail,
      );

      const forbidden = await harness.trpcMutation(
        'employee.adminCreateAbsence',
        {
          employeeId,
          type: 'SICK_LEAVE',
          startDate: ISO('2027-10-01'),
          endDate: ISO('2027-10-02'),
        },
        employeeToken,
      );
      expect(trpcError(forbidden).code).toBe('FORBIDDEN');
    });

    // AC8 — the overlap probe the form calls before submitting.
    it('reports an overlap against an approved absence', async () => {
      const clean = trpcData<{ hasOverlap: boolean }>(
        await harness.trpcQuery(
          'employee.checkAbsenceOverlap',
          {
            employeeId,
            startDate: ISO('2027-07-05'),
            endDate: ISO('2027-07-09'),
          },
          adminToken,
        ),
      );
      expect(clean.hasOverlap).toBe(false);

      const created = trpcData<{ id: string }>(await request());
      trpcData(
        await harness.trpcMutation(
          'employee.reviewAbsence',
          { absenceId: created.id, action: 'approve' },
          adminToken,
        ),
      );

      const overlapping = trpcData<{ hasOverlap: boolean }>(
        await harness.trpcQuery(
          'employee.checkAbsenceOverlap',
          {
            employeeId,
            startDate: ISO('2027-07-08'),
            endDate: ISO('2027-07-12'),
          },
          adminToken,
        ),
      );
      expect(overlapping.hasOverlap).toBe(true);
    });

    it('filters the admin list by status and by employee', async () => {
      const first = trpcData<{ id: string }>(await request());
      trpcData(
        await harness.trpcMutation(
          'employee.reviewAbsence',
          { absenceId: first.id, action: 'reject', rejectionReason: 'No' },
          adminToken,
        ),
      );
      const second = trpcData<{ id: string }>(
        await request({
          startDate: ISO('2027-11-01'),
          endDate: ISO('2027-11-02'),
        }),
      );

      const pending = trpcData<Array<{ id: string }>>(
        await harness.trpcQuery(
          'employee.listAbsences',
          { status: 'PENDING' },
          adminToken,
        ),
      );
      expect(pending.map((a) => a.id)).toEqual([second.id]);

      const byEmployee = trpcData<Array<{ id: string }>>(
        await harness.trpcQuery(
          'employee.listAbsences',
          { employeeId },
          adminToken,
        ),
      );
      expect(byEmployee).toHaveLength(2);

      const count = trpcData<number>(
        await harness.trpcQuery(
          'employee.countPendingAbsences',
          undefined,
          adminToken,
        ),
      );
      expect(count).toBe(1);
    });
  });
});
