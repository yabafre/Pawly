# Story: 11-6-transactional-amendment-cache-coherence — Transactional Amendment Flow & Cache Coherence

**Epic:** Epic 11 — Planning Engine Hardening & Compliance
**Status:** review
**Branch:** feature/KON-123-11-6-transactional-amendment-cache-coherence
**Ticket:** KON-123 (Linear · project Pawly · milestone Epic 11 · blocked-by KON-118)
**Origin:** Multi-agent planning audit 2026-07-08 — reliability gap (MAJOR): the amendment flow is non-transactional (`shift.update`/`create`/`delete` → `recordAmendment` → `notify` run outside a transaction) and the router throws before Redis invalidation, leaving `schedule:*` stale. See `docs/epics-context/epic-11-context.md` § 0 (11-6 line) and § 4 anchor map.

> **Read first:** `docs/epics-context/epic-11-context.md` — audit synthesis, file:line anchors, and the cross-cutting invariants every Epic 11 story MUST preserve. Line numbers below were re-verified against this branch during authoring (11-1 + 11-2 already shifted the audit's original anchors); **re-locate the symbol, do not trust the number blindly.**

> **Invariant #5 (epic-context § 3):** _"The correct transactional pattern already exists — generalize it, don't reinvent. `confirmPresence` is the model."_ This story applies that shape to the three amendment paths. It does **not** add advisory locks or move the PUBLISHED re-check inside the transaction — full anti-TOCTOU / concurrency serialization is the explicit scope of **11-5** (KON-122). Locked with Alex during authoring.

## User Story

**As an** admin user, **I want** an acknowledged amendment (move / create / delete) to apply atomically and invalidate stale caches, **so that** a partial failure never leaves a changed shift without its amendment record or notification, and an employee never opens a stale schedule after I change it.

## Acceptance Criteria

1. **Given** an admin makes an acknowledged change to a published month — moving, creating, or deleting a shift — **When** the change is applied but its amendment bookkeeping cannot be written, **Then** the shift change is rolled back in full: the schedule is never left holding a moved, created, or deleted shift that has no matching amendment record.
2. **Given** an acknowledged change to a published month, **When** it is rolled back, **Then** no "schedule changed" notification is sent to any employee; **and When** it succeeds, **Then** each affected employee is notified exactly once and a notification-delivery failure neither fails nor blocks the change.
3. **Given** any operation that changes a month's shifts — a single move/create/delete or a bulk regenerate/purge — **When** the operation runs, whether it succeeds or fails partway, **Then** the clinic's schedule caches are invalidated, so the next read of that schedule never returns a stale version.
4. **Given** the cache store is unavailable at the moment a shift change completes, **When** invalidation is attempted, **Then** the change's result (or its error) is returned to the admin unchanged, and any stale cached schedule self-heals within one cache lifetime (≤ 30 s).
5. **Given** a shift is moved on a published month, **When** the affected employee re-opens their schedule, **Then** it shows the shift at its new date/employee with its prior confirmation cleared, and no stale copy of the old schedule survives.

**FRs covered:** FR6, FR10. **NFRs:** NFR3 (no silent failure), NFR6 (tenancy preserved — every query/cache key scoped by `clinicId`).

> **Ticket-AC mapping (mechanism → Tasks):** KON-123 specifies "both execute inside a single interactive `$transaction` (tx passed through)" (→ Tasks 1–2, service), "the router's Redis `schedule:*` invalidations run in a `try/finally`" (→ Tasks 3–4, router), "reflects the change within one cache TTL, with no stale `isConfirmed` or `schedule:*` entry" (→ AC5, preserved 7.6 behaviour + AC3/AC4 invalidation). Scope decisions locked with Alex during authoring: **try/finally applied to all 5 shift-mutation procedures** (the 2 bulk ones dedupe onto the same helper); **PUBLISHED re-check stays outside the tx** (advisory-lock TOCTOU is 11-5's scope).

## Tasks

- [x] **Task 1: [RED] Add the transactional-amendment service specs + default `$transaction` passthrough mock** [AC: 1, 2]

  **1a.** In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, add a default interactive-transaction mock to the **top-level** `beforeEach`. Anchor on the existing default (near the end of the `beforeEach`, lines ~266–269):
  ```ts
    // Story 7.6 — default to DRAFT (no published month) so mutation tests
    // that don't opt into the published-change flow behave as before.
    mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);
    mockPrismaService.planningPeriodStatus.updateMany.mockResolvedValue({
      count: 0,
    });
  ```
  and replace it with (append the `$transaction` default):
  ```ts
    // Story 7.6 — default to DRAFT (no published month) so mutation tests
    // that don't opt into the published-change flow behave as before.
    mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);
    mockPrismaService.planningPeriodStatus.updateMany.mockResolvedValue({
      count: 0,
    });
    // Story 11-6 — default interactive-tx mock: run the callback with the base
    // mock as the tx client, so amendment paths (move/create/delete) exercise
    // tx.shift.* + tx.planningPeriodStatus.updateMany against the same mocks.
    // generateMonthlyPlan / deleteGeneratedShifts tests override this with a
    // bespoke tx where they assert on tx.shift.deleteMany / createManyAndReturn.
    mockPrismaService.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrismaService) => Promise<unknown>) =>
        fn(mockPrismaService),
    );
  ```

  **1b.** In the same file, add a new `describe` block immediately **after** the `describe('Story 7.6 — post-publication change management', …)` block closes (find its closing `  });` — it is the last amendment-focused block; insert the new block right after it, before the next top-level `describe`):
  ```ts
  // ─── Story 11-6 — transactional amendment & cache coherence ───────
  describe('Story 11-6 — transactional amendment', () => {
    const publishedStatus = { month: '2026-07' };
    const julyShift = {
      id: 'shift-pub',
      clinicId: 'clinic-123',
      employeeId: 'emp-1',
      date: new Date('2026-07-10T00:00:00.000Z'),
      startTime: '08:00',
      endTime: '12:00',
      shiftTypeCode: 'SURGERY',
      breakMinutes: 0,
      source: 'GENERATED',
      isConfirmed: true,
    };

    beforeEach(() => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        publishedStatus,
      ]);
      mockPrismaService.clinic.findUniqueOrThrow.mockResolvedValue({
        name: 'Test Clinic',
      });
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          firstName: 'Alice',
          email: 'alice@example.com',
          user: { locale: 'fr' },
        },
        {
          id: 'emp-2',
          firstName: 'Bob',
          email: 'bob@example.com',
          user: { locale: 'en' },
        },
      ]);
    });

    // AC1 + AC2 — moveShift: mutation + recordAmendment share ONE transaction,
    // notify fires AFTER commit.
    it('moveShift wraps shift.update + recordAmendment in one $transaction and notifies after commit', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue(julyShift);
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployees[1]);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.shift.update.mockResolvedValue({
        ...julyShift,
        date: new Date('2026-07-20T00:00:00.000Z'),
        source: 'MANUAL',
        isConfirmed: false,
      });

      await service.moveShift(
        clinicId,
        julyShift.id,
        { targetDate: '2026-07-20' },
        { acknowledgePublishedChange: true },
      );

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.shift.update).toHaveBeenCalled();
      expect(
        mockPrismaService.planningPeriodStatus.updateMany,
      ).toHaveBeenCalledWith({
        where: { clinicId, month: { in: ['2026-07'] }, status: 'PUBLISHED' },
        data: { amendedAt: expect.any(Date), amendmentCount: { increment: 1 } },
      });
      await new Promise((r) => setImmediate(r));
      expect(mockMailService.sendScheduleChangedEmail).toHaveBeenCalled();
    });

    // AC1 — rollback safety: recordAmendment failing inside the tx rejects the
    // whole call and emits NO notification.
    it('moveShift rejects and does not notify when recordAmendment fails inside the transaction', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue(julyShift);
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployees[1]);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.shift.update.mockResolvedValue({
        ...julyShift,
        date: new Date('2026-07-20T00:00:00.000Z'),
        source: 'MANUAL',
        isConfirmed: false,
      });
      mockPrismaService.planningPeriodStatus.updateMany.mockRejectedValueOnce(
        new Error('amend failed'),
      );

      await expect(
        service.moveShift(
          clinicId,
          julyShift.id,
          { targetDate: '2026-07-20' },
          { acknowledgePublishedChange: true },
        ),
      ).rejects.toThrow('amend failed');

      await new Promise((r) => setImmediate(r));
      expect(mockMailService.sendScheduleChangedEmail).not.toHaveBeenCalled();
    });

    // AC1 — createManualShift wraps create + recordAmendment in one $transaction.
    it('createManualShift wraps shift.create + recordAmendment in one $transaction', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployees[0]);
      mockPrismaService.clinicShiftType.findFirst.mockResolvedValue({
        id: 'st-1',
        code: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 0,
        clinicId,
      });
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.shift.create.mockResolvedValue({
        id: 'new-shift',
        date: new Date('2026-07-10T00:00:00.000Z'),
        startTime: '08:00',
        endTime: '12:00',
        shiftTypeCode: 'SURGERY',
        breakMinutes: 0,
        source: 'MANUAL',
        employeeId: 'emp-1',
        isConfirmed: false,
        clinicId,
      });

      await service.createManualShift(clinicId, {
        employeeId: 'emp-1',
        date: '2026-07-10',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 0,
        acknowledgePublishedChange: true,
      });

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.shift.create).toHaveBeenCalled();
      expect(
        mockPrismaService.planningPeriodStatus.updateMany,
      ).toHaveBeenCalled();
    });

    // AC1 — deleteShift wraps delete + recordAmendment in one $transaction;
    // rollback on amendment failure emits no notification.
    it('deleteShift wraps shift.delete + recordAmendment in one $transaction and does not notify on rollback', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue(julyShift);
      mockPrismaService.shift.delete.mockResolvedValue(julyShift);
      mockPrismaService.planningPeriodStatus.updateMany.mockRejectedValueOnce(
        new Error('amend failed'),
      );

      await expect(
        service.deleteShift(clinicId, julyShift.id, {
          acknowledgePublishedChange: true,
        }),
      ).rejects.toThrow('amend failed');

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      await new Promise((r) => setImmediate(r));
      expect(mockMailService.sendScheduleChangedEmail).not.toHaveBeenCalled();
    });
  });
  ```

  Run: `pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec"`
  Expected: **RED** — the three `expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1)` assertions fail (`Expected 1, Received 0`) because the amendment paths do not yet use `$transaction`. All pre-existing tests in the file stay green.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-123): pin transactional amendment contract for move/create/delete (RED)"`

- [x] **Task 2: [GREEN] Thread the amendment writes through a single interactive `$transaction`** [AC: 1, 2, 5]

  All edits are in `apps/api/src/modules/planning/planning-generation.service.ts`.

  **2a — Import the `Prisma` namespace.** Anchor on the import block head (lines 1–10):
  ```ts
  import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
  } from '@nestjs/common';
  import { PrismaService } from '@/prisma/prisma.service';
  ```
  Replace with (add the `@prisma/client` import right after `PrismaService`):
  ```ts
  import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
  } from '@nestjs/common';
  import { PrismaService } from '@/prisma/prisma.service';
  import { Prisma } from '@prisma/client';
  ```

  **2b — Make `recordAmendment` accept a transaction client.** Replace the current method (lines ~1962–1971):
  ```ts
    private async recordAmendment(
      clinicId: string,
      months: string[],
    ): Promise<void> {
      if (months.length === 0) return;
      await this.prisma.planningPeriodStatus.updateMany({
        where: { clinicId, month: { in: months }, status: 'PUBLISHED' },
        data: { amendedAt: new Date(), amendmentCount: { increment: 1 } },
      });
    }
  ```
  with:
  ```ts
    // Story 11-6 — accepts the active transaction client (or `this.prisma`) so
    // the amendment bookkeeping commits atomically with the shift mutation.
    private async recordAmendment(
      tx: Prisma.TransactionClient,
      clinicId: string,
      months: string[],
    ): Promise<void> {
      if (months.length === 0) return;
      await tx.planningPeriodStatus.updateMany({
        where: { clinicId, month: { in: months }, status: 'PUBLISHED' },
        data: { amendedAt: new Date(), amendmentCount: { increment: 1 } },
      });
    }
  ```

  **2c — Wrap `moveShift`'s mutation + amendment in one transaction.** Replace the block (lines ~2122–2148) that starts with `const updated = await this.prisma.shift.update({` and ends at the closing `}` of the `if (publishedMonths.length > 0 && (employeeChanged || dateChanged)) { … }` block:
  ```ts
      const updated = await this.prisma.shift.update({
        where: { id: shiftId },
        data: {
          ...(target.targetEmployeeId && { employeeId: target.targetEmployeeId }),
          ...(target.targetDate && {
            date: new Date(`${target.targetDate}T00:00:00.000Z`),
          }),
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
          this.logger.error(
            `schedule-change notification failed: ${err.message}`,
          ),
        );
      }
  ```
  with:
  ```ts
      // Story 11-6 — the shift mutation and the amendment bookkeeping commit
      // atomically. If recordAmendment throws, shift.update rolls back, so a
      // moved shift can never be left without its amendment record. Notification
      // fires AFTER commit (below), so a rolled-back change never notifies.
      const amend =
        publishedMonths.length > 0 && (employeeChanged || dateChanged);
      const updated = await this.prisma.$transaction(async (tx) => {
        const u = await tx.shift.update({
          where: { id: shiftId },
          data: {
            ...(target.targetEmployeeId && {
              employeeId: target.targetEmployeeId,
            }),
            ...(target.targetDate && {
              date: new Date(`${target.targetDate}T00:00:00.000Z`),
            }),
            source: 'MANUAL',
            // Story 7.6 — a moved shift is no longer the one the employee confirmed
            ...((employeeChanged || dateChanged) && { isConfirmed: false }),
          },
        });
        if (amend) {
          await this.recordAmendment(tx, clinicId, publishedMonths);
        }
        return u;
      });

      // Story 7.6 — post-commit notification (published months only), fire-and-forget
      if (amend) {
        const updatedMonth = updated.date.toISOString().split('T')[0].slice(0, 7);
        const recipients = [
          { employeeId: originalEmployeeId, month: originalMonth },
          { employeeId: updated.employeeId, month: updatedMonth },
        ].filter((r) => publishedMonths.includes(r.month));
        this.notifyScheduleChange(clinicId, recipients).catch((err: Error) =>
          this.logger.error(
            `schedule-change notification failed: ${err.message}`,
          ),
        );
      }
  ```

  **2d — Wrap `createManualShift`'s create + amendment in one transaction.** Replace the block (lines ~2260–2283) starting with `const created = await this.prisma.shift.create({` through the closing `}` of the `if (publishedMonths.length > 0) { … }` block:
  ```ts
      const created = await this.prisma.shift.create({
        data: {
          date: new Date(`${input.date}T00:00:00.000Z`),
          startTime: shiftType.startTime,
          endTime: shiftType.endTime,
          shiftTypeCode: input.shiftTypeCode,
          breakMinutes: shiftType.breakMinutes,
          source: 'MANUAL',
          employeeId: input.employeeId,
          clinicId,
        },
      });

      // Story 7.6 — amendment tracking + notification (published month only)
      if (publishedMonths.length > 0) {
        await this.recordAmendment(clinicId, publishedMonths);
        this.notifyScheduleChange(clinicId, [
          { employeeId: created.employeeId, month },
        ]).catch((err: Error) =>
          this.logger.error(
            `schedule-change notification failed: ${err.message}`,
          ),
        );
      }
  ```
  with:
  ```ts
      // Story 11-6 — create + amendment commit atomically; notify post-commit.
      const created = await this.prisma.$transaction(async (tx) => {
        const c = await tx.shift.create({
          data: {
            date: new Date(`${input.date}T00:00:00.000Z`),
            startTime: shiftType.startTime,
            endTime: shiftType.endTime,
            shiftTypeCode: input.shiftTypeCode,
            breakMinutes: shiftType.breakMinutes,
            source: 'MANUAL',
            employeeId: input.employeeId,
            clinicId,
          },
        });
        if (publishedMonths.length > 0) {
          await this.recordAmendment(tx, clinicId, publishedMonths);
        }
        return c;
      });

      // Story 7.6 — post-commit notification (published month only), fire-and-forget
      if (publishedMonths.length > 0) {
        this.notifyScheduleChange(clinicId, [
          { employeeId: created.employeeId, month },
        ]).catch((err: Error) =>
          this.logger.error(
            `schedule-change notification failed: ${err.message}`,
          ),
        );
      }
  ```

  **2e — Wrap `deleteShift`'s delete + amendment in one transaction.** Replace the block (lines ~2322–2333) starting with `await this.prisma.shift.delete({ where: { id: shiftId } });` through the closing `}` of the `if (publishedMonths.length > 0) { … }` block (stop **before** `return { deleted: true };`):
  ```ts
      await this.prisma.shift.delete({ where: { id: shiftId } });

      if (publishedMonths.length > 0) {
        await this.recordAmendment(clinicId, publishedMonths);
        this.notifyScheduleChange(clinicId, [
          { employeeId: shift.employeeId, month },
        ]).catch((err: Error) =>
          this.logger.error(
            `schedule-change notification failed: ${err.message}`,
          ),
        );
      }
  ```
  with:
  ```ts
      // Story 11-6 — delete + amendment commit atomically; notify post-commit.
      await this.prisma.$transaction(async (tx) => {
        await tx.shift.delete({ where: { id: shiftId } });
        if (publishedMonths.length > 0) {
          await this.recordAmendment(tx, clinicId, publishedMonths);
        }
      });

      if (publishedMonths.length > 0) {
        this.notifyScheduleChange(clinicId, [
          { employeeId: shift.employeeId, month },
        ]).catch((err: Error) =>
          this.logger.error(
            `schedule-change notification failed: ${err.message}`,
          ),
        );
      }
  ```

  **2f — Point the two bulk callers at `this.prisma`.** After 2c–2e, the only remaining occurrences of the old 2-argument form are the two bulk paths (`generateMonthlyPlan` ~line 585, `deleteGeneratedShifts` ~line 1609). Replace **all** remaining occurrences of:
  ```ts
        await this.recordAmendment(clinicId, publishedMonths);
  ```
  with:
  ```ts
        await this.recordAmendment(this.prisma, clinicId, publishedMonths);
  ```
  (There must be exactly **2** left after 2c–2e; both are the bulk paths and keep their existing post-mutation behaviour — 11-1's semantics are unchanged.)

  Run: `pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec"`
  Expected: **GREEN** — the Story 11-6 block passes (`$transaction` called once per amendment; notify only after commit; rollback emits no notification) and every pre-existing test (`moveShift`, `createManualShift`, `deleteShift`, `Story 7.6`, `generateMonthlyPlan`, `deleteGeneratedShifts`) stays green. `Tests: … passed`, exit 0.
  Typecheck: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json` → exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "fix(KON-123): commit shift mutation + recordAmendment in one transaction (GREEN)"`

- [x] **Task 3: [RED] Add router specs proving cache invalidation survives a handler throw** [AC: 3, 4]

  In `apps/api/src/trpc/routers/planning.router.spec.ts`, add a new `describe` block. Insert it immediately **before** the final closing `});` of the top-level `describe('planningRouter', …)` (i.e. as the last nested block in the file):
  ```ts
  // ─── Story 11-6 — shift-mutation cache coherence (try/finally) ─────
  describe('Story 11-6 — shift-mutation cache coherence', () => {
    const SHIFT_ID = '11111111-1111-4111-8111-111111111111';
    const EMP_ID = '22222222-2222-4222-8222-222222222222';
    const TPL_ID = '33333333-3333-4333-8333-333333333333';

    const makeRedis = () => ({
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
      del: jest.fn(),
      invalidatePattern: jest.fn(),
      incr: jest.fn().mockResolvedValue(1),
      isAvailable: false,
    });

    const callerWith = (redis: ReturnType<typeof makeRedis>) => {
      mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);
      return createCaller({
        user: authenticatedAdmin,
        prisma: mockPrisma as any,
        redis: redis as any,
        planningService: mockPlanningService as any,
        planningTemplateService: mockPlanningTemplateService as any,
        equityCounterService: mockEquityCounterService as any,
        planningGenerationService: mockPlanningGenerationService as any,
        apprenticeDeclarationService: mockApprenticeDeclarationService as any,
      } as any);
    };

    it('moveShift invalidates schedule caches after a successful move', async () => {
      mockPlanningGenerationService.moveShift.mockResolvedValue({ id: SHIFT_ID });
      const redis = makeRedis();
      const caller = callerWith(redis);

      await caller.moveShift({ shiftId: SHIFT_ID, targetEmployeeId: EMP_ID });

      expect(redis.invalidatePattern).toHaveBeenCalledWith(
        'schedule:clinic-123:*',
      );
      expect(redis.invalidatePattern).toHaveBeenCalledWith(
        'planning:pub:clinic-123:*',
      );
      expect(redis.del).toHaveBeenCalledWith('dashboard:stats:clinic-123');
    });

    it('moveShift still invalidates schedule caches when the service throws (try/finally)', async () => {
      mockPlanningGenerationService.moveShift.mockRejectedValue(
        new Error('recordAmendment failed'),
      );
      const redis = makeRedis();
      const caller = callerWith(redis);

      await expect(
        caller.moveShift({ shiftId: SHIFT_ID, targetEmployeeId: EMP_ID }),
      ).rejects.toThrow('recordAmendment failed');
      expect(redis.invalidatePattern).toHaveBeenCalledWith(
        'schedule:clinic-123:*',
      );
      expect(redis.del).toHaveBeenCalledWith('dashboard:stats:clinic-123');
    });

    it('createManualShift still invalidates schedule caches when the service throws', async () => {
      mockPlanningGenerationService.createManualShift.mockRejectedValue(
        new Error('boom'),
      );
      const redis = makeRedis();
      const caller = callerWith(redis);

      await expect(
        caller.createManualShift({
          employeeId: EMP_ID,
          date: '2026-07-10',
          shiftTypeCode: 'SURGERY',
          startTime: '08:00',
          endTime: '12:00',
        }),
      ).rejects.toThrow('boom');
      expect(redis.invalidatePattern).toHaveBeenCalledWith(
        'schedule:clinic-123:*',
      );
    });

    it('deleteShift still invalidates schedule caches when the service throws', async () => {
      mockPlanningGenerationService.deleteShift.mockRejectedValue(
        new Error('boom'),
      );
      const redis = makeRedis();
      const caller = callerWith(redis);

      await expect(caller.deleteShift({ shiftId: SHIFT_ID })).rejects.toThrow(
        'boom',
      );
      expect(redis.invalidatePattern).toHaveBeenCalledWith(
        'schedule:clinic-123:*',
      );
    });

    it('generatePlan still invalidates schedule caches when the service throws (bulk path)', async () => {
      mockPlanningGenerationService.generateMonthlyPlan.mockRejectedValue(
        new Error('boom'),
      );
      const redis = makeRedis();
      const caller = callerWith(redis);

      await expect(
        caller.generatePlan({ month: '2026-07', templateId: TPL_ID }),
      ).rejects.toThrow('boom');
      expect(redis.invalidatePattern).toHaveBeenCalledWith(
        'schedule:clinic-123:*',
      );
    });

    it('a Redis failure during invalidation does not mask a successful mutation', async () => {
      mockPlanningGenerationService.deleteShift.mockResolvedValue({
        deleted: true,
      });
      const redis = makeRedis();
      redis.invalidatePattern.mockRejectedValue(new Error('redis down'));
      const caller = callerWith(redis);

      await expect(caller.deleteShift({ shiftId: SHIFT_ID })).resolves.toEqual({
        deleted: true,
      });
    });
  });
  ```

  Run: `pnpm --filter @pawly/api test -- --testPathPatterns "planning.router.spec"`
  Expected: **RED** — the four "still invalidates … when the service throws" tests fail (the current handler runs invalidation *after* the service call, so on a throw `redis.invalidatePattern` is never called), and "a Redis failure … does not mask" fails (the un-guarded `await redis.invalidatePattern` currently rejects into the caller). The two success-path assertions pass.
  Commit: `git add apps/api/src/trpc/routers/planning.router.spec.ts && git commit -m "test(KON-123): pin try/finally cache invalidation on shift mutations (RED)"`

- [x] **Task 4: [GREEN] Add the `invalidateScheduleCaches` helper + `try/finally` on all 5 shift-mutation procedures** [AC: 3, 4]

  All edits are in `apps/api/src/trpc/routers/planning.router.ts`.

  **4a — Import `Logger`.** Replace the import head (lines 1–4):
  ```ts
  import { TRPCError } from '@trpc/server';
  import type { EquityCounterType } from '@prisma/client';
  import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';
  import { TIER_HIERARCHY } from '@pawly/validators';
  ```
  with:
  ```ts
  import { Logger } from '@nestjs/common';
  import { TRPCError } from '@trpc/server';
  import type { EquityCounterType } from '@prisma/client';
  import { publicProcedure, router, isAuthed, isSubscribed } from '../trpc';
  import { TIER_HIERARCHY } from '@pawly/validators';
  ```

  **4b — Add the helper.** Insert this block immediately **after** the `requireProfessional` helper closes (after its closing `};`, before `export const planningRouter = router({`):
  ```ts
  // Story 11-6 — best-effort schedule cache invalidation. Runs in a `finally` on
  // every shift-mutation procedure so a stale `schedule:*` / `planning:pub:*` /
  // `dashboard:stats` entry is never left behind when the handler throws
  // mid-way. Swallows its own Redis errors: a failed invalidation self-heals
  // within the 30s getScheduleView TTL and must never mask the handler result.
  const planningRouterLogger = new Logger('PlanningRouter');

  const invalidateScheduleCaches = async (
    redis: {
      invalidatePattern: (pattern: string) => Promise<unknown>;
      del: (key: string) => Promise<unknown>;
    },
    clinicId: string,
  ): Promise<void> => {
    try {
      await redis.invalidatePattern(`schedule:${clinicId}:*`);
      await redis.invalidatePattern(`planning:pub:${clinicId}:*`);
      await redis.del(`dashboard:stats:${clinicId}`);
    } catch (err) {
      planningRouterLogger.error(
        `schedule cache invalidation failed for clinic ${clinicId}: ${
          (err as Error).message
        }`,
      );
    }
  };
  ```

  **4c — `generatePlan`.** Replace (lines ~229–243):
  ```ts
    generatePlan: subscribedProcedure
      .input(generatePlanSchema)
      .mutation(async ({ input, ctx }) => {
        adminOnly(ctx.user.role);
        const result = await ctx.planningGenerationService.generateMonthlyPlan(
          ctx.user.clinicId,
          input.month,
          input.templateId,
          { acknowledgePublishedChange: input.acknowledgePublishedChange },
        );
        await ctx.redis.invalidatePattern(`schedule:${ctx.user.clinicId}:*`);
        await ctx.redis.invalidatePattern(`planning:pub:${ctx.user.clinicId}:*`);
        await ctx.redis.del(`dashboard:stats:${ctx.user.clinicId}`);
        return result;
      }),
  ```
  with:
  ```ts
    generatePlan: subscribedProcedure
      .input(generatePlanSchema)
      .mutation(async ({ input, ctx }) => {
        adminOnly(ctx.user.role);
        try {
          return await ctx.planningGenerationService.generateMonthlyPlan(
            ctx.user.clinicId,
            input.month,
            input.templateId,
            { acknowledgePublishedChange: input.acknowledgePublishedChange },
          );
        } finally {
          await invalidateScheduleCaches(ctx.redis, ctx.user.clinicId);
        }
      }),
  ```

  **4d — `deleteGeneratedShifts`.** Replace (lines ~255–268):
  ```ts
    deleteGeneratedShifts: subscribedProcedure
      .input(deleteGeneratedShiftsSchema)
      .mutation(async ({ input, ctx }) => {
        adminOnly(ctx.user.role);
        const result = await ctx.planningGenerationService.deleteGeneratedShifts(
          ctx.user.clinicId,
          input.month,
          { acknowledgePublishedChange: input.acknowledgePublishedChange },
        );
        await ctx.redis.invalidatePattern(`schedule:${ctx.user.clinicId}:*`);
        await ctx.redis.invalidatePattern(`planning:pub:${ctx.user.clinicId}:*`);
        await ctx.redis.del(`dashboard:stats:${ctx.user.clinicId}`);
        return result;
      }),
  ```
  with:
  ```ts
    deleteGeneratedShifts: subscribedProcedure
      .input(deleteGeneratedShiftsSchema)
      .mutation(async ({ input, ctx }) => {
        adminOnly(ctx.user.role);
        try {
          return await ctx.planningGenerationService.deleteGeneratedShifts(
            ctx.user.clinicId,
            input.month,
            { acknowledgePublishedChange: input.acknowledgePublishedChange },
          );
        } finally {
          await invalidateScheduleCaches(ctx.redis, ctx.user.clinicId);
        }
      }),
  ```

  **4e — `moveShift`.** Replace (lines ~291–308):
  ```ts
    moveShift: subscribedProcedure
      .input(moveShiftInputSchema)
      .mutation(async ({ input, ctx }) => {
        adminOnly(ctx.user.role);
        const result = await ctx.planningGenerationService.moveShift(
          ctx.user.clinicId,
          input.shiftId,
          {
            targetEmployeeId: input.targetEmployeeId,
            targetDate: input.targetDate,
          },
          { acknowledgePublishedChange: input.acknowledgePublishedChange },
        );
        await ctx.redis.invalidatePattern(`schedule:${ctx.user.clinicId}:*`);
        await ctx.redis.invalidatePattern(`planning:pub:${ctx.user.clinicId}:*`);
        await ctx.redis.del(`dashboard:stats:${ctx.user.clinicId}`);
        return result;
      }),
  ```
  with:
  ```ts
    moveShift: subscribedProcedure
      .input(moveShiftInputSchema)
      .mutation(async ({ input, ctx }) => {
        adminOnly(ctx.user.role);
        try {
          return await ctx.planningGenerationService.moveShift(
            ctx.user.clinicId,
            input.shiftId,
            {
              targetEmployeeId: input.targetEmployeeId,
              targetDate: input.targetDate,
            },
            { acknowledgePublishedChange: input.acknowledgePublishedChange },
          );
        } finally {
          await invalidateScheduleCaches(ctx.redis, ctx.user.clinicId);
        }
      }),
  ```

  **4f — `createManualShift`.** Replace (lines ~310–322):
  ```ts
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
  ```
  with:
  ```ts
    createManualShift: subscribedProcedure
      .input(createManualShiftInputSchema)
      .mutation(async ({ input, ctx }) => {
        adminOnly(ctx.user.role);
        try {
          return await ctx.planningGenerationService.createManualShift(
            ctx.user.clinicId,
            input,
          );
        } finally {
          await invalidateScheduleCaches(ctx.redis, ctx.user.clinicId);
        }
      }),
  ```

  **4g — `deleteShift`.** Replace (lines ~324–337):
  ```ts
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
  with:
  ```ts
    deleteShift: subscribedProcedure
      .input(deleteShiftInputSchema)
      .mutation(async ({ input, ctx }) => {
        adminOnly(ctx.user.role);
        try {
          return await ctx.planningGenerationService.deleteShift(
            ctx.user.clinicId,
            input.shiftId,
            { acknowledgePublishedChange: input.acknowledgePublishedChange },
          );
        } finally {
          await invalidateScheduleCaches(ctx.redis, ctx.user.clinicId);
        }
      }),
  ```

  Run: `pnpm --filter @pawly/api test -- --testPathPatterns "planning.router.spec"`
  Expected: **GREEN** — all six Story 11-6 router tests pass, and the existing "should export all 31 procedures" + auth/subscription guard tests stay green. `Tests: … passed`, exit 0.
  Typecheck: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json` → exit 0.
  Commit: `git add apps/api/src/trpc/routers/planning.router.ts && git commit -m "fix(KON-123): invalidate schedule caches in try/finally on shift mutations (GREEN)"`

- [x] **Task 5: [GATE] Full API suite + typecheck, then final commit** [AC: 1, 2, 3, 4, 5]

  Run the whole API test suite and the type declaration pass (per **L5** — the `tsconfig.types.json` step is load-bearing for `@pawly/api/trpc-types`):
  ```bash
  pnpm --filter @pawly/api test
  pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json
  ```
  Expected: full API suite green (no regressions in `planning-generation.service.spec`, `planning.router.spec`, `presence-confirmation.service.spec`), exit 0 on both. (Baseline before this story: 870 API tests green — expect ≥ that plus the ~10 added here.)
  Commit (only if the two prior GREEN commits were not already made per-task; otherwise this is a no-op): `git status` — if clean, nothing to commit. If any doc/state changes remain: `git add docs/ && git commit -m "chore(KON-123): story 11-6 ready-for-dev"`

## Dev Notes

### Architecture

- **Data flow (non-negotiable):** `Page (RSC) → Client → Hook → Zsa → Server Action → tRPC Client → NestJS Service → Prisma`. This story touches only the **tRPC router** (cache invalidation shape) and the **NestJS service** (transaction shape). No web/FE changes — the FE already invalidates via React Query on the mutation's `onSuccess` and re-reads `getScheduleView`.
- **Reference pattern to generalize (epic-context invariant #5):** `apps/api/src/modules/planning/presence-confirmation.service.ts:98` — `confirmPresence` does all guards **before** the transaction, then `this.prisma.$transaction(async (tx) => { … })` with `tx.*` writes. This story mirrors that: overlap / statutory / published-change guards stay **before** the `$transaction`; only the mutation + `recordAmendment` go inside.
- **Redis (epic-context § 6):** `schedule:{clinicId}:{month}` is set with a **30 s** TTL by `getScheduleView` (`planning.router.ts:286`); `planning:pub:*` and `dashboard:stats:*` are the sibling keys the amendment path already invalidated. A best-effort invalidation miss self-heals within that 30 s window — hence AC4's swallow-and-log is safe.
- **Deliberately out of scope (11-5 owns it):** `pg_advisory_xact_lock`, moving the `PUBLISHED` re-check inside the tx, and `fetchWithRetry` mutation retries. Do **not** add advisory locks or a TOCTOU re-check here — that is KON-122's design and would collide with it.

### Existing code at write time (Step-0 verbatim quotes)

**Modified file 1 — `apps/api/src/modules/planning/planning-generation.service.ts`**

`recordAmendment` (lines ~1962–1971, current) — the amendment write, currently on `this.prisma` and called *outside* any transaction:
```ts
  private async recordAmendment(
    clinicId: string,
    months: string[],
  ): Promise<void> {
    if (months.length === 0) return;
    await this.prisma.planningPeriodStatus.updateMany({
      where: { clinicId, month: { in: months }, status: 'PUBLISHED' },
      data: { amendedAt: new Date(), amendmentCount: { increment: 1 } },
    });
  }
```
Called from **5 sites**: `generateMonthlyPlan` (~585, bulk, post-`$transaction`), `deleteGeneratedShifts` (~1609, bulk), `moveShift` (~2142), `createManualShift` (~2275), `deleteShift` (~2325). After this story: signature is `(tx, clinicId, months)`; bulk sites pass `this.prisma`; amendment sites pass the interactive `tx`. The full current bodies of the three amendment blocks are quoted inline in Tasks 2c/2d/2e (the exact anchors for the find/replace).

`notifyScheduleChange` (lines ~1978–2041) is **unchanged** — it stays a fire-and-forget, post-commit side effect (`.catch(logger.error)`), and already de-dupes recipients and skips null-email employees for email while still push-notifying them.

**Modified file 2 — `apps/api/src/modules/planning/planning-generation.service.spec.ts`**: top-level `beforeEach` currently ends by defaulting `planningPeriodStatus.findMany → []` and `updateMany → {count:0}` (quoted in Task 1a). `$transaction` is declared as a bare `jest.fn()` (line ~182) with no default implementation; `generateMonthlyPlan` tests set a bespoke `$transaction.mockImplementation` per-test (e.g. line ~326). The fire-and-forget notify is flushed with `await new Promise((r) => setImmediate(r))` before asserting emails (existing 7.6 pattern — reused here).

**Modified file 3 — `apps/api/src/trpc/routers/planning.router.ts`**: the five shift-mutation procedures each `await` the service, then run three un-guarded `await ctx.redis.*` invalidations, then `return result` (the exact current bodies are quoted inline in Tasks 4c–4g). Import head currently has no `@nestjs/common` import.

**Modified file 4 — `apps/api/src/trpc/routers/planning.router.spec.ts`**: `createAdminCaller()` builds a fresh inline `redis` mock per call and does not expose it — so the new cache tests build their own `callerWith(redis)` around a captured `makeRedis()` mock (Task 3). `mockPrisma`, `activeSubscription`, `authenticatedAdmin`, and the service mocks (`mockPlanningGenerationService`, etc.) are already defined at the top of the top-level `describe`.

### File decision map (3-bullet per file)

- **`apps/api/src/modules/planning/planning-generation.service.ts`** (MODIFY)
  - _Responsibility:_ make the three amendment paths commit their shift mutation + amendment record atomically; keep notification post-commit.
  - _Inputs/outputs:_ imports `Prisma` from `@prisma/client`; `recordAmendment(tx, clinicId, months)`; `moveShift`/`createManualShift`/`deleteShift` return shapes unchanged (`ScheduleShift` / `{ deleted: true }`).
- **`apps/api/src/modules/planning/planning-generation.service.spec.ts`** (MODIFY)
  - _Responsibility:_ pin the transaction contract (1 `$transaction` per amendment, notify only after commit, no notify on rollback) and keep the existing amendment/generation suites green via the default passthrough `$transaction` mock.
  - _Inputs/outputs:_ Jest; asserts on `mockPrismaService.$transaction`, `planningPeriodStatus.updateMany`, `mockMailService.sendScheduleChangedEmail`.
- **`apps/api/src/trpc/routers/planning.router.ts`** (MODIFY)
  - _Responsibility:_ guarantee schedule-cache invalidation on every shift mutation, even on a handler throw, without letting a Redis failure mask the result.
  - _Inputs/outputs:_ adds `Logger` + `invalidateScheduleCaches(redis, clinicId)`; wraps 5 procedures in `try/finally`; procedure return values unchanged.
- **`apps/api/src/trpc/routers/planning.router.spec.ts`** (MODIFY)
  - _Responsibility:_ prove invalidation runs on success and on service-throw, and that a Redis failure does not mask a successful mutation.
  - _Inputs/outputs:_ Jest + `createCallerFactory`; captures a `makeRedis()` mock via `callerWith`.

### Testing

- **API:** Jest, `*.spec.ts`.
  - Targeted: `pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec"` and `… "planning.router.spec"`.
  - Full gate: `pnpm --filter @pawly/api test`.
  - Fire-and-forget `notifyScheduleChange` is flushed with `await new Promise((r) => setImmediate(r))` before asserting on `sendScheduleChangedEmail` (existing 7.6 pattern).
  - The default `$transaction` passthrough mock (Task 1a) runs the callback with `mockPrismaService` as `tx`, so `tx.shift.*` and `tx.planningPeriodStatus.updateMany` resolve to the same mocks the existing tests already configure — no per-test tx wiring needed for the amendment paths.
- **Typecheck:** `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json`. Per **L5**, the `apps/api` build also runs `tsc -p tsconfig.types.json` for `@pawly/api/trpc-types` — do not skip a clean typecheck.
- **No FE / validators changes** — schemas and hooks are untouched (the `acknowledgePublishedChange` flags already exist from 7.6/11-1).
- **L2 / L-audit — real-journey verification (do at review, not just unit):** on a PUBLISHED month, move a confirmed shift with acknowledgement, then re-open `getScheduleView` and confirm the moved shift shows fresh (no stale `schedule:*`) and `isConfirmed` is `false`; separately, confirm a mid-transaction failure leaves **no** shift moved without an amendment row. Planning-grid drag is **keyboard** (dnd-kit), not pointer, for any E2E.

### Dependencies

- No new libraries. `Prisma.TransactionClient` is a type from the already-installed `@prisma/client`; `this.prisma` (a `PrismaService extends PrismaClient`) is structurally assignable to it, so the bulk callers pass `this.prisma` with no cast.
- Per **L4** (epic-context § 5): the interactive-transaction callback form and `Prisma.TransactionClient` typing were the load-bearing SDK details — if anything about `$transaction((tx) => …)` isolation or the deny-list type is unclear during dev, consult Context7 (`/prisma/docs`, "interactive transactions") and record the source in the Dev Agent Record.
- Depends on **11-1** (KON-118, done): `assertPublishedChangeAcknowledged` + `recordAmendment` + `notifyScheduleChange` and the `acknowledgePublishedChange` flags are all in place; this story only changes *how* the mutation and `recordAmendment` are sequenced (atomically) and *where* the router invalidates (in `finally`).

## File List

**Modify (backend):**
- `apps/api/src/modules/planning/planning-generation.service.ts` — `Prisma` import; `recordAmendment(tx, …)`; wrap move/create/delete in `$transaction`; 2 bulk callers pass `this.prisma`.
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` — default `$transaction` passthrough mock; `Story 11-6 — transactional amendment` describe.
- `apps/api/src/trpc/routers/planning.router.ts` — `Logger` import; `invalidateScheduleCaches` helper; `try/finally` on the 5 shift-mutation procedures.
- `apps/api/src/trpc/routers/planning.router.spec.ts` — `Story 11-6 — shift-mutation cache coherence` describe.

**Create:** none.

## Dev Agent Record

- **Model:** claude-opus-4-8[1m]
- **Started:** 2026-07-10
- **Completed:** 2026-07-10T13:38:57Z

### Summary

Applied the `confirmPresence` transactional pattern (epic-context invariant #5) to the
three amendment paths and hardened cache invalidation on all five shift-mutation
procedures — exactly per the story blueprint, no scope drift.

- **Service (`planning-generation.service.ts`):** `recordAmendment` now takes the active
  `Prisma.TransactionClient`. `moveShift` / `createManualShift` / `deleteShift` wrap their
  shift mutation + `recordAmendment` in one interactive `this.prisma.$transaction`, so a
  failing amendment rolls the mutation back; `notifyScheduleChange` moved AFTER commit
  (fire-and-forget), so a rolled-back change never notifies. The two bulk callers
  (`generateMonthlyPlan`, `deleteGeneratedShifts`) pass `this.prisma` — 11-1 semantics
  unchanged. PUBLISHED re-check stays outside the tx (11-5's scope, as locked).
- **Router (`planning.router.ts`):** added `invalidateScheduleCaches(redis, clinicId)` (a
  swallow-and-log helper) and wrapped all 5 mutation procedures in `try { return await … }
  finally { invalidateScheduleCaches(…) }`, so `schedule:*` / `planning:pub:*` /
  `dashboard:stats` are invalidated even when the handler throws, and a Redis outage during
  invalidation never masks the handler result (AC4 self-heal within the 30s TTL).

### Files changed

- `apps/api/src/modules/planning/planning-generation.service.ts` — `Prisma` import;
  `recordAmendment(tx, …)`; move/create/delete wrapped in `$transaction`; 2 bulk callers → `this.prisma`.
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` — default `$transaction`
  passthrough mock; `Story 11-6 — transactional amendment` describe (4 tests).
- `apps/api/src/trpc/routers/planning.router.ts` — `Logger` import; `invalidateScheduleCaches`
  helper; `try/finally` on the 5 shift-mutation procedures.
- `apps/api/src/trpc/routers/planning.router.spec.ts` — `Story 11-6 — shift-mutation cache
  coherence` describe (6 tests).

### Deviations

- **None to the implementation.** All find/replace anchors matched the branch verbatim (re-located
  each symbol first, per the story warning); `recordAmendment` left exactly 2 bulk call-sites as required.
- **Pre-existing typecheck debt surfaced (out of scope, NOT introduced here).** The story's Task 2/5
  ask for `tsc --noEmit -p tsconfig.json` → exit 0. On a fresh worktree this pass reports **24
  pre-existing errors** in four unrelated spec files — `clinic.service.spec.ts`,
  `employee.service.spec.ts`, `planning.service.spec.ts`, `variance.service.spec.ts` (validator
  page/pageSize/locale + `EquityCounterType` enum mismatches). Proven pre-existing: cold `tsc`
  with vs. without this story's edits yields **byte-identical** error sets (`diff` → identical);
  **zero** errors in any of this story's four files. These were never gated — SWC build does no
  typecheck, jest runs `isolatedModules`, and the deploy declaration pass `tsc -p tsconfig.types.json`
  only includes `src/trpc-types.ts` (which passes clean, exit 0, with these changes). Left untouched
  to respect the story's File List; flagged for the Lead to route to a separate cleanup story.
- **Worktree bootstrap:** fresh worktree needed `pnpm install`, `@pawly/{validators,types}` dist
  build, and `prisma generate` before tests/typecheck ran (expected per epic-11 dev gotchas + L5).

### Test output

- **Task 1 RED:** `planning-generation.service.spec` → 3 failed (the three
  `$transaction toHaveBeenCalledTimes(1)`, Expected 1 / Received 0), 147 passed.
- **Task 2 GREEN:** `planning-generation.service.spec` → **150 passed / 150**.
- **Task 3 RED:** `planning.router.spec` → 5 failed (4× throw-invalidation + Redis-mask), 79 passed.
- **Task 4 GREEN:** `planning.router.spec` → **84 passed / 84**.
- **Task 5 GATE:** full API suite → **33 suites, 901 tests passed, exit 0** (baseline 870 + Epic-11
  additions incl. the 10 new here). Deploy typecheck `tsc -p tsconfig.types.json` → **exit 0**.
  Full `tsc -p tsconfig.json` → 24 pre-existing errors (see Deviations); none in story files.
