export type TourRole = 'ADMIN' | 'EMPLOYEE';

export type TourStep = {
  id: string;
  route: string; // pathname WITHOUT locale prefix (e.g. "/dashboard")
  selector: string; // CSS selector, e.g. '[data-tour="employee-today"]'
  titleKey: string; // next-intl key under the "tour" namespace
  bodyKey: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  proOnly?: boolean; // only shown when the clinic has the professional tier
};

export type TourDef = { role: TourRole; steps: TourStep[] };

export type TourKey = 'employee-onboarding' | 'admin-onboarding';

export const tours: Record<TourKey, TourDef> = {
  'employee-onboarding': {
    role: 'EMPLOYEE',
    steps: [
      {
        id: 'greeting',
        route: '/dashboard',
        selector: '[data-tour="employee-greeting"]',
        titleKey: 'employee.greeting.title',
        bodyKey: 'employee.greeting.body',
        placement: 'bottom',
      },
      {
        id: 'today',
        route: '/dashboard',
        selector: '[data-tour="employee-today"]',
        titleKey: 'employee.today.title',
        bodyKey: 'employee.today.body',
        placement: 'bottom',
      },
      {
        id: 'confirm',
        route: '/dashboard',
        selector: '[data-tour="employee-confirm"]',
        titleKey: 'employee.confirm.title',
        bodyKey: 'employee.confirm.body',
        placement: 'top',
      },
      {
        id: 'settings',
        route: '/dashboard',
        selector: '[data-tour="employee-settings"]',
        titleKey: 'employee.settings.title',
        bodyKey: 'employee.settings.body',
        placement: 'bottom',
      },
      {
        id: 'schedule',
        route: '/dashboard/schedule',
        selector: '[data-tour="employee-schedule"]',
        titleKey: 'employee.schedule.title',
        bodyKey: 'employee.schedule.body',
        placement: 'bottom',
      },
      {
        id: 'weekly-summary',
        route: '/dashboard/schedule',
        selector: '[data-tour="employee-weekly-summary"]',
        titleKey: 'employee.weeklySummary.title',
        bodyKey: 'employee.weeklySummary.body',
        placement: 'bottom',
      },
      {
        id: 'absence',
        route: '/dashboard/absences',
        selector: '[data-tour="employee-absence-request"]',
        titleKey: 'employee.absence.title',
        bodyKey: 'employee.absence.body',
        placement: 'bottom',
      },
    ],
  },
  'admin-onboarding': {
    role: 'ADMIN',
    steps: [
      {
        id: 'dashboard',
        route: '/admin/dashboard',
        selector: '[data-tour="admin-dashboard"]',
        titleKey: 'admin.dashboard.title',
        bodyKey: 'admin.dashboard.body',
        placement: 'bottom',
      },
      {
        id: 'pending-requests',
        route: '/admin/dashboard',
        selector: '[data-tour="admin-pending-requests"]',
        titleKey: 'admin.pendingRequests.title',
        bodyKey: 'admin.pendingRequests.body',
        placement: 'bottom',
      },
      {
        id: 'todays-team',
        route: '/admin/dashboard',
        selector: '[data-tour="admin-todays-team"]',
        titleKey: 'admin.todaysTeam.title',
        bodyKey: 'admin.todaysTeam.body',
        placement: 'bottom',
      },
      {
        id: 'clinic-hours',
        route: '/admin/settings',
        selector: '[data-tour="admin-clinic-hours"]',
        titleKey: 'admin.clinicHours.title',
        bodyKey: 'admin.clinicHours.body',
        placement: 'bottom',
      },
      {
        id: 'shift-types',
        route: '/admin/settings',
        selector: '[data-tour="admin-shift-types"]',
        titleKey: 'admin.shiftTypes.title',
        bodyKey: 'admin.shiftTypes.body',
        placement: 'bottom',
      },
      {
        id: 'add-employee',
        route: '/admin/employees',
        selector: '[data-tour="admin-add-employee"]',
        titleKey: 'admin.addEmployee.title',
        bodyKey: 'admin.addEmployee.body',
        placement: 'bottom',
      },
      {
        id: 'create-template',
        route: '/admin/planning/templates',
        selector: '[data-tour="admin-create-template"]',
        titleKey: 'admin.createTemplate.title',
        bodyKey: 'admin.createTemplate.body',
        placement: 'bottom',
      },
      {
        id: 'rules',
        route: '/admin/planning/rules',
        selector: '[data-tour="admin-rules"]',
        titleKey: 'admin.rules.title',
        bodyKey: 'admin.rules.body',
        placement: 'bottom',
        proOnly: true,
      },
      {
        id: 'generate',
        route: '/admin/planning',
        selector: '[data-tour="admin-generate"]',
        titleKey: 'admin.generate.title',
        bodyKey: 'admin.generate.body',
        placement: 'bottom',
      },
      {
        id: 'health-bar',
        route: '/admin/planning',
        selector: '[data-tour="admin-health-bar"]',
        titleKey: 'admin.healthBar.title',
        bodyKey: 'admin.healthBar.body',
        placement: 'bottom',
      },
      {
        id: 'publish',
        route: '/admin/planning',
        selector: '[data-tour="admin-publish"]',
        titleKey: 'admin.publish.title',
        bodyKey: 'admin.publish.body',
        placement: 'bottom',
      },
      {
        id: 'equity',
        route: '/admin/planning/equity',
        selector: '[data-tour="admin-equity"]',
        titleKey: 'admin.equity.title',
        bodyKey: 'admin.equity.body',
        placement: 'bottom',
        proOnly: true,
      },
    ],
  },
};

export function tourForRole(role: TourRole): TourKey | null {
  if (role === 'EMPLOYEE') return 'employee-onboarding';
  if (role === 'ADMIN') return 'admin-onboarding';
  return null;
}

/**
 * The effective steps for a tour given the clinic's tier. Professional-only
 * steps (e.g. planning rules, equity counters) are dropped for Starter clinics
 * so the tour never points at — or navigates to — features they can't access.
 */
export function tourSteps(key: TourKey, isPro: boolean): TourStep[] {
  return tours[key].steps.filter((s) => !s.proOnly || isPro);
}

/**
 * Decides whether (and where) a tour should auto-start on mount. Returns the
 * tour + resume step ONLY when the user is already on that step's route — so an
 * uncompleted tour never yanks the user away from a page they navigated to
 * themselves (e.g. landing on /admin/settings must not redirect to the tour).
 * Step indices are relative to the tier-filtered step list.
 */
export function resolveTourStart(
  role: TourRole,
  initialCompleted: boolean,
  initialState: { tourKey: string; step: number } | null,
  pathname: string,
  isPro: boolean
): { key: TourKey; step: number } | null {
  if (initialCompleted) return null;
  const key = tourForRole(role);
  if (!key) return null;
  const step = initialState && initialState.tourKey === key ? initialState.step : 0;
  if (tourSteps(key, isPro)[step]?.route !== pathname) return null;
  return { key, step };
}
