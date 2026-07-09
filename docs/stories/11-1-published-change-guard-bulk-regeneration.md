# Story: 11-1-published-change-guard-bulk-regeneration — Extend Published-Change Guard to Bulk Regeneration

**Epic:** Epic 11 — Planning Engine Hardening & Compliance
**Status:** ready-for-dev
**Branch:** feature/KON-118-11-1-published-change-guard-bulk-regeneration
**Ticket:** KON-118 (Linear · project Pawly · milestone Epic 11)
**Origin:** Multi-agent planning audit 2026-07-08 — convergent CRITICAL #1 (both audits). See `docs/epics-context/epic-11-context.md` § 0.1.

> **Read first:** `docs/epics-context/epic-11-context.md` — audit synthesis, file:line anchors, and the cross-cutting invariants every Epic 11 story MUST preserve. Line numbers below are anchors as of the audit commit and may have drifted — re-locate the symbol, do not trust the number blindly (they were re-verified during story authoring on `develop`).

## User Story

**As an** admin, **I want** the published-change guard to fire when I regenerate or purge a *published* month (not only when I move a single shift), **so that** a bulk operation can never silently wipe a published, confirmed schedule without my acknowledgement and without notifying staff.

## Acceptance Criteria

1. **Given** a month whose `PlanningPeriodStatus` is `PUBLISHED`, **When** `generateMonthlyPlan` is called **without** `acknowledgePublishedChange: true`, **Then** the service throws `ConflictException('PUBLISHED_CHANGE_REQUIRES_ACK')` **before** any deletion or creation (the `$transaction` never runs) and no data changes.
2. **Given** a month whose `PlanningPeriodStatus` is `PUBLISHED`, **When** `deleteGeneratedShifts` is called **without** `acknowledgePublishedChange: true`, **Then** the service throws `ConflictException('PUBLISHED_CHANGE_REQUIRES_ACK')` and no shift is deleted.
3. **Given** an acknowledged bulk operation (or any operation on a `DRAFT` month), **Then** the bulk `deleteMany` **excludes** `isConfirmed = true` shifts **and** shifts carrying `VarianceEvent` history (`varianceEvents: { none: {} }`) — those are preserved, never deleted (the `VarianceEvent` cascade must not erase no-show / clock-in history). Only unconfirmed, history-free `GENERATED` shifts are cleared.
4. **Given** an acknowledged bulk operation on a `PUBLISHED` month, **Then** that month's `PlanningPeriodStatus` records `amendedAt = now()` and increments `amendmentCount` (`recordAmendment`), and every affected employee receives a `schedule-changed` email + push (`notifyScheduleChange`), regardless of `notifyOnPublish`. For regeneration the recipients are the union of employees whose shifts were cleared and the freshly generated assignees; for purge, the employees whose shifts were cleared. Notification failures are logged, never block the operation.
5. **Given** the admin Generation Panel on a `PUBLISHED` month, **When** the admin clicks "Generate" or "Delete generated", **Then** `PublishedChangeDialog` opens; confirming re-fires the operation with `acknowledgePublishedChange: true`; cancelling leaves the schedule untouched. On a `DRAFT` month behaviour is unchanged (no dialog).
6. **Given** the guard throwing `PUBLISHED_CHANGE_REQUIRES_ACK`, **Then** the Generation Panel surfaces a translated toast (never the raw code) in FR and EN.

**FRs covered:** FR5, FR7, FR10. **NFRs:** NFR3.

## Tasks

- [x] **Task 1: Add `acknowledgePublishedChange` to the generation validators** [AC: 1, 2]
  In `packages/validators/src/planning/planning-generation.schema.ts`, replace the `generatePlanSchema` block (currently lines 13–17) with:
  ```ts
  export const generatePlanSchema = z.object({
    month: monthSchema,
    templateId: z.string().uuid("Template ID must be a valid UUID"),
    // Story 11-1 — bulk regeneration now honours the 7-6 published-change guard.
    acknowledgePublishedChange: z.boolean().default(false),
  });
  export type GeneratePlanInput = z.infer<typeof generatePlanSchema>;
  ```
  and replace the `deleteGeneratedShiftsSchema` block (currently lines 28–33) with:
  ```ts
  export const deleteGeneratedShiftsSchema = z.object({
    month: monthSchema,
    // Story 11-1 — purging generated shifts of a published month needs ack.
    acknowledgePublishedChange: z.boolean().default(false),
  });
  export type DeleteGeneratedShiftsInput = z.infer<
    typeof deleteGeneratedShiftsSchema
  >;
  ```
  Then append this block to the **end** of `packages/validators/src/planning/planning-generation.schema.test.ts` (both schemas are already imported at the top of that file):
  ```ts
  describe("acknowledgePublishedChange (story 11-1)", () => {
    const validTemplateId = "550e8400-e29b-41d4-a716-446655440000";

    it("defaults acknowledgePublishedChange to false on generatePlanSchema", () => {
      const parsed = generatePlanSchema.parse({
        month: "2026-07",
        templateId: validTemplateId,
      });
      expect(parsed.acknowledgePublishedChange).toBe(false);
    });

    it("accepts acknowledgePublishedChange: true on generatePlanSchema", () => {
      const parsed = generatePlanSchema.parse({
        month: "2026-07",
        templateId: validTemplateId,
        acknowledgePublishedChange: true,
      });
      expect(parsed.acknowledgePublishedChange).toBe(true);
    });

    it("defaults acknowledgePublishedChange to false on deleteGeneratedShiftsSchema", () => {
      const parsed = deleteGeneratedShiftsSchema.parse({ month: "2026-07" });
      expect(parsed.acknowledgePublishedChange).toBe(false);
    });

    it("accepts acknowledgePublishedChange: true on deleteGeneratedShiftsSchema", () => {
      const parsed = deleteGeneratedShiftsSchema.parse({
        month: "2026-07",
        acknowledgePublishedChange: true,
      });
      expect(parsed.acknowledgePublishedChange).toBe(true);
    });
  });
  ```
  Run: `pnpm --filter @pawly/validators test -- planning-generation.schema`
  Expected: all tests pass (existing + 4 new), exit 0.
  Commit: `git add packages/validators/src/planning/planning-generation.schema.ts packages/validators/src/planning/planning-generation.schema.test.ts && git commit -m "feat(KON-118): add acknowledgePublishedChange to generation schemas"`

- [x] **Task 2: Extend the guard + preservation + amendment to `generateMonthlyPlan`** [AC: 1, 3, 4]
  In `apps/api/src/modules/planning/planning-generation.service.ts`:

  **2a.** Change the method signature (currently lines 117–121) to add the `options` param:
  ```ts
    async generateMonthlyPlan(
      clinicId: string,
      month: string,
      templateId: string,
      options: { acknowledgePublishedChange?: boolean } = {},
    ): Promise<GenerationResult> {
  ```

  **2b.** Immediately after the `MONTH_REGEX` validation block (the `if (!PlanningGenerationService.MONTH_REGEX.test(month)) { … }`), insert the guard so it fails **before** any template fetch or deletion:
  ```ts
      // Story 11-1 — extend the 7-6 published-change guard to bulk regeneration:
      // regenerating a PUBLISHED month must be explicitly acknowledged, mirroring
      // moveShift/createManualShift/deleteShift.
      const publishedMonths = await this.assertPublishedChangeAcknowledged(
        clinicId,
        [month],
        options.acknowledgePublishedChange ?? false,
      );
  ```

  **2c.** Immediately **before** the `let createdShifts: Array<{ … }>;` declaration (currently ~line 358), insert the affected-employee capture:
  ```ts
      // Story 11-1 — collect the employees whose GENERATED shifts are about to be
      // cleared, so they can be notified (union with the new assignees below).
      // Confirmed shifts and shifts carrying clock-in / no-show history
      // (VarianceEvent) are preserved and never counted here.
      let deletedEmployeeIds: string[] = [];
      if (publishedMonths.length > 0) {
        const toDelete = await this.prisma.shift.findMany({
          where: {
            clinicId,
            source: 'GENERATED',
            isConfirmed: false,
            varianceEvents: { none: {} },
            date: { gte: monthStart, lte: monthEnd },
          },
          select: { employeeId: true },
          distinct: ['employeeId'],
        });
        deletedEmployeeIds = toDelete.map((s) => s.employeeId);
      }
  ```

  **2d.** Replace the `deleteMany` inside the `$transaction` (currently lines 369–375) with the preservation predicate:
  ```ts
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
  ```

  **2e.** Immediately **before** the `planningGenerationDuration.record(…)` call (currently ~line 405, right after the `try/catch` transaction block closes), insert the amendment + notification:
  ```ts
      // Story 11-1 — a regeneration of a PUBLISHED month is an amendment: bump
      // amendedAt/amendmentCount and notify every affected employee (those whose
      // shifts were cleared UNION the freshly generated assignees). Mirrors the
      // moveShift path; notification failures are logged, never block generation.
      if (publishedMonths.length > 0) {
        const recipientIds = [
          ...new Set([
            ...deletedEmployeeIds,
            ...createdShifts.map((s) => s.employeeId),
          ]),
        ];
        await this.recordAmendment(clinicId, publishedMonths);
        this.notifyScheduleChange(
          clinicId,
          recipientIds.map((employeeId) => ({ employeeId, month })),
        ).catch((err: Error) =>
          this.logger.error(`Notify schedule-change failed: ${err.message}`),
        );
      }
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no new type errors referencing `generateMonthlyPlan` / `varianceEvents`, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-118): guard + preserve confirmed/variance shifts on generateMonthlyPlan"`

- [x] **Task 3: Extend the guard + preservation + amendment to `deleteGeneratedShifts`** [AC: 2, 3, 4]
  In `apps/api/src/modules/planning/planning-generation.service.ts`, replace the **entire** `deleteGeneratedShifts` method (currently lines 1334–1357) with:
  ```ts
    async deleteGeneratedShifts(
      clinicId: string,
      month: string,
      options: { acknowledgePublishedChange?: boolean } = {},
    ): Promise<{ deletedCount: number }> {
      if (!PlanningGenerationService.MONTH_REGEX.test(month)) {
        throw new BadRequestException(
          `Invalid month format: ${month}. Expected YYYY-MM`,
        );
      }

      // Story 11-1 — purging a PUBLISHED month must be acknowledged (7-6 guard).
      const publishedMonths = await this.assertPublishedChangeAcknowledged(
        clinicId,
        [month],
        options.acknowledgePublishedChange ?? false,
      );

      const [year, monthNum] = month.split('-').map(Number);
      const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
      const monthEnd = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));

      // Story 11-1 — capture affected employees BEFORE deletion so we can notify
      // them. Confirmed shifts and shifts carrying variance history are preserved.
      let deletedEmployeeIds: string[] = [];
      if (publishedMonths.length > 0) {
        const toDelete = await this.prisma.shift.findMany({
          where: {
            clinicId,
            source: 'GENERATED',
            isConfirmed: false,
            varianceEvents: { none: {} },
            date: { gte: monthStart, lte: monthEnd },
          },
          select: { employeeId: true },
          distinct: ['employeeId'],
        });
        deletedEmployeeIds = toDelete.map((s) => s.employeeId);
      }

      // Story 11-1 — preserve confirmed shifts and shifts carrying variance
      // history; only these unconfirmed, history-free GENERATED shifts are purged.
      const { count } = await this.prisma.shift.deleteMany({
        where: {
          clinicId,
          source: 'GENERATED',
          isConfirmed: false,
          varianceEvents: { none: {} },
          date: { gte: monthStart, lte: monthEnd },
        },
      });

      // Story 11-1 — a purge of a PUBLISHED month is an amendment: record it and
      // notify affected employees. Notification failures are logged, never block.
      if (publishedMonths.length > 0) {
        await this.recordAmendment(clinicId, publishedMonths);
        this.notifyScheduleChange(
          clinicId,
          deletedEmployeeIds.map((employeeId) => ({ employeeId, month })),
        ).catch((err: Error) =>
          this.logger.error(`Notify schedule-change failed: ${err.message}`),
        );
      }

      return { deletedCount: count };
    }
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no new type errors referencing `deleteGeneratedShifts`, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-118): guard + preserve confirmed/variance shifts on deleteGeneratedShifts"`

- [x] **Task 4: Thread `acknowledgePublishedChange` through the router** [AC: 1, 2, 5]
  In `apps/api/src/trpc/routers/planning.router.ts`, replace the `generatePlan` procedure body call (currently lines 233–239) with:
  ```ts
        const result = await ctx.planningGenerationService.generateMonthlyPlan(
          ctx.user.clinicId,
          input.month,
          input.templateId,
          { acknowledgePublishedChange: input.acknowledgePublishedChange },
        );
        await ctx.redis.invalidatePattern(`schedule:${ctx.user.clinicId}:*`);
        await ctx.redis.invalidatePattern(`planning:pub:${ctx.user.clinicId}:*`);
        await ctx.redis.del(`dashboard:stats:${ctx.user.clinicId}`);
  ```
  and replace the `deleteGeneratedShifts` procedure body call (currently lines 257–262) with:
  ```ts
        const result = await ctx.planningGenerationService.deleteGeneratedShifts(
          ctx.user.clinicId,
          input.month,
          { acknowledgePublishedChange: input.acknowledgePublishedChange },
        );
        await ctx.redis.invalidatePattern(`schedule:${ctx.user.clinicId}:*`);
        await ctx.redis.invalidatePattern(`planning:pub:${ctx.user.clinicId}:*`);
        await ctx.redis.del(`dashboard:stats:${ctx.user.clinicId}`);
  ```
  (The `planning:pub:*` invalidation keeps the server-side publication-status cache — which the Health Bar "amended" badge reads — coherent after an amendment, matching the `moveShift` procedure.)
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no type errors; `input.acknowledgePublishedChange` resolves (schema from Task 1), exit 0.
  Commit: `git add apps/api/src/trpc/routers/planning.router.ts && git commit -m "feat(KON-118): thread acknowledgePublishedChange through generation router procedures"`

- [x] **Task 5: Backend spec — guard on generate + purge** [AC: 1, 2, 3, 4]
  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, add this block **inside** the top-level `describe('PlanningGenerationService', () => { … })` (place it right after the existing `describe('Story 7.6 — post-publication change management', … )` block). It reuses the file's `mockPrismaService`, `mockMailService`, `mockTemplateService`, `clinicId` and `mockEmployees` already in scope:
  ```ts
  // ─── Story 11-1 — published-change guard on bulk regeneration ──────
  describe('Story 11-1 — bulk regeneration published-change guard', () => {
    const simpleTemplate = {
      id: 'tpl-1',
      name: 'Simple',
      data: {
        days: [
          { dayOfWeek: 1, slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }] },
        ],
      },
      clinicId,
    };

    it('generateMonthlyPlan throws PUBLISHED_CHANGE_REQUIRES_ACK on a published month without acknowledgement', async () => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        { month: '2026-07' },
      ]);
      await expect(
        service.generateMonthlyPlan(clinicId, '2026-07', 'tpl-1'),
      ).rejects.toMatchObject({ message: 'PUBLISHED_CHANGE_REQUIRES_ACK' });
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('generateMonthlyPlan on an acknowledged published month preserves confirmed/variance shifts, records the amendment, and notifies', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(simpleTemplate);
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        { month: '2026-07' },
      ]);
      // employees whose shifts will be cleared (union candidate)
      mockPrismaService.shift.findMany.mockResolvedValue([{ employeeId: 'emp-2' }]);
      mockPrismaService.clinic.findUniqueOrThrow.mockResolvedValue({
        name: 'Test Clinic',
      });
      mockPrismaService.employee.findMany.mockResolvedValue([
        { id: 'emp-1', firstName: 'Alice', lastName: 'Martin', jobType: 'VET', contractHours: 35, email: 'alice@example.com', user: { locale: 'fr' } },
        { id: 'emp-2', firstName: 'Bob', lastName: 'Dupont', jobType: 'ASV', contractHours: 35, email: 'bob@example.com', user: { locale: 'fr' } },
      ]);

      const txDeleteMany = jest.fn().mockResolvedValue({ count: 3 });
      mockPrismaService.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            shift: {
              deleteMany: txDeleteMany,
              createManyAndReturn: jest.fn().mockResolvedValue([
                { id: 's-new', employeeId: 'emp-1', date: new Date('2026-07-06'), startTime: '08:00', endTime: '12:00', shiftTypeCode: 'SURGERY' },
              ]),
            },
          };
          return fn(tx);
        },
      );

      await service.generateMonthlyPlan(clinicId, '2026-07', 'tpl-1', {
        acknowledgePublishedChange: true,
      });

      // preservation predicate on the bulk delete
      expect(txDeleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          source: 'GENERATED',
          isConfirmed: false,
          varianceEvents: { none: {} },
        }),
      });
      // amendment recorded
      expect(mockPrismaService.planningPeriodStatus.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ month: { in: ['2026-07'] } }),
          data: expect.objectContaining({ amendmentCount: { increment: 1 } }),
        }),
      );
      // fire-and-forget notify — flush microtasks then assert union (emp-1 ∪ emp-2)
      await new Promise((r) => setImmediate(r));
      const notified = mockMailService.sendScheduleChangedEmail.mock.calls.map(
        (c: unknown[]) => c[0],
      );
      expect(notified).toEqual(
        expect.arrayContaining(['alice@example.com', 'bob@example.com']),
      );
    });

    it('generateMonthlyPlan on a DRAFT month needs no acknowledgement and records no amendment', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(simpleTemplate);
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);
      mockPrismaService.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            shift: {
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
              createManyAndReturn: jest.fn().mockResolvedValue([]),
            },
          };
          return fn(tx);
        },
      );
      await service.generateMonthlyPlan(clinicId, '2026-07', 'tpl-1');
      expect(mockPrismaService.planningPeriodStatus.updateMany).not.toHaveBeenCalled();
    });

    it('deleteGeneratedShifts throws PUBLISHED_CHANGE_REQUIRES_ACK on a published month without acknowledgement', async () => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        { month: '2026-07' },
      ]);
      await expect(
        service.deleteGeneratedShifts(clinicId, '2026-07'),
      ).rejects.toMatchObject({ message: 'PUBLISHED_CHANGE_REQUIRES_ACK' });
      expect(mockPrismaService.shift.deleteMany).not.toHaveBeenCalled();
    });

    it('deleteGeneratedShifts on an acknowledged published month preserves confirmed/variance shifts, records the amendment, and notifies', async () => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        { month: '2026-07' },
      ]);
      mockPrismaService.shift.findMany.mockResolvedValue([{ employeeId: 'emp-1' }]);
      mockPrismaService.shift.deleteMany.mockResolvedValue({ count: 2 });
      mockPrismaService.clinic.findUniqueOrThrow.mockResolvedValue({ name: 'Test Clinic' });
      mockPrismaService.employee.findMany.mockResolvedValue([
        { id: 'emp-1', firstName: 'Alice', email: 'alice@example.com', user: { locale: 'fr' } },
      ]);

      const result = await service.deleteGeneratedShifts(clinicId, '2026-07', {
        acknowledgePublishedChange: true,
      });

      expect(result.deletedCount).toBe(2);
      expect(mockPrismaService.shift.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          source: 'GENERATED',
          isConfirmed: false,
          varianceEvents: { none: {} },
        }),
      });
      expect(mockPrismaService.planningPeriodStatus.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ month: { in: ['2026-07'] } }),
          data: expect.objectContaining({ amendmentCount: { increment: 1 } }),
        }),
      );
      await new Promise((r) => setImmediate(r));
      expect(mockMailService.sendScheduleChangedEmail).toHaveBeenCalledWith(
        'alice@example.com',
        'Alice',
        '2026-07',
        'Test Clinic',
        'fr',
      );
    });
  });
  ```
  Run: `pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec"`
  Expected: all suites pass including the 5 new `Story 11-1` tests, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-118): guard + preservation + amendment on generate/purge"`

- [x] **Task 6: Surface the guard error + refresh publication status in `useGeneration`** [AC: 5, 6]
  Replace the **entire** contents of `apps/web/src/app/[locale]/admin/planning/_hooks/useGeneration.ts` with:
  ```ts
  "use client";

  import { useCallback } from "react";
  import {
    QueryKeyFactory,
    useServerActionMutation,
    useServerActionQuery,
  } from "@/lib/hooks/server-action-hooks";
  import {
    generatePlanAction,
    listShiftsForMonthAction,
    deleteGeneratedShiftsAction,
  } from "../_actions/generation-actions";
  import { useQueryClient } from "@tanstack/react-query";
  import { useTranslations } from "next-intl";
  import { toast } from "sonner";

  export const useGeneration = (month?: string) => {
    const queryClient = useQueryClient();
    const t = useTranslations("admin.planningGeneration.toast");
    const shiftsQueryKey = QueryKeyFactory.planningShifts(month);

    const invalidateAll = useCallback(() => {
      queryClient.invalidateQueries({
        queryKey: ["planning", "shifts"],
      });
      queryClient.invalidateQueries({
        queryKey: ["planning", "schedule-view"],
      });
      queryClient.invalidateQueries({
        queryKey: ["planning", "equity-counters"],
      });
      queryClient.invalidateQueries({
        queryKey: QueryKeyFactory.planningGeneration(),
      });
      // Story 11-1 — an acknowledged bulk change on a published month bumps
      // amendedAt/amendmentCount; refresh the Health Bar "amended" badge.
      queryClient.invalidateQueries({
        queryKey: QueryKeyFactory.publicationStatus(month),
      });
    }, [queryClient, month]);

    const {
      data: shifts,
      isPending: isLoadingShifts,
      isFetching: isFetchingShifts,
      refetch: refetchShifts,
    } = useServerActionQuery(listShiftsForMonthAction, {
      input: { month: month ?? "" },
      queryKey: shiftsQueryKey,
      enabled: !!month && month.length > 0,
      placeholderData: (prev: unknown) => prev,
    });

    const { mutate: generatePlan, isPending: isGenerating } =
      useServerActionMutation(generatePlanAction, {
        onSuccess: () => {
          invalidateAll();
          toast.success(t("generated"));
        },
        onError: (err: { message?: string }) => {
          if (err?.message === "PUBLISHED_CHANGE_REQUIRES_ACK") {
            toast.error(t("publishedChangeRequired"));
          } else {
            toast.error(t("generateFailed"), { description: err?.message });
          }
        },
      });

    const { mutate: deleteGenerated, isPending: isDeleting } =
      useServerActionMutation(deleteGeneratedShiftsAction, {
        onSuccess: () => {
          invalidateAll();
          toast.success(t("deleted"));
        },
        onError: (err: { message?: string }) => {
          if (err?.message === "PUBLISHED_CHANGE_REQUIRES_ACK") {
            toast.error(t("publishedChangeRequired"));
          } else {
            toast.error(t("deleteFailed"), { description: err?.message });
          }
        },
      });

    return {
      shifts: shifts ?? [],
      isLoadingShifts,
      isFetchingShifts,
      refetchShifts,
      generatePlan,
      isGenerating,
      deleteGenerated,
      isDeleting,
      invalidateAll,
    };
  };
  ```
  Run: `pnpm --filter @pawly/web exec tsc --noEmit 2>&1 | head -20`
  Expected: no type errors, exit 0.
  Commit: `git add "apps/web/src/app/[locale]/admin/planning/_hooks/useGeneration.ts" && git commit -m "feat(KON-118): surface published-change guard + refresh publication status in useGeneration"`

- [x] **Task 7: Route generate/delete through the published-change guard in `GenerationPanel`** [AC: 5]
  In `apps/web/src/app/[locale]/admin/planning/_components/GenerationPanel.tsx`:

  **7a.** After the existing import of `ConfirmDeleteDialog` (currently line 37), add:
  ```ts
  import { PublishedChangeDialog } from './PublishedChangeDialog';
  import { usePublish } from '../_hooks/usePublish';
  import { usePublishedChangeGuard } from '../_hooks/usePublishedChangeGuard';
  ```

  **7b.** Immediately after the `const { scheduleData } = useScheduleView(selectedMonth);` line (currently line 78), add:
  ```ts
    // Story 11-1 — regenerating/purging a PUBLISHED month runs behind the same
    // confirmation guard as manual moves; on a DRAFT month it runs straight through.
    const { publicationStatus } = usePublish(selectedMonth);
    const isPublished = publicationStatus?.status === 'PUBLISHED';
    const {
      guard,
      dialogOpen: publishedChangeOpen,
      confirm: confirmPublishedChange,
      cancel: cancelPublishedChange,
    } = usePublishedChangeGuard(isPublished);
  ```

  **7c.** Replace the `handleGenerate` callback (currently lines 92–108) with:
  ```ts
    const handleGenerate = useCallback(() => {
      if (!selectedTemplateId) return;

      if (existingGeneratedCount > 0) {
        setShowConfirm(true);
        return;
      }

      guard((acknowledge) =>
        generatePlan(
          {
            month: selectedMonth,
            templateId: selectedTemplateId,
            acknowledgePublishedChange: acknowledge,
          },
          {
            onSuccess: (result: GenerationResult) => {
              setGenerationResult(result);
            },
          }
        )
      );
    }, [selectedMonth, selectedTemplateId, existingGeneratedCount, generatePlan, guard]);
  ```

  **7d.** Replace the `handleConfirmRegenerate` callback (currently lines 110–120) with:
  ```ts
    const handleConfirmRegenerate = useCallback(() => {
      setShowConfirm(false);
      guard((acknowledge) =>
        generatePlan(
          {
            month: selectedMonth,
            templateId: selectedTemplateId,
            acknowledgePublishedChange: acknowledge,
          },
          {
            onSuccess: (result: GenerationResult) => {
              setGenerationResult(result);
            },
          }
        )
      );
    }, [selectedMonth, selectedTemplateId, generatePlan, guard]);
  ```

  **7e.** Replace the `<ConfirmDeleteDialog … />` element (currently lines 338–346) with the guarded version **plus** the published-change dialog:
  ```tsx
        <ConfirmDeleteDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          onConfirm={() => {
            setShowDeleteConfirm(false);
            guard((acknowledge) =>
              deleteGenerated({
                month: selectedMonth,
                acknowledgePublishedChange: acknowledge,
              })
            );
          }}
          existingCount={existingGeneratedCount}
        />

        <PublishedChangeDialog
          open={publishedChangeOpen}
          onConfirm={confirmPublishedChange}
          onCancel={cancelPublishedChange}
        />
  ```
  Run: `pnpm --filter @pawly/web exec tsc --noEmit 2>&1 | head -20`
  Expected: no type errors, exit 0.
  Commit: `git add "apps/web/src/app/[locale]/admin/planning/_components/GenerationPanel.tsx" && git commit -m "feat(KON-118): route generate/delete through published-change guard in GenerationPanel"`

- [x] **Task 8: Add the `publishedChangeRequired` toast key (FR + EN)** [AC: 6]
  In `apps/web/src/i18n/langs/fr.json`, inside `admin.planningGeneration.toast`, add the key after `"deleteFailed"` (mind the trailing comma on the preceding line):
  ```json
        "publishedChangeRequired": "Ce planning est publié : confirmez la modification via la boîte de dialogue."
  ```
  In `apps/web/src/i18n/langs/en.json`, inside `admin.planningGeneration.toast`, add after `"deleteFailed"`:
  ```json
        "publishedChangeRequired": "This schedule is published: confirm the change via the dialog."
  ```
  Run: `node -e "JSON.parse(require('fs').readFileSync('apps/web/src/i18n/langs/fr.json','utf8'));JSON.parse(require('fs').readFileSync('apps/web/src/i18n/langs/en.json','utf8'));console.log('json ok')"`
  Expected: prints `json ok`, exit 0 (both files still valid JSON).
  Commit: `git add apps/web/src/i18n/langs/fr.json apps/web/src/i18n/langs/en.json && git commit -m "feat(KON-118): add publishedChangeRequired toast key (fr/en)"`

- [x] **Task 9: Web spec — delete on a published month routes through the guard** [AC: 5]
  In `apps/web/src/app/[locale]/admin/planning/__tests__/generation.spec.tsx`, add a `usePublish` mock next to the existing `vi.mock("../_hooks/useGeneration", …)` at the top of the file:
  ```ts
  vi.mock("../_hooks/usePublish", () => ({
    usePublish: vi.fn(() => ({
      publicationStatus: { status: "DRAFT", publishedAt: null, publishedBy: null },
      isLoadingStatus: false,
      publishPreview: undefined,
      isLoadingPreview: false,
      publishPlan: vi.fn(),
      isPublishing: false,
    })),
  }));
  ```
  Then add this test at the **end** of the `describe("GenerationPanel", () => { … })` block (it reuses the file's `Wrapper` and `defaultPanelProps` — `month: "2026-03"`):
  ```ts
    it("routes delete through the published-change dialog and acknowledges (story 11-1)", async () => {
      const deleteGeneratedSpy = vi.fn();
      const { useGeneration } = await import("../_hooks/useGeneration");
      vi.mocked(useGeneration).mockReturnValue({
        shifts: [
          { id: "s1", source: "GENERATED", shiftTypeCode: "SURGERY", employee: { id: "e1" } },
        ],
        isLoadingShifts: false,
        isFetchingShifts: false,
        refetchShifts: vi.fn(),
        generatePlan: vi.fn(),
        isGenerating: false,
        deleteGenerated: deleteGeneratedSpy,
        isDeleting: false,
        invalidateAll: vi.fn(),
      } as any);

      const { usePublish } = await import("../_hooks/usePublish");
      vi.mocked(usePublish).mockReturnValue({
        publicationStatus: { status: "PUBLISHED", publishedAt: "2026-07-01", publishedBy: "admin" },
        isLoadingStatus: false,
        publishPreview: undefined,
        isLoadingPreview: false,
        publishPlan: vi.fn(),
        isPublishing: false,
      } as any);

      render(<GenerationPanel {...defaultPanelProps} />, { wrapper: Wrapper });

      // 1) open the "delete generated" confirmation
      fireEvent.click(screen.getByText("deleteGenerated"));
      // 2) confirm deletion → closes ConfirmDeleteDialog, opens PublishedChangeDialog
      fireEvent.click(screen.getByRole("button", { name: "confirm" }));
      // 3) confirm the published change → fires deleteGenerated with ack: true
      fireEvent.click(screen.getByRole("button", { name: "confirm" }));

      expect(deleteGeneratedSpy).toHaveBeenCalledWith({
        month: "2026-03",
        acknowledgePublishedChange: true,
      });
    });
  ```
  Run: `pnpm --filter @pawly/web test -- generation`
  Expected: all tests in `generation.spec.tsx` pass including the new one, exit 0.
  Commit: `git add "apps/web/src/app/[locale]/admin/planning/__tests__/generation.spec.tsx" && git commit -m "test(KON-118): GenerationPanel delete routes through published-change guard"`

- [x] **Task 10: Full verification + story bookkeeping** [AC: all]
  Run the whole test matrix and the build to confirm nothing regressed:
  ```bash
  pnpm test
  pnpm build
  ```
  Expected: `pnpm test` — turbo all workspaces green (API ≥ 830 tests, web ≥ 745, validators ≥ 764), exit 0. `pnpm build` — all tasks successful, exit 0.
  > If `pnpm build` stalls at 0% CPU, it is the iCloud `.git` eviction issue (see project memory `icloud-git-eviction`), **not** a code error — retry, do not "fix" the build.
  Commit: `git add docs/stories/11-1-published-change-guard-bulk-regeneration.md docs/state.yaml && git commit -m "docs(KON-118): mark ready-for-dev bookkeeping"`

## Dev Notes

### Non-Goals — deferred to later Epic 11 stories

- **Making the generation loop aware of surviving (confirmed / manual) shifts to avoid double-booking, and the `Shift` `@@unique` constraint → Story 11-2** (`depends_on: 11-1`). Because 11-1 preserves confirmed shifts while the generator is still blind (pre-11-2), a regeneration of a published month **may** produce an overlapping shift for a preserved slot. This is the documented wave dependency (W1 11-1 → W2 11-2). Ship them together. Do **not** attempt generator-awareness or the DB unique here.
- **Wrapping the amendment/purge in a transaction with in-transaction re-check + Redis coherence → Story 11-6.**
- **Idempotency / advisory locks against retry-driven duplication → Story 11-5.**

### Architecture

- **Data flow (non-negotiable):** `Page (RSC) → Client Component → Hook → Zsa → Server Action → tRPC Client → NestJS Service → Prisma`. This story touches the service, router, one server-action-backed hook, and one client component — no new layer.
- **Auth/tenancy:** both procedures are already `subscribedProcedure` + `adminOnly(ctx.user.role)`; `clinicId` comes from `ctx.user.clinicId`, never the client payload. Do not change this.
- **The 7-6 guard is now a whole-surface invariant** (epic-context § 3.2): every path that mutates shifts of a PUBLISHED month goes through `assertPublishedChangeAcknowledged` + `recordAmendment` + `notifyScheduleChange`. This story closes the bulk hole; do not re-open it elsewhere.
- **Reuse, do not reinvent:** the FE guard (`usePublishedChangeGuard`) and the confirmation dialog (`PublishedChangeDialog`) already exist and are used by the schedule grid — reuse both verbatim. No new component.
- **Notify scope decision (locked with Alex):** regeneration notifies `deletedEmployeeIds ∪ new assignees`; purge notifies `deletedEmployeeIds`. **Preservation decision (locked with Alex):** the bulk `deleteMany` excludes `isConfirmed=true` OR shifts with a `VarianceEvent` (`varianceEvents: { none: {} }`) — a history-based cutoff, deliberately chosen over a `new Date()` past-day cutoff (which would make generation clock-dependent, break the date-hardcoded `generateMonthlyPlan` specs, and duplicate past days on DRAFT regenerations).

### Existing code at write time (Step-0 verbatim quotes — re-verify the symbol, line numbers may drift)

`apps/api/src/modules/planning/planning-generation.service.ts:1683-1698` — the guard this story extends to bulk:
```ts
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
```

`planning-generation.service.ts:1700-1709` — `recordAmendment` (reuse as-is):
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

`planning-generation.service.ts:1716-1719` — `notifyScheduleChange` signature (reuse as-is; recipient shape is `{ employeeId, month }`):
```ts
  private async notifyScheduleChange(
    clinicId: string,
    recipients: Array<{ employeeId: string; month: string }>,
  ): Promise<void> {
```

`planning-generation.service.ts:366-403` — the current generation transaction whose `deleteMany` (368-375) is the exact hole (deletes GENERATED unconditionally, including `isConfirmed=true`):
```ts
    try {
      createdShifts = await this.prisma.$transaction(async (tx) => {
        // Delete existing generated shifts first (inside transaction for atomicity)
        await tx.shift.deleteMany({
          where: {
            clinicId,
            source: 'GENERATED',
            date: { gte: monthStart, lte: monthEnd },
          },
        });

        if (assignedShifts.length === 0) return [];
        return tx.shift.createManyAndReturn({ /* … unchanged … */ });
      });
    } catch (error: unknown) { /* … unchanged P2002 / 500 handling … */ }
```

`planning-generation.service.ts:1334-1357` — `deleteGeneratedShifts` (replaced wholesale in Task 3):
```ts
  async deleteGeneratedShifts(
    clinicId: string,
    month: string,
  ): Promise<{ deletedCount: number }> {
    // … MONTH_REGEX check, monthStart/monthEnd …
    const { count } = await this.prisma.shift.deleteMany({
      where: { clinicId, source: 'GENERATED', date: { gte: monthStart, lte: monthEnd } },
    });
    return { deletedCount: count };
  }
```

`apps/api/prisma/schema/Planning.prisma:106-118` — why preservation matters: `VarianceEvent.shift` is `onDelete: Cascade`, so deleting a worked shift silently erases its clock-in/no-show record:
```prisma
model VarianceEvent {
  // …
  shift   Shift  @relation(fields: [shiftId], references: [id], onDelete: Cascade)
  shiftId String @map("shift_id")
  // …
}
```
(`Shift` has **no** `@@unique` on `(employeeId, date, slot)` — that is Story 11-2, not here.)

`apps/web/.../_hooks/usePublishedChangeGuard.ts` and `.../_components/PublishedChangeDialog.tsx` — reused verbatim. `usePublish(month)` returns `{ publicationStatus: { status: "DRAFT" | "PUBLISHED"; … } | undefined, … }`.

### File decision map

**Modify (backend)**
- `packages/validators/src/planning/planning-generation.schema.ts` — add `acknowledgePublishedChange` to `generatePlanSchema` + `deleteGeneratedShiftsSchema`. *Single responsibility:* generation I/O contracts. *In/out:* imports `@pawly/zod`; exports the two schemas + inferred types consumed by the router and web actions.
- `packages/validators/src/planning/planning-generation.schema.test.ts` — 4 new schema tests.
- `apps/api/src/modules/planning/planning-generation.service.ts` — extend `generateMonthlyPlan` + `deleteGeneratedShifts` with guard, preservation predicate, amendment, notify. *Single responsibility:* generation loop + shift mutations. *In/out:* uses `assertPublishedChangeAcknowledged`/`recordAmendment`/`notifyScheduleChange` (same file), Prisma; returns `GenerationResult` / `{ deletedCount }`.
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` — 5 new `Story 11-1` tests.
- `apps/api/src/trpc/routers/planning.router.ts` — thread `input.acknowledgePublishedChange` + add `planning:pub:*` invalidation to `generatePlan` / `deleteGeneratedShifts`. *Single responsibility:* HTTP surface + cache invalidation.

**Modify (frontend)**
- `apps/web/src/app/[locale]/admin/planning/_hooks/useGeneration.ts` — guard-error toast + `publicationStatus` invalidation.
- `apps/web/src/app/[locale]/admin/planning/_components/GenerationPanel.tsx` — `usePublish` → `isPublished`, `usePublishedChangeGuard` + `PublishedChangeDialog`, route generate/delete through the guard.
- `apps/web/src/app/[locale]/admin/planning/__tests__/generation.spec.tsx` — 1 new interaction test + `usePublish` mock.
- `apps/web/src/i18n/langs/fr.json`, `apps/web/src/i18n/langs/en.json` — `admin.planningGeneration.toast.publishedChangeRequired`.

**Create:** none.

### Testing

- **API:** Jest, `*.spec.ts`. `pnpm --filter @pawly/api test -- --testPathPatterns "planning-generation.service.spec"`. Fire-and-forget `notifyScheduleChange` is flushed with `await new Promise((r) => setImmediate(r))` before asserting emails (existing 7-6 pattern).
- **Web:** Vitest, `vitest run`. `pnpm --filter @pawly/web test -- generation`. `useTranslations` is globally mocked to return the key, so both dialogs render their action button as text `"confirm"`; the two dialogs never overlap (Radix closes the first before opening the second), so `getByRole("button", { name: "confirm" })` is unambiguous per step.
- **Validators:** Vitest, `vitest run`. `pnpm --filter @pawly/validators test -- planning-generation.schema`.
- **Typecheck:** `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json` and `pnpm --filter @pawly/web exec tsc --noEmit`.
- **Full gate:** `pnpm test` then `pnpm build`.

### Dependencies

- No new libraries. `date-fns` is **not** installed in `apps/api` — this story adds no date math beyond the existing `Date.UTC` month bounds (native JS). Prisma relation filter `varianceEvents: { none: {} }` is standard Prisma (no new import).
- Per **L4** (epic-context § 5): if any Prisma relation-filter / transaction semantics are unclear, consult Context7 (`/prisma/docs`) and record it here in the Dev Agent Record.
- Per **L-audit** (epic-context § 5): "verified" means every guard entry-point. This story adds 2 new guarded entry-points (`generateMonthlyPlan`, `deleteGeneratedShifts`) — both must be exercised by the specs above (Task 5) **and** the FE path (Task 9). Do not declare done until both bulk paths are covered.
- Per **L2/L3:** cross-reference the epic-context invariants (§ 3) and the PRD FRs (FR5/FR7/FR10, NFR3) during review; unit tests alone are not sufficient sign-off for a guard.

## File List

**Modify (backend):**
- `packages/validators/src/planning/planning-generation.schema.ts`
- `packages/validators/src/planning/planning-generation.schema.test.ts`
- `apps/api/src/modules/planning/planning-generation.service.ts`
- `apps/api/src/modules/planning/planning-generation.service.spec.ts`
- `apps/api/src/trpc/routers/planning.router.ts`

**Modify (frontend):**
- `apps/web/src/app/[locale]/admin/planning/_hooks/useGeneration.ts`
- `apps/web/src/app/[locale]/admin/planning/_components/GenerationPanel.tsx`
- `apps/web/src/app/[locale]/admin/planning/__tests__/generation.spec.tsx`
- `apps/web/src/i18n/langs/fr.json`
- `apps/web/src/i18n/langs/en.json`

**Create:** none.

## Dev Agent Record

- **Model:** claude-opus-4-8[1m]
- **Started:** 2026-07-09
- **Completed:** 2026-07-09

### Summary

Closed the convergent-CRITICAL #1 bulk hole: `generateMonthlyPlan` and
`deleteGeneratedShifts` now route through the Story 7-6 published-change guard
(`assertPublishedChangeAcknowledged` → `recordAmendment` → `notifyScheduleChange`)
and their bulk `deleteMany` preserves `isConfirmed=true` shifts and any shift
carrying `VarianceEvent` history (`varianceEvents: { none: {} }`), so a
regeneration/purge of a published month can never silently wipe a confirmed
schedule or erase clock-in/no-show records. The `acknowledgePublishedChange`
flag flows validators → router → service; the admin Generation Panel reuses the
existing `PublishedChangeDialog` + `usePublishedChangeGuard` verbatim and shows a
translated toast (FR/EN) on `PUBLISHED_CHANGE_REQUIRES_ACK`. Prisma `none`
relation-filter semantics confirmed via Context7 (`/prisma/web`,
`relation-queries.mdx`): returns rows with zero related records — exactly the
preservation cutoff. Scope held to 11-1; generator-awareness of surviving shifts
and the `@@unique` net stay in 11-2 (documented wave dependency).

### Files changed

- `packages/validators/src/planning/planning-generation.schema.ts`
- `packages/validators/src/planning/planning-generation.schema.test.ts`
- `apps/api/src/modules/planning/planning-generation.service.ts`
- `apps/api/src/modules/planning/planning-generation.service.spec.ts`
- `apps/api/src/trpc/routers/planning.router.ts`
- `apps/api/src/trpc/routers/planning.router.spec.ts` *(not in the original File List — see Deviations)*
- `apps/web/src/app/[locale]/admin/planning/_hooks/useGeneration.ts`
- `apps/web/src/app/[locale]/admin/planning/_components/GenerationPanel.tsx`
- `apps/web/src/app/[locale]/admin/planning/__tests__/generation.spec.tsx`
- `apps/web/src/i18n/langs/fr.json`
- `apps/web/src/i18n/langs/en.json`

### Deviations

- **`planning.router.spec.ts` added to the change set (not in File List).** Threading
  the ack flag changed the service-call arity that three existing router tests
  asserted (`generateMonthlyPlan` 3→4 args, `deleteGeneratedShifts` 2→3 args),
  breaking them. Updated those assertions and — per **L-audit** (every guard
  entry-point must be exercised) — added `forward-flag` + `planning:pub`
  invalidation tests for both bulk procedures, mirroring the existing 7-6
  moveShift pattern.
- **Fixed the Task 5 generate-acknowledged test mock.** The story's
  `shift.findMany.mockResolvedValue([{ employeeId: 'emp-2' }])` collides with
  `loadBorderWeekShifts`, which also calls `shift.findMany` and needs full shift
  rows (crashed on `s.date.toISOString()`). Replaced with a `mockImplementation`
  keyed on the `varianceEvents` predicate so only the 11-1 capture query returns
  `emp-2` while border-week loading returns `[]` (the default every other generate
  test relies on). AC-4's notify-union intent is preserved.
- **Combined Task 2 + Task 3 into one service commit.** Both edit the same file
  with the identical guard/preservation/amendment pattern; non-interactive staging
  can't split one file into two commits. No behavioural difference.
- **Rebuilt `@pawly/validators` dist.** Both apps resolve `@pawly/validators`
  through its gitignored built `dist/*.d.ts`; after adding the schema field the
  dist was rebuilt so downstream `tsc` sees `acknowledgePublishedChange`. Build
  artefact only, no commit.
- **AC-6 toast + dialog live-visual deferred to review.** `useGeneration`'s
  error→toast mapping has no unit test (the hook is mocked in the web spec); it is
  verified by the FR/EN key presence (Task 8) + the hook logic + the Task 9
  interaction test that drives the dialog. Live toast text and the reused
  `PublishedChangeDialog` visual are to be confirmed in aped-review's L2 journey
  (the dialog itself is unchanged from 7-6, where it was visually verified).
- **Pre-existing `tsc --noEmit` noise (not introduced here).** `apps/api` surfaces
  type errors in unrelated spec fixtures (`clinic`/`employee`/`planning.service`
  specs) and the L5 `@pawly/api/trpc-types` `AppRouter` resolution before the API
  is built. My files are `tsc`-clean and `pnpm build` (ordered declaration pass) is
  green.

### Test output

Full matrix (run via per-workspace `--filter`; root `pnpm test` is broken by the
local `rtk` turbo shim, unrelated to this story):

```
@pawly/validators  → Test Files 27 passed (27) · Tests 773 passed (773)
@pawly/api         → Test Suites 32 passed (32) · Tests 860 passed (860)
@pawly/web         → Test Files 49 passed (49) · Tests 746 passed (746)
pnpm build         → Tasks: 5 successful, 5 total
```

Story-specific: the 5 `Story 11-1` service specs (guard/preserve/amend/notify on
generate + purge), 4 new validator schema tests, 4 new/updated router tests
(forward flag + `planning:pub` invalidation on both bulk procedures), and the
web `routes delete through the published-change dialog and acknowledges` test all
pass. AC-to-test trace: AC1 → generate-throws spec; AC2 → delete-throws spec;
AC3 → preservation-predicate assertions on both `deleteMany` calls; AC4 →
`updateMany amendmentCount increment` + notify assertions; AC5 → web dialog
interaction test + router forward tests; AC6 → FR/EN key + hook mapping (live at
review).
