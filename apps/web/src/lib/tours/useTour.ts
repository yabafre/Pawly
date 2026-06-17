'use client';
import { useCallback, useRef } from 'react';
import { useServerActionMutation } from '@/lib/hooks/server-action-hooks';
import { saveTourProgressAction, completeTourAction } from './tour-actions';
import { useTourStore } from './store';
import { tourForRole, type TourKey, type TourRole } from './registry';

export function useTour() {
  const saveMutation = useServerActionMutation(saveTourProgressAction, { returnError: true });
  const completeMutation = useServerActionMutation(completeTourAction, { returnError: true });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveProgress = useCallback(
    (tourKey: TourKey, step: number) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        // Lesson L1: Zsa mutateAsync returns a [data, err] tuple.
        void saveMutation.mutateAsync({ tourKey, step }).then(([, err]) => {
          if (err) console.error('tour.saveProgress failed', err);
        });
      }, 1000);
    },
    [saveMutation]
  );

  const complete = useCallback(
    async (tourKey: TourKey) => {
      const [, err] = await completeMutation.mutateAsync({ tourKey }); // L1 tuple
      if (err) console.error('tour.complete failed', err);
    },
    [completeMutation]
  );

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
