'use client';

import { useCallback, useRef, useState } from 'react';

type PendingRun = (acknowledge: boolean) => void;

/**
 * Story 7.6 — single interception point for mutations on a PUBLISHED
 * month. On a DRAFT month the mutation runs immediately (ack=false).
 * On a PUBLISHED month the run is stashed and the confirmation dialog
 * opens; confirm re-fires it with ack=true, cancel drops it.
 */
export function usePublishedChangeGuard(isPublished: boolean) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const pendingRef = useRef<PendingRun | null>(null);

  const guard = useCallback(
    (run: PendingRun) => {
      if (!isPublished) {
        run(false);
        return;
      }
      pendingRef.current = run;
      setDialogOpen(true);
    },
    [isPublished]
  );

  const confirm = useCallback(() => {
    setDialogOpen(false);
    pendingRef.current?.(true);
    pendingRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    setDialogOpen(false);
    pendingRef.current = null;
  }, []);

  return { guard, dialogOpen, confirm, cancel };
}
