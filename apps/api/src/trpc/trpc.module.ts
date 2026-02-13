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
import { EquityCounterService } from '@/modules/planning/equity-counter.service';
import { PrismaService } from '@/prisma/prisma.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { appRouter } from './routers/_app';
import { createContext, type TRPCServices } from './context';

/**
 * tRPC Middleware - integrates tRPC with Express/NestJS
 *
 * Creates the Express middleware with NestJS services injected.
 */
@Injectable()
export class TRPCMiddleware implements NestMiddleware {
  private readonly middleware: ReturnType<typeof trpcExpress.createExpressMiddleware>;

  constructor(
    private readonly authService: AuthService,
    private readonly stripeService: StripeService,
    private readonly clinicService: ClinicService,
    private readonly employeeService: EmployeeService,
    private readonly planningService: PlanningService,
    private readonly equityCounterService: EquityCounterService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {
    const services: TRPCServices = {
      authService: this.authService,
      stripeService: this.stripeService,
      clinicService: this.clinicService,
      employeeService: this.employeeService,
      planningService: this.planningService,
      equityCounterService: this.equityCounterService,
      jwtService: this.jwtService,
      prisma: this.prisma,
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
    private readonly equityCounterService: EquityCounterService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) { }

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
      equityCounterService: this.equityCounterService,
      jwtService: this.jwtService,
      prisma: this.prisma,
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
    PrismaModule,
  ],
  providers: [TRPCService, TRPCMiddleware],
  exports: [TRPCService, TRPCMiddleware],
})
export class TRPCModule { }
