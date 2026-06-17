import { describe, it, expect } from 'vitest';
import { tours, tourForRole, type TourKey } from './registry';

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
