/**
 * Shared plumbing for the integration suites.
 *
 * Two things every suite needs and nothing else provides:
 *   1. a way to read a tRPC envelope without repeating the superjson shape in
 *      every assertion, and
 *   2. a way to stand up an isolated clinic (its own admin, subscription and
 *      employees) so a suite never has to mutate the seed other suites read.
 */
import { ThrottlerStorage } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import type { Response } from 'supertest';
import type { TestHarness } from './harness';

/** The fixtures `prisma/seed.ts` guarantees. */
export const SEED = {
  clinicSlug: 'clinique-zen-dev',
  clinicName: 'Clinique Zen Dev',
  adminEmail: 'admin@pawly.local',
  adminPassword: 'Admin123!',
  employeeEmail: 'employee@pawly.local',
} as const;

// ── tRPC envelope readers ────────────────────────────────────────────────

/** Unwraps a successful tRPC response, failing loudly on the error envelope. */
export function trpcData<T = unknown>(res: Response): T {
  if (res.status !== 200) {
    throw new Error(
      `Expected a successful tRPC response, got ${res.status}: ${JSON.stringify(
        res.body?.error?.json ?? res.body,
      ).slice(0, 400)}`,
    );
  }
  return res.body.result.data.json as T;
}

export interface TrpcError {
  httpStatus: number;
  code: string;
  message: string;
}

/** Unwraps a tRPC error envelope. Fails when the call unexpectedly succeeded. */
export function trpcError(res: Response): TrpcError {
  const err = res.body?.error?.json;
  if (!err) {
    throw new Error(
      `Expected a tRPC error, got ${res.status}: ${JSON.stringify(res.body).slice(0, 400)}`,
    );
  }
  return {
    httpStatus: err.data?.httpStatus ?? res.status,
    code: err.data?.code ?? 'UNKNOWN',
    message: err.message as string,
  };
}

// ── Throttler ────────────────────────────────────────────────────────────

/**
 * The REST auth routes are throttled per IP (login 5/min, magic link and OTP
 * 3/min) and supertest always dials from 127.0.0.1, so a suite exercising more
 * than a handful of auth calls would 429 on itself. Clearing the in-memory
 * store puts each test back at zero — the guard itself still runs, and one
 * test deliberately exhausts it to prove that.
 */
export function resetThrottle(harness: TestHarness): void {
  // Never `storage.clear()`: the service schedules a timer per hit that reads
  // its own entry back, and a cleared Map makes that timer throw from outside
  // any request — an uncaught exception that takes the process down.
  // `resetBlockdRequest` zeroes the counter and cancels those timers.
  const service = harness.app.get(ThrottlerStorage) as unknown as {
    storage: Map<string, { totalHits: Map<string, number> }>;
    resetBlockdRequest(key: string, throttlerName: string): void;
  };
  for (const [key, record] of service.storage) {
    for (const throttlerName of record.totalHits.keys()) {
      service.resetBlockdRequest(key, throttlerName);
    }
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────

let uniqueCounter = 0;

/** Collision-proof across suites, workers and reruns against a warm database. */
export function uniqueEmail(prefix = 'it'): string {
  uniqueCounter += 1;
  return `${prefix}-${Date.now()}-${process.pid}-${uniqueCounter}@example.test`;
}

export function uniqueSlug(prefix = 'it-clinic'): string {
  uniqueCounter += 1;
  return `${prefix}-${Date.now()}-${process.pid}-${uniqueCounter}`;
}

export interface ClinicFixture {
  clinicId: string;
  clinicName: string;
  adminId: string;
  adminEmail: string;
  adminPassword: string;
  /** Deletes the clinic and everything hanging off it. */
  cleanup: () => Promise<void>;
}

export interface MakeClinicOptions {
  name?: string;
  tier?: 'starter' | 'professional' | 'enterprise';
  status?: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';
  /** Skip the Subscription row entirely (to exercise the missing-sub path). */
  withoutSubscription?: boolean;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
}

/**
 * A complete, isolated tenant: clinic + active subscription + admin able to log
 * in over the real `/auth/login`. Suites build on this instead of the seed so
 * they can mutate freely without leaking into their neighbours.
 */
export async function makeClinic(
  harness: TestHarness,
  options: MakeClinicOptions = {},
): Promise<ClinicFixture> {
  const slug = uniqueSlug();
  const name = options.name ?? `IT Clinic ${slug}`;
  const adminPassword = 'Admin123!';
  const adminEmail = uniqueEmail('it-admin');

  const clinic = await harness.prisma.clinic.create({
    data: { name, slug, onboardingCompleted: true },
  });

  if (!options.withoutSubscription) {
    await harness.prisma.subscription.create({
      data: {
        clinicId: clinic.id,
        status: options.status ?? 'active',
        planKey: 'it_plan',
        entitlementTier: options.tier ?? 'starter',
        ...(options.stripeSubscriptionId
          ? { stripeSubscriptionId: options.stripeSubscriptionId }
          : {}),
        ...(options.stripeCustomerId
          ? { stripeCustomerId: options.stripeCustomerId }
          : {}),
      },
    });
  }

  const admin = await harness.prisma.user.create({
    data: {
      email: adminEmail,
      name: 'IT Admin',
      // 12 rounds, exactly like AuthService — a cheaper hash here would make
      // the login-timing assertions measure the fixture instead of the code.
      password: await bcrypt.hash(adminPassword, 12),
      role: 'ADMIN',
      clinicId: clinic.id,
    },
  });

  return {
    clinicId: clinic.id,
    clinicName: name,
    adminId: admin.id,
    adminEmail,
    adminPassword,
    cleanup: () => destroyClinic(harness, clinic.id),
  };
}

/**
 * Shifts point at PlanningTemplate with no cascade of their own, so a bare
 * `clinic.delete` can trip that FK depending on the order Postgres unwinds the
 * cascade. Clearing shifts first makes teardown deterministic.
 */
export async function destroyClinic(
  harness: TestHarness,
  clinicId: string,
): Promise<void> {
  await harness.prisma.shift.deleteMany({ where: { clinicId } });
  await harness.prisma.clinic.delete({ where: { id: clinicId } }).catch(() => {
    /* already gone — teardown is idempotent on purpose */
  });
}

export interface MakeEmployeeOptions {
  clinicId: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  jobType?: 'VET' | 'ASV' | 'APPRENTICE';
  contractHours?: number;
  isActive?: boolean;
  notifyOnPublish?: boolean;
  /** Creates and links a User account (EMPLOYEE role) with the given email. */
  withUser?: boolean;
  /** Link to a User carrying a different email — reproduces legacy drift. */
  userEmail?: string;
}

export interface EmployeeFixture {
  id: string;
  email: string | null;
  userId: string | null;
}

/** Employee straight through Prisma — for arranging, never for asserting. */
export async function makeEmployee(
  harness: TestHarness,
  options: MakeEmployeeOptions,
): Promise<EmployeeFixture> {
  const email =
    options.email === undefined ? uniqueEmail('it-emp') : options.email;
  let userId: string | null = null;

  if (options.withUser || options.userEmail) {
    const user = await harness.prisma.user.create({
      data: {
        email: options.userEmail ?? email!,
        name: `${options.firstName ?? 'Test'} ${options.lastName ?? 'Employee'}`,
        role: 'EMPLOYEE',
        clinicId: options.clinicId,
      },
    });
    userId = user.id;
  }

  const employee = await harness.prisma.employee.create({
    data: {
      firstName: options.firstName ?? 'Test',
      lastName: options.lastName ?? 'Employee',
      email,
      jobType: options.jobType ?? 'ASV',
      contractHours: options.contractHours ?? 35,
      color: '#3b82f6',
      clinicId: options.clinicId,
      isActive: options.isActive ?? true,
      ...(options.notifyOnPublish !== undefined
        ? { notifyOnPublish: options.notifyOnPublish }
        : {}),
      ...(userId ? { userId } : {}),
    },
  });

  return { id: employee.id, email: employee.email, userId: employee.userId };
}

/** Minimal operational config + shift type set a generation run needs. */
export async function makeClinicPlanningSetup(
  harness: TestHarness,
  clinicId: string,
): Promise<{ templateId: string; shiftTypeCode: string }> {
  await harness.prisma.clinicConfig.create({
    data: {
      clinicId,
      workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      defaultStartTime: '08:00',
      defaultEndTime: '19:00',
      is24_7: false,
    },
  });

  await harness.prisma.clinicShiftType.create({
    data: {
      clinicId,
      name: 'Morning',
      code: 'MOR',
      startTime: '08:00',
      endTime: '13:00',
      breakMinutes: 0,
      color: '#22c55e',
    },
  });

  const template = await harness.prisma.planningTemplate.create({
    data: {
      clinicId,
      name: 'IT weekly template',
      data: {
        days: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          dayOfWeek,
          slots: [{ shiftTypeCode: 'MOR', requiredStaff: 1 }],
        })),
      },
    },
  });

  return { templateId: template.id, shiftTypeCode: 'MOR' };
}

/** ISO date (YYYY-MM-DD) of a month's first `dayOfWeek` (1 = Monday). */
export function firstWeekdayOfMonth(month: string, dayOfWeek: number): string {
  const [year, m] = month.split('-').map(Number);
  for (let day = 1; day <= 7; day += 1) {
    const d = new Date(Date.UTC(year, m - 1, day));
    const iso = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    if (iso === dayOfWeek) return d.toISOString().slice(0, 10);
  }
  throw new Error(`No weekday ${dayOfWeek} found in ${month}`);
}

/** A month far enough out that no other suite's fixtures can collide with it. */
export function futureMonth(offsetMonths: number): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1),
  );
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ── Tokens ───────────────────────────────────────────────────────────────

/**
 * Signs an access token with the app's own JwtService and the same claim shape
 * `AuthService.generateToken` produces. Used for EMPLOYEE callers, who have no
 * password and would otherwise need a full OTP round trip per test.
 */
export function signAccessToken(
  harness: TestHarness,
  claims: { sub: string; email: string; role: 'ADMIN' | 'EMPLOYEE'; clinicId: string },
): string {
  // Imported lazily so helpers.ts stays free of Nest imports at module scope.

  const { JwtService } = require('@nestjs/jwt') as typeof import('@nestjs/jwt');
  return harness.app.get(JwtService).sign(claims);
}

// ── Mailbox ──────────────────────────────────────────────────────────────

/**
 * Several notifications are deliberately fire-and-forget (the mutation resolves
 * before the mail leaves), so asserting straight after the response is racy.
 * Polls until the mail lands or the budget runs out.
 */
export async function waitForMail(
  harness: TestHarness,
  predicate: (mail: { type: string; to: string; url?: string; code?: string; args: unknown[] }) => boolean,
  timeoutMs = 5000,
): Promise<{ type: string; to: string; url?: string; code?: string; args: unknown[] }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = harness.mailbox.read().find(predicate);
    if (found) return found;
    if (Date.now() > deadline) {
      throw new Error(
        `No matching mail within ${timeoutMs}ms. Captured: ${JSON.stringify(
          harness.mailbox.read().map((m) => `${m.type}->${m.to}`),
        )}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Gives fire-and-forget work a chance to run before asserting it did NOT happen. */
export async function settle(ms = 400): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
