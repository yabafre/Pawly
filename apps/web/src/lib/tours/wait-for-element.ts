/**
 * Polls for an element matching `selector`. Resolves with the element once
 * found, or `null` after `timeoutMs`. Never throws. Used for graceful skip.
 */
export function waitForElement(
  selector: string,
  timeoutMs = 4000,
  intervalMs = 150
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) return resolve(el);
      if (Date.now() - start >= timeoutMs) return resolve(null);
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}
