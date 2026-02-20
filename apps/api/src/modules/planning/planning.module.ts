import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClinicModule } from '@/modules/clinic/clinic.module';
import { PlanningService } from './planning.service';
import { PlanningTemplateService } from './planning-template.service';
import { PlanningGenerationService } from './planning-generation.service';
import { EquityCounterService } from './equity-counter.service';
import { EquityCounterScheduler } from './equity-counter.scheduler';
import { ApprenticeDeclarationService } from './apprentice-declaration.service';

@Module({
  imports: [PrismaModule, ClinicModule],
  providers: [
    PlanningService,
    PlanningTemplateService,
    PlanningGenerationService,
    EquityCounterService,
    EquityCounterScheduler,
    ApprenticeDeclarationService,
  ],
  exports: [
    PlanningService,
    PlanningTemplateService,
    PlanningGenerationService,
    EquityCounterService,
    ApprenticeDeclarationService,
  ],
})
export class PlanningModule {}
