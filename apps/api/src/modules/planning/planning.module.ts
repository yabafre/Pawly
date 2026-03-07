import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClinicModule } from '@/modules/clinic/clinic.module';
import { MailModule } from '@/modules/mail/mail.module';
import { NotificationModule } from '@/modules/notification/notification.module';
import { PlanningService } from './planning.service';
import { PlanningTemplateService } from './planning-template.service';
import { PlanningGenerationService } from './planning-generation.service';
import { EquityCounterService } from './equity-counter.service';
import { EquityCounterScheduler } from './equity-counter.scheduler';
import { ApprenticeDeclarationService } from './apprentice-declaration.service';
import { VarianceService } from './variance.service';
import { EmployeeScheduleService } from './employee-schedule.service';
import { PresenceConfirmationService } from './presence-confirmation.service';
import { PresenceConfirmationScheduler } from './presence-confirmation.scheduler';

@Module({
  imports: [PrismaModule, ClinicModule, MailModule, NotificationModule],
  providers: [
    PlanningService,
    PlanningTemplateService,
    PlanningGenerationService,
    EquityCounterService,
    EquityCounterScheduler,
    ApprenticeDeclarationService,
    VarianceService,
    EmployeeScheduleService,
    PresenceConfirmationService,
    PresenceConfirmationScheduler,
  ],
  exports: [
    PlanningService,
    PlanningTemplateService,
    PlanningGenerationService,
    EquityCounterService,
    ApprenticeDeclarationService,
    VarianceService,
    EmployeeScheduleService,
    PresenceConfirmationService,
  ],
})
export class PlanningModule {}
