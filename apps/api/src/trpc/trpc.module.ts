/**
 * tRPC NestJS Module
 *
 * Integrates tRPC with NestJS dependency injection.
 * Provides the tRPC middleware factory that can be used in main.ts.
 */
import { Module, Injectable, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import * as trpcExpress from '@trpc/server/adapters/express';
import { JwtService } from '@nestjs/jwt';
import { AuthModule } from '@/modules/auth/auth.module';
import { AuthService } from '@/modules/auth/auth.service';
import { StripeModule } from '@/modules/stripe/stripe.module';
import { StripeService } from '@/modules/stripe/stripe.service';
import { ClinicModule } from '@/modules/clinic/clinic.module';
import { ClinicService } from '@/modules/clinic/clinic.service';
import { EmployeeModule } from '@/modules/employee/employee.module';
import { EmployeeService } from '@/modules/employee/employee.service';
import { PlanningModule } from '@/modules/planning/planning.module';
import { PlanningService } from '@/modules/planning/planning.service';
import { PlanningTemplateService } from '@/modules/planning/planning-template.service';
import { PlanningGenerationService } from '@/modules/planning/planning-generation.service';
import { EquityCounterService } from '@/modules/planning/equity-counter.service';
import { ApprenticeDeclarationService } from '@/modules/planning/apprentice-declaration.service';
import { VarianceService } from '@/modules/planning/variance.service';
import { EmployeeScheduleService } from '@/modules/planning/employee-schedule.service';
import { PresenceConfirmationService } from '@/modules/planning/presence-confirmation.service';
import { DashboardModule } from '@/modules/dashboard/dashboard.module';
import { DashboardService } from '@/modules/dashboard/dashboard.service';
import { NotificationModule } from '@/modules/notification/notification.module';
import { PushNotificationService } from '@/modules/notification/push-notification.service';
import { MailModule } from '@/modules/mail/mail.module';
import { MailService } from '@/modules/mail/mail.service';
import { TourModule } from '@/modules/tour/tour.module';
import { TourService } from '@/modules/tour/tour.service';
import { PrismaService } from '@/prisma/prisma.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { RedisService } from '@/redis';
import { appRouter } from './routers/_app';
import { createContext, type TRPCServices } from './context';

/**
 * tRPC Middleware - integrates tRPC with Express/NestJS
 *
 * Creates the Express middleware with NestJS services injected.
 */
@Injectable()
export class TRPCMiddleware implements NestMiddleware {
  private readonly middleware: ReturnType<
    typeof trpcExpress.createExpressMiddleware
  >;

  constructor(
    private readonly authService: AuthService,
    private readonly stripeService: StripeService,
    private readonly clinicService: ClinicService,
    private readonly employeeService: EmployeeService,
    private readonly planningService: PlanningService,
    private readonly planningTemplateService: PlanningTemplateService,
    private readonly planningGenerationService: PlanningGenerationService,
    private readonly equityCounterService: EquityCounterService,
    private readonly apprenticeDeclarationService: ApprenticeDeclarationService,
    private readonly varianceService: VarianceService,
    private readonly employeeScheduleService: EmployeeScheduleService,
    private readonly presenceConfirmationService: PresenceConfirmationService,
    private readonly dashboardService: DashboardService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly mailService: MailService,
    private readonly tourService: TourService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    const services: TRPCServices = {
      authService: this.authService,
      stripeService: this.stripeService,
      clinicService: this.clinicService,
      employeeService: this.employeeService,
      planningService: this.planningService,
      planningTemplateService: this.planningTemplateService,
      planningGenerationService: this.planningGenerationService,
      equityCounterService: this.equityCounterService,
      apprenticeDeclarationService: this.apprenticeDeclarationService,
      varianceService: this.varianceService,
      employeeScheduleService: this.employeeScheduleService,
      presenceConfirmationService: this.presenceConfirmationService,
      dashboardService: this.dashboardService,
      pushNotificationService: this.pushNotificationService,
      mailService: this.mailService,
      tourService: this.tourService,
      jwtService: this.jwtService,
      prisma: this.prisma,
      redis: this.redis,
    };

    this.middleware = trpcExpress.createExpressMiddleware({
      router: appRouter,
      createContext: (opts) => createContext({ ...opts, services }),
    });
  }

  use(req: Request, res: Response, next: NextFunction) {
    return this.middleware(req, res, next);
  }
}

/**
 * tRPC Service - provides access to tRPC router and middleware factory
 */
@Injectable()
export class TRPCService {
  constructor(
    private readonly authService: AuthService,
    private readonly stripeService: StripeService,
    private readonly clinicService: ClinicService,
    private readonly employeeService: EmployeeService,
    private readonly planningService: PlanningService,
    private readonly planningTemplateService: PlanningTemplateService,
    private readonly planningGenerationService: PlanningGenerationService,
    private readonly equityCounterService: EquityCounterService,
    private readonly apprenticeDeclarationService: ApprenticeDeclarationService,
    private readonly varianceService: VarianceService,
    private readonly employeeScheduleService: EmployeeScheduleService,
    private readonly presenceConfirmationService: PresenceConfirmationService,
    private readonly dashboardService: DashboardService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly mailService: MailService,
    private readonly tourService: TourService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Get the services to inject into tRPC context
   */
  getServices(): TRPCServices {
    return {
      authService: this.authService,
      stripeService: this.stripeService,
      clinicService: this.clinicService,
      employeeService: this.employeeService,
      planningService: this.planningService,
      planningTemplateService: this.planningTemplateService,
      planningGenerationService: this.planningGenerationService,
      equityCounterService: this.equityCounterService,
      apprenticeDeclarationService: this.apprenticeDeclarationService,
      varianceService: this.varianceService,
      employeeScheduleService: this.employeeScheduleService,
      presenceConfirmationService: this.presenceConfirmationService,
      dashboardService: this.dashboardService,
      pushNotificationService: this.pushNotificationService,
      mailService: this.mailService,
      tourService: this.tourService,
      jwtService: this.jwtService,
      prisma: this.prisma,
      redis: this.redis,
    };
  }

  /**
   * Create Express middleware for tRPC
   */
  createMiddleware() {
    const services = this.getServices();

    return trpcExpress.createExpressMiddleware({
      router: appRouter,
      createContext: (opts) => createContext({ ...opts, services }),
    });
  }
}

@Module({
  imports: [
    AuthModule,
    StripeModule,
    ClinicModule,
    EmployeeModule,
    PlanningModule,
    DashboardModule,
    NotificationModule,
    MailModule,
    TourModule,
    PrismaModule,
  ],
  providers: [TRPCService, TRPCMiddleware],
  exports: [TRPCService, TRPCMiddleware],
})
export class TRPCModule {}
