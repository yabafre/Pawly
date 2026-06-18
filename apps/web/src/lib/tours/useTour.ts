'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useServerActionMutation } from '@/lib/hooks/server-action-hooks';
import { saveTourProgressAction, completeTourAction } from './tour-actions';
import { useTourStore } from './store';
import { tourForRole, type TourKey, type TourRole } from './registry';

export function useTour() {
  const saveMutation = useServerActionMutation(saveTourProgressAction, { returnError: true });
  const completeMutation = useServerActionMutation(completeTourAction, { returnError: true });

  // Keep the latest react-query mutations in refs so the returned callbacks stay
  // referentially stable. A react-query mutation object changes identity on every
  // state transition; closing over it directly would re-run TourProvider's drive
  // effect on each save/complete and re-animate the current step (popover flicker).
  const saveRef = useRef(saveMutation);
  saveRef.current = saveMutation;
  const completeRef = useRef(completeMutation);
  completeRef.current = completeMutation;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any pending debounced save when the hook unmounts.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  const saveProgress = useCallback((tourKey: TourKey, step: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Lesson L1: Zsa mutateAsync returns a [data, err] tuple.
      void saveRef.current.mutateAsync({ tourKey, step }).then(([, err]) => {
        if (err) console.error('tour.saveProgress failed', err);
      });
    }, 1000);
  }, []);

  const complete = useCallback(async (tourKey: TourKey) => {
    // Cancel a pending debounced save first — otherwise it could land after
    // completion and re-write tourState, leaving dirty DB state.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const [, err] = await completeRef.current.mutateAsync({ tourKey }); // L1 tuple
    if (err) console.error('tour.complete failed', err);
  }, []);

  return { saveProgress, complete };
}

export function useReplayTour() {
  const start = useTourStore((s) => s.start);
  return useCallback(
    (role: TourRole) => {
      const key: TourKey | null = tourForRole(role);
      if (key) start(key, 0);
    },
    [start]
  );
}
