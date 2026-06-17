export type TourRole = 'ADMIN' | 'EMPLOYEE';

export type TourStep = {
  id: string;
  route: string; // pathname WITHOUT locale prefix (e.g. "/dashboard")
  selector: string; // CSS selector, e.g. '[data-tour="employee-today"]'
  titleKey: string; // next-intl key under the "tour" namespace
  bodyKey: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
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
        id: 'employees-nav',
        route: '/admin/dashboard',
        selector: '[data-tour="admin-nav-employees"]',
        titleKey: 'admin.employeesNav.title',
        bodyKey: 'admin.employeesNav.body',
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
        id: 'planning-nav',
        route: '/admin/employees',
        selector: '[data-tour="admin-nav-planning"]',
        titleKey: 'admin.planningNav.title',
        bodyKey: 'admin.planningNav.body',
        placement: 'bottom',
      },
      {
        id: 'generate',
        route: '/admin/planning',
        selector: '[data-tour="admin-generate"]',
        titleKey: 'admin.generate.title',
        bodyKey: 'admin.generate.body',
        placement: 'bottom',
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
 * Decides whether (and where) a tour should auto-start on mount. Returns the
 * tour + resume step ONLY when the user is already on that step's route — so an
 * uncompleted tour never yanks the user away from a page they navigated to
 * themselves (e.g. landing on /admin/billing must not redirect to the tour).
 */
export function resolveTourStart(
  role: TourRole,
  initialCompleted: boolean,
  initialState: { tourKey: string; step: number } | null,
  pathname: string
): { key: TourKey; step: number } | null {
  if (initialCompleted) return null;
  const key = tourForRole(role);
  if (!key) return null;
  const step = initialState && initialState.tourKey === key ? initialState.step : 0;
  if (tours[key].steps[step]?.route !== pathname) return null;
  return { key, step };
}
