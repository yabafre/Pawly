# Story: 11-5-idempotent-generation-concurrency-safety — Idempotent Generation & Concurrency Safety

**Epic:** Epic 11 — Planning Engine Hardening & Compliance
**Status:** done
**Branch:** feature/KON-122-11-5-idempotent-generation-concurrency-safety
**Ticket:** KON-122 (Linear · project Pawly · milestone Epic 11 · blocked-by KON-119)
**Origin:** Multi-agent planning audit 2026-07-08 — reliability gap "Retry × non-uniqueness = month duplication". See `docs/epics-context/epic-11-context.md` § 0 ("Retry × non-uniqueness = month duplication") and § 4 (anchor map, row 11-5). Direct continuation of Story 11-2, which added the DB `@@unique([employeeId, date, startTime])` net and explicitly deferred "the runtime `P2002` behaviour under retry + `pg_advisory_xact_lock(clinicId, month)`" to this story.

> **Read first:** `docs/epics-context/epic-11-context.md` — audit synthesis, file:line anchors, and the cross-cutting invariants every Epic 11 story MUST preserve. Line numbers below were re-verified against this branch during authoring (post-11-1/11-2, so they have drifted from the raw audit anchors); **re-locate the symbol, do not trust the number blindly.**

## User Story

**As an** admin, **I want** month generation and publication to be safe under retries and concurrent access, **so that** a reverse-proxy timeout or a double-click can never duplicate an entire month of shifts.

## Acceptance Criteria

1. **Given** a slow month-generation or publication request served behind a reverse proxy, **When** the client or the infrastructure retries the call after a 5xx response or a dropped connection, **Then** a generation/publication request (a mutation) is sent **at most once** — it is never automatically replayed — while read-only requests may still be retried transparently; a transient failure on a mutation surfaces to the admin instead of silently firing the operation a second time.
2. **Given** two generation runs, or a generation and a publication, arriving concurrently for the **same clinic and month**, **When** they execute, **Then** they run one-at-a-time (the second waits for the first to finish) rather than interleaving, so their combined effect is exactly one month's worth of generated shifts and never a doubled month; a transient serialization conflict is recovered automatically without surfacing an error to the admin.
3. **Given** a retry that bypasses the at-most-once guarantee (a proxy-level replay, or a direct duplicate call) and would re-create shifts that already exist for the same employee, date and start time, **When** it is persisted, **Then** the operation is rejected with a visible "duplicate shift" conflict and **no** duplicated month is written — the duplication is caught at the data layer, not silently doubled.

**FRs covered:** FR5. **NFRs:** NFR3 (no silent failure — a duplicate surfaces as a visible conflict, not a doubled month), NFR10 (concurrent generations across clinics stay safe; same-clinic-same-month serializes).

> **Ticket-AC mapping (KON-122 mechanism → Tasks):** KON-122's checkboxes are written at the mechanism level; the ACs above restate them as observable behaviour. Mechanism realized by — **AC1 (mutations at-most-once)** → the server-side tRPC fetch wrapper `fetchWithRetry` retries only idempotent `GET` (queries) and never `POST` (mutations): Task 1 (production gate) + Task 2 (web spec). **AC2 (serialize same clinic+month)** → both `generateMonthlyPlan` and `publishPlan` take a `pg_advisory_xact_lock(hashtext(clinicId), hashtext(month))` as the first statement of their `$transaction`, run at `Serializable` isolation with a 15 s timeout, and retry a Prisma `P2034` serialization failure up to 3×: Task 3 (generation) + Task 4 (publish) + Task 6 (lock-acquired + P2034-retry tests). **AC3 (DB duplicate net)** → the `@@unique([employeeId, date, startTime])` from Story 11-2 raises a `P2002` that the **existing** catch maps to `ConflictException('Duplicate shift detected during generation')` — the previously-dead catch becomes a real net: Task 3 preserves it verbatim, Task 6 proves it. Scope decision locked with Alex during authoring: **advisory lock + `Serializable` + `timeout: 15000` + bounded `P2034` retry** (the more defensive of the two options presented — the audit suggested "isolationLevel + advisory lock"; we take both).

## Tasks

- [x] **Task 1: Limit `fetchWithRetry` to idempotent queries (exported for testing)** [AC: 1]
  In `apps/web/src/lib/trpc/client.ts`, replace the current function declaration line (the wrapper is not exported today):
  ```ts
  async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let lastError: unknown;
  ```
  with the exported version that short-circuits any non-`GET` request to a single attempt:
  ```ts
  export async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    // Story 11-5 — retry ONLY safe, idempotent queries. tRPC v11 httpBatchLink
    // sends queries as GET and mutations as POST, and never batches the two into
    // one HTTP request, so any non-GET method is a mutation. Replaying a mutation
    // could duplicate a whole month of shifts (a retried generateMonthlyPlan behind
    // a reverse-proxy 502/504). A mutation therefore gets a SINGLE attempt — at most
    // once — and any 5xx / non-JSON / connection error propagates to the caller.
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method !== 'GET') {
      return fetch(input, init);
    }

    let lastError: unknown;
  ```
  Leave the entire retry loop, both `console.warn` branches, and the trailing `throw lastError;` exactly as they are — the only changes are the `export` keyword, the method guard, and nothing else.
  Run: `pnpm --filter @pawly/web exec tsc --noEmit 2>&1 | head -20`
  Expected: no type errors, exit 0.
  Commit: `git add "apps/web/src/lib/trpc/client.ts" && git commit -m "feat(KON-122): limit fetchWithRetry to idempotent GET queries (at-most-once mutations)"`

- [x] **Task 2: Web spec — mutations are not retried, queries are** [AC: 1]
  Create the new file `apps/web/src/lib/trpc/client.spec.ts` with exactly this content:
  ```ts
  import { afterEach, describe, expect, it, vi } from "vitest";
  import { fetchWithRetry } from "./client";

  const jsonHeaders = { "content-type": "application/json" };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("fetchWithRetry (story 11-5 — at-most-once mutations)", () => {
    it("does NOT retry a mutation (POST) on a 5xx — sends it at most once", async () => {
      const fail = new Response("err", { status: 503, headers: jsonHeaders });
      const fetchMock = vi.fn().mockResolvedValue(fail);
      vi.stubGlobal("fetch", fetchMock);

      const res = await fetchWithRetry("http://api/trpc", { method: "POST" });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(503);
    });

    it("does NOT retry a mutation (POST) on a connection error — throws after one attempt", async () => {
      const connErr = Object.assign(new TypeError("fetch failed"), {
        cause: { code: "ECONNRESET" },
      });
      const fetchMock = vi.fn().mockRejectedValue(connErr);
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        fetchWithRetry("http://api/trpc", { method: "POST" }),
      ).rejects.toThrow("fetch failed");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("retries a query (GET) on a 5xx, then returns the eventual success", async () => {
      vi.useFakeTimers();
      const fail = new Response("err", { status: 503, headers: jsonHeaders });
      const ok = new Response("{}", { status: 200, headers: jsonHeaders });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(fail)
        .mockResolvedValueOnce(ok);
      vi.stubGlobal("fetch", fetchMock);

      const promise = fetchWithRetry("http://api/trpc", { method: "GET" });
      await vi.runAllTimersAsync();
      const res = await promise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(res.status).toBe(200);
    });

    it("treats a missing method as a query (GET) and retries", async () => {
      vi.useFakeTimers();
      const fail = new Response("err", { status: 500, headers: jsonHeaders });
      const ok = new Response("{}", { status: 200, headers: jsonHeaders });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(fail)
        .mockResolvedValueOnce(ok);
      vi.stubGlobal("fetch", fetchMock);

      const promise = fetchWithRetry("http://api/trpc");
      await vi.runAllTimersAsync();
      const res = await promise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(res.status).toBe(200);
    });
  });
  ```
  Run: `pnpm --filter @pawly/web test -- client`
  Expected: `client.spec.ts` — 4 passed, exit 0.
  Commit: `git add "apps/web/src/lib/trpc/client.spec.ts" && git commit -m "test(KON-122): fetchWithRetry retries queries but never mutations"`

- [x] **Task 3: Serialize `generateMonthlyPlan` — advisory lock + Serializable + P2034 retry** [AC: 2, 3]
  In `apps/api/src/modules/planning/planning-generation.service.ts`:

  **3a.** Add the `Prisma` value import immediately after the existing validators import. Anchor on (currently line 20):
  ```ts
  import { templateDataSchema } from '@pawly/validators';
  ```
  and add the line right after it:
  ```ts
  import { templateDataSchema } from '@pawly/validators';
  import { Prisma } from '@prisma/client';
  ```

  **3b.** Add the `withSerializationRetry` private helper between the constructor and `generateMonthlyPlan`. Anchor on (currently lines 120–122):
  ```ts
    ) {}

    async generateMonthlyPlan(
  ```
  and insert the helper between the constructor's `) {}` and `async generateMonthlyPlan(`:
  ```ts
    ) {}

    // Story 11-5 — under SERIALIZABLE isolation Postgres can abort a transaction
    // with serialization_failure (SQLSTATE 40001) or deadlock_detected (40P01),
    // both surfaced by Prisma as error code P2034. The (clinicId, month) advisory
    // lock already serializes same-key runs, so a P2034 here is a rare cross-key
    // conflict: retry the whole transaction (the lock is re-acquired and the
    // delete+create is replayed idempotently). Every other error — including P2002
    // (permanent under the same inputs; retrying would only repeat it) — propagates
    // unchanged so the caller's catch can map it.
    private async withSerializationRetry<T>(
      op: () => Promise<T>,
      maxAttempts = 3,
    ): Promise<T> {
      let lastError: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await op();
        } catch (error: unknown) {
          const code = (error as { code?: string }).code;
          if (code === 'P2034' && attempt < maxAttempts) {
            lastError = error;
            continue;
          }
          throw error;
        }
      }
      throw lastError;
    }

    async generateMonthlyPlan(
  ```

  **3c.** Replace the generation transaction `try/catch` block (currently lines 530–572) — wrap the `$transaction` in `withSerializationRetry`, add the advisory lock as its first statement, and pass the Serializable + timeout options. The `deleteMany`, `createManyAndReturn`, and the entire `catch` are preserved verbatim. Replace:
  ```ts
      try {
        createdShifts = await this.prisma.$transaction(async (tx) => {
          // Story 11-1 — preserve confirmed shifts and shifts carrying variance
          // history (VarianceEvent cascades on delete → would erase no-show /
          // clock-in records). Only unconfirmed, history-free GENERATED shifts
          // are cleared before regeneration.
          await tx.shift.deleteMany({
            where: {
              clinicId,
              source: 'GENERATED',
              isConfirmed: false,
              varianceEvents: { none: {} },
              date: { gte: monthStart, lte: monthEnd },
            },
          });

          if (assignedShifts.length === 0) return [];
          return tx.shift.createManyAndReturn({
            data: assignedShifts.map((s) => ({
              date: new Date(`${s.date}T00:00:00.000Z`),
              startTime: s.startTime,
              endTime: s.endTime,
              shiftTypeCode: s.shiftTypeCode,
              breakMinutes: s.breakMinutes || 0,
              source: 'GENERATED' as const,
              employeeId: s.employeeId,
              clinicId,
              planningTemplateId: templateId,
            })),
          });
        });
      } catch (error: unknown) {
        const prismaError = error as { code?: string };
        if (prismaError.code === 'P2002') {
          throw new ConflictException(
            'Duplicate shift detected during generation',
          );
        }
        this.logger.error('Transaction failed during shift generation', error);
        throw new InternalServerErrorException(
          'Failed to persist generated shifts',
        );
      }
  ```
  with:
  ```ts
      try {
        createdShifts = await this.withSerializationRetry(() =>
          this.prisma.$transaction(
            async (tx) => {
              // Story 11-5 — serialize concurrent generations of the SAME
              // (clinic, month) so a retry (reverse-proxy 502/504 replay, or a
              // double-click) can never interleave two delete+create passes into a
              // duplicated month. pg_advisory_xact_lock auto-releases at COMMIT /
              // ROLLBACK on this interactive transaction's pinned connection (safe
              // with the Prisma pool, unlike a session-level pg_advisory_lock). Two
              // int4 keys — hashtext of each — avoid the bigint-cast ambiguity of the
              // single-argument form; the tagged template binds them as parameters.
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clinicId}), hashtext(${month}))`;

              // Story 11-1 — preserve confirmed shifts and shifts carrying variance
              // history (VarianceEvent cascades on delete → would erase no-show /
              // clock-in records). Only unconfirmed, history-free GENERATED shifts
              // are cleared before regeneration.
              await tx.shift.deleteMany({
                where: {
                  clinicId,
                  source: 'GENERATED',
                  isConfirmed: false,
                  varianceEvents: { none: {} },
                  date: { gte: monthStart, lte: monthEnd },
                },
              });

              if (assignedShifts.length === 0) return [];
              return tx.shift.createManyAndReturn({
                data: assignedShifts.map((s) => ({
                  date: new Date(`${s.date}T00:00:00.000Z`),
                  startTime: s.startTime,
                  endTime: s.endTime,
                  shiftTypeCode: s.shiftTypeCode,
                  breakMinutes: s.breakMinutes || 0,
                  source: 'GENERATED' as const,
                  employeeId: s.employeeId,
                  clinicId,
                  planningTemplateId: templateId,
                })),
              });
            },
            {
              isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
              timeout: 15000,
            },
          ),
        );
      } catch (error: unknown) {
        const prismaError = error as { code?: string };
        if (prismaError.code === 'P2002') {
          throw new ConflictException(
            'Duplicate shift detected during generation',
          );
        }
        this.logger.error('Transaction failed during shift generation', error);
        throw new InternalServerErrorException(
          'Failed to persist generated shifts',
        );
      }
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no new type errors referencing `withSerializationRetry` / `$executeRaw` / `Prisma.TransactionIsolationLevel`, exit 0. (Pre-existing unrelated spec-fixture `tsc` noise documented in 11-1/11-2 may remain.)
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-122): advisory lock + Serializable + P2034 retry on generateMonthlyPlan"`

- [x] **Task 4: Serialize `publishPlan` on the same `(clinicId, month)` advisory lock** [AC: 2]
  In `apps/api/src/modules/planning/planning-generation.service.ts`, replace the publication upsert transaction (currently lines 2713–2733):
  ```ts
      // Upsert publication status atomically
      const now = await this.prisma.$transaction(async (tx) => {
        const publishedAt = new Date();
        await tx.planningPeriodStatus.upsert({
          where: { clinicId_month: { clinicId, month } },
          create: {
            clinicId,
            month,
            status: 'PUBLISHED',
            publishedAt,
            publishedBy: userId,
          },
          update: {
            status: 'PUBLISHED',
            publishedAt,
            publishedBy: userId,
          },
        });

        return publishedAt;
      });
  ```
  with the locked, Serializable, retry-wrapped version (same `(clinicId, month)` key as generation, so a publish serializes against a concurrent regeneration/publish):
  ```ts
      // Upsert publication status atomically
      const now = await this.withSerializationRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            // Story 11-5 — take the SAME (clinicId, month) advisory lock as
            // generation so a publish serializes against a concurrent regeneration
            // or a double-clicked publish instead of racing. Auto-released at
            // COMMIT / ROLLBACK on the interactive transaction's pinned connection.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clinicId}), hashtext(${month}))`;

            const publishedAt = new Date();
            await tx.planningPeriodStatus.upsert({
              where: { clinicId_month: { clinicId, month } },
              create: {
                clinicId,
                month,
                status: 'PUBLISHED',
                publishedAt,
                publishedBy: userId,
              },
              update: {
                status: 'PUBLISHED',
                publishedAt,
                publishedBy: userId,
              },
            });

            return publishedAt;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 15000,
          },
        ),
      );
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no new type errors, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-122): advisory lock + Serializable on publishPlan"`

- [x] **Task 5: Give every generation/publication `tx` mock a `$executeRaw` stub** [AC: 2]
  The two transactions now call `tx.$executeRaw` as their first statement. Every hand-rolled `$transaction` mock in `apps/api/src/modules/planning/planning-generation.service.spec.ts` whose `tx` flows through `generateMonthlyPlan` **or** `publishPlan` will otherwise throw `TypeError: tx.$executeRaw is not a function`. Add `$executeRaw: jest.fn().mockResolvedValue(0),` as the **first property** of each such `tx` literal.

  Every offending `tx` literal has one of these two shapes today:
  ```ts
            const tx = {
              shift: {
  ```
  or:
  ```ts
            const tx = {
              planningPeriodStatus: mockTxPlanningPeriodStatus,
  ```
  (and the `getScheduleViewForMonth` `const tx = { … }` variants). In **each** one, insert the stub as the first line inside the object, e.g.:
  ```ts
            const tx = {
              $executeRaw: jest.fn().mockResolvedValue(0),
              shift: {
  ```
  and:
  ```ts
            const tx = {
              $executeRaw: jest.fn().mockResolvedValue(0),
              planningPeriodStatus: mockTxPlanningPeriodStatus,
  ```

  **Known sites (re-locate by `describe` block — line numbers drift):** `describe('generateMonthlyPlan')` (three `$transaction.mockImplementation`), `describe('Story 11-2 — surviving shifts visible to generator')` (the `captureCreate` helper), `describe('daysInMonth/7 dynamic weeks calculation')` (two), `describe('deterministic tiebreaker')`, `describe('apprentice declaration pre-check')` (two), `describe('Story 11-1 — bulk regeneration published-change guard')` (three), and `describe('publishPlan')` incl. its `describe('Trigger.dev code path')` (three). Also patch any `$transaction.mockImplementation(async (cb) => cb(mockTx…))` variants where `mockTx` lacks `$executeRaw`.

  Do **not** touch the Story 11-1 test that asserts `expect(mockPrismaService.$transaction).not.toHaveBeenCalled()` — that path throws before the transaction, so its `tx` is never built.
  Run: `pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec" 2>&1 | tail -40`
  Expected: **zero** `tx.$executeRaw is not a function` failures remain. If any test still fails with that message, apply the same one-line stub to its `tx` and re-run. The suite otherwise stays green at its pre-story count (any *new* failures are from Task 6, not this task).
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-122): stub tx.\$executeRaw on generation/publication transaction mocks"`

- [x] **Task 6: Service spec — lock acquired, P2002 net, P2034 retried** [AC: 2, 3]
  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, add this block immediately **before** the `describe('publishPlan', …)` block opens (i.e., right after the `describe('Story 11-2 — surviving shifts visible to generator', …)` region closes, or anywhere inside the top-level `describe('PlanningGenerationService')` — it reuses the file's `service`, `mockPrismaService`, `mockTemplateService`, `clinicId`):
  ```ts
  // ─── Story 11-5 — idempotent generation & concurrency safety ──────
  describe('Story 11-5 — idempotent generation & concurrency safety', () => {
    const simpleTemplate = {
      id: 'tpl-11-5',
      name: 'Simple',
      data: {
        days: [
          { dayOfWeek: 1, slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }] },
        ],
      },
      clinicId,
    };
    const oneVet = [
      { id: 'emp-1', firstName: 'Alice', lastName: 'Martin', jobType: 'VET', contractHours: 35 },
    ];

    // A tx whose $executeRaw records the raw SQL it was handed, so we can assert
    // the advisory lock ran BEFORE any deleteMany/createManyAndReturn.
    const buildRecordingTx = () => {
      const calls: string[] = [];
      const tx = {
        $executeRaw: jest.fn().mockImplementation((strings: TemplateStringsArray) => {
          calls.push(strings.join('?'));
          return Promise.resolve(0);
        }),
        shift: {
          deleteMany: jest.fn().mockImplementation(() => {
            calls.push('deleteMany');
            return Promise.resolve({ count: 0 });
          }),
          createManyAndReturn: jest.fn().mockImplementation(({ data }: { data: any[] }) => {
            calls.push('createManyAndReturn');
            return Promise.resolve(data.map((d, i) => ({ id: `gen-${i}`, ...d })));
          }),
        },
      };
      return { tx, calls };
    };

    it('acquires the (clinicId, month) advisory lock before deleting on generateMonthlyPlan (AC2)', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(simpleTemplate);
      mockPrismaService.employee.findMany.mockResolvedValue(oneVet);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);
      const { tx, calls } = buildRecordingTx();
      mockPrismaService.$transaction.mockImplementation(
        async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
      );

      await service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-11-5');

      expect(tx.$executeRaw).toHaveBeenCalled();
      const rawSql = tx.$executeRaw.mock.calls[0][0].join('?');
      expect(rawSql).toContain('pg_advisory_xact_lock');
      expect(rawSql).toContain('hashtext');
      // lock is the FIRST db call — before deleteMany and createManyAndReturn
      expect(calls[0]).toContain('pg_advisory_xact_lock');
      expect(calls.indexOf('deleteMany')).toBeGreaterThan(0);
    });

    it('maps a P2002 during generation to a ConflictException (AC3 — the dead catch is now a real net)', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(simpleTemplate);
      mockPrismaService.employee.findMany.mockResolvedValue(oneVet);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);
      mockPrismaService.$transaction.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-11-5'),
      ).rejects.toMatchObject({ message: 'Duplicate shift detected during generation' });
    });

    it('retries the generation transaction once on a P2034 serialization failure, then succeeds (AC2)', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(simpleTemplate);
      mockPrismaService.employee.findMany.mockResolvedValue(oneVet);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);
      const { tx } = buildRecordingTx();
      let attempts = 0;
      mockPrismaService.$transaction.mockImplementation(
        async (fn: (t: unknown) => Promise<unknown>) => {
          attempts += 1;
          if (attempts === 1) return Promise.reject({ code: 'P2034' });
          return fn(tx);
        },
      );

      const result = await service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-11-5');

      expect(attempts).toBe(2);
      expect(result).toBeDefined();
    });

    it('does NOT retry a P2002 (permanent) — fails on the first attempt (AC3)', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(simpleTemplate);
      mockPrismaService.employee.findMany.mockResolvedValue(oneVet);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);
      let attempts = 0;
      mockPrismaService.$transaction.mockImplementation(async () => {
        attempts += 1;
        return Promise.reject({ code: 'P2002' });
      });

      await expect(
        service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-11-5'),
      ).rejects.toMatchObject({ message: 'Duplicate shift detected during generation' });
      expect(attempts).toBe(1);
    });

    it('acquires the (clinicId, month) advisory lock inside publishPlan (AC2)', async () => {
      mockPrismaService.planningPeriodStatus.findUnique.mockResolvedValue(null);
      (mockPrismaService as any).planningService?.validateShiftsAgainstRules;
      jest
        .spyOn(service['planningService'], 'validateShiftsAgainstRules')
        .mockResolvedValue({ hardViolations: [], softViolations: [] } as any);
      mockPrismaService.employee.findMany.mockResolvedValue([]);
      mockPrismaService.clinic.findUniqueOrThrow.mockResolvedValue({ name: 'Clinic' });
      const lockExec = jest.fn().mockResolvedValue(0);
      mockPrismaService.$transaction.mockImplementation(
        async (fn: (t: unknown) => Promise<unknown>) =>
          fn({
            $executeRaw: lockExec,
            planningPeriodStatus: {
              upsert: jest.fn().mockResolvedValue({}),
            },
          }),
      );

      await service.publishPlan(clinicId, '2026-03', 'user-1');

      expect(lockExec).toHaveBeenCalled();
      expect(lockExec.mock.calls[0][0].join('?')).toContain('pg_advisory_xact_lock');
    });
  });
  ```
  > **Note on the P2002 tests:** rejecting the whole `mockPrismaService.$transaction` (rather than the inner `tx.createManyAndReturn`) reproduces exactly how Prisma surfaces a unique-constraint violation from an interactive transaction — the `$transaction` promise rejects with `{ code: 'P2002' }`, which the service's `catch` maps. No `tx` object is needed for those two tests.
  Run: `pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec" 2>&1 | tail -20`
  Expected: all suites pass, including the 5 new `Story 11-5` tests, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-122): advisory lock acquired, P2002 net, P2034 retried"`

- [x] **Task 7: Full verification + story bookkeeping** [AC: all]
  Run the whole matrix and the build to confirm nothing regressed (Task 3/4 touch the hottest transaction in the planning module; Task 1 touches every server-side tRPC call):
  ```bash
  pnpm test
  pnpm build
  ```
  Expected: `pnpm test` — turbo all workspaces green (API ≥ 875 tests incl. the 5 new Story 11-5 tests; web ≥ 754 incl. the 4 new client tests; validators unchanged), exit 0. `pnpm build` — all tasks successful, exit 0.
  > If root `pnpm test` is broken by the local `rtk` turbo shim (project memory `epic11-dev-gotchas`), run per-workspace: `pnpm --filter @pawly/api test` and `pnpm --filter @pawly/web test`. If `pnpm build` stalls at 0% CPU it is the iCloud `.git` eviction issue (`icloud-git-eviction`), **not** a code error — retry, do not "fix" the build. Rebuild `@pawly/*` dist before app `tsc` if cross-package types look stale (`epic11-dev-gotchas`).
  Commit: `git add docs/stories/11-5-idempotent-generation-concurrency-safety.md docs/state.yaml && git commit -m "docs(KON-122): mark story 11-5 bookkeeping"`

## Dev Notes

### Non-Goals — deferred / out of scope

- **Transactional amendment flow + Redis `schedule:*` coherence → Story 11-6.** 11-5 only adds concurrency/idempotency to the generation and publication transactions. Do not fold `recordAmendment` / `notifyScheduleChange` into the tx here, and do not touch the router's Redis invalidation ordering — that is 11-6's `try/finally` work.
- **The DB `@@unique([employeeId, date, startTime])` itself → already shipped in Story 11-2.** This story consumes it (it is what makes the P2002 catch a real net). Do **not** re-add or modify the constraint, and do not run `db push` — no schema change here.
- **Rate-limiting / debouncing the Generate button in the UI.** Out of scope — the at-most-once guarantee is enforced at the fetch layer (AC1) and the DB/lock layer (AC2/AC3), not by disabling the button.
- **Extending the advisory lock to `moveShift` / `createManualShift` / `deleteShift`.** Those are single-row mutations already guarded by overlap checks + the `@@unique`; the audit scoped the lock to the two bulk/idempotency-critical paths (`generateMonthlyPlan`, `publishPlan`). Do not broaden it here.

### Architecture

- **Data flow (non-negotiable):** `Page (RSC) → Client Component → Hook → Zsa → Server Action → tRPC Client → NestJS Service → Prisma`. This story touches the **server-side tRPC fetch wrapper** (`apps/web/src/lib/trpc/client.ts` — the last web hop before the API) and the **NestJS generation service**. No router, hook, component, schema, or migration change. `generateMonthlyPlan` / `publishPlan` are already `subscribedProcedure` + `adminOnly`, `isEntitled('professional')`-gated, `clinicId` from `ctx.user.clinicId` — do not change any of that.
- **Cross-cutting invariant (epic-context § 3.5 — reuse the transactional pattern, don't reinvent):** `confirmPresence` is the canonical in-transaction pattern. 11-5 adds the missing serialization primitive (advisory lock) and stronger isolation to the two paths the audit flagged; it does not restructure the surrounding logic.
- **Cross-cutting invariant (epic-context § 3.3 — determinism):** the generator stays fully deterministic. The advisory lock only serializes *when* transactions run; it changes no scoring, tiebreaker, or assignment. A P2034 retry replays the identical `assignedShifts` array (computed once, outside the transaction) — same input, same output.
- **Why the advisory lock lives INSIDE the interactive `$transaction`:** `pg_advisory_xact_lock` is connection-scoped and auto-released at COMMIT/ROLLBACK. Prisma's interactive `$transaction` pins one pooled connection for the whole callback, so the lock and the subsequent `deleteMany`/`upsert` run on the *same* connection and the lock protects exactly the critical section. A session-level `pg_advisory_lock` on `this.prisma` would be acquired on an arbitrary pooled connection and would **not** protect the transaction — do not use it.
- **Why two int4 keys, not one bigint:** `pg_advisory_xact_lock(int4, int4)` is unambiguous; the single-argument form takes a `bigint` and forces a cast decision on `hashtext`'s `int4` result. `pg_advisory_xact_lock(hashtext(${clinicId}), hashtext(${month}))` maps the composite key naturally. A `hashtext` collision would only over-serialize two unrelated (clinic, month) pairs — harmless (a rare, tiny extra wait), never a correctness issue.
- **Why AC1 keys on the HTTP method:** tRPC v11 `httpBatchLink` sends queries as `GET` and mutations as `POST`, and never batches a query and a mutation into the same HTTP request (a batch is all-GET or all-POST). So a non-GET method in the fetch wrapper is unambiguously a mutation. `methodOverride` is not configured on this client, so the default GET-for-queries holds.
- **Layered defense (all three ACs compose):** AC1 stops the *tRPC client* from replaying a mutation (at most once from Next.js). AC2's advisory lock serializes any two same-`(clinic, month)` transactions that still arrive concurrently (e.g. a proxy-level retry that bypasses the client, or two admins) — the second waits, then its `deleteMany` sees the first's committed rows and clears them before re-creating, so no duplicate and no P2002 in the happy path. AC3's `@@unique` + P2002 catch is the last-resort DB net for anything that races *without* the lock.

### Existing code at write time (Step-0 verbatim quotes — re-verify the symbol, line numbers may drift)

`apps/web/src/lib/trpc/client.ts:35-95` — the fetch wrapper Task 1 gates. It retries ALL requests (queries AND mutations) on 5xx / non-JSON / connection errors today:
```ts
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(input, init);

      // Retry on server errors (502, 503, etc. — API restarting or not ready)
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(/* … */);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      // Retry on non-JSON responses (API returning HTML error page during hot-reload)
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json') && attempt < MAX_RETRIES) {
        /* … retry … */
      }
      return response;
    } catch (error) {
      lastError = error;
      const isConnectionError = /* TypeError 'fetch failed' + cause.code ∈ {ECONNREFUSED,ECONNRESET,EPIPE,UND_ERR_CONNECT_TIMEOUT} */;
      if (!isConnectionError || attempt === MAX_RETRIES) {
        throw error;
      }
      /* … backoff + retry … */
    }
  }
  throw lastError;
}
```
The wrapper is passed to `httpBatchLink({ …, fetch: fetchWithRetry })` (`:103`). It is **not** exported today — Task 1 exports it so the spec can import it. This module is server-only (it lazy-imports `next/headers` inside the `headers()` callback); importing it in Vitest runs only the top-level `createTRPCClient` builder (no fetch, no cookie access).

`apps/api/src/modules/planning/planning-generation.service.ts:530-572` — the generation transaction Task 3 wraps. `$transaction` runs at the default READ COMMITTED with no `isolationLevel`, and the `P2002` branch of the catch is currently dead (no `@@unique` existed before 11-2):
```ts
    try {
      createdShifts = await this.prisma.$transaction(async (tx) => {
        // Story 11-1 — preserve confirmed shifts and shifts carrying variance …
        await tx.shift.deleteMany({ where: { clinicId, source: 'GENERATED', isConfirmed: false, varianceEvents: { none: {} }, date: { gte: monthStart, lte: monthEnd } } });
        if (assignedShifts.length === 0) return [];
        return tx.shift.createManyAndReturn({ data: assignedShifts.map((s) => ({ /* … */ })) });
      });
    } catch (error: unknown) {
      const prismaError = error as { code?: string };
      if (prismaError.code === 'P2002') {
        throw new ConflictException('Duplicate shift detected during generation');
      }
      this.logger.error('Transaction failed during shift generation', error);
      throw new InternalServerErrorException('Failed to persist generated shifts');
    }
```

`apps/api/src/modules/planning/planning-generation.service.ts:2713-2733` — the publication upsert transaction Task 4 wraps (also default READ COMMITTED):
```ts
    // Upsert publication status atomically
    const now = await this.prisma.$transaction(async (tx) => {
      const publishedAt = new Date();
      await tx.planningPeriodStatus.upsert({
        where: { clinicId_month: { clinicId, month } },
        create: { clinicId, month, status: 'PUBLISHED', publishedAt, publishedBy: userId },
        update: { status: 'PUBLISHED', publishedAt, publishedBy: userId },
      });
      return publishedAt;
    });
```

`apps/api/src/modules/planning/planning-generation.service.ts:111-122` — the constructor / method boundary Task 3b inserts the helper into:
```ts
  constructor(
    private readonly prisma: PrismaService,
    /* … 7 more injected services … */
    private readonly apprenticeDeclarationService: ApprenticeDeclarationService,
  ) {}

  async generateMonthlyPlan(
```

`planning-generation.service.spec.ts` — the recurring per-test `$transaction` mock shape Task 5 patches (every generation test uses this literal; publishPlan tests use the `planningPeriodStatus` variant):
```ts
      mockPrismaService.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            shift: {
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
              createManyAndReturn: jest.fn().mockResolvedValue(createdShifts),
            },
          };
          return fn(tx);
        },
      );
```
`Prisma` is imported nowhere in this service yet — Task 3a adds `import { Prisma } from '@prisma/client';` (value import; the same form `tour.service.ts` already uses).

### File decision map

**Modify (web)**
- `apps/web/src/lib/trpc/client.ts` — export `fetchWithRetry` + gate its retry loop to `GET`. *Single responsibility:* the server-side tRPC transport (base-URL resolution + resilient fetch). *In/out:* imports `@trpc/client`, `superjson`, `@pawly/api/trpc-types`; exports `trpc` (unchanged) and now `fetchWithRetry` (for the spec).

**Create (web)**
- `apps/web/src/lib/trpc/client.spec.ts` — Vitest unit coverage for the query-vs-mutation retry policy. *Single responsibility:* prove `fetchWithRetry` retries GET and never POST. *In/out:* imports `fetchWithRetry` from `./client`, stubs global `fetch`.

**Modify (api)**
- `apps/api/src/modules/planning/planning-generation.service.ts` — add `Prisma` import, `withSerializationRetry` helper, advisory lock + `Serializable` + `timeout` on the `generateMonthlyPlan` and `publishPlan` transactions. *Single responsibility:* monthly generation loop + shift mutations + publication. *In/out:* Prisma reads/writes (`$transaction`, `$executeRaw`), returns `GenerationResult` / publish summary (both unchanged shapes).
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` — stub `tx.$executeRaw` on every affected transaction mock (Task 5) + 5 new `Story 11-5` tests (Task 6). *Single responsibility:* generation/publication service unit coverage.

**Create (api):** none. **Schema / migration:** none (the `@@unique` shipped in 11-2).

### Testing

- **Web:** Vitest, `*.spec.ts`. Run: `pnpm --filter @pawly/web test -- client`. The GET-retry tests use `vi.useFakeTimers()` + `await vi.runAllTimersAsync()` so the real exponential backoff (500/1000/2000 ms) does not slow the suite; `vi.stubGlobal('fetch', …)` + `vi.unstubAllGlobals()` in `afterEach` isolates the global. `new Response(...)` is available in the web Vitest environment.
- **API:** Jest, `*.spec.ts`. Run: `pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec"`.
- **Critical integration hazard — `tx.$executeRaw` (see Task 5):** adding the advisory lock as the first statement of the two transactions means **every** hand-rolled `tx` mock flowing through `generateMonthlyPlan`/`publishPlan` must expose `$executeRaw` or the real code throws `tx.$executeRaw is not a function`. This is the 11-5 analogue of 11-2's "two `shift.findMany`" mock hazard. Task 5 patches all known sites; the test command surfaces any straggler with an explicit message, and the fix is always the same one-liner (`$executeRaw: jest.fn().mockResolvedValue(0)`).
- **AC1 coverage:** Task 2 — POST/5xx → single fetch (no retry); POST/ECONNRESET → throws after one attempt; GET/5xx → retries then succeeds; missing-method (defaults GET) → retries.
- **AC2 coverage:** Task 6 — the recording-`tx` test asserts `pg_advisory_xact_lock` is the first DB call before `deleteMany` on generate, and a separate test asserts the lock runs inside `publishPlan`; the P2034 test proves the retry wrapper re-runs the transaction once then succeeds.
- **AC3 coverage:** Task 6 — a `$transaction` rejecting with `{ code: 'P2002' }` maps to `ConflictException('Duplicate shift detected during generation')`, and the "does NOT retry a P2002" test proves the permanent error fails on the first attempt (the retry wrapper only retries `P2034`).

### Dependencies

- No new libraries. `date-fns` is **not** installed in `apps/api` — this story adds no date math. `Prisma` (`@prisma/client`) is already a dependency; only a new named import is added.
- Per **L4** (epic-context § 5) — confirm via Context7 (`/prisma/docs`) and record in the Dev Agent Record: (a) `$executeRaw` tagged-template parameter binding (so `hashtext(${clinicId})` is a bound parameter, not string interpolation); (b) that Prisma surfaces a Postgres serialization failure / deadlock as error code **`P2034`** and a unique-constraint violation as **`P2002`**; (c) that `isolationLevel: Prisma.TransactionIsolationLevel.Serializable` and the interactive-transaction connection-pinning semantics are as assumed (advisory lock protects the whole callback). Also confirm from the tRPC v11 docs that `httpBatchLink` issues queries as `GET` and mutations as `POST`.
- Per **L2/L-audit** (epic-context § 5) — "verified" means every entry-point. Both bulk/idempotency-critical paths (`generateMonthlyPlan`, `publishPlan`) get the lock **and** a lock-acquired test; AC1 is exercised for both the retryable (GET) and the non-retryable (POST) branch. Live verification (below) is required before flipping the story to done.

### Live verification (for aped-review's L2 journey)

Unit tests mock the connection, so they cannot prove the *real* advisory lock or the *real* P2002 net. The reviewer must confirm end-to-end (per L2): (1) a duplicated retry against a real Neon connection surfaces as a single month + a `ConflictException`, not a doubled month (e.g. fire two concurrent `generateMonthlyPlan` for the same clinic+month and assert exactly one month's GENERATED shifts remain and no `(employeeId, date, startTime)` duplicate exists); (2) a mutation behind a simulated 503 is sent once (network tab shows a single POST). The planning grid drag in any E2E is keyboard (dnd-kit), not pointer (project memory `e2e_browser_gotchas`).

## File List

**Modify (web):**
- `apps/web/src/lib/trpc/client.ts`

**Create (web):**
- `apps/web/src/lib/trpc/client.spec.ts`

**Modify (api):**
- `apps/api/src/modules/planning/planning-generation.service.ts`
- `apps/api/src/modules/planning/planning-generation.service.spec.ts`

**Create (api):** none. **Schema / migration:** none.

## Dev Agent Record

- **Model:** claude-opus-4-8[1m]
- **Started:** 2026-07-10
- **Completed:** 2026-07-10

### Summary

Layered at-most-once + serialization defense shipped exactly per spec across all three
ACs. **AC1** — the server-side tRPC transport `fetchWithRetry` now short-circuits any
non-`GET` (mutation) to a single fetch attempt, so a reverse-proxy 502/504 or a
double-click can no longer replay a `generateMonthlyPlan`/`publishPlan` from Next.js.
**AC2** — both `generateMonthlyPlan` and `publishPlan` take the SAME
`pg_advisory_xact_lock(hashtext(clinicId), hashtext(month))` as the first statement of
their interactive `$transaction`, run at `Serializable` with `timeout: 15000`, and a new
private `withSerializationRetry` replays the whole tx up to 3× on Prisma `P2034`
(serialization/deadlock). **AC3** — the previously-dead `P2002` catch in generation is now
a real net (the `@@unique([employeeId,date,startTime])` from 11-2), mapping to
`ConflictException('Duplicate shift detected during generation')`; the retry wrapper
deliberately does NOT retry `P2002` (permanent). The generator stays fully deterministic —
the lock only serializes *when* transactions run; a `P2034` replay re-runs the identical
`assignedShifts` array computed once outside the tx.

**L4 — Context7 SDK verification (all CONFIRMED, source `/websites/prisma_io`, `/trpc/trpc`):**
(a) `tx.$executeRaw` as a tagged template sends `${clinicId}`/`${month}` as **bound
parameters** (prepared statement), not string interpolation — injection-safe.
(b) Prisma surfaces a Postgres serialization failure (40001) / deadlock (40P01) as
**`P2034`** (the documented retry code); (c) a unique-constraint violation as **`P2002`**.
(d) The interactive-tx overload accepts `isolationLevel` + `timeout` (ms), and runs the
whole callback on a single pinned connection — so a connection-scoped
`pg_advisory_xact_lock` protects the subsequent `deleteMany`/`upsert` and auto-releases at
COMMIT/ROLLBACK (a session-level lock on the pool would NOT — correctly avoided).
(e) tRPC v11 `httpBatchLink` sends queries as **GET** and mutations as **POST** by default
and never batches the two into one HTTP request — so keying AC1 on the method is sound.

### Files changed

- `apps/web/src/lib/trpc/client.ts` — export `fetchWithRetry`; non-GET → single attempt.
- `apps/web/src/lib/trpc/client.spec.ts` — **new**; 4 Vitest tests (GET retried, POST not).
- `apps/api/src/modules/planning/planning-generation.service.ts` — `Prisma` import;
  `withSerializationRetry` helper; advisory lock + `Serializable` + `timeout` on the
  `generateMonthlyPlan` and `publishPlan` transactions (P2002/InternalServerError catch
  preserved verbatim).
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` — `$executeRaw`
  stub on every generation/publication `tx` mock (12 sites, 2 shapes); +5 Story 11-5 tests.

### Deviations

- **Commit granularity:** the story lists 4 API commits (Tasks 3/4/5/6) but Tasks 3+4 both
  edit `service.ts` (disjoint regions) and Tasks 5+6 both edit `service.spec.ts`.
  Interactive hunk-staging (`git add -p`) is unavailable in this harness, so the API work
  landed as **2 commits by file** (production `service.ts`, tests `service.spec.ts`) rather
  than 4. No content deviation — every Task 3/4/5/6 change is present verbatim.
- **TDD ordering:** implemented test-first per the Iron Law rather than the story's
  narration order — the web spec (Task 2) was written before the Task 1 export (RED:
  `fetchWithRetry is not a function`), and the Story 11-5 service tests (Task 6) before the
  production lock/retry (RED: lock never acquired / P2034 not retried). Both RED states were
  witnessed before GREEN.
- **Task 5 site count:** patched **12** `tx` mock literals across 2 shapes
  (`const tx = {…}; fn(tx)` and inline `async (cb) => cb({…})`), verified by re-running the
  suite to zero `tx.$executeRaw is not a function` failures — one more shape (the `cb({…})`
  form in daysInMonth/tiebreaker/apprentice blocks) than the story's known-sites list
  enumerated; the run-as-oracle approach caught them.

### Test output

- **API (Jest):** `pnpm --filter @pawly/api test` → **896 passed / 896**, 33 suites, exit 0
  (incl. the 5 new Story 11-5 tests; `planning-generation.service.spec` = 151/151).
- **Web (Vitest):** `pnpm --filter @pawly/web test` → **756 passed / 756**, 51 files, exit 0
  (incl. the 4 new `client.spec.ts` tests). `tsc --noEmit` exit 0.
- **Validators (Vitest):** `pnpm --filter @pawly/validators test` → **777 passed / 777**,
  exit 0 (untouched — no collateral).
- **`tsc` (api):** the 24 residual errors are pre-existing spec-fixture noise in unrelated
  files (`clinic`/`employee`/`planning.service`/`variance` specs — none in this story's File
  List); **zero** errors in `planning-generation.service.ts` or its spec, and none reference
  `withSerializationRetry` / `$executeRaw` / `Prisma.TransactionIsolationLevel`.
- **`pnpm build`:** **4/5 tasks green** — `@pawly/{validators,types,api}` + `db:generate`,
  incl. the load-bearing `apps/api` `nest build && tsc -p tsconfig.types.json` (L5). The one
  failure, `@pawly/web#build`, is **environmental, not code**: Turbopack rejects this
  worktree's shared `node_modules -> ../../Pawly/node_modules` symlink
  (*"apps/web/node_modules/next … points out of the filesystem root"*) at project/entrypoint
  resolution — before any source is compiled. The web change is a 12-line export + method
  guard that never enters that path; web `tsc` and all 756 web tests pass. Production web
  build to be re-confirmed by aped-review's L2 journey in the main checkout (real
  node_modules).

### Live-verification handoff (aped-review, per L2)

Unit tests mock the connection, so the **real** advisory lock + P2002 net must be confirmed
end-to-end against Neon: (1) fire two concurrent `generateMonthlyPlan` for the same
clinic+month → assert exactly one month of GENERATED shifts and no `(employeeId,date,
startTime)` duplicate (P2002 surfaces as a visible `ConflictException`, never a doubled
month); (2) a mutation behind a simulated 503 shows a single POST in the network tab. Grid
drag in any E2E is keyboard (dnd-kit), not pointer.

## Review Record

**Date:** 2026-07-10
**Auditors:** Spec, Code, Edge & Hallucination (Aria N/A — no visual surface; the only web
change is the server-only `fetchWithRetry` transport wrapper)
**Verdict:** done — all findings resolved or dismissed-with-rationale; live L2 confirmed.

> **Design change applied in review (supersedes the "Serializable" wording in Task 3/4, the
> AC-mapping, the Architecture notes and the Dev Agent Record):** both `generateMonthlyPlan`
> and `publishPlan` transactions now run at the **default READ COMMITTED**, NOT `Serializable`.
> The advisory lock still provides same-`(clinic, month)` mutual exclusion; `timeout: 15000`
> and the bounded `P2034` retry are retained as a residual deadlock net.

### Findings

#### Resolved

- [MAJOR] `Serializable` isolation defeats the advisory-lock fresh-read: the tx snapshot
  freezes at the advisory-lock `SELECT` (before the lock is granted), so the second
  same-`(clinic, month)` waiter never sees the first run's committed rows — a spurious
  `P2034` on regeneration or a visible `P2002` on first-generation, contradicting AC2's
  "recovered automatically without surfacing an error." [planning-generation.service.ts:605, :2791]
  - Source: Edge & Hallucination
  - Resolution: commit `82a799f` — dropped both transactions to default READ COMMITTED
    (kept advisory lock + `timeout: 15000` + `P2034` retry). Re-verified by the Edge auditor
    (RESOLVED) and by live L2 (below). No-doubled-month safety was never at risk (`@@unique`
    + AC1), so this was a concurrency-UX/correctness-of-rationale fix, not data corruption.

- [MAJOR] AC2 not fully proven: no test asserted the `$transaction` options
  (`isolationLevel`/`timeout`); every mock ignored the 2nd argument, so a regression dropping
  them stayed green. [planning-generation.service.spec.ts]
  - Source: Spec
  - Resolution: commit `82a799f` — pinned `$transaction.mock.calls[0][1]` to
    `{ timeout: 15000 }` (strict `toEqual`) in one generate test and the publish test.
    Re-verified by the Spec auditor (RESOLVED, AC2 IMPLEMENTED).

- [MINOR] `withSerializationRetry` bounded-exhaustion path (3× `P2034` → give up) untested;
  only the retry-once happy path existed. [planning-generation.service.ts:134]
  - Source: Spec, Edge
  - Resolution: commit `82a799f` — new test: `$transaction` rejects `{code:'P2034'}` on all 3
    attempts → `attempts === 3`, surfaces `InternalServerError('Failed to persist generated
    shifts')`, proving termination.

#### Dismissed

- [MINOR] `throw lastError` at the tail of `withSerializationRetry` is unreachable — TS
  control-flow artifact (loop always returns/continues/throws); harmless.
- [MINOR/info] AC1 also suppresses the safe `ECONNREFUSED`/`ECONNRESET` retry for mutations —
  intentional per AC1 (a mutation is at-most-once; a connection-refused surfaces visibly).
- [MINOR] empty-string / `Request`-object `init.method` only accidentally safe — tRPC v11
  `httpBatchLink` always passes an explicit `GET`/`POST`, so no live defect (no
  `methodOverride` configured). Rationale: correctness rests on tRPC's calling convention.
- [COSMETIC] helper still named `withSerializationRetry` under READ COMMITTED — name remains
  accurate (it guards the `P2034` serialization/deadlock code); renamed deferred as churn.
- [MINOR] full-suite counts (896/756) not statically reproducible — not a defect; a CI run
  settles it. Spec-file count independently confirmed (152 `it()`).

#### Unresolved (story stays in `review`)

- none.

### Verification

- **Test command:** `pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec"`
- **Test output (final pass):** `Tests: 152 passed, 152 total` (incl. all 6 Story 11-5 tests:
  lock-before-delete, P2002→ConflictException, P2034 retry-once, P2002-not-retried,
  3×-P2034-exhaustion, publish lock). `tsc -p tsconfig.json` → **0 errors** in
  `planning-generation.service.ts` (residual 24 errors are pre-existing spec-fixture noise in
  clinic/employee/planning.service/variance specs, unchanged, none in this story's File List).
- **Live L2 (real Neon, concurrency probe on a throwaway `_l2_probe` table):** PASS.
  READ COMMITTED → T1 ok, T2 **waited ~1.18 s on the advisory lock** then ok, exactly one
  "month" (3 rows), no `P2002`. SERIALIZABLE (old code) → T2 rejected with SQLSTATE `40001`
  (serialization_failure → Prisma `P2034`) even after waiting the lock, reproducing the
  finding. No business/metadata rows touched. Confirms: (a) the lock serializes same-key runs
  (AC2), (b) READ COMMITTED yields the clean happy path, (c) the `UNIQUE` net holds
  (no doubled month — AC3).
- **Full local build + suite (after de-symlinking the worktree `node_modules` — real `pnpm install`, Prisma regenerated):** `pnpm build` → **5/5 tasks**, incl. `@pawly/web:build` — the Turbopack "points out of the filesystem root" blocker the dev had deferred to the main checkout is resolved by a real local install, so the production web build is now confirmed here. `pnpm --filter @pawly/api test` → **897/897** (33 suites), `@pawly/web` → **756/756** (51 files, incl. `client.spec.ts`), `@pawly/validators` → **777/777** = **2430 green**. Live L2 re-confirmed PASS in the de-symlinked state.
- **Visual verification:** N/A — server-only transport + service, no rendered surface.
