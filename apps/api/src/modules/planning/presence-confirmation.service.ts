import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { DEVIATION_THRESHOLD_MINUTES } from '@pawly/validators';
import type { ConfirmShiftResult } from '@pawly/types';

@Injectable()
export class PresenceConfirmationService {
  private readonly logger = new Logger(PresenceConfirmationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async confirmPresence(
    clinicId: string,
    employeeId: string,
    shiftId: string,
    actualStartTime?: string,
  ): Promise<ConfirmShiftResult> {
    // 1. Load shift
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      select: {
        id: true,
        employeeId: true,
        clinicId: true,
        date: true,
        startTime: true,
        endTime: true,
        isConfirmed: true,
      },
    });

    if (!shift) {
      throw new NotFoundException(`Shift ${shiftId} not found`);
    }

    // 2. Guard: shift belongs to employee
    if (shift.employeeId !== employeeId) {
      throw new ForbiddenException('Shift does not belong to this employee');
    }

    // 3. Guard: shift belongs to clinic
    if (shift.clinicId !== clinicId) {
      throw new ForbiddenException('Shift does not belong to this clinic');
    }

    // 4. Guard: idempotent — already confirmed returns success
    if (shift.isConfirmed) {
      return {
        shiftId,
        isConfirmed: true,
        deltaMinutes: 0,
        varianceType: 'CLOCK_IN_DEVIATION',
      };
    }

    // 5. Guard: no future confirmation
    const today = new Date();
    const shiftDate = shift.date;
    const todayYMD = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
    const shiftYMD = `${shiftDate.getUTCFullYear()}-${String(shiftDate.getUTCMonth() + 1).padStart(2, '0')}-${String(shiftDate.getUTCDate()).padStart(2, '0')}`;

    if (shiftYMD > todayYMD) {
      throw new BadRequestException('Cannot confirm a future shift');
    }

    // 6. Compute actualTime (before transaction, no DB dependency)
    const actualTime = actualStartTime ? new Date(actualStartTime) : new Date();

    // 7. Compute deltaMinutes from planned start time
    const shiftMonth = `${shiftDate.getUTCFullYear()}-${String(shiftDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const [hours, minutes] = shift.startTime.split(':').map(Number);
    const plannedStartTime = new Date(
      Date.UTC(
        shiftDate.getUTCFullYear(),
        shiftDate.getUTCMonth(),
        shiftDate.getUTCDate(),
        hours,
        minutes,
        0,
      ),
    );
    const rawDelta = Math.round(
      (actualTime.getTime() - plannedStartTime.getTime()) / 60000,
    );

    // 8. Normalize: within threshold → 0 (on-time)
    const deltaMinutes =
      Math.abs(rawDelta) <= DEVIATION_THRESHOLD_MINUTES ? 0 : rawDelta;

    // 9. $transaction (callback form, race-safe CAS)
    // Period status check INSIDE transaction to prevent TOCTOU race (C2 fix)
    return this.prisma.$transaction(async (tx) => {
      // Guard: planning period must be PUBLISHED (checked inside tx)
      const periodStatus = await tx.planningPeriodStatus.findUnique({
        where: { clinicId_month: { clinicId, month: shiftMonth } },
      });

      if (!periodStatus || periodStatus.status !== 'PUBLISHED') {
        throw new BadRequestException(
          'Cannot confirm shifts for an unpublished planning period',
        );
      }

      const updated = await tx.shift.updateMany({
        where: { id: shiftId, isConfirmed: false },
        data: { isConfirmed: true },
      });

      if (updated.count === 0) {
        // Race condition: another request confirmed in parallel
        return {
          shiftId,
          isConfirmed: true,
          deltaMinutes: 0,
          varianceType: 'CLOCK_IN_DEVIATION' as const,
        };
      }

      await tx.varianceEvent.create({
        data: {
          type: 'CLOCK_IN_DEVIATION',
          plannedTime: plannedStartTime,
          actualTime,
          deltaMinutes,
          shiftId,
          clinicId,
          status: 'PENDING',
        },
      });

      return {
        shiftId,
        isConfirmed: true,
        deltaMinutes,
        varianceType: 'CLOCK_IN_DEVIATION' as const,
      };
    });
  }

  async detectNoShows(clinicId: string, date: string): Promise<number> {
    // Parse date
    const [year, month, day] = date.split('-').map(Number);
    const targetDate = new Date(Date.UTC(year, month - 1, day));
    const targetMonth = `${year}-${String(month).padStart(2, '0')}`;

    // Check period is PUBLISHED
    const periodStatus = await this.prisma.planningPeriodStatus.findUnique({
      where: { clinicId_month: { clinicId, month: targetMonth } },
    });

    if (!periodStatus || periodStatus.status !== 'PUBLISHED') {
      return 0;
    }

    // Find unconfirmed shifts for that date
    const dayStart = new Date(Date.UTC(year, month - 1, day));
    const dayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    const unconfirmedShifts = await this.prisma.shift.findMany({
      where: {
        clinicId,
        date: { gte: dayStart, lte: dayEnd },
        isConfirmed: false,
      },
      select: {
        id: true,
        startTime: true,
        clinicId: true,
        date: true,
        varianceEvents: { select: { id: true }, where: { type: 'NO_SHOW' } },
      },
    });

    // Filter shifts that already have a NO_SHOW event (idempotent)
    const shiftsToProcess = unconfirmedShifts.filter(
      (s) => s.varianceEvents.length === 0,
    );

    if (shiftsToProcess.length === 0) {
      return 0;
    }

    // Batch insert all NO_SHOW events in a single query (C3 + H6 fix)
    await this.prisma.varianceEvent.createMany({
      data: shiftsToProcess.map((shift) => {
        const [h, m] = shift.startTime.split(':').map(Number);
        const plannedTime = new Date(
          Date.UTC(
            targetDate.getUTCFullYear(),
            targetDate.getUTCMonth(),
            targetDate.getUTCDate(),
            h,
            m,
            0,
          ),
        );
        return {
          type: 'NO_SHOW' as const,
          plannedTime,
          actualTime: plannedTime,
          deltaMinutes: 0,
          shiftId: shift.id,
          clinicId,
          status: 'PENDING' as const,
        };
      }),
      skipDuplicates: true,
    });

    const noShowCount = shiftsToProcess.length;

    this.logger.log(
      `Detected ${noShowCount} no-show(s) for clinic ${clinicId} on ${date}`,
    );

    return noShowCount;
  }
}
