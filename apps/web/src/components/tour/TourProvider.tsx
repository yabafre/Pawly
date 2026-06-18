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

  // Auto-start the role's tour once the user is on the (resume) step's route.
  // Gating on pathname avoids hijacking navigation: an admin landing on
  // /admin/billing with an uncompleted tour must not be redirected to the
  // dashboard. The effect re-checks on pathname change until it starts once.
  useEffect(() => {
    if (booted.current) return;
    const next = resolveTourStart(role, initialCompleted, initialState, pathname, isPro);
    if (!next) return;
    booted.current = true;
    start(next.key, next.step);
  }, [initialCompleted, initialState, role, start, pathname, isPro]);

  // Drive the current step (re-runs on step or route change).
  useEffect(() => {
    if (!isRunning || !activeTour) return;
    const steps = tourSteps(activeTour, isPro);
    let cancelled = false;

    const finish = () => {
      destroyTour();
      void complete(activeTour);
      stop();
    };

    (async () => {
      let idx = step;
      while (idx < steps.length) {
        const s = steps[idx];
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
  }, [
    isRunning,
    activeTour,
    step,
    pathname,
    isPro,
    t,
    router,
    setStep,
    saveProgress,
    complete,
    stop,
  ]);

  // Destroy any live tour on unmount.
  useEffect(() => () => destroyTour(), []);

  return null;
}
