/**
 * App Router - Main tRPC router
 *
 * Combines all domain routers into a single app router.
 * This is the router that gets exposed via the tRPC endpoint.
 *
 * @see https://trpc.io/docs/server/merging-routers
 */
import { router } from '../trpc';
import { authRouter } from './auth.router';
import { stripeRouter } from './stripe.router';
import { clinicRouter } from './clinic.router';
import { employeeRouter } from './employee.router';
import { planningRouter } from './planning.router';
import { varianceRouter } from './variance.router';
import { dashboardRouter } from './dashboard.router';
import { employeeScheduleRouter } from './employee-schedule.router';
import { presenceConfirmationRouter } from './presence-confirmation.router';

/**
 * Main application router
 *
 * All domain routers should be merged here.
 * Convention: router name = domain name (e.g., auth, users)
 */
export const appRouter = router({
  auth: authRouter,
  stripe: stripeRouter,
  clinic: clinicRouter,
  employee: employeeRouter,
  planning: planningRouter,
  variance: varianceRouter,
  dashboard: dashboardRouter,
  employeeSchedule: employeeScheduleRouter,
  presenceConfirmation: presenceConfirmationRouter,
});

/**
 * Export type definition for client-side type inference
 *
 * This type is used by the tRPC client to provide
 * end-to-end type safety.
 */
export type AppRouter = typeof appRouter;
