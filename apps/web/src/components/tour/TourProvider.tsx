'use client';
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { tours, tourForRole, type TourRole } from '@/lib/tours/registry';
import { useTourStore } from '@/lib/tours/store';
import { useTour } from '@/lib/tours/useTour';
import { highlightStep, destroyTour } from '@/lib/tours/driver-adapter';
import { waitForElement } from '@/lib/tours/wait-for-element';
import type { TourState } from '@pawly/validators';

type Props = {
  role: TourRole;
  initialCompleted: boolean;
  initialState: TourState | null;
};

export function TourProvider({ role, initialCompleted, initialState }: Props) {
  const router = useRouter();
  const pathname = usePathname(); // locale-stripped pathname (e.g. "/dashboard")
  const t = useTranslations('tour');
  const { activeTour, step, isRunning, start, setStep, stop } = useTourStore();
  const { saveProgress, complete } = useTour();
  const booted = useRef(false);

  // Boot once: auto-start the role's tour if not completed.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    if (initialCompleted) return;
    const key = tourForRole(role);
    if (!key) return;
    const startStep = initialState && initialState.tourKey === key ? initialState.step : 0;
    start(key, startStep);
  }, [initialCompleted, initialState, role, start]);

  // Drive the current step (re-runs on step or route change).
  useEffect(() => {
    if (!isRunning || !activeTour) return;
    const def = tours[activeTour];
    let cancelled = false;

    const finish = () => {
      destroyTour();
      void complete(activeTour);
      stop();
    };

    (async () => {
      let idx = step;
      while (idx < def.steps.length) {
        const s = def.steps[idx];
        if (s.route !== pathname) {
          if (idx !== step) setStep(idx);
          router.push(s.route);
          return; // effect re-runs after navigation
        }
        const el = await waitForElement(s.selector);
        if (cancelled) return;
        if (el) {
          if (idx !== step) setStep(idx);
          const currentIdx = idx;
          const isFirst = currentIdx === 0;
          const isLast = currentIdx === def.steps.length - 1;
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
                  setStep(n);
                  saveProgress(activeTour, n);
                }
              },
              onPrev: () => {
                const p = Math.max(0, currentIdx - 1);
                setStep(p);
                saveProgress(activeTour, p);
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
  }, [isRunning, activeTour, step, pathname, t, router, setStep, saveProgress, complete, stop]);

  // Destroy any live tour on unmount.
  useEffect(() => () => destroyTour(), []);

  return null;
}
