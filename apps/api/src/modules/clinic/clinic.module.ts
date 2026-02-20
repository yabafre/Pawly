import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ClinicService } from './clinic.service';

@Module({
  imports: [PrismaModule],
  providers: [ClinicService],
  exports: [ClinicService],
})
export class ClinicModule {}
