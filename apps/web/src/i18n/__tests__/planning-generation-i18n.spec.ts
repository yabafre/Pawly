import { describe, it, expect } from 'vitest';
import fr from '../langs/fr.json';
import en from '../langs/en.json';

// Story 12-2 (KON-130) — AC6 (NFR20): every UI string exists in BOTH locales.
// This guards the whole admin.planningGeneration namespace (engine.* and the
// served-engine toast.* keys live here) against a locale silently drifting out
// of parity in a future change — the regression guard the story's Task 7 noted
// was missing.
function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? keyPaths(value as Record<string, unknown>, path)
      : [path];
  });
}

describe('i18n parity — admin.planningGeneration (AC6 / NFR20)', () => {
  const frKeys = keyPaths((fr as any).admin.planningGeneration).sort();
  const enKeys = keyPaths((en as any).admin.planningGeneration).sort();

  it('has an identical key structure in fr and en', () => {
    expect(frKeys).toEqual(enKeys);
  });

  it('exposes the story 12-2 engine + served-engine toast keys in both locales', () => {
    const required = [
      'engine.label',
      'engine.hint',
      'engine.proHint',
      'engine.proBadge',
      'engine.servedCpsat',
      'engine.servedGreedy',
      'toast.generatedCpsat',
      'toast.cpsatNoImprovement',
    ];
    for (const key of required) {
      expect(frKeys).toContain(key);
      expect(enKeys).toContain(key);
    }
  });
});
