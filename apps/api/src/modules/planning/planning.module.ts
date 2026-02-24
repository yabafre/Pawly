import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClinicModule } from '@/modules/clinic/clinic.module';
import { MailModule } from '@/modules/mail/mail.module';
import { PlanningService } from './planning.service';
import { PlanningTemplateService } from './planning-template.service';
import { PlanningGenerationService } from './planning-generation.service';
import { EquityCounterService } from './equity-counter.service';
import { EquityCounterScheduler } from './equity-counter.scheduler';
import { ApprenticeDeclarationService } from './apprentice-declaration.service';
import { VarianceService } from './variance.service';

@Module({
  imports: [PrismaModule, ClinicModule, MailModule],
  providers: [
    PlanningService,
    PlanningTemplateService,
    PlanningGenerationService,
    EquityCounterService,
    EquityCounterScheduler,
    ApprenticeDeclarationService,
    VarianceService,
  ],
  exports: [
    PlanningService,
    PlanningTemplateService,
    PlanningGenerationService,
    EquityCounterService,
    ApprenticeDeclarationService,
    VarianceService,
  ],
})
export class PlanningModule {}
