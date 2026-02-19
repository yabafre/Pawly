import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClinicModule } from '@/modules/clinic/clinic.module';
import { PlanningService } from './planning.service';
import { PlanningTemplateService } from './planning-template.service';
import { EquityCounterService } from './equity-counter.service';
import { EquityCounterScheduler } from './equity-counter.scheduler';

@Module({
  imports: [PrismaModule, ClinicModule],
  providers: [PlanningService, PlanningTemplateService, EquityCounterService, EquityCounterScheduler],
  exports: [PlanningService, PlanningTemplateService, EquityCounterService],
})
export class PlanningModule {}
