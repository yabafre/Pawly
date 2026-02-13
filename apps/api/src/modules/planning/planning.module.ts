import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClinicModule } from '@/modules/clinic/clinic.module';
import { PlanningService } from './planning.service';

@Module({
  imports: [PrismaModule, ClinicModule],
  providers: [PlanningService],
  exports: [PlanningService],
})
export class PlanningModule {}
