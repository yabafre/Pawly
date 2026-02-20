import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { MailModule } from '@/modules/mail/mail.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { EmployeeService } from './employee.service';

@Module({
  imports: [PrismaModule, MailModule, AuthModule],
  providers: [EmployeeService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
