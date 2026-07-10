'use client';
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { tourSteps, resolveTourStart, type TourRole } from '@/lib/tours/registry';
import { useTourStore } from '@/lib/tours/store';
import { useTour } from '@/lib/tours/useTour';
import { highlightStep, destroyTour } from '@/lib/tours/driver-adapter';
import { waitForElement } from '@/lib/tours/wait-for-element';
import type { TourState } from '@pawly/validators';

type Props = {
  role: TourRole;
  initialCompleted: boolean;
  initialState: TourState | null;
  isPro?: boolean;
};

export function TourProvider({ role, initialCompleted, initialState, isPro = true }: Props) {
  const router = useRouter();
  const pathname = usePathname(); // locale-stripped pathname (e.g. "/dashboard")
  const t = useTranslations('tour');
  const { activeTour, step, isRunning, start, setStep, stop } = useTourStore();
  const { saveProgress, complete } = useTour();
  const booted = useRef(false);
  const navPending = useRef(false);

  // Keep the latest non-step values in a ref so the drive effect below depends
  // ONLY on what changes which step to show. Otherwise a re-render from the
  // debounced saveProgress mutation would re-run the effect and re-highlight the
  // current step, swallowing the user's Next click (and then auto-skipping).
  const latest = useRef({ t, router, setStep, saveProgress, complete, stop });
  latest.current = { t, router, setStep, saveProgress, complete, stop };

  // Auto-start the role's tour once the user is on the (resume) step's route.
  // Gating on pathname avoids hijacking navigation: an admin landing on
  // /admin/settings with an uncompleted tour must not be redirected to the
  // dashboard. The effect re-checks on pathname change until it starts once.
  useEffect(() => {
    if (booted.current) return;
    const next = resolveTourStart(role, initialCompleted, initialState, pathname, isPro);
    if (!next) return;
    booted.current = true;
    start(next.key, next.step);
  }, [initialCompleted, initialState, role, start, pathname, isPro]);

  // Drive the current step. Re-runs ONLY on a real step / route / tour change.
  useEffect(() => {
    if (!isRunning || !activeTour) return;
    const steps = tourSteps(activeTour, isPro);
    const justNavigated = navPending.current;
    navPending.current = false;
    let cancelled = false;

    const finish = () => {
      destroyTour();
      void latest.current.complete(activeTour);
      latest.current.stop();
    };

    (async () => {
      const { t, router, setStep } = latest.current;
      let idx = step;
      let firstPoll = true;
      while (idx < steps.length) {
        const s = steps[idx];
        if (s.route !== pathname) {
          if (idx !== step) setStep(idx);
          navPending.current = true;
          router.push(s.route);
          return; // effect re-runs after navigation
        }
        // A just-navigated page needs time to load its anchor; a same-route step
        // is present-or-genuinely-absent in the DOM right now (the effect runs
        // after the render commits), so a single synchronous check skips it with
        // no perceptible delay.
        const timeout = justNavigated && firstPoll ? 3000 : 0;
        firstPoll = false;
        const el = await waitForElement(s.selector, timeout);
        if (cancelled) return;
        if (el) {
          if (idx !== step) setStep(idx);
          const currentIdx = idx;
          const isFirst = currentIdx === 0;
          const isLast = currentIdx === steps.length - 1;
          highlightStep({
            element: s.selector,
            title: t(s.titleKey),
            description: t(s.bodyKey),
            side: s.placement,
            isFirst,
            isLast,
            handlers: {
              onNext: () => {
                if (isLast) {
                  finish();
                } else {
                  const n = currentIdx + 1;
                  latest.current.setStep(n);
                  latest.current.saveProgress(activeTour, n);
                }
              },
              onPrev: () => {
                const p = Math.max(0, currentIdx - 1);
                latest.current.setStep(p);
                latest.current.saveProgress(activeTour, p);
              },
              onClose: () => finish(),
            },
          });
          return;
        }
        // anchor missing on this route → graceful skip to next step
        idx += 1;
      }
      finish(); // no renderable step left
    })();

    return () => {
      cancelled = true;
    };
  }, [isRunning, activeTour, step, pathname, isPro]);

  // Destroy any live tour on unmount.
  useEffect(() => () => destroyTour(), []);

  return null;
}
