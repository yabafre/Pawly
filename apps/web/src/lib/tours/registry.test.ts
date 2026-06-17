import { describe, it, expect } from 'vitest';
import { tours, tourForRole, resolveTourStart, type TourKey } from './registry';

// AC-3 (verbatim from story 10-4-onboarding-tour-engine:19):
//   Generic engine — Given a registry mapping TourKey → { role, steps[] },
//   When the TourProvider mounts for a user whose tourCompletedAt is NULL,
//   Then it auto-starts the tour matching the user's role, resuming at
//   tourState.step (when tourState.tourKey matches) else step 0.
describe('tour registry', () => {
  it('every tour has a role and at least one step', () => {
    (Object.keys(tours) as TourKey[]).forEach((key) => {
      expect(['ADMIN', 'EMPLOYEE']).toContain(tours[key].role);
      expect(tours[key].steps.length).toBeGreaterThan(0);
    });
  });

  it('every step has route, selector and i18n keys', () => {
    (Object.keys(tours) as TourKey[]).forEach((key) => {
      tours[key].steps.forEach((s) => {
        expect(s.route.startsWith('/')).toBe(true);
        expect(s.selector).toMatch(/^\[data-tour="/);
        expect(s.titleKey.length).toBeGreaterThan(0);
        expect(s.bodyKey.length).toBeGreaterThan(0);
      });
    });
  });

  it('tourForRole maps roles to the right tour', () => {
    expect(tourForRole('EMPLOYEE')).toBe('employee-onboarding');
    expect(tourForRole('ADMIN')).toBe('admin-onboarding');
  });
});

// AC-6 (admin multi-page) + navigation safety: an uncompleted tour must only
// auto-start on the route its (resume) step lives on — never hijack navigation.
describe('resolveTourStart', () => {
  it('returns null when the tour is already completed', () => {
    expect(resolveTourStart('ADMIN', true, null, '/admin/dashboard')).toBeNull();
  });

  it('auto-starts at step 0 when on the entry route', () => {
    expect(resolveTourStart('EMPLOYEE', false, null, '/dashboard')).toEqual({
      key: 'employee-onboarding',
      step: 0,
    });
    expect(resolveTourStart('ADMIN', false, null, '/admin/dashboard')).toEqual({
      key: 'admin-onboarding',
      step: 0,
    });
  });

  it('does NOT start when the user is on a different route (no navigation hijack)', () => {
    expect(resolveTourStart('ADMIN', false, null, '/admin/billing')).toBeNull();
    expect(resolveTourStart('EMPLOYEE', false, null, '/dashboard/settings')).toBeNull();
  });

  it('resumes at the persisted step only on its route', () => {
    const state = { tourKey: 'admin-onboarding', step: 2 }; // add-employee → /admin/employees
    expect(resolveTourStart('ADMIN', false, state, '/admin/employees')).toEqual({
      key: 'admin-onboarding',
      step: 2,
    });
    expect(resolveTourStart('ADMIN', false, state, '/admin/dashboard')).toBeNull();
  });

  it('ignores a persisted step from a different tour (starts at 0)', () => {
    const state = { tourKey: 'employee-onboarding', step: 3 };
    expect(resolveTourStart('ADMIN', false, state, '/admin/dashboard')).toEqual({
      key: 'admin-onboarding',
      step: 0,
    });
  });
});
