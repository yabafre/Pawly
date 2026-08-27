import { createTestHarness, login, type TestHarness } from './harness';

const SEED = {
  adminEmail: 'admin@pawly.local',
  adminPassword: 'Admin123!',
  employeeEmail: 'employee@pawly.local',
};

describe('API harness (integration)', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('signs the seeded admin in and returns a usable token', async () => {
    const token = await login(harness, SEED.adminEmail, SEED.adminPassword);
    expect(token).toEqual(expect.any(String));

    const profile = await harness
      .http()
      .get('/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(profile.body.email).toBe(SEED.adminEmail);
  });

  it('rejects a tRPC mutation that arrives without the CSRF header', async () => {
    await harness
      .http()
      .post('/trpc/employee.list')
      .send({ json: {} })
      .expect(403);
  });

  it('captures the OTP mail instead of sending it', async () => {
    harness.mailbox.reset();
    await harness.http().post('/auth/otp/request').send({ email: SEED.employeeEmail }).expect(201);

    const otp = harness.mailbox.read().find((m) => m.type === 'sendOtpCode');
    expect(otp?.to).toBe(SEED.employeeEmail);
    expect(otp?.code).toMatch(/^\d{6}$/);
  });
});
