import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { PlanningService } from './planning.service';

@Module({
  imports: [PrismaModule],
  providers: [PlanningService],
  exports: [PlanningService],
})
export class PlanningModule {}
