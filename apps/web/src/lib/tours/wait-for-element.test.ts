import { describe, it, expect, afterEach } from 'vitest';
import { waitForElement } from './wait-for-element';

// AC-4 (verbatim from story 10-4-onboarding-tour-engine:20):
//   Anchor robustness — Given a step whose selector is not present in the DOM,
//   When the engine reaches it, Then it polls briefly (~4s) then gracefully
//   skips to the next step whose anchor resolves; ... it never hard-fails.
afterEach(() => {
  document.body.innerHTML = '';
});

describe('waitForElement', () => {
  it('resolves immediately when the element exists', async () => {
    document.body.innerHTML = `<div data-tour="x"></div>`;
    const el = await waitForElement('[data-tour="x"]', 1000, 50);
    expect(el).not.toBeNull();
  });

  it('resolves null after timeout when the element is absent', async () => {
    const el = await waitForElement('[data-tour="missing"]', 300, 50);
    expect(el).toBeNull();
  });

  it('resolves once the element appears before timeout', async () => {
    setTimeout(() => {
      document.body.innerHTML = `<div data-tour="late"></div>`;
    }, 120);
    const el = await waitForElement('[data-tour="late"]', 1000, 50);
    expect(el).not.toBeNull();
  });
});
