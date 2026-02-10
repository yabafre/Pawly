import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { EmployeeService } from './employee.service';

@Module({
  imports: [PrismaModule],
  providers: [EmployeeService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
