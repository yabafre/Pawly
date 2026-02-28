import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { AuthService } from '@/modules/auth/auth.service';
import type { StripeService } from '@/modules/stripe/stripe.service';
import type { ClinicService } from '@/modules/clinic/clinic.service';
import type { EmployeeService } from '@/modules/employee/employee.service';
import type { PlanningService } from '@/modules/planning/planning.service';
import type { PlanningTemplateService } from '@/modules/planning/planning-template.service';
import type { EquityCounterService } from '@/modules/planning/equity-counter.service';
import type { PlanningGenerationService } from '@/modules/planning/planning-generation.service';
import type { ApprenticeDeclarationService } from '@/modules/planning/apprentice-declaration.service';
import type { VarianceService } from '@/modules/planning/variance.service';
import type { EmployeeScheduleService } from '@/modules/planning/employee-schedule.service';
import type { PresenceConfirmationService } from '@/modules/planning/presence-confirmation.service';
import type { DashboardService } from '@/modules/dashboard/dashboard.service';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '@/prisma/prisma.service';
import type { AuthenticatedUser } from '@pawly/types';

export interface TRPCServices {
  authService: AuthService;
  stripeService: StripeService;
  clinicService: ClinicService;
  employeeService: EmployeeService;
  planningService: PlanningService;
  planningTemplateService: PlanningTemplateService;
  planningGenerationService: PlanningGenerationService;
  equityCounterService: EquityCounterService;
  apprenticeDeclarationService: ApprenticeDeclarationService;
  varianceService: VarianceService;
  employeeScheduleService: EmployeeScheduleService;
  presenceConfirmationService: PresenceConfirmationService;
  dashboardService: DashboardService;
  jwtService: JwtService;
  prisma: PrismaService;
}

export async function createContext(
  opts: CreateExpressContextOptions & { services: TRPCServices },
) {
  const { req, services } = opts;
  let user: AuthenticatedUser | null = null;

  // Extract JWT from Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payload = services.jwtService.verify(token);
      // Validate user still exists in DB — consistent with JwtStrategy behavior on REST endpoints
      const dbUser = await services.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (dbUser) {
        // Always use current clinicId from DB, not JWT payload, in case user was transferred
        user = {
          sub: payload.sub,
          email: payload.email,
          role: payload.role,
          clinicId: dbUser.clinicId,
        };
      }
    } catch {
      // Invalid token - user remains null
    }
  }

  return {
    req,
    user,
    ...services,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
export type TRPCContext = Context;
