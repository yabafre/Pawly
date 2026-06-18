'use client';

import { useEffect } from 'react';

/**
 * Loads React Grab (the element inspector used for visual verification) on the
 * client, in development only. The package is imported dynamically so it is never
 * bundled into — or shipped with — production builds. Default shortcut is kept.
 */
export function ReactGrabDev() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    void import('react-grab');
  }, []);

  return null;
}
