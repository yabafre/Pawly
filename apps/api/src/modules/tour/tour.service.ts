import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { TourState } from '@pawly/validators';

@Injectable()
export class TourService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(
    userId: string,
  ): Promise<{ tourCompletedAt: string | null; tourState: TourState | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tourCompletedAt: true, tourState: true },
    });
    return {
      tourCompletedAt: user?.tourCompletedAt
        ? user.tourCompletedAt.toISOString()
        : null,
      tourState: (user?.tourState as TourState | null) ?? null,
    };
  }

  async saveProgress(
    userId: string,
    tourKey: string,
    step: number,
  ): Promise<{ ok: true }> {
    const tourState: TourState = {
      tourKey,
      step,
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.user.update({
      where: { id: userId },
      data: { tourState: tourState as Prisma.InputJsonValue },
    });
    return { ok: true };
  }

  async complete(userId: string): Promise<{ ok: true }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tourCompletedAt: new Date(), tourState: Prisma.DbNull },
    });
    return { ok: true };
  }
}
