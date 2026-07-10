import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { TourService } from './tour.service';

@Module({
  imports: [PrismaModule],
  providers: [TourService],
  exports: [TourService],
})
export class TourModule {}
