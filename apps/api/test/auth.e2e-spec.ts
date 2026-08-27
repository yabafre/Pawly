/**
 * The REST authentication surface, end to end against the real database.
 *
 * Stories 1-2 (JWT + magic link backend), 1-5 (clinicId resolved from the user
 * record, never from the request) and 10-1 (admin password reset).
 *
 * Everything here goes through HTTP: tokens are read out of captured mails the
 * way a browser would read them out of an inbox, and the only Prisma use is
 * arranging state a public endpoint cannot reach (an expired token, an OTP
 * already at its attempt ceiling).
 */
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'node:crypto';
import { createTestHarness, type TestHarness } from './harness';
import {
  SEED,
  resetThrottle,
  trpcData,
  trpcError,
  uniqueEmail,
  makeClinic,
  type ClinicFixture,
} from './helpers';

const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');
const rawToken = () => crypto.randomBytes(32).toString('hex');

/** Pulls `?token=` out of a captured mail URL. */
const tokenFromUrl = (url: string | undefined): string => {
  if (!url) throw new Error('Captured mail carries no URL');
  return new URL(url).searchParams.get('token')!;
};

describe('Auth REST surface (integration)', () => {
  let harness: TestHarness;
  let clinic: ClinicFixture;

  beforeAll(async () => {
    harness = await createTestHarness();
    clinic = await makeClinic(harness);
  });

  afterAll(async () => {
    await clinic.cleanup();
    await harness.close();
  });

  beforeEach(() => {
    resetThrottle(harness);
    harness.mailbox.reset();
  });

  // ── POST /auth/login ───────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('issues an access/refresh pair and never echoes the password back', async () => {
      const res = await harness
        .http()
        .post('/auth/login')
        .send({ email: SEED.adminEmail, password: SEED.adminPassword })
        .expect(201);

      expect(res.body.access_token).toEqual(expect.any(String));
      expect(res.body.refresh_token).toEqual(expect.any(String));
      expect(res.body.user.email).toBe(SEED.adminEmail);
      expect(res.body.user).not.toHaveProperty('password');
    });

    // Story 1-5 AC3 — the JWT carries the clinicId resolved from the user row;
    // the client never supplies it.
    it('resolves clinicId from the user record into the JWT payload', async () => {
      const res = await harness
        .http()
        .post('/auth/login')
        .send({ email: clinic.adminEmail, password: clinic.adminPassword })
        .expect(201);

      const payload = harness.app
        .get(JwtService)
        .decode(res.body.access_token) as {
        sub: string;
        email: string;
        role: string;
        clinicId: string;
        exp: number;
        iat: number;
      };

      expect(payload.clinicId).toBe(clinic.clinicId);
      expect(payload.sub).toBe(clinic.adminId);
      expect(payload.role).toBe('ADMIN');
      // Story 1-2 AC5 — access token lives at most 24h.
      expect(payload.exp - payload.iat).toBeLessThanOrEqual(24 * 60 * 60);
    });

    // Story 1-2 AC5 — refresh tokens are opaque, stored hashed, 7-day TTL.
    it('stores the refresh token as a hash with a 7-day expiry', async () => {
      const res = await harness
        .http()
        .post('/auth/login')
        .send({ email: clinic.adminEmail, password: clinic.adminPassword })
        .expect(201);

      const stored = await harness.prisma.refreshToken.findUnique({
        where: { tokenHash: sha256(res.body.refresh_token) },
      });

      expect(stored).not.toBeNull();
      expect(stored!.userId).toBe(clinic.adminId);
      expect(stored!.revokedAt).toBeNull();
      const ttlDays = (stored!.expiresAt.getTime() - Date.now()) / 86_400_000;
      expect(ttlDays).toBeGreaterThan(6.9);
      expect(ttlDays).toBeLessThanOrEqual(7.01);
    });

    it('answers a wrong password and an unknown email with the same 401 body', async () => {
      const wrongPassword = await harness
        .http()
        .post('/auth/login')
        .send({ email: clinic.adminEmail, password: 'WrongPassword1!' })
        .expect(401);

      resetThrottle(harness);

      const unknownEmail = await harness
        .http()
        .post('/auth/login')
        .send({ email: uniqueEmail('it-nobody'), password: 'WrongPassword1!' })
        .expect(401);

      // Anti-enumeration: identical code and wording, nothing that hints the
      // account exists.
      expect(wrongPassword.body.error.code).toBe('UNAUTHORIZED');
      expect(wrongPassword.body.error.message).toBe('Invalid credentials');
      expect(unknownEmail.body.error.code).toBe(wrongPassword.body.error.code);
      expect(unknownEmail.body.error.message).toBe(
        wrongPassword.body.error.message,
      );
    });

    /**
     * `validateUser` compares against a dummy bcrypt hash when no user matches,
     * so an unknown email costs the same as a wrong password. Medians over five
     * samples each, because a single pair is dominated by scheduler noise.
     */
    it('does not leak account existence through response timing', async () => {
      const sample = async (email: string): Promise<number> => {
        resetThrottle(harness);
        const start = Date.now();
        await harness
          .http()
          .post('/auth/login')
          .send({ email, password: 'WrongPassword1!' })
          .expect(401);
        return Date.now() - start;
      };

      const median = (values: number[]) =>
        [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

      const known: number[] = [];
      const unknown: number[] = [];
      for (let i = 0; i < 5; i += 1) {
        known.push(await sample(clinic.adminEmail));
        unknown.push(await sample(uniqueEmail('it-nobody')));
      }

      const knownMedian = median(known);
      const unknownMedian = median(unknown);
      // Generous on purpose: the claim is "no usable signal", not "identical".
      expect(Math.abs(knownMedian - unknownMedian)).toBeLessThan(150);
    });

    it('rejects a malformed body before touching the database', async () => {
      await harness
        .http()
        .post('/auth/login')
        .send({ email: 'not-an-email', password: 'x' })
        .expect(400);
      await harness
        .http()
        .post('/auth/login')
        .send({ email: SEED.adminEmail })
        .expect(400);
    });

    it('throttles brute force at 5 attempts per minute', async () => {
      const attempt = () =>
        harness
          .http()
          .post('/auth/login')
          .send({ email: clinic.adminEmail, password: 'WrongPassword1!' });

      for (let i = 0; i < 5; i += 1) {
        expect((await attempt()).status).toBe(401);
      }
      expect((await attempt()).status).toBe(429);
    });
  });

  // ── Magic link ─────────────────────────────────────────────────────────

  describe('magic link', () => {
    // Story 1-2 AC1 + AC2.
    it('stores a hashed 15-minute token and mails the raw one', async () => {
      const before = Date.now();
      const res = await harness
        .http()
        .post('/auth/magic-link/request')
        .send({ email: SEED.employeeEmail })
        .expect(201);

      expect(res.body.message).toBe(
        'If an account exists, a magic link has been sent',
      );

      const mail = harness.mailbox
        .read()
        .find((m) => m.type === 'sendMagicLink');
      expect(mail?.to).toBe(SEED.employeeEmail);

      const token = tokenFromUrl(mail?.url);
      expect(token).toMatch(/^[a-f0-9]{64}$/);

      // The raw token is never persisted — only its SHA-256.
      expect(
        await harness.prisma.magicLink.findUnique({ where: { token } }),
      ).toBeNull();
      const stored = await harness.prisma.magicLink.findUnique({
        where: { token: sha256(token) },
      });
      expect(stored).not.toBeNull();
      expect(stored!.used).toBe(false);
      const ttlMinutes = (stored!.expiresAt.getTime() - before) / 60_000;
      expect(ttlMinutes).toBeGreaterThan(14);
      expect(ttlMinutes).toBeLessThanOrEqual(15.1);
    });

    // Story 1-2 AC4 — single use.
    it('completes the handshake once and refuses the token afterwards', async () => {
      await harness
        .http()
        .post('/auth/magic-link/request')
        .send({ email: SEED.employeeEmail })
        .expect(201);
      const token = tokenFromUrl(
        harness.mailbox.read().find((m) => m.type === 'sendMagicLink')?.url,
      );

      const first = await harness
        .http()
        .get('/auth/magic-link/callback')
        .query({ token })
        .expect(200);
      expect(first.body.access_token).toEqual(expect.any(String));
      expect(first.body.user.email).toBe(SEED.employeeEmail);

      resetThrottle(harness);
      await harness
        .http()
        .get('/auth/magic-link/callback')
        .query({ token })
        .expect(401);
    });

    it('refuses an expired token', async () => {
      const token = rawToken();
      const user = await harness.prisma.user.findUniqueOrThrow({
        where: { email: SEED.employeeEmail },
      });
      await harness.prisma.magicLink.create({
        data: {
          token: sha256(token),
          expiresAt: new Date(Date.now() - 60_000),
          userId: user.id,
          clinicId: user.clinicId,
        },
      });

      await harness
        .http()
        .get('/auth/magic-link/callback')
        .query({ token })
        .expect(401);
    });

    it('answers an unknown email identically and sends nothing', async () => {
      const res = await harness
        .http()
        .post('/auth/magic-link/request')
        .send({ email: uniqueEmail('it-nobody') })
        .expect(201);

      expect(res.body.message).toBe(
        'If an account exists, a magic link has been sent',
      );
      expect(harness.mailbox.read()).toHaveLength(0);
    });

    it('rejects a token that is not 64 hex characters', async () => {
      await harness
        .http()
        .get('/auth/magic-link/callback')
        .query({ token: 'nope' })
        .expect(400);
    });
  });

  // ── OTP ────────────────────────────────────────────────────────────────

  describe('OTP', () => {
    let otpEmail: string;
    let otpUserId: string;

    beforeEach(async () => {
      otpEmail = uniqueEmail('it-otp');
      const user = await harness.prisma.user.create({
        data: { email: otpEmail, role: 'EMPLOYEE', clinicId: clinic.clinicId },
      });
      otpUserId = user.id;
    });

    afterEach(async () => {
      await harness.prisma.user
        .delete({ where: { id: otpUserId } })
        .catch(() => {});
    });

    it('mails a 6-digit code and stores only its HMAC', async () => {
      const res = await harness
        .http()
        .post('/auth/otp/request')
        .send({ email: otpEmail })
        .expect(201);

      expect(res.body.method).toBe('otp');

      const mail = harness.mailbox.read().find((m) => m.type === 'sendOtpCode');
      expect(mail?.to).toBe(otpEmail);
      expect(mail?.code).toMatch(/^\d{6}$/);

      const stored = await harness.prisma.otpCode.findFirst({
        where: { userId: otpUserId },
      });
      expect(stored).not.toBeNull();
      expect(stored!.code).not.toBe(mail!.code);
      expect(stored!.attempts).toBe(0);
      const ttlMinutes = (stored!.expiresAt.getTime() - Date.now()) / 60_000;
      expect(ttlMinutes).toBeGreaterThan(4);
      expect(ttlMinutes).toBeLessThanOrEqual(5.1);
    });

    it('exchanges the correct code for a token pair and burns the code', async () => {
      await harness
        .http()
        .post('/auth/otp/request')
        .send({ email: otpEmail })
        .expect(201);
      const code = harness.mailbox
        .read()
        .find((m) => m.type === 'sendOtpCode')!.code!;

      resetThrottle(harness);
      const res = await harness
        .http()
        .post('/auth/otp/verify')
        .send({ email: otpEmail, code })
        .expect(201);
      expect(res.body.access_token).toEqual(expect.any(String));
      expect(res.body.user.email).toBe(otpEmail);

      resetThrottle(harness);
      await harness
        .http()
        .post('/auth/otp/verify')
        .send({ email: otpEmail, code })
        .expect(401);
    });

    it('rejects a wrong code without burning the code', async () => {
      await harness
        .http()
        .post('/auth/otp/request')
        .send({ email: otpEmail })
        .expect(201);
      const code = harness.mailbox
        .read()
        .find((m) => m.type === 'sendOtpCode')!.code!;
      const wrong = code === '000000' ? '111111' : '000000';

      resetThrottle(harness);
      const res = await harness
        .http()
        .post('/auth/otp/verify')
        .send({ email: otpEmail, code: wrong })
        .expect(401);
      expect(res.body.error.message).toBe('Invalid code');

      const stored = await harness.prisma.otpCode.findFirst({
        where: { userId: otpUserId },
      });
      expect(stored!.used).toBe(false);
    });

    /**
     * PRODUCT BUG — the failed-attempt counter never survives.
     *
     * `AuthService.verifyOtp` increments `otpCode.attempts` inside the same
     * `prisma.$transaction` from which it then throws `UnauthorizedException`.
     * The throw rolls the transaction back, so the increment is discarded and
     * `attempts` stays 0 for every wrong guess. The 5-attempt ceiling and the
     * magic-link fallback that depends on it can therefore never be reached
     * through the API: OTP verification has no lockout at all, only the
     * per-IP throttler.
     *
     * The unit suite misses this because it stubs `$transaction` as a plain
     * callback invoker with no rollback semantics, and only asserts the thrown
     * message.
     *
     * Fix: perform the attempt bookkeeping outside the transaction (or commit
     * it and signal failure by return value rather than by throwing).
     */
    it.failing('counts a failed attempt so the lockout can eventually fire', async () => {
      await harness
        .http()
        .post('/auth/otp/request')
        .send({ email: otpEmail })
        .expect(201);
      const code = harness.mailbox
        .read()
        .find((m) => m.type === 'sendOtpCode')!.code!;
      const wrong = code === '000000' ? '111111' : '000000';

      resetThrottle(harness);
      await harness
        .http()
        .post('/auth/otp/verify')
        .send({ email: otpEmail, code: wrong })
        .expect(401);

      const stored = await harness.prisma.otpCode.findFirst({
        where: { userId: otpUserId },
      });
      expect(stored!.attempts).toBe(1);
    });

    it('rejects an expired code', async () => {
      await harness.prisma.otpCode.create({
        data: {
          code: 'irrelevant-because-it-is-never-reached',
          expiresAt: new Date(Date.now() - 60_000),
          userId: otpUserId,
          clinicId: clinic.clinicId,
        },
      });

      const res = await harness
        .http()
        .post('/auth/otp/verify')
        .send({ email: otpEmail, code: '123456' })
        .expect(401);
      expect(res.body.error.message).toBe('Invalid or expired code');
    });

    it('answers "too many attempts" once the counter sits at the ceiling', async () => {
      await harness
        .http()
        .post('/auth/otp/request')
        .send({ email: otpEmail })
        .expect(201);
      const code = harness.mailbox
        .read()
        .find((m) => m.type === 'sendOtpCode')!.code!;
      const wrong = code === '000000' ? '111111' : '000000';

      // Arranged straight in the database: the counter cannot get here on its
      // own — see the it.failing above.
      await harness.prisma.otpCode.updateMany({
        where: { userId: otpUserId, used: false },
        data: { attempts: 4 },
      });

      resetThrottle(harness);
      const res = await harness
        .http()
        .post('/auth/otp/verify')
        .send({ email: otpEmail, code: wrong })
        .expect(401);
      expect(res.body.error.message).toMatch(/Too many attempts/);
    });

    /**
     * PRODUCT BUG — same rollback as above, one layer up.
     *
     * On the max-attempts path `verifyOtp` marks the code used and stamps
     * `user.otpFallbackUntil`, then throws from inside the transaction. Both
     * writes are rolled back, so the "check your email for a login link"
     * message is a lie: no fallback is armed, the code stays live until it
     * expires, and the next OTP request still answers `method: 'otp'`.
     */
    it.failing(
      'persists the lockout and switches the user to magic-link fallback',
      async () => {
        await harness
          .http()
          .post('/auth/otp/request')
          .send({ email: otpEmail })
          .expect(201);
        const code = harness.mailbox
          .read()
          .find((m) => m.type === 'sendOtpCode')!.code!;
        const wrong = code === '000000' ? '111111' : '000000';

        await harness.prisma.otpCode.updateMany({
          where: { userId: otpUserId, used: false },
          data: { attempts: 4 },
        });

        resetThrottle(harness);
        await harness
          .http()
          .post('/auth/otp/verify')
          .send({ email: otpEmail, code: wrong })
          .expect(401);

        const burned = await harness.prisma.otpCode.findFirst({
          where: { userId: otpUserId },
        });
        expect(burned!.used).toBe(true);

        const user = await harness.prisma.user.findUniqueOrThrow({
          where: { id: otpUserId },
        });
        expect(user.otpFallbackUntil).not.toBeNull();
        expect(user.otpFallbackUntil!.getTime()).toBeGreaterThan(Date.now());
      },
    );

    it('switches to magic link while the user is in fallback', async () => {
      await harness.prisma.user.update({
        where: { id: otpUserId },
        data: { otpFallbackUntil: new Date(Date.now() + 3_600_000) },
      });

      const res = await harness
        .http()
        .post('/auth/otp/request')
        .send({ email: otpEmail })
        .expect(201);
      expect(res.body.method).toBe('magic_link');
      expect(harness.mailbox.read().map((m) => m.type)).toContain('sendMagicLink');
    });

    it('refuses OTP for admin accounts, which must use a password', async () => {
      const res = await harness
        .http()
        .post('/auth/otp/request')
        .send({ email: clinic.adminEmail })
        .expect(401);
      expect(res.body.error.message).toBe('ADMIN_USE_PASSWORD');
    });

    it('answers an unknown email like a known one and sends nothing', async () => {
      const res = await harness
        .http()
        .post('/auth/otp/request')
        .send({ email: uniqueEmail('it-nobody') })
        .expect(201);
      expect(res.body.method).toBe('otp');
      expect(harness.mailbox.read()).toHaveLength(0);
    });
  });

  // ── POST /auth/refresh ─────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    const loginFresh = async () => {
      resetThrottle(harness);
      const res = await harness
        .http()
        .post('/auth/login')
        .send({ email: clinic.adminEmail, password: clinic.adminPassword })
        .expect(201);
      return res.body as { access_token: string; refresh_token: string };
    };

    it('rotates the token and revokes the one just spent', async () => {
      const { refresh_token } = await loginFresh();

      resetThrottle(harness);
      const res = await harness
        .http()
        .post('/auth/refresh')
        .send({ refresh_token })
        .expect(201);

      expect(res.body.refresh_token).not.toBe(refresh_token);
      const spent = await harness.prisma.refreshToken.findUnique({
        where: { tokenHash: sha256(refresh_token) },
      });
      expect(spent!.revokedAt).not.toBeNull();

      const issued = await harness.prisma.refreshToken.findUnique({
        where: { tokenHash: sha256(res.body.refresh_token) },
      });
      // Same family — rotation, not a new session.
      expect(issued!.family).toBe(spent!.family);
      expect(issued!.revokedAt).toBeNull();
    });

    it('treats replay of a spent token as theft and kills the family', async () => {
      const { refresh_token } = await loginFresh();

      resetThrottle(harness);
      const rotated = await harness
        .http()
        .post('/auth/refresh')
        .send({ refresh_token })
        .expect(201);

      resetThrottle(harness);
      const replay = await harness
        .http()
        .post('/auth/refresh')
        .send({ refresh_token })
        .expect(401);
      expect(replay.body.error.message).toMatch(/reuse detected/i);

      const successor = await harness.prisma.refreshToken.findUnique({
        where: { tokenHash: sha256(rotated.body.refresh_token) },
      });
      expect(successor!.revokedAt).not.toBeNull();
    });

    it('rejects a token that was never issued', async () => {
      await harness
        .http()
        .post('/auth/refresh')
        .send({ refresh_token: rawToken() })
        .expect(401);
    });

    it('rejects an expired token', async () => {
      const raw = rawToken();
      await harness.prisma.refreshToken.create({
        data: {
          tokenHash: sha256(raw),
          family: crypto.randomUUID(),
          userId: clinic.adminId,
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      const res = await harness
        .http()
        .post('/auth/refresh')
        .send({ refresh_token: raw })
        .expect(401);
      expect(res.body.error.message).toBe('Refresh token expired');
    });
  });

  // ── POST /auth/activate ────────────────────────────────────────────────

  describe('POST /auth/activate', () => {
    let pendingEmail: string;
    let pendingUserId: string;
    let activationToken: string;

    beforeEach(async () => {
      pendingEmail = uniqueEmail('it-activate');
      const user = await harness.prisma.user.create({
        data: {
          email: pendingEmail,
          role: 'ADMIN',
          clinicId: clinic.clinicId,
          password: null,
        },
      });
      pendingUserId = user.id;
      activationToken = rawToken();
      await harness.prisma.activationToken.create({
        data: {
          token: sha256(activationToken),
          expiresAt: new Date(Date.now() + 3_600_000),
          userId: user.id,
          clinicId: clinic.clinicId,
        },
      });
    });

    afterEach(async () => {
      await harness.prisma.user
        .delete({ where: { id: pendingUserId } })
        .catch(() => {});
    });

    it('sets the password, burns the token and signs the admin in', async () => {
      const res = await harness
        .http()
        .post('/auth/activate')
        .send({ token: activationToken, password: 'Activated123' })
        .expect(201);

      expect(res.body.access_token).toEqual(expect.any(String));
      expect(res.body.user.email).toBe(pendingEmail);

      const used = await harness.prisma.activationToken.findUnique({
        where: { token: sha256(activationToken) },
      });
      expect(used!.used).toBe(true);

      resetThrottle(harness);
      await harness
        .http()
        .post('/auth/login')
        .send({ email: pendingEmail, password: 'Activated123' })
        .expect(201);
    });

    it('refuses a second activation with the same token', async () => {
      await harness
        .http()
        .post('/auth/activate')
        .send({ token: activationToken, password: 'Activated123' })
        .expect(201);

      resetThrottle(harness);
      await harness
        .http()
        .post('/auth/activate')
        .send({ token: activationToken, password: 'Different123' })
        .expect(401);
    });

    it('refuses an expired token', async () => {
      const expired = rawToken();
      await harness.prisma.activationToken.create({
        data: {
          token: sha256(expired),
          expiresAt: new Date(Date.now() - 1000),
          userId: pendingUserId,
          clinicId: clinic.clinicId,
        },
      });

      await harness
        .http()
        .post('/auth/activate')
        .send({ token: expired, password: 'Activated123' })
        .expect(401);
    });

    it('enforces the password policy before looking the token up', async () => {
      await harness
        .http()
        .post('/auth/activate')
        .send({ token: activationToken, password: 'weak' })
        .expect(400);
      await harness
        .http()
        .post('/auth/activate')
        .send({ token: activationToken, password: 'alllowercase1' })
        .expect(400);

      const untouched = await harness.prisma.activationToken.findUnique({
        where: { token: sha256(activationToken) },
      });
      expect(untouched!.used).toBe(false);
    });
  });

  // ── GET /auth/profile ──────────────────────────────────────────────────

  describe('GET /auth/profile', () => {
    it('returns the caller claims for a valid token', async () => {
      resetThrottle(harness);
      const login = await harness
        .http()
        .post('/auth/login')
        .send({ email: clinic.adminEmail, password: clinic.adminPassword })
        .expect(201);

      const res = await harness
        .http()
        .get('/auth/profile')
        .set('Authorization', `Bearer ${login.body.access_token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        sub: clinic.adminId,
        email: clinic.adminEmail,
        role: 'ADMIN',
        clinicId: clinic.clinicId,
      });
    });

    it('rejects a missing, garbled or expired token', async () => {
      await harness.http().get('/auth/profile').expect(401);
      await harness
        .http()
        .get('/auth/profile')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);

      const expired = harness.app.get(JwtService).sign(
        {
          email: clinic.adminEmail,
          sub: clinic.adminId,
          role: 'ADMIN',
          clinicId: clinic.clinicId,
        },
        { expiresIn: '-10s' },
      );
      await harness
        .http()
        .get('/auth/profile')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
    });
  });

  // ── Password reset (Story 10-1) ────────────────────────────────────────
  // Exposed over tRPC rather than REST, so it is driven through the tRPC
  // endpoint the web app actually calls.

  describe('password reset', () => {
    let resetAdminEmail: string;
    let resetAdminId: string;

    beforeEach(async () => {
      resetAdminEmail = uniqueEmail('it-reset');
      const admin = await harness.prisma.user.create({
        data: {
          email: resetAdminEmail,
          role: 'ADMIN',
          clinicId: clinic.clinicId,
          password: await import('bcrypt').then((b) =>
            b.hash('Original123', 10),
          ),
        },
      });
      resetAdminId = admin.id;
    });

    afterEach(async () => {
      await harness.prisma.user
        .delete({ where: { id: resetAdminId } })
        .catch(() => {});
    });

    // AC2, AC3, AC6, AC10.
    it('mails a 1-hour token that swaps the password once', async () => {
      const request = await harness.trpcMutation('auth.requestPasswordReset', {
        email: resetAdminEmail,
      });
      expect(trpcData<{ message: string }>(request).message).toBe(
        'If an account exists, a reset link has been sent',
      );

      const mail = harness.mailbox
        .read()
        .find((m) => m.type === 'sendPasswordResetEmail');
      expect(mail?.to).toBe(resetAdminEmail);
      const token = tokenFromUrl(mail?.url);

      const stored = await harness.prisma.passwordResetToken.findUnique({
        where: { token: sha256(token) },
      });
      const ttlMinutes = (stored!.expiresAt.getTime() - Date.now()) / 60_000;
      expect(ttlMinutes).toBeGreaterThan(55);
      expect(ttlMinutes).toBeLessThanOrEqual(60.1);

      const reset = await harness.trpcMutation('auth.resetPassword', {
        token,
        password: 'Rotated1234',
      });
      expect(trpcData<{ access_token: string }>(reset).access_token).toEqual(
        expect.any(String),
      );

      resetThrottle(harness);
      await harness
        .http()
        .post('/auth/login')
        .send({ email: resetAdminEmail, password: 'Rotated1234' })
        .expect(201);

      // AC7 — the token is single use.
      const replay = await harness.trpcMutation('auth.resetPassword', {
        token,
        password: 'Another1234',
      });
      expect(trpcError(replay).message).toMatch(
        /Invalid or expired reset token/,
      );
    });

    // AC9 — requesting again invalidates the previous token.
    it('invalidates the previous token when a new one is requested', async () => {
      await harness.trpcMutation('auth.requestPasswordReset', {
        email: resetAdminEmail,
      });
      const firstToken = tokenFromUrl(
        harness.mailbox.read().find((m) => m.type === 'sendPasswordResetEmail')
          ?.url,
      );

      harness.mailbox.reset();
      await harness.trpcMutation('auth.requestPasswordReset', {
        email: resetAdminEmail,
      });
      const secondToken = tokenFromUrl(
        harness.mailbox.read().find((m) => m.type === 'sendPasswordResetEmail')
          ?.url,
      );
      expect(secondToken).not.toBe(firstToken);

      const stale = await harness.trpcMutation('auth.resetPassword', {
        token: firstToken,
        password: 'Rotated1234',
      });
      expect(trpcError(stale).message).toMatch(
        /Invalid or expired reset token/,
      );

      const fresh = await harness.trpcMutation('auth.resetPassword', {
        token: secondToken,
        password: 'Rotated1234',
      });
      expect(trpcData<{ access_token: string }>(fresh).access_token).toEqual(
        expect.any(String),
      );
    });

    // AC4 — unknown email and employee (password-less) accounts both get the
    // same answer and no mail.
    it('says the same thing for an unknown email and for a non-admin account', async () => {
      const unknown = await harness.trpcMutation('auth.requestPasswordReset', {
        email: uniqueEmail('it-nobody'),
      });
      expect(trpcData<{ message: string }>(unknown).message).toBe(
        'If an account exists, a reset link has been sent',
      );

      const employee = await harness.trpcMutation('auth.requestPasswordReset', {
        email: SEED.employeeEmail,
      });
      expect(trpcData<{ message: string }>(employee).message).toBe(
        'If an account exists, a reset link has been sent',
      );

      expect(harness.mailbox.read()).toHaveLength(0);
    });
  });
});
