import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { EmployeeModule } from '@/modules/employee/employee.module';
import { MailModule } from '@/modules/mail/mail.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [PrismaModule, EmployeeModule, MailModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
