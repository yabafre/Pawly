'use client';

import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/**
 * Returns false during SSR and the initial hydration render, true afterwards.
 *
 * Needed under DashboardQueryProvider: the sync localStorage persister can
 * restore the React Query cache before a Suspense-deferred page hydrates, so
 * `isPending` is false on the client's first render while the server rendered
 * the pending branch — a guaranteed hydration mismatch. Gate pending-state
 * branches with `!useHydrated() || isPending` so the first client render
 * always matches the server.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}
