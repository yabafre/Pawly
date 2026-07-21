import { describe, it, expect } from 'vitest';
import { validateOnboardingShiftTypes } from './shift-types-validation';

// Identity translator so assertions read on the i18n KEY the onboarding step surfaces.
const t = (key: string) => key;

const complete = {
  name: 'Day',
  code: 'DAY',
  startTime: '08:00',
  endTime: '14:00',
  breakMinutes: 0,
};

describe('validateOnboardingShiftTypes (Story 13-4, KON-136 — aped-review F4)', () => {
  it('requires at least one shift type', () => {
    expect(validateOnboardingShiftTypes([], t)).toBe('minRequired');
    expect(validateOnboardingShiftTypes(undefined, t)).toBe('minRequired');
  });

  it('flags an incomplete type before the break rule', () => {
    expect(validateOnboardingShiftTypes([{ ...complete, code: '' }], t)).toBe(
      'incompleteShiftType'
    );
  });

  it('surfaces the localized break error for a >6h type with under a 20-min break', () => {
    expect(
      validateOnboardingShiftTypes(
        [{ ...complete, startTime: '08:00', endTime: '15:00', breakMinutes: 0 }],
        t
      )
    ).toBe('breakRequiredOver6h');
  });

  it('accepts a >6h type carrying a 20-min break', () => {
    expect(
      validateOnboardingShiftTypes(
        [{ ...complete, startTime: '08:00', endTime: '15:20', breakMinutes: 20 }],
        t
      )
    ).toBeUndefined();
  });

  it('accepts a <=6h type with no break', () => {
    expect(validateOnboardingShiftTypes([complete], t)).toBeUndefined();
  });
});
